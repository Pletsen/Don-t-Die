// A tiny PNG encoder (no dependencies) for the store scripts.
//
// The App Store rejects icons and screenshots with an alpha channel, and the
// browser's own PNGs always have one. So the scripts read raw pixels out of a
// canvas and write them here as an opaque 8-bit RGB PNG.

const zlib = require('zlib');

const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

const paeth = (a, b, c) => {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

/**
 * Encode RGBA pixels (w * h * 4 bytes, e.g. a canvas ImageData) as an opaque
 * RGB PNG. The alpha channel is dropped, so draw on an opaque background.
 * Each row picks the filter that compresses best (smallest sum of residuals).
 */
function encodeRGB(rgba, w, h) {
  const stride = w * 3;
  const rows = Buffer.alloc((stride + 1) * h);
  let prev = Buffer.alloc(stride);
  const cur = Buffer.alloc(stride);
  const cand = [0, 1, 2, 3, 4].map(() => Buffer.alloc(stride));
  for (let y = 0; y < h; y++) {
    for (let x = 0, i = y * w * 4, o = 0; x < w; x++, i += 4, o += 3) {
      cur[o] = rgba[i];
      cur[o + 1] = rgba[i + 1];
      cur[o + 2] = rgba[i + 2];
    }
    let best = 0;
    let bestSum = Infinity;
    for (let f = 0; f < 5; f++) {
      const out = cand[f];
      let sum = 0;
      for (let i = 0; i < stride; i++) {
        const a = i >= 3 ? cur[i - 3] : 0;
        const b = prev[i];
        const c = i >= 3 ? prev[i - 3] : 0;
        const pred = f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : paeth(a, b, c);
        const v = (cur[i] - pred) & 255;
        out[i] = v;
        sum += v < 128 ? v : 256 - v;
      }
      if (sum < bestSum) {
        bestSum = sum;
        best = f;
      }
    }
    const at = y * (stride + 1);
    rows[at] = best;
    cand[best].copy(rows, at + 1);
    prev = Buffer.from(cur);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type 2: RGB, no alpha
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Read width, height and colour type from a PNG file's header (for checks). */
function pngInfo(buf) {
  if (buf.readUInt32BE(12) !== 0x49484452) throw new Error('not a PNG');
  const colorType = buf[25];
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), colorType, alpha: colorType === 4 || colorType === 6 };
}

module.exports = { encodeRGB, pngInfo };
