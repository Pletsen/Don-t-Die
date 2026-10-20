import { WORLDS, lastOfSet, levelById, levelName } from '../game/levels';
import type { ClearData } from '../game/shared';
import { css } from '../game/palette';
import { save } from '../game/storage';
import { sfx } from '../audio/Sfx';
import Phaser from 'phaser';
import { drawStar, hexColor, makeButton, makeText, type Button } from './widgets';
import { TEX, DUCK_RES } from '../fx/textures';

const STAR_R = 24;
const STAR_GAP = 64;

/** "LEVEL CLEAR" screen: stars pop in one by one, then next / retry / levels / menu. */
export class ClearScreen {
  readonly root: Phaser.GameObjects.Container;
  private label: Phaser.GameObjects.Text;
  private title: Phaser.GameObjects.Text;
  private starSlots: Phaser.GameObjects.Graphics;
  private starFills: Phaser.GameObjects.Graphics[] = [];
  private stats: Phaser.GameObjects.Text;
  private hint: Phaser.GameObjects.Text;
  private ducksLine: Phaser.GameObjects.Text;
  private rewards: Phaser.GameObjects.Text;
  private next: Button;
  private retry: Button;
  private levels: Button;
  private menu: Button;
  private plate: Phaser.GameObjects.Graphics;
  private sparks: Phaser.GameObjects.Particles.ParticleEmitter;
  private ringPool: Phaser.GameObjects.Image[] = [];
  private duckPool: Phaser.GameObjects.Image[] = [];
  private color = 0x2be8ff;
  private box = { x: 0, y: 0, w: 0, h: 0 };

  constructor(
    private scene: Phaser.Scene,
    handlers: { next: () => void; retry: () => void; levels: () => void; menu: () => void },
  ) {
    this.label = makeText(scene, 0, 0, '', { font: 'mono', size: 12, spacing: 3 }).setOrigin(0.5);
    this.title = makeText(scene, 0, 0, 'CLEAR', { size: 68, glow: true }).setOrigin(0.5);
    this.plate = scene.add.graphics();
    this.starSlots = scene.add.graphics();
    for (let i = 0; i < 3; i++) {
      // Gold stars with a pale inner star: earned stars should feel like treasure.
      const g = scene.add.graphics();
      drawStar(g, 0, 0, STAR_R + 3, 0xb37400, true);
      drawStar(g, 0, 0, STAR_R, 0xffd21f, true);
      drawStar(g, 0, -1.5, STAR_R * 0.55, 0xfff3a0, true);
      this.starFills.push(g);
    }
    this.sparks = scene.add
      .particles(0, 0, TEX.spark, {
        emitting: false,
        speed: { min: 80, max: 260 },
        lifespan: { min: 300, max: 700 },
        scale: { start: 0.5, end: 0 },
        alpha: { start: 1, end: 0 },
        tint: [0xffd21f, 0xfff3a0, 0xffffff],
        blendMode: Phaser.BlendModes.ADD,
      })
      .setDepth(60);
    this.stats = makeText(scene, 0, 0, '', { font: 'mono', size: 13, color: css.inkDim, spacing: 1.5 }).setOrigin(0.5);
    this.hint = makeText(scene, 0, 0, '', { size: 13, color: css.inkDim, spacing: 1.2 }).setOrigin(0.5);
    this.rewards = makeText(scene, 0, 0, '', { font: 'mono', size: 11, weight: '700', color: '#ffd21f', spacing: 1 }).setOrigin(0.5);
    this.ducksLine = makeText(scene, 0, 0, '', { font: 'mono', size: 13, weight: '700', color: '#ffd21f', spacing: 1.2 }).setOrigin(0.5);
    this.next = makeButton(scene, { label: 'NEXT LEVEL', icon: 'play', width: 280, height: 56, onPress: handlers.next });
    this.retry = makeButton(scene, { label: 'RETRY', icon: 'retry', width: 92, style: 'ghost', onPress: handlers.retry });
    this.levels = makeButton(scene, { label: 'LEVELS', icon: 'levels', width: 92, style: 'ghost', onPress: handlers.levels });
    this.menu = makeButton(scene, { label: 'MENU', icon: 'home', width: 92, style: 'ghost', onPress: handlers.menu });

    this.root = scene.add.container(0, 0, [
      this.plate,
      this.label,
      this.title,
      this.starSlots,
      ...this.starFills,
      this.stats,
      this.hint,
      this.ducksLine,
      this.rewards,
      this.next,
      this.retry,
      this.levels,
      this.menu,
    ]);
    this.root.setVisible(false);
  }

  layout(w: number, h: number) {
    const cx = w / 2;
    const oy = h * 0.34;
    const pw = Math.min(w - 24, 340);
    this.box = { x: cx - pw / 2, y: oy - 92, w: pw, h: 436 };
    this.drawPlate();
    this.label.setPosition(cx, oy - 58);
    this.title.setPosition(cx, oy);
    this.starSlots.setPosition(cx, oy + 74);
    this.starFills.forEach((g, i) => g.setPosition(cx + (i - 1) * STAR_GAP, oy + 74));
    this.stats.setPosition(cx, oy + 124);
    this.hint.setPosition(cx, oy + 148);
    this.ducksLine.setPosition(cx, oy + 172);
    this.rewards.setPosition(cx, oy + 194);
    this.next.setPosition(cx, oy + 244);
    this.retry.setPosition(cx - 98, oy + 306);
    this.levels.setPosition(cx, oy + 306);
    this.menu.setPosition(cx + 98, oy + 306);
  }

  /** Bottom edge of the card, for things that sit below it. */
  get bottom() {
    return this.box.y + this.box.h;
  }

  private drawPlate() {
    const b = this.box;
    this.plate.clear();
    this.plate.fillStyle(0x0a0f18, 0.92).fillRoundedRect(b.x, b.y, b.w, b.h, 24);
    this.plate.lineStyle(1.5, this.color, 0.55).strokeRoundedRect(b.x, b.y, b.w, b.h, 24);
  }

  /** A pooled ring that pops behind a star as it lands. */
  private ring(x: number, y: number) {
    const r = this.ringPool.pop() ?? this.scene.add.image(0, 0, TEX.ring).setBlendMode(Phaser.BlendModes.ADD).setDepth(59);
    r.setPosition(x, y).setTint(0xffd21f).setScale(0.1).setAlpha(1).setVisible(true);
    this.scene.tweens.add({
      targets: r,
      scale: 90 / 116,
      alpha: 0,
      duration: 420,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        r.setVisible(false);
        this.ringPool.push(r);
      },
    });
  }

  /**
   * Ducks fly from the middle of the screen into the duck counter, which
   * counts up as each one lands.
   */
  private flyDucks(earned: number, total: number, delay: number) {
    const n = Math.min(12, earned);
    const line = this.ducksLine;
    const start = total - earned;
    let shown = start;
    line.setText(`+${earned} DUCKS  ·  ${start} IN TOTAL`);
    const from = { x: line.x, y: this.title.y };
    for (let i = 0; i < n; i++) {
      this.scene.time.delayedCall(delay + i * 45, () => {
        const d = this.duckPool.pop() ?? this.scene.add.image(0, 0, TEX.duck).setDepth(61);
        d.setVisible(true).setAlpha(1).setScale(0.22 / DUCK_RES).setPosition(from.x + (Math.random() - 0.5) * 60, from.y);
        const cx = from.x + (Math.random() - 0.5) * 220;
        const cy = from.y - 60 - Math.random() * 60;
        const curve = new Phaser.Curves.QuadraticBezier(
          new Phaser.Math.Vector2(d.x, d.y),
          new Phaser.Math.Vector2(cx, cy),
          new Phaser.Math.Vector2(line.x + 60, line.y),
        );
        const p = { t: 0 };
        const v = new Phaser.Math.Vector2();
        this.scene.tweens.add({
          targets: p,
          t: 1,
          duration: 550,
          ease: 'Quad.easeIn',
          onUpdate: () => {
            curve.getPoint(p.t, v);
            d.setPosition(v.x, v.y).setAngle(p.t * 360);
          },
          onComplete: () => {
            d.setVisible(false);
            this.duckPool.push(d);
            shown = i === n - 1 ? total : Math.min(total, shown + Math.ceil(earned / n));
            line.setText(`+${earned} DUCKS  ·  ${shown} IN TOTAL`);
            line.setScale(1.15);
            this.scene.tweens.add({ targets: line, scale: 1, duration: 120 });
            sfx.coin(i);
          },
        });
      });
    }
  }

  show(d: ClearData, rewards = '') {
    this.rewards.setText(rewards).setAlpha(0);
    if (rewards) this.scene.tweens.add({ targets: this.rewards, alpha: 1, delay: 700 + d.stars * 300, duration: 300 });
    const level = levelById(d.level)!;
    const color = WORLDS[level.world].color;
    const last = d.level === lastOfSet(d.level);

    this.color = color;
    this.drawPlate();
    this.label.setText(`${levelName(d.level)} · ${WORLDS[level.world].name}`).setColor(hexColor(color));
    this.title.setText(last ? 'ALL CLEAR' : 'CLEAR').setShadow(0, 0, hexColor(color), 22, false, true);
    this.stats.setText(`PERFECT ${d.perfects}/${d.turns}  ·  ${d.seconds.toFixed(1)} SEC`);
    this.next.setLabel(last ? 'LEVELS' : 'NEXT LEVEL');

    // Ducks earned this run, and what you have in total now.
    this.ducksLine.setText('');
    if (d.ducks > 0) this.flyDucks(d.ducks, save.ducks, 500 + d.stars * 300);

    if (d.warped) this.hint.setText('WARP STAR FOUND').setColor(css.orange);
    else if (d.stars < 2) this.hint.setText('2 STARS: 60% OF TURNS PERFECT').setColor(css.inkDim);
    else if (d.stars < 3) this.hint.setText('3 STARS: 80% OF TURNS PERFECT').setColor(css.inkDim);
    else this.hint.setText(d.previousStars < 3 ? 'FLAWLESS' : '').setColor('#ffd21f');

    // FLAWLESS waits for the third star to land.
    this.hint.setAlpha(d.stars === 3 && d.previousStars < 3 ? 0 : 1);
    this.starSlots.clear();
    for (let i = 0; i < 3; i++) drawStar(this.starSlots, (i - 1) * STAR_GAP, 0, STAR_R, 0x2a3644, true);

    this.root.setVisible(true).setAlpha(0);
    this.scene.tweens.add({ targets: this.root, alpha: 1, duration: 250 });
    this.title.setScale(0.6);
    this.scene.tweens.add({ targets: this.title, scale: 1, duration: 450, ease: 'Back.easeOut' });

    this.starFills.forEach((g, i) => {
      g.setScale(0).setAlpha(1);
      if (i >= d.stars) return;
      this.scene.tweens.add({
        targets: g,
        scale: 1,
        delay: 350 + i * 300,
        duration: 380,
        ease: 'Back.easeOut',
        onStart: () => sfx.star(i),
        onComplete: () => {
          // Each star lands with a burst of gold and a ring.
          this.sparks.explode(14, g.x, g.y);
          this.ring(g.x, g.y);
          if (i === 2) {
            this.hint.setScale(1.6).setAlpha(0);
            this.scene.tweens.add({ targets: this.hint, scale: 1, alpha: 1, duration: 260, ease: 'Back.easeOut' });
          }
        },
      });
    });

    [this.next, this.retry, this.levels, this.menu].forEach((b, i) => {
      b.setAlpha(0);
      this.scene.tweens.add({ targets: b, alpha: 1, delay: 500 + d.stars * 300 + i * 60, duration: 250 });
    });
  }

  hide() {
    this.scene.tweens.add({ targets: this.root, alpha: 0, duration: 160, onComplete: () => this.root.setVisible(false) });
  }

  update(time: number) {
    if (!this.root.visible) return;
    this.starFills.forEach((g, i) => g.setAngle(Math.sin(time / 500 + i) * 4));
  }
}
