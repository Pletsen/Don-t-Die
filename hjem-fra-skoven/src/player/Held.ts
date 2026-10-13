import * as THREE from 'three';
import type { WeaponDef } from '../data/weapons';

/**
 * The hunter's arms and the weapon in his hands.
 * Arms are two-bone IK (upper arm + forearm), so the hands can be sent to wherever the weapon needs them:
 * drawing a bow, winding up a throw, whirling a sling, thrusting a spear, putting down a trap.
 * Everything here is in the body's local space: +z forward, +x left, +y up.
 */

export interface HeldState {
  drawing: boolean;
  drawP: number; // 0..1 how far the draw/wind-up is
  aiming: boolean;
  walk: number; // -1..1 leg swing, used to swing the free hand
  sprinting: boolean;
  rolling: boolean;
  cooldown: number; // seconds left of reload after a release
  ammo: number | null; // null = unlimited
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const smooth = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const M = {
  wood: new THREE.MeshStandardMaterial({ color: 0x7a5632, roughness: 0.85 }),
  lightWood: new THREE.MeshStandardMaterial({ color: 0xa88a52, roughness: 0.8 }),
  darkWood: new THREE.MeshStandardMaterial({ color: 0x3b2a1c, roughness: 0.9 }),
  steel: new THREE.MeshStandardMaterial({ color: 0xa9b0b5, metalness: 0.75, roughness: 0.32 }),
  iron: new THREE.MeshStandardMaterial({ color: 0x4a4e52, metalness: 0.7, roughness: 0.5 }),
  leather: new THREE.MeshStandardMaterial({ color: 0x5a3d26, roughness: 0.9 }),
  red: new THREE.MeshStandardMaterial({ color: 0xa8302a, roughness: 0.9 }),
  rope: new THREE.MeshStandardMaterial({ color: 0x9a7a45, roughness: 1 }),
  green: new THREE.MeshStandardMaterial({ color: 0x5f9a38, roughness: 0.7, emissive: 0x1c4a0c, emissiveIntensity: 0.6 }),
  meat: new THREE.MeshStandardMaterial({ color: 0xa32a2a, roughness: 0.7, emissive: 0x3a0808, emissiveIntensity: 0.5 }),
  bone: new THREE.MeshStandardMaterial({ color: 0xe8e0cc, roughness: 0.8 }),
  stone: new THREE.MeshStandardMaterial({ color: 0x8a8a86, roughness: 1 }),
  string: new THREE.LineBasicMaterial({ color: 0xe8dcc0 }),
  cord: new THREE.LineBasicMaterial({ color: 0xb09a68 }),
};

function mesh(geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z);
  o.castShadow = true;
  return o;
}

/** Cylinder along +z from z0 to z1. */
function rod(r: number, z0: number, z1: number, m: THREE.Material): THREE.Mesh {
  const g = new THREE.CylinderGeometry(r, r, z1 - z0, 7).rotateX(Math.PI / 2);
  return mesh(g, m, 0, 0, (z0 + z1) / 2);
}

interface Model {
  group: THREE.Group;
  /** Bows only. */
  bow?: { tipZ: number; half: number; string: THREE.Line; arrow: THREE.Group };
  /** Sling only. */
  sling?: { pouch: THREE.Mesh; cords: THREE.Line };
}

function buildBow(def: WeaponDef): Model {
  const group = new THREE.Group();
  const cfg: Record<string, { half: number; belly: number; tip: number; wood: THREE.Material; grip: THREE.Material; arrowTip: THREE.Material }> = {
    jagtbue: { half: 0.55, belly: 0.17, tip: 0.0, wood: M.wood, grip: M.leather, arrowTip: M.steel },
    langbue: { half: 0.8, belly: 0.2, tip: 0.0, wood: M.lightWood, grip: M.leather, arrowTip: M.steel },
    hurtigbue: { half: 0.38, belly: 0.1, tip: 0.1, wood: M.darkWood, grip: M.red, arrowTip: M.steel },
    giftbue: { half: 0.55, belly: 0.17, tip: 0.0, wood: new THREE.MeshStandardMaterial({ color: 0x4a6a30, roughness: 0.8 }), grip: M.leather, arrowTip: M.green },
  };
  const c = cfg[def.id] ?? cfg.jagtbue;
  const pts: THREE.Vector3[] = [];
  for (let i = -10; i <= 10; i++) {
    const t = i / 10;
    const bulge = c.belly * (1 - t * t);
    const recurve = c.tip * Math.pow(Math.abs(t), 6) * -1.6;
    pts.push(V(0, t * c.half, bulge + recurve));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  group.add(mesh(new THREE.TubeGeometry(curve, 28, 0.017, 6), c.wood));
  group.add(mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.14, 8), c.grip, 0, 0, c.belly));
  // tips
  const tipZ = pts[0].z;
  const stringGeo = new THREE.BufferGeometry().setFromPoints([V(0, c.half, tipZ), V(0, 0, tipZ), V(0, -c.half, tipZ)]);
  const string = new THREE.Line(stringGeo, M.string);
  group.add(string);
  // arrow, tail at the nock
  const arrow = new THREE.Group();
  arrow.add(rod(0.008, 0, 0.78, M.lightWood));
  const head = mesh(new THREE.ConeGeometry(0.02, 0.07, 5).rotateX(Math.PI / 2), c.arrowTip, 0, 0, 0.8);
  arrow.add(head);
  for (const a of [0, 2.1, 4.2]) {
    const f = mesh(new THREE.BoxGeometry(0.005, 0.045, 0.1), M.red, Math.cos(a) * 0.012, Math.sin(a) * 0.012, 0.05);
    f.rotation.z = a;
    arrow.add(f);
  }
  group.add(arrow);
  return { group, bow: { tipZ, half: c.half, string, arrow } };
}

function buildKnife(def: WeaponDef): Model {
  const g = new THREE.Group();
  const long = def.id === 'jagtkniv';
  const bl = long ? 0.3 : 0.2;
  g.add(rod(0.02, -0.13, 0.04, M.wood));
  if (long) g.add(mesh(new THREE.BoxGeometry(0.1, 0.02, 0.02), M.iron, 0, 0, 0.045));
  const blade = mesh(new THREE.BoxGeometry(0.012, long ? 0.045 : 0.035, bl), M.steel, 0, 0, 0.05 + bl / 2);
  g.add(blade);
  g.add(mesh(new THREE.ConeGeometry(long ? 0.0225 : 0.0175, 0.07, 4).rotateX(Math.PI / 2).scale(0.35, 1, 1), M.steel, 0, 0, 0.05 + bl + 0.03));
  return { group: g };
}

function buildAxe(def: WeaponDef): Model {
  const g = new THREE.Group();
  const big = def.id === 'dobbeltoekse';
  const len = big ? 0.85 : 0.55;
  g.add(rod(big ? 0.026 : 0.022, -0.25, len - 0.25, M.wood));
  const hz = len - 0.32;
  g.add(mesh(new THREE.BoxGeometry(0.05, 0.08, 0.1), M.iron, 0, 0, hz));
  const bladeGeo = new THREE.BoxGeometry(0.014, big ? 0.2 : 0.16, big ? 0.17 : 0.13);
  g.add(mesh(bladeGeo, M.steel, 0, big ? 0.13 : 0.1, hz));
  if (big) g.add(mesh(bladeGeo, M.steel, 0, -0.13, hz));
  g.add(mesh(new THREE.SphereGeometry(0.03, 6, 5), M.leather, 0, 0, -0.25));
  return { group: g };
}

function buildSpear(def: WeaponDef): Model {
  const g = new THREE.Group();
  const total = def.id === 'langspyd' ? 3.2 : def.id === 'spyd' ? 2.2 : 1.9;
  const tail = total * 0.34;
  g.add(rod(0.022, -tail, total - tail - 0.28, M.wood));
  const head = mesh(new THREE.ConeGeometry(0.05, 0.3, 4).rotateX(Math.PI / 2).scale(0.45, 1, 1), M.steel, 0, 0, total - tail - 0.14);
  g.add(head);
  g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.06, 6).rotateX(Math.PI / 2), M.iron, 0, 0, total - tail - 0.29));
  if (def.id === 'langspyd') {
    for (const a of [0, 2.1, 4.2]) g.add(mesh(new THREE.BoxGeometry(0.02, 0.1, 0.02), M.red, Math.cos(a) * 0.05, Math.sin(a) * 0.05, total - tail - 0.38));
  }
  g.add(mesh(new THREE.BoxGeometry(0.03, 0.03, 0.04), M.iron, 0, 0, -tail));
  return { group: g };
}

function buildSling(): Model {
  const g = new THREE.Group();
  const pouch = mesh(new THREE.SphereGeometry(0.045, 8, 6).scale(1, 0.6, 1), M.leather);
  const stone = mesh(new THREE.SphereGeometry(0.025, 6, 5), M.stone, 0, 0.02, 0);
  pouch.add(stone);
  g.add(pouch);
  const geo = new THREE.BufferGeometry().setFromPoints([V(0, 0, 0), V(0, 0, 0), V(0, 0, 0)]);
  const cords = new THREE.Line(geo, M.cord);
  g.add(cords);
  return { group: g, sling: { pouch, cords } };
}

function buildTrap(def: WeaponDef): Model {
  const g = new THREE.Group();
  if (def.id === 'snare') {
    const ring = mesh(new THREE.TorusGeometry(0.17, 0.014, 5, 14), M.rope);
    ring.rotation.x = Math.PI / 2;
    g.add(ring);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const s = mesh(new THREE.CylinderGeometry(0.01, 0.014, 0.18, 5), M.wood, Math.cos(a) * 0.19, 0.05, Math.sin(a) * 0.19);
      s.rotation.z = 0.3 * Math.cos(a);
      g.add(s);
    }
  } else if (def.id === 'baerefaelde') {
    for (const sgn of [-1, 1]) {
      const j = mesh(new THREE.TorusGeometry(0.15, 0.02, 5, 10, Math.PI), M.iron);
      j.rotation.set(Math.PI / 2, 0, sgn > 0 ? 0 : Math.PI);
      j.rotation.x = Math.PI / 2;
      g.add(j);
    }
    g.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 8), M.steel, 0, 0, 0));
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const t = mesh(new THREE.ConeGeometry(0.012, 0.04, 4), M.steel, Math.cos(a) * 0.15, 0.03, Math.sin(a) * 0.15);
      g.add(t);
    }
  } else {
    const poison = def.id === 'giftaad';
    g.add(mesh(new THREE.BoxGeometry(0.2, 0.1, 0.14), poison ? M.green : M.meat));
    g.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.28, 6).rotateZ(Math.PI / 2), M.bone, 0, 0.02, 0));
  }
  return { group: g };
}

export function buildHeldModel(def: WeaponDef): Model {
  if (def.family === 1) return buildBow(def);
  if (def.id === 'slynge') return buildSling();
  if (def.kind === 'trap' || def.kind === 'bait') return buildTrap(def);
  if (def.look === 'knife' || def.id === 'jagtkniv') return buildKnife(def);
  if (def.look === 'axe') return buildAxe(def);
  return buildSpear(def);
}

type Pose = { lh: THREE.Vector3; rh: THREE.Vector3; wp: THREE.Vector3; wr: THREE.Euler; show: boolean; rate: number; hand: 'l' | 'r' | 'both' };

export class HeldRig {
  readonly group = new THREE.Group();
  private upper: THREE.Object3D[] = [];
  private fore: THREE.Object3D[] = [];
  private hands: THREE.Object3D[] = [];
  private cur = { lh: V(0.36, 0.95, 0.05), rh: V(-0.36, 0.95, 0.05), wp: V(0.36, 0.95, 0.1), wr: new THREE.Euler() };
  private weapon?: Model;
  private def?: WeaponDef;
  private releaseT = 99;
  private swingT = 99;
  private swingDur = 0.3;
  private pull = 0;
  private spin = 0;
  private equipT = 0;
  private shoulder = [V(0.33, 1.5, 0), V(-0.33, 1.5, 0)];

  constructor(sleeve: THREE.Material, skin: THREE.Material, glove: THREE.Material) {
    for (let i = 0; i < 2; i++) {
      const up = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.055, 0.3, 7).translate(0, -0.15, 0), sleeve);
      const fo = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.045, 0.3, 7).translate(0, -0.15, 0), glove);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.058, 8, 6), skin);
      for (const o of [up, fo, hand]) {
        o.castShadow = true;
        this.group.add(o);
      }
      this.upper.push(up);
      this.fore.push(fo);
      this.hands.push(hand);
    }
  }

  setWeapon(def: WeaponDef) {
    if (this.def?.id === def.id) return;
    if (this.weapon) this.group.remove(this.weapon.group);
    this.def = def;
    this.weapon = buildHeldModel(def);
    this.group.add(this.weapon.group);
    this.equipT = 0.35;
    this.releaseT = 99;
    this.swingT = 99;
  }

  /** The hand lets go: bow string snaps, thrown item leaves. */
  release() {
    this.releaseT = 0;
  }

  swing(dur: number) {
    this.swingT = 0;
    this.swingDur = dur;
  }

  /** World position (in body space) of the weapon grip. */
  get grip(): THREE.Vector3 {
    return this.cur.wp;
  }

  private pose(s: HeldState, dt: number): Pose {
    const d = this.def!;
    const walk = s.walk;
    const idleL = V(0.36, 0.97 + 0.02 * Math.abs(walk), 0.04 - walk * 0.2);
    const idleR = V(-0.36, 0.97 + 0.02 * Math.abs(walk), 0.04 + walk * 0.2);
    const wr = new THREE.Euler();
    let show = true;
    let rate = 14;
    let lh = idleL;
    let rh = idleR;
    let wp = idleR.clone();
    let hand: Pose['hand'] = 'r';
    const afterRelease = this.releaseT < 0.12;
    const reloading = s.cooldown > 0;
    const hasAmmo = s.ammo === null || s.ammo > 0;
    if (s.sprinting) {
      lh = V(0.3, 1.05, 0.2 - walk * 0.35);
      rh = V(-0.3, 1.05, 0.2 + walk * 0.35);
    }

    if (d.family === 1) {
      // ---- bow: left hand holds it, right hand draws ----
      hand = 'l';
      const ready = s.drawing || s.aiming || this.releaseT < 0.7;
      const target = s.drawing ? smooth(s.drawP) : 0;
      this.pull = afterRelease ? 0 : lerp(this.pull, target, 1 - Math.exp(-(s.drawing ? 12 : 40) * dt));
      if (ready) {
        const shake = s.drawing && s.drawP >= 1 ? Math.sin(performance.now() / 45) * 0.004 : 0;
        lh = V(0.3, 1.46 + shake, 0.6);
        wp = lh.clone();
        wr.set(0, 0, 0);
        rh = V(0.3 - 0.36 * this.pull, 1.46 + 0.02 * this.pull, 0.5 - 0.46 * this.pull);
        rate = 22;
      } else {
        lh = V(0.38, 0.95, 0.12 - walk * 0.15);
        wp = lh.clone();
        wr.set(0.15, 0, 0.12);
        rh = idleR;
        this.pull = 0;
      }
      show = true;
    } else if (d.kind === 'melee' && (d.id === 'spyd' || d.id === 'langspyd')) {
      // ---- spear held in the right hand, left hand steadies ----
      const sw = this.swingT < this.swingDur ? this.swingT / this.swingDur : -1;
      if (sw >= 0) {
        const pullBack = smooth(sw / 0.3);
        const thrust = smooth((sw - 0.3) / 0.25);
        const back = smooth((sw - 0.65) / 0.35);
        const z = lerp(lerp(0.05, -0.28, pullBack), 0.85, thrust);
        rh = V(-0.25, 1.42, lerp(z, 0.05, back));
        lh = rh.clone().add(V(0.28, 0.02, 0.4));
        wr.set(0, 0, 0);
        wp = rh.clone();
        rate = 30;
      } else {
        rh = V(-0.38, 0.98, 0.18);
        wp = rh.clone();
        wr.set(-1.5 - walk * 0.04, 0, 0.05);
        lh = idleL;
      }
      hand = 'r';
    } else if (d.kind === 'melee') {
      // ---- knife slash ----
      const sw = this.swingT < this.swingDur ? this.swingT / this.swingDur : -1;
      if (sw >= 0) {
        const k = smooth(sw);
        rh = V(lerp(-0.42, 0.22, k), lerp(1.75, 1.05, k), lerp(0.15, 0.72, k));
        wp = rh.clone();
        wr.set(lerp(-1.3, 0.7, k), lerp(0.3, -0.3, k), lerp(-0.6, 0.6, k));
        rate = 40;
      } else {
        rh = V(-0.36, 0.97, 0.14 + walk * 0.2);
        wp = rh.clone();
        wr.set(-0.35, 0, 0);
      }
    } else if (d.id === 'slynge') {
      // ---- sling: whirl above the head, let go forward ----
      const k = s.drawing ? smooth(Math.min(1, s.drawP * 1.4)) : 0;
      this.spin += dt * (s.drawing ? 5 + 16 * s.drawP : 2);
      if (s.drawing) {
        rh = V(-0.22, lerp(1.0, 2.0, k), lerp(0.1, 0.05, k));
        lh = V(0.3, 1.2, 0.2);
        rate = 16;
      } else if (afterRelease) {
        rh = V(-0.15, 1.55, 0.6);
        rate = 40;
      } else {
        rh = idleR.clone().add(V(0, -0.05, 0));
      }
      wp = rh.clone();
      wr.set(0, 0, 0);
      show = hasAmmo;
    } else if (d.kind === 'trap' || d.kind === 'bait') {
      // ---- carried in both hands, put down on release ----
      hand = 'both';
      if (afterRelease || (this.releaseT < 0.45 && reloading)) {
        const k = smooth(this.releaseT / 0.2);
        rh = V(-0.16, lerp(1.0, 0.45, k), lerp(0.4, 0.62, k));
        lh = V(0.16, lerp(1.0, 0.45, k), lerp(0.4, 0.62, k));
        show = this.releaseT < 0.12;
        rate = 26;
      } else {
        rh = V(-0.15, 1.02, 0.4);
        lh = V(0.15, 1.02, 0.4);
        show = hasAmmo && !reloading;
      }
      wp = V(0, rh.y + 0.02, rh.z + 0.02);
      wr.set(0, 0, 0);
    } else {
      // ---- thrown knife / axe / spear ----
      const spearT = d.look === 'spear';
      const k = s.drawing ? smooth(Math.min(1, s.drawP)) : 0;
      const back = spearT ? V(-0.27, 1.58, -0.22) : V(-0.3, 1.82, -0.2);
      const front = V(-0.2, 1.5, 0.68);
      const idle = spearT ? V(-0.38, 0.98, 0.18) : idleR;
      if (s.drawing) {
        rh = idle.clone().lerp(back, k);
        lh = idleL.clone().lerp(V(0.22, 1.5, 0.42), k);
        wr.set(spearT ? lerp(-1.5, 0, k) : lerp(-0.9, -0.5, k), 0, 0);
        rate = 16;
      } else if (afterRelease) {
        const t = smooth(this.releaseT / 0.1);
        rh = back.clone().lerp(front, t);
        wr.set(0, 0, 0);
        rate = 45;
        show = this.releaseT < 0.06 && hasAmmo;
      } else {
        rh = idle.clone();
        wr.set(spearT ? -1.5 : -0.9, 0, 0);
      }
      wp = rh.clone();
      if (!afterRelease) show = hasAmmo && !reloading;
    }
    if (this.equipT > 0) {
      rh = rh.clone().lerp(V(-0.3, 0.7, 0.1), this.equipT * 2);
      lh = lh.clone().lerp(V(0.3, 0.7, 0.1), this.equipT * 2);
      rate = 14;
    }
    return { lh, rh, wp, wr, show, rate, hand };
  }

  update(dt: number, s: HeldState) {
    if (!this.def || !this.weapon) return;
    this.releaseT += dt;
    this.swingT += dt;
    this.equipT = Math.max(0, this.equipT - dt);
    const t = this.pose(s, dt);
    const a = 1 - Math.exp(-t.rate * dt);
    this.cur.lh.lerp(t.lh, a);
    this.cur.rh.lerp(t.rh, a);
    this.cur.wp.lerp(t.wp, a);
    this.cur.wr.x = lerp(this.cur.wr.x, t.wr.x, a);
    this.cur.wr.y = lerp(this.cur.wr.y, t.wr.y, a);
    this.cur.wr.z = lerp(this.cur.wr.z, t.wr.z, a);

    const w = this.weapon;
    w.group.visible = t.show || !!w.bow; // the bow itself is always there
    w.group.position.copy(this.cur.wp);
    w.group.rotation.copy(this.cur.wr);
    w.group.updateMatrixWorld(true);

    if (w.bow) {
      const ready = s.drawing || s.aiming || this.releaseT < 0.7;
      const nockWorld = this.cur.rh.clone();
      const inv = new THREE.Matrix4().copy(w.group.matrix).invert();
      const nock = ready ? nockWorld.applyMatrix4(inv) : V(0, 0, w.bow.tipZ);
      nock.x = 0;
      nock.y = 0;
      const arr = w.bow.string.geometry.attributes.position as THREE.BufferAttribute;
      arr.setXYZ(0, 0, w.bow.half, w.bow.tipZ);
      arr.setXYZ(1, 0, 0, Math.min(nock.z, w.bow.tipZ));
      arr.setXYZ(2, 0, -w.bow.half, w.bow.tipZ);
      arr.needsUpdate = true;
      const showArrow = ready && hasAmmoNow(s) && s.cooldown <= 0.02 && !(this.releaseT < 0.12);
      w.bow.arrow.visible = showArrow;
      w.bow.arrow.position.set(0, 0, Math.min(nock.z, w.bow.tipZ));
    }
    if (w.sling) {
      const ang = this.spin;
      const r = s.drawing ? 0.2 + 0.32 * Math.min(1, s.drawP * 2) : 0.0;
      const hang = s.drawing ? 0.0 : -0.32;
      w.sling.pouch.position.set(Math.cos(ang) * r, hang + 0.0, Math.sin(ang) * r);
      const c = w.sling.cords.geometry.attributes.position as THREE.BufferAttribute;
      c.setXYZ(0, 0, 0, 0);
      c.setXYZ(1, w.sling.pouch.position.x, w.sling.pouch.position.y, w.sling.pouch.position.z);
      c.setXYZ(2, 0.02, 0, 0);
      c.needsUpdate = true;
      w.sling.pouch.visible = true;
    }

    // arms
    const pole = [V(0.7, -0.6, -0.3).normalize(), V(-0.7, -0.6, -0.3).normalize()];
    const targets = [this.cur.lh, this.cur.rh];
    for (let i = 0; i < 2; i++) this.solveArm(i, targets[i], pole[i]);
  }

  private solveArm(i: number, target: THREE.Vector3, pole: THREE.Vector3) {
    const sh = this.shoulder[i];
    const up = 0.3;
    const fo = 0.3;
    const d = target.clone().sub(sh);
    let dist = d.length();
    const max = up + fo - 0.005;
    const dir = d.clone().normalize();
    if (dist > max) dist = max;
    const a = (up * up - fo * fo + dist * dist) / (2 * dist || 1);
    const h = Math.sqrt(Math.max(0, up * up - a * a));
    const perp = pole.clone().sub(dir.clone().multiplyScalar(pole.dot(dir)));
    if (perp.lengthSq() < 1e-6) perp.set(0, -1, 0);
    perp.normalize();
    const elbow = sh.clone().addScaledVector(dir, a).addScaledVector(perp, h);
    const wrist = sh.clone().addScaledVector(dir, dist);
    const down = V(0, -1, 0);
    this.upper[i].position.copy(sh);
    this.upper[i].quaternion.setFromUnitVectors(down, elbow.clone().sub(sh).normalize());
    this.fore[i].position.copy(elbow);
    this.fore[i].quaternion.setFromUnitVectors(down, wrist.clone().sub(elbow).normalize());
    this.hands[i].position.copy(wrist);
  }
}

function hasAmmoNow(s: HeldState): boolean {
  return s.ammo === null || s.ammo > 0;
}
