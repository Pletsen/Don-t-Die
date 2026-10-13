import * as THREE from 'three';
import type { SpeciesDef } from '../data/animals';
import { grainTexture } from '../world/textures';

export interface AnimalModel {
  group: THREE.Group;
  legs: THREE.Object3D[];
  head: THREE.Object3D;
  mats: THREE.MeshStandardMaterial[];
  top: number; // height of the highest point, for the alert marker
}

let fur: THREE.CanvasTexture | null = null;
let unit: THREE.BufferGeometry | null = null;

/** One shared smooth sphere with a baked shade (lighter on top, darker underneath), scaled per body part. */
function sphere(): THREE.BufferGeometry {
  if (unit) return unit;
  const g = new THREE.SphereGeometry(1, 16, 12);
  const n = g.attributes.normal;
  const col = new Float32Array(n.count * 3);
  for (let i = 0; i < n.count; i++) {
    const v = 0.62 + 0.38 * (n.getY(i) * 0.5 + 0.5);
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = v;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  unit = g;
  return g;
}

/** Gives a geometry an all-white colour attribute, so materials with vertex colours do not render it black. */
function white1<T extends THREE.BufferGeometry>(g: T): T {
  const n = g.attributes.position.count;
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  return g;
}

/** Builds a detailed low-poly animal from the numbers in `SpeciesDef.body`. Faces +z. */
export function buildAnimalModel(def: SpeciesDef): AnimalModel {
  const b = def.body;
  fur ??= grainTexture(77, 0.45);
  const group = new THREE.Group();
  const mats: THREE.MeshStandardMaterial[] = [];
  const mat = (color: number, emissive = 0, vc = true) => {
    const m = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.9,
      map: fur,
      bumpMap: fur,
      bumpScale: 1.2,
      vertexColors: vc,
      emissive,
      emissiveIntensity: emissive ? 0.35 : 0,
    });
    mats.push(m);
    return m;
  };
  const main = mat(b.color, b.glow ? 0x9fb8ff : 0);
  const accent = mat(b.accent, b.glow ? 0xbfd0ff : 0);
  const dark = mat(0x1a1410);
  const hoof = mat(0x25201c, 0, false);
  const wood = mat(0xcdbf9f, 0, false);
  const white = mat(0xf2efe6, 0, false);

  const ell = (parent: THREE.Object3D, m: THREE.Material, rx: number, ry: number, rz: number, x = 0, y = 0, z = 0) => {
    const o = new THREE.Mesh(sphere(), m);
    o.scale.set(rx, ry, rz);
    o.position.set(x, y, z);
    o.castShadow = true;
    parent.add(o);
    return o;
  };
  const cyl = (parent: THREE.Object3D, m: THREE.Material, r0: number, r1: number, h: number, x = 0, y = 0, z = 0) => {
    const o = new THREE.Mesh(white1(new THREE.CylinderGeometry(r1, r0, h, 8)), m);
    o.position.set(x, y, z);
    o.castShadow = true;
    parent.add(o);
    return o;
  };
  const cone = (parent: THREE.Object3D, m: THREE.Material, r: number, h: number, x = 0, y = 0, z = 0) => {
    const o = new THREE.Mesh(white1(new THREE.ConeGeometry(r, h, 6)), m);
    o.position.set(x, y, z);
    o.castShadow = true;
    parent.add(o);
    return o;
  };
  const legs: THREE.Object3D[] = [];

  // ---------------- bird (fasan) ----------------
  if (b.bird) {
    const by = b.legs + b.height * 0.55;
    ell(group, main, b.width * 0.55, b.height * 0.6, b.length * 0.62, 0, by, 0);
    ell(group, accent, b.width * 0.5, b.height * 0.35, b.length * 0.5, 0, by - b.height * 0.2, 0.02);
    const wing = (s: number) => {
      const w = ell(group, mat(0x7a4a22), 0.03, b.height * 0.42, b.length * 0.45, s * b.width * 0.5, by + 0.01, -0.02);
      w.rotation.z = s * 0.15;
    };
    wing(1);
    wing(-1);
    const head = new THREE.Group();
    head.position.set(0, b.legs + b.height * 1.15, b.length * 0.55);
    group.add(head);
    ell(head, mat(0x2a6a4a), b.head * 0.55, b.head * 0.6, b.head * 0.7);
    ell(head, mat(0xc02a22), b.head * 0.18, b.head * 0.24, b.head * 0.3, b.head * 0.38, -0.005, b.head * 0.2);
    ell(head, mat(0xc02a22), b.head * 0.18, b.head * 0.24, b.head * 0.3, -b.head * 0.38, -0.005, b.head * 0.2);
    cone(head, mat(0xd8b24a), b.head * 0.18, b.head * 0.55, 0, -0.01, b.head * 0.8).rotation.x = Math.PI / 2;
    ell(group, white, b.width * 0.36, 0.02, b.width * 0.36, 0, b.legs + b.height * 1.02, b.length * 0.43);
    for (let i = -2; i <= 2; i++) {
      const f = ell(group, mat(i % 2 ? 0x7a4a22 : 0x9a5a2a), 0.025, 0.02, b.length * 0.9, i * 0.035, by + 0.04, -b.length * 0.95);
      f.rotation.y = i * 0.12;
      f.rotation.x = 0.12;
    }
    for (const s of [-1, 1]) {
      const leg = new THREE.Group();
      leg.position.set(s * b.width * 0.2, b.legs, 0);
      cyl(leg, hoof, 0.012, 0.016, b.legs, 0, -b.legs / 2, 0);
      ell(leg, hoof, 0.035, 0.012, 0.05, 0, -b.legs, 0.03);
      group.add(leg);
      legs.push(leg);
    }
    return { group, legs, head, mats, top: b.legs + b.height * 1.6 };
  }

  // ---------------- quadrupeds ----------------
  const tall = b.legs > 0.65;
  const bodyY = b.legs + b.height * 0.5;
  const rx = b.width * 0.5;
  const ry = b.height * 0.55;
  const rz = b.length * 0.5;
  ell(group, main, rx, ry, rz, 0, bodyY, 0); // torso
  ell(group, main, rx * 1.05, ry * 1.05, rz * 0.45, 0, bodyY + 0.01, rz * 0.45); // chest
  ell(group, main, rx * 1.0, ry * 1.0, rz * 0.4, 0, bodyY, -rz * 0.5); // haunch
  ell(group, accent, rx * 0.8, ry * 0.55, rz * 0.8, 0, bodyY - ry * 0.45, 0); // pale belly
  if (b.hump) ell(group, main, rx * 0.95, ry * 0.6, rz * 0.4, 0, bodyY + ry * 0.75, rz * 0.3);
  if (def.id === 'vildsvin') {
    // bristly ridge
    for (let i = 0; i < 9; i++) cone(group, dark, 0.04, 0.16, 0, bodyY + ry * 0.95, rz * (0.7 - i * 0.18));
  }

  // legs: thigh + shank + hoof/paw, hip pivot for swinging
  const paw = def.role === 'predator' || def.id === 'bjorn';
  const lw = Math.max(0.05, b.width * 0.19);
  for (const sz of [1, -1])
    for (const sx of [-1, 1]) {
      const leg = new THREE.Group();
      leg.position.set(sx * b.width * 0.33, b.legs + ry * 0.4, sz * b.length * 0.34);
      const upLen = (b.legs + ry * 0.4) * 0.5;
      ell(leg, main, lw * 1.35, upLen * 1.05, lw * 1.5, 0, -upLen * 0.5, 0);
      const low = new THREE.Group();
      low.position.set(0, -upLen, 0);
      leg.add(low);
      const lowLen = b.legs + ry * 0.4 - upLen;
      cyl(low, tall ? dark : main, lw * 0.75, lw * 0.5, lowLen, 0, -lowLen / 2, 0);
      if (paw) ell(low, main, lw * 1.0, lw * 0.5, lw * 1.4, 0, -lowLen, lw * 0.4);
      else ell(low, hoof, lw * 0.6, lw * 0.45, lw * 0.85, 0, -lowLen + 0.01, lw * 0.15);
      if (def.id === 'raev') ell(low, dark, lw * 0.8, lowLen * 0.4, lw * 0.8, 0, -lowLen * 0.7, 0); // black socks
      group.add(leg);
      legs.push(leg);
    }

  // neck and head
  const head = new THREE.Group();
  const neckLen = tall ? b.height * 1.0 : b.height * 0.5;
  const neckBaseY = bodyY + ry * 0.35;
  const neckBaseZ = rz * 0.78;
  const neckTilt = tall ? 0.85 : 0.25;
  const neck = cyl(group, main, rx * 0.8, rx * 0.55, neckLen, 0, neckBaseY + (neckLen / 2) * Math.cos(neckTilt), neckBaseZ + (neckLen / 2) * Math.sin(neckTilt));
  neck.rotation.x = neckTilt;
  const headY = neckBaseY + neckLen * Math.cos(neckTilt) + (tall ? b.head * 0.1 : -b.head * 0.1);
  const headZ = neckBaseZ + neckLen * Math.sin(neckTilt) + b.head * 0.35;
  head.position.set(0, headY, headZ);
  group.add(head);
  const snoutLen = def.id === 'ulv' || def.id === 'raev' ? 0.95 : def.id === 'vildsvin' ? 0.9 : def.id === 'elg' ? 1.15 : 0.7;
  ell(head, main, b.head * 0.5, b.head * 0.5, b.head * 0.6); // skull
  const snout = ell(head, def.id === 'hare' ? main : accent, b.head * 0.3, b.head * 0.27, b.head * snoutLen * 0.55, 0, -b.head * 0.12, b.head * 0.55);
  if (def.id === 'elg') snout.scale.set(b.head * 0.38, b.head * 0.34, b.head * 0.7);
  ell(head, dark, b.head * 0.1, b.head * 0.08, b.head * 0.08, 0, -b.head * 0.06, b.head * (0.55 + snoutLen * 0.5)); // nose
  for (const s of [-1, 1]) {
    ell(head, dark, b.head * 0.07, b.head * 0.07, b.head * 0.05, s * b.head * 0.36, b.head * 0.12, b.head * 0.38); // eye
    ell(head, white, b.head * 0.025, b.head * 0.025, b.head * 0.02, s * b.head * 0.38, b.head * 0.15, b.head * 0.43);
    if (b.longEars) {
      const ear = ell(head, main, b.head * 0.1, b.head * 0.85, b.head * 0.05, s * b.head * 0.2, b.head * 0.95, -b.head * 0.1);
      ear.rotation.z = -s * 0.18;
      ear.rotation.x = -0.15;
    } else if (def.id === 'bjorn') {
      ell(head, main, b.head * 0.14, b.head * 0.14, b.head * 0.08, s * b.head * 0.38, b.head * 0.42, -b.head * 0.1);
    } else {
      const big = tall ? 1.3 : 1;
      const ear = ell(head, main, b.head * 0.13 * big, b.head * 0.3 * big, b.head * 0.05, s * b.head * 0.44, b.head * 0.5, -b.head * 0.18);
      ear.rotation.z = -s * 0.7;
    }
    if (b.tusks) {
      const t = cone(head, white, b.head * 0.05, b.head * 0.45, s * b.head * 0.22, -b.head * 0.22, b.head * 0.95);
      t.rotation.x = -0.9;
    }
  }
  if (def.id === 'elg') ell(group, main, b.head * 0.1, b.head * 0.5, b.head * 0.1, 0, headY - b.head * 0.95, headZ - b.head * 0.1); // dewlap

  if (b.antlers) {
    for (const s of [-1, 1]) {
      if (b.antlers === 'moose') {
        const palm = ell(head, wood, b.head * 0.95, b.head * 0.05, b.head * 0.6, s * b.head * 1.2, b.head * 0.7, -b.head * 0.1);
        palm.rotation.z = s * 0.25;
        for (let i = 0; i < 6; i++) {
          const tine = cone(head, wood, b.head * 0.05, b.head * 0.4, s * b.head * (1.75 + 0.03 * i), b.head * 0.82, (i - 2.5) * b.head * 0.25);
          tine.rotation.z = -s * 1.4;
        }
        cyl(head, wood, b.head * 0.07, b.head * 0.07, b.head * 0.5, s * b.head * 0.55, b.head * 0.5, -b.head * 0.1).rotation.z = s * 1.1;
      } else {
        const beam = cyl(head, wood, b.head * 0.07, b.head * 0.04, b.head * 1.9, s * b.head * 0.45, b.head * 1.3, -b.head * 0.3);
        beam.rotation.z = -s * 0.28;
        beam.rotation.x = -0.4;
        const tines = b.antlers === 'big' ? 4 : 1;
        for (let i = 0; i < tines; i++) {
          const t = cone(head, wood, b.head * 0.035, b.head * 0.7, s * b.head * (0.55 + i * 0.09), b.head * (0.8 + i * 0.42), b.head * (0.1 - i * 0.2));
          t.rotation.z = -s * 0.5;
          t.rotation.x = 0.3;
        }
      }
    }
  }

  // tail
  if (b.bushyTail) {
    const t = ell(group, main, rx * 0.5, rx * 0.5, b.length * 0.42, 0, bodyY + ry * 0.1, -rz - b.length * 0.28);
    t.rotation.x = 0.35;
    ell(group, accent, rx * 0.42, rx * 0.42, b.length * 0.14, 0, bodyY - ry * 0.05, -rz - b.length * 0.62).rotation.x = 0.35;
  } else if (b.longEars) {
    ell(group, white, 0.07, 0.07, 0.07, 0, bodyY + ry * 0.5, -rz - 0.02);
    // big hind haunches for the hare
    for (const s of [-1, 1]) ell(group, main, rx * 0.55, ry * 1.1, rz * 0.45, s * rx * 0.9, bodyY, -rz * 0.45);
  } else {
    cone(group, def.id === 'raadyr' || def.id === 'hvidhjort' ? white : main, 0.05 + rx * 0.2, 0.2 + b.length * 0.08, 0, bodyY + ry * 0.45, -rz - 0.02).rotation.x = -2.2;
  }

  const top = tall ? headY + b.head * (b.antlers ? 2.4 : 1.1) : bodyY + ry * (b.hump ? 1.5 : 1.1) + b.head * 0.6;
  return { group, legs, head, mats, top };
}
