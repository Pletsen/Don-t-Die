// The game's colours in one place. Phaser wants colours as numbers (0xRRGGBB).
export const palette = {
  bg: 0x05070a,
  floor: 0x0b121b,
  floorDark: 0x060a10,
  ink: 0xeaf6ff,
  inkDim: 0x6f8496,
  cyan: 0x2be8ff,
  magenta: 0xff2f9e,
  orange: 0xff9a2e,
  red: 0xff3b4e,
};

export const css = {
  ink: '#eaf6ff',
  inkDim: '#6f8496',
  cyan: '#2be8ff',
  magenta: '#ff2f9e',
  orange: '#ff9a2e',
  bg: '#05070a',
};

export const fonts = {
  display: '"Chakra Petch", "Segoe UI", sans-serif',
  mono: '"JetBrains Mono", ui-monospace, "SF Mono", monospace',
};

export type RGB = [number, number, number];

export function toRGB(color: number): RGB {
  return [(color >> 16) & 255, (color >> 8) & 255, color & 255];
}

export function fromRGB([r, g, b]: RGB): number {
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
}

export function mixColor(a: number, b: number, t: number): number {
  const ca = toRGB(a);
  const cb = toRGB(b);
  return fromRGB([0, 1, 2].map((i) => ca[i] + (cb[i] - ca[i]) * t) as RGB);
}

/** Blend two colours around the colour wheel, keeping them saturated. */
export function mixHue(a: number, b: number, t: number): number {
  const ha = rgbToHsv(toRGB(a));
  const hb = rgbToHsv(toRGB(b));
  let dh = hb[0] - ha[0];
  if (dh > 180) dh -= 360;
  if (dh < -180) dh += 360;
  const h = (ha[0] + dh * t + 360) % 360;
  return fromRGB(hsvToRgb([h, ha[1] + (hb[1] - ha[1]) * t, ha[2] + (hb[2] - ha[2]) * t]));
}

function rgbToHsv([r, g, b]: RGB): RGB {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
  }
  return [(h * 60 + 360) % 360, max === 0 ? 0 : d / max, max];
}

function hsvToRgb([h, s, v]: RGB): RGB {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}
