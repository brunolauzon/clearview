import type { ConfigIssue, FileConfig } from '@clearview/shared';

export type SaveOutcome = { ok: true } | { ok: false; error: string; issues: ConfigIssue[]; conflict: boolean };

export type SaveFn = (next: FileConfig) => Promise<SaveOutcome>;

async function put(url: string, body: unknown): Promise<SaveOutcome> {
  try {
    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) return { ok: true };
    const data = (await res.json().catch(() => ({}))) as { error?: string; issues?: ConfigIssue[] };
    return { ok: false, error: data.error ?? `The server answered HTTP ${res.status}.`, issues: data.issues ?? [], conflict: res.status === 409 };
  } catch {
    return { ok: false, error: 'Cannot reach the server.', issues: [], conflict: false };
  }
}

/** `version` is the one the page last received; the server refuses the save if the file has changed since. */
export const saveConfig = (config: FileConfig, version: string): Promise<SaveOutcome> => put('/api/config', { config, version });

export const saveYaml = (yaml: string, version: string): Promise<SaveOutcome> => put('/api/config/raw', { yaml, version });
