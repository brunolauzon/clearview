import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Duplex } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { acceptKey, controlFrame, messageReader, openFeed } from './ws';

/** A frame as a server sends it: unmasked. */
function frame(opcode: number, text: string, fin = true): Buffer {
  const body = Buffer.from(text);
  const head =
    body.length < 126 ? Buffer.from([(fin ? 0x80 : 0) | opcode, body.length]) : Buffer.from([(fin ? 0x80 : 0) | opcode, 126, body.length >> 8, body.length & 255]);
  return Buffer.concat([head, body]);
}

function reader() {
  const messages: string[] = [];
  const control: number[] = [];
  const read = messageReader(
    (t) => messages.push(t),
    (op) => control.push(op),
  );
  return { messages, control, read };
}

describe('messageReader', () => {
  it('reads frames however the bytes are split, including long ones', () => {
    const { messages, read } = reader();
    const long = 'x'.repeat(300);
    const bytes = Buffer.concat([frame(1, '{"a":1}'), frame(1, long)]);
    for (const byte of bytes) read(Buffer.from([byte]));
    expect(messages).toEqual(['{"a":1}', long]);
  });

  it('joins fragments and handles a ping arriving between them', () => {
    const { messages, control, read } = reader();
    read(Buffer.concat([frame(1, 'hel', false), frame(9, ''), frame(0, 'lo')]));
    expect(messages).toEqual(['hello']);
    expect(control).toEqual([9]);
  });

  it('refuses masked frames and oversized messages', () => {
    expect(() => reader().read(controlFrame(9))).toThrow(/masked/);
    const huge = Buffer.alloc(10);
    huge[0] = 0x81;
    huge[1] = 127;
    huge.writeBigUInt64BE(50_000_000n, 2);
    expect(() => reader().read(huge)).toThrow(/too large/);
  });
});

describe('openFeed', () => {
  let server: http.Server;
  let base: string;
  const sockets: Duplex[] = [];
  let pong: Buffer | null = null;

  beforeAll(async () => {
    server = http.createServer((_req, res) => void res.writeHead(404).end());
    server.on('upgrade', (req, socket) => {
      sockets.push(socket);
      if (req.headers['x-api-key'] !== 'good') return void socket.end('HTTP/1.1 401 Unauthorized\r\nContent-Length: 0\r\n\r\n');
      const accept = req.url === '/forged' ? 'nonsense' : acceptKey(String(req.headers['sec-websocket-key']));
      socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
      if (req.url === '/silent') return;
      socket.on('data', (d: Buffer) => {
        pong = d;
        socket.end(frame(8, ''));
      });
      socket.write(Buffer.concat([frame(1, '{"hello":true}'), frame(9, 'hi')]));
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => {
    for (const s of sockets) s.destroy();
    return new Promise((r) => server.close(r));
  });

  const follow = (path: string, key = 'good', pingMs?: number) =>
    new Promise<{ opened: boolean; messages: string[]; reason: string }>((resolve) => {
      let opened = false;
      const messages: string[] = [];
      openFeed(
        `${base}${path}`,
        { headers: { 'X-API-KEY': key }, insecure: false, pingMs },
        { onOpen: () => (opened = true), onMessage: (m) => messages.push(m), onClose: (reason) => resolve({ opened, messages, reason }) },
      );
    });

  it('receives messages, answers pings with a masked pong and reports the close', async () => {
    await expect(follow('/events')).resolves.toEqual({ opened: true, messages: ['{"hello":true}'], reason: 'closed by the server' });
    expect(pong![0]).toBe(0x8a);
    expect(pong![1]).toBe(0x80 | 2);
    const mask = pong!.subarray(2, 6);
    expect(Buffer.from(pong!.subarray(6).map((b, i) => b ^ mask[i % 4]!)).toString()).toBe('hi');
  });

  it('gives up on a connection that stops answering', async () => {
    await expect(follow('/silent', 'good', 20)).resolves.toMatchObject({ opened: true, reason: 'connection went quiet' });
  });

  it('says why it could not connect', async () => {
    await expect(follow('/events', 'bad')).resolves.toMatchObject({ opened: false, reason: 'HTTP 401' });
    await expect(follow('/forged')).resolves.toMatchObject({ opened: false, reason: 'bad websocket handshake' });
  });
});
