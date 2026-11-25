// Generates assets/icon.png (256x256): a prompt chevron and cursor on a dark rounded square.
// No dependencies. Run: node assets/make-icon.mjs
import { crc32, deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

const SIZE = 256;
const SAMPLES = 4; // per axis, for anti-aliasing
const BG = [13, 13, 15];
const FG = [217, 119, 87];
const STROKE = 11; // radius of the round-capped strokes

// signed distances: negative inside the shape
function roundRect(px, py, half, radius) {
  const qx = Math.abs(px - SIZE / 2) - half + radius;
  const qy = Math.abs(py - SIZE / 2) - half + radius;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
}

function segment(px, py, ax, ay, bx, by) {
  const pax = px - ax;
  const pay = py - ay;
  const bax = bx - ax;
  const bay = by - ay;
  const h = Math.min(1, Math.max(0, (pax * bax + pay * bay) / (bax * bax + bay * bay)));
  return Math.hypot(pax - bax * h, pay - bay * h);
}

function inMark(x, y) {
  const d = Math.min(
    segment(x, y, 78, 88, 130, 128), // chevron, upper arm
    segment(x, y, 130, 128, 78, 168), // chevron, lower arm
    segment(x, y, 146, 168, 190, 168), // cursor
  );
  return d <= STROKE;
}

const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 4 + 1)] = 0; // PNG filter: none
  for (let x = 0; x < SIZE; x++) {
    let inside = 0;
    const sum = [0, 0, 0];
    for (let sy = 0; sy < SAMPLES; sy++) {
      for (let sx = 0; sx < SAMPLES; sx++) {
        const px = x + (sx + 0.5) / SAMPLES;
        const py = y + (sy + 0.5) / SAMPLES;
        if (roundRect(px, py, SIZE / 2, 52) > 0) continue;
        inside++;
        const c = inMark(px, py) ? FG : BG;
        sum[0] += c[0];
        sum[1] += c[1];
        sum[2] += c[2];
      }
    }
    const o = y * (SIZE * 4 + 1) + 1 + x * 4;
    if (inside > 0) {
      raw[o] = Math.round(sum[0] / inside);
      raw[o + 1] = Math.round(sum[1] / inside);
      raw[o + 2] = Math.round(sum[2] / inside);
    }
    raw[o + 3] = Math.round((inside / (SAMPLES * SAMPLES)) * 255);
  }
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // RGBA

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

const out = path.join(import.meta.dirname, 'icon.png');
writeFileSync(out, png);
console.log(`wrote ${out} (${png.length} bytes)`);
