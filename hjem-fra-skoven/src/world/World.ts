import * as THREE from 'three';
import { Rng } from '../game/rng';
import type { LevelDef } from '../data/levels';
import { lightingAt, type Lighting } from '../data/lighting';
import { Sky } from './Sky';
import { buildVegetation, type WindUniforms } from './Vegetation';
import { groundTexture } from './textures';

interface Collider {
  x: number;
  z: number;
  r: number;
  h: number; // height of the solid part (arrows stop below this)
}

const CELL = 8;

/** Terrain, trees, rocks, lights, sky and the cave for one level. */
export class World {
  readonly scene: THREE.Scene;
  readonly light: Lighting;
  readonly night: number;
  readonly sky: Sky;
  readonly sun: THREE.DirectionalLight;
  readonly torch: THREE.PointLight;
  private fill: THREE.DirectionalLight;
  readonly caveEntrance = new THREE.Vector3();
  readonly spawn = new THREE.Vector3();
  readonly windUniforms: WindUniforms = { uTime: { value: 0 }, uWind: { value: new THREE.Vector3() } };
  private colliders: Collider[] = [];
  private grid = new Map<number, Collider[]>();
  private fire!: THREE.PointLight;
  private sunDir: THREE.Vector3;
  private disposables: { dispose(): void }[] = [];

  constructor(scene: THREE.Scene, readonly level: LevelDef, renderer?: THREE.WebGLRenderer) {
    this.scene = scene;
    this.light = lightingAt(level.tod);
    this.night = Math.max(0, (level.tod - 0.45) / 0.55);
    const rng = new Rng(level.seed);

    scene.background = new THREE.Color(this.light.fogColor);
    scene.fog = new THREE.FogExp2(this.light.fogColor, this.light.fogDensity);

    // lights
    const hemi = new THREE.HemisphereLight(this.light.hemiSky, this.light.hemiGround, this.light.hemiIntensity);
    scene.add(hemi);
    this.sky = new Sky(this.light, this.night);
    this.sunDir = this.sky.sunDirection(this.light.sunElevation);
    if (renderer) {
      // image based light from the sky: gives metal, wet leaves and fur a believable ambient reflection
      const envScene = new THREE.Scene();
      envScene.add(new Sky(this.light, this.night).group);
      const pm = new THREE.PMREMGenerator(renderer);
      const rt = pm.fromScene(envScene, 0.04);
      scene.environment = rt.texture;
      scene.environmentIntensity = 0.35 + 0.25 * (1 - this.night);
      pm.dispose();
      this.disposables.push(rt);
    }
    this.sun = new THREE.DirectionalLight(this.light.sunColor, this.light.sunIntensity);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -42; sc.right = 42; sc.top = 42; sc.bottom = -42; sc.near = 1; sc.far = 200;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.05;
    scene.add(this.sun, this.sun.target);
    scene.add(this.sky.group);

    // soft fill from the camera side so the hunter's back is never a black silhouette
    this.fill = new THREE.DirectionalLight(0xdfe8ff, 0.55 - this.night * 0.25);
    scene.add(this.fill, this.fill.target);

    // the hunter's torch only matters when it gets dark
    this.torch = new THREE.PointLight(0xffb066, this.night * 28, 22, 1.6);
    scene.add(this.torch);

    this.spawn.set(this.trailX(0), 0, 0);
    buildVegetation({
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
    this.buildTerrain(rng);
    this.buildCave();
    this.spawn.y = this.height(this.spawn.x, this.spawn.z);
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
    const dirt = new THREE.Color(0.36, 0.28, 0.19);
    const moss = new THREE.Color(0.16, 0.3, 0.1);
    const leaf = new THREE.Color(0.42, 0.24, 0.1);
    const night = this.night;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const z = p.getZ(i);
      p.setY(i, this.height(x, z));
      const patch = 0.5 + 0.5 * Math.sin(x * 0.21 + Math.sin(z * 0.17) * 2) * Math.cos(z * 0.13 + x * 0.05);
      const litter = Math.max(0, Math.sin(x * 0.09 + 2) * Math.sin(z * 0.11 + 1) + 0.15);
      const trail = Math.exp(-Math.pow((x - this.trailX(z)) / 2.1, 2));
      c.setRGB(0.19 + patch * 0.1, 0.32 + patch * 0.13, 0.12 + patch * 0.05);
      c.lerp(moss, Math.max(0, Math.sin(x * 0.31 + z * 0.23)) * 0.25);
      c.lerp(leaf, litter * 0.45);
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
    this.scene.add(mesh);
    this.disposables.push(geo, mat, tex);
  }

  private buildCave() {
    const L = this.level.length;
    const cx = this.trailX(-L);
    const cz = -L;
    const y = this.height(cx, cz);
    this.caveEntrance.set(cx, y, cz + 3);
    const g = new THREE.Group();
    g.position.set(cx, y, cz);
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x55524c, roughness: 1, flatShading: true });
    const dark = new THREE.MeshBasicMaterial({ color: 0x050403 });
    const rng = new Rng(77);
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, yy: number, z: number, sx = 1, sy = 1, sz = 1) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, yy, z);
      mesh.scale.set(sx, sy, sz);
      mesh.rotation.set(rng.range(0, 3), rng.range(0, 3), rng.range(0, 3));
      mesh.castShadow = mesh.receiveShadow = true;
      g.add(mesh);
    };
    const dod = new THREE.DodecahedronGeometry(1, 0);
    this.disposables.push(dod, rockMat, dark);
    // a heap of rocks around a dark mouth facing the player (+z)
    add(dod, rockMat, 0, 6.5, -3, 8, 5, 6);
    add(dod, rockMat, -5.5, 3, -1, 3.5, 4, 3.5);
    add(dod, rockMat, 5.5, 3, -1, 3.5, 4, 3.5);
    add(dod, rockMat, -8, 1.8, -4, 4, 3, 4);
    add(dod, rockMat, 8, 1.8, -4, 4, 3, 4);
    add(dod, rockMat, 0, 10, -5, 5, 3.5, 4);
    const mouth = new THREE.Mesh(new THREE.CircleGeometry(2.6, 16, 0, Math.PI), dark);
    mouth.position.set(0, 0.1, 1.6);
    g.add(mouth);
    const mouthBox = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 0.1), dark);
    mouthBox.position.set(0, 0.1, 1.6);
    g.add(mouthBox);
    // fire in front of the cave
    const stoneGeo = new THREE.DodecahedronGeometry(0.28, 0);
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x4a4944, roughness: 1 });
    this.disposables.push(stoneGeo, stoneMat);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const s = new THREE.Mesh(stoneGeo, stoneMat);
      s.position.set(Math.cos(a) * 0.8, 0.15, 4 + Math.sin(a) * 0.8);
      g.add(s);
    }
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.4, 1.3, 7),
      new THREE.MeshBasicMaterial({ color: 0xffa23a }),
    );
    flame.position.set(0, 0.7, 4);
    g.add(flame);
    this.fire = new THREE.PointLight(0xff8a3a, 60, 38, 1.5);
    this.fire.position.set(0, 1.6, 4.5);
    g.add(this.fire);
    this.fireMesh = flame;
    this.scene.add(g);
    // The cave heap is solid, a few colliders keep the player out of the rock.
    this.addCollider(cx - 6, cz - 1, 4, 8);
    this.addCollider(cx + 6, cz - 1, 4, 8);
    this.addCollider(cx, cz - 4, 6, 10);
    this.addCollider(cx - 9, cz - 4, 4, 8);
    this.addCollider(cx + 9, cz - 4, 4, 8);
  }
  private fireMesh!: THREE.Mesh;

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
  }

  update(dt: number, focus: THREE.Vector3, camera: THREE.Camera, time: number) {
    this.windUniforms.uTime.value = time;
    this.sky.update(time);
    this.sun.position.copy(focus).addScaledVector(this.sunDir, 90);
    this.sun.target.position.copy(focus);
    this.sky.follow(camera.position);
    this.fill.position.copy(camera.position);
    this.fill.target.position.copy(focus);
    this.torch.position.set(focus.x, focus.y + 2.2, focus.z);
    const f = 0.85 + Math.sin(time * 17) * 0.06 + Math.sin(time * 7.3) * 0.08;
    this.fire.intensity = 55 * f;
    this.fireMesh.scale.set(1, f * 1.1, 1);
    void dt;
  }

  dispose() {
    this.scene.clear();
    this.disposables.forEach((d) => d.dispose());
  }
}

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
