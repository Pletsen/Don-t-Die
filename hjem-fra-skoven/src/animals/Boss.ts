import * as THREE from 'three';
import { SPECIES, type SpeciesDef } from '../data/animals';
import type { BossAttack, BossDef } from '../data/bosses';
import { PLAYER } from '../data/balance';
import type { World } from '../world/World';
import { Animal, type AnimalContext } from './Animal';
import type { ModelKit } from './models';

/**
 * Boss animals: the alpha wolf (L10), the giant moose (L20) and the scarred giant bear at the cave (L30).
 * Every attack has a readable telegraph (pose + cue), a commit point where the heading locks, a swept hitbox and a
 * recovery that is a punish window (x1.5 damage). Phases change at hp thresholds with a roar.
 */
type Mode = 'wait' | 'intro' | 'move' | 'telegraph' | 'active' | 'recover' | 'stun' | 'howl' | 'retreat' | 'phase';

type PoseOut = { pitch: number; roll: number; drop: number; z: number; head: number; neck: number; ears: number; tail: number; rate: number };

const ringGeo = new THREE.RingGeometry(0.88, 1, 56).rotateX(-Math.PI / 2);
const markGeo = new THREE.RingGeometry(0.75, 1, 40).rotateX(-Math.PI / 2);
const rockGeo = new THREE.DodecahedronGeometry(0.5, 0);
const rockMat = new THREE.MeshStandardMaterial({ color: 0x5f5a52, roughness: 1, flatShading: true });

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const wrap = (a: number) => a - Math.round(a / (Math.PI * 2)) * Math.PI * 2;

/** Builds the boss species: the base animal scaled up, with the boss's numbers and colours. */
function bossSpecies(b: BossDef): SpeciesDef {
  const base = SPECIES[b.base];
  const s = b.scale;
  const first = Object.values(b.attacks)[0];
  return {
    ...base,
    name: b.name,
    hp: b.hp,
    walk: b.walk,
    run: b.run,
    accel: b.accel,
    turnRate: b.turnRate,
    smell: base.smell * 1.3,
    sight: base.sight * 1.3,
    aggroRange: 30,
    giveUp: 1e9,
    damage: first.damage,
    attackRange: base.attackRange * s,
    windup: first.telegraph,
    cooldown: first.recovery,
    lunge: base.lunge * s,
    radius: base.radius * s,
    meat: b.meat,
    shards: b.shards,
    trophies: b.trophies,
    body: {
      ...base.body,
      length: base.body.length * s,
      height: base.body.height * s,
      width: base.body.width * s,
      legs: base.body.legs * s,
      head: base.body.head * s,
      color: b.color,
      accent: b.accent,
      dark: b.dark,
      eyeshine: b.eyeshine,
    },
  };
}

/** Unique silhouette features per boss (art review D5). */
function decorate(b: BossDef, k: ModelKit) {
  const { bones, p } = k;
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const h = k.b.head;
  if (b.id === 'alfaulv') {
    // silver ruff and raised hackles, a pale scar over the right eye
    const nb = p.neckBase;
    k.ell(bones.neck, nb.clone().add(V(0, p.ry * 0.35, p.rz * 0.12)), p.rx * 1.02, p.ry * 0.7, p.rz * 0.22, 0x8e8e94, undefined, { rough: 0.3, counter: 0x6a6a70 });
    for (let i = 0; i < 9; i++) {
      const z = p.rz * (0.75 - i * 0.16);
      const y = p.bodyY + p.ry * 0.95;
      k.cone(i < 3 ? bones.neck : bones.pose, V(0, y - 0.03, z), V(0, y + 0.13 - i * 0.008, z - 0.07), 0.05, 0x55555a);
    }
    const e = p.eye[0];
    k.ell(bones.head, e.clone().add(V(-0.01, 0, 0)), h * 0.03, h * 0.3, h * 0.03, 0xb8aaa0, new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), 0.4));
  } else if (b.id === 'kaempeelg') {
    // grizzled pale muzzle, moss strips hanging from the antlers
    k.ell(bones.head, p.snoutTip.clone().addScaledVector(p.nd, -h * 0.25), h * 0.3, h * 0.28, h * 0.36, 0x8a7a68, undefined, { rough: 0.3 });
    for (const s of [-1, 1])
      for (let i = 0; i < 3; i++) {
        const top = p.skull.clone().add(V(s * h * (0.9 + i * 0.35), h * (0.55 + i * 0.05), -h * (0.1 + i * 0.12)));
        k.ell(bones.head, top.clone().add(V(0, -h * 0.35, 0)), h * 0.05, h * (0.32 + i * 0.06), h * 0.025, i % 2 ? 0x4a5a2a : 0x5a5030, undefined, { rough: 0.4 });
      }
  } else {
    // silver-tipped hump, three pale claw scars over the face and shoulder, broken arrow shafts in the back, a milky eye
    k.ell(bones.pose, V(0, p.bodyY + p.ry * 0.9, p.rz * 0.42), p.rx * 0.62, p.ry * 0.28, p.rz * 0.3, 0x8a8076, undefined, { rough: 0.35 });
    for (let i = 0; i < 3; i++) {
      k.ell(bones.head, p.skull.clone().add(V(h * 0.38, h * (0.25 - i * 0.12), h * (0.05 + i * 0.05))), h * 0.02, h * 0.04, h * 0.32, 0x8a7a6a, new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), 0.6));
      k.ell(bones.pose, V(p.rx * 0.95, p.bodyY + p.ry * (0.35 - i * 0.18), p.rz * (0.35 + i * 0.04)), 0.02, p.ry * 0.05, p.rz * 0.28, 0x8a7a6a, new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), 0.5));
    }
    const shafts: [number, number, number, number][] = [[-0.3, 0.9, -0.2, 0.4], [0.25, 0.95, 0.1, -0.3], [0.05, 1.0, -0.45, 0.2], [-0.4, 0.75, 0.3, 0.5], [0.45, 0.8, -0.55, -0.4], [0.1, 0.98, 0.45, 0.1]];
    for (const [x, y, z, lean] of shafts) {
      const a = V(p.rx * x, p.bodyY + p.ry * y, p.rz * z);
      const t = a.clone().add(V(lean * 0.25, 0.32 + Math.abs(lean) * 0.1, -0.15));
      k.taper(bones.pose, t, a, 0.012, 0.014, 0x6a5a40, { rough: 0.2 });
    }
    k.eyeColor(0, 0xcfd8d0);
  }
}

/** Adds a Fresnel rim to the boss material so it reads against fog and night. */
function addRim(mat: THREE.MeshStandardMaterial, color: number) {
  const rim = { value: new THREE.Color(color) };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uRim = rim;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRim;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += uRim * pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 3.0) * 0.22;');
  };
  mat.customProgramCacheKey = () => 'boss-rim';
}

export class Boss extends Animal {
  override readonly isBoss = true;
  readonly bossName: string;
  readonly bdef: BossDef;
  /** 1..3, for the HUD bar. */
  phase = 1;
  /** Hp shares where the phases change (HUD notches). */
  readonly phaseMarks: number[];
  /** The fight has started (show the boss bar). */
  awake = false;
  /** Called with each wolf the alpha howls in. The lead adds it to the scene and the animal list. */
  onSummon: (a: Animal) => void = () => {};
  onPhase: (phase: number) => void = () => {};

  private mode: Mode = 'wait';
  private modeT = 0;
  private atk: BossAttack | null = null;
  private atkName = '';
  private hitDone = false;
  private nextAttack = 2.5;
  private chainLeft = 0;
  private combo = 0;
  private comboT = 0;
  private adds: Animal[] = [];
  private addSeed = 1;
  readonly home = new THREE.Vector3();
  private aim = new THREE.Vector3();
  private feint = false;
  private passSide = 1;
  private retreatFrom = new THREE.Vector3();
  private retreated = false;
  private chargeDist = 0;
  private lastP = new THREE.Vector3();
  private pVel = new THREE.Vector3();
  private ring?: THREE.Mesh;
  private ringMat?: THREE.MeshBasicMaterial;
  private ringT = -1;
  private ringAt = new THREE.Vector3();
  private rock?: THREE.Mesh;
  private mark?: THREE.Mesh;
  private rockT = -1;
  private rockFrom = new THREE.Vector3();
  private headSwing = 0;
  private world: World;

  constructor(readonly bdef0: BossDef, x: number, z: number, world: World, seed: number) {
    super(bossSpecies(bdef0), x, z, world, seed, { variant: 0.5, extras: (k) => decorate(bdef0, k) });
    this.bdef = bdef0;
    this.bossName = bdef0.name;
    this.phaseMarks = [bdef0.phases[0], bdef0.phases[1]];
    this.world = world;
    this.home.set(x, world.height(x, z), z);
    addRim(this.model.mat, bdef0.rim);
    if (bdef0.id === 'alfaulv' && this.model.ears[1]) this.model.ears[1].scale.set(1, 0.6, 1); // torn ear
    this.model.mesh.castShadow = true;
    this.heading = Math.PI * 0 + (bdef0.id === 'kaempebjorn' ? 0 : this.heading);
  }

  /** The boss's own number. */
  private x(key: string): number {
    return this.bdef.extra[key] ?? 0;
  }

  get bossMode(): string {
    return this.mode;
  }

  override poison(dps: number, time: number) {
    super.poison(dps * 0.5, time);
  }

  protected override onHurtState() {
    if (this.mode === 'wait') this.wake();
  }

  protected override damageMul(point: THREE.Vector3): number {
    let m = 1;
    if (this.mode === 'recover') m = this.bdef.punishMul;
    if (this.mode === 'stun') m = Math.max(this.bdef.punishMul, this.x('stunMul'));
    if (this.mode === 'howl' || this.mode === 'phase') m = this.bdef.punishMul;
    // the bear's belly is open while it stands for the crush
    if (this.bdef.id === 'kaempebjorn' && this.mode === 'telegraph' && this.atkName === 'crush') m = this.bdef.punishMul;
    void point;
    return m;
  }

  private setMode(m: Mode, t = 0) {
    this.mode = m;
    this.modeT = t;
    this.state =
      m === 'wait' ? (this.awareness > 0.3 ? 'alert' : 'idle') : m === 'telegraph' ? 'windup' : m === 'active' ? 'strike' : m === 'move' ? 'chase' : m === 'retreat' ? 'flee' : 'recover';
  }

  private wake() {
    if (this.awake) return;
    this.awake = true;
    this.awareness = 1;
    this.setMode('intro', 1.6);
    const ctx = this.lastCtx;
    if (this.bdef.id === 'alfaulv') {
      ctx?.onCue?.(this, 'howl');
      if (ctx) this.summon(ctx, this.x('adds'));
    } else {
      ctx?.onCue?.(this, 'roar');
      ctx?.onImpact?.('roar', 1, this.pos);
    }
  }

  private summon(ctx: AnimalContext, n: number) {
    const alive = this.adds.filter((a) => !a.dead).length;
    const want = Math.min(n, this.x('maxAdds') - alive);
    const P = ctx.player.pos;
    for (let i = 0; i < want; i++) {
      // come out of the forest on the far side of the hunter
      const base = Math.atan2(P.x - this.pos.x, P.z - this.pos.z) + (i - (want - 1) / 2) * 1.1;
      let placed = false;
      for (let tries = 0; tries < 12 && !placed; tries++) {
        const a = base + (tries % 2 ? 1 : -1) * tries * 0.25;
        const x = P.x + Math.sin(a) * 24;
        const z = P.z + Math.cos(a) * 24;
        if (!this.world.isFree(x, z, 1.2)) continue;
        const w = new Animal(SPECIES.ulv, x, z, this.world, this.addSeed++ * 977 + 13);
        w.state = 'chase';
        w.awareness = 1;
        (w as unknown as { stalkT: number }).stalkT = 9;
        w.heading = Math.atan2(P.x - x, P.z - z);
        this.adds.push(w);
        this.onSummon(w);
        placed = true;
      }
    }
  }

  protected override sense(dt: number, d: number, nx: number, nz: number, ctx: AnimalContext) {
    if (this.mode !== 'wait') {
      this.awareness = 1;
      return;
    }
    super.sense(dt, d, nx, nz, ctx);
    if (this.awareness >= 1 || this.state === 'chase') this.wake();
  }

  protected override think(dt: number, ctx: AnimalContext, d: number, dx: number, dz: number) {
    const toP = Math.atan2(dx, dz);
    const P = ctx.player.pos;
    // hunter velocity estimate (rock aim)
    if (dt > 0) this.pVel.set((P.x - this.lastP.x) / dt, 0, (P.z - this.lastP.z) / dt);
    if (this.pVel.lengthSq() > 200) this.pVel.set(0, 0, 0);
    this.lastP.copy(P);
    this.chaseTime = 0;
    this.modeT -= dt;
    this.updateFx(dt, ctx);

    if (this.mode === 'wait') {
      const wakeDist = this.bdef.id === 'kaempebjorn' ? 26 : this.bdef.id === 'kaempeelg' ? 24 : 30;
      if (d < wakeDist && !ctx.player.dead) this.wake();
      else if (this.bdef.id !== 'kaempebjorn') this.wander(dt, ctx);
      else {
        this.goalHeading = Math.atan2(P.x - this.pos.x, P.z - this.pos.z);
        this.turnMul = d < 40 ? 0.3 : 0;
      }
      return;
    }
    if (ctx.player.dead) {
      this.goalSpeed = 0;
      return;
    }
    // phase changes
    const frac = this.hp / this.maxHp;
    const ph = frac < this.bdef.phases[1] ? 3 : frac < this.bdef.phases[0] ? 2 : 1;
    if (ph > this.phase && this.mode !== 'active') {
      this.phase = ph;
      this.enterPhase(ctx);
      return;
    }

    switch (this.mode) {
      case 'intro':
      case 'phase':
      case 'howl':
        this.goalHeading = toP;
        this.turnMul = 0.6;
        if (this.modeT <= 0) {
          if (this.bdef.id === 'alfaulv' && this.phase === 3 && !this.retreated) this.startRetreat();
          else if (this.bdef.id === 'kaempebjorn' && this.phase === 3 && !this.retreated) this.startRetreat();
          else this.setMode('move');
        }
        break;
      case 'move':
        this.thinkMove(dt, ctx, d, toP);
        break;
      case 'telegraph':
        this.thinkTelegraph(dt, ctx, d, toP);
        break;
      case 'active':
        this.thinkActive(dt, ctx, d, toP);
        break;
      case 'recover':
        this.goalHeading = this.modeT < 0.3 ? toP : this.heading;
        this.turnMul = 0.5;
        this.skid *= Math.exp(-6 * dt);
        this.snapSpeed = this.skid > 0.05;
        this.goalSpeed = this.skid;
        if (this.modeT <= 0) {
          if (this.chainLeft > 0 && this.atkName === 'charge') {
            this.chainLeft--;
            this.startAttack('charge', ctx, 0.7);
          } else {
            this.setMode('move');
            this.nextAttack = (this.phase === 1 && this.bdef.id === 'alfaulv' ? this.x('attackEvery') * 0.6 : 0.6) + this.rng.range(0, 0.9) / this.phase;
          }
        }
        break;
      case 'stun':
        this.goalSpeed = 0;
        if (this.modeT <= 0) this.setMode('recover', 0.4);
        break;
      case 'retreat':
        this.thinkRetreat(dt, ctx, d);
        break;
    }
    void dx;
    void dz;
  }

  private enterPhase(ctx: AnimalContext) {
    this.onPhase(this.phase);
    ctx.onImpact?.('roar', 1, this.pos);
    if (this.bdef.id === 'alfaulv') {
      ctx.onCue?.(this, 'howl');
      this.setMode('howl', 1.6);
      // phase 2: howl in one more wolf if some are dead; phase 3: one more
      this.summon(ctx, 1);
    } else {
      ctx.onCue?.(this, 'roar');
      this.setMode('phase', 1.2);
    }
    if (this.phase === 3) {
      // visibly wounded: limp and bleed
      this.lame[2] = Math.max(this.lame[2], 0.6);
      this.bleed = 1;
    }
  }

  private startRetreat() {
    this.retreated = true;
    this.retreatFrom.copy(this.pos);
    this.setMode('retreat', this.bdef.id === 'kaempebjorn' ? this.x('retreatTime') + 3 : 14);
  }

  private thinkRetreat(dt: number, ctx: AnimalContext, _d: number) {
    const P = ctx.player.pos;
    if (this.bdef.id === 'kaempebjorn') {
      // back into the cave mouth, then out again
      const hx = this.home.x - this.pos.x;
      const hz = this.home.z - 4 - this.pos.z;
      const hd = Math.hypot(hx, hz);
      this.goalHeading = Math.atan2(hx, hz);
      this.goalSpeed = hd > 1.2 ? this.def.run * 0.7 : 0;
      if (hd <= 1.2) this.goalHeading = Math.atan2(P.x - this.pos.x, P.z - this.pos.z);
    } else {
      // the alpha limps away towards its den, regenerating; follow the blood trail
      this.goalHeading = Math.atan2(this.pos.x - P.x, this.pos.z - P.z);
      this.goalSpeed = this.def.run * 0.62;
      this.hp = Math.min(this.maxHp * this.x('regenCap'), this.hp + this.x('regen') * dt);
      this.bleed = 1;
      if (this.pos.distanceTo(this.retreatFrom) > this.x('retreatDist')) this.modeT = 0;
    }
    if (this.modeT <= 0) {
      this.setMode('move');
      this.nextAttack = 0.5;
    }
  }

  private pick(d: number, ctx: AnimalContext): string | null {
    let total = 0;
    const ok: [string, number][] = [];
    for (const [name, a] of Object.entries(this.bdef.attacks)) {
      if (a.phase > this.phase || a.weight <= 0) continue;
      if (d < a.min || d > a.max) continue;
      ok.push([name, a.weight]);
      total += a.weight;
    }
    // moose rear kick when the hunter hides behind it
    if (this.bdef.id === 'kaempeelg' && d < this.bdef.attacks.kick.max) {
      const P = ctx.player.pos;
      const behind = (Math.sin(this.heading) * (P.x - this.pos.x) + Math.cos(this.heading) * (P.z - this.pos.z)) / Math.max(0.1, d);
      if (behind < -0.4) return 'kick';
    }
    if (!ok.length) return null;
    let r = this.rng.next() * total;
    for (const [n, w] of ok) if ((r -= w) <= 0) return n;
    return ok[0][0];
  }

  private thinkMove(dt: number, ctx: AnimalContext, d: number, toP: number) {
    const id = this.bdef.id;
    const P = ctx.player.pos;
    this.nextAttack -= dt;
    let keep = 3;
    if (id === 'alfaulv') {
      const addsAlive = this.adds.some((a) => !a.dead);
      keep = this.phase === 1 && addsAlive ? this.x('circleFar') : this.x('circleNear');
    } else if (id === 'kaempeelg') keep = 11;
    else keep = this.def.attackRange * 0.9;
    if (this.nextAttack <= 0) {
      const name = this.pick(d, ctx);
      if (name) {
        this.startAttack(name, ctx);
        return;
      }
      // nothing fits: close in (wolf lunge from its circle, bear/moose walk up)
      if (id === 'alfaulv') {
        this.goalHeading = toP;
        this.goalSpeed = this.def.run;
        return;
      }
      keep = Math.min(keep, 3.5);
    }
    if (id === 'alfaulv') {
      // circle facing the hunter, change direction now and then
      const dx = (this.pos.x - P.x) / Math.max(0.1, d);
      const dz = (this.pos.z - P.z) / Math.max(0.1, d);
      const ang = Math.atan2(dx, dz) + this.passSide * 0.45;
      const tx = P.x + Math.sin(ang) * keep;
      const tz = P.z + Math.cos(ang) * keep;
      this.goalHeading = Math.atan2(tx - this.pos.x, tz - this.pos.z);
      this.goalSpeed = Math.min(this.def.run * 0.62, 2 + Math.abs(d - keep) * 1.2 + 4);
      if (this.rng.next() < dt / 3) this.passSide = -this.passSide;
      return;
    }
    this.goalHeading = toP;
    const room = d - keep;
    this.goalSpeed = room > 0 ? Math.min(this.phase === 3 && id === 'kaempebjorn' ? this.x('enragedRun') : room > 8 ? this.def.run * 0.8 : this.def.walk * 1.8, 1 + room * 1.5) : 0;
    if (room <= 0) this.turnMul = 1;
  }

  private startAttack(name: string, ctx: AnimalContext, teleOverride?: number) {
    const a = this.bdef.attacks[name];
    this.atk = a;
    this.atkName = name;
    this.hitDone = false;
    this.combo = 0;
    this.comboT = 0;
    this.feint = false;
    let tele = (teleOverride ?? a.telegraph) * this.diff.telegraph;
    const min = this.phase === 3 ? 0.45 : 0.6;
    if (this.phase === 3) tele *= 0.75;
    tele = Math.max(min, tele);
    this.windupTotal = tele;
    this.timer = tele;
    this.setMode('telegraph', tele);
    this.committed = false;
    this.headSwing = 0;
    if (name === 'charge' && this.bdef.id === 'kaempeelg' && teleOverride === undefined) this.chainLeft = this.phase >= 2 ? this.rng.int(1, this.x('chain') - 1) : 0;
    if (this.bdef.id === 'alfaulv' && name === 'lunge' && this.phase === 3) this.feint = this.rng.next() < this.x('feint');
    if (name === 'hamstring') this.passSide = this.rng.next() < 0.5 ? -1 : 1;
    if (name === 'rock') {
      this.ensureFx(ctx);
      if (this.rock) {
        this.rock.visible = true;
        this.rockT = -1;
      }
    }
    const cue = this.bdef.id === 'alfaulv' ? (name === 'hamstring' ? 'yelp' : 'growl') : name === 'charge' ? 'snort' : name === 'crush' ? 'roar' : 'growl';
    ctx.onCue?.(this, cue);
    if (name === 'crush') ctx.onImpact?.('roar', 0.8, this.pos);
  }

  private thinkTelegraph(dt: number, ctx: AnimalContext, d: number, toP: number) {
    const a = this.atk!;
    this.timer = this.modeT;
    const P = ctx.player.pos;
    if (this.modeT > a.commit) {
      this.goalHeading = toP;
      this.turnMul = this.bdef.id === 'kaempeelg' ? 1.2 : 1.6;
    } else if (!this.committed) {
      this.committed = true;
      ctx.onCue?.(this, 'commit');
      if (this.atkName === 'rock') this.aim.set(P.x + this.pVel.x * 1.0, 0, P.z + this.pVel.z * 1.0);
    }
    this.goalSpeed = 0;
    // moose paws twice before the charge; a scrape you can hear and see
    if (this.bdef.id === 'kaempeelg' && this.atkName === 'charge') {
      const tot = this.windupTotal;
      const el = tot - this.modeT;
      for (const at of [0.2, 0.55]) {
        if (el >= at * tot && el - dt < at * tot) {
          ctx.onCue?.(this, 'paw');
          ctx.onImpact?.('thud', 0.6, this.pos);
          this.frontPoint(_v, 0.8);
          ctx.blood?.dust(_v, 0.9);
        }
      }
    }
    if (this.atkName === 'sweep') this.headSwing = -1;
    if (this.atkName === 'rock' && this.rock) {
      // tear the rock out of the ground
      const k = 1 - this.modeT / this.windupTotal;
      this.frontPoint(_v, 1.0);
      this.rock.position.set(_v.x, this.world.height(_v.x, _v.z) + k * 1.4 * this.bdef.scale, _v.z);
      this.rock.scale.setScalar(this.bdef.scale * 0.8);
      if (this.committed && this.mark) {
        this.mark.visible = true;
        this.mark.position.set(this.aim.x, this.world.height(this.aim.x, this.aim.z) + 0.05, this.aim.z);
        this.mark.scale.setScalar(this.x('rockRadius'));
      }
    }
    if (this.modeT <= 0) this.beginActive(ctx);
    void d;
  }

  private frontPoint(out: THREE.Vector3, k: number): THREE.Vector3 {
    const r = this.model.reach * k;
    return out.set(this.pos.x + Math.sin(this.heading) * r, this.pos.y, this.pos.z + Math.cos(this.heading) * r);
  }

  private beginActive(ctx: AnimalContext) {
    const a = this.atk!;
    this.setMode('active', a.active);
    this.strikeT = 0;
    this.snoutAt(this.lungeFrom);
    this.lungeDir.set(Math.sin(this.heading), 0, Math.cos(this.heading));
    this.chargeDist = 0;
    if (this.feint) {
      // phase 3 feint: the head was turned aside; it springs sideways instead
      this.kb.set(Math.cos(this.heading) * 6 * this.passSide, 0, -Math.sin(this.heading) * 6 * this.passSide);
      this.setMode('recover', 0.5);
      ctx.onCue?.(this, 'growl');
      return;
    }
    if (this.atkName === 'stomp') {
      this.frontPoint(this.ringAt, 0.7);
      this.ringT = 0;
      this.ensureFx(ctx);
      ctx.onImpact?.('thud', 4, this.ringAt);
      ctx.onCue?.(this, 'slam');
      ctx.blood?.dustRing(this.ringAt, this.x('ringRadius'));
    }
    if (this.atkName === 'rock' && this.rock) {
      this.rockFrom.copy(this.rock.position);
      this.rockT = 0;
      ctx.onCue?.(this, 'throw');
    }
  }

  private hit(ctx: AnimalContext, kind: string) {
    if (this.hitDone) return;
    this.hitDone = true;
    const dmg = this.atk!.damage;
    this.def.damage = dmg; // the lead reads def.damage * difficulty
    this.strikeDamage = dmg * this.diff.animalDamage;
    this.strikeKind = kind;
    ctx.onStrike(this);
    ctx.onImpact?.('heavy', 1, ctx.player.pos);
  }

  private thinkActive(dt: number, ctx: AnimalContext, d: number, toP: number) {
    const a = this.atk!;
    const id = this.bdef.id;
    const name = this.atkName;
    const P = ctx.player.pos;
    this.strikeT += dt;
    const u = clamp(this.strikeT / a.active, 0, 1);
    const pr = PLAYER.radius;
    this.avoid = false;
    this.goalHeading = this.heading;
    this.turnMul = 0;
    let done = this.modeT <= 0;

    if (name === 'lunge') {
      const L = this.x('lungeDist');
      const v0 = (3 * L) / a.active;
      this.snapSpeed = true;
      this.goalSpeed = v0 * (1 - u) * (1 - u);
      if (u > 0.12) {
        this.snoutAt(_v);
        if (this.capsuleHits(ctx, this.lungeFrom, _v, this.def.radius * 0.45 + pr, this.model.snoutY + 0.4)) this.hit(ctx, 'bite');
      }
      if (done) this.skid = v0 * 0.08;
    } else if (name === 'hamstring') {
      // run past on a curve, biting on the pass
      const side = this.passSide;
      const tx = P.x + Math.cos(toP) * side * 1.0;
      const tz = P.z - Math.sin(toP) * side * 1.0;
      if (!this.hitDone && d > 2) this.goalHeading = Math.atan2(tx - this.pos.x, tz - this.pos.z);
      this.turnMul = 1.2;
      this.snapSpeed = true;
      this.goalSpeed = this.x('passSpeed');
      if (d < this.def.radius * 0.5 + pr + 0.5 && ctx.player.air < 0.6) this.hit(ctx, 'hamstring');
      if (done) this.skid = 3;
    } else if (name === 'charge') {
      const speed = this.x('chargeSpeed');
      const turn = id === 'kaempeelg' ? this.x('chargeTurn') : 0.8;
      // can be sidestepped: it barely steers, and stops steering once past the hunter
      const ahead = Math.sin(this.heading) * (P.x - this.pos.x) + Math.cos(this.heading) * (P.z - this.pos.z);
      if (ahead > 2 && !this.hitDone) this.goalHeading = toP;
      this.turnMul = (turn * (1 + speed / 4)) / this.def.turnRate;
      this.snapSpeed = true;
      this.speedNow = Math.min(speed, this.speedNow + 26 * dt);
      this.goalSpeed = this.speedNow;
      this.snoutAt(_v);
      _w.copy(_v).addScaledVector(this.lungeDir.set(Math.sin(this.heading), 0, Math.cos(this.heading)), -this.speedNow * dt * 2);
      if (this.capsuleHits(ctx, _w, _v, this.def.radius * 0.55 + pr, this.model.snoutY + 0.8)) this.hit(ctx, 'charge');
      this.chargeDist += this.speedNow * dt;
      // trees stop it (the moose is stunned: the big punish window)
      const probe = this.def.radius * 0.6 + 0.6;
      if (!this.world.isFree(this.pos.x + Math.sin(this.heading) * probe, this.pos.z + Math.cos(this.heading) * probe, 0.3)) {
        ctx.onImpact?.('thud', 5, this.pos);
        ctx.onCue?.(this, 'stun');
        this.frontPoint(_v, 1);
        ctx.blood?.dust(_v, 1.6);
        this.speedNow = 0;
        this.chainLeft = 0;
        if (id === 'kaempeelg') {
          this.setMode('stun', this.x('stun'));
          return;
        }
        done = true;
      }
      if (ahead < -6 || this.chargeDist > 28) done = true;
      if (done) this.skid = this.speedNow * 0.4;
    } else if (name === 'stomp') {
      // the expanding ring: jump over it
      const R = this.x('ringRadius') * Math.min(1, this.strikeT / this.x('ringTime'));
      const pd = Math.hypot(P.x - this.ringAt.x, P.z - this.ringAt.z);
      if (Math.abs(pd - R) < 0.7 && ctx.player.air < 0.25) this.hit(ctx, 'stomp');
    } else if (name === 'sweep') {
      this.headSwing = -1 + 2 * u;
      if (this.inArc(ctx, 2.1, a.max + this.def.radius * 0.4)) this.hit(ctx, 'antlers');
    } else if (name === 'kick') {
      const behind = Math.sin(this.heading) * (P.x - this.pos.x) + Math.cos(this.heading) * (P.z - this.pos.z);
      if (behind < 0 && d < a.max && u > 0.3) this.hit(ctx, 'kick');
    } else if (name === 'swipe') {
      // combo of alternating 100 degree swipes, each with a short tell of its own
      const swipes = this.phase === 3 ? 3 : 2;
      this.comboT += dt;
      const tell = this.combo === 0 ? 0 : Math.max(0.25, 0.3 * this.diff.telegraph);
      const live = this.comboT > tell && this.comboT < tell + a.active;
      this.headSwing = (this.combo % 2 ? 1 : -1) * (live ? 1 - 2 * ((this.comboT - tell) / a.active) : this.comboT < tell ? 1 : -1);
      if (live && this.inArc(ctx, this.x('swipeArc'), a.max + this.def.radius * 0.3)) this.hit(ctx, 'swipe');
      done = false;
      if (this.comboT >= tell + a.active) {
        this.combo++;
        this.comboT = 0;
        this.hitDone = false;
        if (this.combo >= swipes) done = true;
        else this.lastCtx?.onCue?.(this, 'growl');
      }
      this.snapSpeed = true;
      this.goalSpeed = live ? 1.5 : 0;
    } else if (name === 'crush') {
      if (this.strikeT - dt <= 0) {
        this.frontPoint(_v, 1.3);
        ctx.onImpact?.('thud', 5, _v);
        ctx.onCue?.(this, 'slam');
        ctx.blood?.dustRing(_v, 3);
        // rectangle in front
        const fx = Math.sin(this.heading);
        const fz = Math.cos(this.heading);
        const rx = P.x - this.pos.x;
        const rz = P.z - this.pos.z;
        const along = rx * fx + rz * fz;
        const side = Math.abs(rx * fz - rz * fx);
        if (along > 0.3 && along < this.x('crushLen') + this.def.radius * 0.6 && side < this.x('crushWidth') / 2 + pr && ctx.player.air < 0.6) this.hit(ctx, 'crush');
      }
    } else if (name === 'rock') {
      // landing handled in updateFx
    }
    if (done) {
      this.setMode('recover', a.recovery * (this.phase >= 2 && id === 'kaempebjorn' ? 0.8 : 1));
    }
  }

  /** Is the hunter inside the arc in front (half angle `arc`/2) and within `range`? */
  private inArc(ctx: AnimalContext, arc: number, range: number): boolean {
    const P = ctx.player.pos;
    const dx = P.x - this.pos.x;
    const dz = P.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > range + PLAYER.radius || ctx.player.air > 1.2) return false;
    const err = Math.abs(wrap(Math.atan2(dx, dz) - this.heading));
    return err < arc / 2;
  }

  private ensureFx(ctx: AnimalContext) {
    const scene = this.group.parent;
    if (!scene) return;
    if (!this.ring) {
      this.ringMat = new THREE.MeshBasicMaterial({ color: 0xd8c8a0, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide });
      this.ring = new THREE.Mesh(ringGeo, this.ringMat);
      this.ring.visible = false;
      this.ring.renderOrder = 3;
      scene.add(this.ring);
      this.mark = new THREE.Mesh(markGeo, new THREE.MeshBasicMaterial({ color: 0xff7a3a, transparent: true, opacity: 0.55, depthWrite: false }));
      this.mark.visible = false;
      scene.add(this.mark);
      this.rock = new THREE.Mesh(rockGeo, rockMat);
      this.rock.castShadow = true;
      this.rock.visible = false;
      scene.add(this.rock);
    }
    void ctx;
  }

  private updateFx(dt: number, ctx: AnimalContext) {
    if (this.ring && this.ringT >= 0) {
      this.ringT += dt;
      const k = Math.min(1, this.ringT / this.x('ringTime'));
      const R = Math.max(0.1, this.x('ringRadius') * k);
      this.ring.visible = true;
      this.ring.position.set(this.ringAt.x, this.world.height(this.ringAt.x, this.ringAt.z) + 0.06, this.ringAt.z);
      this.ring.scale.set(R, 1, R);
      this.ringMat!.opacity = 0.7 * (1 - Math.max(0, (this.ringT - this.x('ringTime')) / 0.4));
      if (this.ringT > this.x('ringTime') + 0.4) {
        this.ring.visible = false;
        this.ringT = -1;
      }
    }
    if (this.rock && this.rockT >= 0) {
      this.rockT += dt;
      const T = this.atk?.active ?? 1.1;
      const u = Math.min(1, this.rockT / T);
      const gy = this.world.height(this.aim.x, this.aim.z);
      this.rock.position.set(
        this.rockFrom.x + (this.aim.x - this.rockFrom.x) * u,
        this.rockFrom.y + (gy + 0.4 - this.rockFrom.y) * u + Math.sin(u * Math.PI) * 5,
        this.rockFrom.z + (this.aim.z - this.rockFrom.z) * u,
      );
      this.rock.rotation.x += dt * 6;
      if (u >= 1) {
        this.rockT = -1;
        if (this.mark) this.mark.visible = false;
        _v.set(this.aim.x, gy, this.aim.z);
        ctx.blood?.dust(_v, 1.6);
        ctx.onImpact?.('thud', 3, _v);
        ctx.onCue?.(this, 'slam');
        const P = ctx.player.pos;
        if (Math.hypot(P.x - _v.x, P.z - _v.z) < this.x('rockRadius') + PLAYER.radius && ctx.player.air < 0.8) {
          this.hitDone = false;
          if (this.atk) this.hit(ctx, 'rock');
        }
        this.rock.visible = false;
      }
    }
  }

  // ------------------------------------------------------------------ poses
  protected override poseTargets(out: PoseOut, ctx: AnimalContext) {
    super.poseTargets(out, ctx);
    const id = this.bdef.id;
    const m = this.mode;
    const k = m === 'telegraph' ? 1 - Math.max(0, this.modeT) / Math.max(0.01, this.windupTotal) : 0;
    const bodyY = this.model.bodyY;
    if (m === 'wait' && id === 'kaempebjorn') {
      // sitting in front of the cave
      out.pitch = -0.75;
      out.drop = -bodyY * 0.55;
      out.neck = -0.1;
      out.ears = 0.2;
      out.rate = 3;
    } else if (m === 'intro' || m === 'phase' || m === 'howl') {
      if (id === 'alfaulv') {
        out.neck = -0.9;
        out.head = -0.45;
        out.tail = 0.1;
      } else if (id === 'kaempebjorn') {
        out.pitch = -1.1;
        out.neck = -0.3;
        out.head = -0.2;
      } else {
        out.pitch = -0.35;
        out.neck = -0.4;
      }
      out.ears = -0.6;
      out.rate = 5;
    } else if (m === 'telegraph') {
      out.rate = 10;
      out.ears = -1;
      const n = this.atkName;
      if (n === 'lunge') {
        out.drop = -0.14 * k * this.bdef.scale;
        out.pitch = 0.06 * k;
        out.neck = 0.3 * k;
        out.tail = 0.4;
      } else if (n === 'hamstring') {
        out.tail = 1.0;
        out.neck = 0.1;
      } else if (n === 'charge') {
        out.neck = (id === 'kaempeelg' ? 0.75 : 0.45) * k;
        out.head = 0.3 * k;
        out.drop = -0.08 * k * bodyY;
      } else if (n === 'stomp' || n === 'kick') {
        out.pitch = n === 'stomp' ? -0.6 * k : 0.15 * k;
        out.neck = n === 'stomp' ? -0.3 * k : 0.3;
      } else if (n === 'sweep') {
        out.neck = 0.35 * k;
      } else if (n === 'swipe') {
        out.pitch = -0.35 * k;
        out.neck = -0.1;
      } else if (n === 'crush') {
        out.pitch = -1.25 * Math.min(1, k * 1.6);
        out.neck = -0.4;
        out.head = -0.3;
        out.rate = 6;
      } else if (n === 'rock') {
        out.neck = 0.6 * Math.min(1, k * 2) - 0.8 * Math.max(0, k * 2 - 1);
        out.drop = -0.2 * bodyY * Math.min(1, k * 2);
        out.pitch = -0.4 * Math.max(0, k * 2 - 1);
      }
    } else if (m === 'active') {
      out.rate = 20;
      out.ears = -1;
      const n = this.atkName;
      if (n === 'stomp') out.pitch = 0.12;
      else if (n === 'crush') {
        out.pitch = 0.2;
        out.neck = 0.4;
      } else if (n === 'charge') {
        out.neck = id === 'kaempeelg' ? 0.7 : 0.4;
        out.head = 0.25;
      } else if (n === 'swipe') {
        out.pitch = -0.3;
        out.roll = (this.combo % 2 ? 1 : -1) * 0.15;
      } else if (n === 'rock') {
        out.pitch = -0.3;
        out.neck = -0.3;
      } else if (n === 'kick') out.pitch = 0.3;
    } else if (m === 'stun') {
      out.neck = 0.8;
      out.head = 0.3;
      out.drop = -0.1 * bodyY;
      out.roll = Math.sin(this.t * 3) * 0.08;
      out.ears = -0.3;
      out.rate = 4;
    } else if (m === 'retreat') {
      out.neck = 0.35;
      out.tail = -0.2;
      out.ears = -0.6;
    }
  }

  protected override animate(dt: number, ctx: AnimalContext) {
    super.animate(dt, ctx);
    const m = this.model;
    // head swing for the moose sweep, paw raise and swing for the bear
    if (this.bdef.id === 'kaempeelg' && this.atkName === 'sweep' && (this.mode === 'telegraph' || this.mode === 'active')) {
      m.neck.rotation.y += this.headSwing * 0.8;
      m.head.rotation.z += this.headSwing * 0.3;
    }
    if (this.bdef.id === 'kaempebjorn') {
      if (this.atkName === 'swipe' && (this.mode === 'telegraph' || this.mode === 'active')) {
        const right = this.mode === 'telegraph' || this.combo % 2 === 0;
        const leg = m.legs[right ? 0 : 1];
        leg.rotation.x = -1.5;
        leg.rotation.z = (right ? -1 : 1) * 0.3 + this.headSwing * 0.6;
        m.shanks[right ? 0 : 1].rotation.x = 0.6;
      }
      if (this.mode === 'wait') {
        // sitting on its rump in front of the cave: body pitched up, hind legs forward on the ground, front legs braced
        const th = 0.85;
        const ry = m.half.y;
        const rz = m.half.z;
        m.pose.rotation.set(-th, 0, 0);
        m.pose.position.set(0, 0.12 + ry * Math.cos(th) + rz * Math.sin(th) * 0.8, rz * 0.25);
        for (let i = 2; i < 4; i++) {
          m.legs[i].rotation.set(-Math.PI / 2 + th + 0.15, 0, (i === 2 ? -1 : 1) * 0.25);
          m.shanks[i].rotation.set(-0.5, 0, 0);
        }
        for (let i = 0; i < 2; i++) {
          m.legs[i].rotation.set(th - 0.1, 0, 0);
          m.shanks[i].rotation.set(0.1, 0, 0);
        }
      }
    }
    if (this.feint && this.mode === 'telegraph') m.head.rotation.y += 0.6 * this.passSide;
  }

  /** Bosses have the HUD bar instead of the ?/! marker (which would fill the screen at this size). */
  protected override updateMarker(_ctx: AnimalContext) {
    this.sprite.visible = false;
  }

  override dispose() {
    super.dispose();
    for (const o of [this.ring, this.mark, this.rock]) o?.removeFromParent();
    this.ringMat?.dispose();
    (this.mark?.material as THREE.Material | undefined)?.dispose();
  }
}
