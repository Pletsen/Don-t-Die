import { SPECIES, type SpeciesId } from '../data/animals';
import type { LevelDef } from '../data/levels';
import type { World } from '../world/World';
import { Rng } from '../game/rng';
import { Animal } from './Animal';
import { Boss } from './Boss';
import { bossForLevel } from '../data/bosses';

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

/**
 * The boss of a level (every 10th): the alpha wolf and the giant moose wait in a clearing about 50 m before the cave,
 * the scarred bear sits in front of the cave mouth. Returns null on other levels.
 */
export function spawnBoss(level: LevelDef, world: World): Boss | null {
  const def = bossForLevel(level.n);
  if (!def) return null;
  const r = SPECIES[def.base].radius * def.scale;
  const tryAt = (x0: number, z0: number): [number, number] => {
    for (let ring = 0; ring < 8; ring++)
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const x = x0 + Math.cos(a) * ring * 1.5;
        const z = z0 + Math.sin(a) * ring * 1.5;
        if (world.isFree(x, z, r + 0.5)) return [x, z];
      }
    return [x0, z0];
  };
  let x: number;
  let z: number;
  if (def.id === 'kaempebjorn') {
    const c = world.caveEntrance;
    [x, z] = tryAt(c.x, c.z + 7);
  } else {
    const zz = -(level.length - 50);
    [x, z] = tryAt(world.trailX(zz), zz);
  }
  const boss = new Boss(def, x, z, world, level.seed + 4242);
  boss.heading = 0; // facing the way the hunter comes from (+z)
  return boss;
}
