// Saved in the browser (localStorage), through the helpers in persist.ts.
import { read, write } from './persist';

const KEYS = {
  best: 'dontdie_best_m',
  deaths: 'dontdie_deaths',
  /** Old single switch for all audio (read once, to migrate to the two below). */
  muted: 'dontdie_muted',
  music: 'dontdie_music',
  sound: 'dontdie_sound',
  fxReduced: 'dontdie_fx_reduced',
  stars: 'dontdie_level_stars',
  rainbow: 'dontdie_rainbow',
  warps: 'dontdie_warps',
  ducks: 'dontdie_ducks',
  skins: 'dontdie_skins',
  skin: 'dontdie_skin',
  freeSpins: 'dontdie_free_spins',
  intro: 'dontdie_intro_seen',
};

function readStars(): Record<number, number> {
  try {
    const parsed = JSON.parse(read(KEYS.stars) ?? '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Music and sound effects have their own switches ('1' on, '0' off). A save
 * from before the split had one mute switch for everything: someone who
 * muted the game wanted silence, so that turns both off until they're set.
 */
function readSwitch(key: string): boolean {
  const v = read(key);
  return v === null ? read(KEYS.muted) !== '1' : v === '1';
}

const prefersReducedMotion =
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

const duckListeners: ((n: number, source: string) => void)[] = [];

export const save = {
  best: parseFloat(read(KEYS.best) ?? '0') || 0,
  deaths: parseInt(read(KEYS.deaths) ?? '0', 10) || 0,
  /** Background music on. */
  music: readSwitch(KEYS.music),
  /** Sound effects on (incl. the recorded duck sounds). */
  sound: readSwitch(KEYS.sound),
  /** @deprecated There are two switches now: use `sound` (and `music`). */
  get muted(): boolean {
    return !this.sound;
  },
  rainbow: read(KEYS.rainbow) === '1',
  /** Rubber ducks banked from cleared bonus universes: the skin currency. */
  ducks: parseInt(read(KEYS.ducks) ?? '0', 10) || 0,
  /**
   * Add (or with a negative n, spend) ducks. `source` says where they came
   * from ('level', 'survival', 'daily', 'mission', 'streak', 'refund', 'spin',
   * later 'ad' or 'iap'), so rewards can be tracked and tuned.
   */
  addDucks(n: number, source = 'other') {
    this.ducks = Math.max(0, this.ducks + n);
    write(KEYS.ducks, String(this.ducks));
    duckListeners.forEach((fn) => fn(n, source));
  },
  /** Free charges of the QUACK REACTOR (rewards from streaks, stars, missions). */
  freeSpins: parseInt(read(KEYS.freeSpins) ?? '0', 10) || 0,
  addFreeSpins(n: number) {
    this.freeSpins = Math.max(0, this.freeSpins + n);
    write(KEYS.freeSpins, String(this.freeSpins));
  },
  /** Listen to every duck change: (amount, source). */
  onDucks(fn: (n: number, source: string) => void) {
    duckListeners.push(fn);
  },
  /** Skins owned (ids). 'classic' is always owned. */
  skins: new Set<string>(['classic', ...(read(KEYS.skins) ?? '').split(',').filter(Boolean)]),
  addSkin(id: string) {
    this.skins.add(id);
    write(KEYS.skins, [...this.skins].join(','));
  },
  /** The equipped skin. */
  skin: read(KEYS.skin) ?? 'classic',
  setSkin(id: string) {
    this.skin = id;
    write(KEYS.skin, id);
  },

  /** Level ids where the warp star has been hit. */
  warps: new Set<number>((read(KEYS.warps) ?? '').split(',').filter(Boolean).map(Number)),
  recordWarp(levelId: number) {
    this.warps.add(levelId);
    write(KEYS.warps, [...this.warps].join(','));
  },
  /** The HOW TO PLAY screen has been seen (shown by itself on first launch). */
  introSeen: read(KEYS.intro) === '1',
  setIntroSeen() {
    this.introSeen = true;
    write(KEYS.intro, '1');
  },
  fxReduced: read(KEYS.fxReduced) === null ? prefersReducedMotion : read(KEYS.fxReduced) === '1',

  /** Best star rating per level id (0 = never cleared). */
  stars: readStars(),

  starsFor(levelId: number): number {
    return this.stars[levelId] ?? 0;
  },
  /** Keeps the best rating. Returns true if this improved it. */
  recordStars(levelId: number, stars: number): boolean {
    if (stars <= this.starsFor(levelId)) return false;
    this.stars[levelId] = stars;
    write(KEYS.stars, JSON.stringify(this.stars));
    return true;
  },
  /** Stars on the 20 normal levels (HARD MODE counts on its own, ids > 100). */
  totalStars(): number {
    return Object.entries(this.stars).reduce((a, [id, n]) => (Number(id) <= 100 ? a + n : a), 0);
  },
  hardStars(): number {
    return Object.entries(this.stars).reduce((a, [id, n]) => (Number(id) > 100 ? a + n : a), 0);
  },

  setBest(v: number) {
    this.best = v;
    write(KEYS.best, String(v));
  },
  addDeath() {
    this.deaths++;
    write(KEYS.deaths, String(this.deaths));
  },
  setMusic(on: boolean) {
    this.music = on;
    write(KEYS.music, on ? '1' : '0');
  },
  setSound(on: boolean) {
    this.sound = on;
    write(KEYS.sound, on ? '1' : '0');
  },
  setRainbow(v: boolean) {
    this.rainbow = v;
    write(KEYS.rainbow, v ? '1' : '0');
  },
  setFxReduced(v: boolean) {
    this.fxReduced = v;
    write(KEYS.fxReduced, v ? '1' : '0');
  },
};
