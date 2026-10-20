import Phaser from 'phaser';
import { save } from '../game/storage';
import { css, palette } from '../game/palette';
import { sfx } from '../audio/Sfx';
import { TEX, DUCK_RES } from '../fx/textures';
import { progress } from '../game/progress';
import { formatCountdown, prettyDate } from '../game/daily';
import { TIER_COLOR, ALL_DONE_BONUS } from '../game/missions';
import { todaysGuest } from '../game/guest';
import { RARITIES, skinTexture } from '../game/skins';
import { abilityFor } from '../game/abilities';
import { drawStar, hexColor, makeButton, makeIconButton, makeText, type Button, type IconButton } from './widgets';

// --- Shared look for the progression screens (Daily, Records, banners) ------

export const GOLD = 0xffd21f;
export const GOLD_CSS = '#ffd21f';
/** Captions: never smaller than 11 px, always this colour. */
export const CAPTION = '#8fa3b5';
export const BODY = '#c9d6e2';
const PLATE = 0x0a0f18;
const LINE = 0x1c2a3a;
const DIM = 0x34414f;

export function setIfChanged(t: Phaser.GameObjects.Text, s: string) {
  if (t.text !== s) t.setText(s);
}

/** The dark result-card plate: #0A0F18 at .9, radius 22, a thin coloured edge. */
export function drawPlate(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, edge = LINE, edgeAlpha = 1, r = 22) {
  g.fillStyle(PLATE, 0.9).fillRoundedRect(x, y, w, h, r);
  g.lineStyle(1, edge, edgeAlpha).strokeRoundedRect(x, y, w, h, r);
}

export type GlyphKind =
  | 'flag'
  | 'star'
  | 'combo'
  | 'road'
  | 'duck'
  | 'warp'
  | 'orb'
  | 'flame'
  | 'skull'
  | 'bolt'
  | 'crown'
  | 'check'
  | 'lock'
  | 'shield'
  | 'reroll';

const V = (x: number, y: number) => new Phaser.Math.Vector2(x, y);

/** Small vector icons on a 2-unit grid (r = half size). Drawn once, never per frame. */
export function drawGlyph(g: Phaser.GameObjects.Graphics, kind: GlyphKind, x: number, y: number, r: number, color: number, alpha = 1) {
  const s = r;
  const lw = Math.max(1.5, r * 0.18);
  switch (kind) {
    case 'star':
      drawStar(g, x, y, r, color, true, alpha);
      break;
    case 'flag':
      g.lineStyle(lw, color, alpha).lineBetween(x - s * 0.55, y - s * 0.9, x - s * 0.55, y + s * 0.9);
      g.fillStyle(color, alpha).fillTriangle(x - s * 0.45, y - s * 0.9, x + s * 0.8, y - s * 0.5, x - s * 0.45, y - s * 0.05);
      break;
    case 'combo':
      g.lineStyle(lw * 1.2, color, alpha);
      for (const dx of [-0.45, 0.25]) {
        g.strokePoints([V(x + (dx - 0.3) * s, y - s * 0.6), V(x + (dx + 0.25) * s, y), V(x + (dx - 0.3) * s, y + s * 0.6)], false);
      }
      break;
    case 'road':
      g.lineStyle(lw, color, alpha);
      g.lineBetween(x - s * 0.25, y - s * 0.85, x - s * 0.85, y + s * 0.85);
      g.lineBetween(x + s * 0.25, y - s * 0.85, x + s * 0.85, y + s * 0.85);
      g.fillStyle(color, alpha);
      g.fillRect(x - lw / 2, y - s * 0.6, lw, s * 0.3);
      g.fillRect(x - lw / 2, y + s * 0.05, lw, s * 0.4);
      break;
    case 'duck':
      g.fillStyle(color, alpha);
      g.fillEllipse(x - s * 0.1, y + s * 0.3, s * 1.6, s * 0.95);
      g.fillCircle(x + s * 0.35, y - s * 0.35, s * 0.42);
      g.fillTriangle(x + s * 0.7, y - s * 0.42, x + s * 1.05, y - s * 0.25, x + s * 0.7, y - s * 0.15);
      g.fillStyle(PLATE, alpha).fillCircle(x + s * 0.45, y - s * 0.45, Math.max(1, s * 0.08));
      break;
    case 'warp': {
      const pts = [V(x, y - s), V(x + s * 0.25, y - s * 0.25), V(x + s, y), V(x + s * 0.25, y + s * 0.25), V(x, y + s), V(x - s * 0.25, y + s * 0.25), V(x - s, y), V(x - s * 0.25, y - s * 0.25)];
      g.fillStyle(color, alpha).fillPoints(pts, true);
      break;
    }
    case 'orb':
      g.fillStyle(color, alpha * 0.25).fillCircle(x, y, s);
      g.lineStyle(lw, color, alpha).strokeCircle(x, y, s * 0.8);
      g.fillStyle(color, alpha).fillCircle(x - s * 0.25, y - s * 0.25, s * 0.22);
      break;
    case 'flame': {
      const pts: Phaser.Math.Vector2[] = [];
      for (let i = 0; i <= 24; i++) {
        const t = (i / 24) * Math.PI * 2;
        // A teardrop: round at the bottom, pointed on top.
        const rr = s * (0.62 + 0.38 * Math.sin(t / 2) ** 6) * (Math.sin(t) > 0 ? 0.75 : 1);
        pts.push(V(x + Math.sin(t) * rr * 0.9, y + s * 0.2 - Math.cos(t) * rr * 1.25 * (Math.cos(t) > 0 ? 1.15 : 0.7)));
      }
      g.fillStyle(color, alpha).fillPoints(pts, true);
      g.fillStyle(0xfff3a0, alpha * 0.9).fillEllipse(x, y + s * 0.4, s * 0.55, s * 0.75);
      break;
    }
    case 'skull':
      g.fillStyle(color, alpha).fillCircle(x, y - s * 0.15, s * 0.75);
      g.fillRoundedRect(x - s * 0.45, y + s * 0.2, s * 0.9, s * 0.6, s * 0.15);
      g.fillStyle(PLATE, alpha).fillCircle(x - s * 0.3, y - s * 0.15, s * 0.2).fillCircle(x + s * 0.3, y - s * 0.15, s * 0.2);
      break;
    case 'bolt':
      g.fillStyle(color, alpha).fillPoints(
        [V(x + s * 0.2, y - s), V(x - s * 0.6, y + s * 0.15), V(x - s * 0.05, y + s * 0.15), V(x - s * 0.25, y + s), V(x + s * 0.6, y - s * 0.2), V(x + s * 0.05, y - s * 0.2)],
        true,
      );
      break;
    case 'crown':
      g.fillStyle(color, alpha).fillPoints(
        [V(x - s, y - s * 0.55), V(x - s * 0.5, y), V(x, y - s * 0.8), V(x + s * 0.5, y), V(x + s, y - s * 0.55), V(x + s * 0.8, y + s * 0.6), V(x - s * 0.8, y + s * 0.6)],
        true,
      );
      break;
    case 'check':
      g.lineStyle(lw * 1.4, color, alpha).strokePoints([V(x - s * 0.7, y), V(x - s * 0.15, y + s * 0.55), V(x + s * 0.75, y - s * 0.55)], false);
      break;
    case 'lock':
      g.lineStyle(lw, color, alpha);
      g.beginPath();
      g.arc(x, y - s * 0.2, s * 0.42, Math.PI, 0, false);
      g.strokePath();
      g.fillStyle(color, alpha).fillRoundedRect(x - s * 0.65, y - s * 0.2, s * 1.3, s * 1.0, s * 0.18);
      break;
    case 'shield':
      g.fillStyle(color, alpha).fillPoints(
        [V(x, y - s), V(x + s * 0.85, y - s * 0.65), V(x + s * 0.7, y + s * 0.35), V(x, y + s), V(x - s * 0.7, y + s * 0.35), V(x - s * 0.85, y - s * 0.65)],
        true,
      );
      break;
    case 'reroll':
      g.lineStyle(lw, color, alpha);
      g.beginPath();
      g.arc(x, y, s * 0.7, -Math.PI * 0.15, Math.PI * 1.45, false);
      g.strokePath();
      g.fillStyle(color, alpha).fillTriangle(x + s * 0.35, y - s * 0.55, x + s * 1.0, y - s * 0.6, x + s * 0.75, y + s * 0.05);
      break;
  }
}

/** BACK on the left, the title in the middle, the duck wallet on the right. */
export class TopBar {
  readonly root: Phaser.GameObjects.Container;
  private back: IconButton;
  private title: Phaser.GameObjects.Text;
  private icon: Phaser.GameObjects.Image;
  private count: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, title: string, onBack: () => void) {
    // Same top bar as the level map: round back button, centred title.
    this.back = makeIconButton(scene, 'back', onBack);
    this.title = makeText(scene, 0, 0, title, { size: 24, spacing: 3 }).setOrigin(0.5);
    this.icon = scene.add.image(0, 0, TEX.duck).setScale(0.28 / DUCK_RES);
    this.count = makeText(scene, 0, 0, '0', { font: 'mono', size: 15, weight: '700', color: GOLD_CSS }).setOrigin(1, 0.5);
    this.root = scene.add.container(0, 0, [this.back, this.title, this.icon, this.count]);
    save.onDucks(() => this.refresh());
  }

  /** `width` is the content width; the bar is centred on x = 0. */
  layout(width: number) {
    const left = -width / 2;
    this.back.setPosition(left + 20, 22);
    this.title.setPosition(0, 22);
    this.count.setPosition(-left, 22);
    this.refresh();
  }

  refresh() {
    setIfChanged(this.count, String(save.ducks));
    this.icon.setPosition(this.count.x - this.count.width - 16, 22);
  }
}

// --- The Daily screen ---------------------------------------------------------------

/** Today's guest skin: a row inside the Daily Run card, above PLAY. */
const GUEST_Y = 174;
const GUEST_H = 74;
const RUN_H = 236 + GUEST_H + 10;
const STREAK_H = 170;
const MISSION_ROW = 62;
const MISSIONS_H = 44 + MISSION_ROW * 3 + 6;
const GAP = 12;

interface MissionRow {
  chip: Phaser.GameObjects.Graphics;
  tier: Phaser.GameObjects.Text;
  text: Phaser.GameObjects.Text;
  bar: Phaser.GameObjects.Graphics;
  count: Phaser.GameObjects.Text;
  reward: Phaser.GameObjects.Text;
  reroll: Phaser.GameObjects.Container;
  rerollIcon: Phaser.GameObjects.Graphics;
}

/**
 * DAILY: today's Daily Run (modifier, milestones, PLAY), the streak with its
 * 7-day track and CLAIM button, and the three daily missions with REROLL.
 * Everything is drawn in refresh(); update() only animates and ticks the
 * countdown once a second.
 */
export class DailyScreen {
  readonly root: Phaser.GameObjects.Container;
  private content: Phaser.GameObjects.Container;
  private bar: TopBar;
  private width = 358;

  // Daily Run card
  private runPlate: Phaser.GameObjects.Graphics;
  private runCaption: Phaser.GameObjects.Text;
  private runReset: Phaser.GameObjects.Text;
  private modName: Phaser.GameObjects.Text;
  private modBlurb: Phaser.GameObjects.Text;
  private track: Phaser.GameObjects.Graphics;
  private msTop: Phaser.GameObjects.Text[] = [];
  private msBottom: Phaser.GameObjects.Text[] = [];
  private runBest: Phaser.GameObjects.Text;
  private guestPlate: Phaser.GameObjects.Graphics;
  private guestFace: Phaser.GameObjects.Image;
  private guestCaption: Phaser.GameObjects.Text;
  private guestName: Phaser.GameObjects.Text;
  private guestPower: Phaser.GameObjects.Text;
  private guestDesc: Phaser.GameObjects.Text;
  private play!: Button;
  private playKey = '';
  private handlers: { play: () => void; back: () => void };

  // Streak card
  private streakPlate: Phaser.GameObjects.Graphics;
  private flame: Phaser.GameObjects.Graphics;
  private streakTitle: Phaser.GameObjects.Text;
  private shieldIcon: Phaser.GameObjects.Graphics;
  private shieldText: Phaser.GameObjects.Text;
  private days: Phaser.GameObjects.Graphics;
  private todayGlow: Phaser.GameObjects.Graphics;
  private dayValue: Phaser.GameObjects.Text[] = [];
  private dayLabel: Phaser.GameObjects.Text[] = [];
  private claim!: Button;
  private claimKey = '';
  private claimedNote: Phaser.GameObjects.Text;

  // Missions card
  private missionsPlate: Phaser.GameObjects.Graphics;
  private missionsTitle: Phaser.GameObjects.Text;
  private missionsNote: Phaser.GameObjects.Text;
  private rows: MissionRow[] = [];

  private nextTick = 0;

  constructor(
    private scene: Phaser.Scene,
    handlers: { play: () => void; back: () => void },
  ) {
    this.handlers = handlers;
    const t = (str: string, o: Parameters<typeof makeText>[4]) => makeText(scene, 0, 0, str, o);
    const caption = (str = '') => t(str, { font: 'mono', size: 11, color: CAPTION, spacing: 1.6 });
    this.bar = new TopBar(scene, 'DAILY', handlers.back);

    this.runPlate = scene.add.graphics();
    this.runCaption = caption();
    this.runReset = caption().setOrigin(1, 0).setAlign('right').setLineSpacing(3);
    this.modName = t('', { size: 30, spacing: 1.5 });
    this.modBlurb = t('', { size: 14, color: BODY, weight: '500' });
    this.track = scene.add.graphics();
    for (let i = 0; i < 3; i++) {
      this.msTop.push(t('', { font: 'mono', size: 11, weight: '700', color: GOLD_CSS }).setOrigin(0.5, 1));
      this.msBottom.push(caption().setOrigin(0.5, 0));
    }
    this.runBest = caption();
    this.guestPlate = scene.add.graphics();
    this.guestFace = scene.add.image(0, 0, skinTexture('classic')).setScale(0.5);
    this.guestCaption = caption();
    this.guestName = t('', { size: 16, spacing: 1 });
    this.guestPower = t('', { size: 13, spacing: 1 });
    this.guestDesc = t('', { font: 'mono', size: 11, color: BODY }).setLineSpacing(1);

    this.streakPlate = scene.add.graphics();
    this.flame = scene.add.graphics();
    this.streakTitle = t('', { size: 18, spacing: 1 }).setOrigin(0, 0.5);
    this.shieldIcon = scene.add.graphics();
    this.shieldText = caption().setOrigin(1, 0.5);
    this.todayGlow = scene.add.graphics();
    this.days = scene.add.graphics();
    for (let i = 0; i < 7; i++) {
      this.dayValue.push(t('', { font: 'mono', size: 13, weight: '700', color: CAPTION }).setOrigin(0.5));
      this.dayLabel.push(t(`DAY ${i + 1}`, { font: 'mono', size: 11, color: CAPTION }).setOrigin(0.5, 0));
    }
    this.claimedNote = caption().setOrigin(0.5);

    this.missionsPlate = scene.add.graphics();
    this.missionsTitle = t('DAILY MISSIONS', { size: 15, spacing: 1.2 });
    this.missionsNote = t('', { font: 'mono', size: 11, weight: '700', color: GOLD_CSS, spacing: 1 }).setOrigin(1, 0);
    for (let i = 0; i < 3; i++) {
      const rerollIcon = scene.add.graphics();
      const hit = scene.add.zone(0, 0, 44, 44).setInteractive({ useHandCursor: true });
      const reroll = scene.add.container(0, 0, [rerollIcon, hit]);
      hit.on('pointerdown', () => this.onReroll(i));
      this.rows.push({
        chip: scene.add.graphics(),
        tier: t('', { font: 'mono', size: 11, weight: '700', spacing: 1.2 }).setOrigin(0.5),
        text: t('', { size: 13, spacing: 0.4 }),
        bar: scene.add.graphics(),
        count: caption().setOrigin(1, 0.5),
        reward: t('', { font: 'mono', size: 13, weight: '700', color: GOLD_CSS }).setOrigin(1, 0.5),
        reroll,
        rerollIcon,
      });
    }

    this.content = scene.add.container(0, 0, [
      this.bar.root,
      this.runPlate,
      this.runCaption,
      this.runReset,
      this.modName,
      this.modBlurb,
      this.track,
      ...this.msTop,
      ...this.msBottom,
      this.runBest,
      this.guestPlate,
      this.guestFace,
      this.guestCaption,
      this.guestName,
      this.guestPower,
      this.guestDesc,
      this.streakPlate,
      this.flame,
      this.streakTitle,
      this.shieldIcon,
      this.shieldText,
      this.todayGlow,
      this.days,
      ...this.dayValue,
      ...this.dayLabel,
      this.claimedNote,
      this.missionsPlate,
      this.missionsTitle,
      this.missionsNote,
      ...this.rows.flatMap((r) => [r.chip, r.tier, r.text, r.bar, r.count, r.reward, r.reroll]),
    ]);
    this.root = scene.add.container(0, 0, [this.content]).setVisible(false);
    progress.onChange(() => {
      if (this.root.visible) this.refresh();
    });
  }

  layout(w: number, h: number, top: number) {
    const W = Math.min(w - 32, 380);
    this.width = W;
    const left = -W / 2;
    const pad = 18;
    const inner = W - pad * 2;
    this.bar.layout(W);

    // --- Daily Run card
    let y = 50;
    this.runCaption.setPosition(left + pad, y + 16);
    this.runReset.setPosition(-left - pad, y + 40);
    this.modName.setPosition(left + pad, y + 34);
    this.modBlurb.setPosition(left + pad, y + 76);
    this.runBest.setPosition(left + pad, y + 156);
    const gy = y + GUEST_Y;
    this.guestFace.setPosition(left + pad + 24, gy + GUEST_H / 2);
    this.guestCaption.setPosition(left + pad + 56, gy + 7);
    this.guestName.setPosition(left + pad + 56, gy + 21);
    this.guestPower.setY(gy + 23);
    this.guestDesc.setPosition(left + pad + 56, gy + 42);
    this.runY = y;

    // --- Streak card
    y += RUN_H + GAP;
    this.streakY = y;
    this.streakTitle.setPosition(left + 54, y + 28);
    this.shieldText.setPosition(-left - pad, y + 28);
    const step = inner / 7;
    for (let i = 0; i < 7; i++) {
      const x = left + pad + step * (i + 0.5);
      this.dayValue[i].setPosition(x, y + 74);
      this.dayLabel[i].setPosition(x, y + 98);
    }
    this.claimedNote.setPosition(0, y + STREAK_H - 32);

    // --- Missions card
    y += STREAK_H + GAP;
    this.missionsY = y;
    this.missionsTitle.setPosition(left + pad, y + 16);
    this.missionsNote.setPosition(-left - pad, y + 19);
    this.rows.forEach((r, i) => {
      const ry = y + 44 + i * MISSION_ROW;
      r.tier.setPosition(left + pad + 32, ry + 9);
      r.text.setPosition(left + pad, ry + 21);
      r.count.setPosition(-left - pad - 46, ry + 50);
      r.reward.setPosition(-left - pad, ry + 9);
      r.reroll.setPosition(-left - pad - 12, ry + 47);
    });

    const contentH = y + MISSIONS_H;
    const avail = h - top - 12;
    const scale = Math.min(1, avail / contentH);
    this.content.setScale(scale);
    this.content.setPosition(w / 2, top + Math.max(0, (avail - contentH * scale) / 2) * 0.3);
    this.refresh();
  }

  private runY = 50;
  private streakY = 0;
  private missionsY = 0;

  /** Pills are drawn at build time, so a new width or colour means a new button. */
  private ensureButtons(playColor: number) {
    const inner = this.width - 36;
    const pk = `${inner}:${playColor}`;
    if (pk !== this.playKey) {
      this.playKey = pk;
      this.play?.destroy();
      this.play = makeButton(this.scene, { label: 'PLAY DAILY RUN', width: inner, height: 48, color: playColor, onPress: this.handlers.play });
      this.content.add(this.play);
    }
    this.play.setPosition(0, this.runY + RUN_H - 40);
    const ck = `${inner}`;
    if (ck !== this.claimKey) {
      this.claimKey = ck;
      this.claim?.destroy();
      this.claim = makeButton(this.scene, { label: 'CLAIM', width: inner, height: 44, color: GOLD, onPress: () => this.onClaim() });
      this.content.add(this.claim);
    }
    this.claim.setPosition(0, this.streakY + STREAK_H - 32);
  }

  /** Redraw everything from progress. Cheap enough to call on every change. */
  refresh() {
    progress.checkDay();
    this.bar.refresh();
    this.drawRun();
    this.drawStreak();
    this.drawMissions();
    this.tickClock(true);
  }

  private drawRun() {
    const W = this.width;
    const left = -W / 2;
    const pad = 18;
    const y = this.runY;
    const run = progress.daily.run();
    const mod = run.modifier;
    const g = this.runPlate.clear();
    drawPlate(g, left, y, W, RUN_H, mod.color, 0.55);
    // A wash of the modifier colour behind the name.
    g.fillStyle(mod.color, 0.07).fillRoundedRect(left + 1, y + 1, W - 2, 106, { tl: 22, tr: 22, bl: 0, br: 0 });

    setIfChanged(this.runCaption, `DAILY RUN · ${prettyDate(run.key)}`);
    setIfChanged(this.modName, mod.name);
    this.modName.setColor(hexColor(mod.color));
    setIfChanged(this.modBlurb, mod.blurb);
    setIfChanged(
      this.runBest,
      run.attempts > 0 ? `TODAY'S BEST ${run.best.toFixed(1)} M  ·  ${run.attempts} ${run.attempts === 1 ? 'RUN' : 'RUNS'}` : 'SAME TRACK FOR EVERYONE TODAY',
    );

    // Milestone track: 0 .. 1000 m with a node at each milestone.
    const x0 = left + pad;
    const x1 = -left - pad - 24;
    const ty = y + 120;
    const max = run.milestones[run.milestones.length - 1].m;
    const xAt = (m: number) => x0 + (x1 - x0) * Math.min(1, m / max);
    const tg = this.track.clear();
    tg.fillStyle(LINE, 1).fillRoundedRect(x0, ty - 3, x1 - x0, 6, 3);
    if (run.best > 0) tg.fillStyle(mod.color, 0.9).fillRoundedRect(x0, ty - 3, Math.max(6, xAt(run.best) - x0), 6, 3);
    run.milestones.forEach((ms, i) => {
      const x = xAt(ms.m);
      if (ms.paid) {
        tg.fillStyle(GOLD, 1).fillCircle(x, ty, 11);
        drawGlyph(tg, 'check', x, ty, 6, 0x1c1404);
      } else {
        tg.fillStyle(PLATE, 1).fillCircle(x, ty, 11);
        tg.lineStyle(2, run.best >= ms.m ? GOLD : 0x3a4756, 1).strokeCircle(x, ty, 11);
      }
      this.msTop[i].setPosition(x, ty - 15);
      setIfChanged(this.msTop[i], `+${ms.ducks}`);
      this.msTop[i].setAlpha(ms.paid ? 0.55 : 1);
      this.msBottom[i].setPosition(x, ty + 15);
      setIfChanged(this.msBottom[i], `${ms.m} M`);
    });

    this.drawGuest();
    this.ensureButtons(mod.color);
  }

  /** TODAY'S GUEST: the skin (and power) the Daily Run is played with today. */
  private drawGuest() {
    const W = this.width;
    const left = -W / 2;
    const pad = 18;
    const gy = this.runY + GUEST_Y;
    const skin = todaysGuest();
    const rarity = RARITIES[skin.rarity];
    const g = this.guestPlate.clear();
    g.fillStyle(skin.glow, 0.07).fillRoundedRect(left + pad - 6, gy, W - pad * 2 + 12, GUEST_H, 14);
    g.lineStyle(1, skin.glow, 0.45).strokeRoundedRect(left + pad - 6, gy, W - pad * 2 + 12, GUEST_H, 14);
    this.guestFace.setTexture(skinTexture(skin.id));
    const owned = save.skins.has(skin.id);
    setIfChanged(this.guestCaption, `TODAY'S GUEST · ${rarity.label}${owned ? ' · YOURS' : ''}`);
    this.guestCaption.setColor(rarity.css);
    setIfChanged(this.guestName, skin.name);
    const ab = abilityFor(skin.id);
    setIfChanged(this.guestPower, ab.name);
    this.guestPower.setColor(hexColor(skin.glow)).setX(this.guestName.x + this.guestName.width + 10);
    // Two lines at most: a longer description shrinks a little to fit.
    setIfChanged(this.guestDesc, ab.desc);
    const room = W - pad * 2 - 56;
    for (const k of [1, 0.9, 0.8]) {
      this.guestDesc.setScale(k).setWordWrapWidth(room / k);
      if (this.guestDesc.getWrappedText().length <= 2) break;
    }
  }

  private drawStreak() {
    const W = this.width;
    const left = -W / 2;
    const pad = 18;
    const y = this.streakY;
    const st = progress.daily.streak();
    const g = this.streakPlate.clear();
    drawPlate(g, left, y, W, STREAK_H, st.canClaim ? GOLD : LINE, st.canClaim ? 0.5 : 1);

    const lit = st.count > 0 || st.canClaim;
    this.flame.clear();
    drawGlyph(this.flame, 'flame', 0, 0, 14, lit ? 0xff9a2e : DIM);
    this.flame.setPosition(left + pad + 14, y + 28);
    setIfChanged(this.streakTitle, st.count > 0 ? `${st.count} DAY STREAK` : 'START A STREAK');
    this.streakTitle.setColor(st.count > 0 ? css.ink : BODY);

    const sg = this.shieldIcon.clear();
    const shieldLabel = st.shieldAtRisk ? 'SHIELD ON' : st.shield > 0 ? 'SHIELD' : 'NO SHIELD';
    setIfChanged(this.shieldText, shieldLabel);
    this.shieldText.setColor(st.shield > 0 ? GOLD_CSS : CAPTION);
    drawGlyph(sg, 'shield', this.shieldText.x - this.shieldText.width - 12, y + 28, 8, st.shield > 0 ? GOLD : DIM);

    const inner = W - pad * 2;
    const step = inner / 7;
    const dg = this.days.clear();
    const glow = this.todayGlow.clear();
    st.track.forEach((d, i) => {
      const x = left + pad + step * (i + 0.5);
      const cy = y + 74;
      const r = Math.min(19, step / 2 - 3);
      const value = this.dayValue[i];
      setIfChanged(value, d.spins ? 'SPIN' : String(d.ducks));
      value.setFontSize(d.spins ? 11 : 13);
      if (d.state === 'claimed') {
        dg.fillStyle(GOLD, 1).fillCircle(x, cy, r);
        value.setColor('#1c1404');
      } else if (d.state === 'today') {
        glow.fillStyle(GOLD, 0.16).fillCircle(x, cy, r + 7);
        glow.fillStyle(GOLD, 0.1).fillCircle(x, cy, r + 12);
        dg.fillStyle(0x1c1404, 1).fillCircle(x, cy, r);
        dg.lineStyle(2, GOLD, 1).strokeCircle(x, cy, r);
        value.setColor(GOLD_CSS);
      } else {
        dg.fillStyle(0x111a26, 1).fillCircle(x, cy, r);
        dg.lineStyle(1.5, d.spins ? palette.magenta : 0x2a3644, 1).strokeCircle(x, cy, r);
        value.setColor(d.spins ? css.magenta : CAPTION);
      }
      // Join the claimed days with a gold line.
      if (i > 0 && d.state !== 'future' && st.track[i - 1].state === 'claimed') {
        dg.fillStyle(GOLD, d.state === 'claimed' ? 0.8 : 0.35).fillRect(x - step + r, cy - 1.5, step - r * 2, 3);
      }
      this.dayLabel[i].setColor(d.state === 'today' ? GOLD_CSS : CAPTION);
    });

    this.claim.setVisible(st.canClaim);
    if (st.canClaim) this.claim.setLabel(st.reward.spins ? 'CLAIM FREE SPIN' : `CLAIM +${st.reward.ducks} DUCKS`);
    this.claimedNote.setVisible(!st.canClaim);
  }

  private drawMissions() {
    const W = this.width;
    const left = -W / 2;
    const pad = 18;
    const y = this.missionsY;
    const list = progress.missions.list();
    const done = list.filter((m) => m.done).length;
    const g = this.missionsPlate.clear();
    drawPlate(g, left, y, W, MISSIONS_H);
    setIfChanged(
      this.missionsNote,
      progress.missions.bonusPaid ? 'ALL DONE · BONUS PAID' : `${done} / 3 DONE · ALL 3: +${ALL_DONE_BONUS}`,
    );
    const canReroll = progress.missions.rerollsLeft > 0;
    this.rows.forEach((r, i) => {
      const m = list[i];
      const ry = y + 44 + i * MISSION_ROW;
      const visible = !!m;
      [r.chip, r.tier, r.text, r.bar, r.count, r.reward, r.reroll].forEach((o) => o.setVisible(visible));
      if (!m) return;
      const color = TIER_COLOR[m.tier];
      if (i > 0) g.fillStyle(LINE, 1).fillRect(left + pad, ry - 6, W - pad * 2, 1);

      const cg = r.chip.clear();
      cg.fillStyle(color, 0.14).fillRoundedRect(left + pad, ry, 64, 18, 9);
      cg.lineStyle(1, color, 0.8).strokeRoundedRect(left + pad, ry, 64, 18, 9);
      setIfChanged(r.tier, m.tier === 'medium' ? 'MEDIUM' : m.tier.toUpperCase());
      r.tier.setColor(hexColor(color));

      setIfChanged(r.text, m.text);
      r.text.setColor(m.done ? CAPTION : css.ink);
      // Never run into the reroll button / the edge.
      r.text.setScale(Math.min(1, (W - pad * 2 - 40) / Math.max(1, r.text.width)));
      setIfChanged(r.reward, m.done ? 'DONE' : `+${m.reward}`);
      r.reward.setColor(m.done ? CAPTION : GOLD_CSS);

      const showReroll = !m.done && canReroll;
      r.reroll.setVisible(showReroll);
      r.count.setX(-left - pad - (showReroll ? 34 : 0));
      setIfChanged(r.count, `${fmt(m.progress)} / ${fmt(m.goal)}`);
      const barRight = r.count.x - r.count.width - 10;
      const bx = left + pad;
      const bw = barRight - bx;
      const k = m.goal > 0 ? m.progress / m.goal : 0;
      const bg = r.bar.clear();
      bg.fillStyle(LINE, 1).fillRoundedRect(bx, ry + 47, bw, 6, 3);
      if (k > 0) bg.fillStyle(m.done ? GOLD : color, 1).fillRoundedRect(bx, ry + 47, Math.max(6, bw * k), 6, 3);
      if (m.done) drawGlyph(bg, 'check', -left - pad - 70, ry + 9, 6, GOLD);

      const rg = r.rerollIcon.clear();
      rg.fillStyle(0x111a26, 1).fillCircle(0, 0, 14);
      rg.lineStyle(1, 0x2a3644, 1).strokeCircle(0, 0, 14);
      drawGlyph(rg, 'reroll', -1, 0, 8, palette.cyan);
    });
  }

  private onClaim() {
    const r = progress.claimStreak();
    if (!r) {
      sfx.denied();
      return;
    }
    sfx.newBest();
    // A little pop on the node that was just claimed.
    const node = this.dayValue[r.day - 1];
    this.scene.tweens.add({ targets: node, scale: { from: 1.6, to: 1 }, duration: 380, ease: 'Back.easeOut' });
    this.refresh();
  }

  private onReroll(slot: number) {
    sfx.unlock();
    if (!progress.rerollMission(slot)) {
      sfx.denied();
      return;
    }
    sfx.click();
    const row = this.rows[slot];
    row.text.setAlpha(0);
    this.scene.tweens.add({ targets: row.text, alpha: 1, duration: 260 });
  }

  /** Countdown texts: at most once a second. */
  private tickClock(force = false) {
    const now = this.scene.time.now;
    if (!force && now < this.nextTick) return;
    this.nextTick = now + 1000;
    const left = formatCountdown(progress.daily.run().msToReset);
    setIfChanged(this.runReset, `NEW TRACK IN\n${left}`);
    setIfChanged(this.claimedNote, `CLAIMED · NEXT REWARD IN ${left}`);
    if (!force && progress.checkDay()) this.refresh();
  }

  update(time: number) {
    if (!this.root.visible) return;
    this.tickClock();
    const k = 0.5 + 0.5 * Math.sin(time / 260);
    this.todayGlow.setAlpha(0.5 + 0.5 * k);
    this.flame.setScale(1 + 0.05 * Math.sin(time / 120), 1 + 0.08 * Math.sin(time / 90));
  }
}

const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}K` : String(Math.floor(n)));
