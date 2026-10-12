import * as THREE from 'three';
import type { SpeciesDef } from '../data/animals';
import type { World } from '../world/World';
import type { Wind } from '../world/Wind';
import type { Player } from '../player/Player';
import { lerpAngle } from '../player/Player';
import { Rng } from '../game/rng';
import { buildAnimalModel, type AnimalModel } from './models';

export type AnimalState = 'idle' | 'alert' | 'flee' | 'chase' | 'windup' | 'strike' | 'recover' | 'dead';

export interface AnimalContext {
  player: Player;
  wind: Wind;
  world: World;
  scentMul: number;
  time: number;
  onAlert: (a: Animal) => void;
  onStrike: (a: Animal) => void;
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

/** One animal with simple senses (scent along the wind, hearing, a sight cone) and a small state machine. */
export class Animal {
  readonly group: THREE.Group;
  readonly pos = new THREE.Vector3();
  heading: number;
  hp: number;
  state: AnimalState = 'idle';
  awareness = 0;
  dead = false;
  removable = false;
  private model: AnimalModel;
  private sprite: THREE.Sprite;
  private rng: Rng;
  private t = 0;
  private timer = 0;
  private fleeTime = 0;
  private chaseTime = 0;
  private waypoint?: THREE.Vector3;
  private pause = 0;
  private strikeT = 0;
  private lungeDir = new THREE.Vector3();
  private struck = false;
  private flash = 0;
  private legPhase = 0;
  private corpseT = 0;
  private lastSpeed = 0;
  private stuck = 0;
  private baseEmissive: { color: THREE.Color; intensity: number }[];

  constructor(readonly def: SpeciesDef, x: number, z: number, world: World, seed: number) {
    this.rng = new Rng(seed);
    this.hp = def.hp;
    this.heading = this.rng.range(0, Math.PI * 2);
    this.model = buildAnimalModel(def);
    this.group = this.model.group;
    this.baseEmissive = this.model.mats.map((m) => ({ color: m.emissive.clone(), intensity: m.emissiveIntensity }));
    this.pos.set(x, world.height(x, z), z);
    this.group.position.copy(this.pos);
    this.sprite = new THREE.Sprite(marker('?'));
    this.sprite.position.set(0, this.model.top + 0.7, 0);
    this.sprite.scale.set(0.8, 0.8, 1);
    this.sprite.visible = false;
    this.sprite.renderOrder = 20;
    this.group.add(this.sprite);
    this.pause = this.rng.range(0, 3);
  }

  /** Centre of the body, used for arrow hits and aiming. */
  hitCenter(): THREE.Vector3 {
    const b = this.def.body;
    return new THREE.Vector3(this.pos.x, this.pos.y + b.legs + b.height * (b.bird ? 0.5 : 0.65), this.pos.z);
  }

  /** Returns true if the hit killed the animal. */
  hurt(dmg: number, world: World, from: THREE.Vector3): boolean {
    if (this.dead) return false;
    this.hp -= dmg;
    this.flash = 0.25;
    if (this.hp <= 0) {
      this.die();
      return true;
    }
    this.awareness = 1;
    if (this.def.role === 'prey') {
      this.state = 'flee';
      this.fleeTime = 0;
    } else if (this.state !== 'windup' && this.state !== 'strike') {
      this.state = 'chase';
      this.chaseTime = 0;
    }
    void world;
    void from;
    return false;
  }

  private die() {
    this.dead = true;
    this.state = 'dead';
    this.sprite.visible = false;
  }

  update(dt: number, ctx: AnimalContext) {
    this.t += dt;
    if (this.flash > 0) {
      this.flash -= dt;
      const k = Math.max(0, this.flash / 0.25);
      this.model.mats.forEach((m, i) => {
        const base = this.baseEmissive[i];
        if (k > 0) {
          m.emissive.setRGB(k, k * 0.1, k * 0.1);
          m.emissiveIntensity = 0.9;
        } else {
          m.emissive.copy(base.color);
          m.emissiveIntensity = base.intensity;
        }
      });
    }
    if (this.dead) {
      this.corpseT += dt;
      this.group.rotation.z = Math.min(Math.PI / 2, this.corpseT * 5) * (this.def.id.length % 2 ? 1 : -1);
      this.group.position.y = this.pos.y + Math.min(1, this.corpseT * 5) * this.def.body.width * 0.4;
      if (this.corpseT > 25) this.removable = true;
      return;
    }

    const P = ctx.player.pos;
    let dx = P.x - this.pos.x;
    let dz = P.z - this.pos.z;
    const d = Math.max(0.001, Math.hypot(dx, dz));
    dx /= d;
    dz /= d;

    this.sense(dt, d, dx, dz, ctx);

    const def = this.def;
    let speed = 0;
    switch (this.state) {
      case 'idle':
        speed = this.wander(dt, ctx);
        break;
      case 'alert':
        // freeze and look at the hunter
        this.turn(Math.atan2(dx, dz), dt, 6);
        if (this.awareness < 0.12) this.state = 'idle';
        break;
      case 'flee': {
        this.fleeTime += dt;
        const zig = def.id === 'hare' ? 0.9 : 0.35;
        const away = Math.atan2(-dx, -dz) + Math.sin(this.t * 3 + this.rng.next() * 0.1) * zig;
        speed = this.steer(away, def.run, dt, ctx);
        if (d > 60 || (this.fleeTime > 9 && d > 32)) {
          this.state = 'idle';
          this.awareness = 0;
        }
        break;
      }
      case 'chase': {
        this.chaseTime += dt;
        if (ctx.player.dead || d > def.giveUp || this.chaseTime > 22) {
          this.state = 'idle';
          this.awareness = 0.2;
          break;
        }
        speed = this.steer(Math.atan2(dx, dz), def.run, dt, ctx);
        if (d < def.attackRange) {
          this.state = 'windup';
          this.timer = def.windup;
        }
        break;
      }
      case 'windup':
        this.turn(Math.atan2(dx, dz), dt, 10);
        this.timer -= dt;
        if (this.timer <= 0) {
          this.state = 'strike';
          this.strikeT = 0.2;
          this.struck = false;
          this.lungeDir.set(Math.sin(this.heading), 0, Math.cos(this.heading));
        }
        break;
      case 'strike': {
        this.strikeT -= dt;
        speed = def.lunge / 0.2;
        this.pos.addScaledVector(this.lungeDir, speed * dt);
        ctx.world.collide(this.pos, def.radius * 0.5);
        if (!this.struck && d < def.attackRange + 0.7) {
          this.struck = true;
          ctx.onStrike(this);
        }
        if (this.strikeT <= 0) {
          this.state = 'recover';
          this.timer = def.cooldown;
        }
        break;
      }
      case 'recover':
        this.timer -= dt;
        this.turn(Math.atan2(dx, dz), dt, 3);
        if (this.timer <= 0) {
          this.state = ctx.player.dead ? 'idle' : 'chase';
          if (d < def.attackRange) {
            this.state = 'windup';
            this.timer = def.windup * 0.8;
          }
        }
        break;
    }

    // defenders that were noticed from afar only react once you get close
    if ((this.state === 'alert' || this.state === 'idle') && def.role === 'defender' && this.awareness >= 1 && d < def.aggroRange) {
      this.state = 'chase';
      this.chaseTime = 0;
    }

    this.pos.y = ctx.world.height(this.pos.x, this.pos.z);
    this.lastSpeed = speed;
    this.animate(dt, speed);
    this.updateMarker(ctx);
  }

  private sense(dt: number, d: number, nx: number, nz: number, ctx: AnimalContext) {
    const def = this.def;
    const active = this.state === 'chase' || this.state === 'windup' || this.state === 'strike' || this.state === 'recover' || this.state === 'flee';
    if (active) {
      this.awareness = 1;
      return;
    }
    // scent drifts with the wind from the hunter towards the animal
    const cosw = -(ctx.wind.dx * nx + ctx.wind.dz * nz);
    const f = Math.min(1.8, Math.max(0.25, 1 + 0.75 * ctx.wind.strength * cosw));
    const smellR = def.smell * f * ctx.scentMul;
    const hearR = ctx.player.noise;
    let closeness = 0;
    if (d < smellR) closeness = Math.max(closeness, 1 - d / smellR);
    if (d < hearR) closeness = Math.max(closeness, 1 - d / hearR);
    if (d < def.sight) {
      const facing = Math.sin(this.heading) * nx + Math.cos(this.heading) * nz;
      if (facing > 0.35 && !ctx.world.lineBlocked(this.hitCenter(), ctx.player.chest)) closeness = Math.max(closeness, 1 - d / def.sight);
    }
    if (d < 4) closeness = 1;
    if (closeness > 0) this.awareness = Math.min(1, this.awareness + dt * (0.45 + 2.2 * closeness));
    else this.awareness = Math.max(0, this.awareness - dt * 0.3);

    if (this.state === 'idle' && this.awareness > 0.3) {
      this.state = 'alert';
      ctx.onAlert(this);
    }
    if (this.awareness >= 1 && (this.state === 'idle' || this.state === 'alert')) {
      if (def.role === 'prey') {
        this.state = 'flee';
        this.fleeTime = 0;
      } else if (def.role === 'predator') {
        this.state = 'chase';
        this.chaseTime = 0;
      }
      // defenders are handled in update(): they stay alert until the hunter is close
    }
  }

  private wander(dt: number, ctx: AnimalContext): number {
    if (this.pause > 0) {
      this.pause -= dt;
      return 0;
    }
    if (!this.waypoint || this.pos.distanceTo(this.waypoint) < 1 || this.stuck > 1.2) {
      const a = this.rng.range(0, Math.PI * 2);
      const r = this.rng.range(3, 9);
      this.waypoint = new THREE.Vector3(this.pos.x + Math.sin(a) * r, 0, this.pos.z + Math.cos(a) * r);
      this.pause = this.rng.range(1.5, 5);
      this.stuck = 0;
      return 0;
    }
    const ang = Math.atan2(this.waypoint.x - this.pos.x, this.waypoint.z - this.pos.z);
    return this.steer(ang, this.def.walk, dt, ctx);
  }

  /** Moves towards a heading, bending around trees. Returns the speed achieved. */
  private steer(angle: number, speed: number, dt: number, ctx: AnimalContext): number {
    const r = this.def.radius * 0.55;
    let chosen = angle;
    const offsets = [0, 0.5, -0.5, 1.0, -1.0, 1.6, -1.6];
    for (const o of offsets) {
      const a = angle + o;
      if (ctx.world.isFree(this.pos.x + Math.sin(a) * 2.4, this.pos.z + Math.cos(a) * 2.4, r)) {
        chosen = a;
        break;
      }
    }
    this.turn(chosen, dt, 9);
    const before = this.pos.clone();
    const sp = speed * (this.def.role === 'prey' && this.state === 'idle' ? 1 : 1);
    this.pos.x += Math.sin(this.heading) * sp * dt;
    this.pos.z += Math.cos(this.heading) * sp * dt;
    ctx.world.collide(this.pos, r);
    const moved = before.distanceTo(this.pos) / dt;
    this.stuck = moved < speed * 0.3 ? this.stuck + dt : 0;
    return moved;
  }

  private turn(target: number, dt: number, rate: number) {
    this.heading = lerpAngle(this.heading, target, Math.min(1, dt * rate));
  }

  private animate(dt: number, speed: number) {
    const g = this.group;
    g.position.copy(this.pos);
    g.rotation.set(0, this.heading, 0);
    this.legPhase += dt * (3 + speed * 1.8);
    const amp = Math.min(0.9, speed * 0.12);
    this.model.legs.forEach((leg, i) => {
      leg.rotation.x = Math.sin(this.legPhase + (i % 2 === 0 ? 0 : Math.PI) + (i > 1 ? Math.PI / 2 : 0)) * amp;
    });
    if (this.def.body.bird && this.state === 'flee') g.position.y += Math.abs(Math.sin(this.t * 14)) * 0.25;
    if (this.state === 'windup') {
      // rear back and shake: a clear warning that a strike is coming
      const k = 1 - Math.max(0, this.timer) / Math.max(0.01, this.def.windup);
      g.rotation.x = -0.25 * k;
      g.position.x += Math.sin(this.t * 60) * 0.03 * k;
      this.model.head.rotation.x = 0.35 * k;
    } else if (this.state === 'strike') {
      g.rotation.x = 0.15;
      this.model.head.rotation.x = 0.1;
    } else {
      this.model.head.rotation.x = this.state === 'alert' ? -0.25 : this.state === 'idle' && speed < 0.1 ? 0.35 : 0;
    }
  }

  private updateMarker(ctx: AnimalContext) {
    let kind: '?' | '!' | null = null;
    if (this.state === 'alert') kind = this.awareness > 0.7 ? '!' : '?';
    else if (this.state === 'chase' || this.state === 'windup') kind = '!';
    const near = ctx.player.pos.distanceTo(this.pos) < 55;
    if (kind && near) {
      this.sprite.visible = true;
      this.sprite.material = marker(kind);
      const s = 0.7 + Math.sin(this.t * 10) * (kind === '!' ? 0.06 : 0);
      this.sprite.scale.set(s, s, 1);
    } else this.sprite.visible = false;
  }

  /** For tests and the HUD. */
  get speed() {
    return this.lastSpeed;
  }
}
