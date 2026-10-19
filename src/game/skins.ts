import { palette } from './palette';

// All player skins as data. How each one looks is painted in
// fx/skinTextures.ts under the texture key `skin:<id>`. Each skin's ability
// is a recipe in game/abilities.ts, and the DUCK-O-MATIC rules live in
// game/gacha.ts.

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

export const RARITY_ORDER: Rarity[] = ['common', 'rare', 'epic', 'legendary'];

export const RARITIES: Record<Rarity, { label: string; chance: number; color: number; css: string }> = {
  common: { label: 'COMMON', chance: 0.65, color: 0x9fb3c8, css: '#9fb3c8' },
  rare: { label: 'RARE', chance: 0.25, color: 0x2be8ff, css: '#2be8ff' },
  epic: { label: 'EPIC', chance: 0.08, color: 0xb36bff, css: '#b36bff' },
  legendary: { label: 'LEGENDARY', chance: 0.02, color: 0xffd21f, css: '#ffd21f' },
};

export interface Skin {
  id: string;
  name: string;
  rarity: Rarity;
  /** Halo, orbit ring and spark colour. */
  glow: number;
  /** Trail colour; several colours cycle, 'rainbow' runs through all hues. */
  trail: number | number[] | 'rainbow';
  /** Faces and hats stay upright instead of turning with the orb. */
  upright?: boolean;
}

export const SKINS: Skin[] = [
  // Common: tasty materials, a cute face and a couple of jokes.
  { id: 'classic', name: 'CLASSIC', rarity: 'common', glow: palette.cyan, trail: palette.cyan },
  { id: 'mint', name: 'MINT CHIP', rarity: 'common', glow: 0x3dffb5, trail: [0x3dffb5, 0x6b4128] },
  { id: 'bubblegum', name: 'BUBBLEGUM', rarity: 'common', glow: 0xff5cb8, trail: 0xff5cb8 },
  { id: 'lemon', name: 'LEMON', rarity: 'common', glow: 0xffe03a, trail: 0xffe03a },
  { id: 'grape', name: 'GRAPE', rarity: 'common', glow: 0xa06bff, trail: 0xa06bff, upright: true },
  { id: 'tangerine', name: 'TANGERINE', rarity: 'common', glow: 0xff8a1f, trail: 0xff8a1f, upright: true },
  { id: 'frosty', name: 'FROSTY', rarity: 'common', glow: 0xbfeaff, trail: [0xffffff, 0xbfeaff] },
  { id: 'blush', name: 'BLUSH', rarity: 'common', glow: 0xffa3b5, trail: 0xffa3b5, upright: true },
  { id: 'moon', name: 'MOON', rarity: 'common', glow: 0xdfe6ee, trail: 0xdfe6ee },
  { id: 'potato', name: 'POTATO', rarity: 'common', glow: 0xd9a560, trail: 0xc98a3a, upright: true },
  { id: 'melon', name: 'WATERMELON', rarity: 'common', glow: 0xff4a6b, trail: [0xff4a6b, 0x3dbb4a] },
  { id: 'cookie', name: 'COOKIE', rarity: 'common', glow: 0xe0a560, trail: [0xe0a560, 0x5a3420] },

  // Rare: characters and patterns.
  { id: 'kitty', name: 'KITTY', rarity: 'rare', glow: 0xff9ad5, trail: [0xff9ad5, 0xffffff], upright: true },
  { id: 'froggy', name: 'FROGGY', rarity: 'rare', glow: 0x6bff6b, trail: 0x6bff6b, upright: true },
  { id: 'panda', name: 'PANDA', rarity: 'rare', glow: 0xffffff, trail: [0xffffff, 0x333333], upright: true },
  { id: 'beachball', name: 'BEACH BALL', rarity: 'rare', glow: 0xffd21f, trail: [0xff2f5e, 0xffd21f, 0x2be8ff, 0x3dff6b] },
  { id: 'donut', name: 'DONUT', rarity: 'rare', glow: 0xff8ccb, trail: [0xff8ccb, 0xffd21f, 0x2be8ff] },
  { id: 'soccer', name: 'SOCCER', rarity: 'rare', glow: 0xffffff, trail: 0xffffff },
  { id: 'eyeball', name: 'EYEBALL', rarity: 'rare', glow: 0xff5c5c, trail: 0xff5c5c },
  { id: 'bee', name: 'BUSY BEE', rarity: 'rare', glow: 0xffd21f, trail: [0xffd21f, 0x222222], upright: true },
  { id: 'disco', name: 'DISCO BALL', rarity: 'rare', glow: 0xff5cf0, trail: [0xff5cf0, 0x2be8ff, 0xffe03a] },
  { id: 'ghost', name: 'BOO', rarity: 'rare', glow: 0xc8e8ff, trail: [0xffffff, 0xc8e8ff], upright: true },

  // Epic: the cool ones.
  { id: 'lava', name: 'LAVA', rarity: 'epic', glow: 0xff5a00, trail: [0xff2a00, 0xff9a00, 0xffe000] },
  { id: 'galaxy', name: 'GALAXY', rarity: 'epic', glow: 0xb36bff, trail: [0xb36bff, 0x2be8ff, 0xff2f9e] },
  { id: 'cyber', name: 'CYBER EYE', rarity: 'epic', glow: 0xff2240, trail: 0xff2240 },
  { id: 'pizza', name: 'PIZZA PAL', rarity: 'epic', glow: 0xffb040, trail: [0xffcf5a, 0xd6333f], upright: true },
  { id: 'plasma', name: 'PLASMA', rarity: 'epic', glow: 0xff4af0, trail: [0xff4af0, 0x6af0ff] },
  { id: 'fishbowl', name: 'FISHBOWL', rarity: 'epic', glow: 0x4ac8ff, trail: [0x4ac8ff, 0xff8a1f], upright: true },

  // Legendary: 2 %, guaranteed within PITY.legendary spins.
  { id: 'crown', name: 'GOLDEN CROWN', rarity: 'legendary', glow: 0xffd21f, trail: [0xffd21f, 0xffffff], upright: true },
  { id: 'blackhole', name: 'BLACK HOLE', rarity: 'legendary', glow: 0xff9a2e, trail: [0x7a3cff, 0xff9a2e, 0xffffff], upright: true },
  { id: 'duckking', name: 'DUCK KING', rarity: 'legendary', glow: 0xffd21f, trail: 'rainbow', upright: true },
  { id: 'phoenix', name: 'PHOENIX', rarity: 'legendary', glow: 0xff7a1a, trail: [0xffe14a, 0xff7a1a, 0xff2a3a], upright: true },
];

export const skinById = (id: string) => SKINS.find((s) => s.id === id) ?? SKINS[0];
export const skinTexture = (id: string) => `skin:${id}`;
export const skinsOf = (rarity: Rarity) => SKINS.filter((s) => s.rarity === rarity);

export const SPIN_COST = 50;
/** Ducks back for a duplicate (only possible once that rarity's set is complete). */
export const REFUND: Record<Rarity, number> = { common: 10, rare: 20, epic: 40, legendary: 80 };
/** @deprecated Duplicates refund by rarity now: use REFUND[rarity]. */
export const DUPLICATE_REFUND = REFUND.common;
/** Pity: an epic-or-better within this many spins, a legendary within this many. */
export const PITY = { epic: 15, legendary: 60 };

/** Pick a rarity by its chance. */
export function rollRarity(rand = Math.random): Rarity {
  let r = rand();
  for (const key of RARITY_ORDER) {
    if (r < RARITIES[key].chance) return key;
    r -= RARITIES[key].chance;
  }
  return 'common';
}

/** Pick a rarity by its chance, then a random skin of that rarity (no pity, no pool rules: see gacha.ts). */
export function rollSkin(rand = Math.random): Skin {
  const pool = skinsOf(rollRarity(rand));
  return pool[Math.floor(rand() * pool.length)];
}
