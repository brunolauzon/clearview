import { createHash } from 'node:crypto';
import { constants, existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { ConfigIssue, ConfigState, FileConfig } from '@clearview/shared';
import {
  applyFileConfig,
  emptyFileConfig,
  parseFileText,
  toYamlText,
  validateFileConfig,
  type AppConfig,
} from './config';

export type SaveResult =
  | { ok: true; state: ConfigState }
  | { ok: false; status: 400 | 403 | 409 | 500; error: string; issues: ConfigIssue[] };

const MAX_YAML_BYTES = 256 * 1024;

export function versionOf(text: string): string {
  return createHash('sha1').update(text).digest('hex').slice(0, 12);
}

/** Mount points from /proc/self/mountinfo (the 5th field; spaces and the like are written as \040). */
export function parseMountPoints(mountinfo: string): string[] {
  return mountinfo
    .split('\n')
    .map((line) => line.split(' ')[4])
    .filter((p): p is string => Boolean(p))
    .map((p) => p.replace(/\\([0-7]{3})/g, (_m, oct: string) => String.fromCharCode(parseInt(oct, 8))));
}

/** True if the target, or a folder above it (other than /), is a mount point: a volume, not the container's own layer. */
export function isUnderMount(target: string, mounts: string[]): boolean {
  let p = target;
  while (p !== '/' && p !== '.') {
    if (mounts.includes(p)) return true;
    p = path.dirname(p);
  }
  return false;
}

async function nearestExisting(dir: string): Promise<string> {
  let p = dir;
  for (;;) {
    try {
      await fs.access(p);
      return p;
    } catch {
      const parent = path.dirname(p);
      if (parent === p) return p;
      p = parent;
    }
  }
}

/** Write via a temp file and rename so a crash cannot leave half a config. Keeps the previous file as .bak. */
async function writeConfigFile(file: string, text: string): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  try {
    await fs.copyFile(file, `${file}.bak`);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
  const tmp = `${file}.tmp-${process.pid}`;
  await fs.writeFile(tmp, text, { mode: 0o644 });
  try {
    await fs.rename(tmp, file);
  } catch {
    // e.g. the file itself is a bind mount, which cannot be replaced: write in place instead
    await fs.rm(tmp, { force: true });
    await fs.writeFile(file, text);
  }
}

interface Options {
  /** false in demo mode: changes apply live but nothing is read from or written to disk */
  persist: boolean;
  /** starting config when not persisting */
  seed?: FileConfig;
}

/**
 * Owns the editable config: the file's text, the parsed form, and the running config object, which it
 * updates in place. Everything that reads `cfg.links`, `cfg.groups` and so on sees edits immediately.
 */
export class ConfigStore {
  private text = '';
  private file: FileConfig = emptyFileConfig();
  private version = versionOf('');
  private loadError: string | null = null;
  private access: Pick<ConfigState, 'writable' | 'readOnlyReason' | 'warning'> = {
    writable: false,
    readOnlyReason: null,
    warning: null,
  };
  private listeners = new Set<() => void>();
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private cfg: AppConfig,
    private opts: Options,
  ) {}

  async init(): Promise<void> {
    if (this.opts.persist) {
      this.text = await this.readDisk();
      const parsed = parseFileText(this.text);
      this.file = parsed.ok ? parsed.file : emptyFileConfig();
      if (!parsed.ok) this.loadError = describe(parsed.issues);
    } else {
      this.file = this.opts.seed ?? emptyFileConfig();
      this.text = toYamlText(this.file);
      applyFileConfig(this.cfg, this.file);
    }
    this.version = versionOf(this.text);
    await this.inspectLocation();
  }

  state(): ConfigState {
    return {
      config: this.file,
      yaml: this.text,
      version: this.version,
      path: this.cfg.configPath,
      ...this.access,
      persisted: this.opts.persist,
      loadError: this.loadError,
    };
  }

  /** Called after every change, whether it came from the UI or from someone editing the file. */
  onChange(fn: () => void): void {
    this.listeners.add(fn);
  }

  /** Save a config from the structured editor. The file is rewritten, so hand-written comments are not kept. */
  save(input: unknown, version: unknown): Promise<SaveResult> {
    return this.serial(async () => {
      const refused = this.refuse(version);
      if (refused) return refused;
      if (this.loadError) {
        return fail(409, 'The file on disk has errors. Fix or replace it in the yaml tab first.', []);
      }
      const result = validateFileConfig(input);
      if (!result.ok) return fail(400, 'The config is not valid.', result.issues);
      return this.commit(toYamlText(result.file), result.file);
    });
  }

  /** Save the file's text exactly as typed, comments and all. */
  saveRaw(input: unknown, version: unknown): Promise<SaveResult> {
    return this.serial(async () => {
      const refused = this.refuse(version);
      if (refused) return refused;
      if (typeof input !== 'string') return fail(400, 'Expected the file text as a string.', []);
      if (Buffer.byteLength(input) > MAX_YAML_BYTES) return fail(400, 'The file is too large.', []);
      const result = parseFileText(input);
      if (!result.ok) return fail(400, 'The yaml is not valid.', result.issues);
      return this.commit(input, result.file);
    });
  }

  /** Pick up edits made to the file by hand. Cheap enough to call every few seconds. */
  syncFromDisk(): Promise<void> {
    return this.serial(async () => {
      if (!this.opts.persist) return;
      const text = await this.readDisk();
      if (text === this.text) return;
      const parsed = parseFileText(text);
      this.text = text;
      this.version = versionOf(text);
      if (parsed.ok) {
        this.file = parsed.file;
        this.loadError = null;
        applyFileConfig(this.cfg, parsed.file);
      } else {
        this.loadError = describe(parsed.issues); // keep running on the last good config
      }
      this.notify();
    });
  }

  // ---------- internals ----------

  private refuse(version: unknown): SaveResult | null {
    if (!this.access.writable) {
      return fail(403, this.access.readOnlyReason ?? 'Editing is turned off.', []);
    }
    if (version !== this.version) {
      return fail(409, 'The config changed since you loaded it. Reload and try again.', []);
    }
    return null;
  }

  private async commit(text: string, file: FileConfig): Promise<SaveResult> {
    if (this.opts.persist) {
      try {
        await writeConfigFile(this.cfg.configPath, text);
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code ?? 'error';
        return fail(500, `Could not write ${this.cfg.configPath} (${code}).`, []);
      }
    }
    this.text = text;
    this.version = versionOf(text);
    this.file = file;
    this.loadError = null;
    applyFileConfig(this.cfg, file);
    this.notify();
    return { ok: true, state: this.state() };
  }

  private async readDisk(): Promise<string> {
    try {
      return await fs.readFile(this.cfg.configPath, 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return '';
      throw err;
    }
  }

  private async inspectLocation(): Promise<void> {
    const { configPath } = this.cfg;
    if (this.cfg.configReadOnly) {
      this.access = { writable: false, readOnlyReason: 'Editing is turned off (CONFIG_READONLY is set).', warning: null };
      return;
    }
    if (!this.opts.persist) {
      this.access = { writable: true, readOnlyReason: null, warning: null };
      return;
    }
    const dir = path.dirname(configPath);
    try {
      await fs.access(await nearestExisting(dir), constants.W_OK);
      if (existsSync(configPath)) await fs.access(configPath, constants.W_OK);
    } catch {
      this.access = {
        writable: false,
        readOnlyReason: `${dir} is not writable. Mount the config folder read-write (not :ro).`,
        warning: null,
      };
      return;
    }
    let warning: string | null = null;
    if (existsSync('/.dockerenv')) {
      try {
        const mounts = parseMountPoints(await fs.readFile('/proc/self/mountinfo', 'utf8'));
        if (!isUnderMount(configPath, mounts)) {
          warning = `${dir} is not a mounted volume, so changes are lost when the container is recreated. Map a host folder to ${dir}.`;
        }
      } catch {
        /* cannot tell: say nothing */
      }
    }
    this.access = { writable: true, readOnlyReason: null, warning };
  }

  private notify(): void {
    for (const fn of this.listeners) fn();
  }

  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => undefined);
    return run;
  }
}

function fail(status: 400 | 403 | 409 | 500, error: string, issues: ConfigIssue[]): SaveResult {
  return { ok: false, status, error, issues };
}

function describe(issues: ConfigIssue[]): string {
  const first = issues[0];
  const more = issues.length > 1 ? ` (and ${issues.length - 1} more)` : '';
  return first ? `${first.path}: ${first.message}${more}` : 'invalid config';
}
