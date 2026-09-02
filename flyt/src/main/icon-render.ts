import zlib from 'node:zlib';

/**
 * Icons are drawn at runtime so the app has no binary assets to keep in sync:
 * a microphone glyph for the menu bar (template image on macOS, red while
 * recording) and a rounded app icon for windows on Linux/Windows.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = (CRC_TABLE[(crc ^ (buf[i] as number)) & 0xff] as number) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, Buffer.from(data)])));
  return Buffer.concat([len, typeBuf, Buffer.from(data), crc]);
}

export function encodePng(width: number, height: number, rgba: Uint8Array): Buffer {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    raw.set(rgba.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', new Uint8Array(0)),
  ]);
}

// --- signed distance helpers in unit coordinates ---------------------------

function sdCapsule(px: number, py: number, ax: number, ay: number, bx: number, by: number, r: number): number {
  const pax = px - ax;
  const pay = py - ay;
  const bax = bx - ax;
  const bay = by - ay;
  const h = Math.max(0, Math.min(1, (pax * bax + pay * bay) / (bax * bax + bay * bay)));
  const dx = pax - bax * h;
  const dy = pay - bay * h;
  return Math.sqrt(dx * dx + dy * dy) - r;
}

/** Lower half ring (the "U" of a microphone). */
function sdArc(px: number, py: number, cx: number, cy: number, radius: number, thickness: number): number {
  const dx = px - cx;
  const dy = py - cy;
  const d = Math.abs(Math.sqrt(dx * dx + dy * dy) - radius) - thickness / 2;
  // Only the lower half: clamp the upper half to "outside".
  return dy < 0 ? Math.max(d, -dy) : d;
}

function sdRoundedBox(px: number, py: number, cx: number, cy: number, hw: number, hh: number, r: number): number {
  const qx = Math.abs(px - cx) - hw + r;
  const qy = Math.abs(py - cy) - hh + r;
  return Math.min(Math.max(qx, qy), 0) + Math.sqrt(Math.max(qx, 0) ** 2 + Math.max(qy, 0) ** 2) - r;
}

function micDistance(x: number, y: number): number {
  const capsule = sdCapsule(x, y, 0.5, 0.26, 0.5, 0.5, 0.15);
  const arc = sdArc(x, y, 0.5, 0.5, 0.27, 0.075);
  const stem = sdCapsule(x, y, 0.5, 0.77, 0.5, 0.86, 0.035);
  const base = sdCapsule(x, y, 0.36, 0.88, 0.64, 0.88, 0.035);
  return Math.min(capsule, arc, stem, base);
}

function coverage(d: number, pixel: number): number {
  // Anti-alias over one pixel width.
  return Math.max(0, Math.min(1, 0.5 - d / pixel));
}

export interface GlyphOptions {
  color: [number, number, number];
  /** Rounded-square background, or null for a transparent glyph. */
  background: [number, number, number] | null;
  /** Shrink the glyph inside the canvas (0..0.4). */
  inset: number;
}

export function renderMic(size: number, opts: GlyphOptions): Uint8Array {
  const rgba = new Uint8Array(size * size * 4);
  const ss = 3; // supersampling per axis
  const pixel = 1 / size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let glyph = 0;
      let bg = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const u = (x + (sx + 0.5) / ss) / size;
          const v = (y + (sy + 0.5) / ss) / size;
          if (opts.background) bg += coverage(sdRoundedBox(u, v, 0.5, 0.5, 0.5, 0.5, 0.22), pixel);
          const gu = (u - 0.5) / (1 - 2 * opts.inset) + 0.5;
          const gv = (v - 0.5) / (1 - 2 * opts.inset) + 0.5;
          glyph += coverage(micDistance(gu, gv) * (1 - 2 * opts.inset), pixel);
        }
      }
      glyph /= ss * ss;
      bg /= ss * ss;
      const i = (y * size + x) * 4;
      if (opts.background) {
        const [br, bgc, bb] = opts.background;
        const [gr, gg, gb] = opts.color;
        rgba[i] = Math.round(br + (gr - br) * glyph);
        rgba[i + 1] = Math.round(bgc + (gg - bgc) * glyph);
        rgba[i + 2] = Math.round(bb + (gb - bb) * glyph);
        rgba[i + 3] = Math.round(255 * bg);
      } else {
        const [r, g, b] = opts.color;
        rgba[i] = r;
        rgba[i + 1] = g;
        rgba[i + 2] = b;
        rgba[i + 3] = Math.round(255 * glyph);
      }
    }
  }
  return rgba;
}

/**
 * macOS app icon: the rounded square sits on Apple's grid (about 82 % of the
 * canvas with the Big Sur corner radius), on a vertical blue gradient, with a
 * soft shadow underneath. The mic glyph is drawn inside the square.
 */
export function renderAppIcon(size: number): Uint8Array {
  const rgba = new Uint8Array(size * size * 4);
  const ss = 3;
  const pixel = 1 / size;
  const half = 0.41; // 82 % of the canvas
  const radius = 0.185 * 2 * half; // Apple's ~22.5 % of the side
  const top: [number, number, number] = [82, 139, 255];
  const bottom: [number, number, number] = [29, 78, 216];
  const glyphInset = 0.5 - half + 0.2 * 2 * half; // glyph occupies ~60 % of the square
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let square = 0;
      let glyph = 0;
      let shadow = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const u = (x + (sx + 0.5) / ss) / size;
          const v = (y + (sy + 0.5) / ss) / size;
          square += coverage(sdRoundedBox(u, v, 0.5, 0.5, half, half, radius), pixel);
          // Shadow: offset down, soft 3 % falloff.
          const ds = sdRoundedBox(u, v, 0.5, 0.5 + 0.02, half, half, radius);
          shadow += Math.max(0, Math.min(1, 1 - ds / 0.035));
          const gu = (u - 0.5) / (1 - 2 * glyphInset) + 0.5;
          const gv = (v - 0.5) / (1 - 2 * glyphInset) + 0.5;
          glyph += coverage(micDistance(gu, gv) * (1 - 2 * glyphInset), pixel);
        }
      }
      square /= ss * ss;
      glyph /= ss * ss;
      shadow /= ss * ss;
      const t = Math.max(0, Math.min(1, (y / size - (0.5 - half)) / (2 * half)));
      const bg = [
        Math.round(top[0] + (bottom[0] - top[0]) * t),
        Math.round(top[1] + (bottom[1] - top[1]) * t),
        Math.round(top[2] + (bottom[2] - top[2]) * t),
      ];
      const i = (y * size + x) * 4;
      // Composite: shadow, then square (with glyph), over transparency.
      const shadowAlpha = shadow * 0.28 * (1 - square);
      const r = bg[0]! + (255 - bg[0]!) * glyph;
      const g = bg[1]! + (255 - bg[1]!) * glyph;
      const b = bg[2]! + (255 - bg[2]!) * glyph;
      const alpha = square + shadowAlpha;
      if (alpha <= 0) continue;
      rgba[i] = Math.round((r * square + 0 * shadowAlpha) / alpha);
      rgba[i + 1] = Math.round((g * square + 0 * shadowAlpha) / alpha);
      rgba[i + 2] = Math.round((b * square + 0 * shadowAlpha) / alpha);
      rgba[i + 3] = Math.round(255 * Math.min(1, alpha));
    }
  }
  return rgba;
}
