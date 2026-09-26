import { sfx, midiToFreq } from './Sfx';

// Calm background music, generated live. A slow A-minor progression
// (Am, F, C, G, two bars each) played as soft pads, a deep bass and a sparse
// plucked arpeggio with echo. While you play, the filter opens a little and a
// faint hi-hat joins in; on death the music dips for a moment.

const BPM = 84;
const STEP = 60 / BPM / 2; // eighth notes
const STEPS_PER_CHORD = 16; // two bars of 4/4
const VOLUME = 0.3;

interface Chord {
  pad: number[];
  bass: number;
  arp: number[];
}

const CHORDS: Chord[] = [
  { pad: [57, 60, 64], bass: 45, arp: [69, 72, 76, 81] }, // Am
  { pad: [57, 60, 65], bass: 41, arp: [69, 72, 77, 81] }, // F
  { pad: [55, 60, 64], bass: 48, arp: [67, 72, 76, 79] }, // C
  { pad: [55, 59, 62], bass: 43, arp: [67, 71, 74, 79] }, // G
];

class MusicEngine {
  private ctx: AudioContext | null = null;
  private bus: GainNode | null = null;
  private padFilter: BiquadFilterNode | null = null;
  private echo: GainNode | null = null;
  private nextTime = 0;
  private step = 0;
  private energy = 0;

  constructor() {
    sfx.onUnlock = () => this.start();
  }

  private start() {
    const ctx = sfx.ctx;
    if (!ctx || !sfx.master || this.ctx) return;
    this.ctx = ctx;

    this.bus = ctx.createGain();
    this.bus.gain.setValueAtTime(0, ctx.currentTime);
    this.bus.gain.linearRampToValueAtTime(VOLUME, ctx.currentTime + 4); // fade in
    this.bus.connect(sfx.master);

    this.padFilter = ctx.createBiquadFilter();
    this.padFilter.type = 'lowpass';
    this.padFilter.frequency.value = 700;
    this.padFilter.Q.value = 0.5;
    this.padFilter.connect(this.bus);

    // Echo: a delay that feeds back into itself, fading each repeat.
    const delay = ctx.createDelay(2);
    delay.delayTime.value = STEP * 3;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.38;
    const wet = ctx.createGain();
    wet.gain.value = 0.35;
    delay.connect(feedback).connect(delay);
    delay.connect(wet).connect(this.bus);
    this.echo = ctx.createGain();
    this.echo.connect(delay);

    this.nextTime = ctx.currentTime + 0.1;
    // Schedule notes slightly ahead of time; timers alone are too jittery.
    setInterval(() => this.schedule(), 60);
  }

  /** 0 in menus, 1 while playing. */
  setEnergy(e: number) {
    this.energy = e;
    if (this.ctx && this.padFilter) {
      this.padFilter.frequency.setTargetAtTime(700 + e * 700, this.ctx.currentTime, 1.5);
    }
  }

  /** Dip the volume briefly (on death). */
  duck() {
    if (!this.ctx || !this.bus) return;
    const t = this.ctx.currentTime;
    this.bus.gain.cancelScheduledValues(t);
    this.bus.gain.setValueAtTime(this.bus.gain.value, t);
    this.bus.gain.linearRampToValueAtTime(VOLUME * 0.25, t + 0.15);
    this.bus.gain.linearRampToValueAtTime(VOLUME, t + 2.5);
  }

  private schedule() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    // Catch up after the tab was hidden instead of playing a burst of notes.
    if (this.nextTime < this.ctx.currentTime - 0.5) this.nextTime = this.ctx.currentTime + 0.05;
    while (this.nextTime < this.ctx.currentTime + 0.3) {
      this.playStep(this.step, this.nextTime);
      this.nextTime += STEP;
      this.step++;
    }
  }

  private playStep(i: number, t: number) {
    const chord = CHORDS[Math.floor(i / STEPS_PER_CHORD) % CHORDS.length];
    const within = i % STEPS_PER_CHORD;

    if (within === 0) chord.pad.forEach((m) => this.pad(midiToFreq(m), t, STEPS_PER_CHORD * STEP));
    if (within === 0 || within === 8) this.bass(midiToFreq(chord.bass - 12), t, STEP * 7);

    const arpChance = within % 2 === 0 ? 0.5 + this.energy * 0.2 : this.energy * 0.25;
    if (Math.random() < arpChance) {
      const m = chord.arp[Math.floor(Math.random() * chord.arp.length)];
      this.pluck(midiToFreq(m), t);
    }
    if (this.energy > 0.5 && within % 2 === 1) this.hat(t);
  }

  private pad(f: number, t: number, dur: number) {
    const ctx = this.ctx!;
    for (const detune of [-7, 7]) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = f;
      osc.detune.value = detune;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.022, t + 1.4);
      g.gain.setValueAtTime(0.022, t + dur - 1.2);
      g.gain.linearRampToValueAtTime(0, t + dur + 0.6);
      osc.connect(g).connect(this.padFilter!);
      osc.start(t);
      osc.stop(t + dur + 0.7);
    }
  }

  private bass(f: number, t: number, dur: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = f;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.09, t + 0.06);
    g.gain.exponentialRampToValueAtTime(0.03, t + dur * 0.6);
    g.gain.linearRampToValueAtTime(0, t + dur);
    osc.connect(g).connect(this.bus!);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  private pluck(f: number, t: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = f;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.035, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 0.6);
    osc.connect(g);
    g.connect(this.bus!);
    g.connect(this.echo!);
    osc.start(t);
    osc.stop(t + 0.65);
  }

  private hat(t: number) {
    const ctx = this.ctx!;
    if (!sfx.noise) return;
    const src = ctx.createBufferSource();
    src.buffer = sfx.noise;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.012 * this.energy, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    src.connect(hp).connect(g).connect(this.bus!);
    src.start(t);
    src.stop(t + 0.05);
  }
}

export const music = new MusicEngine();
