import * as THREE from 'three';
import type { World } from '../world/World';
import type { Animal } from '../animals/Animal';
import type { Look } from '../data/weapons';
import { ANIMAL_TUNING } from '../data/animals';

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
  /** The animal it is stuck in. */
  host: Animal | null;
  /** Wobble after impact. */
  wobT: number;
  base: THREE.Quaternion;
  wobAxis: THREE.Vector3;
}

const wood = new THREE.MeshStandardMaterial({ color: 0xc9b48a, roughness: 0.8 });
const steel = new THREE.MeshStandardMaterial({ color: 0x9aa0a4, metalness: 0.6, roughness: 0.4 });
const dark = new THREE.MeshStandardMaterial({ color: 0x5a3d26, roughness: 0.9 });
const red = new THREE.MeshStandardMaterial({ color: 0xb23a2e, roughness: 0.9, side: THREE.DoubleSide });
const grey = new THREE.MeshStandardMaterial({ color: 0x8a8a86, roughness: 1 });

const g = {
  shaft: new THREE.CylinderGeometry(0.012, 0.012, 0.8, 5).rotateX(Math.PI / 2),
  head: new THREE.ConeGeometry(0.035, 0.12, 5).rotateX(Math.PI / 2).translate(0, 0, 0.44),
  fletch: new THREE.BoxGeometry(0.1, 0.005, 0.14).translate(0, 0, -0.34),
  fletch2: new THREE.BoxGeometry(0.005, 0.1, 0.14).translate(0, 0, -0.34),
  knifeBlade: new THREE.BoxGeometry(0.03, 0.006, 0.26).translate(0, 0, 0.2),
  knifeHandle: new THREE.BoxGeometry(0.04, 0.03, 0.12).translate(0, 0, 0),
  axeHandle: new THREE.CylinderGeometry(0.025, 0.025, 0.7, 6).rotateX(Math.PI / 2),
  axeHead: new THREE.BoxGeometry(0.03, 0.2, 0.2).translate(0, 0.06, 0.3),
  spearShaft: new THREE.CylinderGeometry(0.02, 0.02, 1.9, 6).rotateX(Math.PI / 2),
  spearHead: new THREE.ConeGeometry(0.05, 0.28, 6).rotateX(Math.PI / 2).translate(0, 0, 1.03),
  stone: new THREE.SphereGeometry(0.045, 6, 5),
};

/** Distance from the mesh origin to the tip, and how deep it goes into flesh / wood or earth. */
const TIP: Record<Look, { len: number; flesh: number; hard: number }> = {
  arrow: { len: 0.5, flesh: 0.28, hard: 0.14 },
  knife: { len: 0.33, flesh: 0.14, hard: 0.08 },
  axe: { len: 0.4, flesh: 0.1, hard: 0.06 },
  spear: { len: 1.17, flesh: 0.38, hard: 0.25 },
  stone: { len: 0, flesh: 0, hard: 0 },
} as Record<Look, { len: number; flesh: number; hard: number }>;

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
    add(g.fletch2, red);
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
  /** True entry point on the body. */
  point: THREE.Vector3;
  /** Flight direction at impact (unit). */
  dir: THREE.Vector3;
  /** The hit got the unaware x2 bonus. */
  stealth: boolean;
  weaponId: string;
}

/** Where a projectile stuck into something that is not an animal (for impact sounds and dust). */
export interface ImpactEvent {
  point: THREE.Vector3;
  surface: 'ground' | 'wood';
  look: Look;
}

const _from = new THREE.Vector3();
const _c = new THREE.Vector3();
const _p = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _q = new THREE.Quaternion();
const ZF = new THREE.Vector3(0, 0, 1);

/**
 * Every thrown or shot thing: arrows, knives, axes, spears and sling stones.
 * Hits on animals stick in the body (parented to the animal's body pivot, max 6 per animal) and fall with the corpse;
 * they can be pulled from the carcass (half of the arrows break). Misses stick in the ground or in trunks and can be
 * picked up again. Sling stones vanish.
 */
export class Projectiles {
  private list: Proj[] = [];
  onHit: (e: HitEvent) => void = () => {};
  onImpact: (e: ImpactEvent) => void = () => {};

  constructor(private scene: THREE.Scene, private world: World) {}

  fire(origin: THREE.Vector3, dir: THREE.Vector3, spec: ProjSpec) {
    const { mesh, inner } = build(spec.look);
    mesh.position.copy(origin);
    mesh.lookAt(_c.copy(origin).add(dir));
    this.scene.add(mesh);
    this.list.push({
      mesh,
      inner,
      pos: origin.clone(),
      vel: dir.clone().multiplyScalar(spec.speed),
      stuck: false,
      age: 0,
      spec,
      host: null,
      wobT: -1,
      base: new THREE.Quaternion(),
      wobAxis: new THREE.Vector3(1, 0, 0),
    });
  }

  update(dt: number, animals: Animal[]) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const a = this.list[i];
      a.age += dt;
      if (a.stuck) {
        if (a.host && a.host.removable) {
          // the corpse is gone, and the arrows with it
          a.mesh.removeFromParent();
          this.list.splice(i, 1);
          continue;
        }
        if (a.wobT >= 0) this.wobble(a, dt);
        continue;
      }
      const steps = 3;
      const h = dt / steps;
      let removed = false;
      for (let s = 0; s < steps && !removed && !a.stuck; s++) {
        _from.copy(a.pos);
        a.vel.y -= a.spec.gravity * h;
        a.pos.addScaledVector(a.vel, h);
        for (const an of animals) {
          if (an.dead) continue;
          an.hitCenterInto(_c);
          if (segmentSphere(_from, a.pos, _c, an.def.radius)) {
            _dir.copy(a.vel).normalize();
            const point = an.entryPoint(_from, a.pos, new THREE.Vector3());
            const killed = an.hurt(a.spec.damage, this.world, _from, { dir: _dir, point, kind: 'projectile' });
            if (a.spec.poison && !killed) an.poison(a.spec.poison.dps, a.spec.poison.time);
            this.onHit({ animal: an, killed, point, dir: _dir.clone(), stealth: an.lastHitStealth, weaponId: a.spec.weaponId });
            if (a.spec.look === 'stone') {
              this.scene.remove(a.mesh);
              this.list.splice(i, 1);
              removed = true;
            } else this.stickInAnimal(a, an, point, _dir);
            break;
          }
        }
        if (removed || a.stuck) break;
        const ground = this.world.height(a.pos.x, a.pos.z);
        const intoGround = a.pos.y <= ground + 0.02;
        if (intoGround || this.world.hitsSolid(a.pos.x, a.pos.y, a.pos.z)) {
          _dir.copy(a.vel).normalize();
          if (intoGround) {
            // where the segment crossed the ground
            const g0 = this.world.height(_from.x, _from.z);
            const d0 = _from.y - g0;
            const d1 = a.pos.y - ground;
            const t = d0 - d1 > 1e-5 ? Math.min(1, Math.max(0, d0 / (d0 - d1))) : 1;
            _p.copy(_from).lerp(a.pos, t);
            _p.y = Math.max(_p.y, this.world.height(_p.x, _p.z));
          } else _p.copy(a.pos);
          this.stickHard(a, _p, _dir, intoGround ? 'ground' : 'wood');
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
        if (a.vel.lengthSq() > 0.01) a.mesh.lookAt(_c.copy(a.pos).add(a.vel));
        if (a.spec.spin) a.inner.rotation.x = a.age * 26;
        if (a.age > 6 || a.pos.y < -20) {
          this.scene.remove(a.mesh);
          this.list.splice(i, 1);
        }
      }
    }
    // keep the number of things lying around reasonable
    let n = 0;
    for (const a of this.list) if (a.stuck && !a.host) n++;
    if (n > 90) {
      const old = this.list.find((a) => a.stuck && !a.host);
      if (old) {
        old.mesh.removeFromParent();
        this.list.splice(this.list.indexOf(old), 1);
      }
    }
  }

  /** Orients the projectile along `dir` with its tip `depth` past `entry`, origin at the entry point (wobble pivot). */
  private placeAt(a: Proj, entry: THREE.Vector3, dir: THREE.Vector3, depth: number) {
    const tip = TIP[a.spec.look] ?? TIP.arrow;
    a.mesh.position.copy(entry);
    _q.setFromUnitVectors(ZF, dir);
    a.mesh.quaternion.copy(_q);
    a.inner.position.set(0, 0, -(tip.len - depth));
    // spinning blades keep their angle, snapped so the blade is the part that went in
    if (a.spec.spin) a.inner.rotation.x = a.spec.look === 'knife' ? 0 : Math.round(a.inner.rotation.x / (Math.PI / 2)) * (Math.PI / 2);
    a.base.copy(a.mesh.quaternion);
    a.wobAxis.set(Math.random() - 0.5, Math.random() - 0.5, 0).normalize();
    a.wobT = 0;
  }

  private stickInAnimal(a: Proj, an: Animal, point: THREE.Vector3, dir: THREE.Vector3) {
    const tip = TIP[a.spec.look] ?? TIP.arrow;
    a.stuck = true;
    a.host = an;
    a.vel.set(0, 0, 0);
    this.placeAt(a, point, dir, tip.flesh);
    // parent to the body pivot so it moves, flinches and falls with the animal
    const pose = an.pose;
    pose.updateWorldMatrix(true, false);
    a.mesh.updateMatrixWorld();
    pose.attach(a.mesh);
    a.base.copy(a.mesh.quaternion);
    // at most N per animal: the oldest falls out
    let count = 0;
    for (const o of this.list) if (o.host === an) count++;
    if (count > ANIMAL_TUNING.maxStuck) {
      const old = this.list.find((o) => o.host === an);
      if (old) {
        old.mesh.removeFromParent();
        this.list.splice(this.list.indexOf(old), 1);
      }
    }
  }

  private stickHard(a: Proj, at: THREE.Vector3, dir: THREE.Vector3, surface: 'ground' | 'wood') {
    const tip = TIP[a.spec.look] ?? TIP.arrow;
    a.stuck = true;
    a.vel.set(0, 0, 0);
    a.pos.copy(at);
    if (a.spec.look !== 'stone') this.placeAt(a, at, dir, tip.hard);
    else a.mesh.position.copy(at);
    this.onImpact({ point: at.clone(), surface, look: a.spec.look });
  }

  /** Impact wobble: angle = 0.15 e^{-7t} sin(38t) about a random axis across the shaft. */
  private wobble(a: Proj, dt: number) {
    a.wobT += dt;
    const t = a.wobT;
    if (t > 0.8) {
      a.mesh.quaternion.copy(a.base);
      a.wobT = -1;
      return;
    }
    const ang = 0.15 * Math.exp(-7 * t) * Math.sin(38 * t);
    _q.setFromAxisAngle(a.wobAxis, ang);
    a.mesh.quaternion.copy(a.base).multiply(_q);
  }

  /** World position of a stuck thing (inside a carcass it moves with the body). */
  private worldPos(a: Proj, out: THREE.Vector3): THREE.Vector3 {
    if (!a.host) return out.copy(a.mesh.position);
    a.mesh.updateWorldMatrix(true, false);
    return out.setFromMatrixPosition(a.mesh.matrixWorld);
  }

  private reachable(a: Proj, from: THREE.Vector3, range: number): boolean {
    if (!a.stuck) return false;
    if (a.host && !a.host.dead) return false;
    if (a.spec.look === 'stone') return false;
    this.worldPos(a, _p);
    // 2D distance plus a height allowance, so arrows high in a trunk can still be reached
    return Math.hypot(_p.x - from.x, _p.z - from.z) < range && _p.y - from.y < 2.5;
  }

  /** Picks up everything stuck within range. Returns how many of each weapon (arrows pulled from carcasses can break). */
  collect(from: THREE.Vector3, range: number): Record<string, number> {
    const got: Record<string, number> = {};
    for (let i = this.list.length - 1; i >= 0; i--) {
      const a = this.list[i];
      if (!this.reachable(a, from, range)) continue;
      a.mesh.removeFromParent();
      this.list.splice(i, 1);
      if (a.host && !a.spec.retrievable && Math.random() < ANIMAL_TUNING.arrowBreak) continue; // broke
      got[a.spec.weaponId] = (got[a.spec.weaponId] ?? 0) + 1;
    }
    return got;
  }

  nearestStuck(from: THREE.Vector3, range: number): boolean {
    for (const a of this.list) if (this.reachable(a, from, range)) return true;
    return false;
  }

  /** Removes everything (level teardown). Geometries and materials are shared and kept. */
  clear() {
    for (const a of this.list) a.mesh.removeFromParent();
    this.list.length = 0;
  }
}

function segmentSphere(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, r: number): boolean {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abz = b.z - a.z;
  const len2 = abx * abx + aby * aby + abz * abz;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((c.x - a.x) * abx + (c.y - a.y) * aby + (c.z - a.z) * abz) / len2)) : 0;
  const px = a.x + abx * t - c.x;
  const py = a.y + aby * t - c.y;
  const pz = a.z + abz * t - c.z;
  return px * px + py * py + pz * pz < r * r;
}

