// Saved in the browser (localStorage). Wrapped in try/catch because private
// browsing and some embedded views block storage entirely.

const KEYS = {
  best: 'dontdie_best_m',
  deaths: 'dontdie_deaths',
  muted: 'dontdie_muted',
  fxReduced: 'dontdie_fx_reduced',
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

const prefersReducedMotion =
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export const save = {
  best: parseFloat(read(KEYS.best) ?? '0') || 0,
  deaths: parseInt(read(KEYS.deaths) ?? '0', 10) || 0,
  muted: read(KEYS.muted) === '1',
  fxReduced: read(KEYS.fxReduced) === null ? prefersReducedMotion : read(KEYS.fxReduced) === '1',

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
  setFxReduced(v: boolean) {
    this.fxReduced = v;
    write(KEYS.fxReduced, v ? '1' : '0');
  },
};
