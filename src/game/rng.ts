/** A random number generator: returns a number in [0, 1) each call. */
export type Rng = () => number;

/**
 * Seeded random numbers (the "mulberry32" algorithm). The same seed always
 * gives the same sequence, which is what makes a level's track identical
 * every time you play it, so it can be learned.
 */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const randomSeed = () => Math.floor(Math.random() * 2 ** 31);
