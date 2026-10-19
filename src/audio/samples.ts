// Recorded sound effects (the real duck quacks). Each file is fetched and
// decoded once into an AudioBuffer; playing one is then just a cheap
// AudioBufferSourceNode. If a file can't be loaded, `play` returns false and
// the caller falls back to its synthesised sound.

export interface PlayOpts {
  /** Playback rate: 1 = original, 2 = an octave up and twice as fast. */
  rate?: number;
  gain?: number;
  /** Seconds from now. */
  delay?: number;
  /** Voices in the same group share a voice cap. The oldest is cut off first. */
  group?: string;
  maxVoices?: number;
}

interface Voice {
  src: AudioBufferSourceNode;
  gain: GainNode;
  end: number;
}

/** A random factor between lo and hi, so repeated sounds never sound identical. */
export const vary = (lo = 0.92, hi = 1.08) => lo + Math.random() * (hi - lo);

/** decodeAudioData with old Safari's callback form as well as the promise form. */
function decode(ctx: BaseAudioContext, data: ArrayBuffer): Promise<AudioBuffer> {
  return new Promise((resolve, reject) => {
    const p = ctx.decodeAudioData(data, resolve, reject) as Promise<AudioBuffer> | undefined;
    p?.catch(reject);
  });
}

export class SampleBank<K extends string> {
  private buffers = new Map<K, AudioBuffer>();
  private voices = new Map<string, Voice[]>();
  private started = false;

  constructor(
    private readonly files: Record<K, string>,
    private readonly baseUrl: string,
  ) {}

  /** Starts loading every file once. Missing files are skipped. */
  load(ctx: BaseAudioContext): Promise<void> {
    if (this.started) return Promise.resolve();
    this.started = true;
    const names = Object.keys(this.files) as K[];
    return Promise.all(
      names.map(async (name) => {
        try {
          const res = await fetch(this.baseUrl + this.files[name]);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          this.buffers.set(name, await decode(ctx, await res.arrayBuffer()));
        } catch (err) {
          console.warn(`[sfx] could not load ${this.files[name]}, using the synth sound instead`, err);
        }
      }),
    ).then(() => undefined);
  }

  has(name: K) {
    return this.buffers.has(name);
  }

  /** How many files have been decoded (for debugging). */
  get loadedCount() {
    return this.buffers.size;
  }

  play(ctx: AudioContext, dest: AudioNode, name: K, o: PlayOpts = {}): boolean {
    const buffer = this.buffers.get(name);
    if (!buffer) return false;
    const now = ctx.currentTime;
    const t0 = now + (o.delay ?? 0);
    const rate = o.rate ?? 1;

    if (o.group) {
      const list = (this.voices.get(o.group) ?? []).filter((v) => v.end > now);
      // Too many at once: fade out the oldest quickly instead of piling up.
      while (list.length >= (o.maxVoices ?? 4)) {
        const old = list.shift()!;
        old.gain.gain.cancelScheduledValues(now);
        old.gain.gain.setTargetAtTime(0, now, 0.008);
        try {
          old.src.stop(now + 0.04);
        } catch {
          // Already stopped.
        }
      }
      this.voices.set(o.group, list);
    }

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = o.gain ?? 1;
    src.connect(g).connect(dest);
    src.start(t0);
    const voice: Voice = { src, gain: g, end: t0 + buffer.duration / rate };
    if (o.group) this.voices.get(o.group)!.push(voice);
    src.onended = () => {
      src.disconnect();
      g.disconnect();
      if (o.group) {
        const list = this.voices.get(o.group);
        const i = list ? list.indexOf(voice) : -1;
        if (i >= 0) list!.splice(i, 1);
      }
    };
    return true;
  }
}
