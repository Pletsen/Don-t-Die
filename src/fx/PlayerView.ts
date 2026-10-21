import Phaser from 'phaser';
import { palette, hueColor } from '../game/palette';
import { save } from '../game/storage';
import { skinById, skinTexture, type Skin } from '../game/skins';
import { TEX } from './textures';
import { glowFx, type GlowHandle } from './glow';
import { setParticleColors } from './Effects';
import { u2Color } from './worldPalette';

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
  /** A hop (bunny, tennis): 0 on the ground, 1 at the top. */
  private lift = 0;
  private hopTween?: Phaser.Tweens.Tween;
  private orb!: Phaser.GameObjects.Image;
  /** Baked glow that hugs the orb's outline, in the skin's colour. */
  private glow!: GlowHandle;
  private glowKick = 0;
  // Bonus-universe look: the skin itself stays untouched. A tiny disco-ball
  // moon orbits it, a second ring spins the other way, and the rings and
  // trail sweep through the Universe 2 colours.
  private party = false;
  private moon: Phaser.GameObjects.Image;
  private glint: Phaser.GameObjects.Image;
  private ring2: Phaser.GameObjects.Image;
  private moonFront = true;
  private partyIn = 0;

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
    this.glow = glowFx.add(this.orb, palette.cyan, 4.5);

    this.ring2 = scene.add.image(0, 0, TEX.ring).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0).setVisible(false);
    this.moon = scene.add.image(0, 0, TEX.disco).setVisible(false);
    this.glint = scene.add.image(0, 0, TEX.spark).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);

    // Ability look: a spinning aura ring and (for shields) a bubble.
    this.aura = scene.add.image(0, 0, TEX.ring).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
    this.bubble = scene.add.container(0, 0, [
      scene.add.image(0, 0, TEX.glow).setBlendMode(Phaser.BlendModes.ADD).setScale(0.55).setAlpha(0.25).setTint(0xff9ad5),
      scene.add.image(0, 0, TEX.ring).setScale((radius * 2.2) / 116).setAlpha(0.8).setTint(0xffc6e3),
    ]).setVisible(false);

    this.root = scene.add
      .container(0, 0, [this.aura, this.halo, this.ring, this.ring2, this.body, this.moon, this.glint, this.bubble])
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
  }

  /** Dress the orb in a skin: its texture, glow colour and trail. */
  setSkin(id: string) {
    this.skin = skinById(id);
    this.orb.setTexture(skinTexture(this.skin.id));
    // Slightly dim character skins so bloom keeps their faces readable.
    this.orb.setTint(this.skin.upright ? 0xd8d8d8 : 0xffffff);
    this.halo.setTint(this.skin.glow);
    this.ring.setTint(this.skin.glow);
    this.glow.refresh();
    this.glow.setColor(this.skin.glow);
    this.sparks.setParticleTint([0xffffff, this.skin.glow]);
  }

  /** Show an ability's look, or clear it with `null`. */
  setAbilityLook(color: number | null, opts: { bubble?: boolean; size?: number } = {}) {
    this.auraColor = color;
    this.aura.setVisible(color !== null);
    this.setBubble(!!opts.bubble);
    this.root.scene.tweens.add({ targets: this, sizeMult: opts.size ?? 1, duration: 250, ease: 'Back.easeOut' });
  }

  /** Jump up and land again (over a hazard): the orb grows, as if it came closer. */
  hop(ms: number) {
    this.hopTween?.remove();
    this.lift = 0;
    this.hopTween = this.root.scene.tweens.add({ targets: this, lift: 1, duration: ms / 2, yoyo: true, ease: 'Sine.easeOut' });
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
    if (on === this.party) return;
    this.party = on;
    this.partyIn = 0;
    this.moon.setVisible(on);
    this.glint.setVisible(on);
    this.ring2.setVisible(on);
    if (!on) {
      // Back to the skin's own colours.
      this.ring.setTint(this.skin.glow);
      this.sparks.setParticleTint([0xffffff, this.skin.glow]);
    }
  }

  update(time: number, dt: number, heading: number, speedNorm: number, radius: number) {
    this.squash += (1 - this.squash) * Math.min(1, dt * 16);
    // Faces and hats stay upright; plain balls turn with the direction.
    this.body.setRotation(this.skin.upright ? 0 : heading).setScale(2 - this.squash, this.squash);
    this.root.setScale(this.sizeMult * (1 + this.lift * 0.55));
    this.body.setY(-this.lift * 10);
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
    this.glow.setStrength((this.skin.upright ? 2.6 : 3.4) + pulse * 0.6 + speedNorm * 0.8 + this.glowKick * 2);

    // Rotating a squashed image turns a circle into a tumbling orbit.
    const ringR = radius * 2.2 * (1 + 0.04 * Math.sin(time * 3));
    this.ring.setRotation(time * 0.9).setScale(ringR / 116, (ringR / 116) * 0.4);

    this.trail.frequency = speedNorm > 0.5 ? 5 : 8;
    this.embers.frequency = 26 - speedNorm * 12;

    if (this.party) this.updateParty(time, dt, ringR);

    // Easter egg: a trail that cycles through the rainbow.
    const trail = this.skin.trail;
    const color = this.party
      ? u2Color(time * 1.6, 40)
      : save.rainbow || trail === 'rainbow'
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

  /** The disco moon's orbit and the Universe 2 colour sweep. */
  private updateParty(time: number, dt: number, ringR: number) {
    // Grow in with a little overshoot when you warp.
    this.partyIn = Math.min(1, this.partyIn + dt * 2.2);
    const k = this.partyIn;
    const pop = 1 + Math.sin(k * Math.PI) * 0.35 * (1 - k * 0.5);
    const ca = u2Color(time);
    const cb = u2Color(time, 120);
    this.ring.setTint(ca);
    const r2 = ringR * 1.8 * pop;
    this.ring2.setTint(cb).setRotation(-time * 1.3 + 1).setScale(r2 / 116, (r2 / 116) * 0.42).setAlpha(0.45 * k);

    // The moon rides the second ring's tilted ellipse.
    const a = time * 2.6;
    const rx = r2 * 0.47;
    const ry = rx * 0.42;
    const rot = this.ring2.rotation;
    const ex = Math.cos(a) * rx;
    const ey = Math.sin(a) * ry;
    const x = ex * Math.cos(rot) - ey * Math.sin(rot);
    const y = ex * Math.sin(rot) + ey * Math.cos(rot);
    const front = Math.sin(a) > 0;
    // Nearer = slightly bigger; it passes behind the ball on the far side.
    const size = (ringR * 0.42 * (front ? 1.1 : 0.85) * k) / 60;
    this.moon.setPosition(x, y).setScale(size).setRotation(time * 3);
    if (front !== this.moonFront) {
      this.moonFront = front;
      if (front) this.root.moveAbove<Phaser.GameObjects.GameObject>(this.moon, this.body);
      else this.root.moveBelow<Phaser.GameObjects.GameObject>(this.moon, this.body);
      this.root.moveAbove(this.glint, this.moon);
    }
    // A mirror-ball glint that flashes now and then.
    const g = Math.max(0, Math.sin(time * 7.3) * Math.sin(time * 2.1));
    this.glint.setPosition(x - size * 14, y - size * 14).setScale(0.2 + g * 0.5).setAlpha(g * k).setTint(cb).setRotation(time);
    this.sparks.setParticleTint([0xffffff, ca, cb]);
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
    this.setParty(false);
    this.root.scene.tweens.killTweensOf(this);
    this.auraColor = null;
    this.aura.setVisible(false);
    this.bubble.setVisible(false);
    this.sizeMult = 1;
    this.lift = 0;
    this.body.setY(0);
    this.root.setAlpha(1).setScale(1).setVisible(true);
    this.squash = 1;
    this.trail.killAll();
    this.embers.killAll();
    this.sparks.killAll();
  }
}
