import { palette } from './palette';
import type { HazardKind } from './Track';

// Every level is plain data. To add or tweak a level, edit this file: no game
// code needs to change. Distances are metres (9 px = 1 m), speeds px/s (230
// is the survival start speed), widths are the corridor's HALF width in px.
// Levels last roughly 15 s (level 1) up to 45 s (level 20).

export interface World {
  name: string;
  color: number;
}

export const WORLDS: World[] = [
  { name: 'BASICS', color: palette.cyan },
  { name: 'SAWS', color: palette.orange },
  { name: 'BOMBS', color: palette.violet },
  { name: 'CHAOS', color: palette.crimson },
];

export type Placement = 'side' | 'center' | 'any';

export interface HazardRules {
  /** Chance that a segment gets hazards, 0..1. */
  chance: number;
  kinds: HazardKind[];
  /** Chance that a hazard slides back and forth. */
  moving?: number;
  /** Where across the lane hazards sit. `side` punishes sloppy turns, `center` punishes lazy perfect ones. */
  placement?: Placement;
  /** Up to two hazards per segment. The second is always static, on the same side, so a lane stays open. */
  perSegment?: 1 | 2;
  /** Hazard-free run-up at the start, in metres. */
  after?: number;
}

export interface LevelDef {
  id: number;
  world: number;
  /** Metres to the finish line. */
  goal: number;
  /** [start, end] speed; ramps up over the level. */
  speed: [number, number];
  /** [start, end] half width; narrows over the level. */
  width: [number, number];
  /** Min and max straight length between turns, px. */
  arm: [number, number];
  hazards?: HazardRules;
  /** A HARD MODE remix (see HARD_LEVELS). */
  hard?: boolean;
}

const saw: HazardKind[] = ['saw'];
const bomb: HazardKind[] = ['bomb'];
const both: HazardKind[] = ['saw', 'bomb'];

export const LEVELS: LevelDef[] = [
  // World 1: just turning. Learn the rhythm and the PERFECT zone.
  // (Tuned with bot playtests: a smooth curve, no wall at the end of World 4.)
  { id: 1, world: 0, goal: 260, speed: [200, 235], width: [84, 78], arm: [260, 340] },
  { id: 2, world: 0, goal: 380, speed: [220, 265], width: [78, 72], arm: [230, 320] },
  { id: 3, world: 0, goal: 500, speed: [250, 305], width: [70, 63], arm: [210, 300] },
  { id: 4, world: 0, goal: 720, speed: [265, 330], width: [65, 58], arm: [190, 280] },
  { id: 5, world: 0, goal: 850, speed: [285, 360], width: [61, 53], arm: [175, 270] },

  // World 2: saw blades appear.
  { id: 6, world: 1, goal: 560, speed: [240, 270], width: [78, 74], arm: [230, 320], hazards: { chance: 0.35, kinds: saw, placement: 'side' } },
  { id: 7, world: 1, goal: 690, speed: [250, 290], width: [74, 70], arm: [220, 310], hazards: { chance: 0.5, kinds: saw, placement: 'side' } },
  { id: 8, world: 1, goal: 790, speed: [260, 310], width: [72, 66], arm: [210, 300], hazards: { chance: 0.45, kinds: saw, placement: 'any', moving: 0.2 } },
  { id: 9, world: 1, goal: 930, speed: [270, 330], width: [70, 62], arm: [200, 290], hazards: { chance: 0.5, kinds: saw, placement: 'center' } },
  { id: 10, world: 1, goal: 1150, speed: [290, 360], width: [66, 58], arm: [190, 280], hazards: { chance: 0.65, kinds: saw, placement: 'any', moving: 0.35 } },

  // World 3: bombs, and the corridor gets tight.
  { id: 11, world: 2, goal: 800, speed: [270, 310], width: [72, 68], arm: [210, 300], hazards: { chance: 0.45, kinds: bomb, placement: 'side' } },
  { id: 12, world: 2, goal: 950, speed: [280, 330], width: [68, 62], arm: [200, 290], hazards: { chance: 0.55, kinds: both, placement: 'any' } },
  { id: 13, world: 2, goal: 1100, speed: [295, 355], width: [62, 55], arm: [190, 280], hazards: { chance: 0.6, kinds: both, placement: 'any', moving: 0.3 } },
  { id: 14, world: 2, goal: 1200, speed: [300, 365], width: [60, 53], arm: [185, 270], hazards: { chance: 0.55, kinds: both, placement: 'any', perSegment: 2 } },
  { id: 15, world: 2, goal: 1400, speed: [315, 385], width: [58, 52], arm: [180, 260], hazards: { chance: 0.65, kinds: both, placement: 'any', moving: 0.4, perSegment: 2 } },

  // World 4: everything, fast and moving.
  { id: 16, world: 3, goal: 1200, speed: [325, 395], width: [66, 59], arm: [190, 270], hazards: { chance: 0.6, kinds: both, placement: 'any', moving: 0.4 } },
  { id: 17, world: 3, goal: 1400, speed: [345, 420], width: [61, 54], arm: [185, 260], hazards: { chance: 0.65, kinds: both, placement: 'any', moving: 0.45, perSegment: 2 } },
  { id: 18, world: 3, goal: 1600, speed: [360, 440], width: [59, 53], arm: [180, 255], hazards: { chance: 0.7, kinds: both, placement: 'any', moving: 0.6, perSegment: 2 } },
  { id: 19, world: 3, goal: 1800, speed: [375, 460], width: [58, 52], arm: [175, 250], hazards: { chance: 0.75, kinds: both, placement: 'any', moving: 0.7, perSegment: 2 } },
  { id: 20, world: 3, goal: 2000, speed: [390, 480], width: [57, 51], arm: [170, 245], hazards: { chance: 0.8, kinds: both, placement: 'any', moving: 0.8, perSegment: 2 } },
];

/** HARD MODE level ids are the normal id plus this (HARD 1 = 101). */
export const HARD_OFFSET = 100;

/**
 * HARD MODE: every level remixed, unlocked by clearing level 20. A new track
 * (its own seed), about 14 % faster, 10 % narrower and 10 % longer, with more
 * and livelier hazards; world 1 gets saws too.
 */
export const HARD_LEVELS: LevelDef[] = LEVELS.map((l) => {
  const h = l.hazards;
  const hazards: HazardRules = h
    ? { ...h, chance: Math.min(0.92, h.chance + 0.15), moving: Math.min(0.9, (h.moving ?? 0) + 0.25), perSegment: l.world >= 2 ? 2 : h.perSegment }
    : { chance: 0.3 + l.id * 0.06, kinds: saw, placement: 'any', moving: l.id >= 3 ? 0.2 : 0 };
  return {
    ...l,
    id: l.id + HARD_OFFSET,
    goal: Math.round((l.goal * 1.1) / 10) * 10,
    speed: [Math.round(l.speed[0] * 1.14), Math.round(l.speed[1] * 1.14)],
    width: [Math.round(l.width[0] * 0.9), Math.round(l.width[1] * 0.9)],
    hazards,
    hard: true,
  };
});

export const ALL_LEVELS: LevelDef[] = [...LEVELS, ...HARD_LEVELS];

export const levelById = (id: number) => ALL_LEVELS.find((l) => l.id === id);
export const isHardLevel = (id: number) => id > HARD_OFFSET;
/** The level's number within its set (HARD 3 -> 3). */
export const levelNumber = (id: number) => (isHardLevel(id) ? id - HARD_OFFSET : id);
/** "LEVEL 7" or "HARD 7". */
export const levelName = (id: number) => (isHardLevel(id) ? `HARD ${id - HARD_OFFSET}` : `LEVEL ${id}`);
/** The last level of the set this one belongs to. */
export const lastOfSet = (id: number) => (isHardLevel(id) ? HARD_OFFSET : 0) + LEVELS.length;
