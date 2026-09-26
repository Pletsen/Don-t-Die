// Saved in the browser (localStorage). Wrapped in try/catch because private
// browsing and some embedded views block storage entirely.

const KEYS = {
  best: 'dontdie_best_m',
  deaths: 'dontdie_deaths',
  muted: 'dontdie_muted',
  fxReduced: 'dontdie_fx_reduced',
  stars: 'dontdie_level_stars',
  rainbow: 'dontdie_rainbow',
  warps: 'dontdie_warps',
  ducks: 'dontdie_ducks',
  skins: 'dontdie_skins',
  skin: 'dontdie_skin',
  intro: 'dontdie_intro_seen',
};

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignore: the game still works, it just forgets.
  }
}

function readStars(): Record<number, number> {
  try {
    const parsed = JSON.parse(read(KEYS.stars) ?? '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

const prefersReducedMotion =
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export const save = {
  best: parseFloat(read(KEYS.best) ?? '0') || 0,
  deaths: parseInt(read(KEYS.deaths) ?? '0', 10) || 0,
  muted: read(KEYS.muted) === '1',
  rainbow: read(KEYS.rainbow) === '1',
  /** Rubber ducks banked from cleared bonus universes: the skin currency. */
  ducks: parseInt(read(KEYS.ducks) ?? '0', 10) || 0,
  addDucks(n: number) {
    this.ducks = Math.max(0, this.ducks + n);
    write(KEYS.ducks, String(this.ducks));
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
  totalStars(): number {
    return Object.values(this.stars).reduce((a, b) => a + b, 0);
  },

  setBest(v: number) {
    this.best = v;
    write(KEYS.best, String(v));
  },
  addDeath() {
    this.deaths++;
    write(KEYS.deaths, String(this.deaths));
  },
  setMuted(v: boolean) {
    this.muted = v;
    write(KEYS.muted, v ? '1' : '0');
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
