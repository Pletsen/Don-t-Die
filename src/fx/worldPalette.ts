import { palette } from '../game/palette';

// Colour helpers for the world art (corridor, sky, visitors, motes). Every
// function here is allocation-free, because most of them run every frame.

/** Per-world sky colours: the world colour plus a second accent for the sky. */
export const WORLD_SKY: readonly { accent: number; accent2: number }[] = [
  // BASICS: calm cyan nebula drifting into deep blue.
  { accent: palette.cyan, accent2: 0x3a5bff },
  // SAWS: synthwave sunset, orange sun sinking into hot pink.
  { accent: palette.orange, accent2: 0xff3d7f },
  // BOMBS: violet haze with pink warning lights on the mines.
  { accent: palette.violet, accent2: 0xff4fa8 },
  // CHAOS: red alert, crimson smoke and amber searchlights.
  { accent: palette.crimson, accent2: 0xff8a3d },
];

/** Linear mix of two 0xRRGGBB colours (no arrays, no garbage). */
export function mix(a: number, b: number, t: number): number {
  const r = ((a >> 16) & 255) + ((((b >> 16) & 255) - ((a >> 16) & 255)) * t);
  const g = ((a >> 8) & 255) + ((((b >> 8) & 255) - ((a >> 8) & 255)) * t);
  const bl = (a & 255) + (((b & 255) - (a & 255)) * t);
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
}

/** A saturated colour at hue `h` degrees (no arrays, no garbage). */
export function hue(h: number, s = 1, v = 1): number {
  h = ((h % 360) + 360) % 360;
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) (r = c), (g = x);
  else if (h < 120) (r = x), (g = c);
  else if (h < 180) (g = c), (b = x);
  else if (h < 240) (g = x), (b = c);
  else if (h < 300) (r = x), (b = c);
  else (r = c), (b = x);
  return (Math.round((r + m) * 255) << 16) | (Math.round((g + m) * 255) << 8) | Math.round((b + m) * 255);
}

/**
 * Universe 2 hue: a psychedelic sweep that stays between cyan and pink
 * (160°..330°) and never passes through yellow/green, so the yellow rubber
 * ducks always stand out. Ping-pongs smoothly; `t` in seconds.
 */
export function u2Hue(t: number, offset = 0): number {
  const k = 0.5 - 0.5 * Math.cos((t * 70 + offset) * (Math.PI / 180));
  return 160 + 170 * k;
}

/** Universe 2 accent colour at time `t` (seconds). */
export function u2Color(t: number, offset = 0): number {
  return hue(u2Hue(t, offset));
}

/** Clamp a world index from shared state to 0..3. */
export function worldIndex(w: number): number {
  return w <= 0 ? 0 : w >= 3 ? 3 : Math.round(w);
}
