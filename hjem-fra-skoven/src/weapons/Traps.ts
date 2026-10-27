import * as THREE from 'three';
import type { World } from '../world/World';
import type { Animal } from '../animals/Animal';
import type { Blood } from '../fx/Blood';

interface Trap {
  weaponId: string;
  type: 'snare' | 'bear';
  pos: THREE.Vector3;
  mesh: THREE.Group;
  jaws: THREE.Object3D[];
  radius: number;
  damage: number;
  root: number;
  sprung: boolean;
  /** Seconds since it sprang (jaw animation). */
  snapT: number;
}

interface Bait {
  weaponId: string;
  pos: THREE.Vector3;
  mesh: THREE.Group;
  life: number;
  lure: number;
  poison?: { dps: number; time: number };
}

export interface TrapSpec {
  weaponId: string;
  type: 'snare' | 'bear';
  radius: number;
  damage: number;
  root: number;
}

export interface BaitSpec {
  weaponId: string;
  life: number;
  lure: number;
  poison?: { dps: number; time: number };
}

// shared materials and geometries: placing a trap allocates only Object3Ds
const steel = new THREE.MeshStandardMaterial({ color: 0x5b6064, metalness: 0.7, roughness: 0.45 });
const rope = new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 1 });
const meatMat = new THREE.MeshStandardMaterial({ color: 0x8a2420, roughness: 0.45, emissive: 0x2a0606, emissiveIntensity: 0.4 });
const boneMat = new THREE.MeshStandardMaterial({ color: 0xe8e0cc, roughness: 0.8 });
const poisonMat = new THREE.MeshStandardMaterial({ color: 0x6fae3a, roughness: 0.6, emissive: 0x2a6a10, emissiveIntensity: 0.7 });
const geo = {
  ring: new THREE.TorusGeometry(0.55, 0.035, 5, 16),
  stake: new THREE.CylinderGeometry(0.03, 0.04, 0.4, 5),
  jawHalf: new THREE.TorusGeometry(0.42, 0.05, 5, 10, Math.PI),
  tooth: new THREE.ConeGeometry(0.035, 0.12, 4),
  plate: new THREE.CylinderGeometry(0.12, 0.12, 0.04, 8),
  bait: new THREE.SphereGeometry(0.2, 10, 7).scale(1, 0.6, 1.3),
  bone: new THREE.CylinderGeometry(0.04, 0.04, 0.55, 6).rotateZ(Math.PI / 2),
};
let glowTex: THREE.CanvasTexture | null = null;
const glowMats: Partial<Record<'meat' | 'poison', THREE.SpriteMaterial>> = {};
function glow(kind: 'meat' | 'poison'): THREE.SpriteMaterial {
  if (!glowTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,0.8)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    glowTex = new THREE.CanvasTexture(c);
  }
  return (glowMats[kind] ??= new THREE.SpriteMaterial({
    map: glowTex,
    color: kind === 'poison' ? 0x7aff4a : 0xff6a4a,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
    opacity: 0.3,
    fog: false,
  }));
}

const OPEN = 0.7;
const SNAP = 0.06;

/** Traps and bait lying in the forest. Animals walking into a trap are hurt and held in place; bait draws animals in. */
export class Traps {
  private traps: Trap[] = [];
  private baits: Bait[] = [];
  onTrigger: (a: Animal, dmg: number) => void = () => {};
  /** Optional: dust when the jaws slam shut. */
  blood?: Blood;

  constructor(private scene: THREE.Scene, private world: World) {}

  placeTrap(at: THREE.Vector3, s: TrapSpec) {
    const mesh = new THREE.Group();
    const jaws: THREE.Object3D[] = [];
    if (s.type === 'snare') {
      const ring = new THREE.Mesh(geo.ring, rope);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.06;
      mesh.add(ring);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        const stake = new THREE.Mesh(geo.stake, rope);
        stake.position.set(Math.cos(a) * 0.62, 0.18, Math.sin(a) * 0.62);
        mesh.add(stake);
      }
    } else {
      for (const sgn of [-1, 1]) {
        const jaw = new THREE.Group();
        const half = new THREE.Mesh(geo.jawHalf, steel);
        half.rotation.x = Math.PI / 2;
        jaw.add(half);
        for (let k = 0; k < 6; k++) {
          const tooth = new THREE.Mesh(geo.tooth, steel);
          const a = (k / 5) * Math.PI;
          tooth.position.set(Math.cos(a) * 0.42, 0.07, Math.sin(a) * 0.42);
          jaw.add(tooth);
        }
        jaw.rotation.y = sgn > 0 ? 0 : Math.PI;
        jaw.rotation.z = OPEN;
        mesh.add(jaw);
        jaws.push(jaw);
      }
      const plate = new THREE.Mesh(geo.plate, steel);
      plate.position.y = 0.03;
      mesh.add(plate);
    }
    mesh.position.set(at.x, this.world.height(at.x, at.z) + 0.02, at.z);
    mesh.traverse((o) => (o.castShadow = true));
    this.scene.add(mesh);
    this.traps.push({ weaponId: s.weaponId, type: s.type, pos: mesh.position.clone(), mesh, jaws, radius: s.radius, damage: s.damage, root: s.root, sprung: false, snapT: -1 });
  }

  placeBait(at: THREE.Vector3, s: BaitSpec) {
    const mesh = new THREE.Group();
    const m = new THREE.Mesh(geo.bait, s.poison ? poisonMat : meatMat);
    m.position.y = 0.12;
    m.castShadow = true;
    const bone = new THREE.Mesh(geo.bone, boneMat);
    bone.position.y = 0.14;
    mesh.add(m, bone);
    const gl = new THREE.Sprite(glow(s.poison ? 'poison' : 'meat'));
    gl.scale.setScalar(1.2);
    gl.position.y = 0.45;
    mesh.add(gl);
    mesh.position.set(at.x, this.world.height(at.x, at.z), at.z);
    this.scene.add(mesh);
    this.baits.push({ weaponId: s.weaponId, pos: mesh.position.clone(), mesh, life: s.life, lure: s.lure, poison: s.poison });
  }

  update(dt: number, animals: Animal[]) {
    for (const t of this.traps) {
      if (t.snapT >= 0) this.animateSnap(t, dt);
      if (t.sprung) continue;
      for (const a of animals) {
        if (a.dead || a.alt > 0.3) continue;
        if (Math.hypot(a.pos.x - t.pos.x, a.pos.z - t.pos.z) < t.radius + a.def.radius * 0.3) {
          t.sprung = true;
          t.snapT = 0;
          a.root(t.root, t.pos);
          a.hurt(t.damage, this.world, t.pos, { kind: 'trap', point: new THREE.Vector3(t.pos.x, t.pos.y + 0.25, t.pos.z), dir: new THREE.Vector3(0, -1, 0) });
          this.onTrigger(a, t.damage);
          if (t.type === 'snare') t.mesh.scale.set(0.6, 1, 0.6);
          else this.blood?.dust(t.pos, 0.6);
          break;
        }
      }
    }
    for (let i = this.baits.length - 1; i >= 0; i--) {
      const b = this.baits[i];
      b.life -= dt;
      let eaten = false;
      for (const a of animals) {
        if (a.dead) continue;
        const d = Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z);
        if (d < b.lure) a.lure(b.pos, 8);
        if (b.poison && d < 1.6 && a.isLured) {
          a.poison(b.poison.dps, b.poison.time);
          eaten = true;
          break;
        }
      }
      if (eaten || b.life <= 0) {
        this.scene.remove(b.mesh);
        this.baits.splice(i, 1);
        // animals walking to it stop doing so
        for (const a of animals) a.clearLure(b.pos);
      }
    }
  }

  /** Bear trap jaws slam shut in 0.06 s with an overshoot and settle. */
  private animateSnap(t: Trap, dt: number) {
    t.snapT += dt;
    const s = t.snapT;
    let ang: number;
    if (s < SNAP) ang = OPEN * (1 - (s / SNAP) ** 2);
    else ang = -0.12 * Math.exp(-(s - SNAP) * 14) * Math.cos((s - SNAP) * 45);
    for (const j of t.jaws) j.rotation.z = ang;
    if (s > 0.6) {
      for (const j of t.jaws) j.rotation.z = 0;
      t.snapT = -1;
    }
  }

  /** Picks up traps within range that are not sprung (sprung bear traps can be reset). Returns counts per weapon. */
  collect(from: THREE.Vector3, range: number): Record<string, number> {
    const got: Record<string, number> = {};
    for (let i = this.traps.length - 1; i >= 0; i--) {
      const t = this.traps[i];
      if (t.pos.distanceTo(from) < range && (!t.sprung || t.type === 'bear')) {
        this.scene.remove(t.mesh);
        this.traps.splice(i, 1);
        got[t.weaponId] = (got[t.weaponId] ?? 0) + 1;
      }
    }
    return got;
  }

  nearTrap(from: THREE.Vector3, range: number): boolean {
    return this.traps.some((t) => t.pos.distanceTo(from) < range && (!t.sprung || t.type === 'bear'));
  }
}
