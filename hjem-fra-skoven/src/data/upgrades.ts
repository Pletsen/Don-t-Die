/** General cave upgrades for the hunter. Weapons have their own upgrades in `weapons.ts`.
 *  Costs per level are listed in order (index 0 = price of level 1). */
export type UpgradeId = 'health' | 'stamina' | 'wind';

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
    id: 'wind', name: 'Vindkløgt', desc: 'Dyr lugter dig 8 % dårligere',
    costs: [{ trophies: 1 }, { trophies: 1, shards: 20 }, { trophies: 2, shards: 30 }],
  },
];
