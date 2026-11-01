import Phaser from 'phaser';

// A tiny pooled particle system for the QUACK REACTOR. Every sprite is made
// once; emitting reuses the next free one (or the oldest), and the state lives
// in typed arrays, so a burst of sparks allocates nothing per frame.

/** How a particle's alpha runs over its life. */
export const Fade = {
  /** Full at birth, linear to 0. */
  Out: 0,
  /** Eases in, then fades out slowly (smoke, steam). */
  Puff: 1,
  /** Flickers while it fades (electric sparks). */
  Flicker: 2,
  /** Fades in quickly and stays bright to the end (things sucked into the core). */
  In: 3,
} as const;
export type Fade = (typeof Fade)[keyof typeof Fade];

export interface EmitOpts {
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  /** Seconds. */
  life: number;
  scale: number;
  /** Scale at the end of its life (default: same as `scale`). */
  scaleTo?: number;
  alpha?: number;
  tint?: number;
  /** Pixels per second squared, downwards. */
  gravity?: number;
  /** Fraction of speed lost per second (0..1). */
  drag?: number;
  angle?: number;
  /** Radians per second. */
  spin?: number;
  /** Turn the sprite to face where it flies (streaks). */
  align?: boolean;
  fade?: Fade;
  /**
   * Sucked in: instead of flying, it spirals from (x, y) into this point,
   * turning `swirl` radians on the way and arriving as its life ends
   * (velocity, gravity and drag are ignored).
   */
  home?: { x: number; y: number; swirl: number };
}

export class FxPool {
  readonly sprites: Phaser.GameObjects.Image[] = [];
  private x: Float32Array;
  private y: Float32Array;
  private vx: Float32Array;
  private vy: Float32Array;
  private age: Float32Array;
  private life: Float32Array;
  private s0: Float32Array;
  private s1: Float32Array;
  private a0: Float32Array;
  private grav: Float32Array;
  private drag: Float32Array;
  private rot: Float32Array;
  private spin: Float32Array;
  private hx: Float32Array;
  private hy: Float32Array;
  private hsw: Float32Array;
  private flags: Uint8Array;
  private live = 0;
  private next = 0;

  constructor(scene: Phaser.Scene, texture: string, count: number, blend: Phaser.BlendModes = Phaser.BlendModes.ADD) {
    for (let i = 0; i < count; i++) this.sprites.push(scene.add.image(0, 0, texture).setBlendMode(blend).setVisible(false));
    this.x = new Float32Array(count);
    this.y = new Float32Array(count);
    this.vx = new Float32Array(count);
    this.vy = new Float32Array(count);
    this.age = new Float32Array(count);
    this.life = new Float32Array(count);
    this.s0 = new Float32Array(count);
    this.s1 = new Float32Array(count);
    this.a0 = new Float32Array(count);
    this.grav = new Float32Array(count);
    this.drag = new Float32Array(count);
    this.rot = new Float32Array(count);
    this.spin = new Float32Array(count);
    // bit 0: alive, bit 1: align, bits 2-3: fade
    this.hx = new Float32Array(count);
    this.hy = new Float32Array(count);
    this.hsw = new Float32Array(count);
    this.flags = new Uint8Array(count);
  }

  /** Number of particles alive. */
  get count() {
    return this.live;
  }

  emit(o: EmitOpts) {
    const n = this.sprites.length;
    // The next free slot, or the oldest one if they're all busy.
    let i = this.next;
    for (let k = 0; k < n; k++) {
      const j = (this.next + k) % n;
      if (!(this.flags[j] & 1)) {
        i = j;
        break;
      }
    }
    this.next = (i + 1) % n;
    if (!(this.flags[i] & 1)) this.live++;
    this.x[i] = o.x;
    this.y[i] = o.y;
    this.vx[i] = o.vx ?? 0;
    this.vy[i] = o.vy ?? 0;
    this.age[i] = 0;
    this.life[i] = Math.max(0.01, o.life);
    this.s0[i] = o.scale;
    this.s1[i] = o.scaleTo ?? o.scale;
    this.a0[i] = o.alpha ?? 1;
    this.grav[i] = o.gravity ?? 0;
    this.drag[i] = o.drag ?? 0;
    this.rot[i] = o.angle ?? 0;
    this.spin[i] = o.spin ?? 0;
    this.flags[i] = 1 | (o.align ? 2 : 0) | ((o.fade ?? Fade.Out) << 2) | (o.home ? 16 : 0);
    if (o.home) {
      this.hx[i] = o.home.x;
      this.hy[i] = o.home.y;
      this.hsw[i] = o.home.swirl;
    }
    const s = this.sprites[i].setVisible(true).setPosition(o.x, o.y).setScale(o.scale).setRotation(this.rot[i]);
    if (o.tint === undefined) s.clearTint();
    else s.setTint(o.tint);
    s.setAlpha((o.fade ?? Fade.Out) === Fade.Puff ? 0 : this.a0[i]);
  }

  /** Advance by `dt` seconds. */
  update(dt: number) {
    if (this.live === 0) return;
    const n = this.sprites.length;
    for (let i = 0; i < n; i++) {
      const f = this.flags[i];
      if (!(f & 1)) continue;
      const age = (this.age[i] += dt);
      const u = age / this.life[i];
      const s = this.sprites[i];
      if (u >= 1) {
        this.flags[i] = 0;
        this.live--;
        s.setVisible(false);
        continue;
      }
      if (f & 16) {
        // Homing: spiral from where it was born into the target, faster and faster.
        const e = u * u;
        const ang = this.hsw[i] * e;
        const c = Math.cos(ang);
        const sn = Math.sin(ang);
        const dx = this.x[i] - this.hx[i];
        const dy = this.y[i] - this.hy[i];
        const px = this.hx[i] + (dx * c - dy * sn) * (1 - e);
        const py = this.hy[i] + (dx * sn + dy * c) * (1 - e);
        if (f & 2) s.setRotation(Math.atan2(py - s.y, px - s.x));
        s.setPosition(px, py);
      } else {
        if (this.drag[i] > 0) {
          const k = Math.max(0, 1 - this.drag[i] * dt);
          this.vx[i] *= k;
          this.vy[i] *= k;
        }
        this.vy[i] += this.grav[i] * dt;
        this.x[i] += this.vx[i] * dt;
        this.y[i] += this.vy[i] * dt;
        this.rot[i] += this.spin[i] * dt;
        s.setPosition(this.x[i], this.y[i]);
        s.setRotation(f & 2 ? Math.atan2(this.vy[i], this.vx[i]) : this.rot[i]);
      }
      s.setScale(this.s0[i] + (this.s1[i] - this.s0[i]) * u);
      const fade = (f >> 2) & 3;
      const a =
        fade === Fade.Puff
          ? u < 0.25
            ? u * 4
            : (1 - u) * 1.3333
          : fade === Fade.Flicker
            ? (1 - u) * (0.55 + 0.45 * Math.sin(age * 90 + i))
            : fade === Fade.In
              ? Math.min(1, u * 4)
              : 1 - u;
      s.setAlpha(this.a0[i] * a);
    }
  }

  clear() {
    for (let i = 0; i < this.sprites.length; i++) {
      this.flags[i] = 0;
      this.sprites[i].setVisible(false);
    }
    this.live = 0;
  }
}
