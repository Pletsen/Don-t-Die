import Phaser from 'phaser';
import { display } from '../game/display';
import { css, fonts } from '../game/palette';
import { TEX } from './textures';

/**
 * One-shot effects: particle bursts, shockwaves and floating text.
 * Emitters are created once and re-used, which is far cheaper than making
 * new ones for every explosion.
 */
export class Effects {
  private sparks: Phaser.GameObjects.Particles.ParticleEmitter;
  private shards: Phaser.GameObjects.Particles.ParticleEmitter;
  private drift: Phaser.GameObjects.Particles.ParticleEmitter;
  private floaters: Phaser.GameObjects.Text[] = [];

  constructor(private scene: Phaser.Scene) {
    this.sparks = scene.add
      .particles(0, 0, TEX.spark, {
        emitting: false,
        speed: { min: 60, max: 360 },
        lifespan: { min: 280, max: 800 },
        scale: { start: 0.6, end: 0 },
        alpha: { start: 1, end: 0 },
        blendMode: Phaser.BlendModes.ADD,
      })
      .setDepth(7);

    this.drift = scene.add
      .particles(0, 0, TEX.spark, {
        emitting: false,
        speed: { min: 140, max: 340 },
        lifespan: { min: 180, max: 420 },
        scale: { start: 0.42, end: 0 },
        alpha: { start: 1, end: 0 },
        blendMode: Phaser.BlendModes.ADD,
      })
      .setDepth(7);

    this.shards = scene.add
      .particles(0, 0, TEX.shard, {
        emitting: false,
        speed: { min: 120, max: 520 },
        lifespan: { min: 500, max: 1100 },
        scale: { start: 0.55, end: 0 },
        alpha: { start: 1, end: 0 },
        rotate: { min: 0, max: 360 },
        blendMode: Phaser.BlendModes.ADD,
      })
      .setDepth(7);
  }

  /**
   * Turn effect: sparks spray out along the old heading (like a drift), a
   * ghost of the orb stays behind at the corner, and a small ring pops.
   */
  turn(x: number, y: number, oldHeading: number, color: number, fxReduced: boolean) {
    const deg = Phaser.Math.RadToDeg(oldHeading);
    this.drift.setEmitterAngle({ min: deg - 28, max: deg + 28 });
    this.drift.setParticleTint([color, 0xffffff]);
    this.drift.explode(fxReduced ? 5 : 14, x, y);

    const ghost = this.scene.add
      .image(x, y, TEX.orb)
      .setScale(0.26)
      .setAlpha(0.55)
      .setTint(color)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(5);
    this.scene.tweens.add({
      targets: ghost,
      scale: 0.6,
      alpha: 0,
      duration: 380,
      ease: 'Quad.easeOut',
      onComplete: () => ghost.destroy(),
    });
    this.shockwave(x, y, color, 46, 280);
  }

  burst(x: number, y: number, color: number | number[], count: number) {
    this.sparks.setParticleTint(Array.isArray(color) ? color : [color, 0xffffff]);
    this.sparks.explode(count, x, y);
  }

  debris(x: number, y: number, color: number, count: number) {
    this.shards.setParticleTint([color, 0xffffff]);
    this.shards.explode(count, x, y);
  }

  /** A ring shrinking inwards: things being sucked in. */
  implode(x: number, y: number, color: number, size = 200, duration = 350) {
    const ring = this.scene.add
      .image(x, y, TEX.ring)
      .setTint(color)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale(size / 116)
      .setAlpha(0)
      .setDepth(7);
    this.scene.tweens.add({
      targets: ring,
      scale: 0.05,
      alpha: { from: 0.8, to: 0.2 },
      duration,
      ease: 'Cubic.easeIn',
      onComplete: () => ring.destroy(),
    });
  }

  /** A laser shot from a to b that fades out quickly. */
  laser(x1: number, y1: number, x2: number, y2: number, color: number) {
    const g = this.scene.add.graphics().setDepth(7).setBlendMode(Phaser.BlendModes.ADD);
    g.lineStyle(7, color, 0.35).lineBetween(x1, y1, x2, y2);
    g.lineStyle(2.5, 0xffffff, 1).lineBetween(x1, y1, x2, y2);
    this.scene.tweens.add({ targets: g, alpha: 0, duration: 220, onComplete: () => g.destroy() });
    this.flare(x2, y2, color, 50);
  }

  shockwave(x: number, y: number, color: number, size = 120, duration = 450) {
    const ring = this.scene.add
      .image(x, y, TEX.ring)
      .setTint(color)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale(0.05)
      .setDepth(7);
    this.scene.tweens.add({
      targets: ring,
      scale: size / 116,
      alpha: 0,
      duration,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });
  }

  flare(x: number, y: number, color: number, size = 90) {
    const glow = this.scene.add
      .image(x, y, TEX.glow)
      .setTint(color)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale(size / 128)
      .setDepth(7);
    this.scene.tweens.add({
      targets: glow,
      scale: (size * 2.2) / 128,
      alpha: 0,
      duration: 380,
      ease: 'Quad.easeOut',
      onComplete: () => glow.destroy(),
    });
  }

  /**
   * Floating text ("PERFECT", "CLOSE", ...). Rendering text is slow, so text
   * objects are pooled and re-used; one that already shows the same words
   * doesn't need to be re-rendered at all.
   */
  floater(x: number, y: number, text: string, color: string = css.cyan, size = 14) {
    const key = `${text}|${color}|${size}`;
    let t = this.floaters.find((f) => !f.active && f.getData('key') === key);
    if (!t) t = this.floaters.find((f) => !f.active);
    if (!t) {
      t = this.scene.add
        .text(0, 0, '', {
          fontFamily: fonts.display,
          fontStyle: '700',
          resolution: display.dpr * 1.25,
          padding: { x: 16, y: 16 },
        })
        .setOrigin(0.5)
        .setDepth(8);
      this.floaters.push(t);
    }
    if (t.getData('key') !== key) {
      t.setText(text).setFontSize(size).setColor(color).setShadow(0, 0, color, 12, false, true);
      t.setData('key', key);
    }
    t.setActive(true).setVisible(true).setPosition(x, y).setAlpha(1).setScale(0.4);
    this.scene.tweens.add({ targets: t, scale: 1, duration: 220, ease: 'Back.easeOut' });
    this.scene.tweens.add({
      targets: t,
      y: y - 34,
      alpha: 0,
      delay: 250,
      duration: 650,
      ease: 'Quad.easeIn',
      onComplete: () => t.setActive(false).setVisible(false),
    });
  }

  clear() {
    this.sparks.killAll();
    this.shards.killAll();
  }
}
