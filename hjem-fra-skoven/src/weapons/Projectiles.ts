import * as THREE from 'three';
import type { World } from '../world/World';
import type { Animal } from '../animals/Animal';
import type { Look } from '../data/weapons';

export interface ProjSpec {
  weaponId: string;
  look: Look;
  speed: number;
  gravity: number;
  damage: number;
  retrievable: boolean;
  spin: boolean;
  poison?: { dps: number; time: number };
}

interface Proj {
  mesh: THREE.Group;
  inner: THREE.Group;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  stuck: boolean;
  age: number;
  spec: ProjSpec;
}

const wood = new THREE.MeshStandardMaterial({ color: 0xc9b48a, roughness: 0.8 });
const steel = new THREE.MeshStandardMaterial({ color: 0x9aa0a4, metalness: 0.6, roughness: 0.4 });
const dark = new THREE.MeshStandardMaterial({ color: 0x5a3d26, roughness: 0.9 });
const red = new THREE.MeshStandardMaterial({ color: 0xb23a2e, roughness: 0.9 });
const grey = new THREE.MeshStandardMaterial({ color: 0x8a8a86, roughness: 1 });

const g = {
  shaft: new THREE.CylinderGeometry(0.012, 0.012, 0.8, 5).rotateX(Math.PI / 2),
  head: new THREE.ConeGeometry(0.035, 0.12, 5).rotateX(Math.PI / 2).translate(0, 0, 0.44),
  fletch: new THREE.BoxGeometry(0.1, 0.005, 0.14).translate(0, 0, -0.34),
  knifeBlade: new THREE.BoxGeometry(0.03, 0.006, 0.26).translate(0, 0, 0.2),
  knifeHandle: new THREE.BoxGeometry(0.04, 0.03, 0.12).translate(0, 0, 0),
  axeHandle: new THREE.CylinderGeometry(0.025, 0.025, 0.7, 6).rotateX(Math.PI / 2),
  axeHead: new THREE.BoxGeometry(0.03, 0.2, 0.2).translate(0, 0.06, 0.3),
  spearShaft: new THREE.CylinderGeometry(0.02, 0.02, 1.9, 6).rotateX(Math.PI / 2),
  spearHead: new THREE.ConeGeometry(0.05, 0.28, 6).rotateX(Math.PI / 2).translate(0, 0, 1.03),
  stone: new THREE.SphereGeometry(0.045, 6, 5),
};

function build(look: Look): { mesh: THREE.Group; inner: THREE.Group } {
  const mesh = new THREE.Group();
  const inner = new THREE.Group();
  mesh.add(inner);
  const add = (geo: THREE.BufferGeometry, m: THREE.Material) => {
    const o = new THREE.Mesh(geo, m);
    o.castShadow = true;
    inner.add(o);
  };
  if (look === 'arrow') {
    add(g.shaft, wood);
    add(g.head, steel);
    add(g.fletch, red);
  } else if (look === 'knife') {
    add(g.knifeBlade, steel);
    add(g.knifeHandle, dark);
  } else if (look === 'axe') {
    add(g.axeHandle, dark);
    add(g.axeHead, steel);
  } else if (look === 'spear') {
    add(g.spearShaft, wood);
    add(g.spearHead, steel);
  } else add(g.stone, grey);
  return { mesh, inner };
}

export interface HitEvent {
  animal: Animal;
  killed: boolean;
  point: THREE.Vector3;
}

/**
 * Every thrown or shot thing: arrows, knives, axes, spears and sling stones.
 * Retrievable ones (knives, axes, spears) lie where they land, also after a hit.
 * Arrows that hit are lost, the ones that miss can be picked up.
 */
export class Projectiles {
  private list: Proj[] = [];
  onHit: (e: HitEvent) => void = () => {};

  constructor(private scene: THREE.Scene, private world: World) {}

  fire(origin: THREE.Vector3, dir: THREE.Vector3, spec: ProjSpec) {
    const { mesh, inner } = build(spec.look);
    mesh.position.copy(origin);
    mesh.lookAt(origin.clone().add(dir));
    this.scene.add(mesh);
    this.list.push({ mesh, inner, pos: origin.clone(), vel: dir.clone().multiplyScalar(spec.speed), stuck: false, age: 0, spec });
  }

  update(dt: number, animals: Animal[]) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const a = this.list[i];
      a.age += dt;
      if (a.stuck) continue;
      const steps = 3;
      const h = dt / steps;
      let removed = false;
      for (let s = 0; s < steps && !removed && !a.stuck; s++) {
        const from = a.pos.clone();
        a.vel.y -= a.spec.gravity * h;
        a.pos.addScaledVector(a.vel, h);
        for (const an of animals) {
          if (an.dead) continue;
          const c = an.hitCenter();
          if (segmentSphere(from, a.pos, c, an.def.radius)) {
            const killed = an.hurt(a.spec.damage, this.world, from);
            if (a.spec.poison && !killed) an.poison(a.spec.poison.dps, a.spec.poison.time);
            this.onHit({ animal: an, killed, point: c });
            if (a.spec.retrievable) {
              // drops at the animal's feet
              a.stuck = true;
              a.pos.set(an.pos.x + (Math.random() - 0.5), this.world.height(an.pos.x, an.pos.z) + 0.06, an.pos.z + (Math.random() - 0.5));
              a.mesh.position.copy(a.pos);
              a.mesh.rotation.set(-Math.PI / 2 + 0.2, Math.random() * 6, 0);
              a.inner.rotation.set(0, 0, 0);
            } else {
              this.scene.remove(a.mesh);
              this.list.splice(i, 1);
              removed = true;
            }
            break;
          }
        }
        if (removed || a.stuck) break;
        const ground = this.world.height(a.pos.x, a.pos.z);
        if (a.pos.y <= ground + 0.05 || this.world.hitsSolid(a.pos.x, a.pos.y, a.pos.z)) {
          a.stuck = true;
          a.pos.y = Math.max(a.pos.y, ground + 0.05);
          a.inner.rotation.set(0, 0, 0);
        }
      }
      if (removed) continue;
      if (a.stuck && a.spec.look === 'stone') {
        // stones are not worth picking up
        this.scene.remove(a.mesh);
        this.list.splice(i, 1);
        continue;
      }
      if (!a.stuck) {
        a.mesh.position.copy(a.pos);
        if (a.vel.lengthSq() > 0.01) a.mesh.lookAt(a.pos.clone().add(a.vel));
        if (a.spec.spin) a.inner.rotation.x = a.age * 26;
        if (a.age > 6 || a.pos.y < -20) {
          this.scene.remove(a.mesh);
          this.list.splice(i, 1);
        }
      } else {
        a.mesh.position.copy(a.pos);
      }
    }
    // keep the number of stuck things reasonable
    const stuck = this.list.filter((a) => a.stuck);
    if (stuck.length > 90) {
      const old = stuck[0];
      this.scene.remove(old.mesh);
      this.list.splice(this.list.indexOf(old), 1);
    }
  }

  /** Picks up everything stuck within range. Returns how many of each weapon. */
  collect(from: THREE.Vector3, range: number): Record<string, number> {
    const got: Record<string, number> = {};
    for (let i = this.list.length - 1; i >= 0; i--) {
      const a = this.list[i];
      if (a.stuck && a.pos.distanceTo(from) < range) {
        this.scene.remove(a.mesh);
        this.list.splice(i, 1);
        got[a.spec.weaponId] = (got[a.spec.weaponId] ?? 0) + 1;
      }
    }
    return got;
  }

  nearestStuck(from: THREE.Vector3, range: number): boolean {
    return this.list.some((a) => a.stuck && a.pos.distanceTo(from) < range);
  }
}

function segmentSphere(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, r: number): boolean {
  const ab = b.clone().sub(a);
  const len2 = ab.lengthSq();
  const t = len2 > 0 ? Math.max(0, Math.min(1, c.clone().sub(a).dot(ab) / len2)) : 0;
  const p = a.clone().addScaledVector(ab, t);
  return p.distanceToSquared(c) < r * r;
}
