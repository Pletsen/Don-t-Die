import Phaser from 'phaser';
import { mixColor, palette } from '../game/palette';
import { RARITIES, type Rarity } from '../game/skins';
import { TEX } from '../fx/textures';
import { FxPool, Fade } from './fxPool';
import { BOLT_ARCS, BOLT_R, BOLT_STRIKES, SHELL_R, SHOP_TEX } from './shopTextures';
import { shopSfx } from './shopSfx';
import { CREAK, TEASE_BUILD, crossed, overloadAt, rankOf, type Plan } from './QuackReactor';

// The QUACK REACTOR's reveal: the screen-edge glow that builds with the
// overload, the burst (shockwaves, a chromatic flash, flying debris, a kick
// of the camera), the orb that flies out of the reactor inside an energy shell
// whose colour is the rarity (with energy swirling inside and motes orbiting
// it), and everything that escalates with it (smoke, lightning, spark rain,
// screen shake, slow motion, light beams), the upgrade tease and the shell
// cracking open. The skin and its card are SkinShop's; this class is pure
// effect, driven by the show's clock. All sprites are made once and pooled,
// all glows are baked textures blended additively: no filters.

/** Where the prize sits in the reveal (origin at the screen's centre). */
export const PRIZE_Y = -92;

/** Per rarity (common, rare, epic, legendary). */
const DIM = [0.87, 0.89, 0.92, 0.94];
const VIGNETTE = [0, 0.3, 0.8, 0.9];
const FLASH = [0.5, 0.8, 1, 1];
const SPARKS = [10, 20, 32, 50];
const SMOKE = [3, 5, 6, 8];
/** Shockwaves at the burst. */
const WAVES = [2, 3, 4, 5];
const DEBRIS = [8, 12, 16, 22];
const BEAMS = [0, 0, 6, 12];
const BEAM_ALPHA = [0, 0, 0.22, 0.5];
/** Screen-edge glow: its peak in the overload, and what stays while the shell holds. */
const EDGE = [0.2, 0.42, 0.62, 0.85];
const EDGE_HOLD = [0, 0.12, 0.24, 0.38];
/** Camera kick (zoom punch) at the burst. */
const KICK = [0.025, 0.04, 0.055, 0.075];
const ORBITERS = [3, 5, 7, 10];
/** How dark the screen goes behind the reactor while it charges. */
const STAGE_DIM = 0.9;
/** Shell size on screen (texture scale). */
const SHELL_SCALE = 0.95;
/** The shell's rim radius on screen. */
const SHELL_RIM = SHELL_R * SHELL_SCALE;
const CHROMA = [0xff2a5a, 0x2ae0ff];

interface Timed {
  img: Phaser.GameObjects.Image;
  age: number;
  life: number;
  s0: number;
  s1: number;
  a0: number;
  spin: number;
}

const timed = (img: Phaser.GameObjects.Image): Timed => ({ img: img.setVisible(false), age: 1, life: 1, s0: 0, s1: 0, a0: 0, spin: 0 });

export class ReactorReveal {
  /** Behind the prize. */
  readonly back: Phaser.GameObjects.Container;
  /** Over the prize. */
  readonly front: Phaser.GameObjects.Container;

  private vignette: Phaser.GameObjects.Image;
  private edge: Phaser.GameObjects.Image;
  private beams: Phaser.GameObjects.Container;
  private beamImgs: Phaser.GameObjects.Image[] = [];
  private halo: Phaser.GameObjects.Image;
  private waves: Timed[] = [];
  private orb: Phaser.GameObjects.Container;
  private orbGlow: Phaser.GameObjects.Image;
  private orbCore: Phaser.GameObjects.Image;
  private swirls: Phaser.GameObjects.Image[] = [];
  private shell: Phaser.GameObjects.Image;
  private cracks: Phaser.GameObjects.Image;
  private orbiters: Phaser.GameObjects.Image[] = [];
  private bolts: Phaser.GameObjects.Image[] = [];
  private boltUntil: number[] = [];
  /** White flash and its two chromatic ghosts. */
  private flashes: Timed[] = [];
  private flare: Timed;
  private screenFlash: Phaser.GameObjects.Rectangle;
  private screenFlashA = 0;
  private screenFlashLife = 1;
  private screenFlashAge = 1;
  private smoke: FxPool;
  private rain: FxPool;
  private sparks: FxPool;
  private shards: FxPool;
  private debris: FxPool;
  private lines: FxPool;

  private plan: Plan | null = null;
  /** Colour the shell shows now (changes at an upgrade). */
  private shown: Rarity = 'common';
  private from = { x: 0, y: 0 };
  private dimTarget = 0.8;
  private vignetteTarget = 0;
  private edgeColor: number = palette.magenta;
  private beamCount = 0;
  private beamAlpha = 0;
  private beamsOn = 0;
  private slowUntil = -1;
  private nextBolt = 0;
  private nextZap = 0;
  private nextSmoke = 0;
  private nextRumble = 0;
  private rainDebt = 0;
  private fountainDebt = 0;
  private cracked = false;
  private screenW = 400;
  private screenH = 800;
  /** Zoom punch (SkinShop scales the reveal by 1 + kick); decays by itself. */
  kick = 0;
  /** Wall-clock ms, for pulses that keep going while the card is up. */
  private clock = 0;

  constructor(
    private scene: Phaser.Scene,
    private dim: Phaser.GameObjects.Rectangle,
  ) {
    const add = scene.add;
    const ADD = Phaser.BlendModes.ADD;
    this.vignette = add.image(0, 0, TEX.vignette).setAlpha(0);
    this.beams = add.container(0, PRIZE_Y);
    for (let i = 0; i < 12; i++) {
      const b = add.image(0, 0, SHOP_TEX.beam).setOrigin(0.5, 1).setBlendMode(ADD);
      this.beamImgs.push(b);
      this.beams.add(b);
    }
    this.halo = add.image(0, PRIZE_Y, SHOP_TEX.halo).setBlendMode(ADD).setAlpha(0);
    for (let i = 0; i < 10; i++) this.waves.push(timed(add.image(0, 0, i % 3 ? SHOP_TEX.ring : SHOP_TEX.wave).setBlendMode(ADD)));
    this.smoke = new FxPool(scene, SHOP_TEX.smoke, 18, Phaser.BlendModes.NORMAL);
    this.debris = new FxPool(scene, TEX.shard, 24, Phaser.BlendModes.NORMAL);
    this.rain = new FxPool(scene, TEX.streak, 44);
    this.orbGlow = add.image(0, 0, TEX.glow).setBlendMode(ADD);
    this.orbCore = add.image(0, 0, TEX.glow).setBlendMode(ADD).setTint(0xffffff);
    for (let i = 0; i < 2; i++) this.swirls.push(add.image(0, 0, SHOP_TEX.swirl).setBlendMode(ADD).setScale((SHELL_SCALE / 2) * (i ? 0.78 : 1)));
    this.shell = add.image(0, 0, SHOP_TEX.shell).setBlendMode(ADD).setScale(SHELL_SCALE / 2);
    this.cracks = add.image(0, 0, SHOP_TEX.cracks).setBlendMode(ADD).setScale(SHELL_SCALE / 2).setAlpha(0);
    for (let i = 0; i < 10; i++) this.orbiters.push(add.image(0, 0, TEX.spark).setBlendMode(ADD).setVisible(false));
    const orbParts: Phaser.GameObjects.GameObject[] = [this.orbGlow, this.orbCore, ...this.swirls, this.shell, this.cracks, ...this.orbiters];
    for (let i = 0; i < 5; i++) {
      const b = add.image(0, 0, SHOP_TEX.boltArc(0)).setBlendMode(ADD).setVisible(false);
      this.bolts.push(b);
      this.boltUntil.push(0);
      orbParts.push(b);
    }
    this.orb = add.container(0, PRIZE_Y, orbParts);
    this.sparks = new FxPool(scene, TEX.spark, 72);
    this.shards = new FxPool(scene, TEX.shard, 26);
    this.lines = new FxPool(scene, TEX.streak, 30);
    this.back = add.container(0, 0, [
      this.vignette,
      this.beams,
      this.halo,
      ...this.waves.map((r) => r.img),
      ...this.smoke.sprites,
      ...this.debris.sprites,
      ...this.rain.sprites,
      this.orb,
      ...this.lines.sprites,
      ...this.sparks.sprites,
      ...this.shards.sprites,
    ]);
    for (const tint of [0xffffff, ...CHROMA]) this.flashes.push(timed(add.image(0, 0, SHOP_TEX.halo).setBlendMode(ADD).setTint(tint)));
    this.flare = timed(add.image(0, 0, SHOP_TEX.flare).setBlendMode(ADD));
    this.edge = add.image(0, 0, SHOP_TEX.edge).setBlendMode(ADD).setAlpha(0).setVisible(false);
    this.screenFlash = add.rectangle(0, 0, 4000, 4000, 0xffffff, 1).setBlendMode(ADD).setVisible(false);
    // The flashes go over the prize in the order white, then the colour fringes.
    this.front = add.container(0, 0, [this.edge, ...this.flashes.map((f) => f.img), this.flare.img, this.screenFlash]);
  }

  /** Screen size in reveal coordinates (the reveal is unscaled screen pixels). */
  layout(w: number, h: number) {
    this.screenW = w;
    this.screenH = h;
    this.vignette.setDisplaySize(w * 1.05, h * 1.05);
    this.edge.setDisplaySize(w + 4, h + 4);
  }

  get shellRarity() {
    return this.shown;
  }

  /** A new show: the screen starts to darken round the reactor; the rest waits for the burst. */
  begin(plan: Plan) {
    this.plan = plan;
    this.shown = plan.first;
    this.cracked = false;
    this.slowUntil = -1;
    this.beamsOn = 0;
    this.beamCount = 0;
    this.kick = 0;
    this.beams.setAlpha(0);
    this.halo.setAlpha(0);
    this.orb.setVisible(false);
    this.cracks.setAlpha(0);
    this.vignette.setAlpha(0);
    this.vignetteTarget = 0;
    this.dim.setAlpha(0);
    this.dimTarget = STAGE_DIM;
    this.edge.setVisible(true).setAlpha(0);
    this.edgeColor = palette.magenta;
    for (const b of this.bolts) b.setVisible(false);
    for (const o of this.orbiters) o.setVisible(false);
  }

  clear() {
    this.plan = null;
    this.kick = 0;
    for (const p of [this.smoke, this.rain, this.sparks, this.shards, this.debris, this.lines]) p.clear();
    for (const r of [...this.waves, ...this.flashes, this.flare]) r.img.setVisible(false);
    this.screenFlash.setVisible(false);
    this.edge.setVisible(false);
    this.orb.setVisible(false);
  }

  /**
   * One frame of the show. `from` is the reactor core in reveal coordinates
   * (where the orb flies out of).
   */
  update(dt: number, prev: number, now: number, from: { x: number; y: number }, quiet: boolean, reduced: boolean) {
    const p = this.plan;
    this.clock += dt;
    if (!p) return;
    this.from = from;
    const t = now;
    const slow = t < this.slowUntil ? 0.22 : 1;
    const s = (dt / 1000) * slow;

    // Epic and legendary overloads rumble the whole screen as they build.
    const u = overloadAt(p, t);
    if (u > 0.4 && t < p.blast - 140 && rankOf(p.first) >= 2 && !quiet && !reduced && this.clock >= this.nextRumble) {
      this.nextRumble = this.clock + 90;
      const k = (u - 0.4) / 0.6;
      this.scene.cameras.main.shake(110, (rankOf(p.first) === 3 ? 0.006 : 0.003) * k * k);
    }
    if (crossed(p.blast, prev, now)) this.onset(p.first, quiet, reduced, true);
    if (p.tease && t >= p.upgrade - TEASE_BUILD && t < p.upgrade) {
      // Tease: the shell trembles and light of the next colour leaks through cracks.
      const k = (t - (p.upgrade - TEASE_BUILD)) / TEASE_BUILD;
      this.cracks.setTint(RARITIES[p.rarity].color).setAlpha(0.15 + 0.6 * k);
      if (!quiet && (crossed(p.upgrade - TEASE_BUILD, prev, now) || crossed(p.upgrade - TEASE_BUILD * 0.45, prev, now))) shopSfx.creak(k);
    }
    if (crossed(p.upgrade, prev, now)) {
      this.cracks.setAlpha(0);
      this.onset(p.rarity, quiet, reduced, false);
    }
    if (crossed(p.snap, prev, now)) this.snap(quiet, reduced);
    if (t >= p.crack - CREAK && t < p.crack) {
      const k = (t - (p.crack - CREAK)) / CREAK;
      this.cracks.setTint(mixColor(0xffffff, RARITIES[p.rarity].color, 0.4)).setAlpha(Math.min(1, 0.2 + k));
      for (const c of [0, 0.4, 0.8]) if (!quiet && crossed(p.crack - CREAK * (1 - c), prev, now)) shopSfx.creak(c);
    }
    if (crossed(p.crack, prev, now)) this.shatter(quiet, reduced);

    // The orb: out of the reactor, up to the middle, then it floats.
    if (this.orb.visible) {
      const color = RARITIES[this.shown].color;
      const rank = rankOf(this.shown);
      let x = 0;
      let y = PRIZE_Y;
      let sc = 1;
      if (t < p.arrive) {
        const k = Math.max(0, (t - p.blast) / (p.arrive - p.blast));
        const e = 1 - Math.pow(1 - k, 3);
        x = this.from.x + (0 - this.from.x) * e;
        y = this.from.y + (PRIZE_Y - this.from.y) * e - Math.sin(k * Math.PI) * 40;
        sc = 0.35 + 0.65 * e;
      } else y += Math.sin(this.clock * 0.0024) * 5;
      // Creaking: it shivers harder and harder.
      let shiver = 0;
      if (t >= p.crack - CREAK) shiver = 1.5 + 4 * ((t - (p.crack - CREAK)) / CREAK);
      else if (p.tease && t >= p.upgrade - TEASE_BUILD && t < p.upgrade) shiver = 2.5;
      if (shiver > 0 && !reduced) {
        x += (Math.random() - 0.5) * shiver;
        y += (Math.random() - 0.5) * shiver;
      }
      // It swells as it's about to break.
      const swell = t >= p.crack - CREAK ? 0.08 * ((t - (p.crack - CREAK)) / CREAK) : 0;
      const pulse = 1 + 0.025 * Math.sin(this.clock * 0.006) + swell;
      this.orb.setPosition(x, y).setScale(sc * pulse);
      this.shell.rotation += s * 0.3;
      // Energy swirling inside: two spirals turning against each other, faster for rarer.
      const sw = 1.4 + rank * 0.7;
      this.swirls[0].setTint(mixColor(color, 0xffffff, 0.35)).setAlpha(0.5 + 0.1 * rank).rotation += s * sw;
      this.swirls[1].setTint(color).setAlpha(0.4 + 0.08 * rank).rotation -= s * sw * 1.6;
      this.orbGlow.setTint(color).setScale(1.5 + 0.1 * Math.sin(this.clock * 0.009)).setAlpha(0.9);
      this.orbCore.setScale(0.55 + 0.05 * Math.sin(this.clock * 0.013) + swell * 3).setAlpha(0.95);
      this.orbit(rank, color);
      this.halo.setPosition(x, y);
      this.beams.setPosition(x, y);
      this.holdFx(t, s, slow, x, y, quiet);
    }

    // Light beams (epic, legendary): fade in, turn slowly.
    if (this.beamCount > 0) {
      this.beamsOn = Math.min(1, this.beamsOn + s * 3);
      this.beams.setAlpha(this.beamAlpha * this.beamsOn).setScale(0.3 + 0.7 * (1 - Math.pow(1 - this.beamsOn, 3)));
      this.beams.rotation += s * 0.25;
    }
    if (this.halo.alpha > 0) this.halo.setScale(1.5 + Math.sin(this.clock * 0.0022) * 0.06);

    // Dim and vignette ease towards their targets.
    const ease = 1 - Math.exp(-dt / 90);
    this.dim.setAlpha(this.dim.alpha + (this.dimTarget - this.dim.alpha) * ease);
    this.vignette.setAlpha(this.vignette.alpha + (this.vignetteTarget - this.vignette.alpha) * ease);
    this.edgeGlow(p, t, dt, reduced);
    this.stepAll(s, dt);
  }

  /** Card time: keep the halo, beams and a little celebration going. */
  idle(dt: number) {
    this.clock += dt;
    const s = dt / 1000;
    if (this.beamCount > 0) this.beams.rotation += s * 0.25;
    if (this.halo.alpha > 0) this.halo.setScale(1.5 + Math.sin(this.clock * 0.0022) * 0.06);
    if (this.plan?.rarity === 'legendary') this.emitRain(s * 18, RARITIES.legendary.color);
    if (this.plan) this.edgeGlow(this.plan, Infinity, dt, false);
    this.stepAll(s, dt);
  }

  private stepAll(s: number, dt: number) {
    // Flashes run on real time (a slow-motion flash would just wash the screen out).
    for (const f of this.flashes) this.stepTimed(f, dt / 1000);
    this.stepTimed(this.flare, s);
    for (const r of this.waves) this.stepTimed(r, s);
    if (this.screenFlash.visible) {
      this.screenFlashAge += dt / 1000;
      const k = this.screenFlashAge / this.screenFlashLife;
      if (k >= 1) this.screenFlash.setVisible(false);
      else this.screenFlash.setAlpha(this.screenFlashA * (1 - k) * (1 - k));
    }
    this.kick *= Math.exp(-dt / 110);
    if (this.kick < 0.0005) this.kick = 0;
    // Bolts are short-lived flickers.
    for (let i = 0; i < this.bolts.length; i++) if (this.bolts[i].visible && this.clock >= this.boltUntil[i]) this.bolts[i].setVisible(false);
    this.smoke.update(s);
    this.debris.update(s);
    this.rain.update(s);
    this.lines.update(s);
    this.sparks.update(s);
    this.shards.update(s);
  }

  /**
   * The screen's edges glow: faintly while the ducks go in, swelling and
   * beating with the overload as the colour turns from the reactor's pink to
   * the rarity's, a peak at the burst, then a low glow while the shell holds.
   */
  private edgeGlow(p: Plan, t: number, dt: number, reduced: boolean) {
    const r = rankOf(t < p.blast ? p.first : this.shown);
    const color = RARITIES[t < p.blast ? p.first : this.shown].color;
    let target: number;
    let tint: number;
    if (t < p.feedEnd) {
      target = 0.12;
      tint = p.free ? 0xffd21f : palette.magenta;
    } else if (t < p.blast) {
      const u = overloadAt(p, t);
      const beat = Math.pow(Math.max(0, Math.sin(this.clock * (0.008 + 0.03 * u * u))), 4);
      target = EDGE[r] * (0.2 + 0.8 * u * u) * (0.8 + 0.2 * beat) + 0.12 * beat * u;
      tint = mixColor(palette.magenta, color, Math.min(1, Math.max(0, (u - 0.15) / 0.55)));
    } else if (t < p.crack) {
      target = EDGE_HOLD[r] * (0.85 + 0.15 * Math.sin(this.clock * 0.006));
      tint = color;
    } else {
      target = rankOf(p.rarity) === 3 ? 0.22 + 0.06 * Math.sin(this.clock * 0.004) : 0;
      tint = RARITIES[p.rarity].color;
    }
    if (reduced) target *= 0.5;
    if (tint !== this.edgeColor) {
      this.edgeColor = tint;
      this.edge.setTint(tint);
    }
    const ease = 1 - Math.exp(-dt / (t < p.blast ? 60 : 260));
    this.edge.setAlpha(this.edge.alpha + (target - this.edge.alpha) * ease);
  }

  /** Motes orbiting the shell on tilted rings, bigger and brighter on the near side. */
  private orbit(rank: number, color: number) {
    const n = ORBITERS[rank];
    const c = this.clock * 0.001 * (1 + rank * 0.25);
    for (let i = 0; i < this.orbiters.length; i++) {
      const o = this.orbiters[i];
      o.setVisible(i < n);
      if (i >= n) continue;
      const speed = (1.6 + (i % 3) * 0.5) * (i % 2 ? 1 : -1);
      const th = c * speed + i * 2.4;
      const tilt = i * 1.3;
      const rx = SHELL_RIM * (1.08 + 0.06 * (i % 3));
      const ry = rx * 0.32;
      const ex = Math.cos(th) * rx;
      const ey = Math.sin(th) * ry;
      const depth = Math.sin(th);
      o.setPosition(ex * Math.cos(tilt) - ey * Math.sin(tilt), ex * Math.sin(tilt) + ey * Math.cos(tilt))
        .setScale(0.3 + 0.16 * depth)
        .setAlpha(0.45 + 0.55 * (depth * 0.5 + 0.5))
        .setTint(i % 3 ? color : 0xffffff);
    }
  }

  /** A colour shows (at the burst, or the upgrade flare): the rarity's entrance. */
  private onset(r: Rarity, quiet: boolean, reduced: boolean, blast: boolean) {
    const rank = rankOf(r);
    const color = RARITIES[r].color;
    this.shown = r;
    this.dimTarget = DIM[rank];
    this.vignetteTarget = VIGNETTE[rank];
    this.shell.setTint(color);
    this.orb.setVisible(true);
    this.halo.setTint(color);
    if (rank >= 2) this.halo.setAlpha(0.35);
    if (blast) this.orb.setPosition(this.from.x, this.from.y).setScale(0.35);
    if (rank === 2 && BEAMS[rank] > this.beamCount) this.setBeams(rank);
    // Legendary: slow motion until time snaps back.
    if (r === 'legendary' && !quiet && this.plan) this.slowUntil = this.plan.snap;
    if (quiet) {
      if (blast) this.dim.setAlpha(this.dimTarget);
      return;
    }
    const at = blast ? this.from : { x: this.orb.x, y: this.orb.y };
    const fx = reduced ? 0.5 : 1;
    const hot = mixColor(0xffffff, color, 0.35);
    this.flashAt(at.x, at.y, [2.6, 3.2, 3.9, 4.6][rank], FLASH[rank] * fx, blast ? 0.45 : 0.5, hot, rank >= 1 && !reduced);
    // Shockwaves: a thick soft one first, then thinner, faster rings, staggered.
    for (let i = 0; i < WAVES[rank]; i++) {
      this.wave(at.x, at.y, 0.2, 1.6 + i * 0.75 + rank * 0.25, 0.55 + i * 0.12, i === 0 ? hot : i % 2 ? color : 0xffffff, i * 0.07, i % 2 ? 0.8 : -0.8);
    }
    if (rank >= 1 && !reduced) {
      // Chromatic split on the first shockwave.
      CHROMA.forEach((c, k) => this.wave(at.x + (k ? 7 : -7), at.y, 0.2, 1.75 + rank * 0.25, 0.5, c, 0.02, 0, 0.55));
    }
    this.burstSparks(at.x, at.y, SPARKS[rank], color, 1 + rank * 0.3);
    if (blast) {
      // Twisted metal from the lid.
      for (let i = 0; i < DEBRIS[rank]; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = 220 + Math.random() * 320;
        this.debris.emit({
          x: at.x + Math.cos(a) * 20,
          y: at.y + Math.sin(a) * 20,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v - 120,
          gravity: 700,
          drag: 0.5,
          life: 0.8 + Math.random() * 0.5,
          scale: 0.35 + Math.random() * 0.45,
          scaleTo: 0.25,
          angle: Math.random() * 6,
          spin: (Math.random() - 0.5) * 18,
          tint: i % 4 ? mixColor(0x6a7488, 0xc8d0e4, Math.random()) : i % 8 ? 0xffd21f : color,
        });
      }
      this.speedLines(at.x, at.y, 8 + rank * 5, mixColor(color, 0xffffff, 0.5), 30);
    }
    for (let i = 0; i < SMOKE[rank]; i++) {
      const a = Math.random() * Math.PI * 2;
      this.smoke.emit({
        x: at.x + Math.cos(a) * 30,
        y: at.y + Math.sin(a) * 30,
        vx: Math.cos(a) * (30 + Math.random() * 40),
        vy: Math.sin(a) * (30 + Math.random() * 40) - 15,
        drag: 0.9,
        life: 1.3 + Math.random() * 0.6,
        scale: 0.9,
        scaleTo: 2.4,
        alpha: 0.4,
        tint: mixColor(0x6a7486, color, 0.45),
        spin: Math.random() - 0.5,
        fade: Fade.Puff,
      });
    }
    this.kick = Math.max(this.kick, KICK[rank] * (reduced ? 0.3 : 1));
    if (blast) this.edge.setAlpha(Math.min(1, EDGE[rank] * 1.25 * (reduced ? 0.5 : 1)));
    const cam = this.scene.cameras.main;
    if (rank <= 1) this.screenFlashOn(hot, (rank ? 0.16 : 0.1) * fx, 0.3);
    if (rank === 1 && !reduced) cam.shake(160, 0.003);
    if (rank === 2) {
      if (!reduced) cam.shake(300, 0.007);
      this.screenFlashOn(color, reduced ? 0.08 : 0.26, 0.4);
    }
    if (rank === 3) {
      cam.shake(reduced ? 300 : 850, reduced ? 0.003 : 0.015);
      this.screenFlashOn(0xfff2c0, reduced ? 0.15 : 0.45, 0.6);
      shopSfx.slowmo();
    }
    if (blast) shopSfx.blast(r);
    else shopSfx.upgrade(r);
  }

  /** Legendary: time snaps back, the beams shoot out, gold sparks fountain. */
  private snap(quiet: boolean, reduced: boolean) {
    this.slowUntil = -1;
    this.setBeams(3);
    if (quiet) {
      this.beamsOn = 1;
      return;
    }
    const color = RARITIES.legendary.color;
    const { x, y } = this.orb;
    this.wave(x, y, 0.4, 3.4, 0.7, 0xffffff, 0, 0);
    this.wave(x, y, 0.3, 2.6, 0.6, color, 0.08, 0.6);
    if (!reduced) CHROMA.forEach((c, k) => this.wave(x + (k ? 8 : -8), y, 0.4, 3.5, 0.6, c, 0.02, 0, 0.5));
    this.burstSparks(x, y, 34, color, 1.7);
    this.speedLines(x, y, 20, 0xfff2c0, 0);
    this.flashAt(x, y, 4.4, reduced ? 0.5 : 1, 0.5, 0xfff2c0, !reduced);
    this.kick = Math.max(this.kick, reduced ? 0.02 : 0.07);
    if (!reduced) this.scene.cameras.main.shake(380, 0.009);
    shopSfx.beams();
  }

  private setBeams(rank: number) {
    const color = RARITIES[rank === 3 ? 'legendary' : 'epic'].color;
    const n = BEAMS[rank];
    this.beamCount = n;
    this.beamAlpha = BEAM_ALPHA[rank];
    this.beamsOn = 0;
    this.beamImgs.forEach((b, i) => {
      const on = i < n;
      b.setVisible(on);
      if (!on) return;
      b.setRotation((i / n) * Math.PI * 2)
        .setTint(i % 2 ? color : mixColor(color, 0xffffff, 0.55))
        .setScale(i % 2 ? 0.75 : 1, (i % 2 ? 0.8 : 1.05) * (rank === 3 ? 1.25 : 0.85));
    });
    this.halo.setTint(color).setAlpha(0.6);
  }

  /** While the shell holds: lightning, spark rain, smoke, by its colour. */
  private holdFx(t: number, s: number, slow: number, x: number, y: number, quiet: boolean) {
    const p = this.plan!;
    if (quiet || t >= p.crack || t < p.blast + 120) return;
    const rank = rankOf(this.shown);
    const color = RARITIES[this.shown].color;
    // Lightning (rare and up).
    if (rank >= 1 && this.clock >= this.nextBolt) {
      const [lo, hi] = rank === 1 ? [140, 300] : rank === 2 ? [60, 150] : [150, 280];
      this.nextBolt = this.clock + (lo + Math.random() * (hi - lo)) / slow;
      const n = rank === 2 && Math.random() < 0.45 ? 2 : 1;
      for (let i = 0; i < n; i++) this.bolt(color, rank === 2 && Math.random() < 0.35);
      if (this.clock >= this.nextZap && rank <= 2) {
        this.nextZap = this.clock + 110;
        shopSfx.zap(this.shown);
      }
    }
    // Spark rain (epic, legendary) and a gold fountain (legendary).
    if (rank >= 2) this.emitRain(s * (rank === 3 ? 55 : 32), color);
    if (rank === 3 && t >= p.snap && p.snap >= 0) {
      this.fountainDebt += s * 26;
      while (this.fountainDebt >= 1) {
        this.fountainDebt--;
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.6;
        const v = 220 + Math.random() * 200;
        this.sparks.emit({
          x,
          y,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v,
          gravity: 520,
          life: 1 + Math.random() * 0.4,
          scale: 0.4 + Math.random() * 0.3,
          scaleTo: 0.1,
          tint: Math.random() < 0.7 ? color : 0xffffff,
          fade: Fade.Flicker,
        });
      }
    }
    // Smoke curling off the shell (rare and up).
    if (rank >= 1 && this.clock >= this.nextSmoke) {
      this.nextSmoke = this.clock + 280 - rank * 40;
      const a = Math.random() * Math.PI * 2;
      this.smoke.emit({
        x: x + Math.cos(a) * 70,
        y: y + Math.sin(a) * 70,
        vx: Math.cos(a) * 20,
        vy: -25 - Math.random() * 20,
        life: 1.4,
        scale: 0.6,
        scaleTo: 1.6,
        alpha: 0.3,
        tint: mixColor(0x6a7486, color, 0.5),
        spin: (Math.random() - 0.5) * 0.8,
        fade: Fade.Puff,
      });
    }
  }

  private bolt(color: number, strike: boolean) {
    const i = this.bolts.findIndex((b) => !b.visible);
    if (i < 0) return;
    const b = this.bolts[i];
    // Bolt textures are painted at 2x round a circle of BOLT_R; fit that to the shell's rim.
    const fit = (0.5 * SHELL_RIM) / BOLT_R;
    if (strike) {
      b.setTexture(SHOP_TEX.boltStrike(Math.floor(Math.random() * BOLT_STRIKES)))
        .setOrigin(0, 0.5)
        .setScale(fit * (1 + Math.random() * 0.25));
    } else {
      b.setTexture(SHOP_TEX.boltArc(Math.floor(Math.random() * BOLT_ARCS)))
        .setOrigin(0.5)
        .setScale(fit * (0.97 + Math.random() * 0.1));
    }
    b.setRotation(Math.random() * Math.PI * 2)
      .setFlipY(Math.random() < 0.5)
      .setTint(Math.random() < 0.3 ? 0xffffff : mixColor(color, 0xffffff, 0.25))
      .setAlpha(0.85 + Math.random() * 0.15)
      .setVisible(true);
    this.boltUntil[i] = this.clock + 55 + Math.random() * 70;
  }

  private emitRain(n: number, color: number) {
    this.rainDebt += n;
    while (this.rainDebt >= 1) {
      this.rainDebt--;
      const v = 420 + Math.random() * 380;
      this.rain.emit({
        x: (Math.random() - 0.5) * this.screenW,
        y: -this.screenH / 2 - 20,
        vx: (Math.random() - 0.5) * 60,
        vy: v,
        life: (this.screenH + 40) / v,
        scale: 0.22 + Math.random() * 0.2,
        alpha: 0.5 + Math.random() * 0.5,
        tint: Math.random() < 0.6 ? color : 0xffffff,
        align: true,
        fade: Fade.Flicker,
      });
    }
  }

  /** Streaks shooting straight out from a point (speed lines). */
  private speedLines(x: number, y: number, n: number, tint: number, r0: number) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.3;
      const v = 700 + Math.random() * 500;
      this.lines.emit({
        x: x + Math.cos(a) * r0,
        y: y + Math.sin(a) * r0,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        drag: 2,
        life: 0.32 + Math.random() * 0.15,
        scale: 0.5 + Math.random() * 0.4,
        scaleTo: 0.2,
        tint: i % 3 ? tint : 0xffffff,
        align: true,
      });
    }
  }

  /** The shell breaks: shards, a star flash, shockwaves, speed lines. The skin appears (SkinShop). */
  private shatter(quiet: boolean, reduced: boolean) {
    const p = this.plan!;
    this.cracked = true;
    const color = RARITIES[p.rarity].color;
    const rank = rankOf(p.rarity);
    const { x, y } = this.orb;
    this.orb.setVisible(false);
    for (const b of this.bolts) b.setVisible(false);
    this.halo.setTint(color).setPosition(0, PRIZE_Y);
    this.halo.setAlpha(rank >= 2 ? 0.65 : 0.5);
    this.beams.setPosition(0, PRIZE_Y);
    if (quiet) return;
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2 + Math.random() * 0.3;
      const v = 220 + Math.random() * 300;
      this.shards.emit({
        x: x + Math.cos(a) * 60,
        y: y + Math.sin(a) * 60,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - 60,
        gravity: 500,
        drag: 0.6,
        life: 0.8 + Math.random() * 0.5,
        scale: 0.5 + Math.random() * 0.6,
        scaleTo: 0.2,
        angle: Math.random() * 6,
        spin: (Math.random() - 0.5) * 14,
        tint: i % 3 ? color : 0xffffff,
      });
    }
    this.burstSparks(x, y, 16 + rank * 10, color, 1.3);
    this.speedLines(x, y, 10 + rank * 6, mixColor(color, 0xffffff, 0.4), 50);
    this.flashAt(x, y, 3.6, reduced ? 0.6 : 1, 0.42, 0xffffff, rank >= 1 && !reduced);
    const f = this.flare;
    f.img.setVisible(true).setPosition(x, y).setTint(mixColor(color, 0xffffff, 0.6)).setRotation(0);
    f.age = 0;
    f.life = 0.55;
    f.s0 = 0.4;
    f.s1 = 2.4 + rank * 0.5;
    f.a0 = reduced ? 0.6 : 1;
    f.spin = 1.2;
    this.wave(x, y, 0.3, 1.9, 0.56, color, 0, 0.5);
    this.wave(x, y, 0.2, 2.6, 0.7, 0xffffff, 0.06, -0.5);
    this.kick = Math.max(this.kick, (0.03 + rank * 0.012) * (reduced ? 0.3 : 1));
    if (rank >= 1 && !reduced) this.scene.cameras.main.shake(140 + rank * 60, 0.002 + rank * 0.0015);
  }

  get isCracked() {
    return this.cracked;
  }

  private burstSparks(x: number, y: number, n: number, color: number, speed: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = (120 + Math.random() * 200) * speed;
      this.sparks.emit({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        drag: 1.6,
        gravity: 60,
        life: 0.55 + Math.random() * 0.45,
        scale: 0.4 + Math.random() * 0.45,
        scaleTo: 0.08,
        tint: i % 3 ? color : 0xffffff,
      });
    }
  }

  /** A flash of light; with `chroma`, red and cyan ghosts split off to the sides. */
  private flashAt(x: number, y: number, scale: number, alpha: number, life: number, tint: number, chroma: boolean) {
    this.flashes.forEach((f, i) => {
      if (i > 0 && !chroma) {
        f.img.setVisible(false);
        return;
      }
      const dx = i === 0 ? 0 : i === 1 ? -9 : 9;
      f.img.setVisible(true).setPosition(x + dx, y);
      if (i === 0) f.img.setTint(tint);
      f.age = 0;
      f.life = i ? life * 0.8 : life;
      f.s0 = scale * (i ? 0.3 : 0.25);
      f.s1 = scale * (i ? 0.9 : 1);
      f.a0 = alpha * (i ? 0.5 : 1);
      f.spin = 0;
    });
  }

  private wave(x: number, y: number, s0: number, s1: number, life: number, tint: number, delay: number, spin: number, alpha = 1) {
    // The free one, or the one closest to its end.
    let r = this.waves[0];
    let best = -1;
    for (const w of this.waves) {
      const k = w.img.visible ? w.age / w.life : 2;
      if (k > best) {
        best = k;
        r = w;
      }
    }
    r.img.setVisible(true).setPosition(x, y).setTint(tint).setAlpha(0);
    r.age = -delay;
    r.life = life;
    r.s0 = s0;
    r.s1 = s1;
    r.a0 = alpha;
    r.spin = spin;
  }

  private screenFlashOn(color: number, alpha: number, life: number) {
    this.screenFlash.setVisible(true).setFillStyle(color, 1).setAlpha(alpha);
    this.screenFlashA = alpha;
    this.screenFlashAge = 0;
    this.screenFlashLife = life;
  }

  private stepTimed(o: Timed, s: number) {
    if (!o.img.visible) return;
    o.age += s;
    if (o.age < 0) {
      o.img.setAlpha(0);
      return;
    }
    const k = o.age / o.life;
    if (k >= 1) {
      o.img.setVisible(false);
      return;
    }
    const e = 1 - Math.pow(1 - k, 3);
    o.img.setScale(o.s0 + (o.s1 - o.s0) * e).setAlpha(o.a0 * (1 - k));
    if (o.spin) o.img.rotation += o.spin * s;
  }
}
