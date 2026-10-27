import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PLAYER, NOISE } from '../data/balance';
import { weaponById } from '../data/weapons';
import type { Input } from '../game/Input';
import type { CameraRig } from './CameraRig';
import type { World } from '../world/World';
import type { Bank } from '../game/save';
import { HeldRig, HELD_MATERIALS } from './Held';

export interface PlayerStats {
  maxHealth: number;
  maxStamina: number;
  scentMul: number;
}

/** Body proportions (metres, feet at y=0). */
const HIP_Y = 0.92;
const HIP_X = 0.11;
const THIGH = 0.45;
const SHIN = 0.43;
const ANKLE = 0.08; // ankle height above the sole
const NECK_Y = 1.53;
const ROLL_PIVOT = 0.62;

const TAU = Math.PI * 2;
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const smooth = (x: number) => {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};
const easeInOutCubic = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
/** Frame-rate independent exponential approach factor. */
const damp = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);
const wrap = (a: number) => {
  a %= TAU;
  if (a > Math.PI) a -= TAU;
  if (a < -Math.PI) a += TAU;
  return a;
};

// scratch (no allocations per frame)
const _dir = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _prev = new THREE.Vector3();

/** One leg: thigh group at the hip, shin group at the knee, boot at the ankle. */
interface Leg {
  thigh: THREE.Group;
  shin: THREE.Group;
  boot: THREE.Object3D;
  side: number; // +1 left, -1 right
  /** Foot target in lower-body space (y = ankle height, z forward). */
  ty: number;
  tz: number;
}

/** Damped spring on a scalar: x'' = -w²(x - target) - 2ζw x'. */
class Spring {
  x = 0;
  v = 0;
  constructor(
    public w: number,
    public z: number,
  ) {}
  step(target: number, dt: number) {
    // semi-implicit Euler, substepped for stability at low frame rates
    const n = dt > 1 / 50 ? 2 : 1;
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      this.v += (-this.w * this.w * (this.x - target) - 2 * this.z * this.w * this.v) * h;
      this.x += this.v * h;
    }
    return this.x;
  }
}

export class Player {
  readonly group = new THREE.Group();
  readonly pos = new THREE.Vector3();
  /** Horizontal velocity (m/s, world). */
  readonly vel = new THREE.Vector3();
  heading = Math.PI;
  hp: number;
  stamina: number;
  /** Ammo left per weapon id (melee weapons have none). */
  ammo: Record<string, number> = {};
  weaponId = 'jagtbue';
  carried: Bank;
  startMeat: number;
  aiming = false;
  /** True while the use button is held on a bow, throwing weapon, sling, trap or bait. */
  drawing = false;
  /** 0..1 how far the draw has come. */
  drawP = 0;
  drawT = 0;
  moving = false;
  sprinting = false;
  exhausted = false;
  dead = false;
  killedBy = '';
  /** Metres at which animals can hear the hunter right now. */
  noise = 0;
  invulnerable = 0;
  hurtFlash = 0;
  /** Reload time left after the last release or swing. */
  shotCooldown = 0;
  /** Height above the ground while jumping. */
  air = 0;
  grounded = true;
  /** Seconds of stagger left after a hit (no drawing, half speed). */
  stagger = 0;
  /** World direction (unit, xz) the last hit pushed the hunter: away from the attacker. */
  readonly hitDir = new THREE.Vector3(0, 0, 1);
  /** Downward speed (m/s) of the last landing. */
  landImpact = 0;
  readonly held: HeldRig;
  private vy = 0;
  private burst = 0;
  private regenDelay = 0;
  private rollT = 0;
  private rollDir = new THREE.Vector3();
  private rollKeepFacing = false;
  private sinceGround = 0;
  private jumpBuffer = 0;
  private kb = new THREE.Vector3();
  private camPitch = 0;
  private fullDrawT = 0;
  private time = 0;
  // gait
  private phase = 0;
  private lowerYaw = 0;
  private yawRate = 0;
  private bank = 0;
  private accelLean = 0;
  private sprintLean = 0;
  private prevHeading = Math.PI;
  // springs
  private squash = new Spring(18, 0.5);
  private dip = new Spring(16, 0.7);
  private flinchX = new Spring(14, 0.35);
  private flinchZ = new Spring(14, 0.35);
  private capeMid = [new Spring(14, 0.4), new Spring(14, 0.4)];
  private capeHem = [new Spring(9, 0.35), new Spring(9, 0.35)];
  private headYaw = 0;
  private headPitch = 0;
  // death
  private deathT = 0;
  private toppleA = 0;
  private toppleV = 0;
  private toppleBounced = false;
  private fallLocal = new THREE.Vector3(0, 0, -1);
  // model
  /** Feet origin; topples on death. */
  private body = new THREE.Group();
  private rollPivot = new THREE.Group();
  private inner = new THREE.Group();
  private lower = new THREE.Group();
  private upper = new THREE.Group();
  private head = new THREE.Group();
  private torsoMesh!: THREE.Object3D;
  private legs: Leg[] = [];
  private cape!: THREE.Mesh;
  private capeBase!: Float32Array;
  private mats: THREE.MeshStandardMaterial[] = [];
  private fade = 1;
  private world?: World;
  private lastUpdateAt = 0;
  private selfStepAt = 0;
  private weaponShown = '';
  onRoll: () => void = () => {};
  onHurt: (amount: number) => void = () => {};
  onJump: () => void = () => {};
  /** `impact` is the downward speed at touchdown (m/s). */
  onLand: (impact: number) => void = () => {};

  constructor(
    readonly stats: PlayerStats,
    meatPack: number,
  ) {
    this.hp = stats.maxHealth;
    this.stamina = stats.maxStamina;
    this.carried = { meat: meatPack, shards: 0, trophies: 0 };
    this.startMeat = meatPack;
    this.held = this.buildModel();
    this.group.add(this.body);
  }

  get rolling(): boolean {
    return this.rollT > 0;
  }
  get isInvulnerable(): boolean {
    return this.invulnerable > 0;
  }
  /** Where shots leave the hunter (rough). Prefer `muzzle()`. */
  get chest(): THREE.Vector3 {
    return new THREE.Vector3(this.pos.x, this.pos.y + 1.4, this.pos.z);
  }

  /**
   * World position where a projectile leaves the weapon: the bow's arrow rest, or for throws and the sling the
   * release point in front of the shoulder along the aim.
   */
  muzzle(out: THREE.Vector3): THREE.Vector3 {
    this.group.updateMatrixWorld(true);
    const w = weaponById(this.weaponId);
    if (w.family === 1) return this.held.muzzleWorld(out);
    const p = this.camPitch;
    out.set(-0.14, 1.46 + Math.sin(p) * 0.5, Math.cos(p) * 0.5);
    return this.group.localToWorld(out);
  }

  // ------------------------------------------------------------------ model

  private buildModel(): HeldRig {
    const cloth = clothTexture();
    // Two materials for the whole hunter (vertex colours): solid, and double-sided cloth.
    const solid = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.92, map: cloth });
    const sheet = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.95, map: cloth, side: THREE.DoubleSide });
    this.mats.push(solid, sheet);
    for (const m of this.mats) {
      m.emissive.setHex(0x9a1010);
      m.emissiveIntensity = 0;
    }
    const C = {
      cloak: 0x6f8445,
      cloakDark: 0x4f5e34,
      hood: 0x4a5632,
      leather: 0x5a3d26,
      leatherDark: 0x34241a,
      skin: 0xc29274,
      trousers: 0x6d5e45,
      fur: 0xa8987a,
      scarf: 0x7c3526,
      eye: 0x16110d,
      shaft: 0xcdb98e,
      fletch: 0xa8342a,
      brass: 0xb08a40,
    };
    /** Geometry with a flat vertex colour, transformed. */
    const part = (geo: THREE.BufferGeometry, color: number, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
      const g = geo;
      g.scale(sx, sy, sz);
      if (rx || ry || rz) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)));
      g.translate(x, y, z);
      const col = new THREE.Color(color);
      const n = g.attributes.position.count;
      const arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        arr[i * 3] = col.r;
        arr[i * 3 + 1] = col.g;
        arr[i * 3 + 2] = col.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
      return g;
    };
    const merged = (parts: THREE.BufferGeometry[], mat: THREE.Material, parent: THREE.Object3D, shadow = true) => {
      const geo = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)));
      for (const p of parts) p.dispose();
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = shadow;
      parent.add(m);
      return m;
    };

    // hierarchy: body (feet) → rollPivot → inner → lower (legs) / upper (torso, head, arms, cape)
    this.body.add(this.rollPivot);
    this.rollPivot.position.y = ROLL_PIVOT;
    this.rollPivot.add(this.inner);
    this.inner.position.y = -ROLL_PIVOT;
    this.inner.add(this.lower, this.upper);
    this.lower.position.y = HIP_Y;
    this.upper.position.y = HIP_Y;
    this.upper.rotation.order = 'YXZ';
    const lowerC = new THREE.Group();
    lowerC.position.y = -HIP_Y;
    this.lower.add(lowerC);
    const upperC = new THREE.Group();
    upperC.position.y = -HIP_Y;
    this.upper.add(upperC);

    // ---- torso (torso space = body space while the torso is unrotated) ----
    const torsoProfile = [
      [0.0, 0.9],
      [0.215, 0.9],
      [0.225, 0.98],
      [0.195, 1.07],
      [0.215, 1.18],
      [0.24, 1.3],
      [0.235, 1.4],
      [0.19, 1.47],
      [0.09, 1.53],
      [0.0, 1.55],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const solidParts: THREE.BufferGeometry[] = [
      part(new THREE.LatheGeometry(torsoProfile, 14), C.cloak, 0, 0, 0, 0, 0, 0, 1, 1, 0.74),
      // shoulders
      part(new THREE.SphereGeometry(1, 10, 8), C.cloak, 0.2, 1.41, 0, 0, 0, 0, 0.11, 0.09, 0.1),
      part(new THREE.SphereGeometry(1, 10, 8), C.cloak, -0.2, 1.41, 0, 0, 0, 0, 0.11, 0.09, 0.1),
      // neck
      part(new THREE.CylinderGeometry(0.06, 0.07, 0.12, 8), C.skin, 0, 1.56, 0.0),
      // belt, buckle, pouches, knife sheath
      part(new THREE.CylinderGeometry(0.232, 0.232, 0.07, 14), C.leather, 0, 0.98, 0, 0, 0, 0, 1, 1, 0.76),
      part(new THREE.BoxGeometry(0.07, 0.06, 0.02), C.brass, 0, 0.98, 0.178),
      part(new THREE.BoxGeometry(0.13, 0.15, 0.08), C.leatherDark, 0.2, 0.93, 0.1, 0, 0.5, 0),
      part(new THREE.BoxGeometry(0.12, 0.14, 0.08), C.leatherDark, -0.17, 0.93, -0.14, 0, 0.6, 0),
      part(new THREE.BoxGeometry(0.04, 0.2, 0.05), C.leatherDark, -0.22, 0.88, 0.08, 0.1, 0, 0),
      // quiver on the back, tilted so the arrows come up over the right shoulder, clear of the head
      part(new THREE.CylinderGeometry(0.06, 0.05, 0.5, 8), C.leather, -0.15, 1.2, -0.26, 0, 0, 0.35),
      part(new THREE.CylinderGeometry(0.064, 0.064, 0.04, 8), C.leatherDark, -0.235, 1.43, -0.26, 0, 0, 0.35),
    ];
    for (let i = 0; i < 4; i++) {
      const ox = (i - 1.5) * 0.022;
      const oz = (i % 2 ? 1 : -1) * 0.015;
      // shafts sticking out 0.16 above the quiver mouth, along its tilt
      const t = 0.08 + 0.02 * (i % 2);
      const bx = -0.235 - Math.sin(0.35) * t + ox;
      const by = 1.43 + Math.cos(0.35) * t;
      solidParts.push(part(new THREE.CylinderGeometry(0.006, 0.006, 0.18, 4), C.shaft, bx, by, -0.26 + oz, 0, 0, 0.35));
      const fx = -0.235 - Math.sin(0.35) * (t + 0.06) + ox;
      const fy = 1.43 + Math.cos(0.35) * (t + 0.06);
      solidParts.push(part(new THREE.BoxGeometry(0.004, 0.06, 0.035), C.fletch, fx, fy, -0.26 + oz, 0, 0, 0.35));
    }
    // torso breathes about the hips
    const breathe = new THREE.Group();
    this.upper.add(breathe);
    const breatheC = new THREE.Group();
    breatheC.position.y = -HIP_Y;
    breathe.add(breatheC);
    merged(solidParts, solid, breatheC);
    this.torsoMesh = breathe;
    // Fallback: if the game stops calling update() once the hunter is dead, the death fall still plays
    // (stepped from the render callback of one torso mesh, at most once per frame).
    const torso = breatheC.children[0] as THREE.Mesh;
    torso.onBeforeRender = () => {
      if (!this.dead || !this.world) return;
      const now = performance.now();
      if (now - this.lastUpdateAt < 100 || now - this.selfStepAt < 8) return;
      const dt = Math.min(0.05, this.selfStepAt ? (now - this.selfStepAt) / 1000 : 1 / 60);
      this.selfStepAt = now;
      this.updateDead(dt, this.world);
    };
    // coat skirt split at the front, fur mantle, hood cowl (double-sided)
    merged(
      [
        part(new THREE.CylinderGeometry(0.235, 0.34, 0.42, 14, 2, true, 0.32, TAU - 0.64), C.cloakDark, 0, 0.78, 0, 0, 0, 0, 1, 1, 0.8),
        part(new THREE.CylinderGeometry(0.14, 0.29, 0.17, 14, 1, true), C.fur, 0, 1.46, -0.005, 0, 0, 0, 1, 1, 0.82),
        part(new THREE.CylinderGeometry(0.16, 0.2, 0.16, 12, 1, true, Math.PI * 0.62, Math.PI * 0.76), C.hood, 0, 1.58, -0.02),
      ],
      sheet,
      upperC,
    );

    // ---- head: pivots at the neck ----
    this.head.position.set(0, NECK_Y, 0);
    upperC.add(this.head);
    const hy = 1.7 - NECK_Y;
    const hoodOpen = 1.9; // radians of the face opening
    merged(
      [
        part(new THREE.SphereGeometry(0.122, 14, 12), C.skin, 0, hy, 0.01, 0, 0, 0, 1, 1.08, 1),
        part(new THREE.SphereGeometry(0.02, 6, 5), C.skin, 0, hy - 0.005, 0.13),
        part(new THREE.SphereGeometry(0.016, 6, 5), C.eye, 0.045, hy + 0.025, 0.112),
        part(new THREE.SphereGeometry(0.016, 6, 5), C.eye, -0.045, hy + 0.025, 0.112),
        // brows
        part(new THREE.BoxGeometry(0.05, 0.012, 0.02), C.leatherDark, 0.045, hy + 0.05, 0.112, 0, 0, -0.12),
        part(new THREE.BoxGeometry(0.05, 0.012, 0.02), C.leatherDark, -0.045, hy + 0.05, 0.112, 0, 0, 0.12),
        // face cloth over the lower face
        part(new THREE.SphereGeometry(0.132, 14, 8, Math.PI * 0.08, Math.PI * 0.84, Math.PI * 0.56, Math.PI * 0.36), C.scarf, 0, hy, 0.012),
        // scarf knot at the throat
        part(new THREE.TorusGeometry(0.1, 0.035, 6, 12), C.scarf, 0, 1.5 - NECK_Y, 0.01, Math.PI / 2, 0, 0, 1, 1, 0.8),
      ],
      solid,
      this.head,
    );
    merged(
      [
        // hood: a sphere open at the front, pulled down at the back
        part(new THREE.SphereGeometry(0.162, 16, 12, Math.PI / 2 + hoodOpen / 2, TAU - hoodOpen, 0, Math.PI * 0.72), C.hood, 0, hy + 0.01, -0.005, 0, 0, 0, 1, 1.06, 1.08),
      ],
      sheet,
      this.head,
    );

    // ---- cape hanging from the shoulders (spring driven) ----
    const capeGeo = part(new THREE.PlaneGeometry(0.46, 0.72, 1, 4), C.cloakDark);
    this.cape = new THREE.Mesh(capeGeo, sheet);
    this.cape.position.set(0, 1.44 - 0.36, -0.2);
    this.cape.castShadow = true;
    this.capeBase = Float32Array.from(capeGeo.attributes.position.array as Float32Array);
    upperC.add(this.cape);

    // ---- legs: thigh → knee → shin → ankle → boot ----
    for (const side of [1, -1]) {
      const thigh = new THREE.Group();
      thigh.position.set(side * HIP_X, HIP_Y, 0);
      const shin = new THREE.Group();
      shin.position.y = -THIGH;
      thigh.add(shin);
      const boot = new THREE.Group();
      boot.position.y = -SHIN;
      shin.add(boot);
      merged([part(new THREE.CapsuleGeometry(0.088, THIGH - 0.1, 4, 10), C.trousers, 0, -THIGH / 2, 0)], solid, thigh);
      merged(
        [
          part(new THREE.CapsuleGeometry(0.072, SHIN - 0.12, 4, 10), C.trousers, 0, -SHIN / 2 + 0.02, 0),
          part(new THREE.CylinderGeometry(0.092, 0.09, 0.07, 10), C.fur, 0, -SHIN + 0.14, 0),
        ],
        solid,
        shin,
      );
      // boot: shaft + foot with a rounded toe; sole at -ANKLE
      merged(
        [
          part(new THREE.CylinderGeometry(0.08, 0.075, 0.14, 10), C.leatherDark, 0, 0.03, 0),
          part(new THREE.BoxGeometry(0.115, 0.08, 0.2), C.leatherDark, 0, -ANKLE + 0.04, 0.04),
          part(new THREE.SphereGeometry(0.058, 8, 6, 0, TAU, 0, Math.PI / 2), C.leatherDark, 0, -ANKLE, 0.13, 0, 0, 0, 1, 1.25, 1.2),
          part(new THREE.BoxGeometry(0.12, 0.02, 0.27), C.leather, 0, -ANKLE + 0.01, 0.055),
        ],
        solid,
        boot,
      );
      lowerC.add(thigh);
      this.legs.push({ thigh, shin, boot, side, ty: ANKLE, tz: 0 });
    }

    // arms (sleeve / glove / skin colours)
    const sleeve = new THREE.MeshStandardMaterial({ color: C.cloak, roughness: 0.95, map: cloth });
    const glove = new THREE.MeshStandardMaterial({ color: C.leather, roughness: 0.9 });
    const skin = new THREE.MeshStandardMaterial({ color: C.leatherDark, roughness: 0.85 });
    for (const m of [sleeve, glove, skin]) {
      m.emissive.setHex(0x9a1010);
      m.emissiveIntensity = 0;
      this.mats.push(m);
    }
    const rig = new HeldRig(sleeve, skin, glove);
    upperC.add(rig.group);
    rig.setWeapon(weaponById(this.weaponId));
    this.weaponShown = this.weaponId;
    return rig;
  }

  // ------------------------------------------------------------------ update

  update(dt: number, input: Input, cam: CameraRig, world: World) {
    this.time += dt;
    this.world = world;
    this.lastUpdateAt = performance.now();
    if (this.dead) {
      this.updateDead(dt, world);
      return;
    }
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);
    this.shotCooldown = Math.max(0, this.shotCooldown - dt);
    this.stagger = Math.max(0, this.stagger - dt);
    this.burst = Math.max(0, this.burst - dt * (NOISE.shot / NOISE.shotDecay));
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    this.camPitch = cam.pitch;
    if (this.stagger > 0) this.drawing = false;

    const iz = (input.held('KeyW') ? 1 : 0) - (input.held('KeyS') ? 1 : 0);
    const ix = (input.held('KeyD') ? 1 : 0) - (input.held('KeyA') ? 1 : 0);
    const dir = _dir.set(0, 0, 0);
    if (ix || iz) {
      const sh = Math.sin(cam.heading);
      const ch = Math.cos(cam.heading);
      dir.set(sh * iz - ch * ix, 0, ch * iz + sh * ix).normalize();
    }
    this.moving = ix !== 0 || iz !== 0;
    this.aiming = input.right && !this.rolling;

    // dodge roll: Ctrl (C works too, since browsers keep Ctrl+W for themselves)
    const rollKey = input.was('ControlLeft') || input.was('ControlRight') || input.was('KeyC');
    if (rollKey && !this.rolling && this.stamina >= PLAYER.rollCost && this.grounded) {
      this.stamina -= PLAYER.rollCost;
      this.regenDelay = PLAYER.staminaRegenDelay;
      this.rollT = PLAYER.rollTime;
      this.invulnerable = Math.max(this.invulnerable, PLAYER.rollInvulnerable);
      if (this.moving) this.rollDir.copy(dir);
      else this.rollDir.set(Math.sin(cam.heading), 0, Math.cos(cam.heading));
      // aiming or drawing: keep facing the target and roll sideways/backwards
      this.rollKeepFacing = this.aiming || this.drawing;
      this.drawing = false;
      cam.punch(PLAYER.rollFovPunch);
      this.onRoll();
    }

    // jump: buffered input, coyote time
    if (input.was('Space')) this.jumpBuffer = PLAYER.jumpBuffer;
    if (this.grounded) this.sinceGround = 0;
    else this.sinceGround += dt;
    if (this.jumpBuffer > 0 && this.sinceGround <= PLAYER.coyoteTime && this.vy <= 0 && !this.rolling && this.stamina >= PLAYER.jumpCost) {
      this.jumpBuffer = 0;
      this.vy = PLAYER.jumpSpeed;
      this.grounded = false;
      this.sinceGround = PLAYER.coyoteTime + 1;
      this.stamina -= PLAYER.jumpCost;
      this.regenDelay = Math.max(this.regenDelay, 0.5);
      // take-off squash, the spring then stretches
      this.squash.x = -0.07;
      this.squash.v = 2.5;
      this.onJump();
    }
    if (!this.grounded) {
      this.vy -= PLAYER.gravity * (this.vy < 0 ? PLAYER.fallGravityMul : 1) * dt;
      this.air += this.vy * dt;
      if (this.air <= 0) {
        const impact = -this.vy;
        this.air = 0;
        this.vy = 0;
        this.grounded = true;
        this.landImpact = impact;
        this.burst = Math.max(this.burst, 9);
        this.squash.v -= impact * 0.11;
        this.dip.v -= impact * 0.06;
        cam.bump(-impact * 0.09);
        this.onLand(impact);
      }
    }

    const wantsSprint = input.held('ShiftLeft') || input.held('ShiftRight');
    if (this.stamina <= 0) this.exhausted = true;
    if (this.stamina > PLAYER.exhaustedUntil) this.exhausted = false;
    this.sprinting = wantsSprint && this.moving && !this.exhausted && !this.aiming && !this.rolling && !this.drawing && this.stagger <= 0;
    cam.sprint = this.sprinting;

    // ---- velocity with acceleration ----
    _prev.copy(this.vel);
    if (this.rolling) {
      this.rollT -= dt;
      const k = Math.max(0, this.rollT / PLAYER.rollTime);
      const speed = PLAYER.rollSpeed * (0.45 + 0.55 * k);
      this.vel.set(this.rollDir.x * speed, 0, this.rollDir.z * speed);
      if (this.rollT <= 0) this.rollT = 0;
    } else {
      let speed = 0;
      if (this.moving) speed = this.aiming ? PLAYER.aimSpeed : this.drawing ? PLAYER.drawSpeed : this.sprinting ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
      if (this.stagger > 0) speed *= 0.5;
      const tx = dir.x * speed;
      const tz = dir.z * speed;
      const cur = Math.hypot(this.vel.x, this.vel.z);
      const rate = !this.grounded ? PLAYER.airAccel : speed > cur ? PLAYER.accel : PLAYER.decel;
      const a = damp(rate, dt);
      this.vel.x += (tx - this.vel.x) * a;
      this.vel.z += (tz - this.vel.z) * a;
    }
    if (this.sprinting) {
      this.stamina = Math.max(0, this.stamina - PLAYER.sprintDrain * dt);
      this.regenDelay = PLAYER.staminaRegenDelay;
    } else if (this.regenDelay > 0) {
      this.regenDelay -= dt;
    } else {
      this.stamina = Math.min(this.stats.maxStamina, this.stamina + PLAYER.staminaRegen * dt);
    }

    this.integrate(dt, world);

    // facing: towards the aim when aiming, drawing or just after a shot, otherwise the way we walk
    if (this.rolling) {
      if (!this.rollKeepFacing) this.heading += wrap(Math.atan2(this.rollDir.x, this.rollDir.z) - this.heading) * damp(25, dt);
    } else {
      let target = this.heading;
      const facingAim = this.aiming || this.drawing || this.shotCooldown > 0.25 || this.held.swinging;
      if (facingAim) target = cam.heading;
      else if (this.moving) target = Math.atan2(dir.x, dir.z);
      this.heading += wrap(target - this.heading) * damp(facingAim ? 18 : 11, dt);
    }

    const base = this.rolling ? NOISE.roll : this.sprinting ? NOISE.sprint : this.moving ? NOISE.walk * (this.aiming || this.drawing ? 0.5 : 1) : 0;
    this.noise = Math.max(base, this.burst);

    // fatigue tremble at full draw
    this.fullDrawT = this.drawing && this.drawP >= 1 ? this.fullDrawT + dt : 0;

    this.animate(dt, cam, world);
  }

  /** Move by velocity + knockback, collide, and keep the velocity honest when we hit something. */
  private integrate(dt: number, world: World) {
    const kbDecay = Math.exp(-PLAYER.knockbackDecay * dt);
    this.kb.multiplyScalar(kbDecay);
    const mx = (this.vel.x + this.kb.x) * dt;
    const mz = (this.vel.z + this.kb.z) * dt;
    const px = this.pos.x;
    const pz = this.pos.z;
    this.pos.x += mx;
    this.pos.z += mz;
    world.collide(this.pos, PLAYER.radius, this.air + 0.15);
    const cx = this.pos.x - (px + mx);
    const cz = this.pos.z - (pz + mz);
    if (dt > 0 && cx * cx + cz * cz > 1e-8) {
      // remove the velocity going into the obstacle
      const n = Math.hypot(cx, cz);
      const nx = cx / n;
      const nz = cz / n;
      const into = this.vel.x * nx + this.vel.z * nz;
      if (into < 0) {
        this.vel.x -= into * nx;
        this.vel.z -= into * nz;
      }
      const kin = this.kb.x * nx + this.kb.z * nz;
      if (kin < 0) {
        this.kb.x -= kin * nx;
        this.kb.z -= kin * nz;
      }
    }
    this.pos.y = world.height(this.pos.x, this.pos.z) + this.air;
  }

  /** Call when a shot, throw or swing makes noise. */
  fired(noise: number) {
    this.burst = Math.max(this.burst, noise);
  }

  // ------------------------------------------------------------------ animation

  private animate(dt: number, cam: CameraRig, world: World) {
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.heading;
    const h = this.heading;
    const sh = Math.sin(h);
    const ch = Math.cos(h);
    // velocity in body space (+z forward, +x left)
    const lz = this.vel.x * sh + this.vel.z * ch;
    const lx = this.vel.x * ch - this.vel.z * sh;
    const spd = Math.hypot(lx, lz);

    // turn rate and lean into turns / acceleration
    const yr = dt > 0 ? wrap(h - this.prevHeading) / dt : 0;
    this.prevHeading = h;
    this.yawRate += (yr - this.yawRate) * damp(12, dt);
    const bankT = this.grounded && !this.rolling ? -clamp(this.yawRate * spd * 0.02, -0.18, 0.18) : 0;
    this.bank += (bankT - this.bank) * damp(10, dt);
    if (dt > 0) {
      const dvF = ((this.vel.x - _prev.x) * sh + (this.vel.z - _prev.z) * ch) / dt;
      const al = this.rolling || !this.grounded ? 0 : clamp(0.012 * dvF, -0.15, 0.15);
      this.accelLean += (al - this.accelLean) * damp(10, dt);
    }
    this.sprintLean += ((this.sprinting ? 0.2 : 0) - this.sprintLean) * damp(8, dt);

    // weapon
    if (this.weaponShown !== this.weaponId) {
      this.weaponShown = this.weaponId;
      this.held.setWeapon(weaponById(this.weaponId));
    }
    const w = weaponById(this.weaponId);

    // ---- gait ----
    const cycle = PLAYER.strideBase + PLAYER.stridePerSpeed * spd; // metres per full gait cycle
    if (this.grounded && !this.rolling) this.phase = (this.phase + (dt * spd) / cycle) % 1;
    const gw = this.grounded && !this.rolling ? smooth(spd / 1.2) : 0;
    const moveAng = Math.atan2(lx, lz);
    const backward = spd > 0.3 && Math.abs(moveAng) > 1.95;
    const legAng = backward ? wrap(moveAng - Math.PI) : moveAng;
    const lowerT = spd > 0.3 && !this.rolling ? clamp(legAng, -1.2, 1.2) * gw : 0;
    this.lowerYaw += (lowerT - this.lowerYaw) * damp(10, dt);
    this.lower.rotation.y = this.lowerYaw;
    const sgn = backward ? -1 : 1;
    const hipDrop = 0.05 * Math.min(1, spd / 4) + 0.03 * clamp((spd - 4.5) / 3, 0, 1);
    const bobAmp = (0.015 + 0.004 * spd) * gw;
    const vert = HIP_Y - hipDrop - ANKLE + bobAmp;
    const legLen = (THIGH + SHIN) * 0.985;
    const halfMax = Math.sqrt(Math.max(0, legLen * legLen - vert * vert));
    const duty0 = 0.62 - 0.3 * clamp((spd - 1.5) / 6, 0, 1);
    const S = Math.min(duty0 * cycle, 2 * halfMax);
    const duty = clamp(S / cycle, 0.18, 0.7);
    const lift = Math.min(0.26, 0.09 + 0.028 * spd);
    // lowest at mid-stance, highest in the flight/passing phase
    const bob = -bobAmp * Math.cos((this.phase - duty / 2) * TAU * 2);

    // drive from the weapon move
    const tremble = clamp((this.fullDrawT - 1.2) / 1.5, 0, 1);
    const armSwing = Math.cos(this.phase * TAU) * gw * sgn;
    const drive = this.held.plan(dt, {
      drawing: this.drawing,
      drawP: this.drawP,
      aiming: this.aiming,
      walk: armSwing,
      sprinting: this.sprinting,
      rolling: this.rolling,
      cooldown: this.shotCooldown,
      ammo: w.ammo > 0 ? (this.ammo[w.id] ?? 0) : null,
      pitch: cam.pitch,
      tremble,
    });

    // ---- springs: squash/stretch, landing dip, flinch ----
    const stretchT = this.grounded ? 0 : clamp(this.vy * 0.012, -0.04, 0.06);
    const sq = this.squash.step(stretchT, dt);
    const dip = this.dip.step(0, dt);
    const fx = this.flinchX.step(0, dt);
    const fz = this.flinchZ.step(0, dt);

    // ---- body placement ----
    const roll = this.rolling ? 1 - this.rollT / PLAYER.rollTime : -1;
    const tuck = roll >= 0 ? Math.sin(Math.PI * roll) : 0;
    this.body.position.set(0, bob - hipDrop * gw - drive.crouch + dip * 1.0, drive.lunge);
    this.body.rotation.set(0, 0, this.bank);
    this.body.scale.set(1 - sq * 0.5, 1 + sq, 1 - sq * 0.5);
    if (roll >= 0) {
      // rotate about the centre of mass, axis perpendicular to the roll direction in body space
      const rx = this.rollDir.x * ch - this.rollDir.z * sh;
      const rz = this.rollDir.x * sh + this.rollDir.z * ch;
      _axis.set(rz, 0, -rx).normalize();
      this.rollPivot.quaternion.setFromAxisAngle(_axis, TAU * easeInOutCubic(roll));
      this.rollPivot.position.y = ROLL_PIVOT + 0.12 * tuck;
      this.inner.scale.setScalar(1 - 0.12 * tuck);
      this.body.position.y = 0;
    } else {
      this.rollPivot.quaternion.identity();
      this.rollPivot.position.y = ROLL_PIVOT;
      this.inner.scale.setScalar(1);
    }

    // ---- torso: twist, lean, aim pitch share, flinch, gait counter-twist ----
    const aimShare = 0.35 * drive.aim;
    const lookShare = 0.1 * (1 - drive.aim);
    this.upper.rotation.set(
      drive.lean + this.sprintLean + this.accelLean + fx + 0.75 * tuck - (aimShare + lookShare) * cam.pitch,
      drive.twist - 0.07 * Math.sin(this.phase * TAU) * gw * sgn - this.lowerYaw * 0.15,
      fz + 0.04 * Math.sin(this.phase * TAU) * gw,
    );
    // breathing (faster when winded)
    const winded = 1 - this.stamina / this.stats.maxStamina;
    const br = this.time * (1.6 + 2.2 * winded);
    this.torsoMesh.scale.set(1 + 0.006 * Math.sin(br) * (1 + winded), 1 + (0.008 + 0.01 * winded) * Math.sin(br), 1 + 0.012 * Math.sin(br) * (1 + winded));

    this.held.solve(dt, this.upper.quaternion);

    // ---- head looks where the camera looks ----
    const yawT = this.rolling ? 0 : clamp(wrap(cam.heading - h) - drive.twist, -1.2, 1.2);
    const pitchT = this.rolling ? 0.5 * tuck : -clamp(cam.pitch * (1 - aimShare - lookShare) * 0.6, -0.5, 0.6);
    this.headYaw += (yawT - this.headYaw) * damp(8, dt);
    this.headPitch += (pitchT - this.headPitch) * damp(8, dt);
    this.head.rotation.set(this.headPitch, this.headYaw, 0, 'YXZ');

    // ---- legs ----
    const groundY = -this.body.position.y / Math.max(0.5, this.body.scale.y);
    // per-foot terrain offset (slopes)
    for (let i = 0; i < 2; i++) {
      const L = this.legs[i];
      let ty: number;
      let tz: number;
      if (!this.grounded) {
        const t = clamp(0.5 - this.vy * 0.07, 0, 1);
        ty = ANKLE + (i === 0 ? 0.28 : 0.14) * t + 0.04;
        tz = (i === 0 ? 0.16 : -0.1) * (0.5 + t);
      } else {
        const u = (this.phase + (i === 0 ? 0 : 0.5)) % 1;
        let fz: number;
        let fy = 0;
        if (u < duty) {
          fz = S / 2 - (S * u) / duty;
        } else {
          const v = (u - duty) / (1 - duty);
          fz = -S / 2 + S * smooth(v);
          fy = lift * Math.sin(Math.PI * v);
        }
        tz = fz * sgn * gw;
        ty = ANKLE + fy * gw;
        // keep the planted feet planted while the body lunges
        if (drive.lunge > 0.01) tz += i === 0 ? drive.lunge * 0.5 : -drive.lunge;
        // terrain under this foot relative to the root
        const fxL = L.side * HIP_X;
        const cy = Math.cos(this.lowerYaw);
        const sy = Math.sin(this.lowerYaw);
        const bx = fxL * cy + tz * sy;
        const bz = -fxL * sy + tz * cy;
        const wx = this.pos.x + bx * ch + bz * sh;
        const wz = this.pos.z - bx * sh + bz * ch;
        ty += clamp(world.height(wx, wz) - (this.pos.y - this.air), -0.3, 0.3);
        // relaxed stance when standing
        tz += (1 - gw) * (i === 0 ? 0.06 : -0.04);
      }
      ty += groundY;
      if (tuck > 0) {
        ty = ty * (1 - tuck) + (HIP_Y - 0.45) * tuck;
        tz = tz * (1 - tuck) + (i === 0 ? 0.32 : 0.26) * tuck;
      }
      L.ty = ty;
      L.tz = tz;
      this.solveLeg(L, ty, tz, !this.grounded || u0Swing(this.phase, i, duty, gw));
    }

    this.updateCape(dt, lx, lz);
    this.updateMaterials(dt, cam);
  }

  /** Sagittal two-bone leg IK; foot target in lower-body space. */
  private solveLeg(L: Leg, ty: number, tz: number, swinging: boolean) {
    const dy = ty - HIP_Y;
    let D = Math.hypot(dy, tz);
    D = clamp(D, 0.25, THIGH + SHIN - 0.002);
    const phi = Math.atan2(tz, -dy);
    const A = Math.acos(clamp((THIGH * THIGH + D * D - SHIN * SHIN) / (2 * THIGH * D), -1, 1));
    const K = Math.PI - Math.acos(clamp((THIGH * THIGH + SHIN * SHIN - D * D) / (2 * THIGH * SHIN), -1, 1));
    L.thigh.rotation.x = -(phi + A);
    L.shin.rotation.x = K;
    // sole level with the ground in stance, toe a little down in swing
    L.boot.rotation.x = -(L.thigh.rotation.x + K) + (swinging ? 0.25 : 0);
  }

  /** Two-row spring cape: swings back with speed, sideways with strafing, settles with weight. */
  private updateCape(dt: number, lx: number, lz: number) {
    const flap = Math.sin(this.time * 9) * 0.03 * Math.min(1, Math.hypot(lx, lz) / 6);
    const hemZ = -clamp(lz * 0.055, -0.15, 0.45) - (this.grounded ? 0 : this.vy * 0.03) + flap;
    const hemX = clamp(-lx * 0.05, -0.25, 0.25);
    const mz = this.capeMid[0].step(hemZ * 0.45, dt);
    const mx = this.capeMid[1].step(hemX * 0.45, dt);
    const hz = this.capeHem[0].step(hemZ, dt);
    const hx = this.capeHem[1].step(hemX, dt);
    const pos = this.cape.geometry.attributes.position as THREE.BufferAttribute;
    const base = this.capeBase;
    const arr = pos.array as Float32Array;
    for (let i = 0; i < pos.count; i++) {
      const y = base[i * 3 + 1];
      const u = (0.36 - y) / 0.72; // 0 at the shoulders, 1 at the hem
      const b1 = 2 * u * (1 - u);
      const b2 = u * u;
      arr[i * 3] = base[i * 3] + b1 * mx + b2 * hx;
      arr[i * 3 + 2] = -0.14 * u + b1 * mz + b2 * Math.min(hz, 0.25) - 0.02 * Math.abs(base[i * 3]) * u;
    }
    pos.needsUpdate = true;
  }

  /** Hurt flash and the camera-proximity fade. */
  private updateMaterials(dt: number, cam: CameraRig) {
    const e = this.hurtFlash > 0.32 ? (this.hurtFlash - 0.32) / 0.18 : 0;
    const want = clamp((cam.headDist - 0.45) / 0.6, 0, 1);
    this.fade += (want - this.fade) * damp(14, dt);
    if (want === 1 && this.fade > 0.995) this.fade = 1;
    const transparent = this.fade < 1;
    for (const m of this.mats) this.applyMat(m, e * 0.6, transparent);
    for (const m of HELD_MATERIALS) this.applyMat(m as THREE.MeshStandardMaterial, -1, transparent);
    this.group.visible = this.fade > 0.04;
  }

  private applyMat(m: THREE.MeshStandardMaterial, emissive: number, transparent: boolean) {
    if (emissive >= 0) m.emissiveIntensity = emissive;
    if (m.transparent !== transparent) {
      m.transparent = transparent;
      m.depthWrite = !transparent;
      m.needsUpdate = true;
    }
    m.opacity = this.fade;
  }

  // ------------------------------------------------------------------ damage & death

  /**
   * Hurt the hunter. `from` (world position of the attacker) gives the knockback, the flinch and the fall direction.
   * Returns false when the hit did not land (invulnerable or already dead).
   */
  damage(amount: number, by: string, from?: THREE.Vector3): boolean {
    if (this.dead || this.isInvulnerable) return false;
    this.hp -= amount;
    this.invulnerable = 0.35;
    this.hurtFlash = 0.5;
    this.drawing = false;
    // push away from the attacker
    if (from) this.hitDir.set(this.pos.x - from.x, 0, this.pos.z - from.z);
    else this.hitDir.set(-Math.sin(this.heading), 0, -Math.cos(this.heading));
    if (this.hitDir.lengthSq() < 1e-6) this.hitDir.set(-Math.sin(this.heading), 0, -Math.cos(this.heading));
    this.hitDir.normalize();
    const kb = Math.min(PLAYER.knockbackMax, PLAYER.knockbackBase + amount * PLAYER.knockbackPerDamage);
    this.kb.addScaledVector(this.hitDir, kb);
    this.stagger = PLAYER.staggerTime;
    // flinch: the torso tips the way it was pushed
    const sh = Math.sin(this.heading);
    const ch = Math.cos(this.heading);
    const dz = this.hitDir.x * sh + this.hitDir.z * ch;
    const dx = this.hitDir.x * ch - this.hitDir.z * sh;
    const imp = Math.min(6, 2.5 + amount * 0.08);
    this.flinchX.v += dz * imp;
    this.flinchZ.v += -dx * imp;
    this.onHurt(amount);
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      this.killedBy = by;
      this.deathT = 0;
      this.toppleA = 0;
      this.toppleV = 0;
      this.toppleBounced = false;
      this.rollT = 0;
      this.fallLocal.set(dx, 0, dz).normalize();
    }
    return true;
  }

  /** Knees buckle, then the body topples away from the hit (θ'' = g/h·sin θ), bounces once and settles. */
  private updateDead(dt: number, world: World) {
    this.deathT += dt;
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);
    this.vel.multiplyScalar(Math.exp(-6 * dt));
    this.integrate(dt, world);
    this.group.position.copy(this.pos);
    const buckle = smooth(this.deathT / 0.25);
    if (this.deathT > 0.18) {
      if (this.toppleV === 0 && this.toppleA === 0) this.toppleV = 0.7;
      const half = Math.PI / 2;
      if (!this.toppleBounced) {
        this.toppleV += (9.8 / 1.0) * Math.sin(this.toppleA + 0.1) * dt;
        this.toppleA += this.toppleV * dt;
        if (this.toppleA >= half) {
          this.toppleA = half;
          this.toppleV = -0.25 * this.toppleV;
          this.toppleBounced = true;
          this.landImpact = 4;
        }
      } else {
        // settle on the ground (ζ≈0.8)
        const w = 12;
        this.toppleV += (-w * w * (this.toppleA - half) - 2 * 0.8 * w * this.toppleV) * dt;
        this.toppleA = Math.min(half, this.toppleA + this.toppleV * dt);
      }
    }
    const th = this.toppleA;
    _axis.set(this.fallLocal.z, 0, -this.fallLocal.x).normalize();
    this.rollPivot.quaternion.identity();
    this.inner.scale.setScalar(1);
    this.body.scale.set(1, 1, 1);
    this.body.quaternion.setFromAxisAngle(_axis, th);
    const knees = 0.28 * buckle * (1 - smooth(th / 1.2));
    this.body.position.set(0, 0.13 * Math.sin(th) - knees, 0);
    const drive = this.held.plan(dt, { drawing: false, drawP: 0, aiming: false, walk: 0, sprinting: false, rolling: false, cooldown: 1, ammo: null, dead: true });
    this.upper.rotation.set(0.35 * buckle * (1 - th / 1.6) + drive.lean, 0, 0);
    this.held.solve(dt, this.upper.quaternion);
    this.head.rotation.x += (0.3 * buckle - this.head.rotation.x) * damp(6, dt);
    const lying = clamp(th / 1.5, 0, 1);
    for (let i = 0; i < 2; i++) {
      const ty = ANKLE + knees * (1 - lying) + (i === 0 ? 0.05 : 0) * buckle;
      const tz = (i === 0 ? 0.12 : -0.06) * buckle * (1 - lying);
      this.solveLeg(this.legs[i], ty, tz, false);
    }
  }

  heal(amount: number) {
    this.hp = Math.min(this.stats.maxHealth, this.hp + amount);
  }

  /** Free GPU resources of the hunter model. */
  dispose() {
    this.group.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).geometry.dispose();
    });
    for (const m of this.mats) m.dispose();
  }
}

/** Whether foot i is in its swing phase (toe drops a little). */
function u0Swing(phase: number, i: number, duty: number, gw: number): boolean {
  if (gw < 0.3) return false;
  const u = (phase + (i === 0 ? 0 : 0.5)) % 1;
  return u >= duty;
}

export function lerpAngle(a: number, b: number, t: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

let clothTex: THREE.CanvasTexture | null = null;
/** Woven cloth grain, shared by the hunter's clothes. */
function clothTexture(): THREE.CanvasTexture {
  if (clothTex) return clothTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ddd';
  g.fillRect(0, 0, 64, 64);
  for (let y = 0; y < 64; y += 2) {
    for (let x = 0; x < 64; x += 2) {
      const v = 190 + ((x * 7 + y * 13) % 5) * 12 + (((x >> 1) + (y >> 1)) % 2) * 10;
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.fillRect(x, y, 2, 2);
    }
  }
  clothTex = new THREE.CanvasTexture(c);
  clothTex.wrapS = clothTex.wrapT = THREE.RepeatWrapping;
  clothTex.repeat.set(3, 3);
  clothTex.colorSpace = THREE.SRGBColorSpace;
  return clothTex;
}
