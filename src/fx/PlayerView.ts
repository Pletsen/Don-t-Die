import Phaser from 'phaser';
import { palette, hueColor } from '../game/palette';
import { save } from '../game/storage';
import { TEX } from './textures';

/**
 * The player's look: a glossy orb with a halo, a tilted orbiting ring and a
 * particle trail. The game logic only moves `x`/`y` and calls `onTurn()`.
 */
export class PlayerView {
  readonly root: Phaser.GameObjects.Container;
  private body: Phaser.GameObjects.Container;
  private halo: Phaser.GameObjects.Image;
  private ring: Phaser.GameObjects.Image;
  private trail: Phaser.GameObjects.Particles.ParticleEmitter;
  private sparks: Phaser.GameObjects.Particles.ParticleEmitter;
  private squash = 1;
  private wasRainbow = false;

  constructor(scene: Phaser.Scene, radius: number) {
    // Trail first so it renders under the orb.
    this.trail = scene.add
      .particles(0, 0, TEX.glow, {
        lifespan: 420,
        frequency: 8,
        scale: { start: (radius * 2.2) / 128, end: 0 },
        alpha: { start: 0.6, end: 0 },
        tint: palette.cyan,
        blendMode: Phaser.BlendModes.ADD,
      })
      .setDepth(5);

    this.sparks = scene.add
      .particles(0, 0, TEX.spark, {
        lifespan: { min: 300, max: 700 },
        frequency: 45,
        speed: { min: 10, max: 45 },
        scale: { start: 0.35, end: 0 },
        alpha: { start: 0.9, end: 0 },
        tint: [0xffffff, palette.cyan, 0x9ff6ff],
        blendMode: Phaser.BlendModes.ADD,
      })
      .setDepth(5);

    this.halo = scene.add
      .image(0, 0, TEX.glow)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(palette.cyan)
      .setScale((radius * 5.4) / 128)
      .setAlpha(0.75);

    this.ring = scene.add
      .image(0, 0, TEX.ring)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(palette.cyan)
      .setAlpha(0.7);

    const orb = scene.add.image(0, 0, TEX.orb).setScale((radius * 2.1) / 96);
    this.body = scene.add.container(0, 0, [orb]);

    this.root = scene.add.container(0, 0, [this.halo, this.ring, this.body]).setDepth(6);
    this.trail.startFollow(this.root);
    this.sparks.startFollow(this.root);
  }

  setPosition(x: number, y: number) {
    this.root.setPosition(x, y);
  }

  /** A quick squash, as if the orb pushes off the new direction. */
  onTurn() {
    this.squash = 0.62;
  }

  update(time: number, dt: number, heading: number, speedNorm: number, radius: number) {
    this.squash += (1 - this.squash) * Math.min(1, dt * 16);
    this.body.setRotation(heading).setScale(2 - this.squash, this.squash);

    const pulse = 0.5 + 0.5 * Math.sin(time * 5);
    this.halo.setAlpha(0.6 + pulse * 0.2 + speedNorm * 0.15);

    // Rotating a squashed image turns a circle into a tumbling orbit.
    const ringR = radius * 2.2 * (1 + 0.04 * Math.sin(time * 3));
    this.ring.setRotation(time * 0.9).setScale(ringR / 116, (ringR / 116) * 0.4);

    this.trail.frequency = speedNorm > 0.5 ? 5 : 8;

    // Easter egg: a trail that cycles through the rainbow.
    if (save.rainbow) this.trail.setParticleTint(hueColor(time * 240));
    else if (this.wasRainbow) this.trail.setParticleTint(palette.cyan);
    this.wasRainbow = save.rainbow;
  }

  setEmitting(on: boolean) {
    this.trail.emitting = on;
    this.sparks.emitting = on;
  }

  setVisible(v: boolean) {
    this.root.setVisible(v);
  }

  fadeOut(scene: Phaser.Scene) {
    this.setEmitting(false);
    scene.tweens.add({ targets: this.root, alpha: 0, scale: 1.8, duration: 180, ease: 'Quad.easeOut' });
  }

  reset() {
    this.root.setAlpha(1).setScale(1).setVisible(true);
    this.squash = 1;
    this.trail.killAll();
    this.sparks.killAll();
  }
}
