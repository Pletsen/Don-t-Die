import { sfx } from '../audio/Sfx';
import type { Rarity } from '../game/skins';

// Sounds for the DUCK-O-MATIC. Each one first looks for a dedicated method on
// sfx (so the sound designer can add e.g. `sfx.shopCoin(i)` without touching
// the shop) and otherwise falls back to an existing sound.

type Hook = (...args: number[]) => void;
const hooks = sfx as unknown as Record<string, Hook | undefined>;

function play(name: string, fallback: () => void, ...args: number[]) {
  const fn = hooks[name];
  if (typeof fn === 'function') fn.apply(sfx, args);
  else fallback();
}

export const shopSfx = {
  /** A duck drops into the coin slot (i = 0, 1, 2 ...). */
  coin: (i: number) => play('shopCoin', () => i % 2 === 0 && sfx.spinTick(), i),
  lever: () => sfx.leverPull(),
  tick: () => sfx.spinTick(),
  reelStop: (r: number) => sfx.reelStop(r),
  /** The last reel creeps towards the win line. */
  tease: () => play('shopTease', () => sfx.starNear()),
  /** All three reels landed: the win line flashes. */
  win: () => play('shopWin', () => sfx.star(2)),
  capsule: () => play('shopCapsule', () => sfx.boing()),
  shake: (i: number) => play('shopShake', () => sfx.near(), i),
  pop: (rarity: Rarity) => {
    play('shopPop', () => sfx.pop());
    sfx.reveal(rarity);
  },
  /** A duplicate bursts into ducks. */
  burst: () => play('shopBurst', () => sfx.quack(1.25)),
  /** A refunded duck lands in the counter. */
  duckIn: (i: number) => play('shopDuckIn', () => i % 2 === 0 && sfx.spinTick(), i),
};
