import Phaser from 'phaser';

/**
 * Outline glow, baked. The first time an image needs a glow, its texture is
 * drawn once onto a canvas with a big blurred shadow, and the shape itself is
 * cut back out, leaving only the light around the edges. That glow texture is
 * shown as a tinted, additive sprite right behind the image.
 *
 * It looks like Phaser's Glow filter (the light hugs the real outline, every
 * saw tooth glows) but costs one extra sprite instead of several full-screen
 * GPU passes per object, which was the main cause of lag on phones.
 */
export interface GlowHandle {
  readonly sprite: Phaser.GameObjects.Image;
  /** Tint of the light. */
  setColor(color: number): void;
  /** Roughly the old filter's `outerStrength` (0..6). */
  setStrength(strength: number): void;
  /** Copy position/rotation/scale/flip from the source image (call when it moves). */
  sync(): void;
  /** Re-bake after the source image changed texture (e.g. a new skin). */
  refresh(): void;
  destroy(): void;
}

/** Spread of the light in texture pixels, as a fraction of the texture size. */
const SPREAD = 0.32;

function bakedKey(scene: Phaser.Scene, key: string): string {
  const out = `${key}__glow`;
  if (scene.textures.exists(out)) return out;
  const src = scene.textures.get(key).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
  const w = src.width;
  const h = src.height;
  const pad = Math.ceil(Math.max(w, h) * SPREAD);
  const tex = scene.textures.createCanvas(out, w + pad * 2, h + pad * 2);
  if (!tex) return key;
  const ctx = tex.getContext();
  // The shadow of the image, drawn far off-canvas so only the shadow lands:
  // a soft white silhouette. Twice, with two radii, for a hot core and a wide halo.
  const off = 10000;
  ctx.shadowColor = '#ffffff';
  ctx.shadowOffsetX = off;
  for (const blur of [pad * 0.35, pad * 0.8]) {
    ctx.shadowBlur = blur;
    ctx.drawImage(src, pad - off, pad);
  }
  // Cut the shape back out: the glow sits around the image, not over it.
  ctx.shadowColor = 'transparent';
  ctx.globalCompositeOperation = 'destination-out';
  ctx.drawImage(src, pad, pad);
  ctx.globalCompositeOperation = 'source-over';
  tex.refresh();
  return out;
}

export const glowFx = {
  /** Off in reduced FX, or when the phone can't keep up. */
  enabled: true,
  all: new Set<GlowHandle>(),

  /**
   * Add a glow behind `img`. The glow sprite is inserted into the same
   * container (or scene list) directly below the image.
   */
  add(img: Phaser.GameObjects.Image, color: number, strength: number): GlowHandle {
    const scene = img.scene;
    const sprite = scene.add
      .image(img.x, img.y, bakedKey(scene, img.texture.key))
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(color);
    const parent = img.parentContainer;
    if (parent) {
      parent.addAt(sprite, parent.getIndex(img));
    } else {
      sprite.setDepth(img.depth);
      scene.children.moveBelow(sprite as never, img as never);
    }
    let alpha = 1;
    const handle: GlowHandle = {
      sprite,
      setColor: (c) => {
        sprite.setTint(c);
      },
      setStrength: (s) => {
        alpha = Phaser.Math.Clamp(s / 4.5, 0, 1);
        sprite.setAlpha(alpha);
      },
      sync: () => {
        sprite
          .setPosition(img.x, img.y)
          .setRotation(img.rotation)
          .setScale(img.scaleX, img.scaleY)
          .setFlip(img.flipX, img.flipY)
          .setVisible(this.enabled && img.visible);
      },
      refresh: () => {
        sprite.setTexture(bakedKey(scene, img.texture.key));
        handle.sync();
      },
      destroy: () => {
        this.all.delete(handle);
        sprite.destroy();
      },
    };
    handle.setStrength(strength);
    handle.sync();
    this.all.add(handle);
    img.once(Phaser.GameObjects.Events.DESTROY, () => handle.destroy());
    return handle;
  },

  setEnabled(on: boolean) {
    this.enabled = on;
    this.all.forEach((g) => g.sprite.setVisible(on));
  },
};
