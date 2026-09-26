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
  /** Where the hidden warp star sits (track px), or null if this course has none. */
  warpAtPx: number | null;
  /** True after the warp star was hit: the rest of the run is the bonus universe. */
  warped: boolean;
  /** Switch to the bonus universe at this distance. */
  enterWarp(distPx: number): void;
}

/** Bonus universe: harmless rubber ducks instead of saws and bombs. */
const DUCKS: HazardRules = { chance: 0.75, kinds: ['duck'], placement: 'any', perSegment: 2 };

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
