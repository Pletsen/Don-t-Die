import * as THREE from 'three';
import { softDot } from '../world/textures';

const COUNT = 28;
const POOL = 10;
const LIFE = 0.7;

interface Slot {
  life: number;
  active: boolean;
  n: number;
}

/**
 * Short puffs of soft round particles for hits, deaths and dust. All slots live in one `Points` object
 * (one draw call), built once, so a hit never allocates geometry or materials. Per-point colour, alpha and size.
 */
export class Bursts {
  readonly points: THREE.Points;
  private slots: Slot[] = [];
  private pos: Float32Array;
  private vel: Float32Array;
  private col: Float32Array;
  private size: Float32Array;
  private base: Float32Array;
  private tmp = new THREE.Color();

  constructor(scene: THREE.Scene) {
    const n = COUNT * POOL;
    this.pos = new Float32Array(n * 3).fill(-9999);
    this.vel = new Float32Array(n * 3);
    this.col = new Float32Array(n * 4);
    this.size = new Float32Array(n);
    this.base = new Float32Array(n);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.PointsMaterial({
      size: 0.11,
      map: softDot(0.25),
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      alphaTest: 0.01,
      sizeAttenuation: true,
    });
    mat.onBeforeCompile = (s) => {
      s.vertexShader = 'attribute float aSize;\n' + s.vertexShader.replace('gl_PointSize = size;', 'gl_PointSize = size * aSize;');
    };
    mat.customProgramCacheKey = () => 'bursts-v1';
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    this.points.visible = false;
    this.points.renderOrder = 4;
    scene.add(this.points);
    for (let i = 0; i < POOL; i++) this.slots.push({ life: 0, active: false, n: 0 });
  }

  emit(at: THREE.Vector3, color: number, count = 14, speed = 3) {
    let si = this.slots.findIndex((x) => !x.active);
    if (si < 0) {
      // reuse the oldest
      let min = Infinity;
      this.slots.forEach((s, i) => {
        if (s.life < min) {
          min = s.life;
          si = i;
        }
      });
    }
    const slot = this.slots[si];
    const n = Math.min(COUNT, count);
    this.tmp.setHex(color);
    for (let k = 0; k < COUNT; k++) {
      const i = si * COUNT + k;
      const live = k < n;
      this.pos[i * 3] = at.x;
      this.pos[i * 3 + 1] = live ? at.y : -9999;
      this.pos[i * 3 + 2] = at.z;
      this.vel[i * 3] = (Math.random() - 0.5) * speed;
      this.vel[i * 3 + 1] = Math.random() * speed * 0.9;
      this.vel[i * 3 + 2] = (Math.random() - 0.5) * speed;
      // slight per-particle shade so a puff is not one flat colour
      const sh = 0.8 + Math.random() * 0.35;
      this.col[i * 4] = this.tmp.r * sh;
      this.col[i * 4 + 1] = this.tmp.g * sh;
      this.col[i * 4 + 2] = this.tmp.b * sh;
      this.col[i * 4 + 3] = live ? 1 : 0;
      this.base[i] = 0.55 + Math.random() * 0.9;
      this.size[i] = this.base[i];
    }
    slot.n = n;
    slot.life = LIFE;
    slot.active = true;
    this.points.visible = true;
  }

  update(dt: number) {
    let any = false;
    for (let si = 0; si < POOL; si++) {
      const s = this.slots[si];
      if (!s.active) continue;
      s.life -= dt;
      const t = Math.max(0, s.life / LIFE);
      const drag = Math.exp(-2.2 * dt);
      for (let k = 0; k < s.n; k++) {
        const i = si * COUNT + k;
        this.vel[i * 3] *= drag;
        this.vel[i * 3 + 2] *= drag;
        this.vel[i * 3 + 1] -= 7 * dt;
        this.pos[i * 3] += this.vel[i * 3] * dt;
        this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
        this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
        this.col[i * 4 + 3] = t * t * (3 - 2 * t);
        this.size[i] = this.base[i] * (1 + (1 - t) * 0.8);
      }
      if (s.life <= 0) {
        s.active = false;
        for (let k = 0; k < COUNT; k++) {
          const i = si * COUNT + k;
          this.pos[i * 3 + 1] = -9999;
          this.col[i * 4 + 3] = 0;
        }
      } else any = true;
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
    g.attributes.aSize.needsUpdate = true;
    this.points.visible = any;
  }

  dispose() {
    this.points.removeFromParent();
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}
