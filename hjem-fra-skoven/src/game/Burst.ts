import * as THREE from 'three';

interface Puff {
  points: THREE.Points;
  vel: Float32Array;
  life: number;
}

/** Short puffs of particles for hits and deaths. No blood: dust and sparks only (see CLAUDE.md, open question). */
export class Bursts {
  private puffs: Puff[] = [];
  constructor(private scene: THREE.Scene) {}

  emit(at: THREE.Vector3, color: number, count = 14, speed = 3) {
    const pos = new Float32Array(count * 3);
    const vel = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = at.x;
      pos[i * 3 + 1] = at.y;
      pos[i * 3 + 2] = at.z;
      vel[i * 3] = (Math.random() - 0.5) * speed;
      vel[i * 3 + 1] = Math.random() * speed * 0.9;
      vel[i * 3 + 2] = (Math.random() - 0.5) * speed;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const points = new THREE.Points(g, new THREE.PointsMaterial({ color, size: 0.14, transparent: true, depthWrite: false }));
    points.frustumCulled = false;
    this.scene.add(points);
    this.puffs.push({ points, vel, life: 0.7 });
  }

  update(dt: number) {
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      p.life -= dt;
      const pos = p.points.geometry.attributes.position as THREE.BufferAttribute;
      for (let k = 0; k < pos.count; k++) {
        p.vel[k * 3 + 1] -= 7 * dt;
        pos.array[k * 3] += p.vel[k * 3] * dt;
        pos.array[k * 3 + 1] += p.vel[k * 3 + 1] * dt;
        pos.array[k * 3 + 2] += p.vel[k * 3 + 2] * dt;
      }
      pos.needsUpdate = true;
      (p.points.material as THREE.PointsMaterial).opacity = Math.max(0, p.life / 0.7);
      if (p.life <= 0) {
        this.scene.remove(p.points);
        p.points.geometry.dispose();
        (p.points.material as THREE.Material).dispose();
        this.puffs.splice(i, 1);
      }
    }
  }
}
