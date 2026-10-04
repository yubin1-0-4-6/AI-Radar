/**
 * 生成 1024x1024 应用图标（零依赖，直接手写 PNG）。
 * 图案：深色圆角底 + 同心雷达环 + 一道扫描扇形。
 * 用法：node scripts/make-icon.mjs  →  app-icon.png  →  npx tauri icon app-icon.png
 */
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const S = 1024;
const px = Buffer.alloc(S * S * 4);

const BG = [11, 15, 23];
const RING = [56, 189, 248];
const SWEEP = [125, 211, 252];

const set = (x, y, [r, g, b], a = 1) => {
  if (x < 0 || y < 0 || x >= S || y >= S) return;
  const i = (y * S + x) * 4;
  px[i] = Math.round(px[i] * (1 - a) + r * a);
  px[i + 1] = Math.round(px[i + 1] * (1 - a) + g * a);
  px[i + 2] = Math.round(px[i + 2] * (1 - a) + b * a);
  px[i + 3] = 255;
};

// 圆角方形底
const radius = 200;
const inRounded = (x, y) => {
  const m = 24;
  const cx = Math.min(Math.max(x, m + radius), S - m - radius);
  const cy = Math.min(Math.max(y, m + radius), S - m - radius);
  return Math.hypot(x - cx, y - cy) <= radius + 0.5;
};

const cx = S / 2;
const cy = S / 2;
const TAU = Math.PI * 2;

for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    if (!inRounded(x, y)) continue;
    // 底色带轻微径向渐变
    const d = Math.hypot(x - cx, y - cy) / (S / 2);
    const k = Math.max(0, 1 - d * 0.55);
    set(x, y, [BG[0] + 10 * k, BG[1] + 18 * k, BG[2] + 30 * k]);
  }
}

const ringR = [190, 290, 390];
const ringW = 9;
for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    const dx = x - cx;
    const dy = y - cy;
    const r = Math.hypot(dx, dy);
    const ang = Math.atan2(dy, dx);

    for (const R of ringR) {
      if (Math.abs(r - R) < ringW) set(x, y, RING, 0.55);
    }
    // 十字轴
    if (r < 415) {
      if (Math.abs(dx) < 3 || Math.abs(dy) < 3) set(x, y, RING, 0.28);
    }
    // 扫描扇形：-70° 到 -55°
    const a = ((ang + TAU) % TAU) - (TAU - 1.22);
    if (r < 415 && a > 0 && r > 60) {
      const fade = 0.75 * (1 - r / 415);
      set(x, y, SWEEP, Math.max(0, fade));
    }
    // 扫描前沿亮线
    if (r < 415 && Math.abs(a) < 0.012) set(x, y, SWEEP, 0.9);
  }
}

// 中心点 + 外发光
for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    const r = Math.hypot(x - cx, y - cy);
    if (r < 26) set(x, y, SWEEP);
    else if (r < 52) set(x, y, SWEEP, 0.35 * (1 - (r - 26) / 26));
  }
}

/* ---- 编码为 PNG ---- */
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0);
ihdr.writeUInt32BE(S, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // RGBA
const raw = Buffer.alloc(S * (S * 4 + 1));
for (let y = 0; y < S; y++) {
  raw[y * (S * 4 + 1)] = 0; // filter: none
  px.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4);
}

writeFileSync(
  "app-icon.png",
  Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]),
);
console.log("app-icon.png written (1024x1024)");