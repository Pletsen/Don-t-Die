import * as THREE from 'three';
import type { World } from '../world/World';

export type DropKind = 'meat' | 'shards' | 'trophies';

export interface Drop {
  kind: DropKind;
  amount: number;
  mesh: THREE.Object3D;
  pos: THREE.Vector3;
  phase: number;
}

const geos = {
  meat: new THREE.BoxGeometry(0.34, 0.2, 0.22),
  bone: new THREE.CylinderGeometry(0.04, 0.04, 0.5, 6).rotateZ(Math.PI / 2),
  shard: new THREE.OctahedronGeometry(0.16, 0),
  trophy: new THREE.ConeGeometry(0.2, 0.5, 6),
};
const mats = {
  meat: new THREE.MeshStandardMaterial({ color: 0xa32a2a, roughness: 0.7, emissive: 0x3a0808, emissiveIntensity: 0.6 }),
  bone: new THREE.MeshStandardMaterial({ color: 0xe8e0cc, roughness: 0.8 }),
  shard: new THREE.MeshStandardMaterial({ color: 0x9fd6c8, roughness: 0.3, emissive: 0x3aa890, emissiveIntensity: 0.8 }),
  trophy: new THREE.MeshStandardMaterial({ color: 0xf0c240, roughness: 0.3, metalness: 0.7, emissive: 0xc08a10, emissiveIntensity: 0.9 }),
};

const glowTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,0.9)');
  gr.addColorStop(0.35, 'rgba(255,255,255,0.25)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
/** Soft additive glow instead of a real light: adding lights at run time makes every material recompile (a visible stutter). */
const glowMats = {
  meat: new THREE.SpriteMaterial({ map: glowTex, color: 0xff5a4a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.8 }),
  shards: new THREE.SpriteMaterial({ map: glowTex, color: 0x5affd0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.8 }),
  trophies: new THREE.SpriteMaterial({ map: glowTex, color: 0xffd060, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.9 }),
};

export const DROP_LABEL: Record<DropKind, string> = { meat: 'kød', shards: 'skærv', trophies: 'trofæ' };

/** Loot lying on the ground. Picked up with E. */
export class Drops {
  list: Drop[] = [];
  constructor(private scene: THREE.Scene, private world: World) {}

  spawn(kind: DropKind, amount: number, at: THREE.Vector3) {
    if (amount <= 0) return;
    const g = new THREE.Group();
    if (kind === 'meat') {
      g.add(new THREE.Mesh(geos.meat, mats.meat), new THREE.Mesh(geos.bone, mats.bone));
    } else if (kind === 'shards') {
      for (let i = 0; i < 3; i++) {
        const m = new THREE.Mesh(geos.shard, mats.shard);
        m.position.set((i - 1) * 0.18, 0.05 * i, (i % 2) * 0.1);
        m.rotation.set(i, i * 2, 0);
        g.add(m);
      }
    } else {
      g.add(new THREE.Mesh(geos.trophy, mats.trophy));
    }
    const a = Math.random() * Math.PI * 2;
    const r = 0.5 + Math.random() * 0.9;
    const x = at.x + Math.sin(a) * r;
    const z = at.z + Math.cos(a) * r;
    g.position.set(x, this.world.height(x, z) + 0.35, z);
    g.traverse((o) => (o.castShadow = true));
    const glow = new THREE.Sprite(glowMats[kind]);
    glow.scale.setScalar(1.6);
    g.add(glow);
    this.scene.add(g);
    this.list.push({ kind, amount, mesh: g, pos: g.position.clone(), phase: Math.random() * 6 });
  }

  update(time: number) {
    for (const d of this.list) {
      d.mesh.position.y = d.pos.y + Math.sin(time * 2 + d.phase) * 0.06;
      d.mesh.rotation.y = time * 0.8 + d.phase;
    }
  }

  near(p: THREE.Vector3, range: number): Drop[] {
    return this.list.filter((d) => Math.hypot(d.pos.x - p.x, d.pos.z - p.z) < range);
  }

  take(d: Drop) {
    this.scene.remove(d.mesh);
    this.list.splice(this.list.indexOf(d), 1);
  }
}
