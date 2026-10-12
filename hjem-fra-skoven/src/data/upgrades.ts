/** Cave upgrades. Costs per level are listed in order (index 0 = price of level 1). */
export type UpgradeId = 'health' | 'stamina' | 'quiver' | 'arrows' | 'wind';

export interface Cost {
  meat?: number;
  shards?: number;
  trophies?: number;
}

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  desc: string;
  costs: Cost[];
}

export const UPGRADES: UpgradeDef[] = [
  {
    id: 'health', name: 'Tykkere skind', desc: '+15 liv',
    costs: [{ shards: 8 }, { shards: 14 }, { shards: 22 }, { shards: 32, meat: 6 }, { shards: 45, trophies: 1 }],
  },
  {
    id: 'stamina', name: 'Frisk lunge', desc: '+15 udholdenhed',
    costs: [{ meat: 5 }, { meat: 9 }, { meat: 14 }, { meat: 20, shards: 10 }, { meat: 28, trophies: 1 }],
  },
  {
    id: 'quiver', name: 'Større kogger', desc: '+4 pile pr. tur',
    costs: [{ shards: 6 }, { shards: 12 }, { shards: 20 }, { shards: 30 }, { shards: 40, meat: 10 }],
  },
  {
    id: 'arrows', name: 'Skarpe pilespidser', desc: '+6 skade',
    costs: [{ shards: 10 }, { shards: 18 }, { shards: 28, meat: 6 }, { shards: 40, trophies: 1 }, { shards: 60, trophies: 2 }],
  },
  {
    id: 'wind', name: 'Vindkløgt', desc: 'Dyr lugter dig 8 % dårligere',
    costs: [{ trophies: 1 }, { trophies: 1, shards: 20 }, { trophies: 2, shards: 30 }],
  },
];

/** Weapon families from the design. Only the bow is playable so far. */
export const WEAPON_FAMILIES = [
  { key: '1', name: 'Bue og pil', ready: true },
  { key: '2', name: 'Kasteøkser og knive', ready: false },
  { key: '3', name: 'Fælder og snareværk', ready: false },
  { key: '4', name: 'Spyd og sling', ready: false },
];
