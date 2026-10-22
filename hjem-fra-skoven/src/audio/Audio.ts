import * as THREE from 'three';
import { settings } from '../game/settings';

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
}

export class Audio {
  private ctx?: AudioContext;
  private master?: GainNode;
  private bus: Record<string, GainNode> = {};
  private manifest?: Manifest;
  private buffers = new Map<string, AudioBuffer>();
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
        } catch {
          /* a missing file only silences that sound */
        }
      }),
    );
    this.ready = true;
  }

  whenReady(): Promise<void> {
    return this.loading ?? Promise.resolve();
  }

  private applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master!.gain.setTargetAtTime(settings.master, t, 0.05);
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

  private pick(id: string): { def: EventDef; buf: AudioBuffer } | null {
    const def = this.manifest?.events[id];
    if (!def || !def.files.length) return null;
    let i = Math.floor(Math.random() * def.files.length);
    if (def.files.length > 1 && i === this.lastVariant.get(id)) i = (i + 1) % def.files.length;
    this.lastVariant.set(id, i);
    const buf = this.buffers.get(def.files[i]);
    return buf ? { def, buf } : null;
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
  play(id: string, o: PlayOpts = {}): boolean {
    if (!this.ctx || !this.ready || this.voices > 28) return false;
    const now = this.ctx.currentTime;
    if (now - (this.lastPlayed.get(id) ?? -1) < 0.045) return false;
    const p = this.pick(id);
    if (!p) return false;
    this.lastPlayed.set(id, now);
    const src = this.ctx.createBufferSource();
    src.buffer = p.buf;
    const pv = p.def.pitchVar ?? 0;
    src.playbackRate.value = (o.rate ?? 1) * (1 + (Math.random() * 2 - 1) * pv);
    const g = this.ctx.createGain();
    g.gain.value = p.def.volume * (o.volume ?? 1);
    let node: AudioNode = src.connect(g);
    if (o.pos && p.def.spatial !== false) node = node.connect(this.panner(o.pos, p.def.refDistance ?? 6));
    node.connect(this.bus[p.def.category] ?? this.bus.sfx);
    this.voices++;
    src.onended = () => this.voices--;
    src.start();
    return true;
  }

  /** Starts (or retargets) a named loop. volume 0 fades it out; it is stopped once silent. */
  loop(key: string, id: string, volume: number, pos?: THREE.Vector3, fade = 0.6) {
    if (!this.ctx || !this.ready) return;
    let h = this.loops.get(key);
    if (!h) {
      if (volume <= 0.001) return;
      const p = this.pick(id);
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
      h = { src, gain, panner, target: 0 };
      this.loops.set(key, h);
    }
    const def = this.manifest!.events[id];
    const target = volume * (def?.volume ?? 1);
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
