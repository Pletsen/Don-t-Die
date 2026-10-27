import * as THREE from 'three';
import { CAMERA } from '../data/balance';
import { settings } from '../game/settings';
import type { World } from '../world/World';

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Frame-rate independent exponential approach factor. */
const damp = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);
const smooth = (x: number) => {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};
const hash = (i: number) => {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return (s - Math.floor(s)) * 2 - 1;
};
/** 1D value noise in -1..1. */
const noise = (x: number) => {
  const i = Math.floor(x);
  const f = x - i;
  return lerp(hash(i), hash(i + 1), f * f * (3 - 2 * f));
};

const _pivot = new THREE.Vector3();
const _head = new THREE.Vector3();
const _want = new THREE.Vector3();
const _look = new THREE.Vector3();

/**
 * Over-the-shoulder camera. `heading` uses the same convention as models: forward = (sin h, 0, cos h).
 * Collides with trees and rocks (pulls in at once, eases back out), frames higher when looking up, follows the
 * hunter vertically on a spring, and shakes with a trauma model. Call `update` with REAL dt (not hit-stop dt).
 */
export class CameraRig {
  heading = Math.PI; // looking towards -z, where the cave is
  pitch = 0.08; // radians, positive looks up
  readonly forward = new THREE.Vector3();
  readonly right = new THREE.Vector3();
  /** Set by the player each frame. */
  sprint = false;
  /** Distance from the camera to the hunter's head (the player fades when it is small). */
  headDist = 10;
  private blend = 0; // 0 hip, 1 aiming
  private sprintK = 0;
  private punchAmp = 0;
  private punchT = 1;
  private colDist = -1;
  private pivotY = NaN;
  private pivotV = 0;
  private lastTarget = new THREE.Vector3(1e9, 0, 0);
  private trauma = 0;
  private kickOff = new THREE.Vector3();
  private kickVel = new THREE.Vector3();
  private t = 0;
  private deathT = -1;
  private deathHeading = 0;

  constructor(readonly camera: THREE.PerspectiveCamera) {}

  look(dx: number, dy: number) {
    const s = CAMERA.sensitivity * settings.sensitivity;
    this.heading -= dx * s;
    this.pitch = clamp(this.pitch - dy * s * (settings.invertY ? -1 : 1), CAMERA.pitchMin, CAMERA.pitchMax);
  }

  /**
   * Add camera trauma (0..1; shake strength is trauma²). `dirWorld` pushes the camera that way briefly, e.g. the
   * direction the hunter was hit towards. Typical: shot 0.05, melee hit 0.15, kill 0.2, player hurt 0.45, boss roar 0.6.
   */
  kick(trauma: number, dirWorld?: THREE.Vector3) {
    this.trauma = Math.min(1, this.trauma + trauma);
    if (dirWorld) this.kickVel.addScaledVector(dirWorld, trauma * CAMERA.shake.push * 10);
  }

  /** Brief field-of-view punch in degrees (roll, heavy hits). */
  punch(deg: number) {
    this.punchAmp = Math.max(deg, this.punchT < 1 ? this.punchAmp : 0);
    this.punchT = 0;
  }

  /** Vertical velocity impulse on the follow spring (landing dip: negative). */
  bump(v: number) {
    this.pivotV += v;
  }

  /** `aim` is 0 (hip) .. 1 (fully aimed). `dt` is real time. */
  update(dt: number, target: THREE.Vector3, aim: number, world: World) {
    this.t += dt;
    this.deathT = -1;
    const C = CAMERA;
    const teleported = this.lastTarget.distanceToSquared(target) > 25;
    this.lastTarget.copy(target);

    this.blend += (aim - this.blend) * damp(C.aimRate, dt);
    const k = this.blend;
    let dist = lerp(C.hip.distance, C.aim.distance, k);
    let shoulder = lerp(C.hip.shoulder, C.aim.shoulder, k);
    let height = lerp(C.hip.height, C.aim.height, k);
    const hipFov = settings.fov;
    let fov = lerp(hipFov, hipFov * (C.aim.fov / C.hip.fov), k);

    // looking up: pull in, raise and widen the shoulder offset so the body does not fill the frame
    const up = Math.max(0, this.pitch);
    dist *= 1 - C.pitchFraming.dist * clamp((this.pitch - 0.2) / 0.65, 0, 1);
    height += C.pitchFraming.height * up;
    shoulder += C.pitchFraming.shoulder * up;

    // speed: sprint widens the view and backs off a little; the roll punches the FOV
    this.sprintK += ((this.sprint ? 1 : 0) - this.sprintK) * damp(4, dt);
    dist += C.sprintDistance * this.sprintK;
    fov += C.sprintFov * this.sprintK;
    this.punchT = Math.min(1, this.punchT + dt / 0.25);
    fov += this.punchAmp * Math.sin(Math.PI * this.punchT) * (1 - this.punchT * 0.3);

    // vertical follow spring (soft in the air, firm on the ground)
    const groundH = world.height(target.x, target.z);
    const airborne = target.y - groundH > 0.05;
    const wantY = target.y + height;
    if (teleported || Number.isNaN(this.pivotY)) {
      this.pivotY = wantY;
      this.pivotV = 0;
      this.colDist = -1;
    }
    const w = airborne ? C.pivotSpring.air : C.pivotSpring.ground;
    const n = dt > 1 / 50 ? 3 : 1;
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      this.pivotV += (-w * w * (this.pivotY - wantY) - 2 * w * this.pivotV) * h;
      this.pivotY += this.pivotV * h;
    }
    this.pivotY = clamp(this.pivotY, wantY - 0.8, wantY + 0.8);

    const cp = Math.cos(this.pitch);
    this.forward.set(Math.sin(this.heading) * cp, Math.sin(this.pitch), Math.cos(this.heading) * cp);
    this.right.set(-Math.cos(this.heading), 0, Math.sin(this.heading));

    const pivot = _pivot.set(target.x, this.pivotY, target.z);
    const want = _want.copy(pivot).addScaledVector(this.forward, -dist).addScaledVector(this.right, shoulder);
    const len = pivot.distanceTo(want);

    // collision: pull in at once, ease back out
    const hit = world.raycastColliders(pivot, want, C.collisionPad);
    const allowed = hit >= 1 ? len : Math.max(C.minDistance, hit * len - 0.15);
    if (this.colDist < 0 || allowed < this.colDist) this.colDist = allowed;
    else this.colDist += (allowed - this.colDist) * damp(C.easeOut, dt);
    const pos = this.camera.position;
    pos.copy(pivot).lerp(want, len > 1e-4 ? Math.min(1, this.colDist / len) : 1);
    const ground = world.height(pos.x, pos.z) + 0.35;
    if (pos.y < ground) pos.y = ground;

    // directional kick spring
    const kw = 12;
    this.kickVel.addScaledVector(this.kickOff, -kw * kw * dt).multiplyScalar(Math.exp(-2 * 0.6 * kw * dt));
    this.kickOff.addScaledVector(this.kickVel, dt);

    this.headDist = pos.distanceTo(_head.set(target.x, target.y + 1.65, target.z));
    this.applyShake(dt, _look.copy(pos).addScaledVector(this.forward, 40));
    this.setFov(fov);
  }

  /**
   * Death camera: cranes up over the body and orbits slowly. Call instead of `update` while the hunter is dead.
   */
  deathCam(dt: number, target: THREE.Vector3, world?: World) {
    const D = CAMERA.death;
    if (this.deathT < 0) {
      this.deathT = 0;
      this.deathHeading = this.heading;
    }
    this.deathT += dt;
    this.t += dt;
    const a = smooth(this.deathT / 2.2);
    const hd = this.deathHeading + D.orbit * this.deathT * a;
    const dist = lerp(CAMERA.hip.distance, D.distance, a);
    const hgt = lerp(CAMERA.hip.height + 0.4, D.height, a);
    const want = _want.set(target.x - Math.sin(hd) * dist, target.y + hgt, target.z - Math.cos(hd) * dist);
    if (world) {
      const pivot = _pivot.set(target.x, target.y + 1.2, target.z);
      const hit = world.raycastColliders(pivot, want, CAMERA.collisionPad);
      if (hit < 1) want.lerpVectors(pivot, want, Math.max(0.25, hit - 0.05));
      want.y = Math.max(want.y, world.height(want.x, want.z) + 0.5);
    }
    const pos = this.camera.position;
    pos.lerp(want, damp(3, dt));
    this.kickVel.multiplyScalar(Math.exp(-8 * dt));
    this.kickOff.multiplyScalar(Math.exp(-8 * dt));
    this.headDist = 10;
    this.applyShake(dt, _look.set(target.x, target.y + 0.35, target.z));
    this.setFov(settings.fov);
  }

  private applyShake(dt: number, lookAt: THREE.Vector3) {
    const S = CAMERA.shake;
    this.trauma = Math.max(0, this.trauma - S.decay * dt);
    const s = this.trauma * this.trauma;
    const cam = this.camera;
    const tt = this.t * S.freq;
    cam.position.add(this.kickOff);
    if (s > 1e-5) {
      cam.position.x += S.pos * s * noise(tt + 13.1);
      cam.position.y += S.pos * s * noise(tt + 41.7);
    }
    cam.lookAt(lookAt);
    if (s > 1e-5) {
      cam.rotateY(S.yaw * s * noise(tt));
      cam.rotateX(S.pitch * s * noise(tt + 31.3));
      cam.rotateZ(S.roll * s * noise(tt + 67.9));
    }
  }

  private setFov(fov: number) {
    if (Math.abs(this.camera.fov - fov) > 0.02) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }
}
