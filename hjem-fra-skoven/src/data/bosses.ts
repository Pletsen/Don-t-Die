import type { SpeciesId } from './animals';

/**
 * Boss animals (owner decision): alpha wolf on level 10, giant moose on level 20, the scarred giant bear at the cave on
 * level 30. All numbers here; the behaviour is in src/animals/Boss.ts.
 *
 * Fairness rules for every attack: telegraph >= 0.6 s (phase 3 >= 0.45 s), the heading locks `commit` seconds before
 * the active part, hitboxes are swept shapes, and `recovery` >= 0.5 s is a punish window (x`punishMul` damage).
 */
export type BossId = 'alfaulv' | 'kaempeelg' | 'kaempebjorn';

export interface BossAttack {
  /** Distance band (m) in which the boss picks this attack. */
  min: number;
  max: number;
  weight: number;
  telegraph: number; // seconds of readable windup
  commit: number; // heading locked this long before the active part
  active: number; // seconds the hitbox is live / the move lasts
  recovery: number; // punish window
  damage: number;
  /** Lowest phase (1..3) in which it is used. */
  phase: number;
}

export interface BossDef {
  id: BossId;
  level: number;
  name: string; // shown on the HUD boss bar
  base: SpeciesId;
  scale: number;
  hp: number;
  walk: number;
  run: number;
  accel: number;
  turnRate: number;
  /** Phase 2 and 3 start below these shares of max hp. */
  phases: [number, number];
  punishMul: number;
  meat: number;
  shards: number;
  trophies: number;
  /** Boss rim light colour (Fresnel), to read against fog. */
  rim: number;
  color: number;
  accent: number;
  dark: number;
  eyeshine: number;
  attacks: Record<string, BossAttack>;
  /** Extra numbers per boss. */
  extra: Record<string, number>;
}

export const BOSSES: Record<BossId, BossDef> = {
  alfaulv: {
    id: 'alfaulv', level: 10, name: 'Alfaulven', base: 'ulv', scale: 1.4,
    hp: 280, walk: 2.2, run: 9.8, accel: 16, turnRate: 7, phases: [0.6, 0.25], punishMul: 1.5,
    meat: 6, shards: 25, trophies: 2, rim: 0x8fb0ff, color: 0x2c2c30, accent: 0x8a8a90, dark: 0x16161a, eyeshine: 0xffb84a,
    attacks: {
      lunge: { min: 0, max: 7, weight: 3, telegraph: 0.6, commit: 0.25, active: 0.35, recovery: 0.6, damage: 16, phase: 1 },
      hamstring: { min: 4, max: 12, weight: 2, telegraph: 0.7, commit: 0.25, active: 1.1, recovery: 0.6, damage: 12, phase: 2 },
    },
    extra: { circleNear: 8, circleFar: 13.5, lungeDist: 6, passSpeed: 11, adds: 2, maxAdds: 2, attackEvery: 6, retreatDist: 40, regen: 3, regenCap: 0.35, feint: 0.3 },
  },
  kaempeelg: {
    id: 'kaempeelg', level: 20, name: 'Kæmpeelgen', base: 'elg', scale: 1.7,
    hp: 700, walk: 1.8, run: 9, accel: 5, turnRate: 1.5, phases: [0.5, 0.2], punishMul: 1.5,
    meat: 20, shards: 40, trophies: 2, rim: 0xc8d8a0, color: 0x3a2c22, accent: 0x6a5845, dark: 0xb0a088, eyeshine: 0xd0ff9a,
    attacks: {
      charge: { min: 9, max: 35, weight: 3, telegraph: 1.0, commit: 0.3, active: 2.4, recovery: 0.9, damage: 38, phase: 1 },
      stomp: { min: 0, max: 7, weight: 2, telegraph: 0.8, commit: 0.3, active: 0.45, recovery: 1.0, damage: 25, phase: 1 },
      sweep: { min: 0, max: 5, weight: 2, telegraph: 0.6, commit: 0.25, active: 0.3, recovery: 0.8, damage: 30, phase: 1 },
      kick: { min: 0, max: 4.5, weight: 0, telegraph: 0.6, commit: 0.2, active: 0.2, recovery: 0.7, damage: 22, phase: 1 },
    },
    extra: { chargeSpeed: 13, chargeTurn: 0.6, stun: 2.5, stunMul: 1.5, ringRadius: 5, ringTime: 0.4, chain: 3 },
  },
  kaempebjorn: {
    id: 'kaempebjorn', level: 30, name: 'Den arrede bjørn', base: 'bjorn', scale: 1.9,
    hp: 1200, walk: 1.6, run: 7.0, accel: 7, turnRate: 2.5, phases: [0.5, 0.2], punishMul: 1.5,
    meat: 30, shards: 60, trophies: 3, rim: 0xff9a50, color: 0x1e1612, accent: 0x2e241c, dark: 0x9a9086, eyeshine: 0xffa060,
    attacks: {
      swipe: { min: 0, max: 4.6, weight: 3, telegraph: 0.6, commit: 0.2, active: 0.22, recovery: 0.8, damage: 42, phase: 1 },
      crush: { min: 0, max: 6.5, weight: 2, telegraph: 1.2, commit: 0.3, active: 0.25, recovery: 1.4, damage: 55, phase: 1 },
      charge: { min: 7, max: 22, weight: 2, telegraph: 0.7, commit: 0.25, active: 1.4, recovery: 0.8, damage: 35, phase: 1 },
      rock: { min: 8, max: 32, weight: 3, telegraph: 1.0, commit: 0.3, active: 1.1, recovery: 0.7, damage: 30, phase: 2 },
    },
    extra: { chargeSpeed: 10, enragedRun: 8.0, rockRadius: 1.8, swipeArc: 1.75, crushLen: 3.6, crushWidth: 2.8, retreatTime: 4 },
  },
};

export function bossForLevel(n: number): BossDef | null {
  for (const b of Object.values(BOSSES)) if (b.level === n) return b;
  return null;
}
