import * as THREE from 'three';
import type { World } from '../world/World';
import { antlerPairGeometry, boneGeometry, flintGeometry, haunchGeometry } from '../world/props';
import { glintTexture, grainTexture, meatTexture } from '../world/textures';

export type DropKind = 'meat' | 'shards' | 'trophies';

export interface Drop {
  kind: DropKind;
  amount: number;
  mesh: THREE.Object3D;
  pos: THREE.Vector3;
  phase: number;
  glint: THREE.Sprite;
  ring: THREE.Mesh;
}

/**
 * Loot is real stuff lying in the grass (owner decision): skærv are knapped flint flakes and a bone piece on a
 * scrap of hide, meat is a haunch, trophies are an antler pair. No glowing pickups; instead a faint pulsing ring
 * on the ground and a small glint that twinkles every few seconds, stronger when the hunter is close.
 *
 * Geometries and materials are built once per session and shared by every drop.
 */
let shared: ReturnType<typeof buildShared> | null = null;

function buildShared() {
  const haunch = haunchGeometry();
  const ringTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const gr = g.createRadialGradient(32, 32, 14, 32, 32, 31);
    gr.addColorStop(0, 'rgba(255,255,255,0)');
    gr.addColorStop(0.55, 'rgba(255,255,255,0.9)');
    gr.addColorStop(0.75, 'rgba(255,255,255,0.35)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  return {
    geos: {
      flint: [0, 1, 2, 3].map((i) => flintGeometry(i + 1)),
      bone: boneGeometry(),
      meat: haunch.meat,
      meatBone: haunch.bone,
      antlers: antlerPairGeometry(0.75, 3),
      hide: new THREE.CircleGeometry(0.24, 7).rotateX(-Math.PI / 2).scale(1.2, 1, 0.9),
      ring: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    },
    mats: {
      flint: [0x3d3833, 0x5a5047, 0x6b5f52, 0x4a4540].map(
        (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.28, metalness: 0, flatShading: true, emissive: 0x6b5f52, emissiveIntensity: 0 }),
      ),
      bone: new THREE.MeshStandardMaterial({ color: 0xd9cfb8, roughness: 0.7, emissive: 0xd9cfb8, emissiveIntensity: 0 }),
      meat: new THREE.MeshStandardMaterial({ color: 0xffffff, map: meatTexture(), roughness: 0.45 }),
      hide: new THREE.MeshStandardMaterial({ color: 0x7a5a3c, roughness: 1, map: grainTexture(77, 0.45), side: THREE.DoubleSide }),
      ring: new THREE.MeshBasicMaterial({
        color: 0xf1dfae,
        map: ringTex,
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4,
      }),
      glint: new THREE.SpriteMaterial({
        map: glintTexture(),
        color: 0xfff1d0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        fog: false,
      }),
    },
  };
}

export const DROP_LABEL: Record<DropKind, string> = { meat: 'kød', shards: 'skærv', trophies: 'trofæ' };

/** Loot lying on the ground. Picked up with E. */
export class Drops {
  list: Drop[] = [];
  private S: ReturnType<typeof buildShared>;

  constructor(private scene: THREE.Scene, private world: World) {
    this.S = shared ??= buildShared();
    // at night loot catches a little light so it can be found by lantern
    const n = world.night;
    this.S.mats.flint.forEach((m) => (m.emissiveIntensity = 0.12 * n));
    this.S.mats.bone.emissiveIntensity = 0.1 * n;
  }

  spawn(kind: DropKind, amount: number, at: THREE.Vector3) {
    if (amount <= 0) return;
    const { geos, mats } = this.S;
    const g = new THREE.Group();
    const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, ry = 0, rx = 0, rz = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.rotation.set(rx, ry, rz);
      m.castShadow = true;
      g.add(m);
      return m;
    };
    if (kind === 'meat') {
      const n = Math.min(2, amount >= 3 ? 2 : 1);
      for (let i = 0; i < n; i++) {
        const ox = i * 0.12;
        const oz = i * 0.2;
        const ry = i * 2.2;
        mesh(geos.meat, mats.meat, ox, 0.1 + i * 0.03, oz, ry, 0, i * 0.2);
        mesh(geos.meatBone, mats.bone, ox, 0.1 + i * 0.03, oz, ry, 0, i * 0.2);
      }
    } else if (kind === 'shards') {
      mesh(geos.hide, mats.hide, 0, 0.02, 0);
      const n = Math.min(4, 1 + Math.ceil(amount / 2));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + 0.4;
        mesh(geos.flint[i % 4], mats.flint[i % 4], Math.cos(a) * 0.12, 0.045, Math.sin(a) * 0.1, a * 1.7, 0.1 * (i % 2), 0.15);
      }
      mesh(geos.bone, mats.bone, 0.02, 0.05, 0.02, 0.6);
    } else {
      // antler pair with its skull plate, lying tipped over in the grass
      mesh(geos.antlers, mats.bone, 0, 0.12, 0, 0.3, -1.1, 0.15);
    }
    const a = Math.random() * Math.PI * 2;
    const r = 0.5 + Math.random() * 0.9;
    const x = at.x + Math.sin(a) * r;
    const z = at.z + Math.cos(a) * r;
    const y = this.world.height(x, z);
    g.position.set(x, y, z);
    // lie along the slope
    const e = 0.4;
    const sx = (this.world.height(x + e, z) - this.world.height(x - e, z)) / (2 * e);
    const sz = (this.world.height(x, z + e) - this.world.height(x, z - e)) / (2 * e);
    g.rotation.set(Math.atan(sz), Math.random() * Math.PI * 2, -Math.atan(sx), 'YXZ');
    const ring = new THREE.Mesh(geos.ring, mats.ring);
    ring.scale.setScalar(kind === 'trophies' ? 1.4 : 1.0);
    ring.position.y = 0.03;
    ring.renderOrder = 1;
    g.add(ring);
    const glint = new THREE.Sprite(mats.glint);
    glint.position.set(0, kind === 'trophies' ? 0.35 : 0.16, 0);
    glint.scale.setScalar(0.001);
    g.add(glint);
    this.scene.add(g);
    this.list.push({ kind, amount, mesh: g, pos: g.position.clone().setY(y + 0.35), phase: Math.random() * 6, glint, ring });
  }

  /** `focus` (the hunter) makes nearby loot twinkle more often and its ring a little stronger. */
  update(time: number, focus?: THREE.Vector3) {
    this.S.mats.ring.opacity = 0.18 + 0.14 * (0.5 + 0.5 * Math.sin(time * 2.4));
    for (const d of this.list) {
      const dist = focus ? Math.hypot(d.pos.x - focus.x, d.pos.z - focus.z) : 20;
      const near = Math.max(0, 1 - dist / 9);
      // a short twinkle every ~2.5 s (every ~1.2 s when close)
      const period = 2.5 - 1.3 * near;
      const t = ((time + d.phase) % period) / period;
      const tw = t < 0.14 ? Math.sin((t / 0.14) * Math.PI) : 0;
      // keep the glint readable at distance: grow it a little with distance
      const size = (0.16 + Math.min(0.22, dist * 0.012)) * tw;
      d.glint.scale.setScalar(Math.max(0.001, size));
      d.glint.material.rotation = time * 0.6;
      d.ring.scale.setScalar((d.kind === 'trophies' ? 1.4 : 1.0) * (1 + near * 0.15));
    }
  }

  near(p: THREE.Vector3, range: number): Drop[] {
    return this.list.filter((d) => Math.hypot(d.pos.x - p.x, d.pos.z - p.z) < range);
  }

  take(d: Drop) {
    this.scene.remove(d.mesh);
    this.list.splice(this.list.indexOf(d), 1);
  }

  /** Removes all loot from the scene. Shared geometry/materials stay alive for the next level. */
  dispose() {
    for (const d of this.list) this.scene.remove(d.mesh);
    this.list = [];
  }
}
