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
  { name: 'BOMBS', color: palette.magenta },
  { name: 'CHAOS', color: palette.red },
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
}

const saw: HazardKind[] = ['saw'];
const bomb: HazardKind[] = ['bomb'];
const both: HazardKind[] = ['saw', 'bomb'];

export const LEVELS: LevelDef[] = [
  // World 1: just turning. Learn the rhythm and the PERFECT zone.
  { id: 1, world: 0, goal: 340, speed: [190, 220], width: [84, 80], arm: [260, 340] },
  { id: 2, world: 0, goal: 460, speed: [210, 250], width: [80, 74], arm: [230, 320] },
  { id: 3, world: 0, goal: 560, speed: [230, 280], width: [74, 68], arm: [210, 300] },
  { id: 4, world: 0, goal: 720, speed: [250, 310], width: [68, 62], arm: [190, 280] },
  { id: 5, world: 0, goal: 850, speed: [270, 340], width: [64, 56], arm: [175, 270] },

  // World 2: saw blades appear.
  { id: 6, world: 1, goal: 560, speed: [240, 270], width: [78, 74], arm: [230, 320], hazards: { chance: 0.35, kinds: saw, placement: 'side' } },
  { id: 7, world: 1, goal: 690, speed: [250, 290], width: [74, 70], arm: [220, 310], hazards: { chance: 0.5, kinds: saw, placement: 'side' } },
  { id: 8, world: 1, goal: 790, speed: [260, 310], width: [72, 66], arm: [210, 300], hazards: { chance: 0.45, kinds: saw, placement: 'any', moving: 0.25 } },
  { id: 9, world: 1, goal: 930, speed: [270, 330], width: [70, 62], arm: [200, 290], hazards: { chance: 0.5, kinds: saw, placement: 'center' } },
  { id: 10, world: 1, goal: 1150, speed: [290, 360], width: [66, 58], arm: [190, 280], hazards: { chance: 0.65, kinds: saw, placement: 'any', moving: 0.35 } },

  // World 3: bombs, and the corridor gets tight.
  { id: 11, world: 2, goal: 800, speed: [270, 310], width: [72, 68], arm: [210, 300], hazards: { chance: 0.45, kinds: bomb, placement: 'side' } },
  { id: 12, world: 2, goal: 950, speed: [280, 330], width: [68, 62], arm: [200, 290], hazards: { chance: 0.55, kinds: both, placement: 'any' } },
  { id: 13, world: 2, goal: 1140, speed: [290, 350], width: [62, 54], arm: [190, 280], hazards: { chance: 0.6, kinds: both, placement: 'any', moving: 0.3 } },
  { id: 14, world: 2, goal: 1300, speed: [300, 370], width: [60, 52], arm: [185, 270], hazards: { chance: 0.55, kinds: both, placement: 'any', perSegment: 2 } },
  { id: 15, world: 2, goal: 1600, speed: [320, 400], width: [58, 50], arm: [180, 260], hazards: { chance: 0.65, kinds: both, placement: 'any', moving: 0.4, perSegment: 2 } },

  // World 4: everything, fast and moving.
  { id: 16, world: 3, goal: 1270, speed: [340, 420], width: [64, 56], arm: [190, 270], hazards: { chance: 0.6, kinds: both, placement: 'any', moving: 0.5 } },
  { id: 17, world: 3, goal: 1580, speed: [360, 450], width: [60, 52], arm: [185, 260], hazards: { chance: 0.65, kinds: both, placement: 'any', moving: 0.55, perSegment: 2 } },
  { id: 18, world: 3, goal: 1900, speed: [380, 480], width: [58, 50], arm: [180, 255], hazards: { chance: 0.7, kinds: both, placement: 'any', moving: 0.6, perSegment: 2 } },
  { id: 19, world: 3, goal: 2300, speed: [400, 520], width: [54, 48], arm: [175, 250], hazards: { chance: 0.75, kinds: both, placement: 'any', moving: 0.7, perSegment: 2 } },
  { id: 20, world: 3, goal: 2500, speed: [420, 580], width: [52, 46], arm: [170, 245], hazards: { chance: 0.8, kinds: both, placement: 'any', moving: 0.8, perSegment: 2 } },
];

export const levelById = (id: number) => LEVELS.find((l) => l.id === id);
