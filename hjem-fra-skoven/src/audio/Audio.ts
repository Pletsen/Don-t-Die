import * as THREE from 'three';
import { settings } from '../game/settings';
import { SYNTH } from './synth';

/**
 * Sample-based audio engine (files in public/sfx, see manifest.json and CREDITS.md).
 * - Buses: sfx, ui, ambience and music, each with its own volume from `settings`, all into a master gain.
 * - Random variant per play (never the same twice in a row) and a little random pitch.
 * - Spatial sounds use a PannerNode at the given world position; the listener follows the camera.
 * - Loops (ambience, music, heartbeat, sling whirl) are named handles that fade in and out.
 */

interface EventDef {
  files: string[];
  volume: number;
  category: 'sfx' | 'ui' | 'ambience' | 'music';
  loop?: boolean;
  spatial?: boolean;
  pitchVar?: number;
  refDistance?: number;
}

interface Manifest {
  basePath?: string;
  events: Record<string, EventDef>;
}

export interface PlayOpts {
  pos?: THREE.Vector3;
  volume?: number;
  rate?: number;
}

interface LoopHandle {
  src: AudioBufferSourceNode;
  gain: GainNode;
  panner?: PannerNode;
  target: number;
  norm: number;
}

export class Audio {
  private ctx?: AudioContext;
  private master?: GainNode;
  private bus: Record<string, GainNode> = {};
  private manifest?: Manifest;
  private buffers = new Map<string, AudioBuffer>();
  /** Per-file gain that brings every recording to the same loudness (see `measure`). */
  private norm = new Map<string, number>();
  /** Loudness table for the sound board and the polish log. */
  readonly stats: { file: string; peakDb: number; rmsDb: number; gainDb: number }[] = [];
  private lastVariant = new Map<string, number>();
  private lastPlayed = new Map<string, number>();
  private loops = new Map<string, LoopHandle>();
  private voices = 0;
  private duckGain = 1;
  private duckTarget = 1;
  private loading?: Promise<void>;
  ready = false;

  /** Call from a user gesture (browsers only allow audio after one). Loads everything once. */
  init() {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    // gentle limiter so stacked sounds never clip
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.ratio.value = 6;
    this.master.connect(comp).connect(ctx.destination);
    for (const b of ['sfx', 'ui', 'ambience', 'music']) {
      const g = ctx.createGain();
      g.connect(this.master);
      this.bus[b] = g;
    }
    this.applyVolumes();
    this.loading = this.load();
  }

  private async load() {
    const base = `${import.meta.env.BASE_URL}sfx/`;
    try {
      const res = await fetch(`${base}manifest.json`);
      this.manifest = (await res.json()) as Manifest;
    } catch {
      return;
    }
    const files = new Set<string>();
    for (const e of Object.values(this.manifest.events)) e.files.forEach((f) => files.add(f));
    await Promise.all(
      [...files].map(async (f) => {
        try {
          const r = await fetch(base + f);
          const buf = await this.ctx!.decodeAudioData(await r.arrayBuffer());
          this.buffers.set(f, buf);
          this.measure(f, buf);
        } catch {
          /* a missing file only silences that sound */
        }
      }),
    );
    // procedural sounds for the gaps (roe deer, pheasant) and the fallback blip
    for (const [id, sy] of Object.entries(SYNTH)) {
      if (this.manifest.events[id]) continue;
      const data = sy.make(this.ctx!.sampleRate);
      const buf = this.ctx!.createBuffer(1, data.length, this.ctx!.sampleRate);
      buf.copyToChannel(data as Float32Array<ArrayBuffer>, 0);
      const file = `synth:${id}`;
      this.buffers.set(file, buf);
      this.measure(file, buf);
      this.manifest.events[id] = { files: [file], volume: sy.volume, category: sy.category, spatial: sy.spatial, refDistance: sy.refDistance, pitchVar: sy.pitchVar };
    }
    this.ready = true;
  }

  /**
   * Loudness normalisation: every file is brought to the same RMS (-20 dBFS) so variants of one event sound equally loud
   * and the manifest volume is a pure mix level. The gain is capped so the peak never goes above -1 dBFS.
   */
  private measure(file: string, buf: AudioBuffer) {
    let peak = 0;
    let sum = 0;
    let n = 0;
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < d.length; i += 2) {
        const v = Math.abs(d[i]);
        if (v > peak) peak = v;
        sum += d[i] * d[i];
        n++;
      }
    }
    const rms = Math.sqrt(sum / Math.max(1, n)) || 1e-6;
    const target = Math.pow(10, -20 / 20);
    let gain = Math.min(3, Math.max(0.3, target / rms));
    gain = Math.min(gain, 0.89 / Math.max(peak, 1e-6));
    this.norm.set(file, gain);
    this.stats.push({ file, peakDb: 20 * Math.log10(peak || 1e-9), rmsDb: 20 * Math.log10(rms), gainDb: 20 * Math.log10(gain) });
  }

  /** All event ids with their files, for the sound board. */
  events(): { id: string; files: string[]; category: string }[] {
    if (!this.manifest) return [];
    return Object.entries(this.manifest.events).map(([id, e]) => ({ id, files: e.files, category: e.category }));
  }

  whenReady(): Promise<void> {
    return this.loading ?? Promise.resolve();
  }

  private applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master!.gain.setTargetAtTime(settings.muted ? 0 : settings.master, t, 0.05);
    this.bus.sfx.gain.setTargetAtTime(settings.sfx, t, 0.05);
    this.bus.ui.gain.setTargetAtTime(settings.sfx, t, 0.05);
    this.bus.ambience.gain.setTargetAtTime(settings.ambience * this.duckGain, t, 0.1);
    this.bus.music.gain.setTargetAtTime(settings.music * this.duckGain, t, 0.1);
  }

  /** Briefly lowers music and ambience (when hurt, on death, on a boss roar). */
  duck(amount = 0.4, seconds = 1.2) {
    this.duckTarget = 1 - amount;
    setTimeout(() => (this.duckTarget = 1), seconds * 1000);
  }

  private pick(id: string, variant?: number): { def: EventDef; buf: AudioBuffer; gain: number } | null {
    const def = this.manifest?.events[id];
    if (!def || !def.files.length) return null;
    let i = variant ?? Math.floor(Math.random() * def.files.length);
    if (variant === undefined && def.files.length > 1 && i === this.lastVariant.get(id)) i = (i + 1) % def.files.length;
    this.lastVariant.set(id, i);
    const file = def.files[Math.min(i, def.files.length - 1)];
    const buf = this.buffers.get(file);
    if (!buf) {
      // a file that failed to load: a soft blip instead of silence for gameplay sounds
      const fb = this.buffers.get('synth:fallback');
      return fb && def.category !== 'music' && def.category !== 'ambience' ? { def, buf: fb, gain: 1 } : null;
    }
    return { def, buf, gain: this.norm.get(file) ?? 1 };
  }

  private panner(pos: THREE.Vector3, ref: number): PannerNode {
    const p = this.ctx!.createPanner();
    p.panningModel = 'equalpower';
    p.distanceModel = 'inverse';
    p.refDistance = ref;
    p.rolloffFactor = 1;
    p.maxDistance = 200;
    p.positionX.value = pos.x;
    p.positionY.value = pos.y;
    p.positionZ.value = pos.z;
    return p;
  }

  /** One-shot. Returns false if the sound is unknown, not loaded yet, or rate-limited. */
  play(id: string, o: PlayOpts & { variant?: number } = {}): boolean {
    if (!this.ctx || !this.ready || this.voices > 28) return false;
    const now = this.ctx.currentTime;
    if (now - (this.lastPlayed.get(id) ?? -1) < 0.045) return false;
    const p = this.pick(id, o.variant);
    if (!p) return false;
    this.lastPlayed.set(id, now);
    const src = this.ctx.createBufferSource();
    src.buffer = p.buf;
    const pv = p.def.pitchVar ?? 0;
    src.playbackRate.value = (o.rate ?? 1) * (1 + (Math.random() * 2 - 1) * pv);
    const g = this.ctx.createGain();
    g.gain.value = p.def.volume * p.gain * (o.volume ?? 1);
    let node: AudioNode = src.connect(g);
    if (o.pos && p.def.spatial !== false) node = node.connect(this.panner(o.pos, p.def.refDistance ?? 6));
    node.connect(this.bus[p.def.category] ?? this.bus.sfx);
    this.voices++;
    src.onended = () => this.voices--;
    src.start();
    return true;
  }

  /** Sound board: plays one exact variant (loops play as a loop handle, so they can be stopped). Returns its length. */
  preview(id: string, variant: number): number {
    const def = this.manifest?.events[id];
    if (!def) return 0;
    const buf = this.buffers.get(def.files[variant]);
    if (def.loop) {
      this.lastVariant.set(id, variant);
      this.loop(`preview:${id}`, id, 1, undefined, 0.1);
    } else {
      this.lastPlayed.delete(id);
      this.play(id, { variant });
    }
    return buf?.duration ?? 1;
  }

  /** Starts (or retargets) a named loop. volume 0 fades it out; it is stopped once silent. */
  loop(key: string, id: string, volume: number, pos?: THREE.Vector3, fade = 0.6) {
    if (!this.ctx || !this.ready) return;
    let h = this.loops.get(key);
    if (!h) {
      if (volume <= 0.001) return;
      const p = this.pick(id, key.startsWith('preview:') ? this.lastVariant.get(id) : undefined);
      if (!p) return;
      const src = this.ctx.createBufferSource();
      src.buffer = p.buf;
      src.loop = true;
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      let node: AudioNode = src.connect(gain);
      let panner: PannerNode | undefined;
      if (pos) {
        panner = this.panner(pos, p.def.refDistance ?? 6);
        node = node.connect(panner);
      }
      node.connect(this.bus[p.def.category] ?? this.bus.sfx);
      // start loops at a random point so they don't sound identical every level
      src.start(0, Math.random() * p.buf.duration);
      h = { src, gain, panner, target: 0, norm: p.gain };
      this.loops.set(key, h);
    }
    const def = this.manifest!.events[id];
    const target = volume * (def?.volume ?? 1) * h.norm;
    if (Math.abs(target - h.target) > 0.002) {
      h.gain.gain.setTargetAtTime(target, this.ctx.currentTime, fade / 3);
      h.target = target;
    }
    if (pos && h.panner) {
      h.panner.positionX.value = pos.x;
      h.panner.positionY.value = pos.y;
      h.panner.positionZ.value = pos.z;
    }
  }

  stopLoop(key: string, fade = 0.4) {
    const h = this.loops.get(key);
    if (!h || !this.ctx) return;
    h.gain.gain.setTargetAtTime(0, this.ctx.currentTime, fade / 3);
    const src = h.src;
    setTimeout(() => {
      try {
        src.stop();
      } catch {
        /* already stopped */
      }
    }, fade * 1000 + 200);
    this.loops.delete(key);
  }

  stopAllLoops(except: string[] = []) {
    for (const k of [...this.loops.keys()]) if (!except.includes(k)) this.stopLoop(k);
  }

  /** Per frame: listener follows the camera, volumes follow settings, ducking eases back. */
  update(dt: number, camera: THREE.Camera) {
    if (!this.ctx) return;
    this.duckGain += (this.duckTarget - this.duckGain) * Math.min(1, dt * 3);
    this.applyVolumes();
    const l = this.ctx.listener;
    const p = camera.position;
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    if (l.positionX) {
      l.positionX.value = p.x;
      l.positionY.value = p.y;
      l.positionZ.value = p.z;
      l.forwardX.value = f.x;
      l.forwardY.value = f.y;
      l.forwardZ.value = f.z;
      l.upX.value = 0;
      l.upY.value = 1;
      l.upZ.value = 0;
    } else {
      l.setPosition(p.x, p.y, p.z);
      l.setOrientation(f.x, f.y, f.z, 0, 1, 0);
    }
  }
}
