import * as THREE from 'three';
import type { SpeciesDef } from '../data/animals';

export interface AnimalModel {
  group: THREE.Group;
  legs: THREE.Object3D[];
  head: THREE.Object3D;
  mats: THREE.MeshStandardMaterial[];
  top: number; // height of the highest point, for the alert marker
}

/** Builds a simple low-poly animal from the numbers in `SpeciesDef.body`. Faces +z. */
export function buildAnimalModel(def: SpeciesDef): AnimalModel {
  const b = def.body;
  const group = new THREE.Group();
  const mats: THREE.MeshStandardMaterial[] = [];
  const mat = (color: number, emissive = 0) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.92, emissive, emissiveIntensity: emissive ? 0.35 : 0 });
    mats.push(m);
    return m;
  };
  const main = mat(b.color, b.glow ? 0x9fb8ff : 0);
  const accent = mat(b.accent, b.glow ? 0xbfd0ff : 0);
  const dark = mat(0x1a1410);
  const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
  const legs: THREE.Object3D[] = [];

  if (b.bird) {
    const bodyM = add(group, new THREE.SphereGeometry(1, 10, 8), main, 0, b.legs + b.height * 0.5, 0);
    bodyM.scale.set(b.width * 0.55, b.height * 0.55, b.length * 0.6);
    const head = new THREE.Group();
    head.position.set(0, b.legs + b.height * 1.05, b.length * 0.5);
    group.add(head);
    add(head, new THREE.SphereGeometry(b.head * 0.7, 8, 6), mat(b.accent));
    add(head, new THREE.ConeGeometry(b.head * 0.25, b.head * 0.7, 5).rotateX(Math.PI / 2), mat(0xd8b24a), 0, -0.01, b.head * 0.7);
    const tail = add(group, box(0.1, 0.03, b.length * 0.9), mat(0x7a4a22), 0, b.legs + b.height * 0.6, -b.length * 0.7);
    tail.rotation.x = 0.25;
    for (const s of [-1, 1]) {
      const leg = new THREE.Group();
      leg.position.set(s * b.width * 0.2, b.legs, 0);
      add(leg, box(0.025, b.legs, 0.025), dark, 0, -b.legs / 2, 0);
      group.add(leg);
      legs.push(leg);
    }
    return { group, legs, head, mats, top: b.legs + b.height * 1.4 };
  }

  const tall = b.legs > 0.65;
  const bodyY = b.legs + b.height / 2;
  add(group, box(b.width, b.height, b.length), main, 0, bodyY, 0);
  if (b.hump) add(group, box(b.width * 0.9, b.height * 0.5, b.length * 0.35), main, 0, bodyY + b.height * 0.45, b.length * 0.18);
  const lw = Math.max(0.06, b.width * 0.26);
  for (const sz of [1, -1])
    for (const sx of [-1, 1]) {
      const leg = new THREE.Group();
      leg.position.set(sx * b.width * 0.32, b.legs + 0.02, sz * b.length * 0.36);
      add(leg, box(lw, b.legs + 0.02, lw), tall ? dark : main, 0, -b.legs / 2, 0);
      group.add(leg);
      legs.push(leg);
    }

  // neck and head
  const head = new THREE.Group();
  const headY = tall ? b.legs + b.height * 1.35 : bodyY + b.height * 0.1;
  const headZ = b.length / 2 + b.head * (tall ? 0.5 : 0.6);
  if (tall) {
    const neck = add(group, box(b.width * 0.55, b.height * 0.9, b.width * 0.55), main, 0, b.legs + b.height * 1.0, b.length * 0.42);
    neck.rotation.x = -0.55;
  }
  head.position.set(0, headY, headZ);
  group.add(head);
  add(head, box(b.head, b.head, b.head * 1.25), main);
  const snout = add(head, box(b.head * 0.6, b.head * 0.55, b.head * 0.7), accent, 0, -b.head * 0.12, b.head * 0.85);
  add(head, box(b.head * 0.14, b.head * 0.14, b.head * 0.1), dark, 0, -b.head * 0.02, b.head * 1.2);
  for (const s of [-1, 1]) {
    add(head, box(b.head * 0.1, b.head * 0.1, b.head * 0.05), dark, s * b.head * 0.32, b.head * 0.12, b.head * 0.62);
    if (b.longEars) {
      const ear = add(head, box(b.head * 0.18, b.head * 1.5, b.head * 0.08), main, s * b.head * 0.25, b.head * 0.95, -b.head * 0.1);
      ear.rotation.z = -s * 0.2;
    } else {
      const ear = add(head, new THREE.ConeGeometry(b.head * 0.18, b.head * 0.55, 4), main, s * b.head * 0.42, b.head * 0.55, -b.head * 0.2);
      ear.rotation.z = -s * 0.5;
    }
    if (b.tusks) {
      const t = add(head, new THREE.ConeGeometry(b.head * 0.07, b.head * 0.5, 5), mat(0xece4d0), s * b.head * 0.26, -b.head * 0.2, b.head * 1.15);
      t.rotation.x = -0.6;
    }
  }
  if (b.antlers) {
    const wood = mat(0xcbbd9d);
    for (const s of [-1, 1]) {
      if (b.antlers === 'moose') {
        const palm = add(head, box(b.head * 1.7, b.head * 0.08, b.head * 1.3), wood, s * b.head * 1.15, b.head * 0.75, 0);
        palm.rotation.z = s * 0.25;
        for (let i = 0; i < 4; i++) {
          const tine = add(head, box(b.head * 0.1, b.head * 0.1, b.head * 0.5), wood, s * b.head * (1.7 + 0.05 * i), b.head * 0.88, (i - 1.5) * b.head * 0.33);
          tine.rotation.z = s * 0.25;
        }
      } else {
        const beam = add(head, new THREE.CylinderGeometry(b.head * 0.05, b.head * 0.07, b.head * 1.6, 5), wood, s * b.head * 0.45, b.head * 1.15, -b.head * 0.15);
        beam.rotation.z = -s * 0.3;
        beam.rotation.x = -0.25;
        if (b.antlers === 'big') {
          for (let i = 0; i < 3; i++) {
            const tine = add(head, new THREE.CylinderGeometry(b.head * 0.03, b.head * 0.05, b.head * 0.7, 4), wood, s * b.head * (0.55 + i * 0.12), b.head * (0.95 + i * 0.4), -b.head * (0.1 + i * 0.12));
            tine.rotation.z = -s * 0.7;
          }
        }
      }
    }
  }
  void snout;

  // tail
  if (b.bushyTail) {
    const tail = add(group, new THREE.ConeGeometry(b.width * 0.5, b.length * 0.7, 6), main, 0, bodyY + b.height * 0.1, -b.length * 0.75);
    tail.rotation.x = -Math.PI / 2 - 0.3;
    add(group, new THREE.ConeGeometry(b.width * 0.3, b.length * 0.2, 6), accent, 0, bodyY - b.height * 0.08, -b.length * 1.08).rotation.x = -Math.PI / 2 - 0.3;
  } else {
    add(group, box(0.08 + b.width * 0.15, 0.08 + b.width * 0.15, b.length * 0.18), b.longEars ? accent : main, 0, bodyY + b.height * 0.3, -b.length * 0.55);
  }
  const top = tall ? headY + b.head * (b.antlers ? 2.2 : 1) : bodyY + b.height * (b.hump ? 1.2 : 0.8) + b.head;
  return { group, legs, head, mats, top };
}
