import Phaser from 'phaser';
import type { Hazard } from '../game/Track';
import { palette } from '../game/palette';
import { TEX } from './textures';

/** Visuals for one saw blade, bomb or rubber duck. Follows its `Hazard` data every frame. */
export class HazardView {
  private root: Phaser.GameObjects.Container;
  private body: Phaser.GameObjects.Image;
  private halo: Phaser.GameObjects.Image;
  private warn: Phaser.GameObjects.Image;
  private fuse?: Phaser.GameObjects.Image;
  private color: number;
  private frozen = false;

  constructor(
    private scene: Phaser.Scene,
    readonly hazard: Hazard,
  ) {
    const isSaw = hazard.kind === 'saw';
    const isDuck = hazard.kind === 'duck';
    this.color = isSaw ? palette.magenta : isDuck ? 0xffd21f : palette.orange;
    const d = hazard.radius * 2;

    this.warn = scene.add.image(0, 0, TEX.ring).setTint(this.color).setBlendMode(Phaser.BlendModes.ADD);
    this.halo = scene.add
      .image(0, 0, TEX.glow)
      .setTint(this.color)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale((d * 2.6) / 128);
    this.body = isDuck
      ? scene.add.image(0, 0, TEX.duck).setScale((d * 1.5) / 96).setFlipX(Math.random() < 0.5)
      : scene.add.image(0, 0, isSaw ? TEX.saw : TEX.bomb).setScale((d * (isSaw ? 1.05 : 1.1)) / 128);
    if (isDuck) {
      this.warn.setVisible(false);
      this.halo.setAlpha(0.35);
    }

    const parts: Phaser.GameObjects.GameObject[] = [this.warn, this.halo, this.body];
    if (hazard.kind === 'bomb') {
      this.fuse = scene.add
        .image(0, 0, TEX.glow)
        .setTint(0xfff1b0)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setScale(0.14);
      parts.push(this.fuse);
    }

    this.root = scene.add.container(hazard.x, hazard.y, parts).setDepth(4);

    // Pop in instead of appearing out of nowhere.
    this.root.setScale(0);
    scene.tweens.add({ targets: this.root, scale: 1, duration: 380, ease: 'Back.easeOut' });
  }

  update(time: number, dt: number) {
    const h = this.hazard;
    this.root.setPosition(h.x, h.y);
    const r = h.radius;

    // Warning ring breathes outward.
    const k = (time * 1.2 + h.movePhase) % 1;
    this.warn.setScale((r * (1.4 + k * 1.1)) / 116).setAlpha((1 - k) * 0.5);

    if (this.frozen) {
      // Frozen solid: no spinning, no pulsing.
    } else if (h.kind === 'duck') {
      // Bob on invisible water.
      this.body.setY(Math.sin(time * 4 + h.movePhase) * 2).setRotation(Math.sin(time * 3 + h.movePhase) * 0.15);
    } else if (h.kind === 'saw') {
      this.body.rotation += dt * 9;
      this.halo.setAlpha(0.55 + 0.15 * Math.sin(time * 12));
    } else {
      const beat = Math.pow(Math.max(0, Math.sin(time * 7 + h.movePhase)), 6);
      this.body.setScale(((r * 2.2) / 128) * (1 + beat * 0.12));
      this.halo.setAlpha(0.45 + beat * 0.5);
      if (this.fuse) {
        const a = time * 14;
        this.fuse
          .setPosition(Math.cos(a) * r * 0.18, -r * 1.05 + Math.sin(a) * r * 0.18)
          .setAlpha(0.7 + 0.3 * Math.random());
      }
    }
  }

  setFrozen(on: boolean) {
    if (on === this.frozen) return;
    this.frozen = on;
    if (on) this.body.setTint(0xbfefff);
    else this.body.clearTint();
    this.halo.setTint(on ? 0x9fe8ff : this.color);
  }

  /** Duck got bonked: it spins off into space and is gone. */
  knockAway(dirX: number, dirY: number) {
    const side = Math.random() < 0.5 ? -1 : 1;
    this.scene.tweens.add({
      targets: this.root,
      x: this.root.x + dirX * 160 - dirY * side * 120,
      y: this.root.y + dirY * 160 + dirX * side * 120,
      angle: 720 * side,
      scale: 1.6,
      alpha: 0,
      duration: 700,
      ease: 'Cubic.easeOut',
      onComplete: () => this.destroy(),
    });
  }

  setVisible(v: boolean) {
    this.root.setVisible(v);
  }

  get tint() {
    return this.color;
  }

  destroy() {
    this.root.destroy();
  }
}
