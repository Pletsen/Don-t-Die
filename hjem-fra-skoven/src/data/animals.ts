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

export interface BodyDef {
  length: number; // along the facing direction
  height: number; // torso thickness
  width: number;
  legs: number; // leg length
  head: number; // head size
  color: number;
  accent: number;
  antlers?: 'small' | 'big' | 'moose';
  tusks?: boolean;
  longEars?: boolean;
  bushyTail?: boolean;
  hump?: boolean;
  bird?: boolean;
  glow?: boolean;
}

export interface SpeciesDef {
  id: SpeciesId;
  name: string;
  role: Role;
  hp: number;
  walk: number; // m/s while wandering
  run: number; // m/s while fleeing or chasing
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

export const SPECIES: Record<SpeciesId, SpeciesDef> = {
  hare: {
    id: 'hare', name: 'hare', role: 'prey', hp: 14, walk: 1.2, run: 11, smell: 20, sight: 18,
    aggroRange: 0, giveUp: 0, damage: 0, attackRange: 0, windup: 0, cooldown: 0, lunge: 0,
    radius: 0.42, meat: 1, shards: 1, trophies: 0,
    body: { length: 0.55, height: 0.3, width: 0.26, legs: 0.18, head: 0.17, color: 0x8a6e4e, accent: 0xe8e0d0, longEars: true },
  },
  fasan: {
    id: 'fasan', name: 'fasan', role: 'prey', hp: 12, walk: 1.0, run: 8, smell: 14, sight: 22,
    aggroRange: 0, giveUp: 0, damage: 0, attackRange: 0, windup: 0, cooldown: 0, lunge: 0,
    radius: 0.42, meat: 1, shards: 1, trophies: 0,
    body: { length: 0.5, height: 0.3, width: 0.28, legs: 0.22, head: 0.14, color: 0x9a5a2a, accent: 0x2a6a4a, bird: true },
  },
  raadyr: {
    id: 'raadyr', name: 'rådyr', role: 'prey', hp: 42, walk: 1.6, run: 10.5, smell: 32, sight: 28,
    aggroRange: 0, giveUp: 0, damage: 0, attackRange: 0, windup: 0, cooldown: 0, lunge: 0,
    radius: 0.8, meat: 3, shards: 2, trophies: 0,
    body: { length: 1.2, height: 0.5, width: 0.4, legs: 0.7, head: 0.26, color: 0xa0693a, accent: 0xefe6d4 },
  },
  hvidhjort: {
    id: 'hvidhjort', name: 'hvid hjort', role: 'prey', hp: 55, walk: 1.4, run: 12.5, smell: 45, sight: 35,
    aggroRange: 0, giveUp: 0, damage: 0, attackRange: 0, windup: 0, cooldown: 0, lunge: 0,
    radius: 1.0, meat: 4, shards: 6, trophies: 1,
    body: { length: 1.7, height: 0.7, width: 0.5, legs: 1.0, head: 0.34, color: 0xf2f2ee, accent: 0xffffff, antlers: 'big', glow: true },
  },
  raev: {
    id: 'raev', name: 'ræv', role: 'predator', hp: 30, walk: 1.5, run: 8, smell: 30, sight: 24,
    aggroRange: 0, giveUp: 40, damage: 7, attackRange: 1.5, windup: 0.4, cooldown: 1.1, lunge: 1.0,
    radius: 0.55, meat: 1, shards: 3, trophies: 0,
    body: { length: 0.8, height: 0.32, width: 0.3, legs: 0.35, head: 0.2, color: 0xc4601e, accent: 0xf4efe6, bushyTail: true },
  },
  vildsvin: {
    id: 'vildsvin', name: 'vildsvin', role: 'defender', hp: 95, walk: 1.5, run: 9.5, smell: 22, sight: 14,
    aggroRange: 12, giveUp: 45, damage: 22, attackRange: 2.2, windup: 0.75, cooldown: 1.6, lunge: 3.8,
    radius: 0.95, meat: 5, shards: 4, trophies: 0,
    body: { length: 1.5, height: 0.8, width: 0.65, legs: 0.5, head: 0.4, color: 0x4a3f36, accent: 0xe9e2cf, tusks: true },
  },
  elg: {
    id: 'elg', name: 'elg', role: 'defender', hp: 160, walk: 1.6, run: 8.5, smell: 26, sight: 22,
    aggroRange: 10, giveUp: 45, damage: 32, attackRange: 3.0, windup: 0.9, cooldown: 2.0, lunge: 3.0,
    radius: 1.35, meat: 9, shards: 7, trophies: 0,
    body: { length: 2.2, height: 1.0, width: 0.8, legs: 1.5, head: 0.5, color: 0x3d2f26, accent: 0x6a5845, antlers: 'moose', hump: true },
  },
  kronhjort: {
    id: 'kronhjort', name: 'kronhjort', role: 'defender', hp: 115, walk: 1.6, run: 10.5, smell: 38, sight: 30,
    aggroRange: 11, giveUp: 50, damage: 26, attackRange: 2.8, windup: 0.8, cooldown: 1.8, lunge: 3.2,
    radius: 1.1, meat: 7, shards: 6, trophies: 0,
    body: { length: 1.9, height: 0.8, width: 0.55, legs: 1.1, head: 0.36, color: 0x7a4a28, accent: 0xd8c9a8, antlers: 'big' },
  },
  ulv: {
    id: 'ulv', name: 'ulv', role: 'predator', hp: 75, walk: 1.8, run: 9.2, smell: 48, sight: 32,
    aggroRange: 0, giveUp: 70, damage: 14, attackRange: 2.0, windup: 0.45, cooldown: 1.0, lunge: 1.8,
    radius: 0.8, meat: 3, shards: 6, trophies: 0,
    body: { length: 1.3, height: 0.5, width: 0.4, legs: 0.7, head: 0.3, color: 0x6c6c70, accent: 0xb9b9bd, bushyTail: true },
  },
  bjorn: {
    id: 'bjorn', name: 'bjørn', role: 'predator', hp: 230, walk: 1.8, run: 7.4, smell: 52, sight: 24,
    aggroRange: 0, giveUp: 70, damage: 38, attackRange: 2.8, windup: 0.7, cooldown: 1.8, lunge: 1.6,
    radius: 1.35, meat: 12, shards: 10, trophies: 0,
    body: { length: 2.0, height: 1.1, width: 0.95, legs: 0.7, head: 0.5, color: 0x3a2a20, accent: 0x5a4636, hump: true },
  },
};
