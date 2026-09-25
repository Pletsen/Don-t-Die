import { palette } from './palette';

// A tiny bit of state that several scenes read every frame. The game scene
// writes it; the background and UI scenes only read it.
export const shared = {
  camX: 0,
  camY: 0,
  zoom: 1,
  accent: palette.cyan,
  /** 0 at start speed, 1 at top speed. Drives background intensity. */
  intensity: 0,
  /** Brief flash of energy on PERFECT turns, decays to 0. */
  pulse: 0,
};

/** Event names sent over `game.events` between scenes. */
export const EV = {
  /** UI -> Game: start a run. Payload: PlayRequest. */
  play: 'dd-play',
  /** UI -> Game: leave the run and idle behind the menus. */
  menu: 'dd-menu',
  /** UI -> Game: the player tapped (turn). */
  tap: 'dd-tap',
  /** Game -> UI */
  started: 'dd-started',
  hud: 'dd-hud',
  died: 'dd-died',
  cleared: 'dd-cleared',
  combo: 'dd-combo',
  fxChanged: 'dd-fx-changed',
} as const;

/** `level: null` means survival mode. */
export interface PlayRequest {
  level: number | null;
}

export interface HudData {
  meters: number;
  seconds: number;
  /** Metres to the finish, or null in survival mode. */
  goal: number | null;
}

export interface DeathData extends HudData {
  level: number | null;
  best: number;
  isNewBest: boolean;
  cause: 'wall' | 'saw' | 'bomb';
  deaths: number;
}

export interface ClearData extends HudData {
  level: number;
  stars: number;
  /** Stars before this run, to animate only the new ones. */
  previousStars: number;
  perfects: number;
  turns: number;
}
