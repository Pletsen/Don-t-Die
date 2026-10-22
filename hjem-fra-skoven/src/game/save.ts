import type { UpgradeId } from '../data/upgrades';
import { WEAPONS, type Levels } from '../data/weapons';
import { settings, type Settings } from './settings';

export interface Bank {
  meat: number;
  shards: number;
  trophies: number;
}

export interface LevelStat {
  cleared: boolean;
  plays: number; // completed runs of this level
  marks: { home: boolean; unseen: boolean; whiteDeer: boolean };
}

export interface Save {
  version: 2;
  /** Highest level unlocked (the next new one). */
  level: number;
  /** Level chosen on the map (defaults to `level`). */
  selected: number;
  bank: Bank;
  upgrades: Record<UpgradeId, number>;
  owned: Record<string, boolean>;
  weaponLv: Record<string, Levels>;
  levels: Record<number, LevelStat>;
  firstKill: Record<string, boolean>;
  bossesBeaten: Record<number, boolean>;
  seenHelp: Record<string, boolean>;
  stats: { kills: Record<string, number>; deaths: number; playSeconds: number };
  finished: boolean;
  settings: Settings;
}

const KEY = 'faerten-save-v2';
const OLD_KEY = 'hjem-fra-skoven-v1';

export function freshSave(): Save {
  const owned: Record<string, boolean> = {};
  const weaponLv: Record<string, Levels> = {};
  for (const w of WEAPONS) {
    owned[w.id] = Object.keys(w.price).length === 0;
    weaponLv[w.id] = { dmg: 0, spd: 0, xtra: 0 };
  }
  return {
    version: 2,
    level: 1,
    selected: 1,
    bank: { meat: 0, shards: 0, trophies: 0 },
    upgrades: { health: 0, stamina: 0, wind: 0 },
    owned,
    weaponLv,
    levels: {},
    firstKill: {},
    bossesBeaten: {},
    seenHelp: {},
    stats: { kills: {}, deaths: 0, playSeconds: 0 },
    finished: false,
    settings: { ...settings },
  };
}

/** Finite number in [min, max], else the default. Saves from older versions or by hand must never break the game. */
function num(v: unknown, def: number, min = -Infinity, max = Infinity): number {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
}
const int = (v: unknown, def: number, min = 0, max = 1e9) => Math.floor(num(v, def, min, max));
const bool = (v: unknown, def = false) => (typeof v === 'boolean' ? v : def);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

export function loadSave(): Save {
  const f = freshSave();
  let raw: unknown = null;
  try {
    const text = localStorage.getItem(KEY) ?? localStorage.getItem(OLD_KEY);
    raw = text ? JSON.parse(text) : null;
  } catch {
    raw = null;
  }
  const s = obj(raw);
  if (!raw) {
    Object.assign(settings, f.settings);
    return f;
  }
  const bank = obj(s.bank);
  const upg = obj(s.upgrades);
  const owned = obj(s.owned);
  const wl = obj(s.weaponLv);
  const out: Save = {
    ...f,
    level: int(s.level, 1, 1, 30),
    selected: 1,
    bank: { meat: int(bank.meat, 0), shards: int(bank.shards, 0), trophies: int(bank.trophies, 0) },
    upgrades: { health: int(upg.health, 0, 0, 5), stamina: int(upg.stamina, 0, 0, 5), wind: int(upg.wind, 0, 0, 3) },
    owned: { ...f.owned },
    weaponLv: { ...f.weaponLv },
    finished: bool(s.finished),
  };
  for (const id of Object.keys(f.owned)) {
    out.owned[id] = f.owned[id] || bool(owned[id]);
    const l = obj(wl[id]);
    out.weaponLv[id] = { dmg: int(l.dmg, 0, 0, 5), spd: int(l.spd, 0, 0, 5), xtra: int(l.xtra, 0, 0, 5) };
  }
  out.selected = int(s.selected, out.level, 1, out.level);
  const levels = obj(s.levels);
  for (const k of Object.keys(levels)) {
    const n = int(k, 0, 1, 30);
    if (!n) continue;
    const l = obj(levels[k]);
    const m = obj(l.marks);
    out.levels[n] = { cleared: bool(l.cleared), plays: int(l.plays, 0), marks: { home: bool(m.home), unseen: bool(m.unseen), whiteDeer: bool(m.whiteDeer) } };
  }
  // version 1 saves only knew the next level: everything before it was cleared
  for (let n = 1; n < out.level; n++) out.levels[n] ??= { cleared: true, plays: 1, marks: { home: true, unseen: false, whiteDeer: false } };
  for (const [k, v] of Object.entries(obj(s.firstKill))) if (v === true) out.firstKill[k] = true;
  for (const [k, v] of Object.entries(obj(s.bossesBeaten))) if (v === true) out.bossesBeaten[int(k, 0)] = true;
  for (const [k, v] of Object.entries(obj(s.seenHelp))) if (v === true) out.seenHelp[k] = true;
  const st = obj(s.stats);
  const kills: Record<string, number> = {};
  for (const [k, v] of Object.entries(obj(st.kills))) kills[k] = int(v, 0);
  out.stats = { kills, deaths: int(st.deaths, 0), playSeconds: num(st.playSeconds, 0, 0) };
  const se = obj(s.settings);
  const d = f.settings;
  out.settings = {
    sensitivity: num(se.sensitivity, d.sensitivity, 0.3, 3),
    invertY: bool(se.invertY, d.invertY),
    fov: num(se.fov, d.fov, 55, 90),
    master: num(se.master, d.master, 0, 1),
    sfx: num(se.sfx, d.sfx, 0, 1),
    music: num(se.music, d.music, 0, 1),
    ambience: num(se.ambience, d.ambience, 0, 1),
    quality: se.quality === 'low' || se.quality === 'medium' || se.quality === 'high' ? se.quality : d.quality,
    difficulty: se.difficulty === 'let' || se.difficulty === 'svaer' || se.difficulty === 'normal' ? se.difficulty : d.difficulty,
    blood: bool(se.blood, d.blood),
  };
  Object.assign(settings, out.settings);
  return out;
}

export function writeSave(s: Save) {
  s.settings = { ...settings };
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* private mode etc. */
  }
}
