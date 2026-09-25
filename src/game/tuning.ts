import { palette, mixHue } from './palette';

// All the numbers that decide how the game *feels*. Tweak these to change
// difficulty without touching game logic. Distances are in world pixels;
// the player sees metres (9 px = 1 m).

export const METERS_PER_PX = 1 / 9;

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export const tuning = {
  playerRadius: 11,
  segmentsAhead: 5,

  /** Forward speed in px/s. Ramps up with distance. */
  speedAt(distPx: number) {
    const m = distPx * METERS_PER_PX;
    return clamp(230 + m * 0.62, 230, 620);
  },

  /** Half the corridor width. Narrows with distance and "breathes" per loop. */
  corridorHalfWidthAt(distPx: number, loopIndex: number) {
    const m = distPx * METERS_PER_PX;
    const base = clamp(76 - m * 0.012, 46, 76);
    const breathe = Math.sin(loopIndex * 0.55) * 7 + Math.sin(loopIndex * 0.13) * 5;
    return clamp(base + breathe, 40, 86);
  },

  /**
   * The track is a clockwise spiral (E, S, W, N, ...). Arms grow each loop so
   * the map expands outward instead of circling one patch, while difficulty
   * shortens them (more frequent turns) without ever cancelling the growth.
   */
  segmentLengthRange(distPx: number, loopIndex: number) {
    const m = distPx * METERS_PER_PX;
    const growth = 1 + Math.min(loopIndex * 0.05, 3.2);
    const difficulty = clamp(1 - m * 0.00055, 0.5, 1);
    const jitter = 1 + Math.sin(loopIndex * 0.9) * 0.18;
    const min = 175 * growth * difficulty * jitter;
    const max = 320 * growth * difficulty * jitter;
    return { min, max: Math.max(max, min + 40) };
  },

  /** Chance that a new segment gets a hazard. The first 55 m are clean. */
  hazardChanceAt(distPx: number) {
    const m = distPx * METERS_PER_PX;
    if (m < 55) return 0;
    return clamp((m - 55) / 900, 0, 0.62);
  },
};

/**
 * Sector colour: cyan -> orange (250 m) -> magenta (550 m) -> red (950 m).
 * Each colour holds for most of its sector and blends quickly (over 40 m) at
 * the border. Blending goes round the colour wheel (hue), so it stays vivid
 * instead of passing through muddy grey-green.
 */
const sectors = [
  { m: 0, c: palette.cyan },
  { m: 250, c: palette.orange },
  { m: 550, c: palette.magenta },
  { m: 950, c: palette.red },
];
const BLEND_M = 40;

export function sectorColorAt(distPx: number): number {
  const m = distPx * METERS_PER_PX;
  for (let i = sectors.length - 1; i > 0; i--) {
    const s = sectors[i];
    if (m >= s.m) return s.c;
    if (m >= s.m - BLEND_M) return mixHue(sectors[i - 1].c, s.c, (m - (s.m - BLEND_M)) / BLEND_M);
  }
  return sectors[0].c;
}
