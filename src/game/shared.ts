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
  /** 0 normal, 1 in the bonus universe (after the warp star). */
  warp: 0,
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
  /** Game -> UI: the warp star was hit. */
  warp: 'dd-warp',
  /** Game -> UI: ability state changed ({ state, frac }). */
  ability: 'dd-ability',
  /** Game -> UI: DUCK FRENZY ({ phase: 'start' | 'tick' | 'end', count, max, frac }). */
  frenzy: 'dd-frenzy',
  /** UI -> Game: a different skin was equipped. */
  skin: 'dd-skin',
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
  warped: boolean;
  /** Ducks bonked this run. They only count if you finish, so these are lost. */
  ducks: number;
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
  warped: boolean;
  ducks: number;
}

export interface FrenzyData {
  phase: 'start' | 'tick' | 'end';
  count: number;
  max: number;
  /** Time left, 1 → 0. */
  frac: number;
}
