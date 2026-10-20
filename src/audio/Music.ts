import { sfx, midiToFreq } from './Sfx';
import { shared } from '../game/shared';
import { save } from '../game/storage';

// Background music, generated live: synthwave, one song per world, each with
// its own key, chords and tempo (four chords, two bars each).
//
//   menus    soft pads, long bass notes and a sparse echoing pluck
//   playing  + four-on-the-floor kick, claps, hi-hats, a pumping 8th-note
//            bass and a running 16th-note arpeggio
//   warp     the "other universe": faster, a key change up and extra sparkle
//
// So it doesn't loop the same 8 bars forever, every song runs through a
// 32-bar form: A, A with the arpeggio lifted, B with a second arpeggio and
// open hats, then a breakdown (two bars without drums) that builds back up.
// The last bar of each 8 has a clap fill.
//
// Everything is scheduled on a 16th-note grid slightly ahead of time, which
// keeps the timing tight even if the game stutters.

const PARTY_BPM_ADD = 16;
const STEPS_PER_CHORD = 32; // two bars of 16th notes
const STEPS_PER_PHRASE = STEPS_PER_CHORD * 4; // 8 bars
const VOLUME = 0.36;

interface Chord {
  pad: number[];
  bass: number;
  arp: number[];
}

interface Song {
  bpm: number;
  chords: Chord[];
  /** Order the arpeggio walks through the chord tones, in A and B sections. */
  arpA: number[];
  arpB: number[];
  /** Busier world: 16th-note hats and bass. */
  drive?: boolean;
}

const SONGS: Song[] = [
  {
    // World 1 BASICS: A minor, Am F C G. Bright and easy.
    bpm: 108,
    chords: [
      { pad: [57, 60, 64], bass: 45, arp: [69, 72, 76, 81] },
      { pad: [57, 60, 65], bass: 41, arp: [69, 72, 77, 81] },
      { pad: [55, 60, 64], bass: 48, arp: [67, 72, 76, 79] },
      { pad: [55, 59, 62], bass: 43, arp: [67, 71, 74, 79] },
    ],
    arpA: [0, 1, 2, 3, 2, 1, 2, 3],
    arpB: [0, 2, 1, 3, 0, 2, 3, 2],
  },
  {
    // World 2 SAWS: D minor, Dm Bb F C. A bit faster, more urgent.
    bpm: 114,
    chords: [
      { pad: [57, 62, 65], bass: 50, arp: [69, 74, 77, 81] },
      { pad: [58, 62, 65], bass: 46, arp: [70, 74, 77, 82] },
      { pad: [57, 60, 65], bass: 41, arp: [69, 72, 77, 81] },
      { pad: [55, 60, 64], bass: 48, arp: [67, 72, 76, 79] },
    ],
    arpA: [0, 2, 1, 3, 0, 2, 3, 1],
    arpB: [3, 2, 1, 0, 1, 2, 3, 2],
  },
  {
    // World 3 BOMBS: E minor with a major B, Em C Am B. Darker, tense.
    bpm: 118,
    chords: [
      { pad: [55, 59, 64], bass: 40, arp: [67, 71, 76, 79] },
      { pad: [55, 60, 64], bass: 48, arp: [67, 72, 76, 79] },
      { pad: [57, 60, 64], bass: 45, arp: [69, 72, 76, 81] },
      { pad: [54, 59, 63], bass: 47, arp: [66, 71, 75, 78] },
    ],
    arpA: [0, 1, 2, 1, 3, 2, 1, 2],
    arpB: [0, 3, 1, 3, 2, 3, 1, 3],
    drive: true,
  },
  {
    // World 4 CHAOS: F# minor, F#m D A E. Fastest, driving 16ths.
    bpm: 124,
    chords: [
      { pad: [54, 57, 61], bass: 42, arp: [66, 69, 73, 78] },
      { pad: [54, 57, 62], bass: 50, arp: [66, 69, 74, 78] },
      { pad: [57, 61, 64], bass: 45, arp: [69, 73, 76, 81] },
      { pad: [56, 59, 64], bass: 40, arp: [68, 71, 76, 80] },
    ],
    arpA: [0, 1, 2, 3, 1, 2, 3, 2],
    arpB: [3, 1, 2, 0, 3, 2, 1, 2],
    drive: true,
  },
];

class MusicEngine {
  private ctx: AudioContext | null = null;
  private bus: GainNode | null = null;
  /** The MUSIC switch: 1 or 0, after the bus (which fades in and dips on death). */
  private gate: GainNode | null = null;
  private enabled = save.music;
  private padFilter: BiquadFilterNode | null = null;
  private echo: GainNode | null = null;
  private nextTime = 0;
  private step = 0;
  private energy = 0;
  private party = false;
  private song = SONGS[0];

  constructor() {
    sfx.onUnlock = () => this.start();
  }

  private get stepLength() {
    return 60 / (this.song.bpm + (this.party ? PARTY_BPM_ADD : 0)) / 4;
  }

  private start() {
    const ctx = sfx.ctx;
    if (!ctx || !sfx.out || this.ctx) return;
    this.ctx = ctx;

    this.bus = ctx.createGain();
    this.bus.gain.setValueAtTime(0, ctx.currentTime);
    this.bus.gain.linearRampToValueAtTime(VOLUME, ctx.currentTime + 3); // fade in
    // Music goes straight into the final mix, past the sound-effects bus, so
    // MUSIC and SOUND switch off independently.
    this.gate = ctx.createGain();
    this.gate.gain.value = this.enabled ? 1 : 0;
    this.bus.connect(this.gate).connect(sfx.out);

    this.padFilter = ctx.createBiquadFilter();
    this.padFilter.type = 'lowpass';
    this.padFilter.frequency.value = 800;
    this.padFilter.Q.value = 0.5;
    this.padFilter.connect(this.bus);

    // Echo: a delay that feeds back into itself, fading each repeat.
    const delay = ctx.createDelay(2);
    delay.delayTime.value = (60 / SONGS[0].bpm) * 0.75; // dotted eighth
    const feedback = ctx.createGain();
    feedback.gain.value = 0.35;
    const wet = ctx.createGain();
    wet.gain.value = 0.3;
    delay.connect(feedback).connect(delay);
    delay.connect(wet).connect(this.bus);
    this.echo = ctx.createGain();
    this.echo.connect(delay);

    this.nextTime = ctx.currentTime + 0.1;
    setInterval(() => this.schedule(), 50);
  }

  /** 0 in menus, 1 while playing. */
  setEnergy(e: number) {
    this.energy = e;
    if (this.ctx && this.padFilter) {
      this.padFilter.frequency.setTargetAtTime(800 + e * 900, this.ctx.currentTime, 1);
    }
  }

  /** The MUSIC switch. While it's off no notes are scheduled at all (no CPU spent). */
  setEnabled(on: boolean) {
    this.enabled = on;
    if (this.ctx && this.gate) this.gate.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.05);
  }

  /** Party mode for the warp universe. */
  setParty(on: boolean) {
    this.party = on;
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
    while (this.nextTime < this.ctx.currentTime + 0.25) {
      this.playStep(this.step, this.nextTime);
      this.nextTime += this.stepLength;
      this.step++;
    }
  }

  /** Which song the world calls for; switches at a bar line, from the top. */
  private pickSong(i: number): number {
    if (i % 16 !== 0) return i;
    const w = Math.max(0, Math.min(SONGS.length - 1, Math.round(shared.world || 0)));
    if (SONGS[w] === this.song) return i;
    this.song = SONGS[w];
    this.step = 0;
    return 0;
  }

  private playStep(step: number, t: number) {
    const i = this.pickSong(step);
    // Switched off: keep counting steps (so it comes back in time), play nothing.
    if (!this.enabled) return;
    const song = this.song;
    const chord = song.chords[Math.floor(i / STEPS_PER_CHORD) % song.chords.length];
    const within = i % STEPS_PER_CHORD;
    const beatStep = i % 16; // position in the bar
    const shift = this.party ? 3 : 0; // key change up in the warp universe
    const note = (m: number) => midiToFreq(m + shift);
    const playing = this.energy > 0.5;
    const len = this.stepLength;

    // Where we are in the 32-bar form.
    const section = Math.floor(i / STEPS_PER_PHRASE) % 4; // 0 A, 1 A lifted, 2 B, 3 breakdown
    const inPhrase = i % STEPS_PER_PHRASE;
    const bar = Math.floor(inPhrase / 16);
    const breakdown = section === 3 && bar < 2;
    const lastBar = bar === 7;

    if (within === 0) chord.pad.forEach((m) => this.pad(note(m), t, STEPS_PER_CHORD * len));

    if (playing) {
      // Drums (none in the first two bars of the breakdown).
      if (!breakdown) {
        if (beatStep % 4 === 0) this.kick(t);
        if (beatStep === 4 || beatStep === 12) this.clap(t);
        // A clap fill into the next 8 bars.
        else if (lastBar && beatStep >= 13) this.clap(t);
        if (beatStep % 2 === 1) this.hat(t, section === 2 && beatStep % 4 === 2 ? 0.03 : 0.02);
        else if (this.party || song.drive) this.hat(t, 0.012);
        // Open hat on the off-beat in the B section.
        if (section === 2 && beatStep % 4 === 2) this.openHat(t);
        // Pumping bass, jumping an octave on the off-beats (16ths in busy worlds).
        if (i % 2 === 0 || (song.drive && section !== 0)) {
          this.bass(note(chord.bass - 12 + (beatStep % 4 === 2 ? 12 : 0)), t, len * 1.6, song.drive ? 0.085 : 0.1);
        }
      } else if (within === 0 || within === 16) {
        this.bass(note(chord.bass - 12), t, len * 14, 0.08);
      }
      // Running arpeggio: lifted an octave now and then in A', the other
      // pattern in B.
      const pattern = section === 2 ? song.arpB : song.arpA;
      const lift = (this.party && i % 4 === 3) || (section === 1 && i % 8 === 6) ? 12 : 0;
      const arp = chord.arp[pattern[i % pattern.length]] + lift;
      if (i % 2 === 0 || this.party || (breakdown && bar === 1)) this.pluck(note(arp), t, breakdown ? 0.024 : 0.03);
    } else {
      // Menus: calm.
      if (within === 0 || within === 16) this.bass(note(chord.bass - 12), t, len * 14, 0.08);
      if (i % 4 === 0 && Math.random() < 0.55) {
        this.pluck(note(chord.arp[Math.floor(Math.random() * chord.arp.length)]), t, 0.035);
      }
    }
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
      g.gain.linearRampToValueAtTime(0.02, t + 1);
      g.gain.setValueAtTime(0.02, t + dur - 0.8);
      g.gain.linearRampToValueAtTime(0, t + dur + 0.4);
      osc.connect(g).connect(this.padFilter!);
      osc.start(t);
      osc.stop(t + dur + 0.5);
    }
  }

  private bass(f: number, t: number, dur: number, gain: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const sub = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const g = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.value = f;
    sub.type = 'sine';
    sub.frequency.value = f / 2;
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(900, t);
    filter.frequency.exponentialRampToValueAtTime(200, t + Math.min(dur, 0.3));
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(gain * 0.3, t + dur * 0.7);
    g.gain.linearRampToValueAtTime(0, t + dur);
    osc.connect(filter);
    sub.connect(filter);
    filter.connect(g).connect(this.bus!);
    osc.start(t);
    sub.start(t);
    osc.stop(t + dur + 0.05);
    sub.stop(t + dur + 0.05);
  }

  private pluck(f: number, t: number, gain: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = f;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 0.35);
    osc.connect(g);
    g.connect(this.bus!);
    g.connect(this.echo!);
    osc.start(t);
    osc.stop(t + 0.4);
  }

  private kick(t: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(0.28, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    osc.connect(g).connect(this.bus!);
    osc.start(t);
    osc.stop(t + 0.32);
  }

  private noiseHit(t: number, type: BiquadFilterType, freq: number, gain: number, dur: number) {
    const ctx = this.ctx!;
    if (!sfx.noise) return;
    const src = ctx.createBufferSource();
    src.buffer = sfx.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.bus!);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  private clap(t: number) {
    this.noiseHit(t, 'bandpass', 1500, 0.09, 0.14);
    this.noiseHit(t + 0.012, 'bandpass', 1800, 0.06, 0.1);
  }

  private hat(t: number, gain: number) {
    this.noiseHit(t, 'highpass', 7500, gain, 0.035);
  }

  private openHat(t: number) {
    this.noiseHit(t, 'highpass', 6500, 0.016, 0.16);
  }
}

export const music = new MusicEngine();
