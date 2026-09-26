import Phaser from 'phaser';
import { display } from '../game/display';
import { css, fonts } from '../game/palette';
import { TEX } from './textures';

/**
 * Change the colours a particle fades through over its life. The emitter
 * must have been created with a `color` array. (Assigning `particleColor`
 * only works for single colours, so the colour op is refilled directly.)
 */
export function setParticleColors(emitter: Phaser.GameObjects.Particles.ParticleEmitter, colors: number[]) {
  const op = emitter.ops.color;
  op.propertyValue = colors;
  op.setMethods();
}

/**
 * One-shot effects: particle bursts, shockwaves and floating text.
 * Emitters are created once and re-used, which is far cheaper than making
 * new ones for every explosion.
 */
export class Effects {
  private sparks: Phaser.GameObjects.Particles.ParticleEmitter;
  private shards: Phaser.GameObjects.Particles.ParticleEmitter;
  private drift: Phaser.GameObjects.Particles.ParticleEmitter;
  private embers: Phaser.GameObjects.Particles.ParticleEmitter;
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

    // Slow, glowing embers that hang in the air after an explosion and sink.
    // `color` fades each one from white-hot through its colour to nothing.
    this.embers = scene.add
      .particles(0, 0, TEX.glow, {
        emitting: false,
        speed: { min: 20, max: 150 },
        lifespan: { min: 900, max: 1900 },
        gravityY: 60,
        scale: { start: 0.2, end: 0 },
        color: [0xffffff, 0xffffff],
        alpha: { start: 1, end: 0 },
        blendMode: Phaser.BlendModes.ADD,
      })
      .setDepth(7);
  }

  /**
   * The big one, for a crash: needle-sharp streaks fly out, a hot core
   * flashes, two shockwaves (hazard colour, then your colour) roll out and
   * embers drift down afterwards. Everything is additive light on the dark
   * background, so it reads as neon.
   */
  deathBlast(x: number, y: number, color: number, own: number, fxReduced: boolean) {
    const streaks = fxReduced ? 8 : 18;
    for (let i = 0; i < streaks; i++) {
      const a = (i / streaks) * Math.PI * 2 + Math.random() * 0.3;
      const len = 90 + Math.random() * 150;
      const s = this.scene.add
        .image(x, y, TEX.streak)
        .setTint(i % 3 === 0 ? 0xffffff : i % 2 ? color : own)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setRotation(a)
        .setScale(0.8 + Math.random() * 0.5, 0.6)
        .setDepth(7);
      const duration = 380 + Math.random() * 260;
      // Shoot out fast and slow down; fade late, so they stay bright in flight.
      this.scene.tweens.add({
        targets: s,
        x: x + Math.cos(a) * len,
        y: y + Math.sin(a) * len,
        scaleX: 0.15,
        duration,
        ease: 'Cubic.easeOut',
        onComplete: () => s.destroy(),
      });
      this.scene.tweens.add({ targets: s, alpha: 0, duration, ease: 'Quad.easeIn' });
    }
    this.burst(x, y, [color, own, 0xffffff], fxReduced ? 16 : 46);
    setParticleColors(this.embers, [0xffffff, own, color]);
    this.embers.explode(fxReduced ? 8 : 26, x, y);
    this.flare(x, y, 0xffffff, 110);
    this.flare(x, y, color, 170);
    this.shockwave(x, y, color, 230, 650);
    this.scene.time.delayedCall(90, () => this.shockwave(x, y, own, 150, 520));
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
    this.embers.killAll();
  }
}
