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
  /** EASY, NORMAL or HARD (absent: NORMAL). */
  set?: LevelSet;
}

export type LevelSet = 'easy' | 'normal' | 'hard';

const saw: HazardKind[] = ['saw'];
const bomb: HazardKind[] = ['bomb'];
const both: HazardKind[] = ['saw', 'bomb'];

/**
 * NORMAL: the main game. EASY 10 opens it (old saves with NORMAL progress
 * keep it open), and NORMAL 10 opens HARD.
 */
export const LEVELS: LevelDef[] = [
  // World 1: just turning. Learn the rhythm and the PERFECT zone.
  // (Tuned with bot playtests: a smooth curve; worlds 3-4 eased so the end
  // is a climb, not a wall.)
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
  { id: 12, world: 2, goal: 950, speed: [280, 330], width: [68, 62], arm: [200, 290], hazards: { chance: 0.38, kinds: both, placement: 'any' } },
  { id: 13, world: 2, goal: 1100, speed: [285, 340], width: [64, 57], arm: [190, 280], hazards: { chance: 0.44, kinds: both, placement: 'any', moving: 0.2 } },
  { id: 14, world: 2, goal: 1200, speed: [290, 350], width: [62, 55], arm: [185, 270], hazards: { chance: 0.46, kinds: both, placement: 'any', perSegment: 2 } },
  { id: 15, world: 2, goal: 1300, speed: [295, 355], width: [61, 55], arm: [185, 265], hazards: { chance: 0.44, kinds: both, placement: 'any', moving: 0.25, perSegment: 2 } },

  // World 4: everything, fast and moving.
  { id: 16, world: 3, goal: 1150, speed: [300, 355], width: [66, 60], arm: [190, 270], hazards: { chance: 0.5, kinds: both, placement: 'any', moving: 0.25 } },
  { id: 17, world: 3, goal: 1300, speed: [305, 365], width: [64, 58], arm: [185, 265], hazards: { chance: 0.52, kinds: both, placement: 'any', moving: 0.3, perSegment: 2 } },
  { id: 18, world: 3, goal: 1450, speed: [315, 375], width: [63, 57], arm: [185, 260], hazards: { chance: 0.5, kinds: both, placement: 'any', moving: 0.3, perSegment: 2 } },
  { id: 19, world: 3, goal: 1600, speed: [320, 385], width: [62, 56], arm: [180, 255], hazards: { chance: 0.5, kinds: both, placement: 'any', moving: 0.3, perSegment: 2 } },
  { id: 20, world: 3, goal: 1750, speed: [330, 395], width: [61, 55], arm: [175, 250], hazards: { chance: 0.55, kinds: both, placement: 'any', moving: 0.35, perSegment: 2 } },
];

/** HARD MODE level ids are the normal id plus this (HARD 1 = 101). */
export const HARD_OFFSET = 100;
/** EASY level ids are the normal id plus this (EASY 1 = 201). */
export const EASY_OFFSET = 200;

/**
 * HARD MODE: every level remixed, unlocked by clearing NORMAL 10. A new track
 * (its own seed), about 16 % faster, 10 % narrower and 10 % longer, with more
 * and livelier hazards (two to a straight in world 4); world 1 gets saws too.
 */
export const HARD_LEVELS: LevelDef[] = LEVELS.map((l) => {
  const h = l.hazards;
  const hazards: HazardRules = h
    ? { ...h, chance: Math.min(0.92, h.chance + 0.15), moving: Math.min(0.9, (h.moving ?? 0) + 0.25), perSegment: l.world >= 3 ? 2 : h.perSegment }
    : { chance: 0.3 + l.id * 0.06, kinds: saw, placement: 'any', moving: l.id >= 3 ? 0.2 : 0 };
  return {
    ...l,
    id: l.id + HARD_OFFSET,
    goal: Math.round((l.goal * 1.1) / 10) * 10,
    speed: [Math.round(l.speed[0] * 1.16), Math.round(l.speed[1] * 1.16)],
    width: [Math.round(l.width[0] * 0.9), Math.round(l.width[1] * 0.9)],
    hazards,
    set: 'hard',
  };
});

/**
 * EASY: where everyone starts. The same four worlds, slower, wider and with
 * fewer (and mostly still) hazards; clearing EASY 10 opens NORMAL. EASY 20
 * is about as hard as the middle of NORMAL's world 2.
 */
const easy = (n: number, world: number, goal: number, speed: [number, number], width: [number, number], arm: [number, number], hazards?: HazardRules): LevelDef => ({
  id: n + EASY_OFFSET,
  world,
  goal,
  speed,
  width,
  arm,
  hazards: hazards && { after: 40, ...hazards },
  set: 'easy',
});

export const EASY_LEVELS: LevelDef[] = [
  // World 1: turning, slowly.
  easy(1, 0, 200, [170, 190], [92, 88], [280, 360]),
  easy(2, 0, 280, [180, 205], [90, 85], [270, 350]),
  easy(3, 0, 360, [190, 220], [88, 82], [260, 340]),
  easy(4, 0, 450, [200, 235], [85, 79], [250, 330]),
  easy(5, 0, 540, [210, 250], [82, 76], [240, 320]),
  // World 2: a few saws, still ones by the walls first.
  easy(6, 1, 420, [200, 225], [86, 82], [260, 340], { chance: 0.2, kinds: saw, placement: 'side' }),
  easy(7, 1, 500, [205, 235], [84, 80], [250, 330], { chance: 0.27, kinds: saw, placement: 'side' }),
  easy(8, 1, 580, [210, 245], [82, 77], [240, 320], { chance: 0.3, kinds: saw, placement: 'side' }),
  easy(9, 1, 660, [215, 250], [80, 75], [235, 315], { chance: 0.34, kinds: saw, placement: 'side' }),
  easy(10, 1, 740, [220, 255], [78, 73], [230, 310], { chance: 0.32, kinds: saw, placement: 'any' }),
  // World 3: bombs.
  easy(11, 2, 560, [215, 240], [82, 78], [250, 330], { chance: 0.28, kinds: bomb, placement: 'side' }),
  easy(12, 2, 640, [220, 250], [80, 76], [240, 320], { chance: 0.34, kinds: both, placement: 'side' }),
  easy(13, 2, 720, [225, 260], [78, 73], [235, 310], { chance: 0.38, kinds: both, placement: 'any' }),
  easy(14, 2, 800, [230, 265], [76, 71], [230, 305], { chance: 0.38, kinds: both, placement: 'any', moving: 0.1 }),
  easy(15, 2, 880, [235, 275], [75, 70], [225, 300], { chance: 0.45, kinds: both, placement: 'any', moving: 0.15 }),
  // World 4: everything, a bit faster.
  easy(16, 3, 760, [240, 275], [76, 71], [230, 300], { chance: 0.4, kinds: both, placement: 'any', moving: 0.15 }),
  easy(17, 3, 840, [245, 285], [75, 70], [225, 295], { chance: 0.43, kinds: both, placement: 'any', moving: 0.2 }),
  easy(18, 3, 920, [250, 290], [74, 69], [220, 290], { chance: 0.45, kinds: both, placement: 'any', moving: 0.25 }),
  easy(19, 3, 1000, [255, 300], [73, 68], [215, 285], { chance: 0.42, kinds: both, placement: 'any', moving: 0.2 }),
  easy(20, 3, 1100, [260, 310], [72, 66], [210, 280], { chance: 0.45, kinds: both, placement: 'any', moving: 0.25 }),
];

export const ALL_LEVELS: LevelDef[] = [...EASY_LEVELS, ...LEVELS, ...HARD_LEVELS];
export const SETS: LevelSet[] = ['easy', 'normal', 'hard'];
export const LEVELS_OF: Record<LevelSet, LevelDef[]> = { easy: EASY_LEVELS, normal: LEVELS, hard: HARD_LEVELS };
const OFFSET: Record<LevelSet, number> = { easy: EASY_OFFSET, normal: 0, hard: HARD_OFFSET };
/** The levels each set's 10th level opens: EASY 10 opens NORMAL, NORMAL 10 opens HARD. */
export const UNLOCK_AT = 10;

export const levelById = (id: number) => ALL_LEVELS.find((l) => l.id === id);
export const setOf = (id: number): LevelSet => (id > EASY_OFFSET ? 'easy' : id > HARD_OFFSET ? 'hard' : 'normal');
export const isHardLevel = (id: number) => setOf(id) === 'hard';
export const isEasyLevel = (id: number) => setOf(id) === 'easy';
/** The level's number within its set (HARD 3 -> 3). */
export const levelNumber = (id: number) => id - OFFSET[setOf(id)];
/** Level `n` (1..20) of a set. */
export const levelId = (set: LevelSet, n: number) => OFFSET[set] + n;
/** "EASY 7", "LEVEL 7" or "HARD 7". */
export const levelName = (id: number) => `${SET_NAME[setOf(id)]} ${levelNumber(id)}`;
export const SET_NAME: Record<LevelSet, string> = { easy: 'EASY', normal: 'LEVEL', hard: 'HARD' };
/** The last level of the set this one belongs to. */
export const lastOfSet = (id: number) => OFFSET[setOf(id)] + LEVELS.length;
/** The warp star hides in every level from this number on (its tip card comes right before). */
export const WARP_FROM_LEVEL = 5;
