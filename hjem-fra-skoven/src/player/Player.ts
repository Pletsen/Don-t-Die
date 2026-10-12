import * as THREE from 'three';
import { PLAYER, NOISE } from '../data/balance';
import type { Input } from '../game/Input';
import type { CameraRig } from './CameraRig';
import type { World } from '../world/World';
import type { Bank } from '../game/save';

export interface PlayerStats {
  maxHealth: number;
  maxStamina: number;
  scentMul: number;
}

export class Player {
  readonly group = new THREE.Group();
  readonly pos = new THREE.Vector3();
  heading = Math.PI;
  hp: number;
  stamina: number;
  /** Ammo left per weapon id (melee weapons have none). */
  ammo: Record<string, number> = {};
  weaponId = 'jagtbue';
  carried: Bank;
  startMeat: number;
  aiming = false;
  moving = false;
  sprinting = false;
  dead = false;
  killedBy = '';
  /** Metres at which animals can hear the hunter right now. */
  noise = 0;
  invulnerable = 0;
  hurtFlash = 0;
  shotCooldown = 0;
  private burst = 0;
  private exhausted = false;
  private regenDelay = 0;
  private rollT = 0;
  private rollDir = new THREE.Vector3();
  private walkPhase = 0;
  private legs: THREE.Object3D[] = [];
  private arms: THREE.Object3D[] = [];
  private body = new THREE.Group();
  onRoll: () => void = () => {};
  onHurt: (amount: number) => void = () => {};

  constructor(readonly stats: PlayerStats, meatPack: number) {
    this.hp = stats.maxHealth;
    this.stamina = stats.maxStamina;
    this.carried = { meat: meatPack, shards: 0, trophies: 0 };
    this.startMeat = meatPack;
    this.buildModel();
    this.group.add(this.body);
  }

  get rolling(): boolean {
    return this.rollT > 0;
  }
  get isInvulnerable(): boolean {
    return this.invulnerable > 0;
  }
  /** Where arrows leave the bow. */
  get chest(): THREE.Vector3 {
    return new THREE.Vector3(this.pos.x, this.pos.y + 1.35, this.pos.z);
  }

  private buildModel() {
    const mat = (c: number, r = 0.9) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
    const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      return mesh;
    };
    const cloak = mat(0x65783f);
    const leather = mat(0x5a3d26);
    const skin = mat(0xc89a78);
    const cloth = mat(0x6a5a42);

    this.body.add(box(0.5, 0.7, 0.3, cloak, 0, 1.2, 0));
    this.body.add(box(0.54, 0.12, 0.34, leather, 0, 0.9, 0)); // belt
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), skin);
    head.position.set(0, 1.74, 0);
    head.castShadow = true;
    this.body.add(head);
    const hat = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.3, 10), mat(0x6a4a2a));
    hat.position.set(0, 1.97, 0);
    hat.castShadow = true;
    this.body.add(hat);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.03, 12), mat(0x6a4a2a));
    brim.position.set(0, 1.84, 0);
    this.body.add(brim);
    // quiver on the back
    const quiver = box(0.14, 0.55, 0.14, leather, -0.12, 1.3, -0.24);
    quiver.rotation.z = 0.2;
    this.body.add(quiver);
    for (let i = 0; i < 3; i++) this.body.add(box(0.02, 0.2, 0.02, mat(0xd8c8a0), -0.17 + i * 0.04, 1.62, -0.24));

    for (const s of [-1, 1]) {
      const leg = new THREE.Group();
      leg.position.set(s * 0.14, 0.88, 0);
      leg.add(box(0.2, 0.88, 0.22, cloth, 0, -0.44, 0));
      this.body.add(leg);
      this.legs.push(leg);
      const arm = new THREE.Group();
      arm.position.set(s * 0.33, 1.5, 0);
      arm.add(box(0.14, 0.58, 0.14, cloak, 0, -0.27, 0));
      this.body.add(arm);
      this.arms.push(arm);
    }
    // bow in the left hand (+x is the left side seen from behind)
    const bow = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.025, 6, 20, Math.PI), mat(0x7a5632));
    bow.rotation.set(0, Math.PI / 2, Math.PI / 2);
    bow.position.set(0, -0.55, 0.12);
    bow.castShadow = true;
    this.arms[1].add(bow);
  }

  update(dt: number, input: Input, cam: CameraRig, world: World) {
    if (this.dead) return;
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);
    this.shotCooldown = Math.max(0, this.shotCooldown - dt);
    this.burst = Math.max(0, this.burst - dt * (NOISE.shot / NOISE.shotDecay));

    // input direction relative to the camera heading
    const iz = (input.held('KeyW') ? 1 : 0) - (input.held('KeyS') ? 1 : 0);
    const ix = (input.held('KeyD') ? 1 : 0) - (input.held('KeyA') ? 1 : 0);
    const dir = new THREE.Vector3();
    if (ix || iz) {
      dir.set(Math.sin(cam.heading), 0, Math.cos(cam.heading)).multiplyScalar(iz);
      dir.addScaledVector(new THREE.Vector3(-Math.cos(cam.heading), 0, Math.sin(cam.heading)), ix);
      dir.normalize();
    }
    this.moving = dir.lengthSq() > 0;
    this.aiming = input.right && !this.rolling;

    // roll
    if (input.was('Space') && !this.rolling && this.stamina >= PLAYER.rollCost) {
      this.stamina -= PLAYER.rollCost;
      this.regenDelay = PLAYER.staminaRegenDelay;
      this.rollT = PLAYER.rollTime;
      this.invulnerable = Math.max(this.invulnerable, PLAYER.rollInvulnerable);
      this.rollDir.copy(this.moving ? dir : new THREE.Vector3(Math.sin(cam.heading), 0, Math.cos(cam.heading)));
      this.heading = Math.atan2(this.rollDir.x, this.rollDir.z);
      this.onRoll();
    }

    // sprint
    const wantsSprint = input.held('ShiftLeft') || input.held('ShiftRight');
    if (this.stamina <= 0) this.exhausted = true;
    if (this.stamina > PLAYER.exhaustedUntil) this.exhausted = false;
    this.sprinting = wantsSprint && this.moving && !this.exhausted && !this.aiming && !this.rolling;

    let speed = 0;
    const move = new THREE.Vector3();
    if (this.rolling) {
      this.rollT -= dt;
      const k = Math.max(0, this.rollT / PLAYER.rollTime);
      speed = PLAYER.rollSpeed * (0.45 + 0.55 * k);
      move.copy(this.rollDir);
    } else if (this.moving) {
      speed = this.aiming ? PLAYER.aimSpeed : this.sprinting ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
      move.copy(dir);
    }
    if (this.sprinting) {
      this.stamina = Math.max(0, this.stamina - PLAYER.sprintDrain * dt);
      this.regenDelay = PLAYER.staminaRegenDelay;
    } else if (this.regenDelay > 0) {
      this.regenDelay -= dt;
    } else {
      this.stamina = Math.min(this.stats.maxStamina, this.stamina + PLAYER.staminaRegen * dt);
    }

    this.pos.addScaledVector(move, speed * dt);
    world.collide(this.pos, PLAYER.radius);
    this.pos.y = world.height(this.pos.x, this.pos.z);

    // facing: towards the aim when aiming or just after shooting, otherwise the way we walk
    if (!this.rolling) {
      let target = this.heading;
      if (this.aiming || this.shotCooldown > 0.25) target = cam.heading;
      else if (this.moving) target = Math.atan2(dir.x, dir.z);
      this.heading = lerpAngle(this.heading, target, Math.min(1, dt * (this.aiming ? 18 : 11)));
    }

    // what animals can hear
    const base = this.rolling ? NOISE.roll : this.sprinting ? NOISE.sprint : this.moving ? NOISE.walk * (this.aiming ? 0.5 : 1) : 0;
    this.noise = Math.max(base, this.burst);

    this.animate(dt, speed);
  }

  /** Call when an arrow leaves the bow. */
  fired(noise: number) {
    this.burst = Math.max(this.burst, noise);
  }

  private animate(dt: number, speed: number) {
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.heading;
    this.walkPhase += dt * speed * 1.9;
    const swing = this.moving && !this.rolling ? Math.sin(this.walkPhase) * 0.8 : 0;
    this.legs[0].rotation.x = swing;
    this.legs[1].rotation.x = -swing;
    if (this.aiming || this.shotCooldown > 0.2) {
      this.arms[1].rotation.x = -1.5;
      this.arms[0].rotation.x = -1.25;
    } else {
      this.arms[0].rotation.x = swing * 0.6;
      this.arms[1].rotation.x = -swing * 0.6;
    }
    if (this.rolling) {
      const k = 1 - this.rollT / PLAYER.rollTime;
      this.body.rotation.x = k * Math.PI * 2;
      this.body.position.y = Math.sin(k * Math.PI) * 0.35 - 0.2 * Math.sin(k * Math.PI);
      this.body.scale.setScalar(0.85);
    } else {
      this.body.rotation.x = this.sprinting ? 0.18 : 0;
      this.body.position.y = 0;
      this.body.scale.setScalar(1);
    }
  }

  damage(amount: number, by: string) {
    if (this.dead || this.isInvulnerable) return false;
    this.hp -= amount;
    this.invulnerable = 0.35;
    this.hurtFlash = 0.5;
    this.onHurt(amount);
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      this.killedBy = by;
      this.body.rotation.x = -Math.PI / 2;
      this.body.position.y = 0.25;
    }
    return true;
  }

  heal(amount: number) {
    this.hp = Math.min(this.stats.maxHealth, this.hp + amount);
  }
}

export function lerpAngle(a: number, b: number, t: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
