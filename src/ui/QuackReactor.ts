import Phaser from 'phaser';
import { save } from '../game/storage';
import { css, mixColor, palette } from '../game/palette';
import { PITY, RARITIES, RARITY_ORDER, SPIN_COST, type Rarity } from '../game/skins';
import type { SpinResult } from '../game/gacha';
import { TEX, DUCK_RES } from '../fx/textures';
import { makeText } from './widgets';
import { FxPool, Fade } from './fxPool';
import { BAY, BOLT_ARCS, BOLT_R, Q, SHOP_TEX, dialAngle } from './shopTextures';
import { shopSfx } from './shopSfx';

// The QUACK REACTOR machine: ducks march along a conveyor into the reactor,
// it overloads (rings spin up, lamps flicker, sparks, steam, a rising drone),
// then bursts open and the prize orb flies out (the orb itself is drawn by
// SkinShop's reveal overlay). Everything here is driven by the show's clock,
// so a show can pause, be stepped in tests, or be skipped to any moment.

/** Rarity as a number: 0 common .. 3 legendary. */
export const rankOf = (r: Rarity) => RARITY_ORDER.indexOf(r);

// --- The show's timeline (ms from the pull) ----------------------------------

/** Ducks march in (or the golden duck waddles in). */
export const FEED = 1000;
/** The overload before the burst, by the rarity the shell will first show. */
const OVERLOAD: Record<Rarity, number> = { common: 500, rare: 800, epic: 1200, legendary: 1700 };
/** The orb floats from the reactor to the middle of the screen. */
const RISE: Record<Rarity, number> = { common: 450, rare: 450, epic: 500, legendary: 900 };
/** From the shell's colour (or its upgrade) to the crack. */
const HOLD: Record<Rarity, number> = { common: 550, rare: 1050, epic: 1700, legendary: 2050 };
/** Upgrade tease: how long the lower colour shows before the flare. */
const TEASE = 750;
/** The tease's crack build-up before the flare. */
export const TEASE_BUILD = 450;
/** The shell creaks this long before it breaks. */
export const CREAK = 380;
/** Crack to the card fully in. */
const CARD = 450;
/** Legendary: slow motion lasts this long after the colour shows, then time snaps back. */
export const SLOWMO = 900;
/** Upgrade tease chance for a rare-or-better result. */
export const TEASE_CHANCE = 0.2;

export interface Plan {
  res: SpinResult;
  rarity: Rarity;
  /** The colour the shell shows first: one tier lower for an upgrade tease. */
  first: Rarity;
  tease: boolean;
  free: boolean;
  feedEnd: number;
  blast: number;
  arrive: number;
  /** Tease only: the shell flares into the real colour (-1 otherwise). */
  upgrade: number;
  /** Legendary: time snaps back and the beams shoot out (-1 otherwise). */
  snap: number;
  crack: number;
  card: number;
  /** Duplicates: the skin bursts into ducks (-1 for new skins). */
  dupe: number;
  buttons: number;
}

export function makePlan(res: SpinResult, tease: boolean): Plan {
  const rarity = res.rarity;
  tease = tease && rarity !== 'common';
  const first = tease ? RARITY_ORDER[rankOf(rarity) - 1] : rarity;
  const feedEnd = FEED;
  const blast = feedEnd + OVERLOAD[first];
  const arrive = blast + RISE[first];
  const upgrade = tease ? arrive + TEASE : -1;
  const onset = tease ? upgrade : blast;
  const crack = onset + (tease ? 0 : RISE[first]) + HOLD[rarity];
  const card = crack + CARD;
  const dupe = res.isNew ? -1 : crack + 750;
  return {
    res,
    rarity,
    first,
    tease,
    free: res.free,
    feedEnd,
    blast,
    arrive,
    upgrade,
    snap: rarity === 'legendary' ? onset + SLOWMO : -1,
    crack,
    card,
    dupe,
    buttons: dupe > 0 ? dupe + 1100 : card,
  };
}

/** True when the show's clock passed `mark` this step. */
export const crossed = (mark: number, prev: number, now: number) => mark >= 0 && prev < mark && now >= mark;

// --- The machine -------------------------------------------------------------

/** Ducks in the conveyor stream for a paid charge (each stands for 100 / N). */
const QUEUE = 16;
/** Walking speed on the belt (px per ms) and when duck i reaches the intake. */
const WALK = 0.33;
const enterAt = (i: number) => 110 + i * 55;
const DUCK_SCALE = 0.24 / DUCK_RES;
const GOLD_SCALE = 0.5 / DUCK_RES;
/** Where the golden duck waits, and when it jumps in. */
const GOLD_X = -118;
const GOLD_IN = 860;

const IDLE_TINT = palette.magenta;
const deg = (d: number) => (d * Math.PI) / 180;

export class QuackReactor {
  readonly root: Phaser.GameObjects.Container;
  /** The housing and everything on it: shakes as one. */
  private body: Phaser.GameObjects.Container;
  private coreGlow: Phaser.GameObjects.Image;
  private ringOuter: Phaser.GameObjects.Image;
  private ringInner: Phaser.GameObjects.Image;
  private petals: Phaser.GameObjects.Image[] = [];
  private seams: Phaser.GameObjects.Image;
  private lamps: Phaser.GameObjects.Image[] = [];
  private arcs: Phaser.GameObjects.Image[] = [];
  private arcUntil = [0, 0];
  private counter: Phaser.GameObjects.Text;
  private counterLabel: Phaser.GameObjects.Text;
  private needle: Phaser.GameObjects.Image;
  private epicText: Phaser.GameObjects.Text;
  private legText: Phaser.GameObjects.Text;
  private bars: Phaser.GameObjects.Graphics;
  private pityState = '';
  private belt: Phaser.GameObjects.TileSprite;
  private ducks: Phaser.GameObjects.Image[] = [];
  private gold: Phaser.GameObjects.Image;
  private goldGlow: Phaser.GameObjects.Image;
  private sparks: FxPool;
  private smoke: FxPool;

  /** Ducks still to go in (100 .. 0); SkinShop drains the balance with it. */
  fuel = SPIN_COST;
  private free = false;
  private clock = 0;
  private angOuter = 0;
  private angInner = 0;
  private spinOuter = 0.35;
  private spinInner = -0.6;
  private charge = 0;
  /** Seconds since the burst (petals flying), or -1 while closed. */
  private blown = -1;
  private blastColor = 0xffffff;
  private closing = 1;
  private lampStep = -1;
  private nextPuff = 0;
  private nextAlarm = 0;
  private nextSparkSfx = 0;
  private sparkDebt = 0;

  constructor(scene: Phaser.Scene) {
    const add = scene.add;
    const { core } = BAY;
    const parts: Phaser.GameObjects.GameObject[] = [add.image(0, 0, SHOP_TEX.bay).setScale(1 / Q)];

    const c = BAY.counter;
    this.counter = makeText(scene, c.x + c.w / 2, c.y + 24, String(SPIN_COST), {
      font: 'mono',
      size: 26,
      weight: '700',
      color: '#ffd21f',
      glow: '#ff9a2e',
    }).setOrigin(0.5);
    this.counterLabel = makeText(scene, c.x + c.w / 2, c.y + 46, 'DUCKS', { font: 'mono', size: 9, weight: '700', color: css.inkDim, spacing: 2 }).setOrigin(0.5);
    const d = BAY.dial;
    const dialLabel = makeText(scene, d.x, d.y + 15, 'CORE', { font: 'mono', size: 8, weight: '700', color: css.inkDim, spacing: 2 }).setOrigin(0.5);
    this.needle = add.image(d.x, d.y, SHOP_TEX.needle).setOrigin(5 / 36, 0.5).setScale(1 / Q);
    const sy = BAY.strip.y + BAY.strip.h / 2;
    this.epicText = makeText(scene, 0, sy, '', { font: 'mono', size: 10, weight: '700', color: RARITIES.epic.css, spacing: 0.5 }).setOrigin(0, 0.5);
    this.legText = makeText(scene, 0, sy, '', { font: 'mono', size: 10, weight: '700', color: RARITIES.legendary.css, spacing: 0.5 }).setOrigin(0, 0.5);
    this.bars = add.graphics();
    parts.push(this.counter, this.counterLabel, dialLabel, this.needle, this.epicText, this.legText, this.bars);

    this.belt = add
      .tileSprite(BAY.beltX0, BAY.beltY, BAY.mouthX - BAY.beltX0, 6, SHOP_TEX.belt)
      .setOrigin(0, 0)
      .setTileScale(1 / Q, 1 / Q);
    parts.push(this.belt);
    for (let i = 0; i < QUEUE; i++) {
      const duck = add.image(0, 0, TEX.duck).setScale(DUCK_SCALE).setOrigin(0.5, 0.92).setVisible(false);
      this.ducks.push(duck);
      parts.push(duck);
    }
    this.goldGlow = add.image(GOLD_X, BAY.beltY - 18, TEX.glow).setBlendMode(Phaser.BlendModes.ADD).setTint(0xffd21f).setScale(0.75).setVisible(false);
    this.gold = add.image(GOLD_X, BAY.beltY, TEX.duckGold).setScale(GOLD_SCALE).setOrigin(0.5, 0.92).setVisible(false);
    parts.push(this.goldGlow, this.gold, add.image(BAY.mouthX + 1, BAY.beltY - 15, SHOP_TEX.mouth).setScale(1 / Q));

    // The reactor itself.
    const bodyParts: Phaser.GameObjects.GameObject[] = [add.image(0, 0, SHOP_TEX.housing).setScale(1 / Q)];
    this.coreGlow = add.image(0, 0, TEX.glow).setBlendMode(Phaser.BlendModes.ADD).setTint(IDLE_TINT);
    this.ringOuter = add.image(0, 0, SHOP_TEX.ringOuter).setScale(0.5).setBlendMode(Phaser.BlendModes.ADD).setTint(0xff4fb0);
    this.ringInner = add.image(0, 0, SHOP_TEX.ringInner).setScale(0.5).setBlendMode(Phaser.BlendModes.ADD).setTint(0xffc8ea);
    bodyParts.push(this.coreGlow, this.ringOuter, this.ringInner);
    for (let k = 0; k < 4; k++) {
      const p = add.image(0, 0, SHOP_TEX.petal).setOrigin(0, 0.5).setScale(1 / Q).setRotation(deg(-90 + k * 90));
      this.petals.push(p);
      bodyParts.push(p);
    }
    this.seams = add.image(0, 0, SHOP_TEX.seams).setScale(0.5).setBlendMode(Phaser.BlendModes.ADD).setTint(IDLE_TINT);
    bodyParts.push(this.seams);
    for (const a of BAY.lamps) {
      const lamp = add
        .image(Math.cos(deg(a)) * BAY.lampR, Math.sin(deg(a)) * BAY.lampR, SHOP_TEX.lamp)
        .setScale(0.5)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.lamps.push(lamp);
      bodyParts.push(lamp);
    }
    for (let i = 0; i < 2; i++) {
      const arc = add.image(0, 0, SHOP_TEX.boltArc(i)).setScale((0.5 * BAY.ringOuterR) / BOLT_R).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
      this.arcs.push(arc);
      bodyParts.push(arc);
    }
    this.body = add.container(core.x, core.y, bodyParts);
    this.smoke = new FxPool(scene, SHOP_TEX.smoke, 14, Phaser.BlendModes.NORMAL);
    this.sparks = new FxPool(scene, TEX.spark, 40);
    parts.push(this.body, ...this.smoke.sprites, ...this.sparks.sprites);
    this.root = add.container(0, 0, parts);
    this.reset(true);
  }

  /** Centre of the reactor's core, in the coordinates of the root's parent. */
  coreWorld() {
    return { x: this.root.x + BAY.core.x * this.root.scaleX, y: this.root.y + BAY.core.y * this.root.scaleY };
  }

  /** Pity read-out: "EPIC+ IN ≤ 9 · LEGENDARY IN ≤ 37" with a meter each. */
  setPity(epicIn: number, legIn: number) {
    const state = `${epicIn}|${legIn}`;
    if (state === this.pityState) return;
    this.pityState = state;
    this.epicText.setText(epicIn <= 1 ? 'EPIC+ NEXT!' : `EPIC+ IN ≤ ${epicIn}`);
    this.legText.setText(legIn <= 1 ? 'LEGENDARY NEXT!' : `LEGENDARY IN ≤ ${legIn}`);
    const x0 = BAY.strip.x + 9;
    const y = this.epicText.y;
    const g = this.bars.clear();
    const bar = (x: number, frac: number, color: number) => {
      g.fillStyle(color, 0.18).fillRoundedRect(x, y - 2, 30, 4, 2);
      g.fillStyle(color, 1).fillRoundedRect(x, y - 2, Math.max(4, 30 * frac), 4, 2);
      return x + 30;
    };
    this.epicText.setX(x0);
    const end = bar(x0 + this.epicText.width + 6, 1 - (epicIn - 1) / (PITY.epic - 1), RARITIES.epic.color);
    // The legendary half is right-aligned in the strip.
    const right = BAY.strip.x + BAY.strip.w - 9;
    const lx = Math.max(end + 14, right - 36 - this.legText.width);
    this.legText.setX(lx);
    bar(lx + this.legText.width + 6, 1 - (legIn - 1) / (PITY.legendary - 1), RARITIES.legendary.color);
  }

  /**
   * Back to idle: lid closed, counter full, the queue waiting (the golden duck
   * at the front when the next charge is free). `instant` skips the clunk.
   */
  reset(instant = false) {
    this.free = save.freeSpins > 0;
    this.fuel = SPIN_COST;
    this.counter.setText(this.free ? 'FREE' : String(SPIN_COST));
    this.counterLabel.setText(this.free ? 'CHARGE' : 'DUCKS');
    this.charge = 0;
    this.blown = -1;
    this.closing = instant ? 1 : 0;
    this.coreGlow.setTint(IDLE_TINT);
    this.seams.setTint(IDLE_TINT).setVisible(true);
    this.petals.forEach((p, k) => p.setVisible(true).setPosition(0, 0).setRotation(deg(-90 + k * 90)).setAlpha(1));
    this.body.setPosition(BAY.core.x, BAY.core.y);
    for (const a of this.arcs) a.setVisible(false);
    this.lampStep = -1;
    this.placeQueue(0, null, 0);
    if (!instant) shopSfx.reset();
  }

  /**
   * One frame. `prev`/`now` are the show's clock before and after this step
   * (both 0 with no show running); `quiet` fast-forwards without sound or
   * particles (skipping).
   */
  update(dt: number, plan: Plan | null, prev: number, now: number, quiet: boolean, reduced: boolean) {
    const s = dt / 1000;
    this.clock += dt;
    const t = plan ? now : 0;

    // --- Feed: ducks walk in, the counter drains ---------------------------
    if (plan) {
      if (plan.free) {
        if (crossed(GOLD_IN, prev, now)) {
          this.fuel = 0;
          if (!quiet) {
            shopSfx.golden();
            this.mouthPop(0xffd21f, 10);
          }
        }
      } else {
        for (let i = 0; i < QUEUE; i++) {
          if (!crossed(enterAt(i), prev, now)) continue;
          this.fuel = Math.round(SPIN_COST * (1 - (i + 1) / QUEUE));
          this.counter.setText(String(this.fuel));
          if (!quiet) {
            shopSfx.feed(i / (QUEUE - 1));
            if (i % 5 === 2) shopSfx.quack(i / (QUEUE - 1));
            this.mouthPop(0xffd21f, 2);
          }
        }
      }
      if (crossed(plan.feedEnd, prev, now) && !quiet) shopSfx.charge((plan.blast - plan.feedEnd) / 1000, plan.first);
      if (crossed(plan.blast - 140, prev, now) && !quiet) {
        shopSfx.chargeStop();
        shopSfx.inhale();
      }
      if (crossed(plan.blast, prev, now)) this.burst(plan.first, quiet);
    }
    this.placeQueue(t, plan, dt);

    // --- Overload ----------------------------------------------------------
    const lvl = plan ? rankOf(plan.first) / 3 : 0;
    const over = plan && t >= plan.feedEnd && t < plan.blast;
    const u = over ? (t - plan!.feedEnd) / (plan!.blast - plan!.feedEnd) : 0;
    const inhale = plan && t >= plan.blast - 140 && t < plan.blast;
    if (over) {
      this.spinOuter = 0.35 + u * u * (9 + 6 * lvl);
      this.spinInner = -(0.6 + u * u * (12 + 8 * lvl));
      this.charge = 0.3 + 0.7 * u;
    } else {
      // Spin back down towards idle.
      const k = Math.exp(-2.2 * s);
      this.spinOuter = 0.35 + (this.spinOuter - 0.35) * k;
      this.spinInner = -0.6 + (this.spinInner + 0.6) * k;
      if (plan && t < plan.feedEnd) this.charge = (0.3 * t) / plan.feedEnd;
      else if (this.blown >= 0 || !plan) this.charge = Math.max(0, this.charge - s * 0.9);
    }
    this.angOuter += this.spinOuter * s;
    this.angInner += this.spinInner * s;
    this.ringOuter.setRotation(this.angOuter);
    this.ringInner.setRotation(this.angInner);
    const jitter = over ? Math.sin(this.clock * 0.09) * 0.02 * u : Math.sin(this.clock * 0.004) * 0.006;
    this.needle.setRotation(dialAngle(this.charge + jitter));

    // Shake (not during the breath before the burst).
    const amp = over && !inhale ? u * u * (1.2 + 2.2 * lvl) * (reduced ? 0.3 : 1) : 0;
    this.body.setPosition(BAY.core.x + (Math.random() - 0.5) * 2 * amp, BAY.core.y + (Math.random() - 0.5) * 2 * amp);

    // Core light: pulses in idle, swells white-hot, sucks in, then bursts.
    if (this.blown < 0) {
      const pulse = 0.5 + 0.5 * Math.sin(this.clock * 0.0035);
      const flick = over ? 0.75 + 0.25 * Math.sin(this.clock * 0.07 + Math.sin(this.clock * 0.013) * 3) : 1;
      if (inhale) {
        const k = (t - (plan!.blast - 140)) / 140;
        this.coreGlow.setScale(0.9 - 0.5 * k).setAlpha(0.95);
        this.seams.setAlpha(1 - k * 0.6);
      } else {
        this.coreGlow.setScale(0.72 + 0.08 * pulse + 0.5 * u).setAlpha((0.45 + 0.15 * pulse + 0.45 * u) * flick);
        this.seams.setAlpha((0.5 + 0.2 * pulse + 0.5 * u) * flick);
      }
      if (over) {
        const hot = mixColor(IDLE_TINT, 0xffffff, u * 0.85);
        this.coreGlow.setTint(hot);
        this.seams.setTint(hot);
      }
      if (this.closing < 1) {
        this.closing = Math.min(1, this.closing + s * 5);
        const k = this.closing;
        this.petals.forEach((p) => p.setAlpha(k).setScale((1 + (1 - k) * 0.25) / Q));
      }
    } else {
      // After the burst: petals fly off, the core flash fades into a glow.
      this.blown += s;
      const b = this.blown;
      const fly = 1 - Math.pow(1 - Math.min(1, b / 0.6), 3);
      this.petals.forEach((p, k) => {
        if (!p.visible) return;
        const a = deg(-90 + k * 90);
        p.setPosition(Math.cos(a) * fly * 150, Math.sin(a) * fly * 150)
          .setRotation(a + (k % 2 ? 1 : -1) * fly * 2.6)
          .setAlpha(1 - Math.min(1, b / 0.6));
        if (b >= 0.6) p.setVisible(false);
      });
      const f = Math.exp(-b * 3);
      this.coreGlow.setTint(this.blastColor).setScale(0.9 + 1.6 * f).setAlpha(0.55 + 0.45 * f);
    }

    // Lamps: a chase in idle, random flicker in overload, the prize colour after the burst.
    const hz = over ? 20 : 7;
    const step = Math.floor((this.clock / 1000) * hz) * 3 + (over ? 1 : this.blown >= 0 ? 2 : 0);
    if (step !== this.lampStep) {
      this.lampStep = step;
      const n = this.lamps.length;
      const lead = (step / 3) % n;
      this.lamps.forEach((l, j) => {
        if (inhale) l.setAlpha(0.1);
        else if (over) {
          const on = Math.random() < 0.35 + 0.6 * u;
          l.setTint(on ? mixColor(IDLE_TINT, 0xffffff, u) : IDLE_TINT).setAlpha(on ? 1 : 0.3);
        } else if (this.blown >= 0) l.setTint(this.blastColor).setAlpha(this.blown < 1.2 ? 1 : 0.65);
        else {
          const on = j === lead || j === (lead + n / 2) % n;
          l.setTint(on ? 0xffffff : IDLE_TINT).setAlpha(on ? 1 : 0.4);
        }
      });
    }

    // Sparks fly off the rim, more and more.
    if (over && !inhale && !quiet) {
      this.sparkDebt += s * (6 + 52 * u) * (0.6 + 0.4 * lvl);
      while (this.sparkDebt >= 1) {
        this.sparkDebt--;
        const a = Math.random() * Math.PI * 2;
        const r = BAY.housingR * (0.75 + Math.random() * 0.25);
        const v = 80 + Math.random() * 160;
        this.sparks.emit({
          x: BAY.core.x + Math.cos(a) * r,
          y: BAY.core.y + Math.sin(a) * r,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v - 70,
          gravity: 420,
          life: 0.35 + Math.random() * 0.35,
          scale: 0.22 + Math.random() * 0.2,
          scaleTo: 0.05,
          tint: Math.random() < 0.5 ? 0xffffff : Math.random() < 0.5 ? IDLE_TINT : 0xffd21f,
          fade: Fade.Flicker,
        });
        if (this.clock >= this.nextSparkSfx && Math.random() < 0.5) {
          this.nextSparkSfx = this.clock + 110;
          shopSfx.spark();
        }
      }
      // Electric arcs crawl round the rings near the end.
      if (u > 0.35) {
        for (let i = 0; i < 2; i++) {
          const arc = this.arcs[i];
          if (arc.visible && this.clock >= this.arcUntil[i]) arc.setVisible(false);
          if (!arc.visible && Math.random() < u * 0.08) {
            arc.setTexture(SHOP_TEX.boltArc(Math.floor(Math.random() * BOLT_ARCS)))
              .setRotation(Math.random() * Math.PI * 2)
              .setFlipY(Math.random() < 0.5)
              .setTint(Math.random() < 0.5 ? 0xffffff : 0xff6ac8)
              .setAlpha(0.9)
              .setVisible(true);
            this.arcUntil[i] = this.clock + 60 + Math.random() * 60;
          }
        }
      }
      if (u > 0.4 && this.clock >= this.nextAlarm) {
        this.nextAlarm = this.clock + 240 - 130 * u;
        shopSfx.alarm(u);
      }
    } else if (!over) {
      for (const a of this.arcs) if (a.visible) a.setVisible(false);
    }

    // Steam from the vents: a lazy puff now and then, a jet when it overloads.
    if (this.clock >= this.nextPuff && !quiet) {
      this.nextPuff = this.clock + (over ? Math.max(70, 330 - 270 * u) : 2400 + Math.random() * 1600);
      const vent = BAY.vents[Math.floor(Math.random() * BAY.vents.length)];
      const a = deg(vent);
      const r = BAY.housingR + 12;
      const v = over ? 60 + 60 * u : 25;
      this.smoke.emit({
        x: BAY.core.x + Math.cos(a) * r,
        y: BAY.core.y + Math.sin(a) * r,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - 25,
        drag: 0.8,
        life: over ? 0.8 : 1.6,
        scale: 0.25,
        scaleTo: over ? 0.9 + 0.4 * u : 0.8,
        alpha: over ? 0.55 : 0.35,
        tint: 0xd8e2f0,
        spin: (Math.random() - 0.5) * 1.5,
        fade: Fade.Puff,
      });
    }

    this.sparks.update(s);
    this.smoke.update(s);
  }

  /** The reactor bursts: the lid blows off and the core flashes the shell's colour. */
  private burst(rarity: Rarity, quiet: boolean) {
    this.blown = quiet ? 1 : 0;
    this.blastColor = RARITIES[rarity].color;
    this.seams.setVisible(false);
    this.lampStep = -1;
    if (quiet) {
      for (const p of this.petals) p.setVisible(false);
      return;
    }
    const rank = rankOf(rarity);
    const { x, y } = BAY.core;
    for (let i = 0; i < 14 + rank * 6; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 140 + Math.random() * 220;
      this.sparks.emit({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        drag: 1.5,
        gravity: 120,
        life: 0.5 + Math.random() * 0.4,
        scale: 0.35 + Math.random() * 0.3,
        scaleTo: 0.08,
        tint: i % 3 ? this.blastColor : 0xffffff,
      });
    }
    for (let i = 0; i < 5; i++) {
      const a = Math.random() * Math.PI * 2;
      this.smoke.emit({
        x: x + Math.cos(a) * 20,
        y: y + Math.sin(a) * 20,
        vx: Math.cos(a) * 60,
        vy: Math.sin(a) * 60 - 20,
        drag: 1.2,
        life: 1.1,
        scale: 0.5,
        scaleTo: 1.6,
        alpha: 0.45,
        tint: mixColor(0x8a94a6, this.blastColor, 0.3),
        fade: Fade.Puff,
      });
    }
  }

  /** A little flash at the intake as something goes in. */
  private mouthPop(color: number, n: number) {
    for (let i = 0; i < n; i++) {
      this.sparks.emit({
        x: BAY.mouthX + 6,
        y: BAY.beltY - 12 + (Math.random() - 0.5) * 14,
        vx: 20 + Math.random() * 60,
        vy: (Math.random() - 0.5) * 80,
        life: 0.25,
        scale: n > 4 ? 0.6 : 0.4,
        scaleTo: 0.1,
        tint: i % 2 ? 0xffffff : color,
      });
    }
  }

  /** Lay out the duck queue at show time `t` (0: waiting). */
  private placeQueue(t: number, plan: Plan | null, dt: number) {
    const free = plan ? plan.free : this.free;
    const idle = !plan;
    const { beltY, beltX0, mouthX } = BAY;
    let moving = false;
    for (let i = 0; i < QUEUE; i++) {
      const d = this.ducks[i];
      if (free) {
        d.setVisible(false);
        continue;
      }
      // In idle the first four wait where the march will start from.
      const x = mouthX + 4 - (enterAt(i) - t) * WALK;
      const show = x >= beltX0 - 6 && x < mouthX + 4 && (!idle || i < 4);
      d.setVisible(show);
      if (!show) continue;
      moving ||= !idle;
      const ph = idle ? this.clock * 0.004 + i * 1.7 : t * 0.024 + i * 1.3;
      const hop = idle ? Math.max(0, Math.sin(ph * 2.2) - 0.75) * 12 : Math.abs(Math.sin(ph)) * 3;
      const fadeIn = Math.min(1, (x - (beltX0 - 6)) / 12);
      const fadeOut = Math.min(1, (mouthX + 4 - x) / 16);
      d.setPosition(x, beltY - hop)
        .setAngle(Math.sin(ph) * (idle ? 4 : 10))
        .setAlpha(Math.min(fadeIn, fadeOut))
        .setScale(DUCK_SCALE * (0.75 + 0.25 * fadeOut));
    }
    // The golden duck: waits at the front, hops with excitement, waddles in.
    this.gold.setVisible(free && (idle || t < GOLD_IN));
    this.goldGlow.setVisible(this.gold.visible);
    if (this.gold.visible) {
      let x = GOLD_X;
      let hop = 0;
      let ang = 0;
      if (idle) {
        hop = Math.max(0, Math.sin(this.clock * 0.005) - 0.6) * 10;
        ang = Math.sin(this.clock * 0.003) * 5;
      } else if (t < 200) {
        hop = Math.abs(Math.sin(t * 0.03)) * 8;
      } else {
        const k = (t - 200) / (GOLD_IN - 200);
        x = GOLD_X + (mouthX + 8 - GOLD_X) * k * k;
        hop = Math.abs(Math.sin(t * 0.02)) * 4;
        ang = Math.sin(t * 0.02) * 10;
        moving = true;
      }
      const fadeOut = Math.min(1, (mouthX + 8 - x) / 14 + 0.05);
      this.gold.setPosition(x, beltY - hop).setAngle(ang).setAlpha(fadeOut).setScale(GOLD_SCALE * (0.8 + 0.2 * fadeOut));
      this.goldGlow
        .setPosition(x, beltY - 20 - hop)
        .setAlpha((0.55 + 0.15 * Math.sin(this.clock * 0.006)) * fadeOut)
        .setScale(0.7 + 0.05 * Math.sin(this.clock * 0.006));
    }
    if (moving) this.belt.tilePositionX -= WALK * dt * Q;
  }
}
