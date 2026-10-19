import {
  tuning,
  sectorColorAt,
  METERS_PER_PX,
  zoneAt,
  zoneBlend,
  zoneHazards,
  zoneOrder,
  type ZoneInfo,
} from './tuning';
import { WORLDS, type HazardRules, type LevelDef } from './levels';
import { randomSeed, seededRng } from './rng';
import type { RunMode } from './shared';
import { dailyModifier, dailySeed, todayKey, type DailyModifier } from './daily';

export type { ZoneInfo } from './tuning';

/**
 * A course is the rulebook for one run: how fast, how wide, which hazards
 * and where it ends. Endless mode and every level are both courses, so the
 * track and game code don't need to know which one they're playing.
 */
export interface Course {
  level: LevelDef | null;
  /** 'level', 'survival' or 'daily'. */
  mode: RunMode;
  seed: number;
  /** Finish line in px of track distance, or null for endless. */
  goalPx: number | null;
  speedAt(distPx: number): number;
  halfWidthAt(distPx: number, loopIndex: number): number;
  segmentLengthRange(distPx: number, loopIndex: number): { min: number; max: number };
  hazardsAt(distPx: number): HazardRules | null;
  accentAt(distPx: number): number;
  /**
   * The themed survival zone at this distance (px), or null. Poll it every
   * frame and announce a zone when `index` changes ("ZONE: SAW ALLEY").
   * Always null in levels and the Daily Run.
   */
  zoneAt(distPx: number): ZoneInfo | null;
  /** Where the hidden warp star sits (track px), or null if this course has none. */
  warpAtPx: number | null;
  /** True after the warp star was hit: the rest of the run is the bonus universe. */
  warped: boolean;
  /** Switch to the bonus universe at this distance. */
  enterWarp(distPx: number): void;
  /** Daily Run only: which day and which twist. */
  daily?: { key: string; modifier: DailyModifier };
}

/** Bonus universe: harmless rubber ducks instead of saws and bombs. */
const DUCKS: HazardRules = { chance: 0.75, kinds: ['duck'], placement: 'any', perSegment: 2 };

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Ordinary survival hazards (outside zones). */
function survivalHazards(d: number): HazardRules | null {
  const chance = tuning.hazardChanceAt(d);
  return chance > 0 ? { chance, kinds: ['saw', 'bomb'], placement: 'side', moving: 0.3 } : null;
}

/**
 * Survival: endless, ramping difficulty (tuning.ts), broken up by themed
 * zones every 400 m (SAW ALLEY, BOMB FIELD, NARROWS, SPEEDWAY, DUCK POND,
 * CALM) in a different order every run.
 */
export function endlessCourse(seed = randomSeed()): Course {
  const order = zoneOrder(seededRng(seed ^ 0x5eed5));
  const zone = (d: number) => zoneAt(d, order);
  return {
    level: null,
    mode: 'survival',
    seed,
    goalPx: null,
    speedAt: (d) => {
      const z = zone(d);
      const s = tuning.speedAt(d);
      return z ? s * lerp(1, z.def.speedMul, zoneBlend(d, z)) : s;
    },
    halfWidthAt: (d, loop) => {
      const w = tuning.corridorHalfWidthAt(d, loop);
      const z = zone(d);
      return z ? clamp(w * z.def.widthMul + z.def.widthAdd, 38, 92) : w;
    },
    segmentLengthRange: (d, loop) => {
      const r = tuning.segmentLengthRange(d, loop);
      const z = zone(d);
      return z ? { min: r.min * z.def.armMul, max: r.max * z.def.armMul } : r;
    },
    hazardsAt: (d) => {
      const z = zone(d);
      return z ? zoneHazards(z.def.id, tuning.hazardChanceAt(d), d) : survivalHazards(d);
    },
    accentAt: sectorColorAt,
    zoneAt: zone,
    warpAtPx: null,
    warped: false,
    enterWarp: () => {},
  };
}

export function levelCourse(level: LevelDef): Course {
  const goalPx = level.goal / METERS_PER_PX;
  const progress = (d: number) => clamp01(d / goalPx);
  const color = WORLDS[level.world].color;
  // In the bonus universe speed and width freeze at the moment of the warp.
  let warpSpeed = 0;
  let warpWidth = 0;
  const course: Course = {
    level,
    mode: 'level',
    // Fixed per level, so the track is identical on every attempt.
    seed: level.id * 7919 + 13,
    goalPx,
    speedAt: (d) => (course.warped ? warpSpeed : lerp(level.speed[0], level.speed[1], progress(d))),
    halfWidthAt: (d) => (course.warped ? warpWidth : lerp(level.width[0], level.width[1], progress(d))),
    segmentLengthRange: () => ({ min: level.arm[0], max: level.arm[1] }),
    hazardsAt: (d) => {
      if (course.warped) return DUCKS;
      const h = level.hazards;
      if (!h) return null;
      const m = d * METERS_PER_PX;
      if (m < (h.after ?? 25) || m > level.goal - 8) return null;
      return h;
    },
    accentAt: () => color,
    zoneAt: () => null,
    // Somewhere between 28 % and 43 % of the way, different per level.
    warpAtPx: goalPx * (0.28 + (((level.id * 37) % 13) / 13) * 0.15),
    warped: false,
    enterWarp: (d) => {
      warpSpeed = course.speedAt(d) * 1.05;
      warpWidth = course.halfWidthAt(d, 0) + 8;
      course.warped = true;
      // "The track gets twice as long."
      course.goalPx = goalPx * 2;
    },
  };
  return course;
}

/**
 * Today's Daily Run (or any day's, by 'YYYY-MM-DD' UTC key): survival rules
 * bent by the weekday's modifier, on a track seeded by the date, so every
 * player gets the exact same run. UNIVERSE 2 days start `warped`, which
 * gives the whole run the party look (GameScene should also call
 * setUniverse(true) at the start: see INTEGRATION.md).
 */
export function dailyCourse(key = todayKey()): Course {
  const mod = dailyModifier(key);
  const hazardsAt = (d: number): HazardRules | null => {
    const m = d * METERS_PER_PX;
    if (m < mod.after) return null;
    const chance = clamp(tuning.hazardChanceAt(d) * mod.chanceMul + mod.chanceAdd, 0, 0.85);
    if (chance <= 0) return null;
    return { chance, kinds: mod.kinds, placement: mod.placement, moving: mod.moving, perSegment: mod.perSegment };
  };
  return {
    level: null,
    mode: 'daily',
    seed: dailySeed(key),
    goalPx: null,
    speedAt: (d) => clamp(tuning.speedAt(d) * mod.speedMul + mod.speedAdd, 200, 680),
    halfWidthAt: (d, loop) => clamp(tuning.corridorHalfWidthAt(d, loop) * mod.widthMul + mod.widthAdd, 38, 92),
    segmentLengthRange: tuning.segmentLengthRange,
    hazardsAt,
    accentAt: sectorColorAt,
    zoneAt: () => null,
    warpAtPx: null,
    warped: !!mod.party,
    enterWarp: () => {},
    daily: { key, modifier: mod },
  };
}
