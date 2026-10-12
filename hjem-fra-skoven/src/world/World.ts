import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Rng } from '../game/rng';
import type { LevelDef } from '../data/levels';
import { lightingAt, type Lighting } from '../data/lighting';
import { Sky } from './Sky';

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
  private colliders: Collider[] = [];
  private grid = new Map<number, Collider[]>();
  private fire!: THREE.PointLight;
  private sunDir: THREE.Vector3;
  private disposables: { dispose(): void }[] = [];

  constructor(scene: THREE.Scene, readonly level: LevelDef) {
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
    this.buildTerrain(rng);
    this.buildForest(rng);
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
    const seg = 2.5;
    const nx = Math.round(W / seg);
    const nz = Math.round(D / seg);
    const geo = new THREE.PlaneGeometry(W, D, nx, nz);
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, 0, -L / 2);
    const p = geo.attributes.position;
    const colors = new Float32Array(p.count * 3);
    const c = new THREE.Color();
    const night = this.night;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const z = p.getZ(i);
      p.setY(i, this.height(x, z));
      const patch = 0.5 + 0.5 * Math.sin(x * 0.21 + Math.sin(z * 0.17) * 2) * Math.cos(z * 0.13 + x * 0.05);
      const trail = Math.exp(-Math.pow((x - this.trailX(z)) / 2.4, 2));
      c.setRGB(0.2 + patch * 0.1, 0.3 + patch * 0.12, 0.13 + patch * 0.05);
      c.lerp(new THREE.Color(0.36, 0.29, 0.2), trail * 0.75);
      c.multiplyScalar(1 - night * 0.2);
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    // noisy texture gives the ground some grain up close
    const cv = document.createElement('canvas');
    cv.width = cv.height = 128;
    const g = cv.getContext('2d')!;
    g.fillStyle = '#999';
    g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 2600; i++) {
      const v = Math.floor(rng.range(110, 200));
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.fillRect(rng.range(0, 128), rng.range(0, 128), rng.range(1, 3), rng.range(1, 3));
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(W / 5, D / 5);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: tex, roughness: 1, metalness: 0 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.disposables.push(geo, mat, tex);
  }

  private buildForest(rng: Rng) {
    const { length: L, width: W, treeDensity } = this.level;
    const half = W / 2;
    const area = (W + 30) * (L + 40);
    const count = Math.round(area * treeDensity);

    // shared geometry
    const trunkGeo = new THREE.CylinderGeometry(0.22, 0.38, 6, 7);
    trunkGeo.translate(0, 3, 0);
    const pineParts = [
      new THREE.ConeGeometry(2.3, 3.4, 8).translate(0, 3.6, 0),
      new THREE.ConeGeometry(1.8, 3.0, 8).translate(0, 5.4, 0),
      new THREE.ConeGeometry(1.2, 2.6, 8).translate(0, 7.2, 0),
    ];
    const pineGeo = mergeGeometries(pineParts)!;
    const leafParts = [
      new THREE.IcosahedronGeometry(2.6, 1).scale(1, 0.85, 1).translate(0, 6.2, 0),
      new THREE.IcosahedronGeometry(1.8, 1).translate(1.3, 5.2, 0.6),
    ];
    const leafGeo = mergeGeometries(leafParts)!;
    const rockGeo = new THREE.DodecahedronGeometry(1, 0);
    const bushGeo = new THREE.IcosahedronGeometry(0.8, 1);

    const trees: { x: number; z: number; s: number; pine: boolean; ry: number }[] = [];
    const rocks: { x: number; z: number; s: number; ry: number }[] = [];
    const bushes: { x: number; z: number; s: number }[] = [];

    const nearStart = (x: number, z: number) => Math.hypot(x - this.spawn.x, z - 0) < 7;
    const nearCave = (x: number, z: number) => Math.hypot(x - this.trailX(-L), z + L) < 16;

    let guard = 0;
    while (trees.length < count && guard++ < count * 6) {
      // extra dense band outside the playable width acts as the forest wall
      const outer = rng.next() < 0.22;
      const x = outer ? (rng.next() < 0.5 ? -1 : 1) * rng.range(half - 2, half + 12) : rng.range(-half, half);
      const z = rng.range(-L - 14, 14);
      if (!outer && Math.abs(x - this.trailX(z)) < 3.2) continue;
      if (nearStart(x, z) || nearCave(x, z)) continue;
      const s = rng.range(0.75, 1.5);
      trees.push({ x, z, s, pine: rng.next() < 0.62, ry: rng.range(0, 6.28) });
      this.addCollider(x, z, 0.42 * s, 6 * s);
    }
    for (let i = 0; i < count * 0.07; i++) {
      const x = rng.range(-half - 4, half + 4);
      const z = rng.range(-L - 8, 10);
      if (nearStart(x, z) || nearCave(x, z) || Math.abs(x - this.trailX(z)) < 2) continue;
      const s = rng.range(0.6, 1.8);
      rocks.push({ x, z, s, ry: rng.range(0, 6.28) });
      this.addCollider(x, z, 0.85 * s, 0.9 * s);
    }
    for (let i = 0; i < count * 0.5; i++) {
      const x = rng.range(-half - 6, half + 6);
      const z = rng.range(-L - 10, 12);
      if (nearStart(x, z)) continue;
      bushes.push({ x, z, s: rng.range(0.7, 1.7) });
    }

    const night = this.night;
    const dim = 1 - night * 0.25;
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3626, roughness: 1 });
    const pineMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 });
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x6d6f6c, roughness: 0.95, flatShading: true });
    const bushMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
    this.disposables.push(trunkGeo, pineGeo, leafGeo, rockGeo, bushGeo, trunkMat, pineMat, leafMat, rockMat, bushMat);

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const col = new THREE.Color();
    const place = (inst: THREE.InstancedMesh, i: number, x: number, z: number, sx: number, sy: number, ry: number, y = this.height(x, z)) => {
      e.set(0, ry, 0);
      q.setFromEuler(e);
      m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sx, sy, sx));
      inst.setMatrixAt(i, m);
    };
    const mk = (geo: THREE.BufferGeometry, mat: THREE.Material, n: number, shadow = true) => {
      const inst = new THREE.InstancedMesh(geo, mat, Math.max(1, n));
      inst.castShadow = shadow;
      inst.receiveShadow = true;
      inst.count = n;
      this.scene.add(inst);
      return inst;
    };

    const trunks = mk(trunkGeo, trunkMat, trees.length);
    const pines = trees.filter((t) => t.pine);
    const leafy = trees.filter((t) => !t.pine);
    const pineInst = mk(pineGeo, pineMat, pines.length);
    const leafInst = mk(leafGeo, leafMat, leafy.length);
    trees.forEach((t, i) => place(trunks, i, t.x, t.z, t.s, t.s, t.ry));
    pines.forEach((t, i) => {
      place(pineInst, i, t.x, t.z, t.s, t.s * rng.range(0.9, 1.15), t.ry);
      col.setRGB(0.08 + rng.range(0, 0.05), 0.2 + rng.range(0, 0.1), 0.1 + rng.range(0, 0.05)).multiplyScalar(dim);
      pineInst.setColorAt(i, col);
    });
    leafy.forEach((t, i) => {
      place(leafInst, i, t.x, t.z, t.s, t.s, t.ry);
      // autumn tints early on, darker later
      const warm = rng.next() < 0.35 ? 1 : 0;
      col.setRGB(0.18 + warm * 0.28 + rng.range(0, 0.06), 0.3 - warm * 0.07 + rng.range(0, 0.08), 0.1 + rng.range(0, 0.04)).multiplyScalar(dim);
      leafInst.setColorAt(i, col);
    });
    const rockInst = mk(rockGeo, rockMat, rocks.length);
    rocks.forEach((r, i) => place(rockInst, i, r.x, r.z, r.s, r.s * 0.7, r.ry, this.height(r.x, r.z) + r.s * 0.25));
    const bushInst = mk(bushGeo, bushMat, bushes.length, false);
    bushes.forEach((b, i) => {
      place(bushInst, i, b.x, b.z, b.s, b.s * 0.75, 0, this.height(b.x, b.z) + 0.2);
      col.setRGB(0.1 + rng.range(0, 0.08), 0.22 + rng.range(0, 0.1), 0.08).multiplyScalar(dim);
      bushInst.setColorAt(i, col);
    });
    for (const inst of [pineInst, leafInst, bushInst]) if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
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

  private addCollider(x: number, z: number, r: number, h: number) {
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
  collide(pos: THREE.Vector3, radius: number): THREE.Vector3 {
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

  update(dt: number, focus: THREE.Vector3, camera: THREE.Camera, time: number) {
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
