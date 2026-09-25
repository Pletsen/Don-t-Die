import { tuning, sectorColorAt, METERS_PER_PX } from './tuning';
import { WORLDS, type HazardRules, type LevelDef } from './levels';
import { randomSeed } from './rng';

/**
 * A course is the rulebook for one run: how fast, how wide, which hazards
 * and where it ends. Endless mode and every level are both courses, so the
 * track and game code don't need to know which one they're playing.
 */
export interface Course {
  level: LevelDef | null;
  seed: number;
  /** Finish line in px of track distance, or null for endless. */
  goalPx: number | null;
  speedAt(distPx: number): number;
  halfWidthAt(distPx: number, loopIndex: number): number;
  segmentLengthRange(distPx: number, loopIndex: number): { min: number; max: number };
  hazardsAt(distPx: number): HazardRules | null;
  accentAt(distPx: number): number;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function endlessCourse(): Course {
  return {
    level: null,
    seed: randomSeed(),
    goalPx: null,
    speedAt: tuning.speedAt,
    halfWidthAt: tuning.corridorHalfWidthAt,
    segmentLengthRange: tuning.segmentLengthRange,
    hazardsAt: (d) => {
      const chance = tuning.hazardChanceAt(d);
      return chance > 0 ? { chance, kinds: ['saw', 'bomb'], placement: 'side', moving: 0.3 } : null;
    },
    accentAt: sectorColorAt,
  };
}

export function levelCourse(level: LevelDef): Course {
  const goalPx = level.goal / METERS_PER_PX;
  const progress = (d: number) => clamp01(d / goalPx);
  const color = WORLDS[level.world].color;
  return {
    level,
    // Fixed per level, so the track is identical on every attempt.
    seed: level.id * 7919 + 13,
    goalPx,
    speedAt: (d) => lerp(level.speed[0], level.speed[1], progress(d)),
    halfWidthAt: (d) => lerp(level.width[0], level.width[1], progress(d)),
    segmentLengthRange: () => ({ min: level.arm[0], max: level.arm[1] }),
    hazardsAt: (d) => {
      const h = level.hazards;
      if (!h) return null;
      const m = d * METERS_PER_PX;
      if (m < (h.after ?? 25) || m > level.goal - 8) return null;
      return h;
    },
    accentAt: () => color,
  };
}
