import type { SpeciesId } from './animals';

/**
 * 30 stretches from the edge of the forest to the cave.
 * Levels are described by a few numbers (length, light, wind, which animals and how many),
 * and the forest itself is grown from `seed`, so a level is the same every time you play it.
 * A hand-made level can later replace a generated one by overriding its entry in `LEVELS`.
 */
export const LEVEL_COUNT = 30;

export interface LevelDef {
  n: number;
  seed: number;
  length: number; // metres from start to cave
  width: number; // metres of playable forest
  tod: number; // 0 afternoon .. 1 night
  treeDensity: number; // trees per square metre
  windAngle: number; // direction the wind blows TOWARDS (radians, x = sin, z = cos)
  windStrength: number;
  animals: Partial<Record<SpeciesId, number>>;
  whiteDeer: boolean;
}

interface Rule {
  species: SpeciesId;
  from: number; // first level
  base: number; // count at `from`
  every: number; // add one more every N levels
  max: number;
}

/** Why: prey fills the early forest so the first levels teach wind and bow without pressure.
 * Defenders arrive from level 5, predators from level 3 (a lone fox) and wolves from 13. */
const RULES: Rule[] = [
  { species: 'hare', from: 1, base: 5, every: 99, max: 5 },
  { species: 'fasan', from: 1, base: 4, every: 99, max: 4 },
  { species: 'raadyr', from: 1, base: 4, every: 99, max: 4 },
  { species: 'raev', from: 2, base: 1, every: 6, max: 4 },
  { species: 'vildsvin', from: 4, base: 1, every: 5, max: 5 },
  { species: 'elg', from: 8, base: 1, every: 8, max: 3 },
  { species: 'kronhjort', from: 11, base: 1, every: 7, max: 3 },
  { species: 'ulv', from: 11, base: 1, every: 4, max: 4 },
  { species: 'bjorn', from: 21, base: 1, every: 5, max: 2 },
];

/** Wind direction per level in degrees: 0 = headwind (scent blows back to the start), ±90 = crosswind, 180 = tailwind. */
const WIND_PLAN = [
  0, 20, -40, 60, -70, 90, // 1-6: head or cross
  -90, 180, 70, -110, 40, -60, 150, 90, -80, // 7-15: mostly cross, one tailwind lesson (8) and a hard one (13)
  165, -30, 120, -150, 180, 45, -135, 100, 170, -100, 140, -170, 60, 175, 10, // 16-30: mixed, tailwind on hard levels
];

function generate(n: number): LevelDef {
  const t = (n - 1) / (LEVEL_COUNT - 1);
  const animals: Partial<Record<SpeciesId, number>> = {};
  for (const r of RULES) {
    if (n < r.from) continue;
    animals[r.species] = Math.min(r.max, r.base + Math.floor((n - r.from) / r.every));
  }
  // Authored wind (QA review): the route runs towards -z, so a wind blowing towards +z (angle 0) carries your scent
  // back where you came from. Early levels teach with headwind/crosswind; tailwind (angle π) is saved for hard levels.
  const rel = WIND_PLAN[n - 1];
  const windAngle = (rel * Math.PI) / 180;
  return {
    n,
    seed: 1000 + n * 7919,
    length: Math.round(110 + 170 * t),
    width: 72,
    tod: Math.pow(t, 0.85),
    treeDensity: 0.016 + 0.014 * t,
    windAngle,
    windStrength: 0.65 + ((n * 37) % 10) * 0.07,
    animals,
    whiteDeer: n >= 3 && n % 3 === 0,
  };
}

export const LEVELS: LevelDef[] = Array.from({ length: LEVEL_COUNT }, (_, i) => generate(i + 1));

export function getLevel(n: number): LevelDef {
  return LEVELS[Math.min(LEVEL_COUNT, Math.max(1, n)) - 1];
}
