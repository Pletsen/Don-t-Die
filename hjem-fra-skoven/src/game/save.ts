import type { UpgradeId } from '../data/upgrades';

export interface Bank {
  meat: number;
  shards: number;
  trophies: number;
}

export interface Save {
  /** The level the hunter will walk next. */
  level: number;
  bank: Bank;
  upgrades: Record<UpgradeId, number>;
  seenHelp: boolean;
}

const KEY = 'hjem-fra-skoven-v1';

export function freshSave(): Save {
  return {
    level: 1,
    bank: { meat: 0, shards: 0, trophies: 0 },
    upgrades: { health: 0, stamina: 0, quiver: 0, arrows: 0, wind: 0 },
    seenHelp: false,
  };
}

export function loadSave(): Save {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return freshSave();
    const s = JSON.parse(raw) as Partial<Save>;
    const f = freshSave();
    return {
      level: Math.max(1, Math.min(31, Math.floor(s.level ?? 1))),
      bank: { ...f.bank, ...(s.bank ?? {}) },
      upgrades: { ...f.upgrades, ...(s.upgrades ?? {}) },
      seenHelp: !!s.seenHelp,
    };
  } catch {
    return freshSave();
  }
}

export function writeSave(s: Save) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* private mode etc. */
  }
}
