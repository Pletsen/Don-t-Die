import { palette } from './palette';

// All player skins as data. How each one looks is painted in
// fx/skinTextures.ts under the texture key `skin:<id>`.

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

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
  // Common: clean colours, a cute face and a couple of jokes.
  { id: 'classic', name: 'CLASSIC', rarity: 'common', glow: palette.cyan, trail: palette.cyan },
  { id: 'mint', name: 'MINT', rarity: 'common', glow: 0x3dffb5, trail: 0x3dffb5 },
  { id: 'bubblegum', name: 'BUBBLEGUM', rarity: 'common', glow: 0xff5cb8, trail: 0xff5cb8 },
  { id: 'lemon', name: 'LEMON', rarity: 'common', glow: 0xffe03a, trail: 0xffe03a },
  { id: 'grape', name: 'GRAPE', rarity: 'common', glow: 0xa06bff, trail: 0xa06bff },
  { id: 'tangerine', name: 'TANGERINE', rarity: 'common', glow: 0xff8a1f, trail: 0xff8a1f },
  { id: 'frosty', name: 'FROSTY', rarity: 'common', glow: 0xbfeaff, trail: [0xffffff, 0xbfeaff] },
  { id: 'blush', name: 'BLUSH', rarity: 'common', glow: 0xffa3b5, trail: 0xffa3b5, upright: true },
  { id: 'moon', name: 'MOON', rarity: 'common', glow: 0xdfe6ee, trail: 0xdfe6ee },
  { id: 'potato', name: 'POTATO', rarity: 'common', glow: 0xd9a560, trail: 0xc98a3a, upright: true },

  // Rare: characters and patterns.
  { id: 'kitty', name: 'KITTY', rarity: 'rare', glow: 0xff9ad5, trail: [0xff9ad5, 0xffffff], upright: true },
  { id: 'froggy', name: 'FROGGY', rarity: 'rare', glow: 0x6bff6b, trail: 0x6bff6b, upright: true },
  { id: 'panda', name: 'PANDA', rarity: 'rare', glow: 0xffffff, trail: [0xffffff, 0x333333], upright: true },
  { id: 'beachball', name: 'BEACH BALL', rarity: 'rare', glow: 0xffd21f, trail: [0xff2f5e, 0xffd21f, 0x2be8ff, 0x3dff6b] },
  { id: 'donut', name: 'DONUT', rarity: 'rare', glow: 0xff8ccb, trail: [0xff8ccb, 0xffd21f, 0x2be8ff] },
  { id: 'soccer', name: 'SOCCER', rarity: 'rare', glow: 0xffffff, trail: 0xffffff },
  { id: 'eyeball', name: 'EYEBALL', rarity: 'rare', glow: 0xff5c5c, trail: 0xff5c5c },

  // Epic: the cool ones.
  { id: 'lava', name: 'LAVA', rarity: 'epic', glow: 0xff5a00, trail: [0xff2a00, 0xff9a00, 0xffe000] },
  { id: 'galaxy', name: 'GALAXY', rarity: 'epic', glow: 0xb36bff, trail: [0xb36bff, 0x2be8ff, 0xff2f9e] },
  { id: 'cyber', name: 'CYBER EYE', rarity: 'epic', glow: 0xff2240, trail: 0xff2240 },
  { id: 'pizza', name: 'PIZZA PAL', rarity: 'epic', glow: 0xffb040, trail: [0xffcf5a, 0xd6333f], upright: true },

  // Legendary: 2 %.
  { id: 'crown', name: 'GOLDEN CROWN', rarity: 'legendary', glow: 0xffd21f, trail: [0xffd21f, 0xffffff], upright: true },
  { id: 'blackhole', name: 'BLACK HOLE', rarity: 'legendary', glow: 0xff9a2e, trail: [0x7a3cff, 0xff9a2e, 0xffffff], upright: true },
  { id: 'duckking', name: 'DUCK KING', rarity: 'legendary', glow: 0xffd21f, trail: 'rainbow', upright: true },
];

export const skinById = (id: string) => SKINS.find((s) => s.id === id) ?? SKINS[0];
export const skinTexture = (id: string) => `skin:${id}`;

export const SPIN_COST = 20;
export const DUPLICATE_REFUND = 5;

/** Pick a rarity by its chance, then a random skin of that rarity. */
export function rollSkin(rand = Math.random): Skin {
  let r = rand();
  let rarity: Rarity = 'common';
  for (const key of Object.keys(RARITIES) as Rarity[]) {
    if (r < RARITIES[key].chance) {
      rarity = key;
      break;
    }
    r -= RARITIES[key].chance;
  }
  const pool = SKINS.filter((s) => s.rarity === rarity);
  return pool[Math.floor(rand() * pool.length)];
}
