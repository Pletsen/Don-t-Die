import type { UpgradeId } from '../data/upgrades';
import { WEAPONS, type Levels } from '../data/weapons';

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
  owned: Record<string, boolean>;
  weaponLv: Record<string, Levels>;
  seenHelp: boolean;
}

const KEY = 'hjem-fra-skoven-v1';

export function freshSave(): Save {
  const owned: Record<string, boolean> = {};
  const weaponLv: Record<string, Levels> = {};
  for (const w of WEAPONS) {
    owned[w.id] = Object.keys(w.price).length === 0;
    weaponLv[w.id] = { dmg: 0, spd: 0, xtra: 0 };
  }
  return {
    level: 1,
    bank: { meat: 0, shards: 0, trophies: 0 },
    upgrades: { health: 0, stamina: 0, wind: 0 },
    owned,
    weaponLv,
    seenHelp: false,
  };
}

export function loadSave(): Save {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return freshSave();
    const s = JSON.parse(raw) as Partial<Save>;
    const f = freshSave();
    const weaponLv = { ...f.weaponLv };
    for (const id of Object.keys(weaponLv)) weaponLv[id] = { ...weaponLv[id], ...(s.weaponLv?.[id] ?? {}) };
    return {
      level: Math.max(1, Math.min(31, Math.floor(s.level ?? 1))),
      bank: { ...f.bank, ...(s.bank ?? {}) },
      upgrades: { ...f.upgrades, ...(s.upgrades ?? {}) },
      owned: { ...f.owned, ...(s.owned ?? {}) },
      weaponLv,
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
