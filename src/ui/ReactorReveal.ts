import Phaser from 'phaser';
import { mixColor } from '../game/palette';
import { RARITIES, type Rarity } from '../game/skins';
import { TEX } from '../fx/textures';
import { FxPool, Fade } from './fxPool';
import { BOLT_ARCS, BOLT_R, BOLT_STRIKES, SHELL_R, SHOP_TEX } from './shopTextures';
import { shopSfx } from './shopSfx';
import { CREAK, TEASE_BUILD, crossed, rankOf, type Plan } from './QuackReactor';

// The QUACK REACTOR's reveal: the orb that flies out of the reactor inside an
// energy shell whose colour is the rarity, and everything that escalates with
// it (flash, smoke, lightning, shockwaves, spark rain, screen shake, slow
// motion, light beams), the upgrade tease and the shell cracking open. The
// skin and its card are SkinShop's; this class is pure effect, driven by the
// show's clock. All sprites are made once and pooled.

/** Where the prize sits in the reveal (origin at the screen's centre). */
export const PRIZE_Y = -92;

/** Per rarity (common, rare, epic, legendary). */
const DIM = [0.87, 0.89, 0.92, 0.94];
const VIGNETTE = [0, 0.3, 0.8, 0.9];
const FLASH = [0.5, 0.8, 1, 1];
const SPARKS = [6, 16, 28, 46];
const SMOKE = [3, 5, 6, 8];
const RINGS = [0, 1, 2, 3];
const BEAMS = [0, 0, 6, 12];
const BEAM_ALPHA = [0, 0, 0.22, 0.5];
/** Shell size on screen (texture scale). */
const SHELL_SCALE = 0.95;

interface Timed {
  img: Phaser.GameObjects.Image;
  age: number;
  life: number;
  s0: number;
  s1: number;
  a0: number;
}

export class ReactorReveal {
  /** Behind the prize. */
  readonly back: Phaser.GameObjects.Container;
  /** Over the prize. */
  readonly front: Phaser.GameObjects.Container;

  private vignette: Phaser.GameObjects.Image;
  private beams: Phaser.GameObjects.Container;
  private beamImgs: Phaser.GameObjects.Image[] = [];
  private halo: Phaser.GameObjects.Image;
  private rings: Timed[] = [];
  private orb: Phaser.GameObjects.Container;
  private orbGlow: Phaser.GameObjects.Image;
  private orbCore: Phaser.GameObjects.Image;
  private shell: Phaser.GameObjects.Image;
  private cracks: Phaser.GameObjects.Image;
  private bolts: Phaser.GameObjects.Image[] = [];
  private boltUntil: number[] = [];
  private flash: Timed;
  private screenFlash: Phaser.GameObjects.Rectangle;
  private screenFlashA = 0;
  private screenFlashLife = 1;
  private screenFlashAge = 1;
  private smoke: FxPool;
  private rain: FxPool;
  private sparks: FxPool;
  private shards: FxPool;

  private plan: Plan | null = null;
  /** Colour the shell shows now (changes at an upgrade). */
  private shown: Rarity = 'common';
  private from = { x: 0, y: 0 };
  private dimTarget = 0.8;
  private vignetteTarget = 0;
  private beamCount = 0;
  private beamAlpha = 0;
  private beamsOn = 0;
  private slowUntil = -1;
  private nextBolt = 0;
  private nextZap = 0;
  private nextSmoke = 0;
  private rainDebt = 0;
  private fountainDebt = 0;
  private cracked = false;
  private screenW = 400;
  private screenH = 800;
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
    for (let i = 0; i < 3; i++) this.rings.push({ img: add.image(0, 0, SHOP_TEX.ring).setBlendMode(ADD).setVisible(false), age: 1, life: 1, s0: 0, s1: 0, a0: 0 });
    this.smoke = new FxPool(scene, SHOP_TEX.smoke, 16, Phaser.BlendModes.NORMAL);
    this.rain = new FxPool(scene, TEX.streak, 44);
    this.orbGlow = add.image(0, 0, TEX.glow).setBlendMode(ADD);
    this.orbCore = add.image(0, 0, TEX.glow).setBlendMode(ADD).setTint(0xffffff);
    this.shell = add.image(0, 0, SHOP_TEX.shell).setBlendMode(ADD).setScale(SHELL_SCALE / 2);
    this.cracks = add.image(0, 0, SHOP_TEX.cracks).setBlendMode(ADD).setScale(SHELL_SCALE / 2).setAlpha(0);
    const orbParts: Phaser.GameObjects.GameObject[] = [this.orbGlow, this.orbCore, this.shell, this.cracks];
    for (let i = 0; i < 5; i++) {
      const b = add.image(0, 0, SHOP_TEX.boltArc(0)).setBlendMode(ADD).setVisible(false);
      this.bolts.push(b);
      this.boltUntil.push(0);
      orbParts.push(b);
    }
    this.orb = add.container(0, PRIZE_Y, orbParts);
    this.sparks = new FxPool(scene, TEX.spark, 64);
    this.shards = new FxPool(scene, TEX.shard, 18);
    this.back = add.container(0, 0, [
      this.vignette,
      this.beams,
      this.halo,
      ...this.rings.map((r) => r.img),
      ...this.smoke.sprites,
      ...this.rain.sprites,
      this.orb,
      ...this.sparks.sprites,
      ...this.shards.sprites,
    ]);
    this.flash = { img: add.image(0, 0, SHOP_TEX.halo).setBlendMode(ADD).setVisible(false), age: 1, life: 1, s0: 0, s1: 0, a0: 0 };
    this.screenFlash = add.rectangle(0, 0, 4000, 4000, 0xffffff, 1).setBlendMode(ADD).setVisible(false);
    this.front = add.container(0, 0, [this.flash.img, this.screenFlash]);
  }

  /** Screen size in reveal coordinates (the reveal is unscaled screen pixels). */
  layout(w: number, h: number) {
    this.screenW = w;
    this.screenH = h;
    this.vignette.setDisplaySize(w * 1.05, h * 1.05);
  }

  get shellRarity() {
    return this.shown;
  }

  /** A new show: everything hidden until the reactor bursts. */
  begin(plan: Plan) {
    this.plan = plan;
    this.shown = plan.first;
    this.cracked = false;
    this.slowUntil = -1;
    this.beamsOn = 0;
    this.beamCount = 0;
    this.beams.setAlpha(0);
    this.halo.setAlpha(0);
    this.orb.setVisible(false);
    this.cracks.setAlpha(0);
    this.vignette.setAlpha(0);
    this.vignetteTarget = 0;
    for (const b of this.bolts) b.setVisible(false);
  }

  clear() {
    this.plan = null;
    for (const p of [this.smoke, this.rain, this.sparks, this.shards]) p.clear();
    for (const r of this.rings) r.img.setVisible(false);
    this.flash.img.setVisible(false);
    this.screenFlash.setVisible(false);
    this.orb.setVisible(false);
  }

  /**
   * One frame of the show. `from` is the reactor core in reveal coordinates
   * (where the orb flies out of). Returns the orb's scale-adjusted position so
   * SkinShop can put the prize there.
   */
  update(dt: number, prev: number, now: number, from: { x: number; y: number }, quiet: boolean, reduced: boolean) {
    const p = this.plan;
    this.clock += dt;
    if (!p) return;
    this.from = from;
    const t = now;
    const slow = t < this.slowUntil ? 0.22 : 1;
    const s = (dt / 1000) * slow;

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
    if (crossed(p.crack, prev, now)) this.shatter(reduced);

    // The orb: out of the reactor, up to the middle, then it floats.
    if (this.orb.visible) {
      const color = RARITIES[this.shown].color;
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
      const pulse = 1 + 0.025 * Math.sin(this.clock * 0.006);
      this.orb.setPosition(x, y).setScale(sc * pulse);
      this.shell.rotation += s * 0.3;
      this.orbGlow.setTint(color).setScale(1.5 + 0.1 * Math.sin(this.clock * 0.009)).setAlpha(0.9);
      this.orbCore.setScale(0.55 + 0.05 * Math.sin(this.clock * 0.013)).setAlpha(0.95);
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

    this.stepTimed(this.flash, s);
    for (const r of this.rings) this.stepTimed(r, s);
    if (this.screenFlash.visible) {
      this.screenFlashAge += dt / 1000;
      const k = this.screenFlashAge / this.screenFlashLife;
      if (k >= 1) this.screenFlash.setVisible(false);
      else this.screenFlash.setAlpha(this.screenFlashA * (1 - k) * (1 - k));
    }
    // Bolts are short-lived flickers.
    for (let i = 0; i < this.bolts.length; i++) if (this.bolts[i].visible && this.clock >= this.boltUntil[i]) this.bolts[i].setVisible(false);
    this.smoke.update(s);
    this.rain.update(s);
    this.sparks.update(s);
    this.shards.update(s);
  }

  /** Card time: keep the halo, beams and a little celebration going. */
  idle(dt: number) {
    this.clock += dt;
    const s = dt / 1000;
    if (this.beamCount > 0) this.beams.rotation += s * 0.25;
    if (this.halo.alpha > 0) this.halo.setScale(1.5 + Math.sin(this.clock * 0.0022) * 0.06);
    if (this.plan?.rarity === 'legendary') this.emitRain(s * 18, RARITIES.legendary.color);
    this.stepTimed(this.flash, s);
    for (const r of this.rings) this.stepTimed(r, s);
    if (this.screenFlash.visible) {
      this.screenFlashAge += s;
      const k = this.screenFlashAge / this.screenFlashLife;
      if (k >= 1) this.screenFlash.setVisible(false);
      else this.screenFlash.setAlpha(this.screenFlashA * (1 - k) * (1 - k));
    }
    this.smoke.update(s);
    this.rain.update(s);
    this.sparks.update(s);
    this.shards.update(s);
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
    if (blast) {
      this.dim.setAlpha(quiet ? this.dimTarget : 0);
      this.orb.setPosition(this.from.x, this.from.y).setScale(0.35);
    }
    if (rank === 2 && BEAMS[rank] > this.beamCount) this.setBeams(rank);
    // Legendary: slow motion until time snaps back.
    if (r === 'legendary' && !quiet && this.plan) this.slowUntil = this.plan.snap;
    if (quiet) return;
    const at = blast ? this.from : { x: this.orb.x, y: this.orb.y };
    const fx = reduced ? 0.5 : 1;
    this.flashAt(at.x, at.y, [2.4, 3, 3.6, 4.8][rank], FLASH[rank] * fx, blast ? 0.45 : 0.55, mixColor(0xffffff, color, 0.35));
    for (let i = 0; i < RINGS[rank]; i++) this.ring(i, at.x, at.y, 0.25, 1.4 + i * 0.7 + rank * 0.2, 0.55 + i * 0.15, color);
    this.burstSparks(at.x, at.y, SPARKS[rank], color, 1 + rank * 0.3);
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
        spin: (Math.random() - 0.5),
        fade: Fade.Puff,
      });
    }
    const cam = this.scene.cameras.main;
    if (rank === 2) {
      if (!reduced) cam.shake(260, 0.006);
      this.screenFlashOn(color, reduced ? 0.08 : 0.22, 0.35);
    }
    if (rank === 3) {
      cam.shake(reduced ? 300 : 800, reduced ? 0.003 : 0.014);
      this.screenFlashOn(0xfff2c0, reduced ? 0.18 : 0.6, 0.7);
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
    this.ring(0, this.orb.x, this.orb.y, 0.4, 3.2, 0.7, 0xffffff);
    this.burstSparks(this.orb.x, this.orb.y, 30, color, 1.6);
    this.flashAt(this.orb.x, this.orb.y, 4, reduced ? 0.5 : 1, 0.5, 0xfff2c0);
    if (!reduced) this.scene.cameras.main.shake(350, 0.008);
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
    const fit = (0.5 * SHELL_R * SHELL_SCALE) / BOLT_R;
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

  /** The shell breaks: shards, a flash, a ring. The skin appears (SkinShop). */
  private shatter(reduced: boolean) {
    const p = this.plan!;
    this.cracked = true;
    const color = RARITIES[p.rarity].color;
    const rank = rankOf(p.rarity);
    const { x, y } = this.orb;
    this.orb.setVisible(false);
    for (const b of this.bolts) b.setVisible(false);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + Math.random() * 0.3;
      const v = 200 + Math.random() * 260;
      this.shards.emit({
        x: x + Math.cos(a) * 60,
        y: y + Math.sin(a) * 60,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - 60,
        gravity: 500,
        drag: 0.6,
        life: 0.8 + Math.random() * 0.4,
        scale: 0.5 + Math.random() * 0.5,
        scaleTo: 0.2,
        angle: Math.random() * 6,
        spin: (Math.random() - 0.5) * 14,
        tint: i % 3 ? color : 0xffffff,
      });
    }
    this.burstSparks(x, y, 14 + rank * 8, color, 1.2);
    this.flashAt(x, y, 3.4, reduced ? 0.6 : 1, 0.42, 0xffffff);
    this.ring(1, x, y, 0.3, 1.8, 0.56, color);
    this.halo.setTint(color).setPosition(0, PRIZE_Y);
    this.halo.setAlpha(rank >= 2 ? 0.65 : 0.5);
    this.beams.setPosition(0, PRIZE_Y);
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

  private flashAt(x: number, y: number, scale: number, alpha: number, life: number, tint: number) {
    const f = this.flash;
    f.img.setVisible(true).setPosition(x, y).setTint(tint);
    f.age = 0;
    f.life = life;
    f.s0 = scale * 0.25;
    f.s1 = scale;
    f.a0 = alpha;
  }

  private ring(i: number, x: number, y: number, s0: number, s1: number, life: number, tint: number) {
    const r = this.rings[i % this.rings.length];
    r.img.setVisible(true).setPosition(x, y).setTint(tint);
    r.age = -i * 0.12;
    r.life = life;
    r.s0 = s0;
    r.s1 = s1;
    r.a0 = 1;
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
  }
}
