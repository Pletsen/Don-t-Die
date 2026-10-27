import * as THREE from 'three';
import { Rng } from '../game/rng';
import type { LevelDef } from '../data/levels';
import { lightingAt, nightAt, type Lighting } from '../data/lighting';
import { qualityProfile } from '../game/settings';
import { Cave } from './Cave';
import { Horizon, Sky } from './Sky';
import { buildVegetation, type VegChunk, type WindUniforms } from './Vegetation';
import { groundTexture, trailTexture } from './textures';

interface Collider {
  x: number;
  z: number;
  r: number;
  h: number; // height of the solid part (arrows stop below this)
}

/** Colour grade the lead feeds into the grade pass (Game.gradePass): tint multiplies, sat around luminance. */
export interface Grade {
  tint: THREE.Vector3;
  saturation: number;
  vignette: number;
  /** Small blue lift added to the blacks at night (add `lift * vec3(0.6, 0.8, 1.0)` before the tint). */
  lift: number;
}

const CELL = 8;
/** Half size of the area the sun's shadow map covers, in metres. */
const SHADOW_HALF = 32;
/** The view never reaches further than this, whatever the fog; the horizon ring hides what is beyond. */
const MAX_VIEW = 125;

/** Terrain, trees, rocks, lights, sky and the cave for one level. */
export class World {
  readonly scene: THREE.Scene;
  readonly light: Lighting;
  /** 0 until dusk, 1 at full night (smooth). */
  readonly night: number;
  readonly sky: Sky;
  readonly horizon: Horizon;
  readonly sun: THREE.DirectionalLight;
  /** The hunter's lantern light (kept under its old name). */
  readonly torch: THREE.PointLight;
  /** Lantern model; World places it at the hunter's belt every frame. */
  readonly lantern = new THREE.Group();
  readonly caveEntrance = new THREE.Vector3();
  readonly spawn = new THREE.Vector3();
  /**
   * How far the camera should see, in metres: from the fog (where it is ~97 % opaque) capped at MAX_VIEW and
   * scaled by the quality profile. The lead sets `camera.far = world.viewDistance` (World.update also does it).
   */
  readonly viewDistance: number;
  /** Colour grade for this level's time of day. */
  readonly grade: Grade;
  readonly windUniforms: WindUniforms = {
    uTime: { value: 0 },
    uWind: { value: new THREE.Vector3() },
    uFocusPx: { value: new THREE.Vector2() },
    uFocusR: { value: 0 },
    uFocusZ: { value: 0 },
    uGrassNear: { value: 12 },
    uGrassFar: { value: 46 },
  };
  private colliders: Collider[] = [];
  private grid = new Map<number, Collider[]>();
  private fill: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private sunDir: THREE.Vector3;
  private cave: Cave;
  private chunks: VegChunk[] = [];
  private disposables: { dispose(): void }[] = [];
  private roots: THREE.Object3D[] = [];
  private renderer?: THREE.WebGLRenderer;
  private lanternCore!: THREE.MeshStandardMaterial;
  private lastFocus = new THREE.Vector3();
  private swing = 0;
  private swingV = 0;
  private readonly fogDensity: number;
  private readonly cavePos = new THREE.Vector3();
  private v1 = new THREE.Vector3();
  private v2 = new THREE.Vector3();
  private v3 = new THREE.Vector3();
  private bufSize = new THREE.Vector2();

  constructor(scene: THREE.Scene, readonly level: LevelDef, renderer?: THREE.WebGLRenderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.light = lightingAt(level.tod);
    this.night = nightAt(level.tod);
    const q = qualityProfile();
    const rng = new Rng(level.seed);
    const L = this.light;

    // fog decides the view distance; on lower quality the fog thickens to match the shorter view
    this.fogDensity = L.fogDensity / q.viewScale;
    this.viewDistance = Math.round(Math.min(MAX_VIEW, 1.9 / L.fogDensity + 10) * q.viewScale);
    scene.background = new THREE.Color(L.fogColor);
    scene.fog = new THREE.FogExp2(L.fogColor, this.fogDensity);
    this.grade = {
      tint: new THREE.Vector3(L.gradeR, L.gradeG, L.gradeB),
      saturation: L.gradeSat,
      vignette: L.gradeVignette,
      lift: L.gradeLift,
    };
    this.windUniforms.uGrassFar!.value = 46 * q.viewScale;

    // ---------- lights ----------
    this.hemi = new THREE.HemisphereLight(L.hemiSky, L.hemiGround, L.hemiIntensity);
    this.add(this.hemi);
    this.sky = new Sky(L, this.night);
    this.sky.setRadius(this.viewDistance * 0.97);
    this.sunDir = Sky.direction(L.sunElevation, L.sunAzimuth);
    if (renderer) {
      // image based light from the sky: gives metal, wet leaves and fur a believable ambient reflection.
      // The cube camera must reach the dome (radius 500), so near/far are passed explicitly.
      const envScene = new THREE.Scene();
      const envSky = new Sky(L, this.night);
      envScene.add(envSky.group);
      const pm = new THREE.PMREMGenerator(renderer);
      const rt = pm.fromScene(envScene, 0.04, 1, 1000);
      scene.environment = rt.texture;
      scene.environmentIntensity = 0.2 + 0.15 * (1 - this.night);
      pm.dispose();
      envSky.dispose();
      this.disposables.push(rt);
    }
    this.sun = new THREE.DirectionalLight(L.sunColor, L.sunIntensity);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(q.shadowMap, q.shadowMap);
    const sc = this.sun.shadow.camera;
    sc.left = -SHADOW_HALF; sc.right = SHADOW_HALF; sc.top = SHADOW_HALF; sc.bottom = -SHADOW_HALF; sc.near = 1; sc.far = 200;
    sc.updateProjectionMatrix();
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.04;
    // softer moon shadows (used by PCF / VSM shadow types; PCFSoft ignores it)
    this.sun.shadow.radius = 1 + this.night * 2;
    this.add(this.sun, this.sun.target);
    this.add(this.sky.group);
    this.horizon = new Horizon(this.viewDistance, L, this.night);
    this.add(this.horizon.mesh);

    // fill from the camera side: warm-neutral by day; at night a cold moon rim from camera-left-up
    const fillCol = new THREE.Color(0xdfe8ff).lerp(new THREE.Color(0xa8bcff), this.night);
    this.fill = new THREE.DirectionalLight(fillCol, (0.5 - this.night * 0.3) + this.night * (0.25 + 0.15));
    this.add(this.fill, this.fill.target);

    // the hunter's lantern only matters when it gets dark
    this.torch = new THREE.PointLight(0xffb066, this.night * 7, 18, 1.7);
    this.torch.visible = this.night > 0.02;
    this.buildLantern();
    this.add(this.torch, this.lantern);

    this.spawn.set(this.trailX(0), 0, 0);
    const veg = buildVegetation({
      scene,
      level,
      rng,
      night: this.night,
      height: (x, z) => this.height(x, z),
      trailX: (z) => this.trailX(z),
      isFree: (x, z, r) => this.isFree(x, z, r),
      addCollider: (x, z, r, h) => this.addCollider(x, z, r, h),
      spawn: this.spawn,
      cave: new THREE.Vector3(this.trailX(-level.length), 0, -level.length),
      uniforms: this.windUniforms,
      disposables: this.disposables,
    });
    this.chunks = veg.chunks;
    this.roots.push(...veg.chunks.map((c) => c.mesh));
    this.buildTerrain(rng);
    this.buildTrail();
    this.cave = this.buildCave();
    this.spawn.y = this.height(this.spawn.x, this.spawn.z);
  }

  private add(...objs: THREE.Object3D[]) {
    for (const o of objs) {
      this.scene.add(o);
      this.roots.push(o);
    }
  }

  /** The winding trail towards the cave. Trees keep clear of it, animals do not. */
  trailX(z: number): number {
    const L = this.level.length;
    const f = (zz: number) => 8 * (Math.sin(zz * 0.025) + 0.5 * Math.sin(zz * 0.06 + 1) - 0.5 * Math.sin(1));
    // fade the wiggle out at the end so the cave sits on a straight bit
    const fade = Math.min(1, Math.max(0, (L + z) / 30));
    return f(z) * (0.3 + 0.7 * fade);
  }

  height(x: number, z: number): number {
    const L = this.level.length;
    let h = 1.6 * Math.sin(x * 0.04 + 0.7) * Math.cos(z * 0.033) + 0.8 * Math.sin(x * 0.11 + z * 0.07) + 0.4 * Math.sin(z * 0.15 - x * 0.05);
    const flat = smooth(0, 26, Math.abs(z)) * smooth(0, 26, Math.abs(z + L));
    h *= flat;
    return h;
  }

  private buildTerrain(rng: Rng) {
    const L = this.level.length;
    const W = this.level.width + 80;
    const D = L + 120;
    const seg = 1.8;
    const nx = Math.round(W / seg);
    const nz = Math.round(D / seg);
    const geo = new THREE.PlaneGeometry(W, D, nx, nz);
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, 0, -L / 2);
    const p = geo.attributes.position;
    const colors = new Float32Array(p.count * 3);
    const c = new THREE.Color();
    const dirt = new THREE.Color(0.34, 0.26, 0.18);
    const moss = new THREE.Color(0.14, 0.28, 0.09);
    const leaf = new THREE.Color(0.42, 0.24, 0.1);
    const dry = new THREE.Color(0.38, 0.36, 0.17);
    const damp = new THREE.Color(0.1, 0.17, 0.08);
    const night = this.night;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const z = p.getZ(i);
      const h = this.height(x, z);
      p.setY(i, h);
      const patch = 0.5 + 0.5 * Math.sin(x * 0.21 + Math.sin(z * 0.17) * 2) * Math.cos(z * 0.13 + x * 0.05);
      const litter = Math.max(0, Math.sin(x * 0.09 + 2) * Math.sin(z * 0.11 + 1) + 0.15);
      const trail = Math.exp(-Math.pow((x - this.trailX(z)) / 2.1, 2));
      // large-scale variation (1/40 m): drier, yellower ground in some stretches, lusher in others
      const macro = 0.5 + 0.5 * Math.sin(x * 0.027 + 1.1 + Math.sin(z * 0.019) * 1.5) * Math.sin(z * 0.023 - 0.4);
      // hollows (terrain lower than its surroundings) are damp and dark
      const lap = (this.height(x + 4, z) + this.height(x - 4, z) + this.height(x, z + 4) + this.height(x, z - 4)) / 4 - h;
      c.setRGB(0.19 + patch * 0.1, 0.32 + patch * 0.13, 0.12 + patch * 0.05);
      c.lerp(dry, Math.max(0, macro - 0.45) * 0.7);
      c.lerp(moss, Math.max(0, Math.sin(x * 0.31 + z * 0.23)) * 0.25);
      c.lerp(leaf, litter * 0.45);
      c.lerp(damp, Math.min(0.55, Math.max(0, lap * 1.4)));
      c.lerp(dirt, trail * 0.8);
      // soft shadow blobs under trees and rocks
      let ao = 1;
      for (let dx = -1; dx <= 1; dx++)
        for (let dz = -1; dz <= 1; dz++) {
          const cell = this.grid.get((Math.floor(x / CELL) + dx) * 100003 + Math.floor(z / CELL) + dz);
          if (!cell) continue;
          for (const col of cell) {
            const d = Math.hypot(x - col.x, z - col.z);
            const reach = col.r + (col.h > 3 ? 1.8 : 0.9);
            if (d < reach) ao = Math.min(ao, 0.5 + 0.5 * (d / reach));
          }
        }
      c.multiplyScalar(ao * (1 - night * 0.2));
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const tex = groundTexture(rng.int(1, 99999), W / 6, D / 6);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: tex, bumpMap: tex, bumpScale: 3, roughness: 1, metalness: 0 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    this.add(mesh);
  }

  /**
   * The trail itself: a draped strip with a dirt texture (wheel-less ruts worn by feet and game, roots, pebbles)
   * and soft edges, a little above the terrain. One draw call.
   */
  private buildTrail() {
    const L = this.level.length;
    const z0 = 12;
    const z1 = -L - 6;
    const across = 6;
    const width = 3.2;
    const rows = Math.ceil((z0 - z1) / 1.0);
    const pos = new Float32Array((rows + 1) * (across + 1) * 3);
    const uv = new Float32Array((rows + 1) * (across + 1) * 2);
    const idx: number[] = [];
    for (let r = 0; r <= rows; r++) {
      const z = z0 - (r / rows) * (z0 - z1);
      const cx = this.trailX(z);
      // tangent of the trail for a perpendicular cross-section
      const dx = this.trailX(z - 0.5) - this.trailX(z + 0.5);
      const len = Math.hypot(dx, 1);
      const px = 1 / len;
      const pz = dx / len;
      for (let a = 0; a <= across; a++) {
        const t = a / across - 0.5;
        const x = cx + px * t * width;
        const zz = z + pz * t * width;
        const k = (r * (across + 1) + a) * 3;
        pos[k] = x;
        pos[k + 1] = this.height(x, zz) + 0.035;
        pos[k + 2] = zz;
        uv[(r * (across + 1) + a) * 2] = a / across;
        uv[(r * (across + 1) + a) * 2 + 1] = ((z0 - z) / width) * 0.5;
      }
    }
    for (let r = 0; r < rows; r++)
      for (let a = 0; a < across; a++) {
        const i0 = r * (across + 1) + a;
        const i1 = i0 + 1;
        const i2 = i0 + across + 1;
        const i3 = i2 + 1;
        idx.push(i0, i2, i1, i1, i2, i3);
      }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const tex = trailTexture();
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      roughness: 1,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      color: new THREE.Color(1, 1, 1).multiplyScalar(1 - this.night * 0.2),
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.renderOrder = -1;
    this.add(mesh);
  }

  private buildCave(): Cave {
    const L = this.level.length;
    const cx = this.trailX(-L);
    const cz = -L;
    const y = this.height(cx, cz);
    this.caveEntrance.set(cx, y, cz + 3);
    const cave = new Cave(this.night, this.light.fogColor, this.light.hemiGround);
    cave.group.position.set(cx, y, cz);
    this.cavePos.set(cx, y, cz);
    cave.beacon.position.copy(this.cavePos);
    this.add(cave.group, cave.beacon);
    // The cave heap is solid, a few colliders keep the player out of the rock.
    this.addCollider(cx - 6, cz - 1, 4, 8);
    this.addCollider(cx + 6, cz - 1, 4, 8);
    this.addCollider(cx, cz - 4, 6, 10);
    this.addCollider(cx - 9, cz - 4, 4, 8);
    this.addCollider(cx + 9, cz - 4, 4, 8);
    return cave;
  }

  /** A small horn-and-iron lantern with a warm emissive core; hangs from the hunter's belt. */
  private buildLantern() {
    const metal = new THREE.MeshStandardMaterial({ color: 0x2a2620, roughness: 0.55, metalness: 0.6 });
    this.lanternCore = new THREE.MeshStandardMaterial({
      color: 0x3a2a14,
      emissive: 0xffb35a,
      emissiveIntensity: 2.2 * Math.min(1, this.night * 1.5),
      roughness: 0.6,
      transparent: true,
      opacity: 0.92,
    });
    const frame = new THREE.Group();
    const bar = new THREE.BoxGeometry(0.012, 0.15, 0.012);
    for (const [x, z] of [[-0.045, -0.045], [0.045, -0.045], [-0.045, 0.045], [0.045, 0.045]]) {
      const m = new THREE.Mesh(bar, metal);
      m.position.set(x, 0, z);
      frame.add(m);
    }
    const capGeo = new THREE.ConeGeometry(0.075, 0.06, 4).rotateY(Math.PI / 4);
    const cap = new THREE.Mesh(capGeo, metal);
    cap.position.y = 0.105;
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.015, 0.11), metal);
    base.position.y = -0.08;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.005, 4, 10), metal);
    ring.position.y = 0.15;
    const core = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.13, 0.08), this.lanternCore);
    frame.add(cap, base, ring, core);
    // the lantern hangs from its ring: offset the body below the pivot
    frame.position.y = -0.16;
    this.lantern.add(frame);
    this.lantern.visible = this.night > 0.02;
  }

  addCollider(x: number, z: number, r: number, h: number) {
    const c = { x, z, r, h };
    this.colliders.push(c);
    const x0 = Math.floor((x - r) / CELL), x1 = Math.floor((x + r) / CELL);
    const z0 = Math.floor((z - r) / CELL), z1 = Math.floor((z + r) / CELL);
    for (let i = x0; i <= x1; i++)
      for (let j = z0; j <= z1; j++) {
        const k = i * 100003 + j;
        let cell = this.grid.get(k);
        if (!cell) this.grid.set(k, (cell = []));
        cell.push(c);
      }
  }

  private nearby(x: number, z: number): Collider[] {
    return this.grid.get(Math.floor(x / CELL) * 100003 + Math.floor(z / CELL)) ?? [];
  }

  /** Pushes a circle out of trees and rocks. Mutates and returns pos. */
  collide(pos: THREE.Vector3, radius: number, clearance = 0): THREE.Vector3 {
    const L = this.level.length;
    const half = this.level.width / 2 + 4;
    pos.x = Math.min(half, Math.max(-half, pos.x));
    pos.z = Math.min(10, Math.max(-L - 8, pos.z));
    for (let pass = 0; pass < 2; pass++) {
      for (let dx = -1; dx <= 1; dx++)
        for (let dz = -1; dz <= 1; dz++) {
          const cell = this.grid.get((Math.floor(pos.x / CELL) + dx) * 100003 + Math.floor(pos.z / CELL) + dz);
          if (!cell) continue;
          for (const c of cell) {
            if (c.h < clearance) continue; // low things (rocks, logs) can be jumped
            const ox = pos.x - c.x;
            const oz = pos.z - c.z;
            const d = Math.hypot(ox, oz);
            const min = c.r + radius;
            if (d < min && d > 1e-5) {
              pos.x = c.x + (ox / d) * min;
              pos.z = c.z + (oz / d) * min;
            }
          }
        }
    }
    return pos;
  }

  /** True if the point is inside a trunk or rock (used by arrows). */
  hitsSolid(x: number, y: number, z: number): boolean {
    for (const c of this.nearby(x, z)) {
      if (Math.hypot(x - c.x, z - c.z) < c.r && y < this.height(c.x, c.z) + c.h) return true;
    }
    return false;
  }

  /** Clear line between two points at chest height? Samples the colliders along the way. */
  lineBlocked(a: THREE.Vector3, b: THREE.Vector3): boolean {
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    const steps = Math.ceil(d / 1.5);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = a.x + (b.x - a.x) * t;
      const z = a.z + (b.z - a.z) * t;
      for (const c of this.nearby(x, z)) {
        if (c.h > 2 && Math.hypot(x - c.x, z - c.z) < c.r) return true;
      }
    }
    return false;
  }

  /**
   * First hit of the segment a→b against tree/rock colliders (xz circles, solid below their height).
   * Returns the fraction 0..1 along the segment, or 1 if nothing is hit. `pad` widens every collider.
   */
  raycastColliders(a: THREE.Vector3, b: THREE.Vector3, pad = 0): number {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(len / 2));
    let best = 1;
    const seen = new Set<Collider>();
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      for (const c of this.nearby(a.x + dx * t, a.z + dz * t)) {
        if (seen.has(c)) continue;
        seen.add(c);
        const r = c.r + pad;
        // ray/circle in xz
        const fx = a.x - c.x;
        const fz = a.z - c.z;
        const A = dx * dx + dz * dz;
        if (A < 1e-9) continue;
        const B = 2 * (fx * dx + fz * dz);
        const C = fx * fx + fz * fz - r * r;
        const disc = B * B - 4 * A * C;
        if (disc < 0) continue;
        let h = (-B - Math.sqrt(disc)) / (2 * A);
        if (C < 0) h = 0; // starts inside
        if (h < 0 || h > best) continue;
        const y = a.y + (b.y - a.y) * h;
        if (y > this.height(c.x, c.z) + c.h) continue;
        best = h;
      }
    }
    return best;
  }

  isFree(x: number, z: number, r: number): boolean {
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++) {
        const cell = this.grid.get((Math.floor(x / CELL) + dx) * 100003 + Math.floor(z / CELL) + dz);
        if (!cell) continue;
        for (const c of cell) if (Math.hypot(x - c.x, z - c.z) < c.r + r) return false;
      }
    return true;
  }

  /** Direction (x, z) and strength of the wind, for swaying grass and trees. */
  setWind(dx: number, dz: number, strength: number) {
    this.windUniforms.uWind.value.set(dx * strength, 0, dz * strength);
    this.cave.setWind(dx, dz, strength);
  }

  /**
   * Per frame. `focus` is the hunter (or the camera position in menus). `heading` is the hunter's facing
   * (Player.heading, forward = (sin h, 0, cos h)); without it the camera's yaw is used.
   */
  update(dt: number, focus: THREE.Vector3, camera: THREE.Camera, time: number, heading?: number) {
    this.windUniforms.uTime.value = time;
    this.sky.update(time);
    this.cave.update(time);

    // far plane from the fog (the lead may also set this; doing it here keeps it right after every level change)
    const cam = camera as THREE.PerspectiveCamera;
    if (cam.isPerspectiveCamera && cam.far !== this.viewDistance) {
      cam.far = this.viewDistance;
      cam.updateProjectionMatrix();
    }

    const fwd = this.v1;
    camera.getWorldDirection(fwd);
    fwd.y = 0;
    if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1);
    fwd.normalize();

    // ---------- sun / moon shadow: centred ahead of the camera, snapped to shadow texels so it does not shimmer ----------
    const centre = this.v2.copy(focus).addScaledVector(fwd, SHADOW_HALF * 0.35);
    const ld = this.sunDir;
    const right = this.v3.set(0, 1, 0).cross(ld).normalize();
    const up = this.tmpUp.copy(ld).cross(right).normalize();
    const texel = (2 * SHADOW_HALF) / this.sun.shadow.mapSize.x;
    const cr = centre.dot(right);
    const cu = centre.dot(up);
    centre.addScaledVector(right, Math.round(cr / texel) * texel - cr).addScaledVector(up, Math.round(cu / texel) * texel - cu);
    this.sun.target.position.copy(centre);
    this.sun.position.copy(centre).addScaledVector(ld, 90);

    this.sky.follow(camera.position);
    this.horizon.follow(camera.position);

    // fill: from the camera; at night lifted and pushed to camera-left so it rims the hunter's shoulder
    const camRight = this.tmpRight.set(-fwd.z, 0, fwd.x);
    this.fill.position.copy(camera.position).addScaledVector(camRight, -4 * this.night).addScaledVector(this.tmpUp.set(0, 1, 0), 3 * this.night);
    this.fill.target.position.copy(focus);

    // ---------- lantern on the hunter's belt ----------
    const inMenu = focus.distanceToSquared(camera.position) < 0.25;
    const lit = this.night > 0.02 && !inMenu;
    this.lantern.visible = lit;
    this.torch.visible = lit;
    if (lit) {
      const h = heading ?? Math.atan2(fwd.x, fwd.z);
      const sh = Math.sin(h);
      const ch = Math.cos(h);
      // hunter-local (+0.3 left, 1.0 up, 0.05 forward); local +x is the hunter's left
      const lx = 0.3;
      const lz = 0.05;
      const wx = focus.x + lx * ch + lz * sh;
      const wz = focus.z - lx * sh + lz * ch;
      this.lantern.position.set(wx, focus.y + 1.0, wz);
      this.lantern.rotation.set(0, h, 0);
      // swing from the hunter's acceleration (a damped pendulum)
      const vx = dt > 0 ? (focus.x - this.lastFocus.x) / dt : 0;
      const vz = dt > 0 ? (focus.z - this.lastFocus.z) / dt : 0;
      const along = Math.max(-8, Math.min(8, vx * sh + vz * ch));
      const dtc = Math.min(dt, 0.05);
      this.swingV += ((-along * 0.05 - this.swing) * 30 - this.swingV * 4) * dtc;
      this.swing = Math.max(-0.6, Math.min(0.6, this.swing + this.swingV * dtc));
      const bob = Math.sin(time * 9) * Math.min(1, Math.abs(along) / 4) * 0.12;
      this.lantern.children[0].rotation.x = this.swing + bob;
      // the light sits just outside the lantern, away from the body, so it lights the ground and the hunter's side
      this.torch.position.set(wx + 0.25 * ch, focus.y + 0.95, wz - 0.25 * sh);
      const flick = 0.92 + Math.sin(time * 13) * 0.04 + Math.sin(time * 5.7) * 0.04;
      this.torch.intensity = this.night * 7 * flick;
    }
    this.lastFocus.copy(focus);

    // ---------- see-through circle round the hunter for foliage in between ----------
    const U = this.windUniforms;
    if (this.renderer && !inMenu) {
      this.renderer.getDrawingBufferSize(this.bufSize);
      const chest = this.tmpChest.set(focus.x, focus.y + 1.1, focus.z);
      const view = this.tmpView.copy(chest).applyMatrix4(camera.matrixWorldInverse);
      chest.project(camera);
      U.uFocusPx!.value.set((chest.x * 0.5 + 0.5) * this.bufSize.x, (chest.y * 0.5 + 0.5) * this.bufSize.y);
      U.uFocusR!.value = this.bufSize.y * 0.16;
      U.uFocusZ!.value = -view.z;
    } else U.uFocusR!.value = 0;

    // ---------- vegetation chunks by distance along the level ----------
    const cz = camera.position.z;
    const vd = this.viewDistance + 4;
    for (const c of this.chunks) {
      const dz = cz < c.z0 ? c.z0 - cz : cz > c.z1 ? cz - c.z1 : 0;
      c.mesh.visible = dz < Math.min(vd, c.maxDist);
    }

    // ---------- smoke beacon: pulled inside the view distance when the cave is further away ----------
    const dx = this.cavePos.x - camera.position.x;
    const dzc = this.cavePos.z - camera.position.z;
    const dist = Math.hypot(dx, dzc);
    const near = this.viewDistance * 0.8;
    if (dist > near) {
      const k = near / dist;
      this.cave.beacon.position.set(camera.position.x + dx * k, this.cavePos.y * k + camera.position.y * (1 - k), camera.position.z + dzc * k);
      this.cave.beacon.scale.setScalar(k);
    } else {
      this.cave.beacon.position.copy(this.cavePos);
      this.cave.beacon.scale.setScalar(1);
    }
    // the column is tall: its upper half rises out of the ground fog, so weight the fog lighter than at ground level
    const fd = dist * this.fogDensity * 0.75;
    this.cave.setBeaconFog(Math.min(0.85, 1 - Math.exp(-fd * fd)));
  }
  private tmpUp = new THREE.Vector3();
  private tmpRight = new THREE.Vector3();
  private tmpChest = new THREE.Vector3();
  private tmpView = new THREE.Vector3();

  /**
   * Frees every GPU resource this world created (geometries, materials, textures, the PMREM target) and, as a
   * safety net against leaks between levels, every geometry / material / texture still attached to the scene
   * (animals, player, loot ...). Shared module-level resources that get disposed this way are simply uploaded
   * again the next time they are drawn.
   */
  dispose() {
    const geos = new Set<THREE.BufferGeometry>();
    const mats = new Set<THREE.Material>();
    const texs = new Set<THREE.Texture>();
    const collect = (o: THREE.Object3D) => {
      const m = o as THREE.Mesh;
      if (m.geometry) geos.add(m.geometry);
      if (m.material) (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => mats.add(x));
    };
    for (const r of this.roots) r.traverse(collect);
    this.scene.traverse(collect);
    for (const m of mats) {
      for (const v of Object.values(m)) if (v && (v as THREE.Texture).isTexture) texs.add(v as THREE.Texture);
      const u = (m as THREE.ShaderMaterial).uniforms;
      if (u) for (const k in u) {
        const v = u[k]?.value;
        if (v && (v as THREE.Texture).isTexture) texs.add(v as THREE.Texture);
      }
    }
    if (this.scene.environment) texs.add(this.scene.environment);
    geos.forEach((g) => g.dispose());
    mats.forEach((m) => m.dispose());
    texs.forEach((t) => t.dispose());
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
    this.roots = [];
    this.chunks = [];
    this.scene.environment = null;
    this.scene.clear();
  }
}

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
