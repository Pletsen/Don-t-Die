import type { Cost } from './upgrades';

/**
 * Every weapon in the game. All numbers are data: tweak here, not in the logic.
 * A weapon has three upgrade tracks (bought in the cave, 5 levels each):
 *  - dmg:  +12 % damage per level (for bait this is how long it lasts)
 *  - spd:  -8 % time between uses per level (faster loading)
 *  - xtra: a track that is different for each weapon (more ammo, better aim, reach ...)
 */
export type WeaponKind = 'proj' | 'melee' | 'trap' | 'bait';
export type Look = 'arrow' | 'knife' | 'axe' | 'spear' | 'stone';
export type XtraKind = 'ammo' | 'accuracy' | 'reach' | 'root' | 'poison' | 'lure';

export interface WeaponDef {
  id: string;
  family: 1 | 2 | 3 | 4;
  name: string;
  desc: string;
  kind: WeaponKind;
  price: Cost;
  /** Base number for upgrade prices. */
  upBase: number;
  damage: number;
  cooldown: number;
  noise: number; // metres animals can hear it
  ammo: number; // 0 = unlimited (melee)
  // projectiles
  look?: Look;
  speed?: number;
  gravity?: number;
  spread?: number; // radians, from the hip
  spreadAim?: number;
  retrievable?: boolean; // can be picked up again, also after a hit
  spin?: boolean;
  poison?: { dps: number; time: number };
  // melee
  reach?: number;
  // traps and bait
  trap?: 'snare' | 'bear';
  radius?: number;
  root?: number;
  lure?: number; // metres
  xtra: { kind: XtraKind; label: string; per: number };
  labels?: { dmg?: string; spd?: string };
}

export const FAMILIES = [
  { key: '1', name: 'Bue og pil' },
  { key: '2', name: 'Kasteøkser og knive' },
  { key: '3', name: 'Fælder og snareværk' },
  { key: '4', name: 'Spyd og sling' },
];

export const WEAPONS: WeaponDef[] = [
  // ---------- 1 · bue og pil ----------
  {
    id: 'jagtbue', family: 1, name: 'Jagtbue', desc: 'Pålidelig og tavs nok. Din gamle ven.', kind: 'proj', price: {}, upBase: 6,
    damage: 30, cooldown: 0.65, noise: 34, ammo: 14, look: 'arrow', speed: 62, gravity: 5, spread: 0.055, spreadAim: 0.006,
    xtra: { kind: 'ammo', label: 'Større kogger (+4 pile)', per: 4 },
  },
  {
    id: 'langbue', family: 1, name: 'Langbue', desc: 'Langsom at spænde, men rammer hårdt og flyver fladt.', kind: 'proj', price: { shards: 30, meat: 8 }, upBase: 9,
    damage: 50, cooldown: 1.05, noise: 36, ammo: 10, look: 'arrow', speed: 80, gravity: 3.2, spread: 0.045, spreadAim: 0.003,
    xtra: { kind: 'accuracy', label: 'Sigtekorn (mere præcis)', per: 0.15 },
  },
  {
    id: 'hurtigbue', family: 1, name: 'Hurtigbue', desc: 'Lille og hurtig. Mange svage pile frem for én stærk.', kind: 'proj', price: { shards: 45, trophies: 1 }, upBase: 10,
    damage: 22, cooldown: 0.36, noise: 30, ammo: 18, look: 'arrow', speed: 66, gravity: 4.5, spread: 0.07, spreadAim: 0.01,
    xtra: { kind: 'ammo', label: 'Større kogger (+5 pile)', per: 5 },
  },
  {
    id: 'giftbue', family: 1, name: 'Giftbue', desc: 'Pilene er dyppet i gift. Dyret dør, selv om det slipper væk.', kind: 'proj', price: { shards: 40, trophies: 1 }, upBase: 10,
    damage: 18, cooldown: 0.8, noise: 30, ammo: 8, look: 'arrow', speed: 60, gravity: 5, spread: 0.055, spreadAim: 0.006,
    poison: { dps: 9, time: 6 },
    xtra: { kind: 'poison', label: 'Stærkere gift', per: 0.25 },
  },

  // ---------- 2 · kasteøkser og knive ----------
  {
    id: 'jagtkniv', family: 2, name: 'Jagtkniv', desc: 'Hurtig i nærkamp. Når dyret er for tæt på til buen.', kind: 'melee', price: { shards: 6 }, upBase: 5,
    damage: 26, cooldown: 0.35, noise: 8, ammo: 0, reach: 2.0,
    xtra: { kind: 'reach', label: 'Længere klinge', per: 0.25 },
  },
  {
    id: 'kastekniv', family: 2, name: 'Kastekniv', desc: 'Lette og hurtige. Saml dem op igen, også efter et hit.', kind: 'proj', price: { shards: 14 }, upBase: 6,
    damage: 24, cooldown: 0.32, noise: 12, ammo: 8, look: 'knife', speed: 40, gravity: 9, spread: 0.03, spreadAim: 0.01, retrievable: true, spin: true,
    xtra: { kind: 'ammo', label: 'Bælte med flere knive (+2)', per: 2 },
  },
  {
    id: 'kasteoekse', family: 2, name: 'Kasteøkse', desc: 'Tung og dræbende. Drejer rundt i luften.', kind: 'proj', price: { shards: 28, meat: 6 }, upBase: 8,
    damage: 62, cooldown: 0.95, noise: 16, ammo: 4, look: 'axe', speed: 32, gravity: 12, spread: 0.03, spreadAim: 0.01, retrievable: true, spin: true,
    xtra: { kind: 'ammo', label: 'Flere økser (+1)', per: 1 },
  },
  {
    id: 'dobbeltoekse', family: 2, name: 'Dobbeltøkse', desc: 'Kastes med begge hænder. Fælder det meste i ét hug.', kind: 'proj', price: { shards: 55, trophies: 2 }, upBase: 12,
    damage: 105, cooldown: 1.5, noise: 22, ammo: 2, look: 'axe', speed: 26, gravity: 14, spread: 0.035, spreadAim: 0.012, retrievable: true, spin: true,
    xtra: { kind: 'accuracy', label: 'Bedre balance', per: 0.15 },
  },

  // ---------- 3 · fælder og snareværk ----------
  {
    id: 'snare', family: 3, name: 'Snare', desc: 'Binder et dyr til jorden et par sekunder. Stille at lægge ud.', kind: 'trap', trap: 'snare', price: { shards: 10 }, upBase: 6,
    damage: 8, cooldown: 0.8, noise: 3, ammo: 4, radius: 1.1, root: 3.5,
    xtra: { kind: 'root', label: 'Stærkere snor (+0,7 s)', per: 0.7 },
  },
  {
    id: 'baerefaelde', family: 3, name: 'Bjørnefælde', desc: 'Jernkæber. Skader hårdt og holder fast.', kind: 'trap', trap: 'bear', price: { shards: 35 }, upBase: 9,
    damage: 70, cooldown: 1.0, noise: 6, ammo: 2, radius: 1.2, root: 4.5,
    xtra: { kind: 'root', label: 'Tungere fjeder (+0,7 s)', per: 0.7 },
  },
  {
    id: 'lokkemad', family: 3, name: 'Lokkemad', desc: 'Kød på jorden. Dyr i nærheden kommer for at æde. Brug den sammen med fælder.', kind: 'bait', price: { shards: 8, meat: 8 }, upBase: 5,
    damage: 30, cooldown: 0.8, noise: 2, ammo: 3, lure: 30,
    labels: { dmg: 'Holdbarhed (længere tid)' },
    xtra: { kind: 'lure', label: 'Stærkere duft (+5 m)', per: 5 },
  },
  {
    id: 'giftaad', family: 3, name: 'Giftåd', desc: 'Lokkemad med gift i. Dyret æder og dør lidt efter.', kind: 'bait', price: { shards: 30, meat: 6 }, upBase: 8,
    damage: 30, cooldown: 0.8, noise: 2, ammo: 2, lure: 28, poison: { dps: 14, time: 8 },
    labels: { dmg: 'Holdbarhed (længere tid)' },
    xtra: { kind: 'poison', label: 'Stærkere gift', per: 0.25 },
  },

  // ---------- 4 · spyd og sling ----------
  {
    id: 'spyd', family: 4, name: 'Jagtspyd', desc: 'Stød fra tæt hold. Hårdt, og du behøver ingen pile.', kind: 'melee', price: { shards: 16, meat: 4 }, upBase: 7,
    damage: 54, cooldown: 0.85, noise: 10, ammo: 0, reach: 3.0,
    xtra: { kind: 'reach', label: 'Længere skaft', per: 0.3 },
  },
  {
    id: 'langspyd', family: 4, name: 'Langspyd', desc: 'Holder vildsvinet på afstand. Langsomt men kraftigt.', kind: 'melee', price: { shards: 38, trophies: 1 }, upBase: 10,
    damage: 72, cooldown: 1.25, noise: 10, ammo: 0, reach: 4.4,
    xtra: { kind: 'reach', label: 'Længere skaft', per: 0.3 },
  },
  {
    id: 'kastespyd', family: 4, name: 'Kastespyd', desc: 'Kastes tungt og langt. Kan samles op igen.', kind: 'proj', price: { shards: 30, meat: 4 }, upBase: 8,
    damage: 82, cooldown: 1.2, noise: 18, ammo: 3, look: 'spear', speed: 44, gravity: 9, spread: 0.035, spreadAim: 0.008, retrievable: true,
    xtra: { kind: 'ammo', label: 'Flere spyd (+1)', per: 1 },
  },
  {
    id: 'slynge', family: 4, name: 'Slynge', desc: 'Næsten lydløs. Svage sten, men du har mange af dem.', kind: 'proj', price: { shards: 8 }, upBase: 5,
    damage: 13, cooldown: 0.45, noise: 7, ammo: 30, look: 'stone', speed: 48, gravity: 6, spread: 0.06, spreadAim: 0.012,
    xtra: { kind: 'ammo', label: 'Større stenpose (+6)', per: 6 },
  },
];

export const MAX_UPGRADE = 5;
export type Track = 'dmg' | 'spd' | 'xtra';
export const TRACKS: Track[] = ['dmg', 'spd', 'xtra'];

export function weaponById(id: string): WeaponDef {
  return WEAPONS.find((w) => w.id === id)!;
}

export interface Levels {
  dmg: number;
  spd: number;
  xtra: number;
}

export interface Effective {
  damage: number;
  cooldown: number;
  speed: number;
  gravity: number;
  spread: number;
  spreadAim: number;
  noise: number;
  ammo: number;
  reach: number;
  root: number;
  poisonDps: number;
  poisonTime: number;
  lure: number;
}

/** Applies the bought upgrade levels to a weapon's base numbers. */
export function effective(w: WeaponDef, lv: Levels): Effective {
  const x = w.xtra;
  const L = lv.xtra;
  const accuracy = x.kind === 'accuracy' ? Math.max(0.3, 1 - x.per * L) : 1;
  const poisonMul = x.kind === 'poison' ? 1 + x.per * L : 1;
  return {
    damage: w.damage * (1 + 0.12 * lv.dmg),
    cooldown: w.cooldown * (1 - 0.08 * lv.spd),
    speed: w.speed ?? 0,
    gravity: w.gravity ?? 0,
    spread: (w.spread ?? 0) * accuracy,
    spreadAim: (w.spreadAim ?? 0) * accuracy,
    noise: w.noise,
    ammo: w.ammo + (x.kind === 'ammo' ? x.per * L : 0),
    reach: (w.reach ?? 0) + (x.kind === 'reach' ? x.per * L : 0),
    root: (w.root ?? 0) + (x.kind === 'root' ? x.per * L : 0),
    poisonDps: (w.poison?.dps ?? 0) * poisonMul,
    poisonTime: w.poison?.time ?? 0,
    lure: (w.lure ?? 0) + (x.kind === 'lure' ? x.per * L : 0),
  };
}

export function upgradeCost(w: WeaponDef, track: Track, level: number): Cost {
  const c: Cost = { shards: Math.round(w.upBase * (level + 1) * (track === 'dmg' ? 1.25 : 1)) };
  if (level >= 2) c.meat = level * 3;
  if (level >= 4) c.trophies = 1;
  return c;
}

export function trackLabel(w: WeaponDef, t: Track): string {
  if (t === 'xtra') return w.xtra.label;
  if (t === 'dmg') return w.labels?.dmg ?? 'Mere skade';
  return w.labels?.spd ?? (w.kind === 'melee' ? 'Hurtigere slag' : w.kind === 'proj' ? 'Hurtigere ladning' : 'Hurtigere udlægning');
}
