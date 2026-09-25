import type Phaser from 'phaser';

// Render at the screen's full pixel density (up to 3x) for crisp lines.
// With reduced effects we cap at 2x, which is much lighter on older phones.
function readFxReduced() {
  try {
    return localStorage.getItem('dontdie_fx_reduced') === '1';
  } catch {
    return false;
  }
}
const dpr = Math.min(window.devicePixelRatio || 1, readFxReduced() ? 2 : 3);

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
