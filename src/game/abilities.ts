// Every skin has a special ability. Trigger it by tapping 4 times quickly:
// each tap turns 90° right away, so four quick taps spin you all the way round
// and you carry on in the same direction. The ability then runs for
// ABILITY_SECONDS. Once per level (in Survival it recharges).
//
// An ability is a recipe of simple building blocks, so new ones are easy to
// make by mixing them. The rarity sets the budget (tested with the bot, see
// README):
//   common    one mild effect
//   rare      one strong effect, or two mild ones
//   epic      strong and flashy, but you can still die
//   legendary spectacular and the best, but you still play: only one uses
//             autopilot, and nothing makes you unkillable
// Ducks stay sane too: at most about 2x / 2x / 3x / 4x the ducks you'd bonk
// without a power on the same stretch.

/** A shot an ability fires by itself at the hazards ahead. */
export interface Zap {
  /** The look: laser, tesla arc, tractor beam, shuriken, fire breath, lightning bolt, cherry pit. */
  kind: 'laser' | 'arc' | 'beam' | 'star' | 'fire' | 'bolt' | 'pit';
  /** Reach, px. */
  range: number;
  /** Seconds between shots. */
  every: number;
  /** Shots in total (unlimited if left out). */
  ammo?: number;
  /** Only hazards in your path (fire breath, pits); otherwise anything ahead. */
  lane?: boolean;
  /** Any direction, not only ahead (tesla arcs). */
  around?: boolean;
}

export interface AbilityDef {
  name: string;
  /** Short description shown in the skins screen. */
  desc: string;
  /** Multiplies the speed of time (below 1 = slow motion). */
  slow?: number;
  /** Time runs this much slower while you're in a corner square. */
  cornerSlow?: number;
  /** Saws and bombs move (and tick) this much slower; you don't. */
  hazardSlow?: number;
  /** Multiplies your forward speed. */
  speed?: number;
  /** Every turn inside a gate counts as PERFECT. */
  perfectAll?: boolean;
  /** A tap a moment too early waits and turns you as you reach the corner. */
  forgive?: boolean;
  /** Marks the safe spot to turn in every corner. */
  guide?: boolean;
  /** Hazard hits absorbed before you'd die. */
  shield?: number;
  /** After a shield hit, hazards can't hurt you for this long (s). */
  shieldGrace?: number;
  /** Hop clean over this many hazards (they stay where they are). */
  hop?: number;
  /** Extra lives: crash into anything and pop back onto the track. */
  revive?: number;
  /** Multiplies your size (and hitbox). */
  shrink?: number;
  /** Pulls ducks in from this radius (px). The warp star only comes from close by. */
  magnet?: number;
  /** Hazards stop moving and spinning. */
  freeze?: boolean;
  /** Hazards ahead on your straight slide out of your path. */
  shy?: boolean;
  /** At a wall you turn automatically instead of crashing. */
  bounce?: boolean;
  /** The game turns for you, on the safe line (taps are ignored). */
  autopilot?: boolean;
  /** Pass straight through hazards. */
  ghost?: boolean;
  /** Hazards you touch are destroyed. */
  smash?: boolean;
  /** Shots at the hazards ahead (see Zap). */
  zap?: Zap;
  /** Splat ink on hazards ahead within this range: they stop, shrink and fizzle out for good. */
  ink?: number;
  /** Every `every` s you blow up: hazards within `radius` are destroyed. */
  nova?: { every: number; radius: number };
  /** Hazards within this radius are pulled in and swallowed. */
  vacuum?: number;
  /** This many hazards (the next ones on screen) turn into rubber ducks. */
  ducksFromHazards?: number;
  /** Each duck you bonk joins your army: it takes a hit for you (up to 3 at once). */
  army?: boolean;
  /** Each duck bonked counts this many times. */
  duckMult?: number;
  /** Word that pops up when a hazard is destroyed. */
  word?: string;
}

export const ABILITY_SECONDS = 10;
/** Survival: the ability recharges this many metres after it ended... */
export const SURVIVAL_RECHARGE_M = 500;
/** ...and at least this many seconds after the ability ended. */
export const SURVIVAL_RECHARGE_S = 30;
/** Max time between the four taps, ms (also the wall grace during the spin). */
export const SPIN_TAP_WINDOW = 280;
/** `forgive`: how early (s) a tap may come and still wait for the corner. */
export const FORGIVE_S = 0.22;
/** A magnet pulls the warp star only from this close (px): it stays a skill shot. */
export const STAR_PULL = 34;
/** The army never holds more than this many guards at once. */
export const ARMY_MAX = 3;

export const ABILITIES: Record<string, AbilityDef> = {
  // Common: one mild effect.
  classic: { name: 'FOCUS', desc: 'Time slows down.', slow: 0.65 },
  mint: { name: 'COOL HEAD', desc: 'No panic: a tap a moment early waits for the corner. Every turn is PERFECT.', forgive: true, perfectAll: true },
  bubblegum: { name: 'BUBBLE', desc: 'A bubble pops instead of you. Once.', shield: 1, word: 'POP' },
  lemon: { name: 'SQUEEZE', desc: 'Squeezed to half size: slip past hazards.', shrink: 0.5 },
  grape: { name: 'GRAPEVINE', desc: 'Vines pull in ducks (and the warp star, if you pass close).', magnet: 130 },
  tangerine: { name: 'ZEST RUSH', desc: 'So juiced up that saws and bombs crawl at half speed.', hazardSlow: 0.5 },
  frosty: { name: 'DEEP FREEZE', desc: 'Hazards freeze solid. Time chills a little.', freeze: true, slow: 0.85 },
  blush: { name: 'SO SHY', desc: 'Hazards on your straight get shy and slide out of your path.', shy: true },
  moon: { name: 'ORBIT', desc: 'Miss a corner and you swing round it anyway.', bounce: true },
  potato: { name: 'COUCH POTATO', desc: 'The game plays itself. Slowly. Hazards? Not its problem.', autopilot: true, speed: 0.6 },
  melon: { name: 'THICK RIND', desc: 'A tough rind takes two hits for you.', shield: 2, word: 'SPLAT' },
  cookie: { name: 'CRUMBS', desc: 'Every duck counts double.', duckMult: 2 },
  cherry: { name: 'CHERRY PIT', desc: 'Spit pits at the next two hazards in your path.', zap: { kind: 'pit', range: 230, every: 0.4, ammo: 2, lane: true }, word: 'PTOO' },
  marble: { name: 'SLOW ROLL', desc: 'Time slows right down in every corner.', cornerSlow: 0.45 },
  tennis: { name: 'TOPSPIN', desc: 'Bounce clean over the next two hazards.', hop: 2 },
  eightball: { name: 'OUTLOOK GOOD', desc: 'The 8-ball marks the safe spot to turn in every corner.', guide: true },
  egg: { name: 'EGGSHELL', desc: 'A hazard only cracks your shell, and you\'re safe for a second.', shield: 1, shieldGrace: 1.2, word: 'CRACK' },
  pumpkin: { name: 'TRICK OR TREAT', desc: 'The next two hazards turn into ducks.', ducksFromHazards: 2 },

  // Rare: a strong effect, or two mild ones.
  kitty: { name: 'NINE LIVES', desc: 'Survive one crash. Any crash.', revive: 1 },
  froggy: { name: 'TONGUE', desc: 'Hop through hazards and snatch ducks from afar.', ghost: true, magnet: 150 },
  panda: { name: 'BAMBOO BITE', desc: 'Eat any hazard you touch. Nom.', smash: true, slow: 0.85, word: 'NOM' },
  beachball: { name: 'BOUNCY', desc: 'Bounce off walls round corners, and off two hazards.', bounce: true, shield: 2, word: 'BOING' },
  donut: { name: 'SUGAR RUSH', desc: 'Hyper! Crash through hazards, every turn PERFECT.', speed: 1.25, smash: true, perfectAll: true, word: 'CRUNCH' },
  soccer: { name: 'KICKOFF', desc: 'Walls are bumpers, hazards get booted.', bounce: true, smash: true, word: 'BOOT' },
  eyeball: { name: 'THIRD EYE', desc: 'Slow motion, and every turn is PERFECT.', slow: 0.6, perfectAll: true },
  bee: { name: 'STING', desc: 'Sting the next three hazards ahead. Pollen pulls in ducks.', zap: { kind: 'star', range: 260, every: 0.35, ammo: 3 }, magnet: 110, word: 'BZZT' },
  disco: { name: 'DANCE FLOOR', desc: 'Hazards dance out of your path. Every turn is PERFECT.', shy: true, perfectAll: true, slow: 0.85 },
  ghost: { name: 'SPOOKY', desc: 'Float straight through hazards. Boo!', ghost: true, slow: 0.85 },
  owl: { name: 'NIGHT VISION', desc: 'See the safe spot in every corner. Time slows a little.', guide: true, slow: 0.8 },
  penguin: { name: 'BELLY SLIDE', desc: 'Flop down to half size. Hazards freeze in the cold.', shrink: 0.6, freeze: true },
  robot: { name: 'AUTO-CORRECT', desc: 'Early taps wait for the corner, late ones bounce round it.', forgive: true, bounce: true },
  hamster: { name: 'HAMSTER BALL', desc: 'The ball takes three bumps for you.', shield: 3, word: 'BUMP' },
  bunny: { name: 'BUNNY HOP', desc: 'Hop over the next three hazards. Ducks hop to you.', hop: 3, magnet: 110 },
  octopus: { name: 'INK CLOUD', desc: 'Ink the hazards ahead: they stop, shrink and fizzle. Tentacles grab ducks.', ink: 260, magnet: 120 },

  // Epic: strong and flashy, but you can still die.
  lava: { name: 'MELTDOWN', desc: 'Hazards melt on touch, walls bounce you.', smash: true, bounce: true, speed: 1.15, word: 'MELT' },
  galaxy: { name: 'HYPERDRIVE', desc: 'Light speed: hazards ahead vaporise, every turn PERFECT.', speed: 1.4, smash: true, perfectAll: true, word: 'ZAP' },
  cyber: { name: 'TARGET LOCK', desc: 'Lasers delete hazards ahead. Every turn is PERFECT.', zap: { kind: 'laser', range: 300, every: 0.3 }, perfectAll: true, word: 'DELETED' },
  pizza: { name: 'PIZZA PARTY', desc: 'The next three hazards turn into ducks and fly to you. Walls bounce you.', ducksFromHazards: 3, magnet: 150, bounce: true },
  plasma: { name: 'TESLA STORM', desc: 'Arcs zap hazards all round you. Static pulls in ducks.', zap: { kind: 'arc', range: 170, every: 0.35, around: true }, magnet: 130, word: 'ZAPPED' },
  fishbowl: { name: 'TIDAL WAVE', desc: 'A wave washes hazards out of your path. Bubbles take a hit.', shy: true, shield: 1, magnet: 130, word: 'SPLASH' },
  ufo: { name: 'ABDUCTION', desc: 'A tractor beam abducts hazards ahead, and beams ducks up.', zap: { kind: 'beam', range: 280, every: 0.7 }, magnet: 150, word: 'BEAMED' },
  ninja: { name: 'SHURIKEN', desc: 'Six shurikens cut down the hazards ahead. Every turn is PERFECT.', zap: { kind: 'star', range: 320, every: 0.25, ammo: 6 }, perfectAll: true, word: 'SLICE' },
  dragon: { name: 'FIRE BREATH', desc: 'Breathe fire: hazards in your path burn. Tough scales take a hit.', zap: { kind: 'fire', range: 170, every: 0.12, lane: true }, shield: 1, word: 'TOAST' },
  storm: { name: 'THUNDER', desc: 'Lightning strikes the hazards ahead. Gusts blow you round corners.', zap: { kind: 'bolt', range: 380, every: 0.55 }, bounce: true, word: 'KZZAK' },

  // Legendary: spectacular, but you still play.
  crown: {
    name: 'ROYAL DECREE',
    desc: 'Hazards bow out of your path, the guard takes a hit, every turn PERFECT, ducks count double.',
    shy: true,
    shield: 1,
    perfectAll: true,
    duckMult: 2,
    word: 'BOW',
  },
  blackhole: {
    name: 'EVENT HORIZON',
    desc: 'Swallow every hazard near you. Time bends, ducks fall in.',
    vacuum: 240,
    magnet: 170,
    slow: 0.8,
    word: 'GULP',
  },
  duckking: {
    name: 'QUACK ARMY',
    desc: 'The next four hazards turn into ducks. Every duck you bonk guards you from a hit.',
    ducksFromHazards: 4,
    army: true,
    magnet: 170,
  },
  phoenix: {
    name: 'REBIRTH',
    desc: 'Fly the safe line on autopilot, all PERFECT. Rise again from one crash.',
    autopilot: true,
    perfectAll: true,
    speed: 1.2,
    revive: 1,
  },
  unicorn: {
    name: 'RAINBOW ROAD',
    desc: 'Your horn pierces hazards, early taps wait for the corner, every turn PERFECT.',
    smash: true,
    forgive: true,
    perfectAll: true,
    magnet: 140,
    word: 'SPARKLE',
  },
  supernova: {
    name: 'SUPERNOVA',
    desc: 'Every 1.5 s you explode, wiping out every hazard nearby.',
    nova: { every: 1.5, radius: 230 },
    slow: 0.9,
    word: 'NOVA',
  },
};

export const abilityFor = (skinId: string): AbilityDef => ABILITIES[skinId] ?? ABILITIES.classic;
