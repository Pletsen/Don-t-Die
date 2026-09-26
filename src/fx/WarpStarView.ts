import Phaser from 'phaser';
import type { WarpStar } from '../game/Track';
import { hueColor } from '../game/palette';
import { TEX } from './textures';
import { glowFx } from './glow';

/**
 * The hidden warp star: tiny, twinkling through the rainbow, with a few
 * sparkles drifting off it. Small on purpose: it's meant to be hard to hit.
 */
export class WarpStarView {
  private root: Phaser.GameObjects.Container;
  private star: Phaser.GameObjects.Image;
  private halo: Phaser.GameObjects.Image;
  private sparkles: Phaser.GameObjects.Particles.ParticleEmitter;
  private glow: Phaser.Filters.Glow | null;

  constructor(
    scene: Phaser.Scene,
    readonly data: WarpStar,
  ) {
    this.halo = scene.add.image(0, 0, TEX.glow).setBlendMode(Phaser.BlendModes.ADD).setScale(0.32);
    this.star = scene.add.image(0, 0, TEX.warpStar).setScale(0.26);
    this.glow = glowFx.add(this.star, 0xffffff, 3, 10);
    this.root = scene.add.container(data.x, data.y, [this.halo, this.star]).setDepth(5);
    this.sparkles = scene.add
      .particles(data.x, data.y, TEX.spark, {
        frequency: 90,
        lifespan: 700,
        speed: { min: 8, max: 30 },
        scale: { start: 0.25, end: 0 },
        alpha: { start: 1, end: 0 },
        blendMode: Phaser.BlendModes.ADD,
      })
      .setDepth(5);
  }

  update(time: number) {
    // The star can be pulled towards you (magnet abilities).
    this.root.setPosition(this.data.x, this.data.y);
    this.sparkles.setPosition(this.data.x, this.data.y);
    const tw = 0.5 + 0.5 * Math.sin(time * 9);
    const color = hueColor(time * 200);
    this.star.setRotation(time * 2).setScale(0.24 + tw * 0.06);
    this.halo.setTint(color).setAlpha(0.6 + tw * 0.4);
    this.sparkles.setParticleTint(color);
    if (this.glow) this.glow.color = color;
  }

  setVisible(v: boolean) {
    this.root.setVisible(v);
    this.sparkles.setVisible(v);
  }

  destroy() {
    this.root.destroy();
    this.sparkles.destroy();
  }
}
