import type Phaser from 'phaser';

// Render at the screen's full pixel density (up to 3x) for crisp lines.
// With reduced effects we cap at 2x. If a device turns out too slow, the
// game lowers the cap itself (see GameScene.watchPerformance) and remembers it.
function read(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
const autoCap = parseFloat(read('dontdie_dpr_cap') ?? '') || 3;
const initialDpr = Math.min(window.devicePixelRatio || 1, read('dontdie_fx_reduced') === '1' ? 2 : 3, autoCap);

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
  dpr: initialDpr,
  safeTop: safeAreaTop,
  /** The canvas size in CSS pixels (what the player actually sees). */
  size(scene: Phaser.Scene) {
    return { w: scene.scale.width / this.dpr, h: scene.scale.height / this.dpr };
  },
  /**
   * Lower the rendering resolution (never raises it). The new cap is saved
   * so the next launch starts there. Returns true if anything changed.
   */
  lowerDpr(to: number): boolean {
    if (to >= this.dpr) return false;
    this.dpr = to;
    try {
      localStorage.setItem('dontdie_dpr_cap', String(to));
    } catch {
      // Not saved; it will adapt again next time.
    }
    window.dispatchEvent(new Event('resize'));
    return true;
  },
};
