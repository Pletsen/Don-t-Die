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
  tap: 'dd-tap',
  hud: 'dd-hud',
  started: 'dd-started',
  died: 'dd-died',
  combo: 'dd-combo',
  fxChanged: 'dd-fx-changed',
} as const;

export interface HudData {
  meters: number;
  seconds: number;
}

export interface DeathData {
  meters: number;
  seconds: number;
  best: number;
  isNewBest: boolean;
  cause: 'wall' | 'saw' | 'bomb';
  deaths: number;
}
