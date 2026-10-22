import * as THREE from 'three';
import type { WeaponDef } from '../data/weapons';

/**
 * The hunter's arms and the weapon in his hands.
 *
 * Arms are two-bone IK (upper arm + forearm with the hand at its end). Each pose gives hand targets; the arms are
 * solved, and the weapon is then placed from the SOLVED hand (plus a per-weapon grip offset), so it can never float
 * away from the hand. The bow is aligned on the line from the chin anchor through the bow hand, so the nock always
 * sits on the draw hand.
 *
 * Space: the rig lives in the hunter's upper body (torso) group, in body-space coordinates (+z forward, +x left,
 * +y up, feet at y=0). The upper body itself twists/leans/pitches about the hips; poses that must aim (bow, throw)
 * give their targets in the un-rotated body frame and are converted into the torso frame, so the arms take whatever
 * the torso did not.
 *
 * Usage per frame: `plan(dt, state)` → returns the body drive (twist, lean, lunge, crouch, aim share), the player
 * applies it to the torso, then `solve(dt, torsoQuaternion)`.
 */

export interface HeldState {
  drawing: boolean;
  drawP: number; // 0..1 how far the draw/wind-up is
  aiming: boolean;
  walk: number; // -1..1 gait arm swing
  sprinting: boolean;
  rolling: boolean;
  cooldown: number; // seconds left of reload after a release
  ammo: number | null; // null = unlimited
  pitch?: number; // camera pitch, radians, + looks up
  tremble?: number; // 0..1 full-draw fatigue
  dead?: boolean;
}

/** What the weapon move asks of the body. Smoothed by the rig. */
export interface BodyDrive {
  twist: number; // torso yaw, + turns the left shoulder back / right shoulder forward
  lean: number; // torso pitch, + forward
  lunge: number; // metres the whole body moves forward
  crouch: number; // metres the hips drop
  aim: number; // 0..1 how much of the camera pitch the torso takes (0.35 of it at 1)
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const smooth = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Arm lengths (m). Forearm includes the hand: the IK target is the hand centre. */
export const ARM = { upper: 0.31, fore: 0.36, protract: 0.08 };
const REACH = ARM.upper + ARM.fore;
const HIP_Y = 0.92;
const SHOULDER_Y = 1.43;
/** Chin anchor of the bow draw, torso space. */
const ANCHOR = V(-0.035, 1.6, 0.13);
/** Length from the anchor to the bow hand at full draw. */
const DRAW_LEN = 0.56;

const M = {
  wood: new THREE.MeshStandardMaterial({ color: 0x7a5632, roughness: 0.85 }),
  lightWood: new THREE.MeshStandardMaterial({ color: 0xa88a52, roughness: 0.8 }),
  darkWood: new THREE.MeshStandardMaterial({ color: 0x3b2a1c, roughness: 0.9 }),
  steel: new THREE.MeshStandardMaterial({ color: 0xa9b0b5, metalness: 0.7, roughness: 0.45 }),
  iron: new THREE.MeshStandardMaterial({ color: 0x4a4e52, metalness: 0.7, roughness: 0.5 }),
  leather: new THREE.MeshStandardMaterial({ color: 0x5a3d26, roughness: 0.9 }),
  red: new THREE.MeshStandardMaterial({ color: 0xa8302a, roughness: 0.9 }),
  rope: new THREE.MeshStandardMaterial({ color: 0x9a7a45, roughness: 1 }),
  green: new THREE.MeshStandardMaterial({ color: 0x5f9a38, roughness: 0.7, emissive: 0x1c4a0c, emissiveIntensity: 0.6 }),
  meat: new THREE.MeshStandardMaterial({ color: 0xa32a2a, roughness: 0.7, emissive: 0x3a0808, emissiveIntensity: 0.5 }),
  bone: new THREE.MeshStandardMaterial({ color: 0xe8e0cc, roughness: 0.8 }),
  stone: new THREE.MeshStandardMaterial({ color: 0x8a8a86, roughness: 1 }),
  string: new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.7 }),
  cord: new THREE.LineBasicMaterial({ color: 0xb09a68 }),
};
/** Materials of held weapons, so the hunter fade can reach them. */
export const HELD_MATERIALS: THREE.Material[] = Object.values(M);

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

/** Unit string segment from y=0 to y=1; scaled and aimed per frame. */
const STRING_GEO = new THREE.CylinderGeometry(0.0035, 0.0035, 1, 4, 1, true).translate(0, 0.5, 0);

interface Model {
  group: THREE.Group;
  /** Weapon-space point the hand closes around. */
  grip: THREE.Vector3;
  /** Bows only. */
  bow?: { tipZ: number; half: number; belly: number; strings: [THREE.Mesh, THREE.Mesh]; arrow: THREE.Group; gripMesh: THREE.Object3D };
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
  const gripMesh = mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.14, 8), c.grip, 0, 0, c.belly);
  group.add(gripMesh);
  const tipZ = pts[0].z;
  const strings: [THREE.Mesh, THREE.Mesh] = [new THREE.Mesh(STRING_GEO, M.string), new THREE.Mesh(STRING_GEO, M.string)];
  for (const s of strings) group.add(s);
  // arrow, tail at the nock
  const arrow = new THREE.Group();
  arrow.add(rod(0.008, 0, 0.78, M.lightWood));
  arrow.add(mesh(new THREE.ConeGeometry(0.02, 0.07, 5).rotateX(Math.PI / 2), c.arrowTip, 0, 0, 0.8));
  for (const a of [0, 2.1, 4.2]) {
    const f = mesh(new THREE.BoxGeometry(0.003, 0.04, 0.1), M.red, Math.cos(a) * 0.014, Math.sin(a) * 0.014, 0.05);
    f.rotation.z = a - Math.PI / 2;
    arrow.add(f);
  }
  group.add(arrow);
  return { group, grip: V(0, 0, c.belly), bow: { tipZ, half: c.half, belly: c.belly, strings, arrow, gripMesh } };
}

function buildKnife(def: WeaponDef): Model {
  const g = new THREE.Group();
  const long = def.id === 'jagtkniv';
  const bl = long ? 0.3 : 0.2;
  g.add(rod(0.02, -0.13, 0.04, M.wood));
  if (long) g.add(mesh(new THREE.BoxGeometry(0.1, 0.02, 0.02), M.iron, 0, 0, 0.045));
  g.add(mesh(new THREE.BoxGeometry(0.012, long ? 0.045 : 0.035, bl), M.steel, 0, 0, 0.05 + bl / 2));
  g.add(mesh(new THREE.ConeGeometry(long ? 0.0225 : 0.0175, 0.07, 4).rotateX(Math.PI / 2).scale(0.35, 1, 1), M.steel, 0, 0, 0.05 + bl + 0.03));
  return { group: g, grip: V(0, 0, -0.05) };
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
  return { group: g, grip: V(0, 0, -0.17) };
}

function buildSpear(def: WeaponDef): Model {
  const g = new THREE.Group();
  const total = def.id === 'langspyd' ? 3.2 : def.id === 'spyd' ? 2.2 : 1.9;
  const tail = total * 0.34;
  g.add(rod(0.022, -tail, total - tail - 0.28, M.wood));
  g.add(mesh(new THREE.ConeGeometry(0.05, 0.3, 4).rotateX(Math.PI / 2).scale(0.45, 1, 1), M.steel, 0, 0, total - tail - 0.14));
  g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.06, 6).rotateX(Math.PI / 2), M.iron, 0, 0, total - tail - 0.29));
  if (def.id === 'langspyd') {
    for (const a of [0, 2.1, 4.2]) g.add(mesh(new THREE.BoxGeometry(0.02, 0.1, 0.02), M.red, Math.cos(a) * 0.05, Math.sin(a) * 0.05, total - tail - 0.38));
  }
  g.add(mesh(new THREE.BoxGeometry(0.03, 0.03, 0.04), M.iron, 0, 0, -tail));
  return { group: g, grip: V(0, 0, 0) };
}

function buildSling(): Model {
  const g = new THREE.Group();
  const pouch = mesh(new THREE.SphereGeometry(0.045, 8, 6).scale(1, 0.6, 1), M.leather);
  pouch.add(mesh(new THREE.SphereGeometry(0.025, 6, 5), M.stone, 0, 0.02, 0));
  g.add(pouch);
  const geo = new THREE.BufferGeometry().setFromPoints([V(0, 0, 0), V(0, 0, 0), V(0, 0, 0)]);
  const cords = new THREE.Line(geo, M.cord);
  cords.frustumCulled = false;
  g.add(cords);
  return { group: g, grip: V(0, 0, 0), sling: { pouch, cords } };
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
      g.add(j);
    }
    g.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 8), M.steel, 0, 0, 0));
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      g.add(mesh(new THREE.ConeGeometry(0.012, 0.04, 4), M.steel, Math.cos(a) * 0.15, 0.03, Math.sin(a) * 0.15));
    }
  } else {
    const poison = def.id === 'giftaad';
    g.add(mesh(new THREE.BoxGeometry(0.2, 0.1, 0.14), poison ? M.green : M.meat));
    g.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.28, 6).rotateZ(Math.PI / 2), M.bone, 0, 0.02, 0));
  }
  return { group: g, grip: V(0, 0, 0) };
}

export function buildHeldModel(def: WeaponDef): Model {
  if (def.family === 1) return buildBow(def);
  if (def.id === 'slynge') return buildSling();
  if (def.kind === 'trap' || def.kind === 'bait') return buildTrap(def);
  if (def.look === 'knife' || def.id === 'jagtkniv') return buildKnife(def);
  if (def.look === 'axe') return buildAxe(def);
  return buildSpear(def);
}

type Mode = 'l' | 'r' | 'both' | 'bow';

/** Scratch objects: the rig runs every frame and must not allocate. */
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _d = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _qi = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _dir = new THREE.Vector3();
const DOWN = V(0, -1, 0);
const UP = V(0, 1, 0);
const HIP = V(0, HIP_Y, 0);
const PITCH_PIVOT = V(0, SHOULDER_Y + 0.03, 0);

export class HeldRig {
  readonly group = new THREE.Group();
  /** Solved hand centres, torso space. */
  readonly hand = [V(0.3, 0.92, 0.05), V(-0.3, 0.92, 0.05)];
  readonly drive: BodyDrive = { twist: 0, lean: 0, lunge: 0, crouch: 0, aim: 0 };
  private upperArm: THREE.Object3D[] = [];
  private foreArm: THREE.Object3D[] = [];
  private hands: THREE.Object3D[] = [];
  private shoulder = [V(0.21, SHOULDER_Y, 0), V(-0.21, SHOULDER_Y, 0)];
  /** Smoothed hand targets (torso space) and weapon rotation. */
  private cur = { lh: V(0.3, 0.92, 0.05), rh: V(-0.3, 0.92, 0.05), wr: new THREE.Euler(0, 0, 0, 'YXZ') };
  // raw pose output for this frame
  private tLh = V(0, 0, 0);
  private tRh = V(0, 0, 0);
  private lhBody = false;
  private rhBody = false;
  private tWr = new THREE.Euler(0, 0, 0, 'YXZ');
  private mode: Mode = 'r';
  private show = true;
  private rate = 14;
  private supportZ: number | null = null;
  private poleL = V(0.7, -0.6, -0.3).normalize();
  private poleR = V(-0.7, -0.6, -0.3).normalize();
  private target: BodyDrive = { twist: 0, lean: 0, lunge: 0, crouch: 0, aim: 0 };
  private driveRate = 12;
  private weapon?: Model;
  private def?: WeaponDef;
  private releaseT = 99;
  private swingT = 99;
  private swingDur = 0.3;
  private contactAt = 0.5;
  private onContact: (() => void) | null = null;
  private pull = 0;
  private spin = 0;
  private equipT = 0;
  private time = 0;
  private bowCant = 0.12;
  private state!: HeldState;

  constructor(sleeve: THREE.Material, skin: THREE.Material, glove: THREE.Material) {
    const upGeo = new THREE.CylinderGeometry(0.068, 0.055, ARM.upper, 8).translate(0, -ARM.upper / 2, 0);
    const foGeo = new THREE.CylinderGeometry(0.056, 0.045, ARM.fore - 0.05, 8).translate(0, -(ARM.fore - 0.05) / 2, 0);
    const handGeo = new THREE.SphereGeometry(0.052, 8, 6).scale(0.9, 1.1, 1);
    for (let i = 0; i < 2; i++) {
      const up = new THREE.Mesh(upGeo, sleeve);
      const fo = new THREE.Mesh(foGeo, glove);
      const hand = new THREE.Mesh(handGeo, skin);
      for (const o of [up, fo, hand]) {
        o.castShadow = true;
        this.group.add(o);
      }
      this.upperArm.push(up);
      this.foreArm.push(fo);
      this.hands.push(hand);
    }
  }

  get weaponId(): string {
    return this.def?.id ?? '';
  }

  setWeapon(def: WeaponDef) {
    if (this.def?.id === def.id) return;
    const first = !this.def;
    if (this.weapon) this.group.remove(this.weapon.group);
    this.def = def;
    this.weapon = buildHeldModel(def);
    this.weapon.group.rotation.order = 'YXZ';
    this.group.add(this.weapon.group);
    this.equipT = first ? 0 : 0.5;
    this.releaseT = 99;
    this.swingT = 99;
    this.onContact = null;
    this.pull = 0;
  }

  /** The hand lets go: bow string snaps, thrown item leaves, trap is set down. */
  release() {
    this.releaseT = 0;
  }

  /**
   * Start a melee swing of `dur` seconds. `onContact` fires once when the animation reaches the blow
   * (`contactAt` as a fraction of `dur`: spear thrust peak 0.5, knife slash mid-arc 0.45).
   */
  swing(dur: number, contactAt = 0.5, onContact?: () => void) {
    this.swingT = 0;
    this.swingDur = dur;
    this.contactAt = contactAt;
    this.onContact = onContact ?? null;
  }

  /** True while a melee swing is playing. */
  get swinging(): boolean {
    return this.swingT < this.swingDur;
  }

  /** World position of the bow's arrow rest (bows) or of the weapon hand. */
  muzzleWorld(out: THREE.Vector3): THREE.Vector3 {
    const w = this.weapon;
    if (w?.bow) return w.bow.gripMesh.getWorldPosition(out);
    return this.hands[this.mode === 'l' ? 0 : 1].getWorldPosition(out);
  }

  handWorld(i: 0 | 1, out: THREE.Vector3): THREE.Vector3 {
    return this.hands[i].getWorldPosition(out);
  }

  /** Step 1: timers, pose targets and the body drive the move wants. */
  plan(dt: number, s: HeldState): BodyDrive {
    this.state = s;
    this.time += dt;
    this.releaseT += dt;
    const prevSwing = this.swingT;
    this.swingT += dt;
    if (this.onContact && prevSwing < this.contactAt * this.swingDur && this.swingT >= this.contactAt * this.swingDur) {
      const fn = this.onContact;
      this.onContact = null;
      fn();
    }
    if (s.rolling || s.dead) {
      this.swingT = 99;
      this.onContact = null;
    }
    this.equipT = Math.max(0, this.equipT - dt);
    if (this.def) this.pose(s, dt);
    const a = 1 - Math.exp(-this.driveRate * dt);
    const d = this.drive;
    const t = this.target;
    d.twist += (t.twist - d.twist) * a;
    d.lean += (t.lean - d.lean) * a;
    d.lunge += (t.lunge - d.lunge) * a;
    d.crouch += (t.crouch - d.crouch) * a;
    d.aim += (t.aim - d.aim) * (1 - Math.exp(-8 * dt));
    return d;
  }

  private setDrive(twist: number, lean: number, lunge: number, crouch: number, aim: number, rate = 12) {
    const t = this.target;
    t.twist = twist;
    t.lean = lean;
    t.lunge = lunge;
    t.crouch = crouch;
    t.aim = aim;
    this.driveRate = rate;
  }

  /** Writes the raw targets for this frame. Positions are torso space unless lhBody/rhBody (pitched body frame). */
  private pose(s: HeldState, dt: number) {
    const d = this.def!;
    const walk = s.walk;
    const lh = this.tLh;
    const rh = this.tRh;
    const wr = this.tWr;
    // defaults: arms hanging, swinging with the gait
    lh.set(0.27, 0.9 + 0.02 * Math.abs(walk), 0.05 - walk * 0.22);
    rh.set(-0.27, 0.9 + 0.02 * Math.abs(walk), 0.05 + walk * 0.22);
    this.lhBody = this.rhBody = false;
    wr.set(0, 0, 0);
    this.show = true;
    this.rate = 14;
    this.mode = 'r';
    this.supportZ = null;
    this.poleL.set(0.7, -0.6, -0.4).normalize();
    this.poleR.set(-0.7, -0.6, -0.4).normalize();
    this.setDrive(0, 0, 0, 0, 0);
    const afterRelease = this.releaseT < 0.12;
    const reloading = s.cooldown > 0;
    const hasAmmo = s.ammo === null || s.ammo > 0;
    if (s.sprinting) {
      // pumping arms, elbows bent
      lh.set(0.25, 1.08 + 0.05 * walk, 0.16 - walk * 0.3);
      rh.set(-0.25, 1.08 - 0.05 * walk, 0.16 + walk * 0.3);
      this.poleL.set(0.3, -0.3, -1).normalize();
      this.poleR.set(-0.3, -0.3, -1).normalize();
    }

    if (d.family === 1) {
      // ---- bow: left hand holds it, right hand draws to the chin ----
      const ready = !s.rolling && !s.sprinting && (s.drawing || s.aiming || this.releaseT < 0.6);
      const target = s.drawing ? smooth(s.drawP) : 0;
      this.pull = afterRelease ? 0 : this.pull + (target - this.pull) * (1 - Math.exp(-(s.drawing ? 12 : 30) * dt));
      if (ready) {
        this.mode = 'bow';
        this.rate = 22;
        // the bow hand: along the aim from the chin anchor (body frame, pitched), converted later
        const trem = (s.tremble ?? 0) * 0.012;
        let kick = 0;
        if (this.releaseT < 0.35) kick = this.releaseT < 0.06 ? smooth(this.releaseT / 0.06) : 1 - smooth((this.releaseT - 0.06) / 0.29);
        lh.set(0, 0, DRAW_LEN + 0.03 * kick); // stored as (aim-space) offset; resolved in solve()
        lh.x = trem * Math.sin(this.time * 23.0);
        lh.y = trem * Math.sin(this.time * 17.3 + 1.3);
        this.lhBody = true; // special: bow handled in solve
        this.bowCant = 0.12 + 0.15 * kick;
        // follow-through: the string hand flies back past the ear, then returns to the string
        rh.set(ANCHOR.x - 0.07 * kick, ANCHOR.y + 0.03 * kick, ANCHOR.z - 0.24 * kick);
        this.poleL.set(0.4, -0.8, 0).normalize();
        this.poleR.set(-0.45, 0.1, -1).normalize();
        this.setDrive(-0.32, 0.02 * this.pull, 0, 0, 1, 10);
      } else {
        this.mode = 'l';
        lh.set(0.29, 0.93, 0.1 - walk * 0.15);
        if (s.sprinting) lh.set(0.25, 1.05 + 0.05 * walk, 0.12 - walk * 0.28);
        wr.set(0.25, 0.05, 0.12);
        this.pull = 0;
      }
    } else if (d.kind === 'melee' && (d.id === 'spyd' || d.id === 'langspyd')) {
      // ---- spear thrust: pull back, lunge and drive the right shoulder through; left hand slides on the shaft ----
      const sw = this.swingT < this.swingDur ? this.swingT / this.swingDur : -1;
      this.supportZ = -0.42;
      if (sw >= 0) {
        const pullBack = smooth(sw / 0.3);
        const thrust = smooth((sw - 0.3) / 0.2);
        const back = smooth((sw - 0.62) / 0.38);
        const z = lerp(lerp(0.12, -0.12, pullBack), 0.62, thrust);
        rh.set(lerp(-0.24, -0.1, thrust), lerp(1.3, 1.38, thrust), lerp(z, 0.12, back));
        wr.set(lerp(0.12, 0.04, thrust), lerp(0.05, 0.02, thrust), 0);
        this.rate = 34;
        const twist = lerp(lerp(0, -0.3, pullBack), 0.32, thrust) * (1 - back);
        const lunge = 0.27 * thrust * (1 - back);
        this.setDrive(twist, (lerp(-0.06 * pullBack, 0.18, thrust)) * (1 - back), lunge, 0.06 * thrust * (1 - back), 0, 30);
        this.poleR.set(-0.8, -0.5, -0.2).normalize();
      } else {
        // carried upright in the right hand, butt near the ground
        rh.set(-0.3, 1.0, 0.16 + walk * 0.05);
        wr.set(-1.38 - walk * 0.04, 0, 0.06);
        this.supportZ = null;
      }
    } else if (d.kind === 'melee') {
      // ---- knife slash: wind up high right, torso twists through the arc ----
      const sw = this.swingT < this.swingDur ? this.swingT / this.swingDur : -1;
      if (sw >= 0) {
        const wind = smooth(sw / 0.25);
        const k = smooth((sw - 0.25) / 0.38);
        const back = smooth((sw - 0.7) / 0.3);
        rh.set(lerp(-0.26, -0.36, wind), lerp(1.2, 1.66, wind), lerp(0.25, 0.12, wind));
        if (k > 0) rh.set(lerp(-0.36, 0.2, k), lerp(1.66, 1.08, k), lerp(0.12, 0.42, k) + 0.18 * Math.sin(Math.PI * k));
        if (back > 0) rh.lerp(_a.set(-0.27, 0.95, 0.2), back);
        wr.set(lerp(-1.1, 0.75, k), lerp(0.5, -0.6, k), lerp(-0.7, 0.8, k));
        this.rate = 40;
        const twist = (lerp(-0.42 * wind, 0.45, k)) * (1 - back);
        this.setDrive(twist, 0.12 * k * (1 - back), 0.1 * k * (1 - back), 0.04, 0, 26);
        this.poleR.set(-0.9, -0.3, -0.3).normalize();
      } else {
        rh.set(-0.28, 0.96, 0.14 + walk * 0.2);
        wr.set(-0.35, 0, 0);
      }
    } else if (d.id === 'slynge') {
      // ---- sling: whirl above the head, let go forward ----
      const k = s.drawing ? smooth(Math.min(1, s.drawP * 1.4)) : 0;
      this.spin += dt * (s.drawing ? 5 + 16 * s.drawP : 2);
      if (s.drawing) {
        rh.set(-0.2, lerp(1.1, 1.92, k), lerp(0.15, 0.08, k));
        lh.set(0.13, 0.12, 0.5); // pointing hand, body frame
        lh.y = SHOULDER_Y - 0.02 - PITCH_PIVOT.y;
        this.lhBody = true;
        this.rate = 16;
        this.setDrive(-0.25 * k, -0.04 * k, 0, 0, 0.6, 10);
      } else if (this.releaseT < 0.4) {
        const t = smooth(this.releaseT / 0.08);
        const ft = smooth((this.releaseT - 0.08) / 0.32);
        if (ft <= 0) {
          // let go in front, along the aim (body frame, relative to the shoulder pivot)
          rh.set(lerp(-0.2, -0.1, t), lerp(0.46, 0.02, t), lerp(0.08, 0.58, t));
          this.rhBody = true;
        } else {
          rh.set(lerp(-0.1, 0.1, ft), lerp(1.48, 1.05, ft), lerp(0.58, 0.32, ft));
        }
        this.rate = 40;
        this.setDrive(lerp(-0.25, 0.3, t) * (1 - ft), 0.12 * t * (1 - ft), 0, 0, 0.4, 24);
      } else {
        rh.set(-0.28, 0.9, 0.08 + walk * 0.2);
      }
      wr.set(0, 0, 0);
      this.show = hasAmmo;
    } else if (d.kind === 'trap' || d.kind === 'bait') {
      // ---- carried in both hands; on release crouch, set it on the ground, stand up ----
      this.mode = 'both';
      const placing = this.releaseT < 0.6 && (reloading || this.releaseT < 0.15);
      if (placing) {
        const down = smooth(this.releaseT / 0.17);
        const up = smooth((this.releaseT - 0.32) / 0.28);
        const k = down * (1 - up);
        rh.set(-0.15, lerp(1.0, 0.62, k), lerp(0.42, 0.62, k));
        lh.set(0.15, lerp(1.0, 0.62, k), lerp(0.42, 0.62, k));
        this.show = this.releaseT < 0.24;
        this.rate = 26;
        this.setDrive(0, 0.55 * k, 0, 0.42 * k, 0, 22);
        this.poleL.set(0.8, -0.2, -0.4).normalize();
        this.poleR.set(-0.8, -0.2, -0.4).normalize();
      } else {
        rh.set(-0.15, 1.02, 0.38);
        lh.set(0.15, 1.02, 0.38);
        this.show = hasAmmo && !reloading;
      }
      wr.set(0, 0, 0);
    } else {
      // ---- thrown knife / axe / spear: twist back, off hand points, whip through, follow through to the left hip ----
      const spearT = d.look === 'spear';
      const k = s.drawing ? smooth(Math.min(1, s.drawP)) : 0;
      if (s.drawing) {
        if (spearT) rh.set(-0.3, 1.0, 0.16);
        rh.lerp(spearT ? _a.set(-0.3, 1.6, -0.24) : _a.set(-0.3, 1.78, -0.16), k);
        lh.set(0.13, SHOULDER_Y - 0.06 - PITCH_PIVOT.y, 0.5);
        this.lhBody = true;
        wr.set(spearT ? lerp(-1.38, -0.12, k) : lerp(-0.9, -1.9, k), 0, 0);
        this.rate = 16;
        this.setDrive(-0.55 * k, -0.1 * k, 0, 0.04 * k, 0.6, 10);
        this.poleR.set(-0.6, -0.4, -0.5).normalize();
      } else if (this.releaseT < 0.45) {
        const t = smooth(this.releaseT / 0.09);
        const ft = smooth((this.releaseT - 0.09) / 0.36);
        if (ft <= 0) {
          // whip from behind the head to the release point in front (body frame, along the aim)
          rh.set(lerp(-0.25, -0.12, t), lerp(0.3, 0.02, t), lerp(-0.25, 0.55, t));
          this.rhBody = true;
        } else {
          rh.set(lerp(-0.12, 0.12, ft), lerp(1.45, 1.0, ft), lerp(0.55, 0.3, ft));
        }
        wr.set(lerp(-1.6, 0.4, t), 0, 0);
        this.rate = 45;
        this.show = this.releaseT < 0.05 && hasAmmo;
        this.setDrive(lerp(-0.55, 0.35, t) * (1 - ft), lerp(-0.1, 0.18, t) * (1 - ft), 0.08 * t * (1 - ft), 0.04, 0.4 * (1 - ft), 30);
      } else {
        rh.set(spearT ? -0.3 : -0.27, spearT ? 1.0 : 0.92, (spearT ? 0.16 : 0.08) + walk * 0.18);
        wr.set(spearT ? -1.38 : -0.9, 0, 0);
      }
      if (!(this.releaseT < 0.45)) this.show = hasAmmo && !reloading;
    }

    // equip: reach to where the weapon is carried (back, belt), then bring it to the pose
    if (this.equipT > 0) {
      const a = 1 - this.equipT / 0.5;
      const reach = a < 0.45 ? smooth(a / 0.3) : 1 - smooth((a - 0.45) / 0.55);
      const fam = d.family;
      const fetch = fam === 1 ? _b.set(0.12, 1.62, -0.16) : fam === 4 && d.kind === 'melee' ? _b.set(-0.14, 1.6, -0.18) : fam === 3 ? _b.set(0.22, 0.95, -0.14) : _b.set(-0.22, 0.98, 0.12);
      const useLeft = fam === 1 || fam === 3;
      if (useLeft) {
        if (this.lhBody) this.lhBody = false, lh.set(0.27, 0.92, 0.1);
        lh.lerp(fetch, reach);
      } else {
        if (this.rhBody) this.rhBody = false, rh.set(-0.27, 0.92, 0.1);
        rh.lerp(fetch, reach);
      }
      if (this.mode === 'bow') this.mode = 'l';
      if (a < 0.45) this.show = false;
      this.rate = 16;
      this.target.twist += 0.15 * reach * (useLeft ? -1 : 1);
    }
    if (s.rolling) {
      // tucked
      lh.set(0.16, 1.12, 0.3);
      rh.set(-0.16, 1.12, 0.3);
      this.lhBody = this.rhBody = false;
      if (this.mode === 'bow') this.mode = 'l';
      this.rate = 24;
      this.setDrive(0, 0, 0, 0, 0, 20);
    }
    if (s.dead) {
      lh.set(0.33, 1.0, 0.12);
      rh.set(-0.33, 1.0, 0.12);
      this.lhBody = this.rhBody = false;
      if (this.mode === 'bow') this.mode = 'l';
      this.rate = 8;
      this.setDrive(0, 0, 0, 0, 0, 8);
    }
  }

  /** Body frame (pitched about the shoulders by `pitch`) → torso space, given the torso rotation about the hips. */
  private bodyToTorso(p: THREE.Vector3, pitch: number, qInv: THREE.Quaternion, out: THREE.Vector3) {
    // p is relative to PITCH_PIVOT, aim frame
    out.copy(p).applyAxisAngle(_d.set(1, 0, 0), -pitch).add(PITCH_PIVOT);
    return out.sub(HIP).applyQuaternion(qInv).add(HIP);
  }

  /** Step 2: given the torso rotation (about the hips), place hands, solve arms and put the weapon in the hand. */
  solve(dt: number, torso: THREE.Quaternion) {
    if (!this.def || !this.weapon) return;
    const s = this.state;
    const pitch = s.pitch ?? 0;
    _qi.copy(torso).invert();
    const a = 1 - Math.exp(-this.rate * dt);
    const w = this.weapon;

    // anchor (torso space) and the aim direction expressed in torso space
    const aimDir = _c.set(0, Math.sin(pitch), Math.cos(pitch)).applyQuaternion(_qi);

    // resolve body-frame targets
    if (this.mode === 'bow') {
      // bow hand = anchor + aim · (draw length) (+ tremble, + release kick) in torso space
      _a.copy(ANCHOR).addScaledVector(aimDir, this.tLh.z);
      _a.x += this.tLh.x;
      _a.y += this.tLh.y;
      this.tLh.copy(_a);
    } else if (this.lhBody) {
      this.bodyToTorso(this.tLh, pitch, _qi, _a);
      this.tLh.copy(_a);
    }
    if (this.rhBody) {
      this.bodyToTorso(this.tRh, pitch, _qi, _a);
      this.tRh.copy(_a);
    }

    this.cur.lh.lerp(this.tLh, a);
    this.cur.wr.x = lerp(this.cur.wr.x, this.tWr.x, a);
    this.cur.wr.y = lerp(this.cur.wr.y, this.tWr.y, a);
    this.cur.wr.z = lerp(this.cur.wr.z, this.tWr.z, a);
    w.group.visible = this.show || !!w.bow; // the bow itself is always there

    if (this.mode === 'bow' && w.bow) {
      const bow = w.bow;
      this.solveArm(0, this.cur.lh, this.poleL);
      const lhS = this.hand[0];
      // bow axis from the chin anchor through the bow hand
      const dir = _dir.copy(lhS).sub(ANCHOR).normalize();
      _e.set(-Math.asin(Math.max(-1, Math.min(1, dir.y))), Math.atan2(dir.x, dir.z), this.bowCant, 'YXZ');
      w.group.rotation.copy(_e);
      w.group.position.copy(lhS).addScaledVector(dir, -bow.belly);
      // draw hand: on the arrow line between the resting string and the anchor
      const restNock = _a.copy(w.group.position).addScaledVector(dir, bow.tipZ - 0.015);
      const nockT = _d.copy(restNock).lerp(ANCHOR, this.pull);
      if (this.releaseT < 0.35) nockT.copy(this.tRh);
      this.cur.rh.lerp(nockT, 1 - Math.exp(-30 * dt));
      this.solveArm(1, this.cur.rh, this.poleR);
      // string to the hand (projected on the bow axis)
      const along = _a.copy(this.hand[1]).sub(w.group.position).dot(dir);
      const nockZ = this.releaseT < 0.3 ? bow.tipZ : Math.max(-0.75, Math.min(along, bow.tipZ));
      this.setString(bow, nockZ);
      const showArrow = s.ammo !== 0 && s.cooldown <= 0.02 && this.releaseT >= 0.3;
      bow.arrow.visible = showArrow;
      bow.arrow.position.set(0, 0, nockZ);
    } else {
      this.cur.rh.lerp(this.tRh, a);
      _e.copy(this.cur.wr);
      w.group.rotation.copy(_e);
      _q.setFromEuler(_e);
      if (this.mode === 'both') {
        this.solveArm(0, this.cur.lh, this.poleL);
        this.solveArm(1, this.cur.rh, this.poleR);
        w.group.position.copy(this.hand[0]).add(this.hand[1]).multiplyScalar(0.5);
        w.group.position.y += 0.03;
        w.group.position.z += 0.03;
      } else {
        const main = this.mode === 'l' ? 0 : 1;
        this.solveArm(main, main === 0 ? this.cur.lh : this.cur.rh, main === 0 ? this.poleL : this.poleR);
        // weapon from the SOLVED hand
        w.group.position.copy(this.hand[main]).sub(_a.copy(w.grip).applyQuaternion(_q));
        if (this.supportZ !== null) {
          // off hand on the shaft
          const p = _b.set(0, 0, this.supportZ).applyQuaternion(_q).add(w.group.position);
          this.cur.lh.lerp(p, 1 - Math.exp(-30 * dt));
        }
        const off = 1 - main;
        this.solveArm(off, off === 0 ? this.cur.lh : this.cur.rh, off === 0 ? this.poleL : this.poleR);
      }
      if (w.bow) {
        this.setString(w.bow, w.bow.tipZ);
        w.bow.arrow.visible = false;
      }
    }

    if (w.sling) {
      const ang = this.spin;
      const r = s.drawing ? 0.2 + 0.32 * Math.min(1, s.drawP * 2) : 0.0;
      const hang = s.drawing ? 0.0 : -0.3;
      w.sling.pouch.position.set(Math.cos(ang) * r, hang, Math.sin(ang) * r);
      const c = w.sling.cords.geometry.attributes.position as THREE.BufferAttribute;
      c.setXYZ(0, 0, 0, 0);
      c.setXYZ(1, w.sling.pouch.position.x, w.sling.pouch.position.y, w.sling.pouch.position.z);
      c.setXYZ(2, 0.02, 0, 0);
      c.needsUpdate = true;
    }
  }

  /** Bow string: two thin cylinders from the limb tips to the nock (bow space). */
  private setString(bow: NonNullable<Model['bow']>, nockZ: number) {
    for (let i = 0; i < 2; i++) {
      const s = bow.strings[i];
      const tipY = i === 0 ? bow.half : -bow.half;
      _a.set(0, tipY, bow.tipZ);
      _b.set(0, 0, nockZ).sub(_a);
      const len = _b.length();
      s.position.copy(_a);
      s.quaternion.setFromUnitVectors(UP, _b.multiplyScalar(1 / (len || 1)));
      s.scale.set(1, len, 1);
    }
  }

  /** Two-bone arm IK. The shoulder protracts a little toward far targets. Writes the solved hand to `this.hand[i]`. */
  private solveArm(i: number, target: THREE.Vector3, pole: THREE.Vector3) {
    const sh = _d.copy(this.shoulder[i]);
    const dir = _a.copy(target).sub(sh);
    let dist = dir.length();
    dir.multiplyScalar(1 / (dist || 1));
    const protr = Math.min(ARM.protract, Math.max(0, dist - REACH + 0.02));
    sh.addScaledVector(dir, protr);
    dist = Math.min(dist - protr, REACH - 0.003);
    const up = ARM.upper;
    const fo = ARM.fore;
    const along = (up * up - fo * fo + dist * dist) / (2 * dist || 1);
    const h = Math.sqrt(Math.max(0, up * up - along * along));
    const perp = _b.copy(pole).addScaledVector(dir, -pole.dot(dir));
    if (perp.lengthSq() < 1e-6) perp.set(0, -1, 0);
    perp.normalize();
    const elbow = _c.copy(sh).addScaledVector(dir, along).addScaledVector(perp, h);
    const hand = this.hand[i].copy(sh).addScaledVector(dir, dist);
    this.upperArm[i].position.copy(sh);
    this.upperArm[i].quaternion.setFromUnitVectors(DOWN, _b.copy(elbow).sub(sh).normalize());
    this.foreArm[i].position.copy(elbow);
    this.foreArm[i].quaternion.setFromUnitVectors(DOWN, _b.copy(hand).sub(elbow).normalize());
    this.hands[i].position.copy(hand);
    this.hands[i].quaternion.copy(this.foreArm[i].quaternion);
  }
}
