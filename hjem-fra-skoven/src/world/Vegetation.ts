import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Rng } from '../game/rng';
import type { LevelDef } from '../data/levels';
import { qualityProfile } from '../game/settings';
import { barkTexture, fernTexture, grainTexture, grassTexture } from './textures';

export interface WindUniforms {
  uTime: { value: number };
  uWind: { value: THREE.Vector3 };
}

export interface VegCtx {
  scene: THREE.Scene;
  level: LevelDef;
  rng: Rng;
  night: number;
  height(x: number, z: number): number;
  trailX(z: number): number;
  isFree(x: number, z: number, r: number): boolean;
  addCollider(x: number, z: number, r: number, h: number): void;
  spawn: THREE.Vector3;
  cave: THREE.Vector3;
  uniforms: WindUniforms;
  disposables: { dispose(): void }[];
}

/** Makes a material sway in the wind. `amp` grows with height above the instance origin. */
export function addSway(mat: THREE.Material, u: WindUniforms, amp: number, stiff = 2.0) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = u.uTime;
    shader.uniforms.uWind = u.uWind;
    shader.vertexShader =
      'uniform float uTime;\nuniform vec3 uWind;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec4 swPos = modelMatrix * instanceMatrix * vec4(position, 1.0);
        #else
          vec4 swPos = modelMatrix * vec4(position, 1.0);
        #endif
        float swH = pow(max(position.y, 0.0), ${stiff.toFixed(1)}) * ${amp.toFixed(4)};
        float swPh = uTime * 1.7 + swPos.x * 0.31 + swPos.z * 0.27;
        float swG = sin(swPh) * 0.6 + sin(swPh * 2.7 + 1.3) * 0.25 + 0.55;
        transformed.x += uWind.x * swH * swG * (1.0 + 0.4 * sin(uTime * 0.6));
        transformed.z += uWind.z * swH * swG;
        transformed.y -= abs(swG) * swH * 0.05;`,
      );
  };
  mat.needsUpdate = true;
}

// ---------- geometry helpers ----------


/** Smooth 3D noise from sines, continuous so non-indexed geometry stays closed. */
function snoise(x: number, y: number, z: number): number {
  return Math.sin(x * 2.1 + Math.sin(y * 1.7 + z * 0.9)) * 0.5 + Math.sin(z * 2.6 + y * 1.3 + Math.sin(x * 1.9)) * 0.5;
}

function displace(geo: THREE.BufferGeometry, amp: number, freq: number, seed: number) {
  const p = geo.attributes.position;
  const c = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    c.fromBufferAttribute(p, i);
    const len = c.length() || 1;
    const n = snoise(c.x * freq + seed, c.y * freq, c.z * freq - seed);
    const k = 1 + (amp * n) / len;
    p.setXYZ(i, c.x * k, c.y * k, c.z * k);
  }
  geo.computeVertexNormals();
}

function paint(geo: THREE.BufferGeometry, fn: (x: number, y: number, z: number, ny: number) => number) {
  const p = geo.attributes.position;
  const n = geo.attributes.normal;
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const v = fn(p.getX(i), p.getY(i), p.getZ(i), n ? n.getY(i) : 0);
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = Math.max(0, v);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

function nonIndexed(g: THREE.BufferGeometry): THREE.BufferGeometry {
  return g.index ? g.toNonIndexed() : g;
}

function pineCrown(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) {
    const r = 2.7 - i * 0.4;
    const h = 2.5 - i * 0.18;
    const y0 = 1.5 + i * 1.12;
    const cone = nonIndexed(new THREE.ConeGeometry(r, h, 11, 2));
    cone.rotateY(i * 0.7);
    const p = cone.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const x = p.getX(k);
      const z = p.getZ(k);
      const y = p.getY(k) + h / 2;
      const ang = Math.atan2(z, x);
      const wob = 1 + 0.11 * Math.sin(ang * 5 + i * 2.1) + 0.05 * Math.sin(ang * 11 + i);
      const edge = Math.hypot(x, z) / r;
      p.setXYZ(k, x * wob, y0 + y - 0.35 * edge * edge * (y < 0.2 ? 1 : 0.3), z * wob);
    }
    cone.computeVertexNormals();
    paint(cone, (_x, y) => 0.42 + 0.58 * Math.min(1, Math.max(0, (y - y0) / h)));
    parts.push(cone);
  }
  return mergeGeometries(parts)!;
}

function blob(r: number, x: number, y: number, z: number, seed: number, squash = 0.85, detail = 2): THREE.BufferGeometry {
  // welded vertices give smooth shading: soft, leafy masses instead of facets
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(r, detail);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g, 1e-3);
  g.scale(1, squash, 1);
  displace(g, r * 0.2, 1.4, seed);
  g.translate(x, y, z);
  paint(g, (px, py, pz, ny) => {
    const lx = px - x;
    const ly = (py - y) / (r * squash);
    const lz = pz - z;
    const outward = Math.min(1, Math.hypot(lx, lz) / r);
    return 0.5 + 0.28 * (ly * 0.5 + 0.5) + 0.22 * Math.max(0, ny) + 0.05 * outward;
  });
  return g;
}

function oakCrown(): THREE.BufferGeometry {
  return mergeGeometries([
    blob(2.3, 0, 6.3, 0, 1),
    blob(1.7, 1.6, 5.4, 0.5, 2),
    blob(1.8, -1.5, 5.6, -0.6, 3),
    blob(1.5, 0.2, 7.6, 0.4, 4),
    blob(1.5, 0.4, 5.0, -1.6, 5),
    blob(1.3, -0.6, 5.2, 1.5, 6),
  ])!;
}

function birchCrown(): THREE.BufferGeometry {
  return mergeGeometries([blob(1.3, 0, 6.6, 0, 7, 1.15, 1), blob(1.0, 0.8, 5.6, 0.3, 8, 1.1, 1), blob(1.0, -0.7, 5.8, -0.4, 9, 1.1, 1), blob(0.8, 0.1, 7.9, 0.1, 10, 1.1, 1)])!;
}

function trunk(h: number, r0: number, r1: number, branches: THREE.Vector3[] = []): THREE.BufferGeometry {
  const t = new THREE.CylinderGeometry(r1, r0, h, 9, 5);
  t.translate(0, h / 2, 0);
  const p = t.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const flare = 1 + 0.55 * Math.exp(-y * 1.8); // roots
    const ang = Math.atan2(p.getZ(i), p.getX(i));
    const lumps = 1 + 0.12 * Math.sin(ang * 6 + y * 0.8) * Math.exp(-y * 0.5);
    p.setX(i, p.getX(i) * flare * lumps);
    p.setZ(i, p.getZ(i) * flare * lumps);
  }
  t.computeVertexNormals();
  const parts: THREE.BufferGeometry[] = [t];
  for (const b of branches) {
    const len = b.length();
    const br = new THREE.CylinderGeometry(0.07, 0.16, len, 6);
    br.translate(0, len / 2, 0);
    br.rotateZ(-Math.atan2(b.x, b.y));
    br.rotateY(0);
    const g2 = br.clone();
    parts.push(g2.translate(0, 3.5, 0));
  }
  return mergeGeometries(parts.map((g) => (g.index ? g : g)))!;
}

export function buildVegetation(c: VegCtx) {
  const { scene, level, rng, night, uniforms, disposables } = c;
  const L = level.length;
  const half = level.width / 2;
  const dim = 1 - night * 0.3;
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v3 = new THREE.Vector3();
  const s3 = new THREE.Vector3();
  const col = new THREE.Color();

  const inst = (geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], n: number, cast: boolean, receive = true) => {
    const m = new THREE.InstancedMesh(geo, mat, Math.max(1, n));
    m.count = n;
    m.castShadow = cast;
    m.receiveShadow = receive;
    scene.add(m);
    disposables.push(geo);
    return m;
  };
  const put = (m: THREE.InstancedMesh, i: number, x: number, y: number, z: number, sx: number, sy: number, ry: number, rx = 0, rz = 0) => {
    e.set(rx, ry, rz);
    q.setFromEuler(e);
    m4.compose(v3.set(x, y, z), q, s3.set(sx, sy, sx));
    m.setMatrixAt(i, m4);
  };

  // gentle meadows: low-frequency field, high = open and flowery
  const meadow = (x: number, z: number) => 0.5 + 0.5 * Math.sin(x * 0.06 + 1.3) * Math.sin(z * 0.045 + 0.4) + 0.25 * Math.sin(x * 0.13 - z * 0.09);
  const nearStart = (x: number, z: number) => Math.hypot(x - c.spawn.x, z - c.spawn.z) < 7;
  const nearCave = (x: number, z: number) => Math.hypot(x - c.cave.x, z - c.cave.z) < 16;
  const onTrail = (x: number, z: number, w: number) => Math.abs(x - c.trailX(z)) < w;

  // ---------- trees ----------
  type T = { x: number; z: number; s: number; kind: 0 | 1 | 2; ry: number };
  const trees: T[] = [];
  const area = (level.width + 30) * (L + 40);
  const count = Math.round(area * level.treeDensity);
  let guard = 0;
  while (trees.length < count && guard++ < count * 8) {
    const outer = rng.next() < 0.22;
    const x = outer ? (rng.next() < 0.5 ? -1 : 1) * rng.range(half - 2, half + 12) : rng.range(-half, half);
    const z = rng.range(-L - 14, 14);
    if (!outer && onTrail(x, z, 3.2)) continue;
    if (nearStart(x, z) || nearCave(x, z)) continue;
    if (!outer && meadow(x, z) > 0.92 && rng.next() < 0.8) continue; // clearings
    const r = rng.next();
    const birchy = 0.5 + 0.5 * Math.sin(x * 0.04 + z * 0.03);
    const kind: 0 | 1 | 2 = r < 0.55 - birchy * 0.2 ? 0 : r < 0.8 ? 1 : 2;
    const s = rng.range(0.75, 1.5);
    trees.push({ x, z, s, kind, ry: rng.range(0, 6.28) });
    c.addCollider(x, z, (kind === 2 ? 0.3 : 0.45) * s, 6 * s);
  }

  const barkMat = new THREE.MeshStandardMaterial({ color: 0x8a6a4a, roughness: 1, map: barkTexture(3), bumpMap: barkTexture(3), bumpScale: 2.5 });
  const birchMat = new THREE.MeshStandardMaterial({ color: 0xeeeeea, roughness: 0.9, map: barkTexture(4, true) });
  const grain = grainTexture(11, 0.4);
  const crownMat = (amp: number) => {
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, vertexColors: true, map: grain, bumpMap: grain, bumpScale: 1.5 });
    addSway(m, uniforms, amp, 2.2);
    return m;
  };
  const trunkSway = (m: THREE.Material) => addSway(m, uniforms, 0.0012, 2.6);
  trunkSway(barkMat);
  trunkSway(birchMat);
  disposables.push(barkMat, birchMat, crownMat(0));

  const groups = [
    { kind: 0, trunkGeo: trunk(9, 0.4, 0.1), crown: pineCrown(), tmat: barkMat, cmat: crownMat(0.0016) },
    {
      kind: 1,
      trunkGeo: trunk(5.2, 0.45, 0.22, [new THREE.Vector3(1.6, 2.4, 0.4), new THREE.Vector3(-1.4, 2.2, -0.5), new THREE.Vector3(0.2, 2.8, -1.4)]),
      crown: oakCrown(),
      tmat: barkMat,
      cmat: crownMat(0.0022),
    },
    { kind: 2, trunkGeo: trunk(8, 0.24, 0.1), crown: birchCrown(), tmat: birchMat, cmat: crownMat(0.0026) },
  ];
  for (const g of groups) {
    const list = trees.filter((t) => t.kind === g.kind);
    const tr = inst(g.trunkGeo, g.tmat, list.length, true);
    const cr = inst(g.crown, g.cmat, list.length, true);
    list.forEach((t, i) => {
      const y = c.height(t.x, t.z) - 0.1;
      put(tr, i, t.x, y, t.z, t.s, t.s * rng.range(0.95, 1.1), t.ry);
      put(cr, i, t.x, y, t.z, t.s, t.s * rng.range(0.92, 1.12), t.ry);
      if (g.kind === 0) col.setRGB(0.1 + rng.range(0, 0.05), 0.24 + rng.range(0, 0.1), 0.13 + rng.range(0, 0.04));
      else if (g.kind === 1) {
        const warm = rng.next() < 0.3 ? 1 : 0;
        col.setRGB(0.22 + warm * 0.4 + rng.range(0, 0.06), 0.36 - warm * 0.1 + rng.range(0, 0.08), 0.12 + rng.range(0, 0.04));
      } else col.setRGB(0.42 + rng.range(0, 0.12), 0.5 + rng.range(0, 0.1), 0.18 + rng.range(0, 0.06));
      col.multiplyScalar(dim * 1.15);
      cr.setColorAt(i, col);
    });
    if (cr.instanceColor) cr.instanceColor.needsUpdate = true;
  }

  // ---------- rocks (three shapes, mossy on top) ----------
  const rockGeos = [0, 1, 2].map((k) => {
    let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, 1);
    g.deleteAttribute('normal');
    g.deleteAttribute('uv');
    g = mergeVertices(g, 1e-3);
    g.scale(1 + k * 0.15, 0.7, 1 - k * 0.1);
    displace(g, 0.28, 1.1, k * 3.1);
    paint(g, (_x, _y, _z, ny) => 0.65 + 0.35 * Math.max(0, ny));
    return g;
  });
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x8b8d89, roughness: 0.95, vertexColors: true, map: grainTexture(21, 0.5), bumpMap: grainTexture(21, 0.5), bumpScale: 2 });
  disposables.push(rockMat);
  const rocks: { x: number; z: number; s: number; ry: number; k: number }[] = [];
  for (let i = 0; i < count * 0.08; i++) {
    const x = rng.range(-half - 4, half + 4);
    const z = rng.range(-L - 8, 10);
    if (nearStart(x, z) || nearCave(x, z) || onTrail(x, z, 2)) continue;
    const s = rng.range(0.6, 1.9);
    rocks.push({ x, z, s, ry: rng.range(0, 6.28), k: rng.int(0, 2) });
    c.addCollider(x, z, 0.85 * s, 0.9 * s);
  }
  rockGeos.forEach((g, k) => {
    const list = rocks.filter((r) => r.k === k);
    const m = inst(g, rockMat, list.length, true);
    list.forEach((r, i) => {
      put(m, i, r.x, c.height(r.x, r.z) + r.s * 0.2, r.z, r.s, r.s, r.ry);
      col.setRGB(1, 1, 1).multiplyScalar(0.85 + rng.range(0, 0.25)).multiplyScalar(dim);
      m.setColorAt(i, col);
    });
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  });

  // ---------- fallen logs and stumps (low, so you can jump over them) ----------
  const logGeo = new THREE.CylinderGeometry(0.34, 0.4, 4.2, 9, 3).rotateZ(Math.PI / 2);
  displace(logGeo, 0.04, 2.5, 4);
  const stumpGeo = new THREE.CylinderGeometry(0.42, 0.55, 0.65, 10, 2);
  stumpGeo.translate(0, 0.32, 0);
  const ringMat = new THREE.MeshStandardMaterial({ color: 0xc9a56a, roughness: 0.9, map: grainTexture(30, 0.5) });
  disposables.push(ringMat);
  const logs: { x: number; z: number; ry: number }[] = [];
  const stumps: { x: number; z: number; s: number }[] = [];
  for (let i = 0; i < L / 6; i++) {
    const x = rng.range(-half, half);
    const z = -rng.range(14, L);
    if (onTrail(x, z, 2.5) || nearCave(x, z) || !c.isFree(x, z, 2.2)) continue;
    const ry = rng.range(0, Math.PI);
    logs.push({ x, z, ry });
    for (let k = -1.5; k <= 1.5; k += 1) c.addCollider(x + Math.cos(ry) * k, z - Math.sin(ry) * k, 0.5, 0.75);
  }
  for (let i = 0; i < L / 6; i++) {
    const x = rng.range(-half, half);
    const z = -rng.range(10, L);
    if (onTrail(x, z, 2) || nearCave(x, z) || !c.isFree(x, z, 1)) continue;
    stumps.push({ x, z, s: rng.range(0.8, 1.4) });
    c.addCollider(x, z, 0.5, 0.65);
  }
  const logInst = inst(logGeo, barkMat, logs.length, true);
  logs.forEach((l, i) => put(logInst, i, l.x, c.height(l.x, l.z) + 0.3, l.z, 1, 1, l.ry));
  const stumpInst = inst(stumpGeo, [barkMat, ringMat, ringMat], stumps.length, true);
  stumps.forEach((s, i) => put(stumpInst, i, s.x, c.height(s.x, s.z) - 0.05, s.z, s.s, s.s, rng.range(0, 6)));

  // ---------- undergrowth: grass, ferns, bushes, flowers, mushrooms ----------
  const grassGeo = (() => {
    const a = new THREE.PlaneGeometry(0.7, 0.75, 1, 3).translate(0, 0.37, 0);
    const b = a.clone().rotateY(Math.PI / 3);
    const d = a.clone().rotateY((2 * Math.PI) / 3);
    const g = mergeGeometries([a, b, d])!;
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) + Math.pow(p.getY(i), 2) * 0.35 * (i % 2 ? 1 : 0.6));
    g.computeVertexNormals();
    return g;
  })();
  const grassMat = new THREE.MeshStandardMaterial({ map: grassTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1 });
  addSway(grassMat, uniforms, 0.06, 1.6);
  const veg = qualityProfile().vegetation;
  const nGrass = Math.min(Math.round(26000 * veg), Math.round(area * 0.8 * veg));
  const grass = inst(grassGeo, grassMat, nGrass, false);
  let gi = 0;
  for (let i = 0; i < nGrass * 1.3 && gi < nGrass; i++) {
    const x = rng.range(-half - 6, half + 6);
    const z = rng.range(-L - 10, 12);
    if (nearStart(x, z) && rng.next() < 0.5) continue;
    const trail = onTrail(x, z, 2.2);
    if (trail && rng.next() < 0.85) continue;
    const mead = meadow(x, z);
    if (mead < 0.25 && rng.next() < 0.5) continue;
    const s = rng.range(0.7, 1.6) * (0.8 + mead * 0.5);
    put(grass, gi, x, c.height(x, z) - 0.02, z, s, s * rng.range(0.8, 1.3), rng.range(0, 6.28));
    const dry = rng.next() < 0.18 ? 1 : 0;
    col.setRGB(0.72 + dry * 0.45 + rng.range(-0.1, 0.1), 0.85 + dry * 0.05 + rng.range(-0.1, 0.1), 0.55 - dry * 0.15 + rng.range(-0.1, 0.1)).multiplyScalar(dim * 1.7);
    grass.setColorAt(gi, col);
    gi++;
  }
  grass.count = gi;
  if (grass.instanceColor) grass.instanceColor.needsUpdate = true;

  const fernGeo = (() => {
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 7; i++) {
      const p = new THREE.PlaneGeometry(0.55, 1.1, 1, 4).translate(0, 0.55, 0);
      const pos = p.attributes.position;
      for (let k = 0; k < pos.count; k++) pos.setZ(k, pos.getZ(k) + Math.pow(pos.getY(k), 2) * 0.45);
      p.rotateX(-0.45);
      p.rotateY((i / 7) * Math.PI * 2);
      parts.push(p);
    }
    const g = mergeGeometries(parts)!;
    g.computeVertexNormals();
    return g;
  })();
  const fernMat = new THREE.MeshStandardMaterial({ map: fernTexture(), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.95 });
  addSway(fernMat, uniforms, 0.05, 1.5);
  const nFern = Math.round(area * 0.035 * veg);
  const ferns = inst(fernGeo, fernMat, nFern, false);
  for (let i = 0; i < nFern; i++) {
    const x = rng.range(-half - 5, half + 5);
    const z = rng.range(-L - 10, 12);
    if (onTrail(x, z, 1.8) || nearStart(x, z)) {
      put(ferns, i, x, -50, z, 0.01, 0.01, 0);
      continue;
    }
    const s = rng.range(0.4, 0.95);
    put(ferns, i, x, c.height(x, z), z, s, s, rng.range(0, 6.28));
    col.setRGB(0.8 + rng.range(0, 0.35), 0.95 + rng.range(0, 0.25), 0.6).multiplyScalar(dim * 1.1);
    ferns.setColorAt(i, col);
  }
  if (ferns.instanceColor) ferns.instanceColor.needsUpdate = true;

  const bushGeo = mergeGeometries([blob(0.8, 0, 0.5, 0, 31, 0.8, 1), blob(0.6, 0.6, 0.4, 0.2, 32, 0.8, 1), blob(0.55, -0.5, 0.4, -0.3, 33, 0.8, 1)])!;
  const bushMat = crownMat(0.02);
  const nBush = Math.round(count * 0.5 * Math.max(0.4, veg));
  const bushes = inst(bushGeo, bushMat, nBush, false);
  for (let i = 0; i < nBush; i++) {
    const x = rng.range(-half - 6, half + 6);
    const z = rng.range(-L - 10, 12);
    const s = rng.range(0.7, 1.7);
    put(bushes, i, x, c.height(x, z) - 0.05, z, s, s * 0.9, rng.range(0, 6.28));
    col.setRGB(0.14 + rng.range(0, 0.1), 0.3 + rng.range(0, 0.12), 0.1).multiplyScalar(dim * 1.2);
    bushes.setColorAt(i, col);
  }
  if (bushes.instanceColor) bushes.instanceColor.needsUpdate = true;

  // flowers in meadows
  const flowerGeo = mergeGeometries([
    new THREE.CylinderGeometry(0.008, 0.01, 0.34, 4).translate(0, 0.17, 0),
    new THREE.SphereGeometry(0.055, 7, 5).scale(1, 0.55, 1).translate(0, 0.36, 0),
  ].map((g, i) => {
    paint(g, () => (i === 0 ? 0.35 : 1));
    return g;
  }))!;
  const flowerMat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.8 });
  addSway(flowerMat, uniforms, 0.08, 1.2);
  const palette = [0xffffff, 0xffe45a, 0xc47aff, 0xff7a9a, 0x7ab8ff];
  const flowers: { x: number; z: number; c: number }[] = [];
  for (let i = 0; i < area * 0.05 && flowers.length < 2600; i++) {
    const x = rng.range(-half, half);
    const z = rng.range(-L - 6, 6);
    if (meadow(x, z) < 0.62) continue;
    const base = rng.pick(palette);
    for (let k = 0; k < 4; k++) flowers.push({ x: x + rng.range(-1.2, 1.2), z: z + rng.range(-1.2, 1.2), c: base });
  }
  const flw = inst(flowerGeo, flowerMat, flowers.length, false);
  flowers.forEach((f, i) => {
    const s = rng.range(0.8, 1.4);
    put(flw, i, f.x, c.height(f.x, f.z), f.z, s, s, 0);
    col.setHex(f.c).multiplyScalar(night > 0.5 ? 0.6 : 1);
    flw.setColorAt(i, col);
  });
  if (flw.instanceColor) flw.instanceColor.needsUpdate = true;

  // mushrooms around tree bases
  const mushGeo = mergeGeometries([
    new THREE.CylinderGeometry(0.03, 0.04, 0.12, 6).translate(0, 0.06, 0),
    new THREE.SphereGeometry(0.075, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.12, 0),
  ].map((g, i) => {
    paint(g, () => (i === 0 ? 0.95 : 0.8));
    return g;
  }))!;
  const mushMat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.7 });
  const nMush = 260;
  const mush = inst(mushGeo, mushMat, nMush, false);
  for (let i = 0; i < nMush; i++) {
    const t = trees[Math.floor(rng.next() * trees.length)];
    if (!t) break;
    const a = rng.range(0, 6.28);
    const r = 0.7 * t.s + rng.range(0.1, 1.2);
    const x = t.x + Math.cos(a) * r;
    const z = t.z + Math.sin(a) * r;
    const s = rng.range(0.8, 2.2);
    put(mush, i, x, c.height(x, z), z, s, s, 0);
    col.setHex(rng.next() < 0.5 ? 0xc02a22 : rng.next() < 0.5 ? 0xb8845a : 0xe8dcc0).multiplyScalar(dim);
    mush.setColorAt(i, col);
  }
  if (mush.instanceColor) mush.instanceColor.needsUpdate = true;

  disposables.push(grassMat, fernMat, flowerMat, mushMat, bushMat, rockMat, ringMat);
}
