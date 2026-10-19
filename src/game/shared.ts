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
  /** 0 normal, 1 dead: the vignette closes in. */
  gloom: 0,
  /**
   * Which world's look to use: 0 BASICS, 1 SAWS, 2 BOMBS, 3 CHAOS (levels use
   * their world; survival and daily runs follow the sector). The background
   * reads it to pick its sky.
   */
  world: 0,
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
  /**
   * Game -> anyone: something happened that progress tracking cares about
   * (runs, perfects, ducks, abilities ...). Payload: StatEvent.
   */
  stat: 'dd-stat',
  /** Progress -> UI: show a banner (mission done, achievement, reward). Payload: NotifyData. */
  notify: 'dd-notify',
  /** UI/platform -> Game: pause or resume the run (app backgrounded, pause button). */
  pause: 'dd-pause',
  resume: 'dd-resume',
} as const;

/** Which kind of run is being played. */
export type RunMode = 'level' | 'survival' | 'daily';

/** Everything progress tracking (missions, achievements, records) listens to. */
export type StatEvent =
  | { type: 'runStart'; mode: RunMode; level: number | null }
  | {
      type: 'runEnd';
      mode: RunMode;
      level: number | null;
      /** True if a level was cleared (survival/daily runs always end in a crash). */
      cleared: boolean;
      meters: number;
      seconds: number;
      /** Fraction of the level's goal reached, 0..1 (1 for a clear; survival: 0). */
      progress: number;
      stars: number;
      perfects: number;
      gateTurns: number;
      bestCombo: number;
      ducks: number;
      warped: boolean;
      cause: 'wall' | 'saw' | 'bomb' | null;
      abilityUsed: boolean;
    }
  | { type: 'perfect'; combo: number }
  | { type: 'nearMiss'; kind: 'wall' | 'hazard' }
  | { type: 'duck'; variant: 'normal' | 'red' | 'golden'; value: number }
  | { type: 'ability'; skin: string }
  | { type: 'warp'; level: number | null }
  | { type: 'frenzy'; count: number }
  | { type: 'spin'; skin: string; rarity: string; isNew: boolean };

export interface NotifyData {
  title: string;
  subtitle?: string;
  /** Accent colour (0xRRGGBB). */
  color?: number;
  /** Ducks awarded with it, shown as "+N". */
  ducks?: number;
}

/** `level: null` means survival mode; `daily: true` plays today's Daily Run. */
export interface PlayRequest {
  level: number | null;
  daily?: boolean;
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
  /** For wall crashes: was the turn too early or too late? */
  hint: 'early' | 'late' | null;
  /** Ducks kept anyway (all in survival, half of the Universe-2 ducks in a level). */
  keptDucks: number;
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
