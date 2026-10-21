import Phaser from 'phaser';
import type { Hazard } from '../game/Track';
import { palette } from '../game/palette';
import { TEX, DUCK_RES } from './textures';
import { glowFx, type GlowHandle } from './glow';

/** Visuals for one saw blade, bomb or rubber duck. Follows its `Hazard` data every frame. */
export class HazardView {
  private root: Phaser.GameObjects.Container;
  private body: Phaser.GameObjects.Image;
  private halo: Phaser.GameObjects.Image;
  private warn: Phaser.GameObjects.Image;
  private fuse?: Phaser.GameObjects.Image;
  private color: number;
  private frozen = false;
  /** Frame number when the game last saw this hazard on screen. */
  shownAt = 0;
  private glow: GlowHandle | null = null;

  constructor(
    private scene: Phaser.Scene,
    readonly hazard: Hazard,
  ) {
    const isSaw = hazard.kind === 'saw';
    const isDuck = hazard.kind === 'duck';
    const variant = hazard.variant ?? 'normal';
    this.color = isSaw
      ? palette.magenta
      : isDuck
        ? { normal: 0xffd21f, red: 0xff5a4a, golden: 0xffe680 }[variant]
        : palette.orange;
    const d = hazard.radius * 2;

    this.warn = scene.add.image(0, 0, TEX.ring).setTint(this.color).setBlendMode(Phaser.BlendModes.ADD);
    this.halo = scene.add
      .image(0, 0, TEX.glow)
      .setTint(this.color)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale((d * 2.6) / 128);
    this.body = isDuck
      ? scene.add
          .image(0, 0, { normal: TEX.duck, red: TEX.duckRed, golden: TEX.duckGold }[variant])
          // The red runner is drawn a little larger so its details read at speed.
          .setScale((d * (variant === 'red' ? 1.75 : 1.5)) / (96 * DUCK_RES))
          .setFlipX(Math.random() < 0.5)
      : scene.add.image(0, 0, isSaw ? TEX.saw : TEX.bomb).setScale((d * (isSaw ? 1.05 : 1.1)) / 128);
    if (isDuck) {
      this.warn.setVisible(false);
      this.halo.setAlpha(0.35);
      if (variant === 'red') {
        // A pulsing ring so you notice it.
        this.warn.setVisible(true);
        this.halo.setAlpha(0.4);
      } else if (variant === 'golden') {
        this.warn.setVisible(true);
        this.halo.setAlpha(0.9).setScale((d * 3.6) / 128);
      }
    }

    // A soft dark disc underneath: the hazard pops off the track and the
    // background, whatever is behind it.
    const shade = scene.add
      .image(0, 0, TEX.glow)
      .setTint(0x05070a)
      .setAlpha(isDuck ? 0.45 : 0.7)
      .setScale((d * 2.2) / 128);
    const parts: Phaser.GameObjects.GameObject[] = [shade, this.warn, this.halo, this.body];
    if (hazard.kind === 'bomb') {
      this.fuse = scene.add
        .image(0, 0, TEX.glow)
        .setTint(0xfff1b0)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setScale(0.14);
      parts.push(this.fuse);
    }

    this.root = scene.add.container(hazard.x, hazard.y, parts).setDepth(4);

    // An outline glow on the things that matter: saws, bombs and the special
    // ducks. Plain ducks are harmless and stay plain.
    if (!isDuck || variant !== 'normal') {
      // Saws a little softer, so their teeth stay sharp; ducks get a thin rim,
      // so the detail inside stays visible.
      const strength = isDuck ? (variant === 'golden' ? 2.4 : 1.6) : isSaw ? 2.4 : 2.8;
      this.glow = glowFx.add(this.body, this.color, strength);
    }

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
      if (h.variant === 'red') {
        // Running: a frantic little waddle.
        this.body.setY(-Math.abs(Math.sin(time * 18)) * 3).setRotation(Math.sin(time * 18) * 0.25);
      } else if (h.variant === 'golden') {
        // Big, slow and shiny, with a pulsing golden glow.
        const glow = 0.5 + 0.5 * Math.sin(time * 5);
        this.body.setY(Math.sin(time * 2.5 + h.movePhase) * 3).setRotation(Math.sin(time * 2 + h.movePhase) * 0.12);
        this.halo.setAlpha(0.55 + glow * 0.35);
      } else {
        // Bob on invisible water.
        this.body.setY(Math.sin(time * 4 + h.movePhase) * 2).setRotation(Math.sin(time * 3 + h.movePhase) * 0.15);
      }
    } else if (h.kind === 'saw') {
      this.body.rotation += dt * 9;
      this.halo.setAlpha(0.55 + 0.15 * Math.sin(time * 12));
    } else {
      // The bomb's fuse: it charges (swells, glows hotter, the ring tightens)
      // and then blasts out to twice its radius for a moment.
      const charge = h.charge ?? 0;
      const beat = Math.pow(Math.max(0, Math.sin(time * 7 + h.movePhase)), 6);
      if (charge === -1) {
        this.body.setScale(((r * 2.2) / 128) * 1.25);
        this.halo.setAlpha(1).setScale((r * 2 * 4.2) / 128);
        this.warn.setScale((r * 2.1) / 58).setAlpha(0.95);
        if (!this.blasting) {
          this.blasting = true;
          this.blastRing();
        }
      } else {
        this.blasting = false;
        const swell = 1 + charge * charge * 0.22 + beat * 0.08;
        this.body.setScale(((r * 2.2) / 128) * swell);
        this.halo.setAlpha(0.4 + beat * 0.3 + charge * 0.6).setScale((r * 2 * 2.6 * (1 + charge * 0.4)) / 128);
        if (charge > 0) this.warn.setScale((r * (3.4 - charge * 1.6)) / 116).setAlpha(0.25 + charge * 0.7);
      }
      if (this.fuse) {
        const a = time * 14;
        this.fuse
          .setPosition(Math.cos(a) * r * 0.18, -r * 1.05 + Math.sin(a) * r * 0.18)
          .setAlpha(0.7 + 0.3 * Math.random());
      }
    }
    this.glow?.sync();
  }

  private blasting = false;

  /** A quick ring showing the blast's reach. */
  private blastRing() {
    const ring = this.scene.add
      .image(this.hazard.x, this.hazard.y, TEX.ring)
      .setTint(0xffb36b)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale((this.hazard.radius * 2) / 116)
      .setDepth(5);
    this.scene.tweens.add({
      targets: ring,
      scale: (this.hazard.radius * 2 * 2.1) / 116,
      alpha: 0,
      duration: 260,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });
  }

  setFrozen(on: boolean) {
    if (on === this.frozen) return;
    this.frozen = on;
    if (on) this.body.setTint(this.inked ? 0x7a4aa8 : 0xbfefff);
    else this.body.clearTint();
    this.halo.setTint(on ? (this.inked ? 0x9a4af0 : 0x9fe8ff) : this.color);
  }

  private inked = false;

  /** OCTO's ink: splatted purple, shrunk, and still for good. */
  setInked() {
    this.inked = true;
    this.frozen = false;
    this.setFrozen(true);
    this.body.setScale(this.body.scaleX * 0.62);
    this.halo.setScale(this.halo.scaleX * 0.62).setAlpha(0.3);
    this.warn.setVisible(false);
    this.fuse?.setVisible(false);
    this.scene.tweens.add({ targets: this.root, scale: { from: 1.35, to: 1 }, duration: 260, ease: 'Back.easeOut' });
  }

  private bodyScale = -1;
  private haloScale = -1;

  /** SO SHY: shrink back (k = share of the full size). Bombs follow their radius by themselves. */
  setShrink(k: number) {
    if (this.hazard.kind === 'bomb') return;
    if (this.bodyScale < 0) {
      this.bodyScale = this.body.scaleX;
      this.haloScale = this.halo.scaleX;
    }
    this.body.setScale(this.bodyScale * k);
    this.halo.setScale(this.haloScale * k);
  }

  /** Beamed up by a tractor beam: it floats up, spinning and shrinking, and is gone. */
  abduct() {
    this.warn.setVisible(false);
    this.scene.tweens.add({
      targets: this.root,
      y: this.root.y - 70,
      scale: 0.1,
      angle: 540,
      alpha: 0,
      duration: 480,
      ease: 'Cubic.easeIn',
      onComplete: () => this.destroy(),
    });
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
