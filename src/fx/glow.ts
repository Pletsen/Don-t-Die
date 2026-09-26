import Phaser from 'phaser';

/**
 * Engine-side glow (Phaser's Glow filter): the GPU traces the outline of the
 * image and paints a soft coloured light around it. Unlike our fake halos
 * (a blurry sprite behind the object), it follows the real shape, so a saw
 * glows along each tooth.
 *
 * Every filtered object costs an extra render pass, so it's only used on a
 * few important things, and all of them switch off together in reduced FX.
 */
export const glowFx = {
  /** Off in reduced FX, or when the phone can't keep up. */
  enabled: true,
  all: new Set<Phaser.Filters.Glow>(),

  add(img: Phaser.GameObjects.Image, color: number, strength: number, distance = 10): Phaser.Filters.Glow | null {
    if (!img.enableFilters) return null;
    img.enableFilters();
    // External: the glow is drawn after the image is placed in the world, so
    // it keeps its size however the image is scaled or rotated.
    const glow = img.filters?.external.addGlow(color, strength, 0, 1, false, 8, distance);
    if (!glow) return null;
    // Grow the render area so the glow isn't cut off at the image's edges.
    glow.setPaddingOverride(null);
    glow.active = this.enabled;
    this.all.add(glow);
    img.once(Phaser.GameObjects.Events.DESTROY, () => this.all.delete(glow));
    return glow;
  },

  setEnabled(on: boolean) {
    this.enabled = on;
    this.all.forEach((g) => (g.active = on));
  },
};
