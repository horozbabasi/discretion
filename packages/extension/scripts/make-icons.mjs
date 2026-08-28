// Generates the extension's icon PNGs.
//
// Written rather than pulled in as an asset dependency because the icons are
// three flat shapes and adding an image library to a project that documents
// its supply-chain surface is a poor trade. Uses only node:zlib.
//
// Run: node packages/extension/scripts/make-icons.mjs
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'icons');

const INK = [0x1c, 0x36, 0x4a]; // deep slate blue
const FACE = [0xe8, 0xdd, 0xc8]; // warm parchment

function crc32(buf) {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])), 0);
  return Buffer.concat([head, data, crc]);
}

function png(size, pixel) {
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0; // filter: none
    for (let x = 0; x < size; x += 1) {
      const [r, g, b, a] = pixel(x, y);
      const at = y * (stride + 1) + 1 + x * 4;
      raw[at] = r;
      raw[at + 1] = g;
      raw[at + 2] = b;
      raw[at + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // truecolour + alpha
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Signed distance into the shield silhouette, in normalised units. */
function shieldDepth(u, v) {
  // A shield: straight shoulders that taper to a rounded point.
  const halfWidth = v < 0.45 ? 0.42 : 0.42 * Math.sqrt(Math.max(0, 1 - ((v - 0.45) / 0.62) ** 2));
  const inside = Math.abs(u - 0.5) <= halfWidth && v >= 0.06 && v <= 0.97;
  if (!inside) return -1;
  return Math.min(halfWidth - Math.abs(u - 0.5), v - 0.06, 0.97 - v);
}

function render(size) {
  // Supersample: these are small, and aliased edges look broken in a toolbar.
  const S = 4;
  return (x, y) => {
    let r = 0;
    let g = 0;
    let b = 0;
    let a = 0;
    for (let sy = 0; sy < S; sy += 1) {
      for (let sx = 0; sx < S; sx += 1) {
        const u = (x + (sx + 0.5) / S) / size;
        const v = (y + (sy + 0.5) / S) / size;
        const depth = shieldDepth(u, v);
        if (depth < 0) continue;
        // A keyhole slot down the middle reads as "protected" at 16px, where
        // any glyph with more than one stroke turns to mush.
        const slot = Math.abs(u - 0.5) < 0.075 && v > 0.3 && v < 0.72;
        const colour = depth < 0.055 || slot ? FACE : INK;
        r += colour[0];
        g += colour[1];
        b += colour[2];
        a += 255;
      }
    }
    const n = S * S;
    return a === 0 ? [0, 0, 0, 0] : [Math.round(r / (a / 255)), Math.round(g / (a / 255)), Math.round(b / (a / 255)), Math.round(a / n)];
  };
}

mkdirSync(OUT, { recursive: true });
for (const size of [16, 48, 128]) {
  const file = join(OUT, `icon${size}.png`);
  writeFileSync(file, png(size, render(size)));
  console.log(`wrote ${file}`);
}
