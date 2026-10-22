import Phaser from 'phaser';
import { save } from '../game/storage';
import { css, mixColor, palette } from '../game/palette';
import { PITY, RARITIES, RARITY_ORDER, SPIN_COST, type Rarity } from '../game/skins';
import type { SpinResult } from '../game/gacha';
import { TEX, DUCK_RES } from '../fx/textures';
import { makeText } from './widgets';
import { FxPool, Fade } from './fxPool';
import { BAY, BOLT_ARCS, BOLT_R, Q, SHOP_TEX, ZAPS, dialAngle } from './shopTextures';
import { shopSfx } from './shopSfx';

// The QUACK REACTOR machine. In idle it sits in its bay above the collection;
// when you charge it, SkinShop lifts it onto the stage (the screen darkens and
// it zooms up to fill it) and the panel round it fades away. Then a stream of
// a hundred ducks hops in from the bottom of the screen and dives into the
// open core (a free charge sends in one big golden duck), the lid irises shut,
// it overloads (rings spin up with trails, lightning crawls over the lid,
// light leaks from the seams, energy is sucked in, sparks, steam, a rising
// drone) and bursts. The prize orb itself is ReactorReveal's. Everything here
// is a function of the show's clock where it can be, so a show can pause, be
// stepped in tests, or be skipped to any moment.

/** Rarity as a number: 0 common .. 3 legendary. */
export const rankOf = (r: Rarity) => RARITY_ORDER.indexOf(r);

// --- The show's timeline (ms from the pull) ----------------------------------

/** Ducks pour in (or the golden duck does its thing). */
export const FEED = 1700;
/** SkinShop's zoom from the bay onto the stage. */
export const STAGE_IN = 420;
/** The overload before the burst, by the rarity the shell will first show. */
const OVERLOAD: Record<Rarity, number> = { common: 600, rare: 950, epic: 1350, legendary: 1850 };
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
/** The breath before the burst. */
const INHALE = 140;

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

/** 0..1 overload progress at show time t (0 outside it). */
export const overloadAt = (p: Plan, t: number) => (t >= p.feedEnd && t < p.blast ? (t - p.feedEnd) / (p.blast - p.feedEnd) : 0);

// --- The duck stream ---------------------------------------------------------

/** Ducks in a paid charge: one for every duck spent. */
const STREAM = SPIN_COST;
/** The last duck leaves the ground; launches come faster and faster until then. */
const LAUNCH_END = 1300;
const launchAt = (i: number) => 60 + (LAUNCH_END - 60) * Math.pow((i + 1) / STREAM, 0.55);
/** Flight time: the late ones are in a hurry. */
const flightOf = (i: number) => 560 - 190 * (i / (STREAM - 1));
/** Ducks that land on the rim first and hop in from there (never the last ones). */
const RIM_HOPPERS = 70;
const RIM_SQUASH = 80;
/** Sprites for the ducks in the air at once (each duck reuses slot i % POOL). */
const POOL = 80;
/** A flying duck's size on screen (texture scale at zoom 1). */
const FLY_SCALE = 0.3 / DUCK_RES;

/** Same numbers every show, so stepping or skipping looks the same. */
const hash = (i: number, k: number) => {
  const v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return v - Math.floor(v);
};
const easeOutBack = (k: number) => 1 + 2.70158 * Math.pow(k - 1, 3) + 1.70158 * Math.pow(k - 1, 2);

// --- The golden duck (free charge) ---------------------------------------------

/** It pops up, hops twice towards the reactor, crouches and leaps in at GOLD_IN. */
const GOLD_UP = 340;
const GOLD_HOPS = [
  [380, 700],
  [760, 1090],
];
const GOLD_CROUCH = 1090;
const GOLD_LEAP = 1200;
const GOLD_IN = 1600;
const GOLD_SCALE = 0.5 / DUCK_RES;
const GOLD_STAGE_SCALE = 1 / DUCK_RES;

// --- The machine (idle belt) -----------------------------------------------------

/** Ducks waiting on the conveyor in idle. */
const QUEUE = 4;
const DUCK_SCALE = 0.24 / DUCK_RES;
/** Where the golden duck waits in idle. */
const GOLD_X = -118;

const IDLE_TINT = palette.magenta;
const deg = (d: number) => (d * Math.PI) / 180;

/** A short-lived image that grows and fades (ripples). */
interface Ripple {
  img: Phaser.GameObjects.Image;
  age: number;
  life: number;
  s0: number;
  s1: number;
}

export class QuackReactor {
  readonly root: Phaser.GameObjects.Container;
  /** The bay plate, read-outs and conveyor: fades away on the stage. */
  private panel: Phaser.GameObjects.Container;
  /** The housing and everything on it: shakes as one. */
  private body: Phaser.GameObjects.Container;
  private coreGlow: Phaser.GameObjects.Image;
  private ringOuter: Phaser.GameObjects.Image;
  private ringInner: Phaser.GameObjects.Image;
  /** Motion trails behind the spinning rings (two ghosts each). */
  private trails: Phaser.GameObjects.Image[] = [];
  private petals: Phaser.GameObjects.Image[] = [];
  private seams: Phaser.GameObjects.Image;
  /** Light leaking out along the seams. */
  private rays: Phaser.GameObjects.Image[] = [];
  private lamps: Phaser.GameObjects.Image[] = [];
  private arcs: Phaser.GameObjects.Image[] = [];
  private arcUntil = [0, 0];
  private zaps: Phaser.GameObjects.Image[] = [];
  private zapUntil: number[] = [];
  private counter: Phaser.GameObjects.Text;
  private counterLabel: Phaser.GameObjects.Text;
  private needle: Phaser.GameObjects.Image;
  private epicText: Phaser.GameObjects.Text;
  private legText: Phaser.GameObjects.Text;
  private bars: Phaser.GameObjects.Graphics;
  private pityState = '';
  private belt: Phaser.GameObjects.TileSprite;
  private queue: Phaser.GameObjects.Image[] = [];
  private beltGold: Phaser.GameObjects.Image;
  private beltGoldGlow: Phaser.GameObjects.Image;
  private flyers: Phaser.GameObjects.Image[] = [];
  private flyerUsed = new Uint8Array(POOL);
  private gold: Phaser.GameObjects.Image;
  private goldGlow: Phaser.GameObjects.Image;
  private ripples: Ripple[] = [];
  private motes: FxPool;
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
  private nextFeedSfx = 0;
  private sparkDebt = 0;
  private moteDebt = 0;
  /** Heartbeat phase of the core (radians) and the last beat's flash. */
  private beat = 0;
  /** A duck just went in: the core gulps (decays). */
  private gulp = 0;
  /** The screen in local coordinates (where the ducks come from) and the zoom on it. */
  private view = { x0: -200, y0: -400, x1: 200, y1: 400, zoom: 1 };

  constructor(scene: Phaser.Scene) {
    const add = scene.add;
    const ADD = Phaser.BlendModes.ADD;
    const panelParts: Phaser.GameObjects.GameObject[] = [add.image(0, 0, SHOP_TEX.bay).setScale(1 / Q)];

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
    panelParts.push(this.counter, this.counterLabel, dialLabel, this.needle, this.epicText, this.legText, this.bars);

    this.belt = add
      .tileSprite(BAY.beltX0, BAY.beltY, BAY.mouthX - BAY.beltX0, 6, SHOP_TEX.belt)
      .setOrigin(0, 0)
      .setTileScale(1 / Q, 1 / Q);
    panelParts.push(this.belt);
    for (let i = 0; i < QUEUE; i++) {
      const duck = add.image(0, 0, TEX.duck).setScale(DUCK_SCALE).setOrigin(0.5, 0.92);
      this.queue.push(duck);
      panelParts.push(duck);
    }
    this.beltGoldGlow = add.image(GOLD_X, BAY.beltY - 18, TEX.glow).setBlendMode(ADD).setTint(0xffd21f).setScale(0.75);
    this.beltGold = add.image(GOLD_X, BAY.beltY, TEX.duckGold).setScale(GOLD_SCALE).setOrigin(0.5, 0.92);
    panelParts.push(this.beltGoldGlow, this.beltGold, add.image(BAY.mouthX + 1, BAY.beltY - 15, SHOP_TEX.mouth).setScale(1 / Q));
    this.panel = add.container(0, 0, panelParts);

    // The reactor itself.
    const bodyParts: Phaser.GameObjects.GameObject[] = [add.image(0, 0, SHOP_TEX.housing).setScale(1 / Q)];
    this.coreGlow = add.image(0, 0, TEX.glow).setBlendMode(ADD).setTint(IDLE_TINT);
    bodyParts.push(this.coreGlow);
    for (let i = 0; i < 4; i++) {
      const g = add.image(0, 0, i < 2 ? SHOP_TEX.ringOuter : SHOP_TEX.ringInner).setScale(0.5).setBlendMode(ADD).setVisible(false);
      this.trails.push(g);
      bodyParts.push(g);
    }
    this.ringOuter = add.image(0, 0, SHOP_TEX.ringOuter).setScale(0.5).setBlendMode(ADD).setTint(0xff4fb0);
    this.ringInner = add.image(0, 0, SHOP_TEX.ringInner).setScale(0.5).setBlendMode(ADD).setTint(0xffc8ea);
    bodyParts.push(this.ringOuter, this.ringInner);
    for (let k = 0; k < 4; k++) {
      const p = add.image(0, 0, SHOP_TEX.petal).setOrigin(0, 0.5).setScale(1 / Q).setRotation(deg(-90 + k * 90));
      this.petals.push(p);
      bodyParts.push(p);
    }
    this.seams = add.image(0, 0, SHOP_TEX.seams).setScale(0.5).setBlendMode(ADD).setTint(IDLE_TINT);
    bodyParts.push(this.seams);
    for (let k = 0; k < 4; k++) {
      const r = add.image(0, 0, SHOP_TEX.beam).setOrigin(0.5, 1).setBlendMode(ADD).setRotation(deg(45 + k * 90) + Math.PI / 2).setVisible(false);
      this.rays.push(r);
      bodyParts.push(r);
    }
    for (const a of BAY.lamps) {
      const lamp = add
        .image(Math.cos(deg(a)) * BAY.lampR, Math.sin(deg(a)) * BAY.lampR, SHOP_TEX.lamp)
        .setScale(0.5)
        .setBlendMode(ADD);
      this.lamps.push(lamp);
      bodyParts.push(lamp);
    }
    for (let i = 0; i < 2; i++) {
      const arc = add.image(0, 0, SHOP_TEX.boltArc(i)).setScale((0.5 * BAY.ringOuterR) / BOLT_R).setBlendMode(ADD).setVisible(false);
      this.arcs.push(arc);
      bodyParts.push(arc);
    }
    for (let i = 0; i < 5; i++) {
      const z = add.image(0, 0, SHOP_TEX.zap(0)).setOrigin(0, 0.5).setScale(0.5).setBlendMode(ADD).setVisible(false);
      this.zaps.push(z);
      this.zapUntil.push(0);
      bodyParts.push(z);
    }
    this.body = add.container(BAY.core.x, BAY.core.y, bodyParts);
    this.smoke = new FxPool(scene, SHOP_TEX.smoke, 18, Phaser.BlendModes.NORMAL);
    this.motes = new FxPool(scene, TEX.streak, 48);
    this.sparks = new FxPool(scene, TEX.spark, 64);
    for (let i = 0; i < 6; i++) {
      this.ripples.push({ img: add.image(0, 0, SHOP_TEX.ring).setBlendMode(ADD).setVisible(false), age: 1, life: 1, s0: 0, s1: 0 });
    }
    for (let i = 0; i < POOL; i++) this.flyers.push(add.image(0, 0, TEX.duck).setVisible(false));
    this.goldGlow = add.image(0, 0, TEX.glow).setBlendMode(ADD).setTint(0xffd21f).setVisible(false);
    this.gold = add.image(0, 0, TEX.duckGold).setOrigin(0.5, 0.92).setVisible(false);
    this.root = add.container(0, 0, [
      this.panel,
      ...this.smoke.sprites,
      this.body,
      ...this.motes.sprites,
      ...this.ripples.map((r) => r.img),
      ...this.flyers,
      this.goldGlow,
      this.gold,
      ...this.sparks.sprites,
    ]);
    this.reset(true);
  }

  /** Centre of the reactor's core, in the coordinates of the root's parent. */
  coreWorld() {
    return { x: this.root.x + BAY.core.x * this.root.scaleX, y: this.root.y + BAY.core.y * this.root.scaleY };
  }

  /**
   * The stage: `k` 0 (in its bay) .. 1 (alone on the stage, the panel gone).
   * `view` is the screen in the root's local coordinates and `zoom` the
   * root's scale in screen pixels, so ducks keep their size on screen.
   */
  setStage(k: number, x0: number, y0: number, x1: number, y1: number, zoom: number) {
    this.panel.setAlpha(1 - k).setVisible(k < 1);
    const v = this.view;
    v.x0 = x0;
    v.y0 = y0;
    v.x1 = x1;
    v.y1 = y1;
    v.zoom = zoom;
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
    this.gulp = 0;
    this.closing = instant ? 1 : 0;
    this.coreGlow.setTint(IDLE_TINT);
    this.seams.setTint(IDLE_TINT).setVisible(true);
    this.ringOuter.setTint(0xff4fb0);
    this.ringInner.setTint(0xffc8ea);
    this.petals.forEach((p, k) => p.setVisible(true).setPosition(0, 0).setRotation(deg(-90 + k * 90)).setAlpha(1).setScale(1 / Q));
    this.body.setPosition(BAY.core.x, BAY.core.y);
    for (const a of [...this.arcs, ...this.zaps, ...this.rays, ...this.trails]) a.setVisible(false);
    this.hideFlyers();
    this.gold.setVisible(false);
    this.goldGlow.setVisible(false);
    for (const r of this.ripples) r.img.setVisible(false);
    for (const p of [this.motes, this.sparks, this.smoke]) p.clear();
    this.setStage(0, -200, -400, 200, 400, 1);
    this.lampStep = -1;
    this.placeQueue();
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
    const rank = plan ? rankOf(plan.first) : 0;
    const lvl = rank / 3;
    const color = plan ? RARITIES[plan.first].color : IDLE_TINT;

    // --- Feed: the duck stream (or the golden duck), the counter drains -----
    if (plan) {
      if (plan.free) this.feedGold(t, prev, now, quiet, reduced);
      else this.feedStream(t, prev, now, quiet);
      if (crossed(plan.feedEnd - 120, prev, now) && !quiet) shopSfx.reset();
      if (crossed(plan.feedEnd, prev, now) && !quiet) shopSfx.charge((plan.blast - plan.feedEnd) / 1000, plan.first);
      if (crossed(plan.blast - INHALE, prev, now) && !quiet) {
        shopSfx.chargeStop();
        shopSfx.inhale();
      }
      if (crossed(plan.blast, prev, now)) this.burst(plan.first, quiet, reduced);
    } else this.placeQueue();

    // --- Lid: it irises open for the ducks and clunks shut before the overload
    const open = plan && this.blown < 0 ? Math.min(1, Math.max(0, (t - 180) / 260)) * Math.min(1, Math.max(0, (plan.feedEnd - 60 - t) / 140)) : 0;

    // --- Overload ----------------------------------------------------------
    const over = plan !== null && t >= plan.feedEnd && t < plan.blast;
    const u = plan ? overloadAt(plan, t) : 0;
    const inhale = plan !== null && t >= plan.blast - INHALE && t < plan.blast;
    if (over) {
      this.spinOuter = 0.35 + u * u * (10 + 7 * lvl);
      this.spinInner = -(0.6 + u * u * (13 + 9 * lvl));
      this.charge = 0.3 + 0.7 * u;
    } else {
      // Spin back down towards idle.
      const k = Math.exp(-2.2 * s);
      this.spinOuter = 0.35 + (this.spinOuter - 0.35) * k;
      this.spinInner = -0.6 + (this.spinInner + 0.6) * k;
      if (plan && t < plan.feedEnd) {
        this.charge = (0.3 * t) / plan.feedEnd;
        // Ducks going in nudge the rings round.
        this.spinOuter += this.gulp * 0.6;
        this.spinInner -= this.gulp * 0.8;
      } else if (this.blown >= 0 || !plan) this.charge = Math.max(0, this.charge - s * 0.9);
    }
    this.angOuter += this.spinOuter * s;
    this.angInner += this.spinInner * s;
    this.ringOuter.setRotation(this.angOuter);
    this.ringInner.setRotation(this.angInner);
    // Motion trails: ghosts a few frames behind, only when the rings are fast.
    const fast = Math.min(1, Math.max(0, (Math.abs(this.spinOuter) - 1.5) / 8));
    this.trails.forEach((g, i) => {
      const outer = i < 2;
      const lag = (i % 2 ? 0.07 : 0.035) * (reduced ? 0.5 : 1);
      g.setVisible(fast > 0.02 && this.blown < 0);
      if (!g.visible) return;
      const ring = outer ? this.ringOuter : this.ringInner;
      g.setRotation(ring.rotation - (outer ? this.spinOuter : this.spinInner) * lag)
        .setTint(ring.tintTopLeft)
        .setAlpha(fast * (i % 2 ? 0.25 : 0.5));
    });
    const jitter = over ? Math.sin(this.clock * 0.09) * 0.02 * u : Math.sin(this.clock * 0.004) * 0.006;
    this.needle.setRotation(dialAngle(this.charge + jitter));

    // Shake (not during the breath before the burst).
    const amp = over && !inhale ? u * u * (1.4 + 2.6 * lvl) * (reduced ? 0.3 : 1) : this.gulp * 0.8 * (reduced ? 0 : 1);
    this.body.setPosition(BAY.core.x + (Math.random() - 0.5) * 2 * amp, BAY.core.y + (Math.random() - 0.5) * 2 * amp);

    // Core light: pulses in idle, beats like a heart in the overload (faster
    // and faster), gulps as ducks go in, sucks in, then bursts.
    this.gulp = Math.max(0, this.gulp - s * 4);
    this.beat += s * Math.PI * 2 * (over ? 1.6 + 7 * u * u : 1);
    const thump = over ? Math.pow(Math.max(0, Math.sin(this.beat)), 6) : 0;
    const hot = over ? mixColor(mixColor(IDLE_TINT, color, Math.max(0, u - 0.35) / 0.65), 0xffffff, u * 0.6 + thump * 0.3) : IDLE_TINT;
    if (this.blown < 0) {
      const pulse = 0.5 + 0.5 * Math.sin(this.clock * 0.0035);
      const flick = over ? 0.8 + 0.2 * Math.sin(this.clock * 0.07 + Math.sin(this.clock * 0.013) * 3) : 1;
      if (inhale) {
        const k = (t - (plan!.blast - INHALE)) / INHALE;
        this.coreGlow.setScale(1 - 0.6 * k).setAlpha(0.95);
        this.seams.setAlpha(1 - k * 0.6);
      } else {
        const g = this.gulp + 0.7 * open;
        this.coreGlow
          .setScale(0.8 + 0.08 * pulse + 0.55 * u + 0.3 * thump + 0.25 * g)
          .setAlpha(Math.min(1, (0.45 + 0.15 * pulse + 0.45 * u + 0.3 * g) * flick + 0.2 * thump));
        this.seams.setAlpha(Math.min(1, (0.5 + 0.2 * pulse + 0.5 * u) * flick + 0.4 * thump));
      }
      this.coreGlow.setTint(plan && t < plan.feedEnd ? mixColor(IDLE_TINT, 0xffd21f, Math.min(1, this.gulp + open * 0.4)) : hot);
      this.seams.setTint(hot);
      // The lid's petals slide apart (and twist a little) while ducks go in.
      if (this.closing < 1) this.closing = Math.min(1, this.closing + s * 5);
      const k = this.closing;
      this.petals.forEach((p, i) => {
        const a = deg(-90 + i * 90);
        const o = open * 17 * (0.9 + 0.1 * Math.sin(this.clock * 0.02 + i));
        p.setPosition(Math.cos(a) * o, Math.sin(a) * o)
          .setRotation(a + open * 0.22)
          .setAlpha(k)
          .setScale((1 + (1 - k) * 0.25) / Q);
      });
      this.seams.setVisible(open < 0.3);
      // Light leaking out along the seams.
      const leak = Math.max(over && !inhale ? Math.pow(u, 1.3) : 0, open * 0.35);
      this.rays.forEach((r, i) => {
        r.setVisible(leak > 0.02);
        if (!r.visible) return;
        const f = 0.75 + 0.25 * Math.sin(this.clock * 0.05 + i * 2.1);
        const len = BAY.housingR * (0.7 + 1.7 * leak * leak);
        r.setScale(0.22 + 0.32 * leak, len / 420)
          .setTint(open > 0.3 ? 0xffe9a0 : hot)
          .setAlpha(Math.min(1, (0.25 + 0.75 * leak + thump * 0.3) * f) * (reduced ? 0.6 : 1));
      });
    } else {
      // After the burst: the petals tumble away, the core flash fades into a glow.
      this.blown += s;
      const b = this.blown;
      const fly = 1 - Math.pow(1 - Math.min(1, b / 0.9), 3);
      this.petals.forEach((p, k) => {
        if (!p.visible) return;
        const a = deg(-90 + k * 90) + (k % 2 ? 0.25 : -0.2);
        const dir = k % 2 ? 1 : -1;
        p.setPosition(Math.cos(a) * fly * 300, Math.sin(a) * fly * 300 + 260 * b * b)
          .setRotation(a + dir * b * 9)
          .setScale(Math.cos(b * 11 + k) / Q, 1 / Q)
          .setAlpha(1 - Math.min(1, Math.max(0, b - 0.45) / 0.45));
        if (b >= 0.9) p.setVisible(false);
      });
      for (const r of this.rays) r.setVisible(false);
      const f = Math.exp(-b * 3);
      this.coreGlow.setTint(this.blastColor).setScale(0.9 + 1.8 * f).setAlpha(0.55 + 0.45 * f);
    }

    // Lamps: a chase in idle, random flicker in overload, the prize colour after the burst.
    const hz = over ? 20 : plan && t < plan.feedEnd ? 14 : 7;
    const step = Math.floor((this.clock / 1000) * hz) * 3 + (over ? 1 : this.blown >= 0 ? 2 : 0);
    if (step !== this.lampStep) {
      this.lampStep = step;
      const n = this.lamps.length;
      const lead = (step / 3) % n;
      this.lamps.forEach((l, j) => {
        if (inhale) l.setAlpha(0.1);
        else if (over) {
          const on = Math.random() < 0.35 + 0.6 * u;
          l.setTint(on ? mixColor(hot, 0xffffff, u) : IDLE_TINT).setAlpha(on ? 1 : 0.3);
        } else if (this.blown >= 0) l.setTint(this.blastColor).setAlpha(this.blown < 1.2 ? 1 : 0.65);
        else {
          const on = j === lead || j === (lead + n / 2) % n;
          l.setTint(on ? 0xffffff : IDLE_TINT).setAlpha(on ? 1 : 0.4);
        }
      });
    }

    // Energy sucked into the core: a few motes while ducks go in, a
    // whirlpool in the overload.
    if (plan && !quiet && this.blown < 0 && (over || t < plan.feedEnd)) {
      this.moteDebt += s * (over ? (16 + 120 * u) * (0.7 + 0.5 * lvl) : 10) * (reduced ? 0.5 : 1);
      while (this.moteDebt >= 1) {
        this.moteDebt--;
        const a = Math.random() * Math.PI * 2;
        const r = BAY.housingR * (1.15 + Math.random() * (0.6 + 0.8 * u));
        const late = over && Math.random() < u;
        this.motes.emit({
          x: BAY.core.x + Math.cos(a) * r,
          y: BAY.core.y + Math.sin(a) * r,
          // One way round, like water down a drain.
          home: { x: BAY.core.x, y: BAY.core.y, swirl: 1.1 + Math.random() * 1.2 },
          life: (0.38 + Math.random() * 0.3) * (1 - 0.35 * u),
          scale: 0.24 + Math.random() * 0.22,
          scaleTo: 0.08,
          tint: late ? mixColor(color, 0xffffff, 0.3) : Math.random() < 0.5 ? 0xffffff : over ? hot : 0xffd21f,
          align: true,
          fade: Fade.In,
        });
      }
    }

    // Sparks fly off the rim, more and more; lightning over the lid.
    if (over && !inhale && !quiet) {
      this.sparkDebt += s * (6 + 60 * u) * (0.6 + 0.5 * lvl);
      while (this.sparkDebt >= 1) {
        this.sparkDebt--;
        const a = Math.random() * Math.PI * 2;
        const r = BAY.housingR * (0.75 + Math.random() * 0.25);
        const v = 90 + Math.random() * 180;
        this.sparks.emit({
          x: BAY.core.x + Math.cos(a) * r,
          y: BAY.core.y + Math.sin(a) * r,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v - 70,
          gravity: 420,
          life: 0.35 + Math.random() * 0.35,
          scale: 0.22 + Math.random() * 0.2,
          scaleTo: 0.05,
          tint: Math.random() < 0.5 ? 0xffffff : Math.random() < 0.5 ? hot : 0xffd21f,
          fade: Fade.Flicker,
        });
        if (this.clock >= this.nextSparkSfx && Math.random() < 0.5) {
          this.nextSparkSfx = this.clock + 110;
          shopSfx.spark();
        }
      }
      // Arcs crawl round the rings, bolts jump from the core over the lid to the rim.
      if (u > 0.3) {
        for (let i = 0; i < 2; i++) {
          const arc = this.arcs[i];
          if (arc.visible && this.clock >= this.arcUntil[i]) arc.setVisible(false);
          if (!arc.visible && Math.random() < u * 0.1) {
            arc.setTexture(SHOP_TEX.boltArc(Math.floor(Math.random() * BOLT_ARCS)))
              .setRotation(Math.random() * Math.PI * 2)
              .setFlipY(Math.random() < 0.5)
              .setTint(Math.random() < 0.5 ? 0xffffff : hot)
              .setAlpha(0.9)
              .setVisible(true);
            this.arcUntil[i] = this.clock + 60 + Math.random() * 60;
          }
        }
      }
      if (u > 0.12) {
        const chance = (u - 0.12) * (0.12 + 0.12 * lvl);
        for (let i = 0; i < this.zaps.length; i++) {
          const z = this.zaps[i];
          if (z.visible && this.clock >= this.zapUntil[i]) z.setVisible(false);
          if (!z.visible && Math.random() < chance) {
            z.setTexture(SHOP_TEX.zap(Math.floor(Math.random() * ZAPS)))
              .setRotation(Math.random() * Math.PI * 2)
              .setFlipY(Math.random() < 0.5)
              .setScale(0.5 * (0.85 + Math.random() * 0.2))
              .setTint(Math.random() < 0.4 ? 0xffffff : mixColor(hot, 0xffffff, 0.3))
              .setAlpha(0.8 + Math.random() * 0.2)
              .setVisible(true);
            this.zapUntil[i] = this.clock + 45 + Math.random() * 70;
          }
        }
      }
      if (u > 0.4 && this.clock >= this.nextAlarm) {
        this.nextAlarm = this.clock + 240 - 130 * u;
        shopSfx.alarm(u);
      }
    } else if (!over || inhale) {
      for (const a of this.arcs) if (a.visible) a.setVisible(false);
      for (const z of this.zaps) if (z.visible) z.setVisible(false);
    }

    // Steam from the vents: a lazy puff now and then, a jet when it overloads.
    if (this.clock >= this.nextPuff && !quiet) {
      this.nextPuff = this.clock + (over ? Math.max(60, 300 - 250 * u) : 2400 + Math.random() * 1600);
      const vent = BAY.vents[Math.floor(Math.random() * BAY.vents.length)];
      const a = deg(vent);
      const r = BAY.housingR + 12;
      const v = over ? 60 + 70 * u : 25;
      this.smoke.emit({
        x: BAY.core.x + Math.cos(a) * r,
        y: BAY.core.y + Math.sin(a) * r,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - 25,
        drag: 0.8,
        life: over ? 0.8 : 1.6,
        scale: 0.25,
        scaleTo: over ? 1 + 0.5 * u : 0.8,
        alpha: over ? 0.55 : 0.35,
        tint: 0xd8e2f0,
        spin: (Math.random() - 0.5) * 1.5,
        fade: Fade.Puff,
      });
    }

    for (const r of this.ripples) {
      if (!r.img.visible) continue;
      r.age += s;
      const k = r.age / r.life;
      if (k >= 1) r.img.setVisible(false);
      else r.img.setScale(r.s0 + (r.s1 - r.s0) * (1 - Math.pow(1 - k, 2))).setAlpha(1 - k);
    }
    this.motes.update(s);
    this.sparks.update(s);
    this.smoke.update(s);
  }

  /** A paid charge: a hundred ducks hop in from the bottom of the screen and dive into the core. */
  private feedStream(t: number, prev: number, now: number, quiet: boolean) {
    const { x0, x1, y1, zoom } = this.view;
    const cx = BAY.core.x;
    const cy = BAY.core.y;
    const ground = y1 + 26 / zoom;
    this.flyerUsed.fill(0);
    for (let i = 0; i < STREAM; i++) {
      const L = launchAt(i);
      if (L > Math.max(t, now)) break;
      const D = flightOf(i);
      const rim = i < RIM_HOPPERS && hash(i, 5) < 0.35;
      const total = rim ? D + RIM_SQUASH : D;
      // The rim hoppers' landing on the rim.
      const rimA = deg(-150 + 120 * hash(i, 6));
      const px = cx + Math.cos(rimA) * BAY.housingR * 0.9;
      const py = cy + Math.sin(rimA) * BAY.housingR * 0.9;
      const t1 = L + D * 0.62;
      if (rim && crossed(t1, prev, now) && !quiet) {
        this.sparks.emit({ x: px, y: py, vx: (Math.random() - 0.5) * 60, vy: -40, gravity: 200, life: 0.3, scale: 0.3, scaleTo: 0.05, tint: 0xffe9a0 });
      }
      if (crossed(L + total, prev, now)) this.duckIn(i, quiet);
      if (t < L || t >= L + total) continue;
      const slot = i % POOL;
      const d = this.flyers[slot];
      this.flyerUsed[slot] = 1;
      const sx = x0 + 20 / zoom + (x1 - x0 - 40 / zoom) * hash(i, 1);
      const size = (FLY_SCALE * (0.8 + 0.45 * hash(i, 3))) / zoom;
      const tumble = hash(i, 4) < 0.28 ? (hash(i, 7) < 0.5 ? -1 : 1) * Math.PI * 2 : 0;
      let x: number;
      let y: number;
      let vx: number;
      let vy: number;
      let u: number;
      let sqX = 1;
      let sqY = 1;
      let into = 0;
      if (!rim || t < t1) {
        // One arc: up from the bottom, over the top of the core and down into it.
        const ex = rim ? px : cx;
        const ey = rim ? py : cy;
        const dur = rim ? D * 0.62 : D;
        u = (t - L) / dur;
        const H = (ground - ey) * (rim ? 0.36 : 0.42 + 0.14 * hash(i, 2));
        x = sx + (ex - sx) * u;
        y = ground + (ey - ground) * u - 4 * H * u * (1 - u);
        vx = ex - sx;
        vy = ey - ground - 4 * H * (1 - 2 * u);
        if (!rim) into = Math.max(0, (u - 0.8) / 0.2);
      } else {
        const ts = t - t1;
        if (ts < RIM_SQUASH) {
          // Splat on the rim, then gather for the hop.
          const k = ts / RIM_SQUASH;
          sqY = 0.62 + 0.38 * easeOutBack(k);
          sqX = 1.35 - 0.35 * easeOutBack(k);
          x = px;
          y = py;
          vx = cx - px;
          vy = 0;
          u = 1;
        } else {
          // A little hop off the rim into the core.
          u = (ts - RIM_SQUASH) / (D * 0.38);
          const H = 26;
          x = px + (cx - px) * u;
          y = py + (cy - py) * u - 4 * H * u * (1 - u);
          vx = cx - px;
          vy = cy - py - 4 * H * (1 - 2 * u);
          into = Math.max(0, (u - 0.6) / 0.4);
        }
      }
      // Stretch along the flight when it's fast, a lean into it, a flip for some.
      const speed = Math.min(1, Math.hypot(vx, vy) / 900);
      const st = 0.22 * speed;
      const left = vx < 0;
      const lean = Math.atan2(vy, Math.abs(vx)) * 0.45 * (left ? -1 : 1);
      const shrink = 1 - 0.8 * into * into;
      d.setVisible(true)
        .setFlipX(left)
        .setPosition(x, y)
        .setRotation(lean + tumble * (sqY < 1 ? 0 : Math.min(1, u) * (1 - into)))
        .setScale(size * sqX * (1 - st * 0.5) * shrink, size * sqY * (1 + st) * shrink)
        .setAlpha(1 - into * into * 0.7);
    }
    for (let k = 0; k < POOL; k++) if (!this.flyerUsed[k] && this.flyers[k].visible) this.flyers[k].setVisible(false);
  }

  /** Duck i goes into the core: the counter ticks, a splash, a gulp. */
  private duckIn(i: number, quiet: boolean) {
    this.fuel = Math.max(0, STREAM - 1 - i);
    this.counter.setText(String(this.fuel));
    if (quiet) return;
    const k = i / (STREAM - 1);
    this.gulp = Math.min(1, this.gulp + 0.35);
    if (this.clock >= this.nextFeedSfx) {
      this.nextFeedSfx = this.clock + 42;
      shopSfx.feed(k);
    }
    if (i % 9 === 4) shopSfx.quack(k);
    const { x, y } = BAY.core;
    for (let j = 0; j < 2; j++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2;
      const v = 90 + Math.random() * 120;
      this.sparks.emit({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        gravity: 380,
        life: 0.35,
        scale: 0.32,
        scaleTo: 0.06,
        tint: j ? 0xffffff : 0xffd21f,
      });
    }
    if (i % 2 === 0) this.ripple(x, y, 0.06, 0.32 + 0.12 * k, 0.3, i % 4 ? 0xffd21f : 0xffffff);
  }

  private ripple(x: number, y: number, s0: number, s1: number, life: number, tint: number) {
    const r = this.ripples.find((q) => !q.img.visible) ?? this.ripples.reduce((a, b) => (a.age / a.life > b.age / b.life ? a : b));
    r.img.setVisible(true).setPosition(x, y).setTint(tint).setScale(s0).setAlpha(1);
    r.age = 0;
    r.life = life;
    r.s0 = s0;
    r.s1 = s1;
  }

  /** A free charge: the golden duck pops up, hops over, crouches and leaps into the core. */
  private feedGold(t: number, prev: number, now: number, quiet: boolean, reduced: boolean) {
    const { y1, zoom } = this.view;
    const cx = BAY.core.x;
    const cy = BAY.core.y;
    const floor = Math.min(y1 - 70 / zoom, cy + BAY.housingR + 80);
    const xs = [cx - 120, cx - 62, cx];
    const size = GOLD_STAGE_SCALE / zoom;
    let x = xs[0];
    let y = floor;
    let sx = 1;
    let sy = 1;
    let ang = 0;
    let alpha = 1;
    let trail = false;
    if (t < GOLD_UP) {
      // Pops up from below the screen.
      const k = t / GOLD_UP;
      y = y1 + 60 / zoom + (floor - y1 - 60 / zoom) * easeOutBack(k);
      sy = 1 + 0.15 * (1 - k);
      sx = 1 - 0.1 * (1 - k);
    } else if (t < GOLD_CROUCH) {
      const hop = GOLD_HOPS.findIndex(([a, b]) => t >= a && t < b);
      if (hop >= 0) {
        const [a, b] = GOLD_HOPS[hop];
        const k = (t - a) / (b - a);
        const H = hop ? 70 : 52;
        x = xs[hop] + (xs[hop + 1] - xs[hop]) * k;
        y = floor - 4 * H * k * (1 - k);
        sy = 1 + 0.2 * Math.abs(1 - 2 * k);
        sx = 1 - 0.12 * Math.abs(1 - 2 * k);
        ang = (1 - 2 * k) * -0.25;
        trail = true;
      } else {
        // Landed: squash and wobble back.
        const last = GOLD_HOPS.filter(([, b]) => t >= b).length;
        x = xs[last];
        const since = t - (last ? GOLD_HOPS[last - 1][1] : GOLD_UP);
        const w = Math.exp(-since / 70) * Math.cos(since / 22);
        sy = 1 - 0.3 * w;
        sx = 1 + 0.25 * w;
      }
    } else if (t < GOLD_LEAP) {
      // Crouch: winding up for the big one, shaking with excitement.
      const k = (t - GOLD_CROUCH) / (GOLD_LEAP - GOLD_CROUCH);
      x = xs[2] + (reduced ? 0 : Math.sin(t * 0.25) * 1.5);
      sy = 1 - 0.32 * Math.sin(k * Math.PI * 0.5);
      sx = 1 + 0.22 * Math.sin(k * Math.PI * 0.5);
    } else if (t < GOLD_IN) {
      // The leap: way up over the reactor, a full flip, and down into the core.
      const k = (t - GOLD_LEAP) / (GOLD_IN - GOLD_LEAP);
      const H = (floor - cy) * 0.55 + 40;
      x = xs[2];
      y = floor + (cy - floor) * k - 4 * H * k * (1 - k);
      ang = -Math.PI * 2 * Math.min(1, k * 1.25);
      sy = 1 + 0.3 * Math.max(0, 1 - k * 4);
      sx = 1 - 0.18 * Math.max(0, 1 - k * 4);
      const into = Math.max(0, (k - 0.75) / 0.25);
      sx *= 1 - 0.8 * into;
      sy *= 1 - 0.8 * into;
      alpha = 1 - into * 0.6;
      trail = true;
    } else alpha = 0;
    const show = alpha > 0 && t < GOLD_IN;
    this.gold.setVisible(show);
    this.goldGlow.setVisible(show);
    if (show) {
      this.gold.setPosition(x, y).setRotation(ang).setScale(size * sx, size * sy).setAlpha(alpha);
      const glow = 0.8 + 0.2 * Math.sin(this.clock * 0.012);
      this.goldGlow
        .setPosition(x, y - 36 / zoom)
        .setScale((1.5 * glow) / zoom)
        .setAlpha(0.75 * alpha);
      // Glitter falls off it while it jumps.
      if (trail && !quiet && Math.random() < 0.8) {
        this.sparks.emit({
          x: x + ((Math.random() - 0.5) * 40) / zoom,
          y: y - (Math.random() * 50) / zoom,
          vx: (Math.random() - 0.5) * 40,
          vy: 20 + Math.random() * 40,
          gravity: 160,
          life: 0.5 + Math.random() * 0.3,
          scale: 0.3 + Math.random() * 0.25,
          scaleTo: 0.05,
          tint: Math.random() < 0.7 ? 0xffd21f : 0xffffff,
          fade: Fade.Flicker,
        });
      }
    }
    if (quiet) {
      if (now >= GOLD_IN) this.fuel = 0;
      return;
    }
    for (const [a] of GOLD_HOPS) if (crossed(a, prev, now)) shopSfx.quack(a === GOLD_HOPS[0][0] ? 0.2 : 0.5);
    if (crossed(GOLD_LEAP, prev, now)) shopSfx.quack(1);
    if (crossed(GOLD_IN, prev, now)) {
      this.fuel = 0;
      shopSfx.golden();
      this.gulp = 1;
      const { x: gx, y: gy } = BAY.core;
      this.ripple(gx, gy, 0.1, 0.9, 0.5, 0xffd21f);
      this.ripple(gx, gy, 0.05, 0.6, 0.4, 0xffffff);
      for (let i = 0; i < 26; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = 120 + Math.random() * 260;
        this.sparks.emit({
          x: gx,
          y: gy,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v - 60,
          drag: 1.4,
          gravity: 260,
          life: 0.6 + Math.random() * 0.4,
          scale: 0.35 + Math.random() * 0.3,
          scaleTo: 0.06,
          tint: i % 3 ? 0xffd21f : 0xffffff,
          fade: Fade.Flicker,
        });
      }
    }
  }

  private hideFlyers() {
    for (const d of this.flyers) if (d.visible) d.setVisible(false);
  }

  /** The reactor bursts: the lid blows off and the core flashes the shell's colour. */
  private burst(rarity: Rarity, quiet: boolean, reduced: boolean) {
    this.blown = quiet ? 1 : 0;
    this.blastColor = RARITIES[rarity].color;
    this.seams.setVisible(false);
    this.ringOuter.setTint(mixColor(this.blastColor, 0xffffff, 0.3));
    this.ringInner.setTint(mixColor(this.blastColor, 0xffffff, 0.6));
    this.lampStep = -1;
    this.hideFlyers();
    this.gold.setVisible(false);
    this.goldGlow.setVisible(false);
    for (const z of [...this.zaps, ...this.arcs, ...this.rays, ...this.trails]) z.setVisible(false);
    this.motes.clear();
    if (quiet) {
      for (const p of this.petals) p.setVisible(false);
      return;
    }
    const rank = rankOf(rarity);
    const { x, y } = BAY.core;
    for (let i = 0; i < (18 + rank * 8) * (reduced ? 0.6 : 1); i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 160 + Math.random() * 260;
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
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * Math.PI * 2;
      this.smoke.emit({
        x: x + Math.cos(a) * 24,
        y: y + Math.sin(a) * 24,
        vx: Math.cos(a) * 70,
        vy: Math.sin(a) * 70 - 20,
        drag: 1.2,
        life: 1.1,
        scale: 0.6,
        scaleTo: 1.8,
        alpha: 0.45,
        tint: mixColor(0x8a94a6, this.blastColor, 0.3),
        fade: Fade.Puff,
      });
    }
  }

  /** Idle: the queue waits on the belt (the golden duck at the front when the next charge is free). */
  private placeQueue() {
    const free = this.free;
    const { beltY, mouthX } = BAY;
    for (let i = 0; i < QUEUE; i++) {
      const d = this.queue[i];
      d.setVisible(!free);
      if (free) continue;
      const x = mouthX - 18 - i * 24;
      const ph = this.clock * 0.004 + i * 1.7;
      const hop = Math.max(0, Math.sin(ph * 2.2) - 0.75) * 12;
      d.setPosition(x, beltY - hop).setAngle(Math.sin(ph) * 4);
    }
    this.beltGold.setVisible(free);
    this.beltGoldGlow.setVisible(free);
    if (free) {
      const hop = Math.max(0, Math.sin(this.clock * 0.005) - 0.6) * 10;
      this.beltGold.setPosition(GOLD_X, beltY - hop).setAngle(Math.sin(this.clock * 0.003) * 5);
      this.beltGoldGlow
        .setPosition(GOLD_X, beltY - 20 - hop)
        .setAlpha(0.55 + 0.15 * Math.sin(this.clock * 0.006))
        .setScale(0.7 + 0.05 * Math.sin(this.clock * 0.006));
    }
  }
}
