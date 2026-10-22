import type { Difficulty } from '../game/settings';

/**
 * Difficulty multipliers (owner decision: let / normal / svær). Numbers from the QA review.
 * Applied when animals spawn and when a level starts.
 */
export interface DifficultyDef {
  name: string;
  animalDamage: number;
  animalHp: number;
  senses: number; // smell and sight radius
  telegraph: number; // windup time before strikes
  maxAttackers: number; // animals allowed to chase/strike at once (bosses ignore it)
  giveUp: number; // seconds a predator keeps chasing
  playerHealth: number; // multiplier on base health
  eatHeal: number; // multiplier on healing from meat
  ammo: number; // multiplier on ammo per level
  keepCarried: number; // share of carried loot kept on death
  shardMul: number; // loot multiplier
}

export const DIFFICULTY: Record<Difficulty, DifficultyDef> = {
  let: { name: 'Let', animalDamage: 0.6, animalHp: 0.85, senses: 0.75, telegraph: 1.35, maxAttackers: 2, giveUp: 12, playerHealth: 1.3, eatHeal: 1.35, ammo: 1.5, keepCarried: 0.5, shardMul: 1 },
  normal: { name: 'Normal', animalDamage: 1, animalHp: 1, senses: 1, telegraph: 1, maxAttackers: 3, giveUp: 22, playerHealth: 1, eatHeal: 1, ammo: 1, keepCarried: 0, shardMul: 1 },
  svaer: { name: 'Svær', animalDamage: 1.3, animalHp: 1.15, senses: 1.15, telegraph: 0.85, maxAttackers: 4, giveUp: 30, playerHealth: 1, eatHeal: 0.77, ammo: 1, keepCarried: 0, shardMul: 1.25 },
};
