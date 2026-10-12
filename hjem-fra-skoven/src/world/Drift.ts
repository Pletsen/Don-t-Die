import * as THREE from 'three';
import type { Wind } from './Wind';

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
      new THREE.PointsMaterial({ color, size: 0.09, transparent: true, opacity: 0.75, depthWrite: false }),
    );
    this.points.frustumCulled = false;
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
