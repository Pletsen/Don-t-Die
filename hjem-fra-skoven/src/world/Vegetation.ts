import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Rng } from '../game/rng';
import type { LevelDef } from '../data/levels';
import { qualityProfile } from '../game/settings';
import { barkTexture, fernTexture, grainTexture, grassTexture, leafAtlas } from './textures';

/**
 * Uniforms shared by every swaying / fading vegetation material. World updates them once per frame.
 * - uFocusPx / uFocusR / uFocusZ: the hunter's chest on screen (pixels), the radius of the see-through circle
 *   (pixels) and the hunter's view depth. Foliage in front of the hunter inside the circle is dithered away.
 * - uGrassNear / uGrassFar: grass and small plants thin out between these distances (smooth, per instance).
 */
export interface WindUniforms {
  uTime: { value: number };
  uWind: { value: THREE.Vector3 };
  uFocusPx?: { value: THREE.Vector2 };
  uFocusR?: { value: number };
  uFocusZ?: { value: number };
  uGrassNear?: { value: number };
  uGrassFar?: { value: number };
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

/** One instanced batch of one vegetation type covering a strip of the level [z0, z1]. */
export interface VegChunk {
  mesh: THREE.InstancedMesh;
  z0: number;
  z1: number;
  /** Hide the chunk when the camera is further than this along z (Infinity = only the view distance applies). */
  maxDist: number;
}

export interface SwayOptions {
  /** Dither the material away when it is very close to the camera (default true). */
  nearFade?: boolean;
  /** Dither it away in a circle around the hunter when it is between the camera and the hunter. */
  occlude?: boolean;
  /** Shrink instances to nothing with distance (grass, flowers): smooth density falloff. */
  distanceThin?: boolean;
}

const FADE_FRAG = `
  float vegBayer2(vec2 a){ a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
  float vegBayer4(vec2 a){ return vegBayer2(0.5 * a) * 0.25 + vegBayer2(a); }
`;

/**
 * Makes a material sway in the wind (`amp` grows with height above the instance origin) and, optionally, fade
 * near the camera / in front of the hunter, and thin out with distance. Shadows are unaffected.
 */
export function addSway(mat: THREE.Material, u: WindUniforms, amp: number, stiff = 2.0, opts: SwayOptions = {}) {
  const nearFade = opts.nearFade ?? true;
  const occlude = !!opts.occlude && !!u.uFocusPx;
  const thin = !!opts.distanceThin && !!u.uGrassNear;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = u.uTime;
    shader.uniforms.uWind = u.uWind;
    if (u.uFocusPx) {
      shader.uniforms.uFocusPx = u.uFocusPx;
      shader.uniforms.uFocusR = u.uFocusR!;
      shader.uniforms.uFocusZ = u.uFocusZ!;
    }
    if (u.uGrassNear) {
      shader.uniforms.uGrassNear = u.uGrassNear;
      shader.uniforms.uGrassFar = u.uGrassFar!;
    }
    shader.vertexShader =
      'uniform float uTime;\nuniform vec3 uWind;\nuniform float uGrassNear;\nuniform float uGrassFar;\nvarying float vViewZ;\n' +
      shader.vertexShader
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec4 swPos = modelMatrix * instanceMatrix * vec4(position, 1.0);
        #else
          vec4 swPos = modelMatrix * vec4(position, 1.0);
        #endif
        float swH = pow(max(position.y, 0.0), ${stiff.toFixed(2)}) * ${amp.toFixed(5)};
        float swPh = uTime * 1.7 + swPos.x * 0.31 + swPos.z * 0.27;
        float swG = sin(swPh) * 0.6 + sin(swPh * 2.7 + 1.3) * 0.25 + 0.55;
        transformed.x += uWind.x * swH * swG * (1.0 + 0.4 * sin(uTime * 0.6));
        transformed.z += uWind.z * swH * swG;
        transformed.y -= abs(swG) * swH * 0.05;
        ${
          thin
            ? `#ifdef USE_INSTANCING
          vec3 thO = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          float thKeep = fract(sin(dot(thO.xz, vec2(12.9898, 78.233))) * 43758.5453);
          float thCut = mix(uGrassNear, uGrassFar, thKeep * thKeep);
          transformed *= 1.0 - smoothstep(thCut - 4.0, thCut, distance(thO.xz, cameraPosition.xz));
        #endif`
            : ''
        }`,
        )
        .replace('#include <project_vertex>', '#include <project_vertex>\n  vViewZ = -mvPosition.z;');
    if (nearFade || occlude) {
      shader.fragmentShader =
        'uniform vec2 uFocusPx;\nuniform float uFocusR;\nuniform float uFocusZ;\nvarying float vViewZ;\n' +
        FADE_FRAG +
        shader.fragmentShader.replace(
          '#include <clipping_planes_fragment>',
          `#include <clipping_planes_fragment>
          {
            float vis = ${nearFade ? 'clamp((vViewZ - 0.5) / 1.7, 0.0, 1.0)' : '1.0'};
            ${
              occlude
                ? `if (vViewZ < uFocusZ - 0.7 && uFocusR > 0.0) {
              float dd = length(gl_FragCoord.xy - uFocusPx) / uFocusR;
              vis = min(vis, mix(0.18, 1.0, smoothstep(0.55, 1.0, dd)));
            }`
                : ''
            }
            if (vegBayer4(gl_FragCoord.xy) >= vis) discard;
          }`,
        );
    } else {
      shader.fragmentShader = 'varying float vViewZ;\n' + shader.fragmentShader;
    }
  };
  const key = `veg:${amp}:${stiff}:${nearFade ? 1 : 0}${occlude ? 1 : 0}${thin ? 1 : 0}`;
  mat.customProgramCacheKey = () => key;
  mat.needsUpdate = true;
}

// ---------- geometry helpers ----------

/** Smooth 3D noise from sines, continuous so non-indexed geometry stays closed. */
function snoise(x: number, y: number, z: number): number {
  return Math.sin(x * 2.1 + Math.sin(y * 1.7 + z * 0.9)) * 0.5 + Math.sin(z * 2.6 + y * 1.3 + Math.sin(x * 1.9)) * 0.5;
}

export function displace(geo: THREE.BufferGeometry, amp: number, freq: number, seed: number) {
  const p = geo.attributes.position;
  const c = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    c.fromBufferAttribute(p, i);
    const len = c.length() || 1;
    const n = snoise(c.x * freq + seed, c.y * freq, c.z * freq - seed) + 0.35 * snoise(c.x * freq * 2.7 - seed, c.y * freq * 2.7 + 1, c.z * freq * 2.7);
    const k = 1 + (amp * n) / len;
    p.setXYZ(i, c.x * k, c.y * k, c.z * k);
  }
  geo.computeVertexNormals();
}

export function paint(geo: THREE.BufferGeometry, fn: (x: number, y: number, z: number, ny: number) => number | THREE.Color) {
  const p = geo.attributes.position;
  const n = geo.attributes.normal;
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const v = fn(p.getX(i), p.getY(i), p.getZ(i), n ? n.getY(i) : 0);
    if (typeof v === 'number') col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = Math.max(0, v);
    else {
      col[i * 3] = v.r;
      col[i * 3 + 1] = v.g;
      col[i * 3 + 2] = v.b;
    }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

function nonIndexed(g: THREE.BufferGeometry): THREE.BufferGeometry {
  return g.index ? g.toNonIndexed() : g;
}

/** Keep only the attributes every part shares, so mergeGeometries accepts them. */
function stripTo(g: THREE.BufferGeometry, names: string[]): THREE.BufferGeometry {
  for (const n of Object.keys(g.attributes)) if (!names.includes(n)) g.deleteAttribute(n);
  return g;
}

const PINE_TIERS = 6;
const pineTier = (i: number) => ({ r: 2.7 - i * 0.4, h: 2.5 - i * 0.18, y0: 1.5 + i * 1.12 });

function pineCrown(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < PINE_TIERS; i++) {
    const { r, h, y0 } = pineTier(i);
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
    paint(cone, (_x, y) => 0.36 + 0.5 * Math.min(1, Math.max(0, (y - y0) / h)));
    parts.push(cone);
  }
  return mergeGeometries(parts)!;
}

interface Blob {
  r: number;
  x: number;
  y: number;
  z: number;
  squash: number;
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
    return 0.42 + 0.26 * (ly * 0.5 + 0.5) + 0.18 * Math.max(0, ny) + 0.05 * outward;
  });
  return g;
}

const OAK_BLOBS: Blob[] = [
  { r: 2.3, x: 0, y: 6.3, z: 0, squash: 0.85 },
  { r: 1.7, x: 1.6, y: 5.4, z: 0.5, squash: 0.85 },
  { r: 1.8, x: -1.5, y: 5.6, z: -0.6, squash: 0.85 },
  { r: 1.5, x: 0.2, y: 7.6, z: 0.4, squash: 0.85 },
  { r: 1.5, x: 0.4, y: 5.0, z: -1.6, squash: 0.85 },
  { r: 1.3, x: -0.6, y: 5.2, z: 1.5, squash: 0.85 },
];
const BIRCH_BLOBS: Blob[] = [
  { r: 1.3, x: 0, y: 6.6, z: 0, squash: 1.15 },
  { r: 1.0, x: 0.8, y: 5.6, z: 0.3, squash: 1.1 },
  { r: 1.0, x: -0.7, y: 5.8, z: -0.4, squash: 1.1 },
  { r: 0.8, x: 0.1, y: 7.9, z: 0.1, squash: 1.1 },
];

function blobCrown(blobs: Blob[], seed0: number, detail: number): THREE.BufferGeometry {
  return mergeGeometries(blobs.map((b, i) => blob(b.r, b.x, b.y, b.z, seed0 + i, b.squash, detail)))!;
}

/**
 * Leaf cards: small alpha-cut quads stuck through the surface of the crown masses so the silhouette breaks up
 * into leaves. Normals point away from the crown centre so the cards light like one volume.
 */
function leafCards(blobs: Blob[], perBlob: number, seed: number, centre: THREE.Vector3): THREE.BufferGeometry {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const parts: THREE.BufferGeometry[] = [];
  const dir = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const z = new THREE.Vector3(0, 0, 1);
  for (const b of blobs) {
    for (let k = 0; k < perBlob; k++) {
      // spread over the upper and outer surface
      const u = rnd() * 1.3 - 0.35;
      const a = rnd() * Math.PI * 2;
      const rr = Math.sqrt(Math.max(0, 1 - u * u));
      dir.set(Math.cos(a) * rr, u, Math.sin(a) * rr).normalize();
      const size = b.r * (0.85 + rnd() * 0.45);
      const card = new THREE.PlaneGeometry(size, size);
      // left half of the atlas: broadleaf
      const uv = card.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 0.5);
      card.rotateZ(rnd() * Math.PI * 2);
      q.setFromUnitVectors(z, dir);
      // tilt the card off the surface normal so it is not a flat sticker
      card.rotateX((rnd() - 0.5) * 1.2);
      card.applyQuaternion(q);
      card.translate(b.x + dir.x * b.r * 0.82, b.y + dir.y * b.r * b.squash * 0.82, b.z + dir.z * b.r * 0.82);
      parts.push(card);
    }
  }
  const g = mergeGeometries(parts)!;
  outwardNormals(g, centre);
  paint(g, (_x, y) => 0.75 + 0.25 * Math.min(1, Math.max(0, (y - centre.y + 2) / 4)));
  return g;
}

function pineCards(seed: number): THREE.BufferGeometry {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < PINE_TIERS; i++) {
    const { r, h, y0 } = pineTier(i);
    const n = 7 - Math.floor(i / 2);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + i * 0.7 + rnd() * 0.4;
      const len = r * (0.9 + rnd() * 0.3);
      const card = new THREE.PlaneGeometry(len * 0.75, len);
      const uv = card.attributes.uv;
      for (let j = 0; j < uv.count; j++) uv.setX(j, 0.5 + uv.getX(j) * 0.5);
      // spray grows from the trunk outwards (+y of the card = outwards), drooping
      card.translate(0, len / 2, 0);
      card.rotateX(Math.PI / 2 - 0.15); // lay it flat, pointing +z
      card.rotateX(0.32 + rnd() * 0.2); // droop
      card.rotateZ((rnd() - 0.5) * 0.4);
      card.rotateY(a);
      card.translate(0, y0 + h * 0.25, 0);
      parts.push(card);
    }
  }
  const g = mergeGeometries(parts)!;
  outwardNormals(g, new THREE.Vector3(0, 4.5, 0));
  paint(g, (_x, y) => 0.6 + 0.35 * Math.min(1, Math.max(0, (y - 1.5) / 7)));
  return g;
}

function outwardNormals(g: THREE.BufferGeometry, centre: THREE.Vector3) {
  const p = g.attributes.position;
  const n = g.attributes.normal;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).sub(centre);
    v.y *= 0.7;
    v.normalize();
    n.setXYZ(i, v.x, v.y + 0.25, v.z);
  }
  n.needsUpdate = true;
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
    br.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().normalize()));
    parts.push(br.translate(0, 3.5, 0));
  }
  return mergeGeometries(parts)!;
}

const CHUNK = 24;

/**
 * Collects instances of one vegetation type and emits them as z-chunked InstancedMeshes, so frustum culling and
 * the view distance can drop whole strips of the forest.
 */
class Batch {
  private mats: number[] = [];
  private cols: number[] = [];
  private zs: number[] = [];
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();

  add(x: number, y: number, z: number, sx: number, sy: number, ry: number, color?: THREE.Color, rx = 0, rz = 0, sz = sx) {
    this.e.set(rx, ry, rz);
    this.q.setFromEuler(this.e);
    this.m4.compose(this.v.set(x, y, z), this.q, this.s.set(sx, sy, sz));
    for (let i = 0; i < 16; i++) this.mats.push(this.m4.elements[i]);
    if (color) this.cols.push(color.r, color.g, color.b);
    this.zs.push(z);
  }

  get count() {
    return this.zs.length;
  }

  emit(
    scene: THREE.Scene,
    out: VegChunk[],
    geo: THREE.BufferGeometry,
    mat: THREE.Material | THREE.Material[],
    opts: { cast: boolean; receive?: boolean; chunk?: number; maxDist?: number },
  ) {
    const size = opts.chunk ?? CHUNK;
    const groups = new Map<number, number[]>();
    this.zs.forEach((z, i) => {
      const k = Math.floor(z / size);
      let g = groups.get(k);
      if (!g) groups.set(k, (g = []));
      g.push(i);
    });
    const hasCol = this.cols.length > 0;
    for (const [k, idx] of groups) {
      const mesh = new THREE.InstancedMesh(geo, mat, idx.length);
      const arr = mesh.instanceMatrix.array as Float32Array;
      idx.forEach((i, j) => {
        for (let e = 0; e < 16; e++) arr[j * 16 + e] = this.mats[i * 16 + e];
      });
      if (hasCol) {
        const c = new Float32Array(idx.length * 3);
        idx.forEach((i, j) => {
          c[j * 3] = this.cols[i * 3];
          c[j * 3 + 1] = this.cols[i * 3 + 1];
          c[j * 3 + 2] = this.cols[i * 3 + 2];
        });
        mesh.instanceColor = new THREE.InstancedBufferAttribute(c, 3);
      }
      mesh.castShadow = opts.cast;
      mesh.receiveShadow = opts.receive ?? true;
      mesh.computeBoundingSphere();
      scene.add(mesh);
      out.push({ mesh, z0: k * size - 6, z1: (k + 1) * size + 6, maxDist: opts.maxDist ?? Infinity });
    }
  }
}

export interface VegResult {
  chunks: VegChunk[];
}

export function buildVegetation(c: VegCtx): VegResult {
  const { scene, level, night, uniforms, disposables } = c;
  let rng = c.rng;
  // Each quality-dependent layer gets its own random stream, so changing the quality never moves the other plants.
  const layer = (k: number) => (rng = new Rng(level.seed * 7 + k * 101));
  const L = level.length;
  const half = level.width / 2;
  const dim = 1 - night * 0.3;
  const col = new THREE.Color();
  const chunks: VegChunk[] = [];
  const q = qualityProfile();
  const veg = q.vegetation;
  const own = <T extends { dispose(): void }>(x: T): T => {
    disposables.push(x);
    return x;
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

  const barkTex = own(barkTexture(3));
  const barkMat = own(new THREE.MeshStandardMaterial({ color: 0x7a5e44, roughness: 1, map: barkTex, bumpMap: barkTex, bumpScale: 1.4 }));
  const birchMat = own(new THREE.MeshStandardMaterial({ color: 0xeeeeea, roughness: 0.9, map: own(barkTexture(4, true)) }));
  const grain = own(grainTexture(11, 0.4));
  const leaves = own(leafAtlas());
  const crownMat = (amp: number, occlude = true) => {
    const m = own(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, vertexColors: true, map: grain, bumpMap: grain, bumpScale: 1.5 }));
    addSway(m, uniforms, amp, 2.2, { occlude });
    return m;
  };
  const cardMat = (amp: number) => {
    const m = own(
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, vertexColors: true, map: leaves, alphaTest: 0.5, side: THREE.DoubleSide }),
    );
    addSway(m, uniforms, amp, 2.2, { occlude: true });
    return m;
  };
  const trunkSway = (m: THREE.Material) => addSway(m, uniforms, 0.0012, 2.6, { nearFade: false });
  trunkSway(barkMat);
  trunkSway(birchMat);

  const oakC = new THREE.Vector3(0, 6, 0);
  const birchC = new THREE.Vector3(0, 6.5, 0);
  const groups = [
    // pine trunk ends inside the top tier (crown top ~8.6) instead of poking out as a black spike
    { kind: 0, trunkGeo: trunk(7.5, 0.4, 0.1), crown: pineCrown(), cards: pineCards(5), tmat: barkMat, amp: 0.0016 },
    {
      kind: 1,
      trunkGeo: trunk(5.2, 0.45, 0.22, [new THREE.Vector3(1.6, 2.4, 0.4), new THREE.Vector3(-1.4, 2.2, -0.5), new THREE.Vector3(0.2, 2.8, -1.4)]),
      crown: blobCrown(OAK_BLOBS, 1, 2),
      cards: leafCards(OAK_BLOBS, 6, 17, oakC),
      tmat: barkMat,
      amp: 0.0022,
    },
    { kind: 2, trunkGeo: trunk(8, 0.24, 0.1), crown: blobCrown(BIRCH_BLOBS, 7, 1), cards: leafCards(BIRCH_BLOBS, 6, 23, birchC), tmat: birchMat, amp: 0.0026 },
  ];
  for (const g of groups) {
    own(g.trunkGeo);
    own(g.crown);
    own(g.cards);
    const list = trees.filter((t) => t.kind === g.kind);
    const tb = new Batch();
    const cb = new Batch();
    for (const t of list) {
      const y = c.height(t.x, t.z) - 0.1;
      const sy = t.s * rng.range(0.95, 1.1);
      tb.add(t.x, y, t.z, t.s, sy, t.ry);
      if (g.kind === 0) col.setRGB(0.1 + rng.range(0, 0.05), 0.22 + rng.range(0, 0.09), 0.12 + rng.range(0, 0.04));
      else if (g.kind === 1) {
        // a few oaks already turning: muted ochre, not red (red crowns read as fire at night)
        const warm = rng.next() < 0.08 ? 1 : 0;
        if (warm) col.setRGB(0.42 + rng.range(0, 0.05), 0.3 + rng.range(0, 0.05), 0.12);
        else col.setRGB(0.2 + rng.range(0, 0.06), 0.34 + rng.range(0, 0.08), 0.11 + rng.range(0, 0.04));
      } else col.setRGB(0.4 + rng.range(0, 0.1), 0.48 + rng.range(0, 0.1), 0.17 + rng.range(0, 0.06));
      col.multiplyScalar(dim * 1.15);
      cb.add(t.x, y, t.z, t.s, t.s * rng.range(0.92, 1.12), t.ry, col);
    }
    tb.emit(scene, chunks, g.trunkGeo, g.tmat, { cast: true });
    cb.emit(scene, chunks, g.crown, crownMat(g.amp), { cast: true });
    // cards reuse the crown transforms and colours; they do not cast (the crown volume does)
    cb.emit(scene, chunks, g.cards, cardMat(g.amp), { cast: false });
  }

  // ---------- rocks (three shapes, mossy on top) ----------
  const rockGeos = [0, 1, 2].map((k) => own(rockGeometry(k)));
  const rockTex = own(grainTexture(21, 0.5));
  const rockMat = own(new THREE.MeshStandardMaterial({ color: 0x8b8d89, roughness: 0.95, vertexColors: true, map: rockTex, bumpMap: rockTex, bumpScale: 2 }));
  const rockB = [new Batch(), new Batch(), new Batch()];
  for (let i = 0; i < count * 0.08; i++) {
    const x = rng.range(-half - 4, half + 4);
    const z = rng.range(-L - 8, 10);
    if (nearStart(x, z) || nearCave(x, z) || onTrail(x, z, 2)) continue;
    const s = rng.range(0.6, 1.9);
    const k = rng.int(0, 2);
    col.setRGB(1, 1, 1).multiplyScalar(0.85 + rng.range(0, 0.25)).multiplyScalar(dim);
    rockB[k].add(x, c.height(x, z) + s * 0.2, z, s, s, rng.range(0, 6.28), col);
    c.addCollider(x, z, 0.85 * s, 0.9 * s);
  }
  rockB.forEach((b, k) => b.emit(scene, chunks, rockGeos[k], rockMat, { cast: true, chunk: 72 }));

  // ---------- fallen logs and stumps (low, so you can jump over them) ----------
  const logGeo = own(new THREE.CylinderGeometry(0.34, 0.4, 4.2, 9, 3).rotateZ(Math.PI / 2));
  displace(logGeo, 0.04, 2.5, 4);
  const stumpGeo = own(new THREE.CylinderGeometry(0.42, 0.55, 0.65, 10, 2));
  stumpGeo.translate(0, 0.32, 0);
  const ringMat = own(new THREE.MeshStandardMaterial({ color: 0xc9a56a, roughness: 0.9, map: own(grainTexture(30, 0.5)) }));
  const logB = new Batch();
  const stumpB = new Batch();
  for (let i = 0; i < L / 6; i++) {
    const x = rng.range(-half, half);
    const z = -rng.range(14, L);
    if (onTrail(x, z, 2.5) || nearCave(x, z) || !c.isFree(x, z, 2.2)) continue;
    const ry = rng.range(0, Math.PI);
    logB.add(x, c.height(x, z) + 0.3, z, 1, 1, ry);
    for (let k = -1.5; k <= 1.5; k += 1) c.addCollider(x + Math.cos(ry) * k, z - Math.sin(ry) * k, 0.5, 0.75);
  }
  for (let i = 0; i < L / 6; i++) {
    const x = rng.range(-half, half);
    const z = -rng.range(10, L);
    if (onTrail(x, z, 2) || nearCave(x, z) || !c.isFree(x, z, 1)) continue;
    const s = rng.range(0.8, 1.4);
    stumpB.add(x, c.height(x, z) - 0.05, z, s, s, rng.range(0, 6));
    c.addCollider(x, z, 0.5, 0.65);
  }
  logB.emit(scene, chunks, logGeo, barkMat, { cast: true, chunk: 72 });
  stumpB.emit(scene, chunks, stumpGeo, [barkMat, ringMat, ringMat], { cast: true, chunk: 72 });

  // ---------- undergrowth: grass, ferns, bushes, flowers, mushrooms ----------
  const grassGeo = own(
    (() => {
      const a = new THREE.PlaneGeometry(0.7, 0.75, 1, 3).translate(0, 0.37, 0);
      const b = a.clone().rotateY(Math.PI / 3);
      const d = a.clone().rotateY((2 * Math.PI) / 3);
      const g = mergeGeometries([a, b, d])!;
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) + Math.pow(p.getY(i), 2) * 0.35 * (i % 2 ? 1 : 0.6));
      g.computeVertexNormals();
      return g;
    })(),
  );
  const grassMat = own(new THREE.MeshStandardMaterial({ map: own(grassTexture()), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1 }));
  addSway(grassMat, uniforms, 0.06, 1.6, { distanceThin: true });
  const grassFar = 46 * q.viewScale;
  layer(1);
  const nGrass = Math.min(Math.round(26000 * veg), Math.round(area * 0.8 * veg));
  const grassB = new Batch();
  for (let i = 0; i < nGrass * 1.3 && grassB.count < nGrass; i++) {
    const x = rng.range(-half - 6, half + 6);
    const z = rng.range(-L - 10, 12);
    if (nearStart(x, z) && rng.next() < 0.5) continue;
    const trail = onTrail(x, z, 2.5);
    if (trail && rng.next() < 0.85) continue;
    const mead = meadow(x, z);
    if (mead < 0.25 && rng.next() < 0.5) continue;
    // knee-high: 0.25..1 m, with a few taller tufts only in open meadow
    const s = rng.range(0.5, 1.0) * (0.85 + Math.min(1, mead) * 0.35);
    const tall = mead > 0.8 && rng.next() < 0.15 ? 1.45 : 1;
    const dry = rng.next() < 0.18 ? 1 : 0;
    col.setRGB(0.72 + dry * 0.45 + rng.range(-0.1, 0.1), 0.85 + dry * 0.05 + rng.range(-0.1, 0.1), 0.55 - dry * 0.15 + rng.range(-0.1, 0.1)).multiplyScalar(dim * 1.7);
    grassB.add(x, c.height(x, z) - 0.02, z, s, s * rng.range(0.7, 1.1) * tall, rng.range(0, 6.28), col);
  }
  grassB.emit(scene, chunks, grassGeo, grassMat, { cast: false, maxDist: grassFar + 6 });

  const fernGeo = own(
    (() => {
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
    })(),
  );
  const fernMat = own(new THREE.MeshStandardMaterial({ map: own(fernTexture()), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.95 }));
  addSway(fernMat, uniforms, 0.05, 1.5, { occlude: true });
  layer(2);
  const nFern = Math.round(area * 0.035 * veg);
  const fernB = new Batch();
  for (let i = 0; i < nFern; i++) {
    const x = rng.range(-half - 5, half + 5);
    const z = rng.range(-L - 10, 12);
    if (onTrail(x, z, 1.8) || nearStart(x, z)) continue;
    const s = rng.range(0.4, 0.95);
    col.setRGB(0.8 + rng.range(0, 0.35), 0.95 + rng.range(0, 0.25), 0.6).multiplyScalar(dim * 1.1);
    fernB.add(x, c.height(x, z), z, s, s, rng.range(0, 6.28), col);
  }
  fernB.emit(scene, chunks, fernGeo, fernMat, { cast: false, maxDist: 70 * q.viewScale });

  const bushBlobs: Blob[] = [
    { r: 0.8, x: 0, y: 0.5, z: 0, squash: 0.8 },
    { r: 0.6, x: 0.6, y: 0.4, z: 0.2, squash: 0.8 },
    { r: 0.55, x: -0.5, y: 0.4, z: -0.3, squash: 0.8 },
  ];
  const bushGeo = own(blobCrown(bushBlobs, 31, 1));
  const bushCards = own(leafCards(bushBlobs, 5, 37, new THREE.Vector3(0, 0.3, 0)));
  layer(3);
  const nBush = Math.round(count * 0.5 * Math.max(0.4, veg));
  const bushB = new Batch();
  for (let i = 0; i < nBush; i++) {
    const x = rng.range(-half - 6, half + 6);
    const z = rng.range(-L - 10, 12);
    const s = rng.range(0.7, 1.7);
    col.setRGB(0.14 + rng.range(0, 0.1), 0.3 + rng.range(0, 0.12), 0.1).multiplyScalar(dim * 1.2);
    bushB.add(x, c.height(x, z) - 0.05, z, s, s * 0.9, rng.range(0, 6.28), col);
  }
  bushB.emit(scene, chunks, bushGeo, crownMat(0.02), { cast: false });
  bushB.emit(scene, chunks, bushCards, cardMat(0.02), { cast: false, maxDist: 80 * q.viewScale });

  // flowers in meadows: a short stem with a small star of petals
  const flowerGeo = own(flowerGeometry());
  const flowerMat = own(new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.8, side: THREE.DoubleSide }));
  addSway(flowerMat, uniforms, 0.08, 1.2, { distanceThin: true, nearFade: false });
  layer(4);
  const palette = [0xf4f1e6, 0xf2d64a, 0xa070d8, 0xe0708a, 0x7aa8e8];
  const flowerB = new Batch();
  const fdim = 1 - 0.5 * night;
  for (let i = 0; i < area * 0.05 && flowerB.count < 2600; i++) {
    const x = rng.range(-half, half);
    const z = rng.range(-L - 6, 6);
    if (meadow(x, z) < 0.62) continue;
    const base = rng.pick(palette);
    for (let k = 0; k < 4; k++) {
      const fx = x + rng.range(-1.2, 1.2);
      const fz = z + rng.range(-1.2, 1.2);
      const s = rng.range(0.8, 1.3);
      col.setHex(base).multiplyScalar(fdim);
      flowerB.add(fx, c.height(fx, fz), fz, s, s, rng.range(0, 6.28), col);
    }
  }
  flowerB.emit(scene, chunks, flowerGeo, flowerMat, { cast: false, chunk: 48, maxDist: grassFar + 6 });

  layer(5);
  // mushrooms around tree bases
  const mushGeo = own(
    mergeGeometries(
      [
        new THREE.CylinderGeometry(0.03, 0.04, 0.12, 6).translate(0, 0.06, 0),
        new THREE.SphereGeometry(0.075, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.12, 0),
      ].map((g, i) => {
        paint(g, () => (i === 0 ? 0.95 : 0.8));
        return g;
      }),
    )!,
  );
  const mushMat = own(new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.7 }));
  const mushB = new Batch();
  for (let i = 0; i < 260; i++) {
    const t = trees[Math.floor(rng.next() * trees.length)];
    if (!t) break;
    const a = rng.range(0, 6.28);
    const r = 0.7 * t.s + rng.range(0.1, 1.2);
    const x = t.x + Math.cos(a) * r;
    const z = t.z + Math.sin(a) * r;
    const s = rng.range(0.8, 2.2);
    col.setHex(rng.next() < 0.5 ? 0xc02a22 : rng.next() < 0.5 ? 0xb8845a : 0xe8dcc0).multiplyScalar(dim);
    mushB.add(x, c.height(x, z), z, s, s, 0, col);
  }
  mushB.emit(scene, chunks, mushGeo, mushMat, { cast: false, chunk: 48, maxDist: 40 * q.viewScale });

  return { chunks };
}

export function rockGeometry(k: number, detail = 1): THREE.BufferGeometry {
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g, 1e-3);
  g.scale(1 + k * 0.15, 0.7, 1 - k * 0.1);
  displace(g, 0.28, 1.1, k * 3.1);
  paint(g, (_x, _y, _z, ny) => 0.65 + 0.35 * Math.max(0, ny));
  return g;
}

function flowerGeometry(): THREE.BufferGeometry {
  const stem = stripTo(new THREE.CylinderGeometry(0.005, 0.007, 0.18, 3).translate(0, 0.09, 0), ['position', 'normal']);
  paint(stem, () => new THREE.Color(0.18, 0.3, 0.12));
  const petals: THREE.BufferGeometry[] = [stem];
  const n = 5;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const g = new THREE.BufferGeometry();
    const r = 0.05;
    const w = 0.022;
    const tip = [Math.cos(a) * r, 0.19 + 0.012, Math.sin(a) * r];
    const l = [Math.cos(a + Math.PI / 2) * w, 0.185, Math.sin(a + Math.PI / 2) * w];
    const rr = [Math.cos(a - Math.PI / 2) * w, 0.185, Math.sin(a - Math.PI / 2) * w];
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0.18, 0, ...l, ...tip, 0, 0.18, 0, ...tip, ...rr]), 3));
    g.computeVertexNormals();
    const nrm = g.attributes.normal;
    for (let k = 0; k < nrm.count; k++) nrm.setXYZ(k, 0, 1, 0);
    paint(g, () => 1);
    petals.push(g);
  }
  const centre = stripTo(new THREE.SphereGeometry(0.014, 5, 3).translate(0, 0.19, 0), ['position', 'normal']);
  paint(centre, () => new THREE.Color(0.9, 0.7, 0.15));
  petals.push(centre);
  return mergeGeometries(petals.map((g) => nonIndexed(g)))!;
}
