import { sfx } from './Sfx';
import { SampleBank, vary } from './samples';
import type { Rarity } from '../game/skins';

// Every skin has its own signature sound: the frog croaks, the kitty meows,
// the lava sizzles, the crown gets a fanfare. Each skin has two takes in
// public/sfx/skins/ (sources in public/sfx/CREDITS.md):
//
//   <id>.mp3        "hello": short and quiet. A run starts with the skin, or
//                   it's picked in the skins screen or comes out of the
//                   QUACK REACTOR.
//   <id>-power.mp3  "power": a fuller take, on top of the power-up whoosh,
//                   when the 4-tap super power fires.
//
// Files are only fetched when a skin first needs them (the worn skin, and
// whatever gets tapped in the shop), and they play through sfx.playFrom, the
// same output as the duck quacks, so mute applies to them as well.

/** Every skin with a voice. */
const VOICED = new Set([
  // Common
  'classic', 'mint', 'bubblegum', 'lemon', 'grape', 'tangerine', 'frosty', 'blush', 'moon', 'potato',
  'melon', 'cookie', 'cherry', 'marble', 'tennis', 'eightball', 'egg', 'pumpkin',
  // Rare
  'kitty', 'froggy', 'panda', 'beachball', 'donut', 'soccer', 'eyeball', 'bee', 'disco', 'ghost',
  'owl', 'penguin', 'robot', 'hamster', 'bunny', 'octopus',
  // Epic
  'lava', 'galaxy', 'cyber', 'pizza', 'plasma', 'fishbowl', 'ufo', 'ninja', 'dragon', 'storm',
  // Legendary
  'crown', 'blackhole', 'duckking', 'phoenix', 'unicorn', 'supernova',
]);

/** Volume of each use. The files are loudness-matched to the duck quacks (which play at 0.75). */
const LEVEL = { run: 0.5, preview: 0.6, reveal: 0.65, power: 0.85 };

/**
 * The run-start hello always plays on the first run with a skin (after a
 * switch, or the first run of the session). After that it stays quiet for at
 * least QUIET_RUNS runs and then comes back with HELLO_CHANCE per run, so on
 * the 50th retry it's a rare little reminder, not a jingle you learn to hate.
 */
const QUIET_RUNS = 3;
const HELLO_CHANCE = 1 / 6;

/** In the shop reveal the voice waits for the rarity fanfare's arpeggio (see sfx.reveal). */
const REVEAL_DELAY: Record<Rarity, number> = { common: 0.3, rare: 0.36, epic: 0.42, legendary: 0.55 };

/** A take still loading after this many seconds past its cue is dropped instead of playing late. */
const MAX_LATE = 0.5;

type Take = 'hello' | 'power';

interface Voice {
  bank: SampleBank<Take>;
  ready: Promise<void>;
}

const voices = new Map<string, Voice>();
let lastRunSkin: string | null = null;
let quietRuns = 0;

/** The skin's bank, loading it on first use. Null before audio is unlocked or for a skin without a voice. */
function voiceFor(id: string): Voice | null {
  if (!VOICED.has(id) || !sfx.ctx) return null;
  let v = voices.get(id);
  if (!v) {
    const bank = new SampleBank<Take>({ hello: `${id}.mp3`, power: `${id}-power.mp3` }, `${import.meta.env.BASE_URL}sfx/skins/`);
    v = { bank, ready: bank.load(sfx.ctx) };
    voices.set(id, v);
  }
  return v;
}

function say(id: string, take: Take, gain: number, delay = 0) {
  const v = voiceFor(id);
  if (!v) return;
  const asked = performance.now();
  const go = () => {
    const late = (performance.now() - asked) / 1000;
    if (late > delay + MAX_LATE) return;
    sfx.playFrom(v.bank, take, {
      rate: vary(0.98, 1.02),
      gain: gain * vary(0.9, 1),
      delay: Math.max(0, delay - late),
      group: 'voice',
      maxVoices: 2,
    });
  };
  if (v.bank.has(take)) go();
  else void v.ready.then(go);
}

export const skinVoices = {
  /** A run starts with this skin. */
  runStart(id: string) {
    const fresh = id !== lastRunSkin;
    lastRunSkin = id;
    if (fresh || (quietRuns >= QUIET_RUNS && Math.random() < HELLO_CHANCE)) {
      quietRuns = 0;
      say(id, 'hello', LEVEL.run, 0.05);
    } else {
      quietRuns++;
    }
  },

  /** The super power fires (plays over sfx.ability's whoosh). */
  power(id: string) {
    say(id, 'power', LEVEL.power, 0.04);
  },

  /** Picked or previewed in the skins screen. */
  preview(id: string) {
    say(id, 'hello', LEVEL.preview);
  },

  /** A new skin pops out of the QUACK REACTOR. */
  reveal(id: string, rarity: Rarity) {
    say(id, 'hello', LEVEL.reveal, REVEAL_DELAY[rarity]);
  },

  /** Start loading a skin's sounds ahead of time (no-op before audio is unlocked). */
  prepare(id: string) {
    voiceFor(id);
  },

  /** For tests: the skins whose files have been requested, and how many takes are decoded. */
  get loaded() {
    return [...voices].map(([id, v]) => ({ id, takes: v.bank.loadedCount }));
  },
};
