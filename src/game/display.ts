import type Phaser from 'phaser';

// Rendering at more than 2x costs a lot of GPU on phones for very little
// visible gain, especially with full-screen bloom, so we cap it.
const dpr = Math.min(window.devicePixelRatio || 1, 2);

/** Height of the phone's notch / status bar area, read from CSS. */
function safeAreaTop(): number {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;top:0;padding-top:env(safe-area-inset-top,0px);visibility:hidden';
  document.body.appendChild(probe);
  const value = parseFloat(getComputedStyle(probe).paddingTop) || 0;
  probe.remove();
  return value;
}

export const display = {
  dpr,
  safeTop: safeAreaTop,
  /** The canvas size in CSS pixels (what the player actually sees). */
  size(scene: Phaser.Scene) {
    return { w: scene.scale.width / dpr, h: scene.scale.height / dpr };
  },
};
