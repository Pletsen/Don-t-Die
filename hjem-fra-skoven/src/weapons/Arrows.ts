import * as THREE from 'three';
import { BOW } from '../data/balance';
import type { World } from '../world/World';
import type { Animal } from '../animals/Animal';

interface Arrow {
  mesh: THREE.Object3D;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  stuck: boolean;
  age: number;
}

const shaftGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.8, 5).rotateX(Math.PI / 2);
const headGeo = new THREE.ConeGeometry(0.035, 0.12, 5).rotateX(Math.PI / 2).translate(0, 0, 0.44);
const fletchGeo = new THREE.BoxGeometry(0.1, 0.005, 0.14).translate(0, 0, -0.34);
const shaftMat = new THREE.MeshStandardMaterial({ color: 0xc9b48a, roughness: 0.8 });
const headMat = new THREE.MeshStandardMaterial({ color: 0x8d9296, metalness: 0.6, roughness: 0.4 });
const fletchMat = new THREE.MeshStandardMaterial({ color: 0xb23a2e, roughness: 0.9 });

function makeArrowMesh(): THREE.Object3D {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(shaftGeo, shaftMat), new THREE.Mesh(headGeo, headMat), new THREE.Mesh(fletchGeo, fletchMat));
  return g;
}

export interface HitEvent {
  animal: Animal;
  killed: boolean;
  point: THREE.Vector3;
}

/** Flying and stuck arrows. Arrows that hit an animal are lost, the ones that miss can be picked up. */
export class Arrows {
  private list: Arrow[] = [];
  onHit: (e: HitEvent) => void = () => {};

  constructor(private scene: THREE.Scene, private world: World) {}

  fire(origin: THREE.Vector3, dir: THREE.Vector3) {
    const mesh = makeArrowMesh();
    mesh.position.copy(origin);
    mesh.lookAt(origin.clone().add(dir));
    this.scene.add(mesh);
    this.list.push({ mesh, pos: origin.clone(), vel: dir.clone().multiplyScalar(BOW.speed), stuck: false, age: 0 });
  }

  update(dt: number, animals: Animal[], damage: number) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const a = this.list[i];
      a.age += dt;
      if (a.stuck) continue;
      // sub-steps keep fast arrows from skipping through thin things
      const steps = 3;
      const h = dt / steps;
      let removed = false;
      for (let s = 0; s < steps && !removed && !a.stuck; s++) {
        const from = a.pos.clone();
        a.vel.y -= BOW.gravity * h;
        a.pos.addScaledVector(a.vel, h);
        for (const an of animals) {
          if (an.dead) continue;
          const c = an.hitCenter();
          if (segmentSphere(from, a.pos, c, an.def.radius)) {
            const killed = an.hurt(damage, this.world, from);
            this.onHit({ animal: an, killed, point: c });
            this.scene.remove(a.mesh);
            this.list.splice(i, 1);
            removed = true;
            break;
          }
        }
        if (removed) break;
        const ground = this.world.height(a.pos.x, a.pos.z);
        if (a.pos.y <= ground + 0.05 || this.world.hitsSolid(a.pos.x, a.pos.y, a.pos.z)) {
          a.stuck = true;
          a.pos.y = Math.max(a.pos.y, ground + 0.05);
        }
      }
      if (removed) continue;
      a.mesh.position.copy(a.pos);
      if (!a.stuck && a.vel.lengthSq() > 0.01) a.mesh.lookAt(a.pos.clone().add(a.vel));
      if (a.stuck) {
        // lie down slightly, so it is easier to spot
        a.mesh.rotation.x = Math.min(0, a.mesh.rotation.x) - 0.1;
      }
      if (!a.stuck && (a.age > 6 || a.pos.y < -20)) {
        this.scene.remove(a.mesh);
        this.list.splice(i, 1);
      }
    }
    // keep the number of stuck arrows reasonable
    const stuck = this.list.filter((a) => a.stuck);
    if (stuck.length > 80) {
      const old = stuck[0];
      this.scene.remove(old.mesh);
      this.list.splice(this.list.indexOf(old), 1);
    }
  }

  /** Picks up all stuck arrows within range. Returns how many. */
  collect(from: THREE.Vector3, range: number, max: number): number {
    let n = 0;
    for (let i = this.list.length - 1; i >= 0 && n < max; i--) {
      const a = this.list[i];
      if (a.stuck && a.pos.distanceTo(from) < range) {
        this.scene.remove(a.mesh);
        this.list.splice(i, 1);
        n++;
      }
    }
    return n;
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
