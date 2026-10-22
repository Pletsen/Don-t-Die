/**
 * All animal numbers live here so they can be balanced without touching the AI.
 * Roles: prey flees, defenders only fight when you get close or hurt them,
 * predators hunt you as soon as they notice you.
 */
export type SpeciesId =
  | 'hare'
  | 'fasan'
  | 'raadyr'
  | 'hvidhjort'
  | 'raev'
  | 'vildsvin'
  | 'elg'
  | 'kronhjort'
  | 'ulv'
  | 'bjorn';

export type Role = 'prey' | 'defender' | 'predator';

/** How the neck leaves the shoulders. Deer carry the head high, wolves level, bears low, boars have almost no neck. */
export type NeckKind = 'upright' | 'level' | 'low' | 'none';
export type EarKind = 'deer' | 'pointed' | 'round' | 'long' | 'small';
export type TailKind = 'flag' | 'bushy' | 'stub' | 'thin' | 'bird';

export interface BodyDef {
  length: number; // along the facing direction
  height: number; // torso thickness
  width: number;
  legs: number; // leg length
  head: number; // head size
  color: number;
  accent: number; // belly, throat and rump (countershading)
  /** Darker colour for the spine stripe and lower legs. */
  dark?: number;
  neck: NeckKind;
  ears: EarKind;
  earSize: number; // multiplier
  /** Snout length relative to the head size. */
  snout: number;
  tail: TailKind;
  hooves: boolean;
  /** Eye reflection colour at night (tapetum lucidum). */
  eyeshine: number;
  antlers?: 'small' | 'big' | 'moose';
  tusks?: boolean;
  hump?: boolean;
  bird?: boolean;
  glow?: boolean;
  mane?: boolean; // longer hair on neck/shoulders (moose, wolf ruff)
}

export interface SpeciesDef {
  id: SpeciesId;
  name: string;
  role: Role;
  hp: number;
  walk: number; // m/s while wandering
  run: number; // m/s while fleeing or chasing
  /** m/s² towards the wanted speed. Low values give heavy animals momentum (and dodge windows). */
  accel: number;
  /** rad/s turn rate at standstill; it falls with speed (turnRate / (1 + speed / 4)). */
  turnRate: number;
  /** Metres at which the scent reaches the animal when the wind blows straight from you to it. */
  smell: number;
  /** Metres of eyesight, in a cone in front of the animal. */
  sight: number;
  /** Defenders attack once you are closer than this (metres). */
  aggroRange: number;
  /** Chasers give up beyond this distance (metres). */
  giveUp: number;
  damage: number;
  attackRange: number;
  windup: number; // seconds of warning before a strike
  cooldown: number; // seconds between strikes
  lunge: number; // metres the animal throws itself forward on a strike
  radius: number; // body radius for arrows and trees
  meat: number;
  shards: number;
  trophies: number;
  body: BodyDef;
}

/** Shared animal tuning that is not per species. */
export const ANIMAL_TUNING = {
  /** Damage multiplier for hits on animals that have not noticed you (idle, lured or alert below the threshold). */
  stealthMult: 2.0,
  stealthAwareness: 0.7,
  /** Share of the windup during which the animal still tracks you; after that the heading is locked (the commit). */
  trackShare: 0.6,
  /** Seconds the strike lunge takes. */
  strikeTime: 0.32,
  /** Hit test starts at this share of the lunge. */
  strikeActiveFrom: 0.15,
  /** Predators that may not attack (engagement cap) circle the hunter at this distance and growl. */
  circleMin: 12,
  circleMax: 15,
  /** Animals beyond this distance cast no shadow and skip bone animation. */
  shadowDistance: 45,
  /** Fallback hide distance when the world reports no view distance. */
  hideDistance: 120,
  /** Seconds a predator that gave up ignores the hunter (unless hurt). */
  calmAfterGiveUp: 10,
  /** Bleeding: wound severity per share of max hp lost, and its decay per second. */
  bleedPerHp: 1.5,
  bleedDecay: 0.02,
  /** Stuck projectiles kept per animal. */
  maxStuck: 6,
  /** Share of arrows that break when pulled from a carcass. */
  arrowBreak: 0.5,
  /** Corpses stay this long (seconds). */
  corpseTime: 40,
};

export const SPECIES: Record<SpeciesId, SpeciesDef> = {
  hare: {
    id: 'hare', name: 'hare', role: 'prey', hp: 14, walk: 1.2, run: 11, accel: 30, turnRate: 14, smell: 20, sight: 18,
    aggroRange: 0, giveUp: 0, damage: 0, attackRange: 0, windup: 0, cooldown: 0, lunge: 0,
    radius: 0.42, meat: 1, shards: 1, trophies: 0,
    body: {
      length: 0.55, height: 0.3, width: 0.24, legs: 0.16, head: 0.16, color: 0x8a6e4e, accent: 0xe8e0d0, dark: 0x4a3a2a,
      neck: 'none', ears: 'long', earSize: 1, snout: 0.45, tail: 'stub', hooves: false, eyeshine: 0xff6a3a,
    },
  },
  fasan: {
    id: 'fasan', name: 'fasan', role: 'prey', hp: 12, walk: 1.0, run: 8, accel: 20, turnRate: 10, smell: 14, sight: 22,
    aggroRange: 0, giveUp: 0, damage: 0, attackRange: 0, windup: 0, cooldown: 0, lunge: 0,
    radius: 0.42, meat: 1, shards: 1, trophies: 0,
    body: {
      length: 0.5, height: 0.3, width: 0.26, legs: 0.2, head: 0.13, color: 0x9a5a2a, accent: 0xc9874a, dark: 0x5a3216,
      neck: 'upright', ears: 'small', earSize: 0, snout: 0.5, tail: 'bird', hooves: false, eyeshine: 0x000000, bird: true,
    },
  },
  raadyr: {
    id: 'raadyr', name: 'rådyr', role: 'prey', hp: 42, walk: 1.6, run: 10.5, accel: 16, turnRate: 9, smell: 32, sight: 28,
    aggroRange: 0, giveUp: 0, damage: 0, attackRange: 0, windup: 0, cooldown: 0, lunge: 0,
    radius: 0.8, meat: 3, shards: 2, trophies: 0,
    body: {
      length: 1.1, height: 0.48, width: 0.36, legs: 0.68, head: 0.24, color: 0xa0693a, accent: 0xefe6d4, dark: 0x5e3c22,
      neck: 'upright', ears: 'deer', earSize: 1.15, snout: 0.75, tail: 'flag', hooves: true, eyeshine: 0xb8ff9a, antlers: 'small',
    },
  },
  hvidhjort: {
    id: 'hvidhjort', name: 'hvid hjort', role: 'prey', hp: 55, walk: 1.4, run: 12.5, accel: 16, turnRate: 9, smell: 45, sight: 35,
    aggroRange: 0, giveUp: 0, damage: 0, attackRange: 0, windup: 0, cooldown: 0, lunge: 0,
    radius: 1.0, meat: 4, shards: 6, trophies: 1,
    body: {
      length: 1.65, height: 0.68, width: 0.48, legs: 0.98, head: 0.32, color: 0xf2f2ee, accent: 0xffffff, dark: 0xc8c8c0,
      neck: 'upright', ears: 'deer', earSize: 1, snout: 0.85, tail: 'flag', hooves: true, eyeshine: 0xc8ffd0, antlers: 'big', glow: true,
    },
  },
  raev: {
    id: 'raev', name: 'ræv', role: 'predator', hp: 30, walk: 1.5, run: 8, accel: 20, turnRate: 11, smell: 30, sight: 24,
    aggroRange: 0, giveUp: 40, damage: 7, attackRange: 1.5, windup: 0.4, cooldown: 1.1, lunge: 1.0,
    radius: 0.55, meat: 1, shards: 3, trophies: 0,
    body: {
      length: 0.78, height: 0.3, width: 0.26, legs: 0.34, head: 0.19, color: 0xc4601e, accent: 0xf4efe6, dark: 0x1e1612,
      neck: 'level', ears: 'pointed', earSize: 1.25, snout: 1.0, tail: 'bushy', hooves: false, eyeshine: 0xffe08a,
    },
  },
  vildsvin: {
    id: 'vildsvin', name: 'vildsvin', role: 'defender', hp: 95, walk: 1.5, run: 9.5, accel: 12, turnRate: 5, smell: 22, sight: 14,
    aggroRange: 12, giveUp: 45, damage: 22, attackRange: 2.2, windup: 0.75, cooldown: 1.6, lunge: 3.8,
    radius: 0.95, meat: 5, shards: 4, trophies: 0,
    body: {
      length: 1.45, height: 0.78, width: 0.6, legs: 0.42, head: 0.42, color: 0x4a3f36, accent: 0x5e5248, dark: 0x231c17,
      neck: 'none', ears: 'small', earSize: 1, snout: 1.15, tail: 'thin', hooves: true, eyeshine: 0xffb070, tusks: true, mane: true,
    },
  },
  elg: {
    id: 'elg', name: 'elg', role: 'defender', hp: 160, walk: 1.6, run: 8.5, accel: 7, turnRate: 3.5, smell: 26, sight: 22,
    aggroRange: 10, giveUp: 45, damage: 32, attackRange: 3.0, windup: 0.9, cooldown: 2.0, lunge: 3.0,
    radius: 1.35, meat: 9, shards: 7, trophies: 0,
    body: {
      length: 2.1, height: 0.95, width: 0.75, legs: 1.45, head: 0.5, color: 0x3d2f26, accent: 0x6a5845, dark: 0x9a8a74,
      neck: 'upright', ears: 'deer', earSize: 0.9, snout: 1.25, tail: 'stub', hooves: true, eyeshine: 0xd0ff9a, antlers: 'moose', hump: true, mane: true,
    },
  },
  kronhjort: {
    id: 'kronhjort', name: 'kronhjort', role: 'defender', hp: 115, walk: 1.6, run: 10.5, accel: 11, turnRate: 5, smell: 38, sight: 30,
    aggroRange: 11, giveUp: 50, damage: 26, attackRange: 2.8, windup: 0.8, cooldown: 1.8, lunge: 3.2,
    radius: 1.1, meat: 7, shards: 6, trophies: 0,
    body: {
      length: 1.85, height: 0.78, width: 0.52, legs: 1.08, head: 0.34, color: 0x7a4a28, accent: 0xd8c9a8, dark: 0x3e2a1a,
      neck: 'upright', ears: 'deer', earSize: 1, snout: 0.9, tail: 'stub', hooves: true, eyeshine: 0xb8ff9a, antlers: 'big', mane: true,
    },
  },
  ulv: {
    id: 'ulv', name: 'ulv', role: 'predator', hp: 75, walk: 1.8, run: 9.2, accel: 14, turnRate: 7, smell: 48, sight: 32,
    aggroRange: 0, giveUp: 70, damage: 14, attackRange: 2.0, windup: 0.45, cooldown: 1.0, lunge: 1.8,
    radius: 0.8, meat: 3, shards: 6, trophies: 0,
    body: {
      length: 1.25, height: 0.46, width: 0.36, legs: 0.66, head: 0.28, color: 0x6c6c70, accent: 0xc9c6bd, dark: 0x2e2c2c,
      neck: 'level', ears: 'pointed', earSize: 1, snout: 1.05, tail: 'bushy', hooves: false, eyeshine: 0xffd27a, mane: true,
    },
  },
  bjorn: {
    id: 'bjorn', name: 'bjørn', role: 'predator', hp: 230, walk: 1.8, run: 7.4, accel: 9, turnRate: 4, smell: 52, sight: 24,
    aggroRange: 0, giveUp: 70, damage: 38, attackRange: 2.8, windup: 0.7, cooldown: 1.8, lunge: 1.6,
    radius: 1.35, meat: 12, shards: 10, trophies: 0,
    body: {
      length: 1.95, height: 1.05, width: 0.95, legs: 0.62, head: 0.48, color: 0x3a2a20, accent: 0x4a3828, dark: 0x1e1610,
      neck: 'low', ears: 'round', earSize: 1, snout: 0.8, tail: 'stub', hooves: false, eyeshine: 0xffa060, hump: true,
    },
  },
};
