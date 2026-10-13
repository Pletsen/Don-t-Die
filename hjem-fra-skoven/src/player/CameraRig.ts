import * as THREE from 'three';
import { CAMERA } from '../data/balance';
import type { World } from '../world/World';

/** Over-the-shoulder camera. `heading` uses the same convention as models: forward = (sin h, 0, cos h). */
export class CameraRig {
  heading = Math.PI; // looking towards -z, where the cave is
  pitch = 0.08; // radians, positive looks up
  private blend = 0; // 0 hip, 1 aiming
  readonly forward = new THREE.Vector3();
  readonly right = new THREE.Vector3();
  private shake = 0;

  constructor(readonly camera: THREE.PerspectiveCamera) {}

  look(dx: number, dy: number) {
    this.heading -= dx * CAMERA.sensitivity;
    this.pitch = Math.max(-0.55, Math.min(0.85, this.pitch - dy * CAMERA.sensitivity));
  }

  kick(amount: number) {
    this.shake = Math.max(this.shake, amount);
  }

  /** `aim` is 0 (hip) .. 1 (fully aimed). */
  update(dt: number, target: THREE.Vector3, aim: number, world: World) {
    this.blend += (aim - this.blend) * Math.min(1, dt * 10);
    const k = this.blend;
    const dist = lerp(CAMERA.hip.distance, CAMERA.aim.distance, k);
    const shoulder = lerp(CAMERA.hip.shoulder, CAMERA.aim.shoulder, k);
    const height = lerp(CAMERA.hip.height, CAMERA.aim.height, k);
    const fov = lerp(CAMERA.hip.fov, CAMERA.aim.fov, k);

    const cp = Math.cos(this.pitch);
    this.forward.set(Math.sin(this.heading) * cp, Math.sin(this.pitch), Math.cos(this.heading) * cp);
    this.right.set(-Math.cos(this.heading), 0, Math.sin(this.heading));

    const pivot = new THREE.Vector3(target.x, target.y + height, target.z);
    const pos = pivot.clone().addScaledVector(this.forward, -dist).addScaledVector(this.right, shoulder);
    const ground = world.height(pos.x, pos.z) + 0.35;
    if (pos.y < ground) pos.y = ground;
    if (this.shake > 0.001) {
      pos.x += (Math.random() - 0.5) * this.shake;
      pos.y += (Math.random() - 0.5) * this.shake;
      this.shake *= Math.pow(0.002, dt);
    }
    this.camera.position.copy(pos);
    this.camera.lookAt(pos.clone().addScaledVector(this.forward, 40));
    if (Math.abs(this.camera.fov - fov) > 0.05) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
