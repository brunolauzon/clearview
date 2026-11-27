import { createHash, randomBytes } from 'node:crypto';
import http from 'node:http';
import https from 'node:https';
import type { Socket } from 'node:net';

// A small receive-only websocket client (RFC 6455), enough to follow a JSON event feed. Node's
// built-in client cannot accept a self-signed certificate for one connection only.

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX_MESSAGE = 1024 * 1024;
const OP = { continuation: 0, text: 1, binary: 2, close: 8, ping: 9, pong: 10 } as const;

export const acceptKey = (key: string): string => createHash('sha1').update(key + GUID).digest('base64');

/**
 * Turns the byte stream from a server into whole messages. Throws on anything a server must not
 * send, and on messages too large to be an event.
 */
export function messageReader(onMessage: (text: string) => void, onControl: (opcode: number, payload: Buffer) => void) {
  let pending = Buffer.alloc(0);
  let parts: Buffer[] = [];
  let partsSize = 0;

  return (chunk: Buffer): void => {
    pending = Buffer.concat([pending, chunk]);
    for (;;) {
      if (pending.length < 2) return;
      const fin = (pending[0]! & 0x80) !== 0;
      const opcode = pending[0]! & 0x0f;
      if (pending[1]! & 0x80) throw new Error('masked frame from the server');
      let length = pending[1]! & 0x7f;
      let start = 2;
      if (length === 126) {
        if (pending.length < 4) return;
        length = pending.readUInt16BE(2);
        start = 4;
      } else if (length === 127) {
        if (pending.length < 10) return;
        length = Number(pending.readBigUInt64BE(2));
        start = 10;
      }
      if (length + partsSize > MAX_MESSAGE) throw new Error('message too large');
      if (pending.length < start + length) return;
      const payload = pending.subarray(start, start + length);
      pending = pending.subarray(start + length);

      if (opcode >= OP.close) {
        onControl(opcode, payload);
      } else if (opcode === OP.text || opcode === OP.binary || opcode === OP.continuation) {
        parts.push(payload);
        partsSize += payload.length;
        if (fin) {
          const text = Buffer.concat(parts).toString('utf8');
          parts = [];
          partsSize = 0;
          onMessage(text);
        }
      }
    }
  };
}

/** A client-to-server control frame; clients must mask what they send. */
export function controlFrame(opcode: number, payload: Buffer = Buffer.alloc(0)): Buffer {
  const body = payload.subarray(0, 125);
  const mask = randomBytes(4);
  const masked = Buffer.from(body.map((byte, i) => byte ^ mask[i % 4]!));
  return Buffer.concat([Buffer.from([0x80 | opcode, 0x80 | body.length]), mask, masked]);
}

export interface FeedHandlers {
  onOpen: () => void;
  onMessage: (text: string) => void;
  /** called exactly once, whether the connection failed or ended */
  onClose: (reason: string) => void;
}

export interface FeedOptions {
  headers: Record<string, string>;
  /** accept a self-signed certificate */
  insecure: boolean;
  /** how often to check the connection is alive; silence for three of these ends it */
  pingMs?: number;
}

export interface Feed {
  close: () => void;
}

/** Open a websocket at an http(s) URL. */
export function openFeed(address: string, options: FeedOptions, handlers: FeedHandlers): Feed {
  const url = new URL(address);
  const key = randomBytes(16).toString('base64');
  const headers = { ...options.headers, Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': key };
  const pingMs = options.pingMs ?? 30_000;
  let socket: Socket | null = null;
  let timer: NodeJS.Timeout | null = null;
  let done = false;

  const finish = (reason: string) => {
    if (done) return;
    done = true;
    if (timer) clearInterval(timer);
    clearTimeout(handshake);
    socket?.destroy();
    request.destroy();
    handlers.onClose(reason);
  };

  const request =
    url.protocol === 'https:' ? https.request(url, { headers, rejectUnauthorized: !options.insecure }) : http.request(url, { headers });
  const handshake = setTimeout(() => finish('timeout'), 10_000);
  handshake.unref();

  request.on('response', (res) => finish(`HTTP ${res.statusCode}`));
  request.on('error', (err: NodeJS.ErrnoException) => finish(err.code ?? err.message));
  request.on('upgrade', (res, upgraded: Socket, head: Buffer) => {
    if (done) return void upgraded.destroy();
    socket = upgraded;
    clearTimeout(handshake);
    if (res.headers['sec-websocket-accept'] !== acceptKey(key)) return finish('bad websocket handshake');
    let heard = Date.now();
    const read = messageReader(handlers.onMessage, (opcode, payload) => {
      if (opcode === OP.ping) upgraded.write(controlFrame(OP.pong, payload));
      else if (opcode === OP.close) finish('closed by the server');
    });
    const receive = (chunk: Buffer) => {
      heard = Date.now();
      try {
        read(chunk);
      } catch (err) {
        finish(err instanceof Error ? err.message : String(err));
      }
    };
    upgraded.on('data', receive);
    upgraded.on('error', (err: NodeJS.ErrnoException) => finish(err.code ?? err.message));
    upgraded.on('close', () => finish('connection closed'));
    timer = setInterval(() => {
      if (Date.now() - heard > pingMs * 3) finish('connection went quiet');
      else upgraded.write(controlFrame(OP.ping));
    }, pingMs);
    timer.unref();
    handlers.onOpen();
    if (head.length > 0) receive(head);
  });
  request.end();

  return { close: () => finish('closed') };
}
