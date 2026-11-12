// Genera los íconos PNG de la app sin dependencias (Node puro + zlib).
// Uso: node tools/make-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../icons/', import.meta.url));
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

// Alcancía (chanchito) con una moneda dorada entrando, sobre degradé violeta → rosa.
const hex = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
const VIOLETA = hex('#7c3aed');
const ROSA = hex('#ec4899');
const BLANCO = hex('#ffffff');
const ORO = hex('#fcd34d');
const ORO_OSCURO = hex('#f59e0b');
const OSCURO = hex('#4c1d95');
const NARIZ = hex('#f472b6');

const circulo = (cx, cy, r) => (u, v) => Math.hypot(u - cx, v - cy) <= r;
const elipse = (cx, cy, rx, ry) => (u, v) => ((u - cx) / rx) ** 2 + ((v - cy) / ry) ** 2 <= 1;
const rect = (cx, cy, hw, hh, r) => (u, v) => sdRoundRect(u, v, cx, cy, hw, hh, r) <= 0;

// Capas en orden de pintado: lo de abajo primero.
const CAPAS = [
  [circulo(0.5, 0.3, 0.105), ORO_OSCURO],        // moneda (borde)
  [circulo(0.5, 0.3, 0.08), ORO],                // moneda (cara)
  [rect(0.5, 0.3, 0.012, 0.045, 0.012), ORO_OSCURO], // detalle de la moneda
  [circulo(0.4, 0.42, 0.065), BLANCO],           // oreja
  [circulo(0.21, 0.54, 0.035), BLANCO],          // colita
  [rect(0.37, 0.76, 0.045, 0.065, 0.03), BLANCO], // pata trasera
  [rect(0.6, 0.76, 0.045, 0.065, 0.03), BLANCO],  // pata delantera
  [elipse(0.49, 0.58, 0.27, 0.2), BLANCO],       // cuerpo
  [rect(0.77, 0.58, 0.06, 0.075, 0.035), BLANCO], // hocico
  [circulo(0.765, 0.555, 0.013), NARIZ],         // fosas nasales
  [circulo(0.765, 0.605, 0.013), NARIZ],
  [circulo(0.63, 0.5, 0.024), OSCURO],           // ojo
  [rect(0.48, 0.405, 0.075, 0.015, 0.015), OSCURO], // ranura (la moneda "entra" acá)
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
          // El degradé ocupa todo el fondo; el dibujo se achica en el maskable.
          const t = Math.min(1, Math.max(0, (u + v) / 2));
          let c = VIOLETA.map((k, i) => k + (ROSA[i] - k) * t);
          for (const [dentro, color] of CAPAS) if (dentro(cu, cv)) c = color;
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
