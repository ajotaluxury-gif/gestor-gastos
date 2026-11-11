// Genera los íconos PNG de la app sin dependencias (Node puro + zlib).
// Uso: node tools/make-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../icons/', import.meta.url));
const BG = [15, 118, 110]; // #0f766e
const FG = [255, 255, 255];
const SS = 4; // supermuestreo por eje (antialiasing)

// ---------- PNG ----------
const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePNG(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bits por canal
  ihdr[9] = 6;  // RGBA
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filtro "none"
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- Dibujo (coordenadas normalizadas 0..1) ----------
function sdRoundRect(px, py, cx, cy, hw, hh, r) {
  const qx = Math.abs(px - cx) - hw + r;
  const qy = Math.abs(py - cy) - hh + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

// Gráfico de barras ascendente con línea de base.
const BAR_W = 0.11;
const GAP = 0.045;
const BOTTOM = 0.72;
const HEIGHTS = [0.18, 0.30, 0.44];
const X0 = 0.5 - (3 * BAR_W + 2 * GAP) / 2;
const SHAPES = [
  ...HEIGHTS.map((hgt, i) => {
    const left = X0 + i * (BAR_W + GAP);
    return [left + BAR_W / 2, BOTTOM - hgt / 2, BAR_W / 2, hgt / 2, 0.025];
  }),
  [0.5, 0.765, 0.24, 0.0175, 0.0175], // línea de base
];

function render(size, maskable) {
  // En el maskable el contenido se achica para quedar dentro de la zona segura (círculo 80%).
  const scale = maskable ? 0.78 : 1;
  const rgba = Buffer.alloc(size * size * 4);
  const n = SS * SS;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = (x + (sx + 0.5) / SS) / size;
          const v = (y + (sy + 0.5) / SS) / size;
          const inBg = maskable || sdRoundRect(u, v, 0.5, 0.5, 0.5, 0.5, 0.22) <= 0;
          if (!inBg) continue;
          const cu = 0.5 + (u - 0.5) / scale;
          const cv = 0.5 + (v - 0.5) / scale;
          const inFg = SHAPES.some(([cx, cy, hw, hh, rad]) => sdRoundRect(cu, cv, cx, cy, hw, hh, rad) <= 0);
          const c = inFg ? FG : BG;
          r += c[0]; g += c[1]; b += c[2]; a += 1;
        }
      }
      const i = (y * size + x) * 4;
      if (a) {
        rgba[i] = Math.round(r / a);
        rgba[i + 1] = Math.round(g / a);
        rgba[i + 2] = Math.round(b / a);
        rgba[i + 3] = Math.round((a / n) * 255);
      }
    }
  }
  return encodePNG(size, rgba);
}

mkdirSync(OUT, { recursive: true });
const targets = [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['icon-maskable-192.png', 192, true],
  ['icon-maskable-512.png', 512, true],
];
for (const [name, size, maskable] of targets) {
  writeFileSync(join(OUT, name), render(size, maskable));
  console.log(`✔ icons/${name}`);
}
