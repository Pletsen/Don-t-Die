import * as THREE from 'three';
import type { Wind } from './Wind';
import { softDot } from './textures';

/** Floating leaves and dust that travel with the wind, so the player can read it in the world. */
export class Drift {
  readonly points: THREE.Points;
  private pos: Float32Array;
  private readonly n = 140;
  private readonly box = 46;

  constructor(color: number) {
    this.pos = new Float32Array(this.n * 3);
    for (let i = 0; i < this.n; i++) {
      this.pos[i * 3] = (Math.random() - 0.5) * this.box;
      this.pos[i * 3 + 1] = Math.random() * 6 + 0.3;
      this.pos[i * 3 + 2] = (Math.random() - 0.5) * this.box;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.points = new THREE.Points(
      g,
      new THREE.PointsMaterial({ color, size: 0.08, map: softDot(0.3), alphaTest: 0.02, transparent: true, opacity: 0.75, depthWrite: false }),
    );
    this.points.frustumCulled = false;
  }

  dispose() {
    this.points.removeFromParent();
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }

  update(dt: number, wind: Wind, center: THREE.Vector3, time: number) {
    const sp = 1.2 + wind.strength * 3.2;
    const half = this.box / 2;
    for (let i = 0; i < this.n; i++) {
      const k = i * 3;
      this.pos[k] += wind.dx * sp * dt + Math.sin(time * 1.3 + i) * 0.3 * dt;
      this.pos[k + 1] += Math.sin(time * 0.9 + i * 1.7) * 0.4 * dt - 0.08 * dt;
      this.pos[k + 2] += wind.dz * sp * dt + Math.cos(time * 1.1 + i) * 0.3 * dt;
      // wrap around the player
      for (const a of [0, 2]) {
        const c = a === 0 ? center.x : center.z;
        if (this.pos[k + a] - c > half) this.pos[k + a] -= this.box;
        else if (this.pos[k + a] - c < -half) this.pos[k + a] += this.box;
      }
      if (this.pos[k + 1] < center.y + 0.2) this.pos[k + 1] += 6;
      if (this.pos[k + 1] > center.y + 7) this.pos[k + 1] -= 6.5;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }
}

/** Fireflies for the dusk and night levels: small additive lights that wander and pulse. */
export class Fireflies {
  readonly points: THREE.Points;
  private pos: Float32Array;
  private phase: Float32Array;
  private readonly n = 90;
  private readonly box = 40;

  constructor() {
    this.pos = new Float32Array(this.n * 3);
    this.phase = new Float32Array(this.n);
    for (let i = 0; i < this.n; i++) {
      this.pos[i * 3] = (Math.random() - 0.5) * this.box;
      this.pos[i * 3 + 1] = Math.random() * 3 + 0.4;
      this.pos[i * 3 + 2] = (Math.random() - 0.5) * this.box;
      this.phase[i] = Math.random() * 10;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.points = new THREE.Points(
      geo,
      // fog off: additive sprites with fog add the fog colour over the whole quad. Small, because bloom grows them.
      new THREE.PointsMaterial({ map: softDot(0.15), size: 0.16, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xd8ff8a, fog: false }),
    );
    this.points.frustumCulled = false;
  }

  dispose() {
    this.points.removeFromParent();
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }

  update(dt: number, center: THREE.Vector3, time: number, groundY: number) {
    const half = this.box / 2;
    for (let i = 0; i < this.n; i++) {
      const k = i * 3;
      const p = this.phase[i];
      this.pos[k] += Math.sin(time * 0.7 + p) * 0.6 * dt;
      this.pos[k + 1] += Math.cos(time * 0.9 + p * 1.7) * 0.35 * dt;
      this.pos[k + 2] += Math.sin(time * 0.5 + p * 2.3) * 0.6 * dt;
      for (const a of [0, 2]) {
        const c = a === 0 ? center.x : center.z;
        if (this.pos[k + a] - c > half) this.pos[k + a] -= this.box;
        else if (this.pos[k + a] - c < -half) this.pos[k + a] += this.box;
      }
      this.pos[k + 1] = Math.min(groundY + 3.5, Math.max(groundY + 0.4, this.pos[k + 1]));
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    (this.points.material as THREE.PointsMaterial).opacity = 0.65 + 0.35 * Math.sin(time * 3);
  }
}
