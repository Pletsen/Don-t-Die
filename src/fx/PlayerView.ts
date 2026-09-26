import Phaser from 'phaser';
import { palette, hueColor } from '../game/palette';
import { save } from '../game/storage';
import { skinById, skinTexture, type Skin } from '../game/skins';
import { TEX } from './textures';
import { glowFx } from './glow';
import { setParticleColors } from './Effects';

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
  private embers: Phaser.GameObjects.Particles.ParticleEmitter;
  private emberColor = -1;
  private squash = 1;
  private skin: Skin = skinById('classic');
  private aura: Phaser.GameObjects.Image;
  private bubble: Phaser.GameObjects.Container;
  private auraColor: number | null = null;
  private sizeMult = 1;
  private orb!: Phaser.GameObjects.Image;
  /** GPU glow that hugs the orb's outline, in the skin's colour. */
  private glow: Phaser.Filters.Glow | null = null;
  private glowKick = 0;
  // Bonus-universe costume: googly eyes and a party hat.
  private party: Phaser.GameObjects.Container;
  private pupils: Phaser.GameObjects.Graphics;
  private pupil = { x: 0, y: 0, vx: 0, vy: 0 };

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

    // Glowing embers shed from the ball as it moves: they hang back, spread
    // a little and fade, so the trail looks hot rather than like a tube.
    this.embers = scene.add
      .particles(0, 0, TEX.glow, {
        lifespan: { min: 500, max: 900 },
        frequency: 22,
        speed: { min: 4, max: 26 },
        scale: { start: (radius * 0.9) / 128, end: 0 },
        alpha: { start: 0.9, end: 0 },
        color: [0xffffff, palette.cyan, palette.cyan],
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

    // Skin textures are 128 px with the ball's radius at 44 px, the same
    // proportions as the original 96 px orb, so the same scale works.
    this.orb = scene.add.image(0, 0, TEX.orb).setScale((radius * 2.1) / 96);
    this.body = scene.add.container(0, 0, [this.orb]);
    this.glow = glowFx.add(this.orb, palette.cyan, 4.5, 18);

    this.pupils = scene.add.graphics();
    const eyes = scene.add.graphics();
    eyes.fillStyle(0xffffff, 1).fillCircle(-5, -2, 5.5).fillCircle(5.5, -2, 5.5);
    eyes.lineStyle(1, 0x222222, 0.6).strokeCircle(-5, -2, 5.5).strokeCircle(5.5, -2, 5.5);
    const hat = scene.add.graphics();
    hat.fillStyle(0xff2f9e, 1).fillTriangle(-8, -9, 8, -9, 0, -30);
    hat.fillStyle(0xffd21f, 1).fillTriangle(-5.2, -14, 5.2, -14, 0, -23);
    hat.fillStyle(0xff2f9e, 1).fillTriangle(-2.6, -18, 2.6, -18, 0, -23);
    hat.fillStyle(0x2be8ff, 1).fillCircle(0, -30, 3.2);
    this.party = scene.add.container(0, 0, [hat, eyes, this.pupils]).setVisible(false);

    // Ability look: a spinning aura ring and (for shields) a bubble.
    this.aura = scene.add.image(0, 0, TEX.ring).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
    this.bubble = scene.add.container(0, 0, [
      scene.add.image(0, 0, TEX.glow).setBlendMode(Phaser.BlendModes.ADD).setScale(0.55).setAlpha(0.25).setTint(0xff9ad5),
      scene.add.image(0, 0, TEX.ring).setScale((radius * 2.2) / 116).setAlpha(0.8).setTint(0xffc6e3),
    ]).setVisible(false);

    this.root = scene.add
      .container(0, 0, [this.aura, this.halo, this.ring, this.body, this.party, this.bubble])
      .setDepth(6);
    this.trail.startFollow(this.root);
    this.embers.startFollow(this.root);
    this.sparks.startFollow(this.root);
  }

  setPosition(x: number, y: number) {
    this.root.setPosition(x, y);
  }

  /** A quick squash, as if the orb pushes off the new direction. */
  onTurn() {
    this.squash = 0.62;
    this.glowKick = 1;
    // Googly eyes rattle on every turn.
    this.pupil.vx += (Math.random() - 0.5) * 60;
    this.pupil.vy += (Math.random() - 0.5) * 60;
  }

  /** Dress the orb in a skin: its texture, glow colour and trail. */
  setSkin(id: string) {
    this.skin = skinById(id);
    this.orb.setTexture(skinTexture(this.skin.id));
    // Slightly dim character skins so bloom keeps their faces readable.
    this.orb.setTint(this.skin.upright ? 0xd8d8d8 : 0xffffff);
    this.halo.setTint(this.skin.glow);
    this.ring.setTint(this.skin.glow);
    if (this.glow) this.glow.color = this.skin.glow;
    this.sparks.setParticleTint([0xffffff, this.skin.glow]);
  }

  /** Show an ability's look, or clear it with `null`. */
  setAbilityLook(color: number | null, opts: { bubble?: boolean; size?: number } = {}) {
    this.auraColor = color;
    this.aura.setVisible(color !== null);
    this.setBubble(!!opts.bubble);
    this.root.scene.tweens.add({ targets: this, sizeMult: opts.size ?? 1, duration: 250, ease: 'Back.easeOut' });
  }

  setBubble(on: boolean) {
    if (on === this.bubble.visible) return;
    if (on) {
      this.bubble.setVisible(true).setAlpha(1);
    } else {
      // Pop!
      this.root.scene.tweens.add({
        targets: this.bubble,
        alpha: 0,
        scale: 1.8,
        duration: 180,
        onComplete: () => this.bubble.setVisible(false).setScale(1),
      });
    }
  }

  setParty(on: boolean) {
    this.party.setVisible(on);
    if (on) {
      this.party.setScale(0);
      this.party.scene.tweens.add({ targets: this.party, scale: 1, duration: 500, ease: 'Back.easeOut' });
    }
  }

  update(time: number, dt: number, heading: number, speedNorm: number, radius: number) {
    this.squash += (1 - this.squash) * Math.min(1, dt * 16);
    // Faces and hats stay upright; plain balls turn with the direction.
    this.body.setRotation(this.skin.upright ? 0 : heading).setScale(2 - this.squash, this.squash);
    this.root.setScale(this.sizeMult);
    if (this.auraColor !== null) {
      const k = 0.5 + 0.5 * Math.sin(time * 10);
      this.aura.setTint(this.auraColor).setRotation(time * 4).setScale((radius * (2.6 + k * 0.5)) / 116).setAlpha(0.5 + k * 0.4);
    }
    if (this.bubble.visible) this.bubble.setScale(1 + Math.sin(time * 6) * 0.05);

    const pulse = 0.5 + 0.5 * Math.sin(time * 5);
    // Faces need a softer halo, or the glow washes out their features.
    const haloBase = this.skin.upright ? 0.28 : 0.6;
    this.halo.setAlpha(haloBase + pulse * 0.2 + speedNorm * 0.15);
    // The outline glow breathes, flares on each turn and burns brighter at speed.
    this.glowKick = Math.max(0, this.glowKick - dt * 5);
    if (this.glow) this.glow.outerStrength = (this.skin.upright ? 3 : 4) + pulse * 0.8 + speedNorm * 1 + this.glowKick * 3;

    // Rotating a squashed image turns a circle into a tumbling orbit.
    const ringR = radius * 2.2 * (1 + 0.04 * Math.sin(time * 3));
    this.ring.setRotation(time * 0.9).setScale(ringR / 116, (ringR / 116) * 0.4);

    this.trail.frequency = speedNorm > 0.5 ? 5 : 8;
    this.embers.frequency = 26 - speedNorm * 12;

    if (this.party.visible) {
      // Pupils look where you're going, on a wobbly spring.
      const tx = Math.cos(heading) * 2.4;
      const ty = Math.sin(heading) * 2.4;
      const p = this.pupil;
      p.vx += ((tx - p.x) * 120 - p.vx * 7) * dt;
      p.vy += ((ty - p.y) * 120 - p.vy * 7) * dt;
      p.x = Phaser.Math.Clamp(p.x + p.vx * dt, -3, 3);
      p.y = Phaser.Math.Clamp(p.y + p.vy * dt, -3, 3);
      this.pupils.clear().fillStyle(0x111111, 1);
      this.pupils.fillCircle(-5 + p.x, -2 + p.y, 2.6).fillCircle(5.5 + p.x, -2 + p.y, 2.6);
      this.party.setRotation(Math.sin(time * 6) * 0.08);
    }

    // Easter egg: a trail that cycles through the rainbow.
    const trail = this.skin.trail;
    const color =
      save.rainbow || trail === 'rainbow'
        ? hueColor(time * 240)
        : Array.isArray(trail)
          ? trail[Math.floor(time * 8) % trail.length]
          : trail;
    this.trail.setParticleTint(color);
    // Embers start white-hot and cool into the trail's colour.
    if (color !== this.emberColor) {
      this.emberColor = color;
      setParticleColors(this.embers, [0xffffff, color, color]);
    }
  }

  setEmitting(on: boolean) {
    this.trail.emitting = on;
    this.sparks.emitting = on;
    this.embers.emitting = on;
  }

  setVisible(v: boolean) {
    this.root.setVisible(v);
  }

  fadeOut(scene: Phaser.Scene) {
    this.setEmitting(false);
    scene.tweens.add({ targets: this.root, alpha: 0, scale: 1.8, duration: 180, ease: 'Quad.easeOut' });
  }

  reset() {
    this.party.setVisible(false);
    this.root.scene.tweens.killTweensOf(this);
    this.auraColor = null;
    this.aura.setVisible(false);
    this.bubble.setVisible(false);
    this.sizeMult = 1;
    this.root.setAlpha(1).setScale(1).setVisible(true);
    this.squash = 1;
    this.trail.killAll();
    this.embers.killAll();
    this.sparks.killAll();
  }
}
