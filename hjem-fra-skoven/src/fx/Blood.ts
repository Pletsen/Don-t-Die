import * as THREE from 'three';
import type { World } from '../world/World';
import { settings } from '../game/settings';

/**
 * Realistic blood (owner decision): spurts at the true wound, drips, a followable trail of ground decals, and a pool
 * under corpses. Everything is pooled: one Points draw call for droplets and dust, one InstancedMesh for all decals.
 * With `settings.blood` off the same system shows dust and scuffed earth instead.
 */
const MAX_P = 640;
const MAX_DECALS = 420;
const MAX_POOLS = 10;
const TRAIL_LIFE = 90; // seconds before a trail decal has faded
const POOL_LIFE = 150;

// splat atlas variants (2x2): 0 splash, 1 smear/drag, 2 drop cluster, 3 pool
type Variant = 0 | 1 | 2 | 3;

let atlas: THREE.CanvasTexture | null = null;
function splatAtlas(): THREE.CanvasTexture {
  if (atlas) return atlas;
  const S = 256;
  const H = S / 2;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  let seed = 991;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const blob = (cx: number, cy: number, r: number, a: number) => {
    const gr = g.createRadialGradient(cx, cy, 0, cx, cy, r);
    gr.addColorStop(0, `rgba(255,255,255,${a})`);
    gr.addColorStop(0.7, `rgba(255,255,255,${a * 0.9})`);
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.fill();
  };
  const irregular = (cx: number, cy: number, r: number, n: number, jag: number) => {
    g.fillStyle = 'rgba(255,255,255,0.95)';
    g.beginPath();
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const rr = r * (1 - jag + rnd() * jag * 2);
      const x = cx + Math.cos(a) * rr;
      const y = cy + Math.sin(a) * rr;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.closePath();
    g.fill();
  };
  g.save();
  g.filter = 'blur(1.2px)';
  // 0: splash: core with droplets thrown outwards
  irregular(H / 2, H / 2, H * 0.2, 18, 0.35);
  for (let i = 0; i < 26; i++) {
    const a = rnd() * Math.PI * 2;
    const d = H * (0.18 + rnd() * 0.28);
    blob(H / 2 + Math.cos(a) * d, H / 2 + Math.sin(a) * d, 2 + rnd() * 5, 0.95);
  }
  // 1: smear / drag (elongated)
  for (let i = 0; i < 14; i++) blob(H + H * 0.2 + (i / 14) * H * 0.6, H / 2 + (rnd() - 0.5) * 8, 6 + rnd() * 9 * (1 - i / 18), 0.85);
  for (let i = 0; i < 10; i++) blob(H + H * 0.2 + rnd() * H * 0.65, H / 2 + (rnd() - 0.5) * 40, 1.5 + rnd() * 3, 0.9);
  // 2: cluster of drops (trail)
  for (let i = 0; i < 9; i++) {
    const r = 3 + rnd() * 8;
    blob(H * 0.25 + rnd() * H * 0.5, H + H * 0.25 + rnd() * H * 0.5, r, 0.95);
  }
  // 3: pool
  irregular(H + H / 2, H + H / 2, H * 0.4, 28, 0.12);
  g.restore();
  atlas = new THREE.CanvasTexture(c);
  atlas.colorSpace = THREE.SRGBColorSpace;
  return atlas;
}

const VERT = /* glsl */ `
attribute vec3 aCol;
attribute float aSize;
attribute float aAlpha;
uniform float uScale;
varying vec3 vCol;
varying float vAlpha;
#include <fog_pars_vertex>
void main() {
  vCol = aCol;
  vAlpha = aAlpha;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = max(1.5, aSize * uScale / -mvPosition.z);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const FRAG = /* glsl */ `
varying vec3 vCol;
varying float vAlpha;
#include <fog_pars_fragment>
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = dot(c, c) * 4.0;
  if (d > 1.0 || vAlpha <= 0.0) discard;
  gl_FragColor = vec4(vCol, vAlpha * (1.0 - d * d));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _c = new THREE.Color();
const _size = new THREE.Vector2();
const UP = new THREE.Vector3(0, 1, 0);

interface Pool {
  slot: number;
  x: number;
  y: number;
  z: number;
  size: number;
  t: number;
  grow: number;
  yaw: number;
}

export class Blood {
  private points: THREE.Points;
  private pPos: Float32Array;
  private pCol: Float32Array;
  private pSize: Float32Array;
  private pAlpha: Float32Array;
  private vel = new Float32Array(MAX_P * 3);
  private life = new Float32Array(MAX_P);
  private maxLife = new Float32Array(MAX_P);
  private kind = new Uint8Array(MAX_P); // 0 free, 1 blood droplet, 2 dust, 3 mist
  private nextP = 0;
  private activeP = 0;

  private decals: THREE.InstancedMesh;
  private decalAttr: THREE.InstancedBufferAttribute; // xy = atlas offset, z = alpha
  private decalBorn = new Float32Array(MAX_DECALS);
  private decalLife = new Float32Array(MAX_DECALS);
  private decalAlpha = new Float32Array(MAX_DECALS);
  private nextD = 0;
  private pools: Pool[] = [];
  private time = 0;
  private fadeTimer = 0;
  private decalGeo: THREE.PlaneGeometry;
  private decalMat: THREE.MeshStandardMaterial;
  private pointMat: THREE.ShaderMaterial;
  private dirtyDecals = false;

  constructor(private scene: THREE.Scene, private world: World) {
    // ---- droplets and dust
    const g = new THREE.BufferGeometry();
    this.pPos = new Float32Array(MAX_P * 3).fill(-9999);
    this.pCol = new Float32Array(MAX_P * 3);
    this.pSize = new Float32Array(MAX_P);
    this.pAlpha = new Float32Array(MAX_P);
    g.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aCol', new THREE.BufferAttribute(this.pCol, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.pSize, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.pAlpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.pointMat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uScale: { value: 400 } }]),
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      fog: true,
    });
    this.points = new THREE.Points(g, this.pointMat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    this.points.onBeforeRender = (renderer, _scene, camera) => {
      renderer.getDrawingBufferSize(_size);
      const fov = (camera as THREE.PerspectiveCamera).fov ?? 60;
      this.pointMat.uniforms.uScale.value = _size.y / (2 * Math.tan((fov * Math.PI) / 360));
    };
    scene.add(this.points);

    // ---- ground decals: one instanced quad per splat, a ring buffer
    this.decalGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.decalAttr = new THREE.InstancedBufferAttribute(new Float32Array(MAX_DECALS * 3), 3);
    this.decalAttr.setUsage(THREE.DynamicDrawUsage);
    this.decalGeo.setAttribute('aDecal', this.decalAttr);
    this.decalMat = new THREE.MeshStandardMaterial({
      map: splatAtlas(),
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      roughness: 0.3,
      metalness: 0,
    });
    this.decalMat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec3 aDecal;\nvarying float vDecalA;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv = vMapUv * 0.5 + aDecal.xy;\n#endif\nvDecalA = aDecal.z;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vDecalA;')
        .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.a *= vDecalA;');
    };
    this.decalMat.customProgramCacheKey = () => 'blood-decal';
    this.decals = new THREE.InstancedMesh(this.decalGeo, this.decalMat, MAX_DECALS);
    this.decals.frustumCulled = false;
    this.decals.receiveShadow = true;
    this.decals.renderOrder = 1;
    _m.makeScale(0, 0, 0);
    for (let i = 0; i < MAX_DECALS; i++) {
      this.decals.setMatrixAt(i, _m);
      this.decals.setColorAt(i, _c.setHex(0x000000));
    }
    this.decals.count = 0;
    scene.add(this.decals);
  }

  private get on(): boolean {
    return settings.blood;
  }

  // ------------------------------------------------------------------ particles
  private emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, color: number, kind: number, alpha = 1) {
    const i = this.nextP;
    this.nextP = (this.nextP + 1) % MAX_P;
    if (this.kind[i] === 0) this.activeP++;
    this.pPos[i * 3] = x;
    this.pPos[i * 3 + 1] = y;
    this.pPos[i * 3 + 2] = z;
    this.vel[i * 3] = vx;
    this.vel[i * 3 + 1] = vy;
    this.vel[i * 3 + 2] = vz;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.pSize[i] = size;
    this.pAlpha[i] = alpha;
    _c.setHex(color);
    this.pCol[i * 3] = _c.r;
    this.pCol[i * 3 + 1] = _c.g;
    this.pCol[i * 3 + 2] = _c.b;
    this.kind[i] = kind;
  }

  /**
   * A hit: droplets thrown out of the wound along the shot direction, plus a short mist.
   * `strength` is roughly damage / max hp (0..1+).
   */
  spurt(point: THREE.Vector3, dir: THREE.Vector3, strength: number) {
    const s = Math.min(1.5, Math.max(0.15, strength));
    if (!this.on) {
      this.dust(point, 0.5 + s * 0.5);
      return;
    }
    const n = Math.round(10 + s * 16);
    for (let k = 0; k < n; k++) {
      // out of the entry wound backwards (spatter) and through along the shot
      const back = Math.random() < 0.45 ? -0.7 : 1.4;
      const sp = 0.8 + Math.random() * 1.6;
      const vx = dir.x * back * sp + (Math.random() - 0.5) * 2.2;
      const vy = dir.y * back * sp + Math.random() * 1.8 + 0.3;
      const vz = dir.z * back * sp + (Math.random() - 0.5) * 2.2;
      const col = Math.random() < 0.5 ? 0x7a0c0a : Math.random() < 0.5 ? 0x5a0807 : 0x3a0504;
      this.emit(point.x, point.y, point.z, vx, vy, vz, 0.6 + Math.random() * 0.5, 0.035 + Math.random() * 0.05, col, 1);
    }
    for (let k = 0; k < 3; k++) {
      this.emit(point.x, point.y, point.z, dir.x * 0.6 + (Math.random() - 0.5) * 0.4, 0.15 + Math.random() * 0.2, dir.z * 0.6 + (Math.random() - 0.5) * 0.4, 0.18 + Math.random() * 0.08, 0.22 + s * 0.12, 0x6a0a08, 3, 0.45);
    }
  }

  /** One or two drops falling from a wound. */
  drip(pos: THREE.Vector3) {
    if (!this.on) return;
    const n = Math.random() < 0.4 ? 2 : 1;
    for (let k = 0; k < n; k++) this.emit(pos.x + (Math.random() - 0.5) * 0.05, pos.y, pos.z + (Math.random() - 0.5) * 0.05, (Math.random() - 0.5) * 0.2, -0.4, (Math.random() - 0.5) * 0.2, 1.2, 0.035, 0x5a0807, 1);
  }

  /** A puff of dust (paws scraping, a body hitting the ground, a stomp). Works with blood off too. */
  dust(at: THREE.Vector3, strength = 1, color = 0x8a7a62) {
    const n = Math.round(6 + 10 * Math.min(2, strength));
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (0.6 + Math.random() * 1.4) * Math.min(2.2, 0.6 + strength * 0.6);
      this.emit(at.x, at.y + 0.05, at.z, Math.cos(a) * sp, 0.3 + Math.random() * 0.9, Math.sin(a) * sp, 0.7 + Math.random() * 0.7, 0.18 + Math.random() * 0.25 * Math.min(2, strength), color, 2, 0.5);
    }
  }

  /** A ring of dust running outwards (boss stomp). */
  dustRing(at: THREE.Vector3, radius: number, color = 0x8a7a62) {
    const n = 40;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const sp = radius * 2.2;
      this.emit(at.x + Math.cos(a) * 0.5, at.y + 0.1, at.z + Math.sin(a) * 0.5, Math.cos(a) * sp, 0.4 + Math.random() * 0.5, Math.sin(a) * sp, 0.55 + Math.random() * 0.2, 0.35 + Math.random() * 0.3, color, 2, 0.55);
    }
  }

  // ------------------------------------------------------------------ decals
  private placeDecal(x: number, z: number, size: number, variant: Variant, color: number, life: number, alpha: number, yaw = Math.random() * Math.PI * 2): number {
    const i = this.nextD;
    this.nextD = (this.nextD + 1) % MAX_DECALS;
    if (this.decals.count < MAX_DECALS) this.decals.count = Math.max(this.decals.count, i + 1);
    // remove a pool that used this slot
    for (let k = this.pools.length - 1; k >= 0; k--) if (this.pools[k].slot === i) this.pools.splice(k, 1);
    const y = this.world.height(x, z);
    this.setDecalMatrix(i, x, y, z, size, yaw);
    this.decals.setColorAt(i, _c.setHex(color));
    this.decalAttr.setXYZ(i, (variant % 2) * 0.5, variant < 2 ? 0.5 : 0, alpha);
    this.decalBorn[i] = this.time;
    this.decalLife[i] = life;
    this.decalAlpha[i] = alpha;
    this.dirtyDecals = true;
    if (this.decals.instanceColor) this.decals.instanceColor.needsUpdate = true;
    return i;
  }

  private setDecalMatrix(i: number, x: number, y: number, z: number, size: number, yaw: number) {
    // align to the terrain normal from finite differences
    const e = 0.4;
    const hx = this.world.height(x + e, z) - this.world.height(x - e, z);
    const hz = this.world.height(x, z + e) - this.world.height(x, z - e);
    _n.set(-hx, 2 * e, -hz).normalize();
    _q.setFromUnitVectors(UP, _n);
    _q2.setFromAxisAngle(UP, yaw);
    _q.multiply(_q2);
    _s.set(size, 1, size);
    _v.set(x, y + 0.012, z);
    _m.compose(_v, _q, _s);
    this.decals.setMatrixAt(i, _m);
    this.decals.instanceMatrix.needsUpdate = true;
  }

  /** A trail mark under a wounded animal (or scuffed earth with blood off). */
  trail(pos: THREE.Vector3, size: number) {
    if (this.on) this.placeDecal(pos.x, pos.z, size, Math.random() < 0.7 ? 2 : 0, Math.random() < 0.5 ? 0x5a0a08 : 0x420605, TRAIL_LIFE, 0.9);
    else this.placeDecal(pos.x, pos.z, size * 1.2, 2, 0x2e271e, TRAIL_LIFE, 0.55);
  }

  /** A splash where an animal was hit or fell. */
  splash(pos: THREE.Vector3, size: number) {
    if (this.on) this.placeDecal(pos.x, pos.z, size, Math.random() < 0.5 ? 0 : 1, 0x500907, TRAIL_LIFE, 0.95);
  }

  /** A pool spreading under a corpse over a few seconds. */
  pool(pos: THREE.Vector3, size: number) {
    const color = this.on ? 0x3e0505 : 0x2a2219;
    const yaw = Math.random() * Math.PI * 2;
    const slot = this.placeDecal(pos.x, pos.z, 0.01, 3, color, POOL_LIFE, this.on ? 0.97 : 0.5, yaw);
    if (this.pools.length >= MAX_POOLS) this.pools.shift();
    this.pools.push({ slot, x: pos.x, y: this.world.height(pos.x, pos.z), z: pos.z, size: this.on ? size : size * 0.6, t: 0, grow: 5, yaw });
  }

  update(dt: number) {
    this.time += dt;
    // particles
    if (this.activeP > 0) {
      for (let i = 0; i < MAX_P; i++) {
        const k = this.kind[i];
        if (k === 0) continue;
        this.life[i] -= dt;
        const i3 = i * 3;
        if (this.life[i] <= 0) {
          this.kind[i] = 0;
          this.activeP--;
          this.pAlpha[i] = 0;
          this.pPos[i3 + 1] = -9999;
          continue;
        }
        const f = this.life[i] / this.maxLife[i];
        if (k === 1) {
          this.vel[i3 + 1] -= 9 * dt;
          this.pPos[i3] += this.vel[i3] * dt;
          this.pPos[i3 + 1] += this.vel[i3 + 1] * dt;
          this.pPos[i3 + 2] += this.vel[i3 + 2] * dt;
          const gy = this.world.height(this.pPos[i3], this.pPos[i3 + 2]);
          if (this.pPos[i3 + 1] < gy) {
            // lands: leaves a tiny spot now and then
            if (Math.random() < 0.3) this.placeDecal(this.pPos[i3], this.pPos[i3 + 2], 0.05 + Math.random() * 0.08, 2, 0x4a0706, TRAIL_LIFE, 0.85);
            this.kind[i] = 0;
            this.activeP--;
            this.pAlpha[i] = 0;
            this.pPos[i3 + 1] = -9999;
            continue;
          }
          this.pAlpha[i] = Math.min(1, f * 3);
        } else {
          // dust and mist: drag, slight rise, grow and fade
          const drag = Math.exp(-3 * dt);
          this.vel[i3] *= drag;
          this.vel[i3 + 1] = this.vel[i3 + 1] * drag + (k === 2 ? 0.2 : 0) * dt;
          this.vel[i3 + 2] *= drag;
          this.pPos[i3] += this.vel[i3] * dt;
          this.pPos[i3 + 1] += this.vel[i3 + 1] * dt;
          this.pPos[i3 + 2] += this.vel[i3 + 2] * dt;
          this.pSize[i] += dt * (k === 2 ? 0.25 : 0.8);
          this.pAlpha[i] = (k === 2 ? 0.45 : 0.4) * f;
        }
      }
      const ga = this.points.geometry.attributes;
      ga.position.needsUpdate = true;
      ga.aAlpha.needsUpdate = true;
      ga.aSize.needsUpdate = true;
      ga.aCol.needsUpdate = true;
    }
    // growing pools
    for (const p of this.pools) {
      if (p.t >= p.grow) continue;
      p.t = Math.min(p.grow, p.t + dt);
      const k = 1 - Math.pow(1 - p.t / p.grow, 2);
      this.setDecalMatrix(p.slot, p.x, p.y, p.z, Math.max(0.01, p.size * k), p.yaw);
    }
    // slow fade of old decals (4 times a second is plenty)
    this.fadeTimer -= dt;
    if (this.fadeTimer <= 0) {
      this.fadeTimer = 0.25;
      for (let i = 0; i < this.decals.count; i++) {
        const age = this.time - this.decalBorn[i];
        const life = this.decalLife[i];
        if (life <= 0) continue;
        const fade = age < life * 0.6 ? 1 : Math.max(0, 1 - (age - life * 0.6) / (life * 0.4));
        // blood darkens as it dries
        this.decalAttr.setZ(i, this.decalAlpha[i] * fade);
        if (fade <= 0) this.decalLife[i] = 0;
      }
      this.dirtyDecals = true;
    }
    if (this.dirtyDecals) {
      this.decalAttr.needsUpdate = true;
      this.dirtyDecals = false;
    }
  }

  dispose() {
    this.scene.remove(this.points, this.decals);
    this.points.geometry.dispose();
    this.pointMat.dispose();
    this.decalGeo.dispose();
    this.decalMat.dispose();
    this.decals.dispose();
  }
}
