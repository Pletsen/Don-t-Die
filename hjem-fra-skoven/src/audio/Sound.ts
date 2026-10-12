/** Tiny synthesised sound set, so the game needs no audio files. Starts on the first click. */
export class Sound {
  private ctx?: AudioContext;
  private master?: GainNode;
  private windGain?: GainNode;
  private windFilter?: BiquadFilterNode;
  private noiseBuf?: AudioBuffer;
  muted = false;

  init() {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 2;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // looping wind bed
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    this.windFilter = this.ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 400;
    this.windFilter.Q.value = 0.6;
    this.windGain = this.ctx.createGain();
    this.windGain.gain.value = 0;
    src.connect(this.windFilter).connect(this.windGain).connect(this.master);
    src.start();
  }

  setWind(strength: number, t: number) {
    if (!this.ctx || !this.windGain || !this.windFilter) return;
    const gust = 0.5 + 0.5 * Math.sin(t * 0.6) * Math.sin(t * 0.23);
    this.windGain.gain.setTargetAtTime(this.muted ? 0 : 0.03 + strength * 0.05 * (0.5 + gust), this.ctx.currentTime, 0.4);
    this.windFilter.frequency.setTargetAtTime(280 + strength * 220 + gust * 160, this.ctx.currentTime, 0.4);
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number) {
    if (!this.ctx || !this.master || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(dur: number, freq: number, vol: number) {
    if (!this.ctx || !this.master || !this.noiseBuf || this.muted) return;
    const t = this.ctx.currentTime;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t, Math.random());
    s.stop(t + dur + 0.02);
  }

  shoot() { this.tone(180, 0.18, 'triangle', 0.35, 70); this.noise(0.12, 2500, 0.2); }
  hit() { this.noise(0.14, 700, 0.5); this.tone(110, 0.12, 'sine', 0.4, 60); }
  hurt() { this.noise(0.25, 500, 0.6); this.tone(90, 0.3, 'sawtooth', 0.25, 45); }
  kill() { this.tone(160, 0.35, 'sine', 0.3, 50); }
  pickup() { this.tone(520, 0.08, 'sine', 0.2); setTimeout(() => this.tone(780, 0.1, 'sine', 0.2), 70); }
  eat() { this.noise(0.1, 900, 0.3); setTimeout(() => this.noise(0.1, 900, 0.3), 140); }
  roll() { this.noise(0.25, 1400, 0.15); }
  alert() { this.tone(900, 0.07, 'square', 0.05); }
  death() { this.tone(200, 1.2, 'sawtooth', 0.35, 30); }
  complete() { [392, 523, 659, 784].forEach((f, i) => setTimeout(() => this.tone(f, 0.5, 'triangle', 0.25), i * 160)); }
}
