import { SPECIES, type SpeciesId } from '../data/animals';
import type { LevelDef } from '../data/levels';
import type { World } from '../world/World';
import { Rng } from '../game/rng';
import { Animal } from './Animal';

/** Places the animals of a level. Predators and defenders are kept away from the start. */
export function spawnAnimals(level: LevelDef, world: World): Animal[] {
  const rng = new Rng(level.seed + 99);
  const out: Animal[] = [];
  const L = level.length;
  const half = level.width / 2 - 4;

  const place = (id: SpeciesId, seedOffset: number) => {
    const def = SPECIES[id];
    const minZ = def.role === 'prey' ? 18 : def.role === 'defender' ? 28 : 42;
    for (let tries = 0; tries < 60; tries++) {
      const z = -rng.range(minZ, L - 12);
      // bias towards the trail so that the hunter actually meets the animals
      const x = world.trailX(z) + rng.range(-1, 1) * Math.min(half, 24);
      if (Math.abs(x) > half) continue;
      if (!world.isFree(x, z, def.radius + 0.4)) continue;
      out.push(new Animal(def, x, z, world, level.seed + seedOffset + out.length * 31));
      return;
    }
  };

  let k = 1;
  for (const id of Object.keys(level.animals) as SpeciesId[]) {
    const n = level.animals[id] ?? 0;
    for (let i = 0; i < n; i++) place(id, k++);
  }
  if (level.whiteDeer) place('hvidhjort', k++);
  return out;
}
