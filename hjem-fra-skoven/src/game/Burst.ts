import * as THREE from 'three';

interface Puff {
  points: THREE.Points;
  pos: Float32Array;
  vel: Float32Array;
  life: number;
  active: boolean;
}

const COUNT = 28;
const POOL = 10;

/**
 * Short puffs of particles for hits and deaths. No blood: dust and sparks only (see CLAUDE.md, open question).
 * A fixed pool is built once, so a hit never allocates geometry or materials (that was part of the stutter on kills).
 */
export class Bursts {
  private pool: Puff[] = [];

  constructor(scene: THREE.Scene) {
    for (let i = 0; i < POOL; i++) {
      const pos = new Float32Array(COUNT * 3);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const points = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 0.14, transparent: true, depthWrite: false }));
      points.frustumCulled = false;
      points.visible = false;
      scene.add(points);
      this.pool.push({ points, pos, vel: new Float32Array(COUNT * 3), life: 0, active: false });
    }
  }

  emit(at: THREE.Vector3, color: number, count = 14, speed = 3) {
    const p = this.pool.find((x) => !x.active) ?? this.pool[0];
    const n = Math.min(COUNT, count);
    for (let i = 0; i < COUNT; i++) {
      const live = i < n;
      p.pos[i * 3] = at.x;
      p.pos[i * 3 + 1] = live ? at.y : -999;
      p.pos[i * 3 + 2] = at.z;
      p.vel[i * 3] = (Math.random() - 0.5) * speed;
      p.vel[i * 3 + 1] = Math.random() * speed * 0.9;
      p.vel[i * 3 + 2] = (Math.random() - 0.5) * speed;
    }
    (p.points.material as THREE.PointsMaterial).color.setHex(color);
    p.life = 0.7;
    p.active = true;
    p.points.visible = true;
  }

  update(dt: number) {
    for (const p of this.pool) {
      if (!p.active) continue;
      p.life -= dt;
      const attr = p.points.geometry.attributes.position as THREE.BufferAttribute;
      for (let k = 0; k < COUNT; k++) {
        if (p.pos[k * 3 + 1] < -900) continue;
        p.vel[k * 3 + 1] -= 7 * dt;
        p.pos[k * 3] += p.vel[k * 3] * dt;
        p.pos[k * 3 + 1] += p.vel[k * 3 + 1] * dt;
        p.pos[k * 3 + 2] += p.vel[k * 3 + 2] * dt;
      }
      attr.needsUpdate = true;
      (p.points.material as THREE.PointsMaterial).opacity = Math.max(0, p.life / 0.7);
      if (p.life <= 0) {
        p.active = false;
        p.points.visible = false;
      }
    }
  }
}
