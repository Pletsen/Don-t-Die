import * as THREE from 'three';
import { ANIMAL_TUNING as T, type SpeciesDef } from '../data/animals';
import { DIFFICULTY, type DifficultyDef } from '../data/difficulty';
import { PLAYER } from '../data/balance';
import { settings } from '../game/settings';
import type { World } from '../world/World';
import type { Wind } from '../world/Wind';
import type { Player } from '../player/Player';
import type { Blood } from '../fx/Blood';
import { Rng } from '../game/rng';
import { buildAnimalModel, type AnimalModel, type ModelOptions } from './models';
import { GAITS, GaitBlend, legPose, type GaitName, type LegPose } from './gait';

export type AnimalState = 'idle' | 'lured' | 'alert' | 'flee' | 'chase' | 'circle' | 'windup' | 'strike' | 'recover' | 'dead';
export type ImpactKind = 'hit' | 'heavy' | 'kill' | 'thud' | 'roar';
/** Sound/feedback cues an animal asks for (optional for the lead to play). */
export type AnimalCue = 'growl' | 'snort' | 'commit' | 'paw' | 'howl' | 'roar' | 'hurt' | 'fall' | 'flap' | 'yelp' | 'stun' | 'throw' | 'slam';

export interface AnimalContext {
  player: Player;
  wind: Wind;
  world: World;
  scentMul: number;
  time: number;
  onAlert: (a: Animal) => void;
  /** The strike connected. Damage to apply: `a.strikeDamage` (already includes difficulty). */
  onStrike: (a: Animal) => void;
  /** Difficulty multipliers (falls back to the current setting). */
  diff?: DifficultyDef;
  /** Engagement cap: false makes a predator circle at 12-15 m and growl instead of attacking. */
  canEngage?: (a: Animal) => boolean;
  blood?: Blood;
  /** Hit-stop / camera feedback: kill, heavy hit, a body hitting the ground (thud), a roar. */
  onImpact?: (kind: ImpactKind, strength: number, at?: THREE.Vector3) => void;
  onCue?: (a: Animal, cue: AnimalCue) => void;
  /** Used for eyeshine and distance culling; falls back to the player. */
  camera?: THREE.Camera;
}

export interface HitInfo {
  dir?: THREE.Vector3;
  point?: THREE.Vector3;
  /** Melee, trap... only used for feedback strength. */
  kind?: 'projectile' | 'melee' | 'trap' | 'poison';
}

const markerCache: Record<string, THREE.SpriteMaterial> = {};
function marker(kind: '?' | '!'): THREE.SpriteMaterial {
  if (markerCache[kind]) return markerCache[kind];
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.font = 'bold 54px Georgia, serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 6;
  g.strokeStyle = 'rgba(0,0,0,0.85)';
  g.strokeText(kind, 32, 34);
  g.fillStyle = kind === '!' ? '#ff4a3a' : '#ffd34a';
  g.fillText(kind, 32, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return (markerCache[kind] = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, fog: false }));
}

// scratch objects (no allocations in the per-frame paths)
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _d = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _leg: LegPose = { hip: 0, knee: 0, stance: false };
const PROBE = [0, 0.5, -0.5, 1.0, -1.0, 1.6, -1.6];

const wrap = (a: number) => a - Math.round(a / (Math.PI * 2)) * Math.PI * 2;
const damp = (x: number, target: number, rate: number, dt: number) => x + (target - x) * (1 - Math.exp(-rate * dt));
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const approach = (x: number, target: number, step: number) => (x < target ? Math.min(target, x + step) : Math.max(target, x - step));

/** A critically damped-ish angular spring (flinches, wobbles). */
class Spring {
  x = 0;
  v = 0;
  constructor(public w = 14, public z = 0.35) {}
  kick(impulse: number) {
    this.v += impulse * this.w;
  }
  step(dt: number, target = 0) {
    const a = -this.w * this.w * (this.x - target) - 2 * this.z * this.w * this.v;
    this.v += a * dt;
    this.x += this.v * dt;
    return this.x;
  }
}

/** One animal with simple senses (scent along the wind, hearing, a sight cone), a state machine and procedural motion. */
export class Animal {
  readonly group: THREE.Group;
  readonly pos = new THREE.Vector3();
  heading: number;
  hp: number;
  maxHp: number;
  state: AnimalState = 'idle';
  awareness = 0;
  dead = false;
  removable = false;
  /** True if the last hit got the unaware (stealth) damage bonus. */
  lastHitStealth = false;
  /** Damage the current strike deals (difficulty included). Read it in `onStrike`. */
  strikeDamage = 0;
  /** What kind of strike landed (bosses: 'bite', 'charge', 'stomp', ...). */
  strikeKind = 'bite';
  /** Seconds left held by a trap. */
  rooted = 0;
  onDeath: (a: Animal) => void = () => {};
  readonly isBoss: boolean = false;

  readonly model: AnimalModel;
  protected sprite: THREE.Sprite;
  protected rng: Rng;
  protected t = 0;
  protected timer = 0;
  protected fleeTime = 0;
  protected chaseTime = 0;
  protected waypoint = new THREE.Vector3();
  protected hasWaypoint = false;
  protected pause = 0;
  protected strikeT = 0;
  protected lungeDir = new THREE.Vector3();
  protected lungeFrom = new THREE.Vector3();
  protected struck = false;
  protected flash = 0;
  protected corpseT = 0;
  protected stuck = 0;
  protected calm = 0;
  protected poisonDps = 0;
  protected poisonTime = 0;
  protected lureTarget?: THREE.Vector3;
  protected lureTime = 0;
  protected baseEmissive: THREE.Color;
  protected baseEmissiveI: number;
  protected lastCtx?: AnimalContext;
  protected diff: DifficultyDef;

  // ---- locomotion
  /** Current forward speed (m/s). */
  speedNow = 0;
  protected yawRate = 0;
  protected goalHeading = 0;
  protected goalSpeed = 0;
  protected turnMul = 1;
  protected snapSpeed = false; // strike/skid profiles set speed directly
  protected avoid = true;
  protected kb = new THREE.Vector3(); // knockback velocity
  protected moved = 0; // metres travelled (blood trail)
  protected trailAcc = 0;
  protected dripT = 0;
  /** Flying height above the ground (pheasant). */
  alt = 0;
  protected altVel = 0;
  protected flight: 'none' | 'crouch' | 'up' | 'fly' | 'glide' = 'none';
  protected flightDist = 0;
  protected jinkT = 0;
  protected jink = 0;
  protected jinkSlow = 0;
  protected circleDir = 1;
  protected circleR = 13;
  protected growlT = 2;
  protected stalkT = 0;
  protected flank = 0;
  protected pawT = 0;
  protected committed = false;
  protected windupTotal = 0.5;
  protected skid = 0;

  // ---- reactions / wounds
  protected flinchRoll = new Spring(14, 0.35);
  protected flinchPitch = new Spring(14, 0.35);
  protected headJerk = new Spring(16, 0.45);
  protected stagger = 0;
  protected buckle = [0, 0, 0, 0];
  readonly lame = [0, 0, 0, 0];
  bleed = 0;
  protected woundLocal = new THREE.Vector3();
  protected hasWound = false;
  protected stumbleT = 4;
  protected trappedLeg = -1;

  // ---- pose (damped)
  protected gait = new GaitBlend();
  protected gaitName: GaitName = 'walk';
  protected gaitPhase = 0;
  protected pPitch = 0;
  protected pRoll = 0;
  protected pDrop = 0;
  protected pZ = 0;
  protected hPitch = 0;
  protected hYaw = 0;
  protected nPitch = 0;
  protected earX = 0;
  protected earFlick = [0, 0];
  protected earFlickT = 3;
  protected tailX = 0;
  protected tailSpring = new Spring(9, 0.3);
  protected bank = 0;
  protected terrainPitch = 0;
  protected eyeGlow = 0;
  protected far = false;
  protected forcedFar: boolean | null = null;

  // ---- death fall
  protected deathVel = new THREE.Vector3();
  protected deathStart = new THREE.Vector3();
  protected deathSlide = 0; // total slide distance
  protected deathSide = 1;
  protected theta = 0;
  protected thetaV = 0;
  protected bounced = false;
  protected landed = false;
  protected restCentre = new THREE.Vector3();
  protected deathFast = false;
  protected deathMass = 1;

  constructor(readonly def: SpeciesDef, x: number, z: number, world: World, seed: number, modelOpts?: ModelOptions) {
    this.rng = new Rng(seed);
    this.diff = DIFFICULTY[settings.difficulty] ?? DIFFICULTY.normal;
    this.maxHp = def.hp * this.diff.animalHp;
    this.hp = this.maxHp;
    this.heading = this.rng.range(0, Math.PI * 2);
    this.goalHeading = this.heading;
    this.model = buildAnimalModel(def, { variant: this.rng.next(), ...modelOpts });
    this.group = this.model.group;
    this.baseEmissive = this.model.mat.emissive.clone();
    this.baseEmissiveI = this.model.mat.emissiveIntensity;
    this.pos.set(x, world.height(x, z), z);
    this.group.position.copy(this.pos);
    this.group.rotation.set(0, this.heading, 0);
    this.sprite = new THREE.Sprite(marker('?'));
    this.sprite.position.set(0, this.model.top + 0.6, 0);
    this.sprite.scale.set(0.8, 0.8, 1);
    this.sprite.visible = false;
    this.sprite.renderOrder = 20;
    this.group.add(this.sprite);
    this.pause = this.rng.range(0, 3);
    this.circleDir = this.rng.next() < 0.5 ? -1 : 1;
    this.circleR = this.rng.range(T.circleMin, T.circleMax);
    this.flank = this.rng.range(-1, 1);
    this.gaitPhase = this.rng.next();
    this.earFlickT = this.rng.range(1, 5);
  }

  /** Rough mass in kg-like units from the body radius (for knockback, thuds). */
  get mass(): number {
    return 60 * this.def.radius ** 3;
  }

  /** Centre of the body, used for arrow hits and aiming. */
  hitCenter(): THREE.Vector3 {
    return this.hitCenterInto(new THREE.Vector3());
  }

  hitCenterInto(out: THREE.Vector3): THREE.Vector3 {
    const b = this.def.body;
    return out.set(this.pos.x, this.pos.y + this.alt + b.legs + b.height * (b.bird ? 0.5 : 0.65), this.pos.z);
  }

  /** Where loot should land: the body centre on the ground, where the corpse comes to rest. */
  deathPos(): THREE.Vector3 {
    if (!this.dead) return new THREE.Vector3(this.pos.x, this.pos.y, this.pos.z);
    return new THREE.Vector3(this.restCentre.x, this.lastCtx?.world.height(this.restCentre.x, this.restCentre.z) ?? this.restCentre.y, this.restCentre.z);
  }

  /** Is this animal currently attacking (counts against the engagement cap)? */
  get engaged(): boolean {
    return !this.dead && (this.state === 'chase' || this.state === 'windup' || this.state === 'strike' || this.state === 'recover');
  }

  /** Forces the far (hidden, no shadow) state on or off; null returns to self culling by distance. */
  setFar(far: boolean | null) {
    this.forcedFar = far;
  }

  /** The body pivot; stuck projectiles are parented to it. */
  get pose(): THREE.Bone {
    return this.model.pose;
  }

  /**
   * Where a shot along a→b enters the body: the segment against the body ellipsoid (in pose space).
   * Falls back to the closest surface point when the segment only grazes the generous hit sphere. Returns a world point.
   */
  entryPoint(a: THREE.Vector3, b: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
    const pose = this.model.pose;
    pose.updateWorldMatrix(true, false);
    _m.copy(pose.matrixWorld).invert();
    const h = this.model.half;
    _a.copy(a).applyMatrix4(_m).divide(h);
    _b.copy(b).applyMatrix4(_m).divide(h);
    _c.copy(_b).sub(_a);
    const A = _c.lengthSq();
    const B = 2 * _a.dot(_c);
    const C = _a.lengthSq() - 1;
    const disc = B * B - 4 * A * C;
    let t = -1;
    if (A > 1e-9 && disc >= 0) {
      t = (-B - Math.sqrt(disc)) / (2 * A);
      if (t < 0) t = (-B + Math.sqrt(disc)) / (2 * A) < 0 ? -1 : 0;
    }
    if (t >= 0 && t <= 1.5) out.copy(_a).addScaledVector(_c, t);
    else {
      // closest point of the line to the centre, pushed out to the surface
      const s = A > 1e-9 ? clamp(-_a.dot(_c) / A, 0, 1) : 0;
      out.copy(_a).addScaledVector(_c, s);
      if (out.lengthSq() < 1e-6) out.set(0, 1, 0);
      out.normalize();
    }
    out.multiply(h).applyMatrix4(pose.matrixWorld);
    return out;
  }

  // ------------------------------------------------------------------ damage
  /** Returns true if the hit killed the animal. */
  hurt(dmg: number, world: World, from: THREE.Vector3, info?: HitInfo): boolean {
    if (this.dead) return false;
    // stealth: the animal had not noticed you
    this.lastHitStealth = false;
    if ((this.state === 'idle' || this.state === 'lured' || this.state === 'alert') && this.awareness < T.stealthAwareness && info?.kind !== 'trap') {
      dmg *= T.stealthMult;
      this.lastHitStealth = true;
    }
    const point = info?.point ?? this.hitCenterInto(_d);
    dmg *= this.damageMul(point);
    this.hp -= dmg;
    this.flash = 0.22;
    const dir = _a;
    if (info?.dir) dir.copy(info.dir);
    else dir.set(this.pos.x - from.x, 0, this.pos.z - from.z);
    dir.y *= 0.3;
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
    dir.normalize();
    const share = dmg / this.maxHp;
    this.react(dmg, share, dir, point, info?.kind ?? 'projectile', world);
    const ctx = this.lastCtx;
    if (this.hp <= 0) {
      this.die(dir, world);
      return true;
    }
    if (ctx?.onImpact) ctx.onImpact(dmg >= 40 || share >= 0.35 || info?.kind === 'melee' ? 'heavy' : 'hit', Math.min(1, share * 2), point);
    ctx?.onCue?.(this, 'hurt');
    this.awareness = 1;
    this.chaseTime = 0;
    this.calm = 0;
    this.onHurtState();
    return false;
  }

  /** State change when hurt (bosses override). */
  protected onHurtState() {
    if (this.def.role === 'prey') {
      if (this.state !== 'flee') {
        this.state = 'flee';
        this.fleeTime = 0;
      }
    } else if (this.state !== 'windup' && this.state !== 'strike' && this.state !== 'recover') {
      this.state = 'chase';
      this.chaseTime = 0;
    }
  }

  /** Extra damage multiplier by where the hit landed (bosses: weak spots in punish windows). */
  protected damageMul(_point: THREE.Vector3): number {
    return 1;
  }

  /** Knockback, flinch, head jerk, stagger, limp, bleeding and the spurt. */
  protected react(dmg: number, share: number, dir: THREE.Vector3, point: THREE.Vector3, kind: string, world: World) {
    const mass = this.mass * (this.isBoss ? 4 : 1);
    const kbs = clamp((dmg / mass) * 1.2, 0.15, 3);
    if (kind !== 'trap') this.kb.x += dir.x * kbs;
    if (kind !== 'trap') this.kb.z += dir.z * kbs;
    // local hit direction / point (animal space, facing +z)
    const ch = Math.cos(this.heading);
    const sh = Math.sin(this.heading);
    const lx = dir.x * ch - dir.z * sh;
    const lz = dir.x * sh + dir.z * ch;
    const imp = Math.min(0.4, (0.02 * dmg) / Math.max(0.3, mass / 30)) * (this.isBoss ? 0.3 : 1);
    this.flinchRoll.kick(-lx * imp);
    this.flinchPitch.kick(lz * imp * 0.6);
    // where on the body: pose space
    const pose = this.model.pose;
    pose.updateWorldMatrix(true, false);
    _b.copy(point);
    _m.copy(pose.matrixWorld).invert();
    _b.applyMatrix4(_m);
    this.headJerk.kick(clamp(_b.x, -1, 1) > 0 ? 0.3 : -0.3);
    if (kind !== 'poison') {
      this.woundLocal.copy(_b);
      this.hasWound = true;
    }
    // nearest leg gets lame
    if (this.model.legs.length === 4) {
      let best = 0;
      let bd = Infinity;
      for (let i = 0; i < 4; i++) {
        const leg = this.model.legs[i];
        const f = this.model.feet[i];
        const px = leg.position.x + f.x * (kind === 'trap' ? 1 : 0.5);
        const py = leg.position.y + f.y * (kind === 'trap' ? 1 : 0.5);
        const pz = leg.position.z + f.z * (kind === 'trap' ? 1 : 0.5);
        const d2 = (px - _b.x) ** 2 + (py - _b.y) ** 2 + (pz - _b.z) ** 2;
        if (d2 < bd) {
          bd = d2;
          best = i;
        }
      }
      this.lame[best] = Math.min(1, this.lame[best] + share * 2 * (kind === 'trap' ? 1.5 : 1));
      if (share >= 0.2) {
        this.stagger = 0.25;
        this.buckle[_b.x > 0 ? 1 : 0] = 0.6;
      }
      if (kind === 'trap') this.trappedLeg = best;
    } else if (share >= 0.2) this.stagger = 0.25;
    this.bleed = Math.min(1, this.bleed + share * T.bleedPerHp);
    const blood = this.lastCtx?.blood;
    if (blood && kind !== 'poison') {
      blood.spurt(point, dir, share * 2);
      if (share > 0.15) {
        _c.set(point.x + dir.x * 0.6, 0, point.z + dir.z * 0.6);
        blood.splash(_c, 0.3 + share * 0.6);
      }
    }
    void world;
  }

  /** Poison does damage over time and does not alert the animal by itself. */
  poison(dps: number, time: number) {
    if (this.dead) return;
    this.poisonDps = Math.max(this.poisonDps, dps);
    this.poisonTime = Math.max(this.poisonTime, time);
  }

  root(seconds: number, at?: THREE.Vector3) {
    this.rooted = Math.max(this.rooted, seconds * (this.isBoss ? 0.5 : 1));
    if (at && this.trappedLeg < 0 && this.model.legs.length === 4) {
      // nearest foot to the trap
      let bd = Infinity;
      for (let i = 0; i < 4; i++) {
        const leg = this.model.legs[i];
        const f = this.model.feet[i];
        const lx = leg.position.x + f.x;
        const lz = leg.position.z + f.z;
        const wx = this.pos.x + lx * Math.cos(this.heading) + lz * Math.sin(this.heading);
        const wz = this.pos.z - lx * Math.sin(this.heading) + lz * Math.cos(this.heading);
        const d = (wx - at.x) ** 2 + (wz - at.z) ** 2;
        if (d < bd) {
          bd = d;
          this.trappedLeg = i;
        }
      }
    }
  }

  get isLured(): boolean {
    return this.state === 'lured';
  }

  /** Bait pulls calm animals towards a point for a while. */
  lure(at: THREE.Vector3, seconds: number) {
    if (this.dead || this.isBoss || (this.state !== 'idle' && this.state !== 'alert' && this.state !== 'lured')) return;
    if (this.state !== 'lured') this.state = 'lured';
    this.lureTarget = at;
    this.lureTime = seconds;
  }

  /** The bait at `at` is gone: stop walking to it. */
  clearLure(at: THREE.Vector3) {
    if (this.lureTarget === at || (this.lureTarget && this.lureTarget.distanceToSquared(at) < 0.01)) {
      this.lureTarget = undefined;
      if (this.state === 'lured') this.state = 'idle';
    }
  }

  protected die(dir: THREE.Vector3 | null, world: World) {
    if (this.dead) return;
    // momentum at death: forward speed plus knockback
    this.deathVel.set(Math.sin(this.heading) * this.speedNow + this.kb.x, 0, Math.cos(this.heading) * this.speedNow + this.kb.z);
    if (this.alt > 0.3) this.deathVel.multiplyScalar(0.6);
    const v = this.deathVel.length();
    this.deathFast = v > 5;
    this.deathStart.copy(this.pos);
    // slide with friction (mu*g = 9 m/s^2), stopped early by trees
    let slide = (v * v) / (2 * 9);
    if (v > 0.05) {
      _c.copy(this.deathVel).normalize();
      const r = this.def.radius * 0.5;
      for (let s = 0.25; s <= slide; s += 0.25) {
        if (!world.isFree(this.pos.x + _c.x * s, this.pos.z + _c.z * s, r)) {
          slide = Math.max(0, s - 0.25);
          break;
        }
      }
    }
    this.deathSlide = slide;
    // fall to the side the blow pushes (or a random side)
    const left = dir ? dir.x * Math.cos(this.heading) - dir.z * Math.sin(this.heading) : this.rng.next() - 0.5;
    this.deathSide = left >= 0 ? 1 : -1;
    this.theta = 0;
    this.thetaV = 0.6 + Math.min(1.2, v * 0.08);
    this.bounced = false;
    this.landed = false;
    this.deathMass = this.mass;
    // where the body centre comes to rest (loot goes there)
    this.predictRest(world);
    this.dead = true;
    this.state = 'dead';
    this.sprite.visible = false;
    this.rooted = 0;
    this.lastCtx?.onImpact?.('kill', Math.min(1, this.mass / 120), this.pos);
    this.onDeath(this);
  }

  protected predictRest(world: World) {
    const b = this.model;
    const lat = this.def.body.bird ? 0 : (b.bodyY - b.half.x) * 0.75 * this.deathSide;
    _c.copy(this.deathVel);
    if (_c.lengthSq() > 1e-6) _c.normalize();
    this.restCentre.set(
      this.pos.x + _c.x * this.deathSlide + lat * Math.cos(this.heading),
      0,
      this.pos.z + _c.z * this.deathSlide - lat * Math.sin(this.heading),
    );
    this.restCentre.y = world.height(this.restCentre.x, this.restCentre.z);
  }

  // ------------------------------------------------------------------ update
  update(dt: number, ctx: AnimalContext) {
    this.lastCtx = ctx;
    if (ctx.diff) this.diff = ctx.diff;
    this.t += dt;
    this.updateFlash(dt);
    this.updateCulling(ctx);
    if (this.dead) {
      this.updateDeath(dt, ctx);
      return;
    }

    if (this.rooted > 0) this.rooted -= dt;
    if (this.stagger > 0) this.stagger -= dt;
    if (this.calm > 0) this.calm -= dt;
    for (let i = 0; i < 4; i++) if (this.buckle[i] > 0) this.buckle[i] = Math.max(0, this.buckle[i] - dt * 3);
    this.bleed = Math.max(0, this.bleed - T.bleedDecay * dt);
    if (this.poisonTime > 0) {
      this.poisonTime -= dt;
      this.hp -= this.poisonDps * dt;
      this.flash = Math.max(this.flash, 0.05);
      if (this.hp <= 0) {
        this.die(null, ctx.world);
        return;
      }
    } else this.poisonDps = 0;

    const P = ctx.player.pos;
    let dx = P.x - this.pos.x;
    let dz = P.z - this.pos.z;
    const d = Math.max(0.001, Math.hypot(dx, dz));
    dx /= d;
    dz /= d;

    this.sense(dt, d, dx, dz, ctx);
    // defaults; think() overrides
    this.goalSpeed = 0;
    this.goalHeading = this.heading;
    this.turnMul = 1;
    this.snapSpeed = false;
    this.avoid = true;
    this.think(dt, ctx, d, dx, dz);
    this.locomote(dt, ctx);
    this.bloodTrail(dt, ctx);
    if (!this.far || this.forcedFar === false) this.animate(dt, ctx);
    else {
      this.group.position.set(this.pos.x, this.pos.y + this.alt, this.pos.z);
      this.group.rotation.set(0, this.heading, 0);
    }
    this.updateEyes(dt, ctx);
    this.updateMarker(ctx);
  }

  protected updateFlash(dt: number) {
    if (this.flash <= 0) return;
    this.flash -= dt;
    const k = Math.max(0, this.flash / 0.22);
    const m = this.model.mat;
    if (k > 0) {
      m.emissive.setRGB(0.9 * k, 0.12 * k, 0.08 * k);
      m.emissiveIntensity = 0.35;
    } else {
      m.emissive.copy(this.baseEmissive);
      m.emissiveIntensity = this.baseEmissiveI;
    }
  }

  protected viewer(ctx: AnimalContext): THREE.Vector3 {
    return ctx.camera ? ctx.camera.position : ctx.player.pos;
  }

  protected updateCulling(ctx: AnimalContext) {
    const v = this.viewer(ctx);
    const d = Math.hypot(v.x - this.pos.x, v.z - this.pos.z);
    const vd = (ctx.world as unknown as { viewDistance?: number }).viewDistance;
    const hide = this.isBoss ? Infinity : Math.max(T.shadowDistance + 5, vd ?? T.hideDistance);
    let far = d > hide;
    if (this.forcedFar !== null) far = this.forcedFar;
    this.far = far;
    this.group.visible = !far;
    this.model.mesh.castShadow = !far && d < T.shadowDistance * (this.isBoss ? 2 : 1);
  }

  /** The behaviour: sets goalHeading/goalSpeed (or moves directly) per state. Bosses override. */
  protected think(dt: number, ctx: AnimalContext, d: number, dx: number, dz: number) {
    const def = this.def;
    const toPlayer = Math.atan2(dx, dz);
    switch (this.state) {
      case 'idle':
        this.wander(dt, ctx);
        break;
      case 'lured': {
        const t = this.lureTarget;
        this.lureTime -= dt;
        if (!t || this.lureTime <= 0) {
          this.state = 'idle';
          break;
        }
        const dd = Math.hypot(t.x - this.pos.x, t.z - this.pos.z);
        this.goalHeading = Math.atan2(t.x - this.pos.x, t.z - this.pos.z);
        if (dd > 1.4) this.goalSpeed = def.walk * 2.4;
        break;
      }
      case 'alert': {
        // freeze; the head turns to the hunter first, the body only if the hunter is far off to the side
        const err = wrap(toPlayer - this.heading);
        if (Math.abs(err) > 1.05) {
          this.goalHeading = toPlayer;
          this.turnMul = 0.5;
        }
        if (this.awareness < 0.12) this.state = 'idle';
        break;
      }
      case 'flee':
        this.thinkFlee(dt, ctx, d, dx, dz);
        break;
      case 'circle':
      case 'chase':
        this.thinkChase(dt, ctx, d, dx, dz);
        break;
      case 'windup':
        this.thinkWindup(dt, ctx, d, toPlayer);
        break;
      case 'strike':
        this.thinkStrike(dt, ctx, d);
        break;
      case 'recover':
        this.thinkRecover(dt, ctx, d, toPlayer);
        break;
    }

    // defenders that were noticed from afar only react once you get close
    if ((this.state === 'alert' || this.state === 'idle' || this.state === 'lured') && def.role === 'defender' && this.awareness >= 1 && d < def.aggroRange * this.diff.senses && this.calm <= 0) {
      this.state = 'chase';
      this.chaseTime = 0;
    }
  }

  protected thinkFlee(dt: number, ctx: AnimalContext, d: number, dx: number, dz: number) {
    const def = this.def;
    this.fleeTime += dt;
    let away = Math.atan2(-dx, -dz);
    if (def.body.bird) {
      this.thinkFlight(dt, ctx, away);
    } else if (def.id === 'hare') {
      // discrete jinks: a sudden 50-90 degree change every 0.5-1.1 s with a short slowdown
      this.jinkT -= dt;
      if (this.jinkT <= 0) {
        this.jinkT = this.rng.range(0.5, 1.1);
        this.jink = (this.rng.next() < 0.5 ? -1 : 1) * this.rng.range(0.9, 1.55);
        if (Math.abs(wrap(away + this.jink - this.heading)) > 2.2) this.jink = -this.jink * 0.5;
        this.jinkSlow = 0.12;
      }
      this.jinkSlow -= dt;
      away += this.jink;
      this.goalSpeed = def.run * (this.jinkSlow > 0 ? 0.55 : 1);
      this.turnMul = this.jinkSlow > 0 ? 2.5 : 1;
      this.goalHeading = away;
    } else {
      this.goalHeading = away + Math.sin(this.t * 1.3 + this.gaitPhase * 6) * 0.25;
      this.goalSpeed = def.run;
    }
    if (d > 60 || (this.fleeTime > 9 && d > 32)) {
      if (this.alt <= 0.01) {
        this.state = 'idle';
        this.awareness = 0;
        this.flight = 'none';
      }
    }
  }

  /** Pheasant flush: crouch, burst up, fly 25-40 m at 3-5 m, glide down and land. */
  protected thinkFlight(dt: number, ctx: AnimalContext, away: number) {
    const def = this.def;
    switch (this.flight) {
      case 'none':
        this.flight = 'crouch';
        this.timer = 0.25;
        this.flightDist = this.rng.range(25, 40);
        this.goalHeading = away;
        this.turnMul = 3;
        break;
      case 'crouch':
        this.timer -= dt;
        this.goalHeading = away;
        this.turnMul = 3;
        if (this.timer <= 0) {
          this.flight = 'up';
          this.altVel = 5;
          ctx.onCue?.(this, 'flap');
        }
        break;
      case 'up':
        this.goalHeading = away;
        this.goalSpeed = def.run;
        this.avoid = false;
        if (this.alt > this.rng.range(3, 3.4) + (this.gaitPhase * 1.5)) {
          this.flight = 'fly';
          this.altVel = 0;
        }
        break;
      case 'fly':
        this.goalHeading = away * 0.15 + this.heading * 0.85;
        this.goalSpeed = def.run * 1.15;
        this.avoid = false;
        this.flightDist -= this.speedNow * dt;
        if (this.flightDist < 8) this.flight = 'glide';
        break;
      case 'glide':
        this.goalHeading = this.heading;
        this.goalSpeed = def.run * 0.9;
        this.avoid = false;
        this.altVel = -1.6;
        if (this.alt <= 0.001) {
          this.flight = 'none';
          this.fleeTime = 99; // land and run a little, then calm down once far enough
          this.state = 'idle';
          this.awareness = 0.35;
          this.pause = 0;
          this.hasWaypoint = false;
        }
        break;
    }
  }

  protected thinkChase(dt: number, ctx: AnimalContext, d: number, dx: number, dz: number) {
    const def = this.def;
    this.chaseTime += dt;
    if (ctx.player.dead || d > def.giveUp || this.chaseTime > this.diff.giveUp) {
      this.giveUp(ctx);
      return;
    }
    const toPlayer = Math.atan2(dx, dz);
    const may = this.isBoss || !ctx.canEngage || ctx.canEngage(this) || d < def.attackRange * 1.2;
    if (!may) {
      // engagement cap: circle at 12-15 m and growl
      this.state = 'circle';
      const r = this.circleR;
      const tangent = toPlayer + Math.PI + this.circleDir * 0.9;
      const tx = ctx.player.pos.x - dx * r + Math.sin(tangent) * 3;
      const tz = ctx.player.pos.z - dz * r + Math.cos(tangent) * 3;
      this.goalHeading = Math.atan2(tx - this.pos.x, tz - this.pos.z);
      const off = Math.abs(d - r);
      this.goalSpeed = Math.min(def.run * 0.55, def.walk * 1.6 + off * 0.6);
      this.chaseTime -= dt * 0.7; // circling at a distance barely counts towards giving up
      if (this.rng.next() < dt * 0.15) this.circleDir = -this.circleDir;
      this.growlT -= dt;
      if (this.growlT <= 0) {
        this.growlT = this.rng.range(3, 5);
        ctx.onCue?.(this, 'growl');
      }
      return;
    }
    this.state = 'chase';
    // wolves stalk low and slow first, and come in on a flank instead of a beeline
    if (def.id === 'ulv' && this.stalkT < 2.5 && d > 12) {
      this.stalkT += dt;
      this.goalHeading = toPlayer;
      this.goalSpeed = def.run * 0.32;
      return;
    }
    let h = toPlayer;
    if (d > 6 && (def.id === 'ulv' || def.id === 'raev')) h += clamp(this.flank, -1, 1) * Math.min(0.6, (d - 6) * 0.06);
    this.goalHeading = h;
    // brake in time to stop at striking distance (no overshooting the hunter before the windup)
    const room = Math.max(0, d - def.attackRange * 0.75);
    this.goalSpeed = Math.min(def.run, Math.sqrt(2 * def.accel * 1.6 * room) + 0.4);
    if (d < def.attackRange) this.startWindup(ctx, def.windup);
  }

  protected giveUp(ctx: AnimalContext) {
    this.state = 'idle';
    this.awareness = 0.2;
    this.calm = T.calmAfterGiveUp;
    this.stalkT = 0;
    // walk away from the hunter
    const P = ctx.player.pos;
    const a = Math.atan2(this.pos.x - P.x, this.pos.z - P.z) + this.rng.range(-0.5, 0.5);
    this.waypoint.set(this.pos.x + Math.sin(a) * 22, 0, this.pos.z + Math.cos(a) * 22);
    this.hasWaypoint = true;
    this.pause = 0;
  }

  protected startWindup(ctx: AnimalContext, windup: number) {
    this.state = 'windup';
    this.windupTotal = Math.max(0.3, windup * this.diff.telegraph);
    this.timer = this.windupTotal;
    this.committed = false;
    this.pawT = 0;
    if (this.def.id === 'vildsvin') ctx.onCue?.(this, 'snort');
    else ctx.onCue?.(this, 'growl');
  }

  protected thinkWindup(dt: number, ctx: AnimalContext, d: number, toPlayer: number) {
    this.timer -= dt;
    this.chaseTime += dt;
    // track for the first part, then lock the heading (the commit)
    if (this.timer > this.windupTotal * (1 - T.trackShare)) {
      this.goalHeading = toPlayer;
      this.turnMul = 1.6;
    } else if (!this.committed) {
      this.committed = true;
      ctx.onCue?.(this, 'commit');
    }
    if (this.def.id === 'vildsvin') {
      // pawing the ground: two scrapes with dust
      this.pawT += dt;
      if ((this.pawT > 0.12 && this.pawT - dt <= 0.12) || (this.pawT > 0.42 && this.pawT - dt <= 0.42)) {
        ctx.onCue?.(this, 'paw');
        const f = this.model.legs[0];
        _c.set(this.pos.x + Math.sin(this.heading) * f.position.z, this.pos.y, this.pos.z + Math.cos(this.heading) * f.position.z);
        ctx.blood?.dust(_c, 0.5);
      }
    }
    if (this.timer <= 0) this.startStrike(ctx);
    void d;
  }

  protected startStrike(ctx: AnimalContext) {
    this.state = 'strike';
    this.strikeT = 0;
    this.struck = false;
    this.lungeDir.set(Math.sin(this.heading), 0, Math.cos(this.heading));
    this.snoutAt(this.lungeFrom);
    this.strikeKind = 'bite';
    void ctx;
  }

  /** World position of the snout tip (from the bind pose, following heading and body position). */
  protected snoutAt(out: THREE.Vector3): THREE.Vector3 {
    const r = this.model.reach;
    return out.set(this.pos.x + Math.sin(this.heading) * r, this.pos.y + this.model.snoutY, this.pos.z + Math.cos(this.heading) * r);
  }

  protected thinkStrike(dt: number, ctx: AnimalContext, d: number) {
    const def = this.def;
    const Tt = T.strikeTime;
    this.strikeT += dt;
    const u = Math.min(1, this.strikeT / Tt);
    // eased lunge: v = v0 (1-u)^2, v0 = 3 lunge / T, so the distance covered is exactly `lunge`
    const v0 = (3 * def.lunge) / Tt;
    this.goalHeading = this.heading;
    this.turnMul = 0;
    this.snapSpeed = true;
    this.goalSpeed = this.rooted > 0 ? 0 : v0 * (1 - u) * (1 - u);
    this.avoid = false;
    if (!this.struck && u >= T.strikeActiveFrom) {
      // swept capsule from the snout's start to its current position
      this.snoutAt(_c);
      if (this.capsuleHits(ctx, this.lungeFrom, _c, def.radius * 0.5 + PLAYER.radius, this.model.snoutY + 0.5)) {
        this.struck = true;
        this.strikeDamage = def.damage * this.diff.animalDamage;
        ctx.onStrike(this);
      }
    }
    if (u >= 1) {
      this.state = 'recover';
      this.timer = def.cooldown;
      this.skid = 0.3 * v0 * 0.25;
    }
    void d;
  }

  /** Is the hunter inside the capsule a-b (xz) and low enough to be hit? */
  protected capsuleHits(ctx: AnimalContext, a: THREE.Vector3, b: THREE.Vector3, r: number, maxAir: number): boolean {
    const p = ctx.player.pos;
    if (ctx.player.air > maxAir) return false;
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const l2 = abx * abx + abz * abz;
    const t = l2 > 1e-6 ? clamp(((p.x - a.x) * abx + (p.z - a.z) * abz) / l2, 0, 1) : 0;
    const cx = a.x + abx * t - p.x;
    const cz = a.z + abz * t - p.z;
    return cx * cx + cz * cz < r * r;
  }

  protected thinkRecover(dt: number, ctx: AnimalContext, d: number, toPlayer: number) {
    const def = this.def;
    this.timer -= dt;
    this.chaseTime += dt;
    // short skid after the lunge, then turn back to the hunter
    this.skid *= Math.exp(-10 * dt);
    this.snapSpeed = this.skid > 0.05;
    this.goalSpeed = this.skid;
    this.goalHeading = this.timer < def.cooldown * 0.7 ? toPlayer : this.heading;
    this.turnMul = 0.5;
    if (this.timer <= 0) {
      if (ctx.player.dead || d > def.giveUp || this.chaseTime > this.diff.giveUp) {
        this.giveUp(ctx);
        return;
      }
      if (d < def.attackRange) this.startWindup(ctx, def.windup * 0.8);
      else this.state = 'chase';
    }
  }

  protected sense(dt: number, d: number, nx: number, nz: number, ctx: AnimalContext) {
    const def = this.def;
    const active = this.state === 'chase' || this.state === 'circle' || this.state === 'windup' || this.state === 'strike' || this.state === 'recover' || this.state === 'flee';
    if (active) {
      this.awareness = 1;
      return;
    }
    const senses = this.diff.senses;
    // scent drifts with the wind from the hunter towards the animal
    const cosw = -(ctx.wind.dx * nx + ctx.wind.dz * nz);
    const f = Math.min(1.8, Math.max(0.25, 1 + 0.75 * ctx.wind.strength * cosw));
    const smellR = def.smell * f * ctx.scentMul * senses;
    const hearR = ctx.player.noise;
    const sight = def.sight * senses;
    let closeness = 0;
    if (d < smellR) closeness = Math.max(closeness, 1 - d / smellR);
    if (d < hearR) closeness = Math.max(closeness, 1 - d / hearR);
    if (d < sight) {
      const facing = Math.sin(this.heading) * nx + Math.cos(this.heading) * nz;
      if (facing > 0.35 && !ctx.world.lineBlocked(this.hitCenterInto(_c), ctx.player.chest)) closeness = Math.max(closeness, 1 - d / sight);
    }
    if (d < 4) closeness = 1;
    if (this.calm > 0) closeness *= 0.2;
    if (closeness > 0) this.awareness = Math.min(1, this.awareness + dt * (0.45 + 2.2 * closeness));
    else this.awareness = Math.max(0, this.awareness - dt * 0.3);
    if (this.calm > 0) this.awareness = Math.min(this.awareness, 0.5);

    if (this.state === 'idle' && this.awareness > 0.3) {
      this.state = 'alert';
      ctx.onAlert(this);
    }
    if (this.awareness >= 1 && (this.state === 'idle' || this.state === 'alert' || this.state === 'lured')) {
      if (def.role === 'prey') {
        this.state = 'flee';
        this.fleeTime = 0;
      } else if (def.role === 'predator') {
        this.state = 'chase';
        this.chaseTime = 0;
        this.stalkT = 0;
        if (def.id === 'ulv') ctx.onCue?.(this, 'howl');
      }
      // defenders are handled in think(): they stay alert until the hunter is close
    }
  }

  protected wander(dt: number, ctx: AnimalContext) {
    if (this.pause > 0) {
      this.pause -= dt;
      return;
    }
    if (!this.hasWaypoint || Math.hypot(this.pos.x - this.waypoint.x, this.pos.z - this.waypoint.z) < 1 || this.stuck > 1.2) {
      const a = this.rng.range(0, Math.PI * 2);
      const r = this.rng.range(3, 9);
      this.waypoint.set(this.pos.x + Math.sin(a) * r, 0, this.pos.z + Math.cos(a) * r);
      this.hasWaypoint = true;
      this.pause = this.rng.range(1.5, 5);
      this.stuck = 0;
      return;
    }
    this.goalHeading = Math.atan2(this.waypoint.x - this.pos.x, this.waypoint.z - this.pos.z);
    this.goalSpeed = this.def.walk * (this.calm > 0 ? 1.6 : 1);
    void ctx;
  }

  // ------------------------------------------------------------------ movement with inertia
  protected locomote(dt: number, ctx: AnimalContext) {
    const def = this.def;
    const world = ctx.world;
    const r = def.radius * 0.55;
    if (this.rooted > 0 && this.alt <= 0.01) {
      // held by a trap: no travel, pull against it
      this.speedNow = approach(this.speedNow, 0, 30 * dt);
      this.yawRate = 0;
    } else {
      let chosen = this.goalHeading;
      if (this.avoid && this.goalSpeed > 0.3 && this.alt < 1) {
        const probe = 1.2 + def.radius * 1.2;
        for (const o of PROBE) {
          const a = this.goalHeading + o;
          if (world.isFree(this.pos.x + Math.sin(a) * probe, this.pos.z + Math.cos(a) * probe, r)) {
            chosen = a;
            break;
          }
        }
      }
      const err = wrap(chosen - this.heading);
      const tr = (def.turnRate * this.turnMul) / (1 + this.speedNow / 4);
      const dh = clamp(err, -tr * dt, tr * dt);
      this.heading = wrap(this.heading + dh);
      this.yawRate = dt > 0 ? dh / dt : 0;
      let target = this.goalSpeed;
      if (!this.snapSpeed && target > 0) target *= Math.max(0.35, Math.cos(err));
      // wounds slow it down
      const maxLame = Math.max(this.lame[0], this.lame[1], this.lame[2], this.lame[3]);
      if (!this.snapSpeed) {
        target *= 1 - 0.3 * maxLame;
        if (this.stagger > 0) target *= 0.3;
        if (this.hp < this.maxHp * 0.3) target *= 0.85;
      }
      if (this.snapSpeed) this.speedNow = target;
      else {
        const acc = target > this.speedNow ? def.accel : def.accel * 1.6;
        this.speedNow = approach(this.speedNow, target, acc * dt);
      }
    }
    const sx = Math.sin(this.heading) * this.speedNow + this.kb.x;
    const sz = Math.cos(this.heading) * this.speedNow + this.kb.z;
    const bx = this.pos.x;
    const bz = this.pos.z;
    if (this.rooted <= 0 || this.alt > 0.01) {
      this.pos.x += sx * dt;
      this.pos.z += sz * dt;
    }
    const kd = Math.exp(-8 * dt);
    this.kb.x *= kd;
    this.kb.z *= kd;
    if (this.alt < 1.5) {
      // keep out of the hunter (the strike is what hurts, not overlapping)
      const P = ctx.player.pos;
      const ox = this.pos.x - P.x;
      const oz = this.pos.z - P.z;
      const min = def.radius * 0.55 + PLAYER.radius;
      const od = Math.hypot(ox, oz);
      if (od < min && od > 1e-4 && ctx.player.air < 0.5 && !ctx.player.dead) {
        this.pos.x = P.x + (ox / od) * min;
        this.pos.z = P.z + (oz / od) * min;
      }
      world.collide(this.pos, r);
    }
    else {
      // flying: only stay inside the level
      _c.copy(this.pos);
      world.collide(_c, 0, 1e9);
      this.pos.x = _c.x;
      this.pos.z = _c.z;
    }
    const moved = Math.hypot(this.pos.x - bx, this.pos.z - bz);
    this.moved += moved;
    const real = dt > 0 ? moved / dt : 0;
    this.stuck = this.goalSpeed > 0.3 && real < this.goalSpeed * 0.3 ? this.stuck + dt : 0;
    if (this.stuck > 0.6 && !this.snapSpeed) this.speedNow = Math.min(this.speedNow, real + 0.5);
    // flight height
    if (this.altVel !== 0 || this.alt > 0) {
      this.alt = Math.max(0, this.alt + this.altVel * dt);
      if (this.flight === 'up') this.altVel = Math.max(1.2, this.altVel - 2.5 * dt);
      if (this.alt <= 0) this.altVel = 0;
    }
    this.pos.y = world.height(this.pos.x, this.pos.z);
  }

  protected bloodTrail(dt: number, ctx: AnimalContext) {
    const blood = ctx.blood;
    if (!blood || this.bleed < 0.04) {
      this.moved = 0;
      return;
    }
    const every = 2.6 + (0.6 - 2.6) * this.bleed;
    this.trailAcc += this.moved;
    this.moved = 0;
    if (this.trailAcc >= every && this.alt < 0.5) {
      this.trailAcc = 0;
      const side = this.rng.next() < 0.5 ? -1 : 1;
      const off = 0.15 * side;
      _c.set(this.pos.x + Math.cos(this.heading) * off, this.pos.y, this.pos.z - Math.sin(this.heading) * off);
      const size = (0.14 + this.rng.next() * 0.16) * (0.6 + this.def.radius * 0.5) * (0.7 + this.bleed * 0.8);
      blood.trail(_c, size);
    }
    // drips from the wound
    this.dripT -= dt;
    if (this.bleed > 0.2 && this.hasWound && this.dripT <= 0 && !this.far) {
      this.dripT = 0.3 + (1 - this.bleed) * 0.5;
      this.model.pose.updateWorldMatrix(true, false);
      _c.copy(this.woundLocal).applyMatrix4(this.model.pose.matrixWorld);
      blood.drip(_c);
    }
  }

  // ------------------------------------------------------------------ procedural animation
  /** Extra pose targets from the behaviour (bosses override and add to these). */
  protected poseTargets(out: { pitch: number; roll: number; drop: number; z: number; head: number; neck: number; ears: number; tail: number; rate: number }, ctx: AnimalContext) {
    const s = this.state;
    const id = this.def.id;
    const k = this.state === 'windup' ? 1 - Math.max(0, this.timer) / Math.max(0.01, this.windupTotal) : 0;
    out.rate = 8;
    if (s === 'idle' && this.speedNow < 0.15 && this.pause > 0 && !this.def.body.bird) {
      // grazing / sniffing the ground
      out.neck = id === 'raadyr' || id === 'hvidhjort' || id === 'kronhjort' || id === 'elg' ? 0.9 : 0.35;
      out.head = 0.25;
    } else if (s === 'alert') {
      out.neck = -0.25;
      out.head = -0.15;
      out.ears = 0.35;
      out.tail = this.def.body.tail === 'flag' ? 1.4 : 0.2;
    } else if (s === 'flee') {
      out.ears = -0.8;
      out.tail = this.def.body.tail === 'flag' ? 1.6 : this.def.body.tail === 'bushy' ? 0.25 : 0.4;
      out.neck = -0.1;
    } else if (s === 'chase' || s === 'circle') {
      out.ears = -0.7;
      if (id === 'ulv' && this.stalkT < 2.5) {
        out.drop = -0.1 * (this.model.bodyY / 0.8);
        out.neck = 0.25;
        out.head = -0.15;
        out.tail = 0.35;
      } else if (s === 'circle') {
        out.drop = -0.05;
        out.neck = 0.2;
        out.tail = 0.2;
      } else out.tail = 0.3;
    } else if (s === 'windup') {
      out.ears = -1;
      if (id === 'vildsvin' || id === 'raev' || id === 'ulv') {
        // head down, hindquarters up (boar charges, wolves and foxes crouch to spring)
        out.neck = 0.45 * k;
        out.head = 0.2 * k;
        out.pitch = 0.08 * k;
        out.drop = -0.06 * k * (this.model.bodyY / 0.6);
        out.tail = id === 'vildsvin' ? 1.2 : 0.5;
      } else if (id === 'bjorn' || id === 'elg' || id === 'kronhjort') {
        // rear up on the hind legs: a big, readable windup
        out.pitch = -0.45 * k;
        out.neck = -0.2 * k;
        out.head = 0.1 * k;
      } else {
        out.neck = 0.3 * k;
      }
      out.rate = 14;
    } else if (s === 'strike') {
      out.pitch = 0.15;
      out.neck = id === 'kronhjort' || id === 'elg' ? 0.6 : 0.25;
      out.head = 0.15;
      out.ears = -1;
      out.rate = 20;
    } else if (s === 'recover') {
      out.ears = -0.5;
      out.tail = 0.2;
    }
    if (this.hp < this.maxHp * 0.3) out.neck += 0.25;
    void ctx;
  }

  private static targets = { pitch: 0, roll: 0, drop: 0, z: 0, head: 0, neck: 0, ears: 0, tail: 0, rate: 8 };

  protected animate(dt: number, ctx: AnimalContext) {
    const m = this.model;
    const def = this.def;
    const g = this.group;
    g.position.set(this.pos.x, this.pos.y + this.alt, this.pos.z);
    g.rotation.set(0, this.heading, 0);

    const tg = Animal.targets;
    tg.pitch = tg.roll = tg.drop = tg.z = tg.head = tg.neck = tg.ears = tg.tail = 0;
    tg.rate = 8;
    this.poseTargets(tg, ctx);
    const rate = tg.rate;
    this.pPitch = damp(this.pPitch, tg.pitch, rate, dt);
    this.pRoll = damp(this.pRoll, tg.roll, rate, dt);
    this.pDrop = damp(this.pDrop, tg.drop, rate, dt);
    this.pZ = damp(this.pZ, tg.z, rate, dt);
    this.hPitch = damp(this.hPitch, tg.head, rate, dt);
    this.nPitch = damp(this.nPitch, tg.neck, rate * 0.8, dt);
    this.earX = damp(this.earX, tg.ears, 10, dt);
    this.tailX = damp(this.tailX, tg.tail, 6, dt);

    // head look-at when alert/circling (±60°)
    let lookYaw = 0;
    if (this.state === 'alert' || this.state === 'circle' || this.state === 'windup') {
      const P = ctx.player.pos;
      lookYaw = clamp(wrap(Math.atan2(P.x - this.pos.x, P.z - this.pos.z) - this.heading), -1.05, 1.05);
    }
    this.hYaw = damp(this.hYaw, lookYaw, 6, dt);

    // terrain pitch and banking
    const L = m.half.z * 1.6;
    const fx = Math.sin(this.heading) * L;
    const fz = Math.cos(this.heading) * L;
    const hF = ctx.world.height(this.pos.x + fx, this.pos.z + fz);
    const hB = ctx.world.height(this.pos.x - fx, this.pos.z - fz);
    this.terrainPitch = this.alt > 0.2 ? damp(this.terrainPitch, 0, 6, dt) : damp(this.terrainPitch, -Math.atan2(hF - hB, 2 * L) * 0.8, 10, dt);
    this.bank = damp(this.bank, -clamp(this.yawRate * this.speedNow * 0.03, -0.25, 0.25), 8, dt);
    const fr = this.flinchRoll.step(dt);
    const fp = this.flinchPitch.step(dt);
    const hj = this.headJerk.step(dt);

    if (def.body.bird) {
      this.animateBird(dt, fr, fp, hj);
      return;
    }

    // ---- gait
    const speed = this.rooted > 0 ? 0 : this.speedNow;
    const hipL = m.hipY[0];
    const maxLame = Math.max(this.lame[0], this.lame[1], this.lame[2], this.lame[3]);
    let want: GaitName;
    const heavy = def.id === 'bjorn' || def.id === 'elg';
    const walkTop = Math.max(1.6, def.walk * 1.35);
    const trotTop = def.run * 0.62;
    const cur = this.gaitName;
    const hy = cur === 'walk' || cur === 'pace' ? 1.1 : 0.9;
    if (speed < walkTop * hy) want = heavy ? 'pace' : 'walk';
    else if (speed < trotTop * (cur === 'gallop' || cur === 'bound' ? 0.9 : 1.1) || maxLame > 0.6) want = heavy && speed < trotTop * 0.8 ? 'pace' : 'trot';
    else want = def.id === 'hare' ? 'bound' : 'gallop';
    this.gaitName = want;
    const G = GAITS[want];
    this.gait.blend(G, 1 - Math.exp(-dt / 0.2));
    const gb = this.gait;
    const strideLen = gb.stride * hipL * (heavy ? 1.1 : 1);
    const cadence = speed / Math.max(0.05, strideLen);
    this.gaitPhase = (this.gaitPhase + cadence * dt) % 1;
    const amp = clamp(speed / 0.35, 0, 1);
    const reach = (strideLen * gb.duty) / 2;
    // the body rides a little lower than the straight leg, so a planted foot stays on the ground through the
    // whole stance: the knee bends mid-stance and straightens at the ends (2-bone leg, equal segments)
    const thMax = Math.atan2(reach, hipL);
    const sink = hipL * 0.5 * (1 - Math.cos(thMax)) * amp;

    let bodyDip = 0;
    let bodyRollLimp = 0;
    let headBob = 0;
    const trapped = this.rooted > 0;
    for (let i = 0; i < 4; i++) {
      const leg = m.legs[i];
      const shank = m.shanks[i];
      const front = i < 2;
      const lame = this.lame[i];
      let p = (this.gaitPhase + gb.offsets[i]) % 1;
      const duty = gb.duty * (1 - 0.4 * lame);
      legPose(p, duty, reach * (1 - 0.6 * lame), m.hipY[i], _leg);
      let hip = _leg.hip * amp;
      let knee = _leg.knee * gb.flex * amp;
      if (_leg.stance && amp > 0.01) {
        const Li = m.hipY[i];
        const need = Math.min(Li, (Li - sink) / Math.cos(hip));
        const cosDev = clamp((2 * need * need) / (Li * Li) - 1, -1, 1);
        const dev = Math.acos(cosDev);
        knee += dev;
        hip += (front ? 1 : -1) * dev * 0.5;
      }
      if (trapped) {
        // thrash: fast random kicks, the trapped leg held
        if (i === this.trappedLeg) {
          hip = 0.15;
          knee = 0;
        } else {
          p = (this.t * 3.2 + i * 0.37) % 1;
          hip = Math.sin(p * Math.PI * 2) * (0.35 + 0.25 * Math.sin(this.t * 7 + i));
          knee = Math.max(0, Math.sin(p * Math.PI * 2 + 1)) * 0.9;
        }
      }
      if (_leg.stance && lame > 0.05 && amp > 0.3) {
        bodyDip += 0.06 * lame;
        bodyRollLimp += (i % 2 === 0 ? 1 : -1) * 0.08 * lame;
        headBob += 0.12 * lame;
      }
      const buckle = this.buckle[i] > 0 ? this.buckle[i] : 0;
      leg.rotation.x = -hip;
      shank.rotation.x = (front ? 1 : -1) * (knee + buckle) + (front ? buckle * 0.5 : 0);
    }
    const bobPh = want === 'gallop' || want === 'bound' ? Math.sin(this.gaitPhase * Math.PI * 2) : Math.cos(this.gaitPhase * Math.PI * 4);
    const bob = gb.bob * hipL * amp * bobPh * (heavy ? 1.3 : 1);
    const spine = want === 'gallop' || want === 'bound' ? gb.pitch * amp * Math.sin(this.gaitPhase * Math.PI * 2 + 0.6) : 0;

    // stumble when badly hurt
    if (this.hp < this.maxHp * 0.3 && speed > 1.5) {
      this.stumbleT -= dt;
      if (this.stumbleT <= 0) {
        this.stumbleT = this.rng.range(3, 6);
        this.buckle[this.rng.int(0, 1)] = 0.7;
      }
    }

    // trapped: body jerks and leans away
    let jerkR = 0;
    let jerkP = 0;
    if (trapped) {
      jerkR = Math.sin(this.t * 31) * 0.08 + Math.sin(this.t * 23) * 0.05;
      jerkP = Math.sin(this.t * 27) * 0.06 - 0.06;
      if (this.rng.next() < dt * 2) this.lastCtx?.blood?.dust(this.pos, 0.3);
    }

    // windup tremble (local, not world x)
    let tremble = 0;
    if (this.state === 'windup') {
      const k = 1 - Math.max(0, this.timer) / Math.max(0.01, this.windupTotal);
      tremble = Math.sin(this.t * 55) * 0.025 * k;
    }

    const pose = m.pose;
    // rear pivot: rearing rotates about the hind hips, so the body rises instead of sinking
    const pitch = this.pPitch + spine + fp + this.terrainPitch + jerkP;
    const pivot = this.pPitch < 0 ? m.half.z * 0.6 : 0;
    const rear = Math.max(0, -this.pPitch);
    pose.position.set(
      tremble,
      m.bodyY + bob + this.pDrop - bodyDip - sink + pivot * Math.sin(rear),
      -pivot * (1 - Math.cos(rear)) + this.pZ,
    );
    pose.rotation.set(pitch, 0, this.pRoll + this.bank + fr + bodyRollLimp + jerkR + tremble * 2);
    if (rear > 0.05) {
      // front legs dangle when rearing
      // hind legs stay planted (counter the body pitch), front legs fold and hang
      for (let i = 0; i < 2; i++) {
        m.legs[i].rotation.x += rear * 0.45;
        m.shanks[i].rotation.x += rear * 0.9;
      }
      for (let i = 2; i < 4; i++) m.legs[i].rotation.x += rear;
    }

    // head and neck
    m.neck.rotation.set(this.nPitch - spine * 0.5 + headBob * 0.5, this.hYaw * 0.5, 0);
    m.head.rotation.set(this.hPitch - headBob + Math.sin(this.gaitPhase * Math.PI * 4) * 0.03 * amp, this.hYaw * 0.5 + hj, 0);

    // ears: flicks when calm, pinned when running or attacking
    this.earFlickT -= dt;
    if (this.earFlickT <= 0) {
      this.earFlickT = this.rng.range(2, 6);
      this.earFlick[this.rng.int(0, 1)] = 0.4;
    }
    for (let i = 0; i < m.ears.length; i++) {
      this.earFlick[i] = Math.max(0, this.earFlick[i] - dt * 2.5);
      const fl = this.earFlick[i] > 0 ? Math.sin((this.earFlick[i] / 0.4) * Math.PI) * 0.4 : 0;
      m.ears[i].rotation.set(this.earX + (this.state === 'idle' ? fl : 0), 0, (i === 0 ? 1 : -1) * (this.earX < 0 ? this.earX * 0.3 : 0));
    }
    // tail: spring driven by yaw rate and gait
    const ts = this.tailSpring.step(dt, -this.yawRate * 0.12);
    m.tail.rotation.set(this.tailX + Math.sin(this.gaitPhase * Math.PI * 4) * 0.12 * amp + (trapped ? Math.sin(this.t * 20) * 0.3 : 0), clamp(ts, -0.8, 0.8), 0);
  }

  protected animateBird(dt: number, fr: number, fp: number, hj: number) {
    const m = this.model;
    const speed = this.speedNow;
    const flying = this.alt > 0.05 || this.flight === 'up';
    const pose = m.pose;
    // walking: quick steps with a head bob held while the foot plants
    const cadence = flying ? 0 : speed / 0.18;
    this.gaitPhase = (this.gaitPhase + cadence * dt) % 1;
    const amp = clamp(speed / 0.3, 0, 1) * (flying ? 0 : 1);
    for (let i = 0; i < m.legs.length; i++) {
      const p = (this.gaitPhase + i * 0.5) % 1;
      legPose(p, 0.55, 0.06, m.hipY[i], _leg);
      m.legs[i].rotation.x = flying ? 0.9 : -_leg.hip * amp;
      m.shanks[i].rotation.x = flying ? -1.2 : -_leg.knee * 0.9 * amp;
    }
    const crouch = this.flight === 'crouch' ? -0.06 : 0;
    pose.position.set(0, m.bodyY + crouch + Math.abs(Math.sin(this.gaitPhase * Math.PI * 2)) * 0.012 * amp, 0);
    const pitchFly = flying ? (this.flight === 'up' ? -0.45 : this.flight === 'glide' ? 0.1 : -0.1) : 0;
    this.pPitch = damp(this.pPitch, pitchFly, 6, dt);
    pose.rotation.set(this.pPitch + fp, 0, this.bank * 2 + fr);
    const bobZ = amp > 0 ? (Math.sin(this.gaitPhase * Math.PI * 4) > 0 ? 0.03 : -0.01) : 0;
    m.neck.rotation.set(this.nPitch + (this.state === 'idle' && this.pause > 0 ? 0.6 + Math.sin(this.t * 3) * 0.2 : 0) - bobZ, 0, 0);
    m.head.rotation.set(this.hPitch, this.hYaw + hj, 0);
    // wings: folded, flapping or gliding
    for (let i = 0; i < m.wings.length; i++) {
      const w = m.wings[i];
      const s = i === 0 ? -1 : 1;
      if (flying) {
        const flap = this.flight === 'glide' ? 0.1 : Math.sin(this.t * Math.PI * 2 * 9);
        w.rotation.set(0, -s * 1.25, s * (0.25 + 1.1 * flap));
      } else w.rotation.set(0, 0, 0);
    }
    m.tail.rotation.set(flying ? -0.2 : 0.1 + Math.sin(this.t * 2) * 0.05, 0, 0);
  }

  protected updateEyes(dt: number, ctx: AnimalContext) {
    const night = ctx.world.night ?? 0;
    let target = 0;
    if ((night > 0.3 || this.isBoss) && !this.far) {
      const v = this.viewer(ctx);
      const vx = v.x - this.pos.x;
      const vz = v.z - this.pos.z;
      const d = Math.hypot(vx, vz);
      const facing = (Math.sin(this.heading + this.hYaw) * vx + Math.cos(this.heading + this.hYaw) * vz) / Math.max(0.01, d);
      if (facing > 0.5 && d < 70) target = (this.isBoss ? 1.5 : 2.6) * Math.min(1, (night - 0.3) / 0.4 + (this.isBoss ? 0.6 : 0)) * (0.6 + 0.4 * facing);
    }
    this.eyeGlow = damp(this.eyeGlow, target, 4, dt);
    this.model.eyeMat.emissiveIntensity = this.eyeGlow;
  }

  protected updateMarker(ctx: AnimalContext) {
    let kind: '?' | '!' | null = null;
    if (this.state === 'alert') kind = this.awareness > 0.7 ? '!' : '?';
    else if (this.state === 'chase' || this.state === 'windup') kind = '!';
    const near = Math.hypot(ctx.player.pos.x - this.pos.x, ctx.player.pos.z - this.pos.z) < 55;
    if (kind && near) {
      this.sprite.visible = true;
      this.sprite.material = marker(kind);
      const s = 0.7 + Math.sin(this.t * 10) * (kind === '!' ? 0.06 : 0);
      this.sprite.scale.set(s, s, 1);
      this.sprite.position.y = this.model.top + 0.6 + this.alt * 0;
    } else this.sprite.visible = false;
  }

  // ------------------------------------------------------------------ death fall
  protected updateDeath(dt: number, ctx: AnimalContext) {
    this.corpseT += dt;
    const m = this.model;
    const t = this.corpseT;
    const world = ctx.world;
    // slide with friction along the death momentum
    const v0 = this.deathVel.length();
    const a = 9;
    const tStop = v0 / a;
    const tt = Math.min(t, tStop);
    const s = v0 > 0.01 ? Math.min(this.deathSlide, v0 * tt - 0.5 * a * tt * tt) : 0;
    if (v0 > 0.01) {
      _c.copy(this.deathVel).normalize();
      this.pos.set(this.deathStart.x + _c.x * s, 0, this.deathStart.z + _c.z * s);
    }
    this.pos.y = world.height(this.pos.x, this.pos.z);
    // flying birds drop out of the sky
    if (this.alt > 0) {
      this.altVel -= 12 * dt;
      this.alt = Math.max(0, this.alt + this.altVel * dt);
      if (this.alt === 0 && !this.landed) {
        this.landed = true;
        ctx.blood?.dust(this.pos, 0.4);
        ctx.onCue?.(this, 'fall');
      }
    }
    // topple: theta'' = (g/h) sin(theta + 0.1) until the body is on its side, one bounce, then settle
    const h = Math.max(0.2, m.bodyY);
    if (!this.bounced) {
      this.thetaV += (9.8 / h) * Math.sin(this.theta + 0.1) * dt;
      this.theta += this.thetaV * dt;
      if (this.theta >= Math.PI / 2) {
        this.theta = Math.PI / 2;
        this.thetaV = -0.25 * this.thetaV;
        this.bounced = true;
        this.onLanded(ctx);
      }
    } else {
      this.thetaV += (-60 * (this.theta - Math.PI / 2) - 2 * 0.8 * Math.sqrt(60) * this.thetaV) * dt;
      this.theta += this.thetaV * dt;
    }
    const th = this.theta;
    const side = this.deathSide;
    const rx = m.half.x;
    const fast = this.deathFast ? Math.sin(Math.min(1, t / 0.5) * Math.PI) : 0;
    const lat = this.def.body.bird ? 0 : (m.bodyY - rx) * 0.75 * Math.sin(th) * side;
    const y = this.def.body.bird ? m.bodyY * Math.cos(th) * 0.5 + m.bodyY * 0.4 : m.bodyY * Math.cos(th) + rx * Math.sin(th);
    m.pose.position.set(lat, y, fast * 0.15);
    m.pose.rotation.set(fast * 1.0, 0, -side * th);
    this.group.position.set(this.pos.x, this.pos.y + this.alt, this.pos.z);
    this.group.rotation.set(0, this.heading, 0);
    // legs relax to a lying pose, a few death kicks
    const relax = clamp((t - 0.25) / 0.4, 0, 1);
    for (let i = 0; i < m.legs.length; i++) {
      const front = i < 2;
      const kick = !front && i === 2 + (side > 0 ? 1 : 0) && t > 0.7 && t < 2.4 ? 0.5 * Math.exp(-2 * (t - 0.7)) * Math.sin(12 * (t - 0.7)) : 0;
      m.legs[i].rotation.set((front ? -0.4 : 0.4) * relax + fast * (front ? 1.0 : 0) + kick, 0, 0);
      m.shanks[i].rotation.set((front ? 0.5 : -0.5) * relax + fast * (front ? 1.2 : 0), 0, 0);
    }
    // head and neck drop to the ground
    m.neck.rotation.set(0.3 * relax, side * 0.35 * relax, -side * 0.55 * relax);
    m.head.rotation.set(0.2 * relax, 0, -side * 0.2 * relax);
    for (const e of m.ears) e.rotation.set(-0.6 * relax, 0, 0);
    m.tail.rotation.set(-0.2 * relax, 0, 0);
    for (const w of m.wings) w.rotation.set(0, 0, 0.3 * relax);
    this.model.eyeMat.emissiveIntensity = 0;
    // sink away at the very end
    if (t > T.corpseTime - 3) this.group.position.y -= (t - (T.corpseTime - 3)) * 0.25;
    if (t > T.corpseTime) this.removable = true;
  }

  protected onLanded(ctx: AnimalContext) {
    const mass = this.deathMass;
    ctx.onImpact?.('thud', Math.min(6, 0.02 * mass), this.pos);
    ctx.onCue?.(this, 'fall');
    _c.copy(this.restCentre);
    ctx.blood?.dust(_c, 0.4 + Math.min(1.5, mass / 80));
    if (!this.def.body.bird || this.bleed > 0) ctx.blood?.pool(_c, Math.max(0.4, this.def.body.length * 0.75));
  }

  /** Frees the model's geometry and materials. Call after removing the group from the scene. */
  dispose() {
    this.model.dispose();
  }

  /** For tests and the HUD. */
  get speed() {
    return this.speedNow;
  }
}
