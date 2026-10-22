import * as THREE from 'three';
import type { BodyDef, SpeciesDef } from '../data/animals';

/**
 * Procedural animal models.
 *
 * Every animal is ONE skinned mesh (plus a tiny eye mesh): all body parts are merged into one geometry with vertex
 * colours, and each part is rigidly bound to a bone. The bones are the animatable nodes (pose = body pivot, neck, head,
 * ears, tail, hips, shanks, wings). That keeps an animal at 2 draw calls (1 shadow call) instead of ~31.
 * Facing +z, origin between the feet. All bones have zero rotation in the bind pose, so animation values are deltas.
 */
export interface AnimalModel {
  group: THREE.Group;
  mesh: THREE.SkinnedMesh;
  eyes: THREE.Mesh;
  /** Body pivot at the body centre. Rolls, pitches, flinches, banking and the death fall rotate this. */
  pose: THREE.Bone;
  neck: THREE.Bone;
  head: THREE.Bone;
  tail: THREE.Bone;
  ears: THREE.Bone[];
  /** Hip/shoulder pivots in the order [FR, FL, BR, BL] (birds: [R, L]). */
  legs: THREE.Bone[];
  /** Knee/hock pivots, same order as `legs`. */
  shanks: THREE.Bone[];
  /** Bird wings [R, L]; empty for quadrupeds. Rotation order ZYX: y spreads, z flaps. */
  wings: THREE.Bone[];
  mat: THREE.MeshStandardMaterial;
  eyeMat: THREE.MeshStandardMaterial;
  /** Kept for older code: the materials that take the hit flash. */
  mats: THREE.MeshStandardMaterial[];
  top: number; // height of the highest point, for the alert marker
  bodyY: number; // body centre height (pose bone)
  hipY: number[]; // hip height per leg
  /** Body ellipsoid semi-axes around the pose bone (for arrow entry points). */
  half: THREE.Vector3;
  /** Forward distance from the feet origin to the nose tip, and its height. */
  reach: number;
  snoutY: number;
  /** Local positions (relative to `legs[i]`) of each foot, for hit-to-leg mapping. */
  feet: THREE.Vector3[];
  /** Bind-pose world positions of every bone (animal space). */
  boneRest: Map<THREE.Bone, THREE.Vector3>;
  dispose(): void;
}

export interface ModelOptions {
  /** 0..1 per individual: small size and colour variation, roe deer bucks vs does. */
  variant?: number;
  /** Uniform scale on all body dimensions (bosses). */
  scale?: number;
  /** Extra parts for bosses (ruffs, scars, moss). Called after the standard parts are built. */
  extras?: (kit: ModelKit) => void;
}

/** What `extras` gets to add parts with. Points are in animal space (feet origin, facing +z). */
export interface ModelKit {
  b: BodyDef;
  ell: (bone: THREE.Bone, c: THREE.Vector3, rx: number, ry: number, rz: number, color: number, q?: THREE.Quaternion, o?: Partial<PartOpts>) => void;
  taper: (bone: THREE.Bone, a: THREE.Vector3, b: THREE.Vector3, ra: number, rb: number, color: number, o?: Partial<PartOpts>) => void;
  cone: (bone: THREE.Bone, base: THREE.Vector3, tip: THREE.Vector3, r: number, color: number, o?: Partial<PartOpts>) => void;
  bones: { pose: THREE.Bone; neck: THREE.Bone; head: THREE.Bone; tail: THREE.Bone; ears: THREE.Bone[]; legs: THREE.Bone[]; shanks: THREE.Bone[] };
  p: { bodyY: number; rx: number; ry: number; rz: number; neckBase: THREE.Vector3; headJoint: THREE.Vector3; skull: THREE.Vector3; nd: THREE.Vector3; snoutTip: THREE.Vector3; eye: THREE.Vector3[] };
  /** Overrides an eye's colour (e.g. a milky blind eye): index 0 = right, 1 = left. */
  eyeColor: (i: number, color: number) => void;
}

interface PartOpts {
  counter: number | null; // belly colour mixed in on downward-facing normals
  spine: number | null; // back colour mixed in on upward-facing normals
  shade: number; // how much darker the underside is
  rough: number; // vertex noise amount
}

const UP = new THREE.Vector3(0, 1, 0);
const FWD = new THREE.Vector3(0, 0, 1);
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------- shared resources (never disposed)
let furTex: THREE.CanvasTexture | null = null;
/** Directional fur streaks: soft vertical strands with a little clumping. Used as colour and bump map. */
function furTexture(): THREE.CanvasTexture {
  if (furTex) return furTex;
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgb(225,225,225)';
  g.fillRect(0, 0, S, S);
  let seed = 1234567;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 1400; i++) {
    const x = rnd() * S;
    const y = rnd() * S;
    const len = 6 + rnd() * 14;
    const v = 170 + Math.floor(rnd() * 85);
    g.strokeStyle = `rgba(${v},${v},${v},0.55)`;
    g.lineWidth = 0.6 + rnd() * 1.1;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + (rnd() - 0.5) * 3, y + len * 0.5, x + (rnd() - 0.5) * 4, y + len);
    g.stroke();
    // wrap vertically so the texture tiles
    if (y + len > S) {
      g.beginPath();
      g.moveTo(x, y - S);
      g.lineTo(x, y + len - S);
      g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 2);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 2;
  furTex = t;
  return t;
}

const geoCache = new Map<string, THREE.BufferGeometry>();
function cached(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geoCache.get(key);
  if (!g) geoCache.set(key, (g = make()));
  return g;
}
const sphereGeo = (fine: boolean) => cached(fine ? 's1' : 's0', () => new THREE.SphereGeometry(1, fine ? 16 : 10, fine ? 12 : 7));
/** Unit cylinder of height 1, radius 1 at +y and `k` at -y. */
const taperGeo = (k: number) => {
  const kk = Math.round(k * 20) / 20;
  return cached('t' + kk, () => new THREE.CylinderGeometry(1, kk, 1, 8, 1, true));
};
const coneGeo = () => cached('c', () => new THREE.ConeGeometry(1, 1, 7, 1, true));

// ---------------------------------------------------------------- geometry builder
const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _nm = new THREE.Matrix3();
const _c = new THREE.Color();
const _c2 = new THREE.Color();

function hash3(x: number, y: number, z: number): number {
  const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return h - Math.floor(h);
}

class Builder {
  P: number[] = [];
  N: number[] = [];
  U: number[] = [];
  C: number[] = [];
  S: number[] = [];
  I: number[] = [];
  top = 0;

  add(geo: THREE.BufferGeometry, m: THREE.Matrix4, bone: number, color: number, o: PartOpts, uvScale = 1) {
    const pos = geo.attributes.position;
    const nor = geo.attributes.normal;
    const uv = geo.attributes.uv;
    const base = this.P.length / 3;
    _nm.getNormalMatrix(m);
    const col = _c.setHex(color);
    for (let i = 0; i < pos.count; i++) {
      _v.fromBufferAttribute(pos as THREE.BufferAttribute, i).applyMatrix4(m);
      _n.fromBufferAttribute(nor as THREE.BufferAttribute, i).applyMatrix3(_nm).normalize();
      this.P.push(_v.x, _v.y, _v.z);
      this.N.push(_n.x, _n.y, _n.z);
      if (uv) this.U.push(uv.getX(i) * uvScale, uv.getY(i) * uvScale);
      else this.U.push(0, 0);
      if (_v.y > this.top) this.top = _v.y;
      let r = col.r;
      let g = col.g;
      let b = col.b;
      const ny = _n.y;
      if (o.counter !== null) {
        const t = smooth(-0.05, -0.6, ny);
        _c2.setHex(o.counter);
        r += (_c2.r - r) * t;
        g += (_c2.g - g) * t;
        b += (_c2.b - b) * t;
      }
      if (o.spine !== null) {
        const t = smooth(0.6, 0.97, ny) * 0.75;
        _c2.setHex(o.spine);
        r += (_c2.r - r) * t;
        g += (_c2.g - g) * t;
        b += (_c2.b - b) * t;
      }
      const shade = 1 - o.shade * (0.5 - 0.5 * ny);
      const noise = 1 + (hash3(_v.x * 9, _v.y * 9, _v.z * 9) - 0.5) * o.rough;
      const k = shade * noise;
      this.C.push(r * k, g * k, b * k);
      this.S.push(bone);
    }
    if (geo.index) {
      const idx = geo.index;
      for (let i = 0; i < idx.count; i++) this.I.push(base + idx.getX(i));
    } else for (let i = 0; i < pos.count; i++) this.I.push(base + i);
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    const n = this.P.length / 3;
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.U, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.C, 3));
    const si = new Uint16Array(n * 4);
    const sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      si[i * 4] = this.S[i];
      sw[i * 4] = 1;
    }
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    g.setIndex(this.I);
    return g;
  }
}

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function qDir(from: THREE.Vector3, dir: THREE.Vector3): THREE.Quaternion {
  return new THREE.Quaternion().setFromUnitVectors(from, _v.copy(dir).normalize());
}

const SPECIES_VARIANT_TINT = 0.07;

// ---------------------------------------------------------------- the model
export function buildAnimalModel(def: SpeciesDef, opts: ModelOptions = {}): AnimalModel {
  const variant = opts.variant ?? 0.5;
  const sizeK = (opts.scale ?? 1) * (1 + (variant - 0.5) * 0.1);
  const src = def.body;
  const b: BodyDef = {
    ...src,
    length: src.length * sizeK,
    height: src.height * sizeK,
    width: src.width * sizeK,
    legs: src.legs * sizeK,
    head: src.head * sizeK,
  };
  // individual colour variation: a little lighter or darker
  const tint = (hex: number) => {
    const c = new THREE.Color(hex);
    const k = 1 + (variant - 0.5) * 2 * SPECIES_VARIANT_TINT;
    return c.setRGB(Math.min(1, c.r * k), Math.min(1, c.g * k), Math.min(1, c.b * k)).getHex();
  };
  const main = tint(b.color);
  const accent = b.accent;
  const dark = b.dark ?? 0x1e1712;
  const hoofC = 0x1c1814;
  const noseC = 0x141110;
  const hornC = 0xcbb894;

  const builder = new Builder();
  const bones: THREE.Bone[] = [];
  const rest = new Map<THREE.Bone, THREE.Vector3>();
  const parentOf = new Map<THREE.Bone, THREE.Bone | null>();
  const bone = (name: string, at: THREE.Vector3, parent: THREE.Bone | null) => {
    const bn = new THREE.Bone();
    bn.name = name;
    bones.push(bn);
    rest.set(bn, at.clone());
    parentOf.set(bn, parent);
    return bn;
  };
  const idx = (bn: THREE.Bone) => bones.indexOf(bn);

  const opt = (o?: Partial<PartOpts>): PartOpts => ({ counter: null, spine: null, shade: 0.34, rough: 0.07, ...o });
  const m4 = new THREE.Matrix4();
  const ell = (bn: THREE.Bone, c: THREE.Vector3, rx: number, ry: number, rz: number, color: number, q?: THREE.Quaternion, o?: Partial<PartOpts>, fine = true) => {
    m4.compose(c, q ?? new THREE.Quaternion(), V(rx, ry, rz));
    builder.add(sphereGeo(fine), m4, idx(bn), color, opt(o));
  };
  const taper = (bn: THREE.Bone, a: THREE.Vector3, bb: THREE.Vector3, ra: number, rb: number, color: number, o?: Partial<PartOpts>) => {
    const d = a.clone().sub(bb);
    const len = d.length();
    m4.compose(a.clone().add(bb).multiplyScalar(0.5), qDir(UP, d), V(ra, len, ra));
    builder.add(taperGeo(rb / ra), m4, idx(bn), color, opt(o));
    // round caps so joints do not show open tubes
    ell(bn, a, ra, ra, ra, color, undefined, o, false);
    ell(bn, bb, rb, rb, rb, color, undefined, o, false);
  };
  const cone = (bn: THREE.Bone, base: THREE.Vector3, tip: THREE.Vector3, r: number, color: number, o?: Partial<PartOpts>) => {
    const d = tip.clone().sub(base);
    const len = d.length();
    m4.compose(base.clone().addScaledVector(d, 0.5), qDir(UP, d), V(r, len, r));
    builder.add(coneGeo(), m4, idx(bn), color, opt(o));
  };
  /** Ellipsoid stretched between two points. */
  const limb = (bn: THREE.Bone, a: THREE.Vector3, bb: THREE.Vector3, r: number, color: number, o?: Partial<PartOpts>, rz?: number) => {
    const d = bb.clone().sub(a);
    const len = d.length();
    m4.compose(a.clone().add(bb).multiplyScalar(0.5), qDir(UP, d), V(r, len * 0.5 + r * 0.25, rz ?? r));
    builder.add(sphereGeo(false), m4, idx(bn), color, opt(o));
  };

  const fur = opt({ counter: accent, spine: dark });
  const eyeParts: { at: THREE.Vector3; r: number; color: number }[] = [];
  let model: Omit<AnimalModel, 'group' | 'mesh' | 'eyes' | 'mat' | 'eyeMat' | 'mats' | 'top' | 'dispose' | 'boneRest'>;
  let kit: ModelKit | null = null;

  if (b.bird) model = buildBird();
  else model = buildQuad();

  function buildBird() {
    const h = b.head;
    const rx = b.width * 0.5;
    const ry = b.height * 0.55;
    const rz = b.length * 0.55;
    const bodyY = b.legs + ry * 0.9;
    const pose = bone('pose', V(0, bodyY, 0), null);
    // body: tilted egg, copper with darker scaled back, a dark rump
    const tilt = new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), -0.18);
    ell(pose, V(0, bodyY, 0), rx, ry, rz, main, tilt, { counter: 0x6a3a1a, spine: 0x5a3a1e });
    ell(pose, V(0, bodyY - ry * 0.1, rz * 0.45), rx * 0.9, ry * 0.85, rz * 0.5, 0xb0642a, tilt, { counter: 0x5a2a12 });
    ell(pose, V(0, bodyY + ry * 0.25, -rz * 0.55), rx * 0.75, ry * 0.6, rz * 0.45, 0x6a7a5a, tilt);
    // neck and head
    const nb = V(0, bodyY + ry * 0.55, rz * 0.75);
    const neck = bone('neck', nb, pose);
    const hj = nb.clone().add(V(0, b.height * 0.55, b.height * 0.18));
    taper(neck, hj, nb, h * 0.32, rx * 0.55, 0x1f4a3a);
    ell(neck, nb.clone().add(V(0, b.height * 0.12, 0.03)), rx * 0.5, 0.025, rx * 0.5, 0xf2efe6); // white ring
    const head = bone('head', hj, neck);
    const sc = hj.clone().add(V(0, h * 0.2, h * 0.15));
    ell(head, sc, h * 0.42, h * 0.45, h * 0.55, 0x1c4a3c);
    for (const s of [-1, 1]) ell(head, sc.clone().add(V(s * h * 0.3, -h * 0.02, h * 0.18)), h * 0.18, h * 0.24, h * 0.3, 0xc02a22); // wattles
    ell(head, sc.clone().add(V(0, h * 0.42, -h * 0.25)), h * 0.12, h * 0.2, h * 0.08, 0x1c4a3c); // ear tufts
    const tip = sc.clone().add(V(0, -h * 0.12, h * 0.95));
    cone(head, sc.clone().add(V(0, -h * 0.05, h * 0.45)), tip, h * 0.16, 0xd8c08a);
    for (const s of [-1, 1]) eyeParts.push({ at: sc.clone().add(V(s * h * 0.36, h * 0.12, h * 0.2)), r: h * 0.08, color: 0x8a6a2a });
    // wings (folded along the flanks); flapping rotates them out
    const wings: THREE.Bone[] = [];
    for (const s of [-1, 1]) {
      const at = V(s * rx * 0.75, bodyY + ry * 0.35, rz * 0.35);
      const w = bone(s < 0 ? 'wingR' : 'wingL', at, pose);
      w.rotation.order = 'ZYX';
      ell(w, at.clone().add(V(s * 0.03, -ry * 0.15, -rz * 0.45)), 0.03, ry * 0.55, rz * 0.65, 0x8a5a2a, new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), 0.25), { spine: 0x5a3a1a });
      wings.push(w);
    }
    // long barred tail
    const tb = V(0, bodyY + ry * 0.2, -rz * 0.85);
    const tail = bone('tail', tb, pose);
    for (let i = -1; i <= 1; i++) {
      const end = tb.clone().add(V(i * 0.04, 0.12, -b.length * (i === 0 ? 1.15 : 0.95)));
      limb(tail, tb, end, 0.025, i === 0 ? 0x8a5a2a : 0x6a4422, { rough: 0.25 }, 0.008);
    }
    // legs
    const legs: THREE.Bone[] = [];
    const shanks: THREE.Bone[] = [];
    const hipY: number[] = [];
    const feet: THREE.Vector3[] = [];
    for (const s of [-1, 1]) {
      const hip = V(s * rx * 0.35, bodyY - ry * 0.55, 0.02);
      const leg = bone('hip', hip, pose);
      const knee = V(hip.x, hip.y * 0.5, hip.z - 0.03);
      limb(leg, hip, knee, 0.028, 0x8a5a2a);
      const sh = bone('shank', knee, leg);
      taper(sh, knee, V(hip.x, 0.02, hip.z + 0.01), 0.012, 0.01, 0x8a8478);
      for (const a of [-0.5, 0, 0.5]) limb(sh, V(hip.x, 0.012, hip.z), V(hip.x + Math.sin(a) * 0.06, 0.008, hip.z + Math.cos(a) * 0.06), 0.008, 0x8a8478);
      legs.push(leg);
      shanks.push(sh);
      hipY.push(hip.y);
      feet.push(V(0, -hip.y, 0));
    }
    // ears: bones only (no visible ears on a bird)
    const ears = [bone('earR', sc.clone(), head), bone('earL', sc.clone(), head)];
    const st = tip;
    return { pose, neck, head, tail, ears, legs, shanks, wings, bodyY, hipY, half: V(rx, ry, rz), reach: st.z, snoutY: st.y, feet };
  }

  function buildQuad() {
    const h = b.head;
    const id = def.id;
    const rx = b.width * 0.5;
    const ry = b.height * 0.55;
    const rz = b.length * 0.5;
    const bodyY = b.legs + ry * 0.92;
    const pose = bone('pose', V(0, bodyY, 0), null);
    const isDeer = b.ears === 'deer';
    const pred = def.role === 'predator';

    // ---- torso: barrel, deep chest, haunch; species shapes
    const chestK = id === 'vildsvin' ? 1.16 : id === 'ulv' || id === 'raev' ? 1.06 : 1.03;
    const haunchK = id === 'vildsvin' ? 0.86 : id === 'hare' ? 1.18 : id === 'elg' ? 0.9 : id === 'ulv' ? 0.88 : 1;
    const waistK = id === 'ulv' || id === 'raev' ? 0.82 : id === 'hare' ? 0.95 : 0.94;
    ell(pose, V(0, bodyY, -rz * 0.02), rx * waistK, ry * 0.95, rz * 0.62, main, undefined, fur);
    ell(pose, V(0, bodyY + ry * 0.04, rz * 0.36), rx * chestK, ry * 1.04 * chestK, rz * 0.5, main, undefined, fur);
    const hy = id === 'hare' ? bodyY + ry * 0.12 : id === 'elg' ? bodyY - ry * 0.06 : bodyY;
    ell(pose, V(0, hy, -rz * 0.42), rx * haunchK, ry * 0.98 * haunchK, rz * 0.46, main, undefined, fur);
    if (b.hump) {
      const hz = id === 'bjorn' ? rz * 0.45 : rz * 0.42;
      ell(pose, V(0, bodyY + ry * 0.62, hz), rx * 0.78, ry * 0.55, rz * 0.4, main, undefined, { ...fur, spine: id === 'bjorn' ? 0x6a5a48 : dark });
    }
    if (id === 'raadyr' || id === 'hvidhjort' || id === 'kronhjort') {
      // pale rump patch
      ell(pose, V(0, bodyY + ry * 0.15, -rz * 0.9), rx * 0.62, ry * 0.62, rz * 0.12, isDeer && id !== 'kronhjort' ? 0xf4efe4 : accent);
    }
    if (id === 'vildsvin') {
      // bristle ridge along the spine
      for (let i = 0; i < 10; i++) {
        const z = rz * (0.85 - i * 0.17);
        const y = bodyY + ry * (0.96 - Math.abs(i - 2) * 0.03) * (i < 2 ? 1.08 : 1);
        cone(pose, V(0, y - 0.04, z), V(0, y + 0.1 + (i < 4 ? 0.04 : 0), z - 0.05), 0.045, dark);
      }
    }

    // ---- neck
    const tilt = b.neck === 'upright' ? (id === 'elg' ? 0.95 : 0.62) : b.neck === 'level' ? 1.2 : b.neck === 'low' ? 1.5 : 1.35;
    const neckLen = b.neck === 'upright' ? b.height * (id === 'elg' ? 0.8 : 1.08) : b.neck === 'level' ? b.height * 0.8 : b.neck === 'low' ? b.height * 0.55 : b.height * 0.28;
    const nb = V(0, bodyY + ry * (b.neck === 'upright' ? 0.35 : b.neck === 'none' ? 0.05 : 0.2), rz * (b.neck === 'none' ? 0.62 : 0.72));
    const neck = bone('neck', nb, pose);
    const nDir = V(0, Math.cos(tilt), Math.sin(tilt));
    const hj = nb.clone().addScaledVector(nDir, neckLen);
    const neckR0 = Math.min(rx, ry) * (b.neck === 'none' ? 0.95 : 0.78);
    const neckR1 = h * (b.neck === 'none' ? 0.55 : 0.4);
    taper(neck, hj, nb, neckR1, neckR0, main, fur);
    // throat/chest blend
    ell(neck, nb.clone().addScaledVector(nDir, neckLen * 0.35), neckR0 * 0.92, neckR0 * 0.95, neckR0 * 0.9, main, undefined, fur);
    if (b.mane) {
      if (pred) {
        // ruff around the neck
        ell(neck, nb.clone().addScaledVector(nDir, neckLen * 0.4).add(V(0, 0.02, 0)), neckR0 * 1.18, neckR0 * 1.15, neckR0 * 0.85, main, undefined, { ...fur, rough: 0.2 });
      } else if (id === 'vildsvin') {
        cone(neck, nb.clone().add(V(0, neckR0 * 0.6, 0)), nb.clone().add(V(0, neckR0 * 1.25, -0.04)), 0.05, dark);
      } else {
        // shaggy mane on the underside of the neck (moose, red deer)
        const mid = nb.clone().addScaledVector(nDir, neckLen * 0.5);
        ell(neck, mid.clone().add(V(0, -neckR0 * 0.25, neckR0 * 0.35)), neckR0 * 0.75, neckLen * 0.42, neckR0 * 0.7, id === 'elg' ? 0x2e231c : 0x4a3220, qDir(UP, nDir), { rough: 0.3 });
      }
    }

    // ---- head
    const head = bone('head', hj, neck);
    const nd =
      b.neck === 'upright' ? V(0, id === 'elg' ? -0.85 : -0.62, 1).normalize() : b.neck === 'level' ? V(0, -0.2, 1).normalize() : b.neck === 'low' ? V(0, -0.3, 1).normalize() : V(0, -0.5, 1).normalize();
    const hq = qDir(FWD, nd);
    const sideX = V(1, 0, 0);
    const hUp = V().crossVectors(nd, sideX).normalize(); // head "up", perpendicular to the nose direction
    const sc = hj.clone().addScaledVector(nd, h * 0.18).addScaledVector(hUp, h * (b.neck === 'upright' ? 0.18 : 0.08));
    const skullK = id === 'bjorn' ? 1.15 : id === 'hare' ? 1.05 : 1;
    ell(head, sc, h * 0.46 * skullK, h * 0.44 * skullK, h * 0.52, main, hq, { ...fur, counter: id === 'bjorn' ? null : accent });
    if (pred || id === 'vildsvin') ell(head, sc.clone().addScaledVector(hUp, -h * 0.05).addScaledVector(nd, -h * 0.05), h * 0.5 * skullK, h * 0.38, h * 0.4, main, hq, fur); // cheeks
    // snout: tapered muzzle, a jaw and a dark nose pad
    const snoutLen = h * b.snout * 0.82;
    const s0 = sc.clone().addScaledVector(nd, h * 0.32).addScaledVector(hUp, -h * 0.08);
    const s1 = s0.clone().addScaledVector(nd, snoutLen).addScaledVector(hUp, id === 'vildsvin' ? -h * 0.06 : id === 'elg' ? -h * 0.02 : -h * 0.04);
    const r0 = h * (id === 'elg' ? 0.36 : id === 'vildsvin' ? 0.33 : id === 'bjorn' ? 0.34 : pred ? 0.3 : 0.28);
    const r1 = h * (id === 'elg' ? 0.3 : id === 'vildsvin' ? 0.22 : id === 'bjorn' ? 0.2 : pred ? 0.12 : id === 'hare' ? 0.16 : 0.15);
    const muzzleC = id === 'bjorn' ? 0x6a5040 : id === 'raadyr' || id === 'hvidhjort' ? main : id === 'elg' ? 0x2a211b : main;
    taper(head, s0, s1, r0, r1, muzzleC, { counter: pred && id !== 'bjorn' ? accent : null, spine: null, shade: 0.3, rough: 0.05 });
    // lower jaw
    limb(head, s0.clone().addScaledVector(hUp, -r0 * 0.55), s1.clone().addScaledVector(hUp, -r1 * 0.75).addScaledVector(nd, -r1 * 0.9), r1 * 0.85, pred ? accent : muzzleC);
    if (id === 'vildsvin') {
      // flat disc nose
      m4.compose(s1.clone().addScaledVector(nd, r1 * 0.2), hq, V(r1 * 1.15, r1 * 1.0, r1 * 0.28));
      builder.add(sphereGeo(false), m4, idx(head), 0x4a3a36, opt({ shade: 0.2 }));
    } else if (id === 'elg') {
      // overhanging bulbous nose
      ell(head, s1.clone().addScaledVector(hUp, r1 * 0.2), r1 * 1.15, r1 * 1.05, r1 * 1.2, 0x2a211b, hq);
      ell(head, s1.clone().addScaledVector(nd, r1 * 0.9).addScaledVector(hUp, -r1 * 0.1), r1 * 0.55, r1 * 0.45, r1 * 0.3, noseC, hq);
    } else {
      ell(head, s1.clone().addScaledVector(nd, r1 * 0.55).addScaledVector(hUp, r1 * 0.15), r1 * 0.9, r1 * 0.7, r1 * 0.55, noseC, hq, { shade: 0.2, rough: 0.02 });
    }
    // eyes: set into the skull, slightly forward
    const eyeR = h * (def.role === 'prey' ? 0.075 : 0.06);
    for (const s of [-1, 1]) {
      const e = sc.clone().addScaledVector(sideX, s * h * 0.38 * skullK).addScaledVector(hUp, h * 0.12).addScaledVector(nd, h * (b.neck === 'upright' ? 0.12 : 0.2));
      eyeParts.push({ at: e, r: eyeR, color: 0x0c0806 });
    }
    // ears (own bones so they can flick and pin)
    const ears: THREE.Bone[] = [];
    for (const s of [-1, 1]) {
      const base = sc.clone().addScaledVector(sideX, s * h * 0.28).addScaledVector(hUp, h * 0.34).addScaledVector(nd, -h * 0.2);
      const ear = bone(s < 0 ? 'earR' : 'earL', base, head);
      ears.push(ear);
      const k = b.earSize;
      const inner = isDeer ? 0x3a2a20 : dark;
      if (b.ears === 'deer') {
        const dir = V(s * 0.85, 0.55, 0).addScaledVector(nd, -0.15).normalize();
        ell(ear, base.clone().addScaledVector(dir, h * 0.36 * k), h * 0.15 * k, h * 0.38 * k, h * 0.055 * k, main, qDir(UP, dir), fur, false);
        ell(ear, base.clone().addScaledVector(dir, h * 0.36 * k).addScaledVector(nd, h * 0.03), h * 0.1 * k, h * 0.3 * k, h * 0.03 * k, inner, qDir(UP, dir), undefined, false);
      } else if (b.ears === 'pointed') {
        const dir = V(s * 0.32, 1, 0).addScaledVector(nd, 0.05).normalize();
        m4.compose(base.clone().addScaledVector(dir, h * 0.2 * k), qDir(UP, dir), V(h * 0.15 * k, h * 0.42 * k, h * 0.07 * k));
        builder.add(coneGeo(), m4, idx(ear), main, opt({ spine: dark }));
        ell(ear, base, h * 0.13 * k, h * 0.08, h * 0.08, main, undefined, undefined, false);
      } else if (b.ears === 'round') {
        ell(ear, base.clone().add(V(s * h * 0.06, h * 0.06, 0)), h * 0.15 * k, h * 0.14 * k, h * 0.07 * k, main, undefined, fur, false);
      } else if (b.ears === 'long') {
        const dir = V(s * 0.15, 1, 0).addScaledVector(nd, -0.45).normalize();
        ell(ear, base.clone().addScaledVector(dir, h * 0.62 * k), h * 0.13 * k, h * 0.65 * k, h * 0.05 * k, main, qDir(UP, dir), undefined, false);
        ell(ear, base.clone().addScaledVector(dir, h * 1.2 * k), h * 0.07, h * 0.1, h * 0.04, 0x1a1410, qDir(UP, dir), undefined, false); // black tips
      } else {
        const dir = V(s * 0.6, 0.75, 0).addScaledVector(nd, 0.25).normalize();
        m4.compose(base.clone().addScaledVector(dir, h * 0.13), qDir(UP, dir), V(h * 0.14, h * 0.3, h * 0.06));
        builder.add(coneGeo(), m4, idx(ear), main, opt());
      }
    }
    // tusks curving up from the jaw
    if (b.tusks) {
      for (const s of [-1, 1]) {
        const t0 = s0.clone().lerp(s1, 0.75).addScaledVector(sideX, s * r1 * 1.05).addScaledVector(hUp, -r1 * 0.3);
        const t1 = t0.clone().addScaledVector(hUp, h * 0.16).addScaledVector(nd, -h * 0.04).addScaledVector(sideX, s * h * 0.05);
        const t2 = t1.clone().addScaledVector(hUp, h * 0.08).addScaledVector(nd, -h * 0.07);
        cone(head, t0, t1, h * 0.045, 0xe8e0c8, { shade: 0.15, rough: 0 });
        cone(head, t1, t2, h * 0.03, 0xe8e0c8, { shade: 0.15, rough: 0 });
      }
    }
    if (id === 'elg') {
      // the bell (dewlap) under the throat
      ell(head, hj.clone().addScaledVector(hUp, -h * 0.5).addScaledVector(nd, h * 0.1), h * 0.08, h * 0.32, h * 0.12, 0x2e231c, undefined, { rough: 0.3 });
    }
    // antlers
    const wantAntlers = b.antlers && (id !== 'raadyr' || variant > 0.45);
    if (wantAntlers) {
      for (const s of [-1, 1]) {
        const ab = sc.clone().addScaledVector(sideX, s * h * 0.2).addScaledVector(hUp, h * 0.4).addScaledVector(nd, -h * 0.06);
        const at = (x: number, y: number, z: number) => ab.clone().add(V(s * x * h, y * h, z * h));
        const beam = (pts: THREE.Vector3[], r0: number, r1: number) => {
          for (let i = 0; i < pts.length - 1; i++) {
            const ra = r0 + ((r1 - r0) * i) / (pts.length - 1);
            const rb = r0 + ((r1 - r0) * (i + 1)) / (pts.length - 1);
            taper(head, pts[i], pts[i + 1], ra * h, rb * h, hornC, { shade: 0.25, rough: 0.12 });
          }
        };
        const tine = (from: THREE.Vector3, dx: number, dy: number, dz: number, r: number) => cone(head, from, from.clone().add(V(s * dx * h, dy * h, dz * h)), r * h, 0xd9cdb0, { shade: 0.2, rough: 0.1 });
        if (b.antlers === 'small') {
          const p = [at(0, 0, 0), at(0.06, 0.45, -0.05), at(0.05, 0.85, 0.02), at(0.02, 1.15, -0.04)];
          beam(p, 0.07, 0.035);
          tine(p[1], 0.02, 0.2, 0.22, 0.03);
          tine(p[2], 0.0, 0.12, -0.25, 0.028);
        } else if (b.antlers === 'big') {
          const p = [at(0, 0, 0), at(0.35, 0.55, -0.45), at(0.62, 1.35, -0.72), at(0.58, 2.15, -0.55), at(0.42, 2.75, -0.25)];
          beam(p, 0.085, 0.035);
          tine(at(0.12, 0.2, -0.15), 0.08, 0.32, 0.62, 0.035); // brow
          tine(at(0.3, 0.5, -0.4), 0.06, 0.3, 0.55, 0.03); // bez
          tine(p[2], 0.02, 0.32, 0.5, 0.03); // trez
          tine(p[3], -0.1, 0.45, 0.25, 0.026);
          tine(p[3], 0.18, 0.45, -0.1, 0.026);
          tine(p[4], -0.12, 0.35, 0.05, 0.022);
        } else {
          // moose: short pedicle, then a broad palm with tines along its rim
          const p0 = at(0.0, 0, 0);
          const p1 = at(0.55, 0.12, -0.05);
          taper(head, p0, p1, 0.09 * h, 0.08 * h, hornC, { shade: 0.25, rough: 0.12 });
          const U = V(s * 0.92, 0.38, 0).normalize();
          const Vv = V(0, 0.55, 0).addScaledVector(nd, -0.85).normalize();
          const W = V().crossVectors(U, Vv).normalize();
          const Vo = V().crossVectors(W, U).normalize();
          const shape = new THREE.Shape();
          const pts: [number, number][] = [[0, -0.12], [0.45, -0.32], [0.95, -0.3], [1.35, -0.08], [1.48, 0.28], [1.3, 0.6], [0.9, 0.72], [0.5, 0.6], [0.15, 0.3], [0, 0.1]];
          shape.moveTo(pts[0][0] * h, pts[0][1] * h);
          for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i][0] * h, pts[i][1] * h);
          const eg = new THREE.ExtrudeGeometry(shape, { depth: 0.06 * h, bevelEnabled: true, bevelThickness: 0.03 * h, bevelSize: 0.03 * h, bevelSegments: 1 });
          const basis = new THREE.Matrix4().makeBasis(U, Vo, W);
          basis.setPosition(p1);
          builder.add(eg, basis, idx(head), hornC, opt({ shade: 0.25, rough: 0.1 }), 0.2);
          eg.dispose();
          const rim: [number, number][] = [[0.45, -0.32], [0.95, -0.3], [1.35, -0.08], [1.48, 0.28], [1.3, 0.6], [0.9, 0.72], [0.5, 0.6]];
          for (const [u, v] of rim) {
            const from = p1.clone().addScaledVector(U, u * h).addScaledVector(Vo, v * h);
            const out = V().addScaledVector(U, u * 0.2).addScaledVector(Vo, v * 0.4).add(V(0, 0.25, 0)).normalize();
            cone(head, from, from.clone().addScaledVector(out, 0.32 * h), 0.04 * h, 0xd9cdb0, { shade: 0.2, rough: 0.1 });
          }
        }
      }
    }

    // ---- tail
    const tb = V(0, bodyY + ry * 0.45, -rz * 0.95);
    const tail = bone('tail', tb, pose);
    if (b.tail === 'bushy') {
      const end = tb.clone().add(V(0, -b.length * 0.32, -b.length * 0.42));
      limb(tail, tb, end, rx * 0.42, main, { counter: accent, spine: dark, shade: 0.3, rough: 0.2 });
      ell(tail, end.clone().lerp(tb, -0.12), rx * 0.3, rx * 0.3, rx * 0.45, id === 'raev' ? 0xf4efe6 : 0x2a2626, undefined, { rough: 0.2 });
    } else if (b.tail === 'flag') {
      const end = tb.clone().add(V(0, -b.height * 0.32, -b.length * 0.06));
      limb(tail, tb, end, rx * 0.22, main);
      ell(tail, tb.clone().lerp(end, 0.5).add(V(0, 0, -rx * 0.08)), rx * 0.16, b.height * 0.13, rx * 0.06, 0xf6f2ea);
    } else if (b.tail === 'thin') {
      const end = tb.clone().add(V(0, -b.height * 0.5, -0.06));
      taper(tail, tb, end, 0.03, 0.018, main);
      ell(tail, end, 0.035, 0.07, 0.035, dark, undefined, { rough: 0.3 });
    } else {
      ell(tail, tb.clone().add(V(0, -0.02, -0.03)), rx * 0.2, rx * 0.22, rx * 0.18, id === 'hare' ? 0xf6f2ea : main);
    }

    // ---- legs [FR, FL, BR, BL]
    const legs: THREE.Bone[] = [];
    const shanks: THREE.Bone[] = [];
    const hipY: number[] = [];
    const feet: THREE.Vector3[] = [];
    const lw = Math.max(0.028, b.width * (id === 'bjorn' ? 0.22 : pred ? 0.17 : 0.15));
    const legLow = b.hooves ? (id === 'elg' ? dark : isDeer || id === 'kronhjort' ? mix(main, dark, 0.45) : id === 'vildsvin' ? dark : main) : id === 'raev' || id === 'bjorn' ? dark : id === 'ulv' ? mix(main, accent, 0.25) : main;
    for (let i = 0; i < 4; i++) {
      const front = i < 2;
      const s = i % 2 === 0 ? -1 : 1;
      const hipH = bodyY - ry * (front ? 0.12 : 0.05);
      const hip = V(s * rx * (front ? 0.58 : 0.6), hipH, front ? rz * 0.55 : -rz * 0.56);
      const leg = bone(front ? (s < 0 ? 'FR' : 'FL') : s < 0 ? 'BR' : 'BL', hip, pose);
      const L = hipH;
      let knee: THREE.Vector3;
      let foot: THREE.Vector3;
      if (front) {
        knee = V(hip.x, L * 0.45, hip.z + L * 0.02);
        foot = V(hip.x, 0, hip.z + L * 0.03);
        // upper arm / shoulder
        limb(leg, hip.clone().add(V(0, ry * 0.1, -0.02)), knee, lw * (pred ? 1.45 : 1.3), main, fur, lw * (pred ? 1.5 : 1.45));
      } else {
        const hare = id === 'hare';
        knee = V(hip.x, L * (hare ? 0.28 : 0.4), hip.z - L * (hare ? 0.3 : 0.17));
        foot = V(hip.x, 0, hip.z - L * (hare ? 0.02 : 0.06));
        // big thigh/haunch muscle, then the gaskin down to the hock
        ell(leg, hip.clone().add(V(0, -L * 0.12, L * 0.04)), lw * (hare ? 2.3 : 1.75), L * 0.33, lw * (hare ? 2.8 : 2.1), main, undefined, fur);
        limb(leg, hip.clone().add(V(0, -L * 0.3, L * 0.06)), knee, lw * 1.0, main, fur);
      }
      const sh = bone(front ? 'shankF' : 'shankB', knee, leg);
      if (b.hooves) {
        const fet = foot.clone().add(V(0, L * 0.1, front ? -0.01 : -0.015));
        taper(sh, knee, fet, lw * 0.62, lw * 0.4, legLow, { counter: null, spine: null, shade: 0.25, rough: 0.05 });
        const hoofTip = foot.clone().add(V(0, 0.015, lw * 0.9));
        limb(sh, fet, foot.clone().add(V(0, lw * 0.35, lw * 0.25)), lw * 0.42, legLow);
        m4.compose(foot.clone().add(V(0, lw * 0.3, lw * 0.35)), new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), 0.5), V(lw * 0.5, lw * 0.55, lw * 0.7));
        builder.add(sphereGeo(false), m4, idx(sh), hoofC, opt({ shade: 0.15, rough: 0 }));
        void hoofTip;
      } else {
        const ankle = foot.clone().add(V(0, L * 0.09, 0));
        const thick = id === 'bjorn' ? 1.0 : 0.72;
        taper(sh, knee, ankle, lw * thick, lw * thick * 0.75, legLow, { counter: null, spine: null, shade: 0.28, rough: 0.08 });
        if (id === 'hare' && !front) ell(sh, foot.clone().add(V(0, 0.03, 0.06)), lw * 0.8, 0.03, L * 0.45, main);
        else ell(sh, foot.clone().add(V(0, lw * 0.42, lw * 0.4)), lw * (id === 'bjorn' ? 1.15 : 0.9), lw * 0.45, lw * (id === 'bjorn' ? 1.5 : 1.25), legLow, undefined, { shade: 0.3 });
        if (id === 'bjorn') for (const c of [-1, 0, 1]) cone(sh, foot.clone().add(V(c * lw * 0.5, lw * 0.3, lw * 1.5)), foot.clone().add(V(c * lw * 0.55, lw * 0.05, lw * 1.95)), lw * 0.12, 0x2a2420); // claws
      }
      legs.push(leg);
      shanks.push(sh);
      hipY.push(hipH);
      feet.push(foot.clone().sub(hip));
    }

    kit = {
      b,
      ell: (bn, c, a, bb, cc, color, q, o) => ell(bn, c, a, bb, cc, color, q, o),
      taper: (bn, a, bb, ra, rb, color, o) => taper(bn, a, bb, ra, rb, color, o),
      cone: (bn, a, bb, r, color, o) => cone(bn, a, bb, r, color, o),
      bones: { pose, neck, head, tail, ears, legs, shanks },
      p: { bodyY, rx, ry, rz, neckBase: nb, headJoint: hj, skull: sc, nd, snoutTip: s1, eye: eyeParts.map((e) => e.at) },
      eyeColor: (i, color) => {
        if (eyeParts[i]) eyeParts[i].color = color;
      },
    };
    return { pose, neck, head, tail, ears, legs, shanks, wings: [] as THREE.Bone[], bodyY, hipY, half: V(rx * 1.02, ry * 1.02, rz * 1.05), reach: s1.z + r1, snoutY: s1.y, feet };
  }

  const kitNow = kit as ModelKit | null;
  if (kitNow && opts.extras) opts.extras(kitNow);

  // ---- assemble the skeleton (bones relative to their parents, zero rotation)
  for (const bn of bones) {
    const p = parentOf.get(bn) ?? null;
    const at = rest.get(bn)!;
    if (p) {
      bn.position.copy(at).sub(rest.get(p)!);
      p.add(bn);
    } else bn.position.copy(at);
  }
  const geo = builder.build();
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.88,
    map: furTexture(),
    bumpMap: furTexture(),
    bumpScale: 0.9,
    emissive: b.glow ? 0x9fb8ff : 0x000000,
    emissiveIntensity: b.glow ? 0.35 : 0,
  });
  const mesh = new THREE.SkinnedMesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = false;
  mesh.add(model.pose);
  const skeleton = new THREE.Skeleton(bones);
  mesh.bind(skeleton);
  // generous fixed bounds: the bones move parts around (rearing, death falls)
  const span = Math.max(b.length * 1.6, builder.top * 1.2, 1);
  mesh.boundingSphere = new THREE.Sphere(V(0, builder.top * 0.45, 0), span);
  mesh.frustumCulled = true;

  // eyes: one small mesh on the head bone, with an emissive that glows at night (eyeshine)
  const eg = new THREE.BufferGeometry();
  {
    const tmp = new Builder();
    const headRest = rest.get(model.head)!;
    for (const e of eyeParts) {
      m4.compose(e.at.clone().sub(headRest), new THREE.Quaternion(), V(e.r, e.r, e.r * 0.8));
      tmp.add(sphereGeo(false), m4, 0, e.color, opt({ shade: 0.1, rough: 0 }));
    }
    eg.setAttribute('position', new THREE.Float32BufferAttribute(tmp.P, 3));
    eg.setAttribute('normal', new THREE.Float32BufferAttribute(tmp.N, 3));
    eg.setAttribute('color', new THREE.Float32BufferAttribute(tmp.C, 3));
    eg.setIndex(tmp.I);
  }
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.15, metalness: 0, emissive: b.eyeshine, emissiveIntensity: 0 });
  const eyes = new THREE.Mesh(eg, eyeMat);
  eyes.castShadow = false;
  model.head.add(eyes);

  const group = new THREE.Group();
  group.add(mesh);
  const top = builder.top;
  return {
    ...model,
    group,
    mesh,
    eyes,
    mat,
    eyeMat,
    mats: [mat],
    top,
    boneRest: rest,
    dispose() {
      geo.dispose();
      eg.dispose();
      mat.dispose();
      eyeMat.dispose();
      skeleton.dispose();
    },
  };
}

function mix(a: number, b: number, t: number): number {
  return new THREE.Color(a).lerp(new THREE.Color(b), t).getHex();
}
