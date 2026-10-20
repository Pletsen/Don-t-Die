import { save } from '../game/storage';
import { SampleBank, vary, type PlayOpts } from './samples';
import { vibrate } from '../native/bridge';

// Almost all sounds are synthesised live with the Web Audio API, so every
// sound can be tuned with a few numbers. The ducks are the exception: they use
// short real quack recordings from public/sfx/ (see CREDITS.md there), with
// the old synth quack as a fallback if the files can't be loaded.

interface ToneOpts {
  freq: number;
  glideTo?: number;
  duration?: number;
  type?: OscillatorType;
  gain?: number;
  delay?: number;
}

interface NoiseOpts {
  filterType?: BiquadFilterType;
  filterFreq?: number;
  duration?: number;
  gain?: number;
  rate?: number;
}

export const midiToFreq = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

/** A minor pentatonic: every note sounds good over the background music. */
const PENTATONIC = [69, 72, 74, 76, 79, 81, 84, 86];

/** The recorded duck sounds, in public/sfx/. */
const DUCK_FILES = {
  quack1: 'quack-1.mp3',
  quack2: 'quack-2.mp3',
  quack3: 'quack-3.mp3',
  red: 'quack-red.mp3',
  golden: 'quack-golden.mp3',
  blip: 'quack-blip.mp3',
  squeak: 'squeak.mp3',
};
type DuckSound = keyof typeof DUCK_FILES;
const QUACKS: DuckSound[] = ['quack1', 'quack2', 'quack3'];

/** Volume of each recording (the files are all normalised to the same loudness). */
const LEVEL = { quack: 0.75, red: 0.8, golden: 1, blip: 0.45, squeak: 0.3 };

class SfxEngine {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  noise: AudioBuffer | null = null;
  /** Called once when audio first becomes available (used to start the music). */
  onUnlock: (() => void) | null = null;
  private samples = new SampleBank(DUCK_FILES, `${import.meta.env.BASE_URL}sfx/`);
  private lastQuack = -1;

  /** Browsers only allow audio after a user gesture, so call this on the first tap. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = save.muted ? 0 : 0.55;

      // A gentle compressor glues overlapping sounds together.
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      this.master.connect(comp);
      comp.connect(this.ctx.destination);

      const len = Math.floor(this.ctx.sampleRate * 0.6);
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 1.5);

      // Fetch and decode the duck recordings once, in the background.
      void this.samples.load(this.ctx);

      // Pause all sound while the tab or app is in the background.
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) this.ctx?.suspend();
        else this.ctx?.resume();
      });
      this.onUnlock?.();
    } catch {
      this.ctx = null;
    }
  }

  setMuted(muted: boolean) {
    if (this.master) this.master.gain.value = muted ? 0 : 0.55;
  }

  private tone(o: ToneOpts) {
    if (!this.ctx || !this.master) return;
    const t0 = this.ctx.currentTime + (o.delay ?? 0);
    const dur = o.duration ?? 0.2;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(o.freq, t0);
    if (o.glideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.glideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(o.gain ?? 0.3, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  /**
   * A warm synth chord: detuned sawtooth voices through a low-pass filter
   * that closes quickly. Gives a deep "bwom" instead of a thin beep.
   */
  private stab(freqs: number[], dur: number, gain: number, cutoff: number, delay = 0) {
    if (!this.ctx || !this.master) return;
    const t0 = this.ctx.currentTime + delay;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 4;
    filter.frequency.setValueAtTime(cutoff, t0);
    filter.frequency.exponentialRampToValueAtTime(Math.max(80, cutoff * 0.15), t0 + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    filter.connect(g).connect(this.master);
    for (const f of freqs) {
      for (const detune of [-8, 8]) {
        const osc = this.ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = f;
        osc.detune.value = detune;
        osc.connect(filter);
        osc.start(t0);
        osc.stop(t0 + dur + 0.02);
      }
    }
  }

  /** A soft kick-drum style thump for weight. */
  private thump(freq = 110, gain = 0.3, dur = 0.16, delay = 0) {
    this.tone({ freq, glideTo: freq * 0.4, duration: dur, type: 'sine', gain, delay });
  }

  /** In the bonus universe some sounds turn silly. */
  party = false;

  private burst(o: NoiseOpts) {
    if (!this.ctx || !this.master || !this.noise) return;
    const t0 = this.ctx.currentTime;
    const dur = o.duration ?? 0.25;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = o.rate ?? 1;
    const filter = this.ctx.createBiquadFilter();
    filter.type = o.filterType ?? 'lowpass';
    filter.frequency.value = o.filterFreq ?? 1200;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(o.gain ?? 0.3, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter).connect(g).connect(this.master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  /**
   * Turning plays a soft pluck that walks up the pentatonic scale, so a run
   * of turns becomes a little melody in the same key as the music.
   */
  turn(step: number) {
    if (this.party) {
      // Cartoon "boing".
      this.tone({ freq: 140, glideTo: 520, duration: 0.18, type: 'sine', gain: 0.18 });
      this.thump(90, 0.2);
      return;
    }
    // Two octaves lower than before: a low note with a thump under it and a
    // soft "whoosh" for the change of direction.
    const f = midiToFreq(PENTATONIC[step % PENTATONIC.length] - 24);
    this.thump(95, 0.26, 0.14);
    this.stab([f], 0.22, 0.09, 1400);
    this.burst({ filterType: 'bandpass', filterFreq: 600, duration: 0.14, gain: 0.08, rate: 0.8 });
  }

  /** Bomb nearby: a dry tick that gets brighter the closer you are (0..1). */
  bombTick(closeness: number) {
    this.tone({ freq: 1400 + closeness * 900, duration: 0.03, type: 'square', gain: 0.025 + closeness * 0.03 });
  }

  /** Tapped a locked level. */
  denied() {
    this.tone({ freq: 180, duration: 0.09, type: 'square', gain: 0.05 });
    this.tone({ freq: 150, duration: 0.12, type: 'square', gain: 0.05, delay: 0.09 });
  }

  /** Screen change. */
  swoosh() {
    this.burst({ filterType: 'bandpass', filterFreq: 900, duration: 0.3, gain: 0.08, rate: 0.7 });
  }

  /** New sector colour in survival: a rising sweep. */
  sweep() {
    this.tone({ freq: 220, glideTo: 880, duration: 0.6, type: 'sawtooth', gain: 0.04 });
    this.burst({ filterType: 'highpass', filterFreq: 3000, duration: 0.6, gain: 0.05 });
  }

  // Quiet sounds for the background visitors.
  ufo() {
    for (let i = 0; i < 3; i++) this.tone({ freq: 900, glideTo: 500, duration: 0.22, type: 'sine', gain: 0.02, delay: i * 0.22 });
  }
  shimmer() {
    this.tone({ freq: 2600, glideTo: 1800, duration: 0.5, type: 'sine', gain: 0.012 });
  }
  whaleSong() {
    this.tone({ freq: 220, glideTo: 150, duration: 1.6, type: 'sine', gain: 0.035 });
    this.tone({ freq: 160, glideTo: 240, duration: 1.4, type: 'sine', gain: 0.025, delay: 1.2 });
  }

  /** Each combo step plays a higher note, so streaks sound like they climb. */
  perfect(combo: number) {
    const scale = [0, 3, 5, 7, 10, 12, 15, 17];
    const semis = scale[Math.min(combo - 1, scale.length - 1)];
    const root = 110 * Math.pow(2, semis / 12);
    // Deep chord stab (root, fifth, octave) with a sub-bass drop under it,
    // and only a light sparkle on top.
    this.stab([root, root * 1.5, root * 2], 0.45, 0.12, 2600);
    this.tone({ freq: root / 2, glideTo: root / 4, duration: 0.35, type: 'sine', gain: 0.3 });
    this.thump(120, 0.28, 0.2);
    this.tone({ freq: root * 8, duration: 0.12, type: 'sine', gain: 0.025, delay: 0.04 });
  }

  /** Hit the warp star: a huge rising sweep into a boom and a bright chord. */
  warp() {
    this.tone({ freq: 60, glideTo: 1200, duration: 0.9, type: 'sawtooth', gain: 0.07 });
    this.burst({ filterType: 'highpass', filterFreq: 1500, duration: 0.9, gain: 0.12, rate: 0.6 });
    this.thump(70, 0.45, 0.6, 0.85);
    this.stab([220, 277, 330, 440], 1.4, 0.1, 4000, 0.85);
    [0, 4, 7, 12, 16, 19].forEach((st, i) =>
      this.tone({ freq: 880 * Math.pow(2, st / 12), duration: 0.25, type: 'triangle', gain: 0.06, delay: 0.9 + i * 0.05 }),
    );
  }

  /** Plays a recording. Returns false if it isn't loaded, so the caller can use a synth sound. */
  private sample(name: DuckSound, o: PlayOpts) {
    if (!this.ctx || !this.master) return false;
    return this.samples.play(this.ctx, this.master, name, o);
  }

  /** Bonked a rubber duck. `pitch` above 1 for small ducks, below 1 for big ones. */
  quack(pitch = 1) {
    // One of three real quacks (never the same one twice in a row), with a
    // little random pitch and volume so a run of bonks doesn't sound robotic.
    let i = Math.floor(Math.random() * QUACKS.length);
    if (i === this.lastQuack) i = (i + 1) % QUACKS.length;
    const played = this.sample(QUACKS[i], { rate: pitch * vary(), gain: LEVEL.quack * vary(0.85, 1), group: 'quack', maxVoices: 3 });
    if (!played) {
      this.synthQuack(pitch);
      return;
    }
    this.lastQuack = i;
    // Now and then the rubber duck squeaks as it gets bonked.
    if (Math.random() < 0.25) {
      this.sample('squeak', { rate: vary(0.9, 1.15), gain: LEVEL.squeak * vary(0.8, 1), delay: 0.02, group: 'squeak', maxVoices: 2 });
    }
  }

  /** The old synthesised quack, used if the recordings didn't load. */
  private synthQuack(pitch: number) {
    if (!this.ctx || !this.master) return;
    for (const d of [0, 0.11]) {
      const t0 = this.ctx.currentTime + d;
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(620 * pitch, t0);
      osc.frequency.exponentialRampToValueAtTime(380 * pitch, t0 + 0.1);
      const formant = this.ctx.createBiquadFilter();
      formant.type = 'bandpass';
      formant.frequency.value = 1100;
      formant.Q.value = 3;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.22, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.1);
      osc.connect(formant).connect(g).connect(this.master);
      osc.start(t0);
      osc.stop(t0 + 0.12);
    }
  }

  // --- Special ducks ------------------------------------------------------

  /** Caught the red duck: an excited "rap-rap-rap" with a bright little jingle. */
  redDuck() {
    const real = this.sample('red', { rate: vary(0.96, 1.06), gain: LEVEL.red, group: 'red', maxVoices: 2 });
    if (!real) this.synthQuack(1.3);
    [0, 4, 7, 12].forEach((st, i) =>
      this.tone({ freq: 784 * Math.pow(2, st / 12), duration: 0.16, type: 'triangle', gain: real ? 0.07 : 0.09, delay: 0.1 + i * 0.05 }),
    );
  }

  /** A missed red duck runs off up the track, laughing. */
  duckEscape() {
    if (!this.sample('red', { rate: 1.2 * vary(0.97, 1.03), gain: LEVEL.red * 0.7, group: 'red', maxVoices: 2 })) this.synthQuack(1.5);
    this.tone({ freq: 900, glideTo: 1600, duration: 0.25, type: 'triangle', gain: 0.05, delay: 0.2 });
  }

  /** The golden duck: one huge, deep quack over a fanfare into DUCK FRENZY. */
  frenzyStart() {
    const real = this.sample('golden', { rate: vary(0.97, 1.03), gain: LEVEL.golden, group: 'golden', maxVoices: 1 });
    if (!real) this.synthQuack(0.6);
    // With the recording, the fanfare sits quieter underneath it and the
    // arpeggio starts a little later, so the quack is heard first.
    const f = real ? 0.5 : 1;
    this.thump(60, 0.5 * f, 0.7, 0.1);
    this.stab([196, 247, 294, 392], 1.2, 0.12 * f, 5000, 0.1);
    [0, 4, 7, 12, 16, 19, 24].forEach((st, i) =>
      this.tone({ freq: 523 * Math.pow(2, st / 12), duration: 0.22, type: 'square', gain: 0.05 * f, delay: (real ? 0.3 : 0.15) + i * 0.06 }),
    );
    this.burst({ filterType: 'highpass', filterFreq: 3000, duration: 1.2, gain: 0.1 * f });
  }

  /** One frenzy tap: a short quack that climbs with the count. */
  frenzyTap(count: number) {
    // Rises about an octave over the frenzy, with a small up-down wiggle so
    // fast taps sound like a tune. At most 3 blips sound at once.
    const semis = Math.min(10, count * 0.18) + [0, 2, 4, 2, 0][count % 5];
    const rate = 0.9 * Math.pow(2, semis / 12) * vary(0.98, 1.02);
    if (!this.sample('blip', { rate, gain: LEVEL.blip * vary(0.85, 1), group: 'blip', maxVoices: 3 })) {
      const scale = [0, 2, 4, 7, 9];
      const step = count % scale.length;
      const oct = Math.min(3, Math.floor(count / 15));
      const freq = 330 * Math.pow(2, (scale[step] + oct * 12) / 12);
      this.tone({ freq, duration: 0.07, type: 'square', gain: 0.045 });
    }
    if (count % 5 === 0) this.thump(130, 0.18, 0.08);
  }

  /** Frenzy over: the ducks are counted in. */
  frenzyEnd(count: number) {
    const big = count >= 50;
    this.stab([262, 330, 392, 523], 0.9, 0.12, 4000);
    this.thump(70, 0.4, 0.4);
    if (big) this.reveal('legendary');
  }

  // --- Skin abilities -----------------------------------------------------

  /** Ability on: a rising power-up, bigger for rarer skins. */
  ability(rarity: 'common' | 'rare' | 'epic' | 'legendary') {
    const top = { common: 2, rare: 3, epic: 4, legendary: 6 }[rarity];
    this.tone({ freq: 110, glideTo: 440 * top, duration: 0.45, type: 'sawtooth', gain: 0.06 });
    this.thump(80, 0.35, 0.3);
    this.stab([220, 330, 440], 0.6, 0.1, 3500, 0.2);
    if (rarity === 'epic' || rarity === 'legendary') this.burst({ filterType: 'highpass', filterFreq: 2500, duration: 0.8, gain: 0.08 });
  }

  /** Ability off: a falling sweep. */
  powerDown() {
    this.tone({ freq: 660, glideTo: 110, duration: 0.5, type: 'triangle', gain: 0.1 });
  }

  /** A hazard destroyed by an ability. */
  smash() {
    this.thump(120, 0.3, 0.14);
    this.burst({ filterType: 'bandpass', filterFreq: 1400, duration: 0.18, gain: 0.18 });
  }

  laser() {
    this.tone({ freq: 1800, glideTo: 300, duration: 0.14, type: 'square', gain: 0.05 });
  }

  pop() {
    this.tone({ freq: 500, glideTo: 1400, duration: 0.07, type: 'sine', gain: 0.25 });
    this.burst({ filterType: 'highpass', filterFreq: 3000, duration: 0.08, gain: 0.12 });
  }

  boing() {
    this.tone({ freq: 160, glideTo: 480, duration: 0.2, type: 'sine', gain: 0.18 });
  }

  /** An extra life saved you. */
  revive() {
    [0, 7, 12, 19].forEach((st, i) =>
      this.tone({ freq: 392 * Math.pow(2, st / 12), duration: 0.2, type: 'triangle', gain: 0.12, delay: i * 0.05 }),
    );
  }

  // --- Slot machine -------------------------------------------------------

  leverPull() {
    this.burst({ filterType: 'lowpass', filterFreq: 700, duration: 0.18, gain: 0.25 });
    this.tone({ freq: 300, glideTo: 120, duration: 0.2, type: 'square', gain: 0.05 });
    this.thump(80, 0.3, 0.2, 0.12);
  }

  /** Reels whirring past. */
  spinTick() {
    this.tone({ freq: 1800 + Math.random() * 300, duration: 0.025, type: 'square', gain: 0.03 });
  }

  /** A reel clunks to a stop; each one a little higher. */
  reelStop(index: number) {
    this.thump(140, 0.3, 0.12);
    this.stab([220 * Math.pow(2, (index * 4) / 12)], 0.2, 0.08, 1800);
  }

  /** Prize reveal: bigger fanfares for rarer skins. */
  reveal(rarity: 'common' | 'rare' | 'epic' | 'legendary') {
    const steps = { common: [0, 7], rare: [0, 4, 7], epic: [0, 4, 7, 12], legendary: [0, 4, 7, 12, 16, 19, 24] }[rarity];
    steps.forEach((st, i) =>
      this.tone({ freq: 523 * Math.pow(2, st / 12), duration: 0.28, type: 'triangle', gain: 0.12, delay: i * 0.08 }),
    );
    if (rarity !== 'common') this.stab([131, 196, 262], 0.8, 0.1, 3000, steps.length * 0.08);
    if (rarity === 'epic' || rarity === 'legendary') this.thump(60, 0.45, 0.6, steps.length * 0.08);
    if (rarity === 'legendary') {
      this.burst({ filterType: 'highpass', filterFreq: 4000, duration: 1.5, gain: 0.1 });
      this.stab([262, 330, 392, 523], 1.6, 0.1, 5000, 0.8);
    }
  }

  /** Not enough ducks. */
  nope() {
    this.denied();
  }

  // --- DUCK-O-MATIC (called through src/ui/shopSfx.ts) --------------------

  /** A duck drops into the coin slot: a short metallic clink, rising. */
  shopCoin(i: number) {
    const f = 1568 * Math.pow(2, (i % 6) / 12);
    this.tone({ freq: f, duration: 0.05, type: 'square', gain: 0.025 });
    this.tone({ freq: f * 1.5, duration: 0.09, type: 'triangle', gain: 0.03, delay: 0.015 });
  }

  /** The last reel creeps: a rising shimmer that builds suspense. */
  shopTease() {
    this.tone({ freq: 392, glideTo: 784, duration: 0.45, type: 'triangle', gain: 0.05 });
    this.burst({ filterType: 'highpass', filterFreq: 4000, duration: 0.4, gain: 0.03 });
  }

  /** Three reels down: the payline flashes. */
  shopWin() {
    [0, 4, 7].forEach((st, i) => this.tone({ freq: 659 * Math.pow(2, st / 12), duration: 0.14, type: 'triangle', gain: 0.07, delay: i * 0.05 }));
    this.thump(110, 0.2, 0.12);
  }

  /** The capsule jumps out of the machine. */
  shopCapsule() {
    this.tone({ freq: 220, glideTo: 660, duration: 0.18, type: 'sine', gain: 0.12 });
  }

  /** Each shake of the capsule: a knock, higher every time. */
  shopShake(i: number) {
    this.thump(160 + i * 30, 0.22, 0.08);
    this.tone({ freq: 880 + i * 120, duration: 0.05, type: 'square', gain: 0.02 });
  }

  /** The capsule pops open. */
  shopPop() {
    this.burst({ filterType: 'bandpass', filterFreq: 1800, duration: 0.12, gain: 0.18 });
    this.thump(90, 0.3, 0.15);
  }

  /** A duplicate bursts into ducks. */
  shopBurst() {
    this.quack(1.25);
    this.burst({ filterType: 'highpass', filterFreq: 2500, duration: 0.25, gain: 0.06 });
  }

  /** A refunded duck lands in the counter. */
  shopDuckIn(i: number) {
    this.coin(i);
  }

  /** A duck lands in the counter: a bright little blip that climbs. */
  coin(i: number) {
    this.tone({ freq: 1046 * Math.pow(2, Math.min(i, 12) / 24), duration: 0.07, type: 'triangle', gain: 0.05 });
  }

  /** A gentle sparkle when the warp star is close. */
  starNear() {
    this.tone({ freq: 2093, duration: 0.2, type: 'sine', gain: 0.03 });
    this.tone({ freq: 2637, duration: 0.2, type: 'sine', gain: 0.02, delay: 0.06 });
  }

  near() {
    this.burst({ filterType: 'highpass', filterFreq: 3200, duration: 0.05, gain: 0.16 });
  }

  hazard() {
    this.burst({ filterType: 'bandpass', filterFreq: 900, duration: 0.35, gain: 0.34 });
    this.tone({ freq: 180, glideTo: 40, duration: 0.35, type: 'sawtooth', gain: 0.25 });
  }

  death() {
    this.burst({ filterType: 'lowpass', filterFreq: 1400, duration: 0.45, gain: 0.5 });
    this.tone({ freq: 140, glideTo: 30, duration: 0.45, type: 'sawtooth', gain: 0.3 });
  }

  start() {
    this.tone({ freq: 220, glideTo: 880, duration: 0.25, type: 'triangle', gain: 0.14 });
  }

  /** Finish line: a bright rising arpeggio. */
  clear() {
    [0, 4, 7, 12, 16].forEach((st, i) =>
      this.tone({ freq: 523 * Math.pow(2, st / 12), duration: 0.22, type: 'triangle', gain: 0.14, delay: i * 0.06 }),
    );
    this.burst({ filterType: 'highpass', filterFreq: 5000, duration: 0.5, gain: 0.08 });
  }

  /** One chime per star; later stars ring higher. */
  star(index: number) {
    const f = 1046 * Math.pow(2, [0, 4, 7][Math.min(index, 2)] / 12);
    this.tone({ freq: f, duration: 0.3, type: 'sine', gain: 0.22 });
    this.tone({ freq: f * 2, duration: 0.18, type: 'triangle', gain: 0.06, delay: 0.02 });
  }

  click() {
    this.tone({ freq: 880, glideTo: 1320, duration: 0.05, type: 'triangle', gain: 0.08 });
  }

  newBest() {
    [0, 4, 7, 12].forEach((s, i) =>
      this.tone({ freq: 660 * Math.pow(2, s / 12), duration: 0.18, type: 'triangle', gain: 0.12, delay: i * 0.07 }),
    );
  }
}

export const sfx = new SfxEngine();

export function haptic(pattern: number | number[]) {
  if (save.fxReduced) return;
  // Native haptics in the app (iPhones ignore navigator.vibrate), else the browser's.
  vibrate(pattern);
}
