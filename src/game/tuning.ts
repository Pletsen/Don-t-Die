import { palette, mixHue } from './palette';
import type { HazardRules } from './levels';

// All the numbers that decide how the game *feels*. Tweak these to change
// difficulty without touching game logic. Distances are in world pixels;
// the player sees metres (9 px = 1 m).

export const METERS_PER_PX = 1 / 9;

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** Survival (and the Daily Run) get their first hazards here, in metres. */
export const HAZARDS_FROM_M = 80;
/** Early hazard chance: at HAZARDS_FROM_M, and at 400 m. */
const EARLY_CHANCE: [number, number] = [0.4, 0.42];

/**
 * How fast Survival gets harder. Every difficulty curve below uses the
 * distance divided by this, so 2 = everything ramps up half as fast.
 */
const RAMP = 2;

export const tuning = {
  playerRadius: 11,
  segmentsAhead: 5,

  /** Forward speed in px/s. Ramps up with distance. */
  speedAt(distPx: number) {
    const m = (distPx * METERS_PER_PX) / RAMP;
    return clamp(230 + m * 0.62, 230, 620);
  },

  /** Half the corridor width. Narrows with distance and "breathes" per loop. */
  corridorHalfWidthAt(distPx: number, loopIndex: number) {
    const m = (distPx * METERS_PER_PX) / RAMP;
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
    const m = (distPx * METERS_PER_PX) / RAMP;
    const growth = 1 + Math.min(loopIndex * 0.05, 3.2);
    const difficulty = clamp(1 - m * 0.00055, 0.5, 1);
    const jitter = 1 + Math.sin(loopIndex * 0.9) * 0.18;
    const min = 175 * growth * difficulty * jitter;
    const max = 320 * growth * difficulty * jitter;
    return { min, max: Math.max(max, min + 40) };
  },

  /**
   * Chance that a new segment gets a hazard. The first HAZARDS_FROM_M metres
   * are clean; then a light early floor (EARLY_CHANCE, rising a little to
   * 400 m) so there is something to dodge right away, until the long ramp
   * (which reaches 0.62 around 1.2 km) takes over at ~870 m. There are only
   * ~6 straights between 80 and 250 m and some are too short to hold a
   * hazard, so 0.4 means about 2-3 easy, mostly static side hazards there.
   */
  hazardChanceAt(distPx: number) {
    const real = distPx * METERS_PER_PX;
    if (real < HAZARDS_FROM_M) return 0;
    const m = real / RAMP;
    const ramp = clamp((m - 55) / 900, 0, 0.62);
    const early = EARLY_CHANCE[0] + (EARLY_CHANCE[1] - EARLY_CHANCE[0]) * clamp((real - HAZARDS_FROM_M) / (400 - HAZARDS_FROM_M), 0, 1);
    return Math.max(ramp, early);
  },
};

/** Where Survival changes colour, in metres (spread out to match RAMP). */
export const SECTOR_METERS = [250 * RAMP, 550 * RAMP, 950 * RAMP];

/**
 * Sector colour: cyan -> orange -> magenta -> red, at SECTOR_METERS.
 * Each colour holds for most of its sector and blends quickly (over 40 m) at
 * the border. Blending goes round the colour wheel (hue), so it stays vivid
 * instead of passing through muddy grey-green.
 */
const sectors = [
  { m: 0, c: palette.cyan },
  { m: SECTOR_METERS[0], c: palette.orange },
  { m: SECTOR_METERS[1], c: palette.violet },
  { m: SECTOR_METERS[2], c: palette.crimson },
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

// --- Survival zones ------------------------------------------------------------
//
// Survival is broken up by short themed stretches ("zones"): one starts every
// ZONE_EVERY_M metres and lasts ZONE_LENGTH_M, with ordinary survival in
// between. The order is shuffled per run (from the course seed), so no two
// runs feel the same. Outside a zone, everything above applies unchanged.

export const ZONE_FIRST_M = 200;
export const ZONE_EVERY_M = 400;
export const ZONE_LENGTH_M = 200;
/** Speed changes are blended over this many metres at a zone's edges. */
const ZONE_BLEND_M = 25;

export type ZoneId = 'sawAlley' | 'bombField' | 'narrows' | 'speedway' | 'duckPond' | 'calm';

export interface ZoneDef {
  id: ZoneId;
  name: string;
  /** Short line under the name when the zone is announced. */
  hint: string;
  color: number;
  speedMul: number;
  widthMul: number;
  widthAdd: number;
  /**
   * Straights get this much longer. Late in a run the arms are short, and a
   * hazard needs a long enough straight to fit fairly: longer arms let SAW
   * ALLEY and BOMB FIELD actually fill up, and give SPEEDWAY its long runs.
   */
  armMul: number;
}

export const ZONES: Record<ZoneId, ZoneDef> = {
  sawAlley: { id: 'sawAlley', name: 'SAW ALLEY', hint: 'SAWS. SO MANY SAWS.', color: palette.orange, speedMul: 1, widthMul: 1, widthAdd: 4, armMul: 1.4 },
  bombField: { id: 'bombField', name: 'BOMB FIELD', hint: 'TREAD CAREFULLY', color: palette.violet, speedMul: 0.97, widthMul: 1, widthAdd: 4, armMul: 1.35 },
  narrows: { id: 'narrows', name: 'NARROWS', hint: 'THE WALLS CLOSE IN', color: 0x3dffb5, speedMul: 0.95, widthMul: 0.8, widthAdd: 0, armMul: 1 },
  speedway: { id: 'speedway', name: 'SPEEDWAY', hint: 'OPEN ROAD. FLOOR IT.', color: 0x7cff6b, speedMul: 1.16, widthMul: 1, widthAdd: 8, armMul: 1.45 },
  duckPond: { id: 'duckPond', name: 'DUCK POND', hint: 'BONK THEM ALL. KEEP THEM ALL.', color: 0xffd21f, speedMul: 1, widthMul: 1, widthAdd: 6, armMul: 1.3 },
  calm: { id: 'calm', name: 'CALM', hint: 'BREATHE', color: 0x8fd8ff, speedMul: 0.93, widthMul: 1, widthAdd: 10, armMul: 1.15 },
};

export interface ZoneInfo {
  def: ZoneDef;
  /** 0 for the first zone of the run, 1 for the next ... */
  index: number;
  startM: number;
  endM: number;
}

/**
 * The zone order for one run: a seeded shuffle of all zones, repeated. CALM
 * and SPEEDWAY never open a run, so the first zone always has something to
 * dodge or collect.
 */
export function zoneOrder(rng: () => number): ZoneId[] {
  const ids = Object.keys(ZONES) as ZoneId[];
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  const first = ids.findIndex((id) => id !== 'calm' && id !== 'speedway');
  [ids[0], ids[first]] = [ids[first], ids[0]];
  return ids;
}

/** The zone at a distance (px) for a given order, or null between zones. */
export function zoneAt(distPx: number, order: ZoneId[]): ZoneInfo | null {
  const m = distPx * METERS_PER_PX;
  if (m < ZONE_FIRST_M) return null;
  const index = Math.floor((m - ZONE_FIRST_M) / ZONE_EVERY_M);
  const startM = ZONE_FIRST_M + index * ZONE_EVERY_M;
  if (m >= startM + ZONE_LENGTH_M) return null;
  return { def: ZONES[order[index % order.length]], index, startM, endM: startM + ZONE_LENGTH_M };
}

/** 0 → 1 → 0 across a zone, ramping over ZONE_BLEND_M at each edge. */
export function zoneBlend(distPx: number, z: ZoneInfo): number {
  const m = distPx * METERS_PER_PX;
  const t = Math.min(m - z.startM, z.endM - m) / ZONE_BLEND_M;
  const k = clamp(t, 0, 1);
  return k * k * (3 - 2 * k);
}

/**
 * Hazards inside a zone. `chance` is the ordinary survival chance there;
 * zones scale with it, so the first zone at 200 m is far gentler than the
 * same zone at 1.4 km.
 */
export function zoneHazards(id: ZoneId, chance: number, distPx: number): HazardRules | null {
  const m = distPx * METERS_PER_PX;
  const deep = m >= 600;
  const busy = clamp(chance * 1.3 + 0.15, 0.3, 0.82);
  switch (id) {
    case 'sawAlley':
      return { chance: busy, kinds: ['saw'], placement: 'any', moving: deep ? 0.55 : 0.3, perSegment: deep ? 2 : 1 };
    case 'bombField':
      return { chance: busy, kinds: ['bomb'], placement: 'any', moving: 0.1, perSegment: deep ? 2 : 1 };
    case 'narrows':
      return chance > 0 ? { chance: chance * 0.5, kinds: ['saw', 'bomb'], placement: 'side', moving: 0 } : null;
    case 'speedway':
      return chance > 0 ? { chance: chance * 0.35, kinds: ['saw', 'bomb'], placement: 'side', moving: 0 } : null;
    case 'duckPond':
      // Mostly ducks; deeper in, the odd saw keeps you honest.
      return { chance: 0.8, kinds: deep ? ['duck', 'duck', 'duck', 'saw'] : ['duck'], placement: 'any', perSegment: 2 };
    case 'calm':
      return null;
  }
}
