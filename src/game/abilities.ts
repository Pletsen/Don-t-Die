// Every skin has a special ability. Trigger it by tapping 4 times quickly:
// each tap turns 90° right away, so four quick taps spin you all the way round
// and you carry on in the same direction. The ability then runs for
// ABILITY_SECONDS. Once per level (in Survival it recharges).
//
// An ability is a recipe of simple building blocks, so new ones are easy to
// make by mixing them. Higher rarities mix more (and stronger) blocks.

export interface AbilityDef {
  name: string;
  /** Short description shown in the skins screen. */
  desc: string;
  /** Multiplies the speed of time (below 1 = slow motion). */
  slow?: number;
  /** Multiplies your forward speed. */
  speed?: number;
  /** Every turn inside a gate counts as PERFECT. */
  perfectAll?: boolean;
  /** Hazard hits absorbed before you'd die. */
  shield?: number;
  /** Extra lives: crash into anything and pop back onto the track. */
  revive?: number;
  /** Multiplies your size (and hitbox). */
  shrink?: number;
  /** Pulls ducks and the warp star in from this radius (px). */
  magnet?: number;
  /** Hazards stop moving and spinning. */
  freeze?: boolean;
  /** Hazards ahead slide out of your lane. */
  shy?: boolean;
  /** At a wall you turn automatically instead of crashing. */
  bounce?: boolean;
  /** The game makes perfect turns for you (taps are ignored). */
  autopilot?: boolean;
  /** Pass straight through hazards. */
  ghost?: boolean;
  /** Hazards you touch are destroyed. */
  smash?: boolean;
  /** Lasers destroy hazards ahead within this range (px). */
  laser?: number;
  /** Hazards within this radius are pulled in and swallowed. */
  vacuum?: number;
  /** Saws and bombs on screen turn into rubber ducks. */
  ducksFromHazards?: boolean;
  /** Each duck bonked counts this many times. */
  duckMult?: number;
  /** Word that pops up when a hazard is destroyed. */
  word?: string;
}

export const ABILITY_SECONDS = 10;
/** Survival: the ability recharges every this many metres after use. */
export const SURVIVAL_RECHARGE_M = 500;
/** Max time between the four taps, ms (also the wall grace during the spin). */
export const SPIN_TAP_WINDOW = 280;

export const ABILITIES: Record<string, AbilityDef> = {
  // Common: one simple effect.
  classic: { name: 'FOCUS', desc: 'Time slows down.', slow: 0.65 },
  mint: { name: 'COOL HEAD', desc: 'Every turn counts as PERFECT.', perfectAll: true },
  bubblegum: { name: 'BUBBLE', desc: 'A bubble pops instead of you. Once.', shield: 1, word: 'POP' },
  lemon: { name: 'SQUEEZE', desc: 'Squeezed to half size.', shrink: 0.55 },
  grape: { name: 'GRAPEVINE', desc: 'Vines pull in ducks and the warp star.', magnet: 170 },
  tangerine: { name: 'ZEST RUSH', desc: 'A juicy burst of speed.', speed: 1.35 },
  frosty: { name: 'DEEP FREEZE', desc: 'Hazards freeze solid. Time chills a little.', freeze: true, slow: 0.85 },
  blush: { name: 'SO SHY', desc: 'Hazards get shy and slide out of your way.', shy: true },
  moon: { name: 'ORBIT', desc: 'You swing round corners on your own.', bounce: true },
  potato: { name: 'COUCH POTATO', desc: 'The game plays itself. Slowly.', autopilot: true, speed: 0.6 },

  // Rare: a stronger effect, often two.
  kitty: { name: 'NINE LIVES', desc: 'Survive one crash. Any crash.', revive: 1 },
  froggy: { name: 'TONGUE', desc: 'Snatch ducks and stars from afar. Hop over hazards.', magnet: 280, ghost: true },
  panda: { name: 'BAMBOO BITE', desc: 'Eat any hazard you touch. Nom.', smash: true, slow: 0.85, word: 'NOM' },
  beachball: { name: 'BOUNCY', desc: 'Bounce off walls with extra speed.', bounce: true, speed: 1.25, shield: 1, word: 'BOING' },
  donut: { name: 'SUGAR RUSH', desc: 'Huge speed, and every turn is PERFECT.', speed: 1.5, perfectAll: true },
  soccer: { name: 'KICKOFF', desc: 'You get kicked! Walls are bumpers, hazards get booted.', bounce: true, speed: 2, smash: true, word: 'BOOT' },
  eyeball: { name: 'THIRD EYE', desc: 'Slow motion, and you see every perfect turn.', slow: 0.55, perfectAll: true },

  // Epic: unstoppable for ten seconds.
  lava: { name: 'MELTDOWN', desc: 'Hazards melt, walls bounce you, fire everywhere.', smash: true, bounce: true, speed: 1.3, word: 'MELT' },
  galaxy: { name: 'HYPERDRIVE', desc: 'Autopilot at light speed. Double ducks.', autopilot: true, speed: 2.2, smash: true, duckMult: 2, word: 'ZAP' },
  cyber: { name: 'TARGET LOCK', desc: 'Lasers delete every hazard ahead. Perfect turns.', laser: 320, perfectAll: true, bounce: true, word: 'DELETED' },
  pizza: { name: 'PIZZA PARTY', desc: 'Hazards turn into ducks and you pull them in.', ducksFromHazards: true, magnet: 220, duckMult: 2, bounce: true },

  // Legendary: everything, and it farms ducks.
  crown: {
    name: 'ROYAL DECREE',
    desc: 'Autopilot, all PERFECT, hazards bow and become ducks worth 3. Plus a spare life.',
    autopilot: true,
    perfectAll: true,
    ducksFromHazards: true,
    duckMult: 3,
    magnet: 260,
    speed: 1.4,
    revive: 1,
  },
  blackhole: {
    name: 'EVENT HORIZON',
    desc: 'Swallow everything near you: hazards, ducks and stars.',
    vacuum: 300,
    magnet: 300,
    autopilot: true,
    slow: 0.8,
    duckMult: 2,
    word: 'GULP',
  },
  duckking: {
    name: 'QUACK ARMY',
    desc: 'Every hazard becomes a duck, and they all come to you. Worth 3.',
    ducksFromHazards: true,
    magnet: 420,
    duckMult: 3,
    autopilot: true,
    speed: 1.5,
  },
};

export const abilityFor = (skinId: string): AbilityDef => ABILITIES[skinId] ?? ABILITIES.classic;
