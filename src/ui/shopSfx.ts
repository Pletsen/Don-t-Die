import { haptic, sfx } from '../audio/Sfx';
import { RARITY_ORDER, type Rarity } from '../game/skins';

// Sounds (and haptics) for the QUACK REACTOR, in the order the show plays
// them. The synths live in audio/Sfx.ts (the reactor* methods); this file
// decides which one plays at each step and how hard the phone buzzes.

const rank = (r: Rarity) => RARITY_ORDER.indexOf(r);

export const shopSfx = {
  /** A duck dives into the core (k = 0..1: how full the tank is). */
  feed: (k: number) => sfx.reactorFeed(k),
  /** A little quack from the stream. */
  quack: (k: number) => sfx.reactorQuack(k),
  /** The golden duck of a free charge dives in. */
  golden: () => {
    sfx.reactorGolden();
    haptic(10);
  },
  /** The overload starts: a drone that builds for `seconds`. */
  charge: (seconds: number, r: Rarity) => sfx.reactorCharge(seconds, rank(r)),
  /** Cut the drone (leaving the screen, skipping). */
  chargeStop: () => sfx.reactorChargeStop(),
  spark: () => sfx.reactorSpark(),
  alarm: (k: number) => sfx.reactorAlarm(k),
  inhale: () => sfx.reactorInhale(),
  /** The reactor bursts and the shell shows its colour. */
  blast: (r: Rarity) => {
    sfx.reactorBlast(rank(r));
    haptic(r === 'legendary' ? [60, 40, 60, 40, 120] : [8, 16, 40][rank(r)]);
  },
  zap: (r: Rarity) => sfx.reactorZap(rank(r)),
  slowmo: () => sfx.reactorSlowmo(),
  /** Legendary: time snaps back and the light beams shoot out. */
  beams: () => {
    sfx.reactorBeams();
    haptic(50);
  },
  /** Upgrade tease: the shell flares up into `r`. */
  upgrade: (r: Rarity) => {
    sfx.reactorUpgrade(rank(r));
    haptic(r === 'legendary' ? [60, 40, 60, 40, 120] : 30);
  },
  creak: (k: number) => sfx.reactorCreak(k),
  /** The shell breaks open: shatter plus the rarity fanfare. */
  shatter: (r: Rarity) => {
    sfx.reactorShatter(rank(r));
    sfx.reveal(r);
    if (r !== 'common') haptic(12);
  },
  reset: () => sfx.reactorReset(),
  /** A duplicate bursts into ducks. */
  burst: () => sfx.shopBurst(),
  /** A refunded duck lands in the counter. */
  duckIn: (i: number) => sfx.shopDuckIn(i),
};
