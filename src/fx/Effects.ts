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

  burst(x: number, y: number, color: number | number[], count: number) {
    this.sparks.setParticleTint(Array.isArray(color) ? color : [color, 0xffffff]);
    this.sparks.explode(count, x, y);
  }

  debris(x: number, y: number, color: number, count: number) {
    this.shards.setParticleTint([color, 0xffffff]);
    this.shards.explode(count, x, y);
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

  floater(x: number, y: number, text: string, color: string = css.cyan, size = 14) {
    const t = this.scene.add
      .text(x, y, text, {
        fontFamily: fonts.display,
        fontStyle: '700',
        fontSize: `${size}px`,
        color,
        resolution: display.dpr * 1.6,
        padding: { x: 16, y: 16 },
      })
      .setOrigin(0.5)
      .setDepth(8)
      .setScale(0.4);
    t.setShadow(0, 0, color, 12, false, true);
    this.scene.tweens.add({ targets: t, scale: 1, duration: 220, ease: 'Back.easeOut' });
    this.scene.tweens.add({
      targets: t,
      y: y - 34,
      alpha: 0,
      delay: 250,
      duration: 650,
      ease: 'Quad.easeIn',
      onComplete: () => t.destroy(),
    });
  }

  clear() {
    this.sparks.killAll();
    this.shards.killAll();
  }
}
