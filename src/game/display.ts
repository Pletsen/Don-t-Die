import type Phaser from 'phaser';
import { read, write } from './persist';

// Render at the screen's full pixel density (up to 3x) for crisp lines.
//
// If a device can't keep up, the game steps down a quality ladder, cheapest
// visual losses first, and only lowers the resolution as a last resort:
//   0  everything on
//   1  lighter bloom (2 blur steps instead of 3)
//   2  no outline glows and no ambient specks
//   3  resolution 2.5x (only on 3x screens)
//   4  resolution 2x
// It never goes below 2x on a retina screen: blurry looks worse than a few
// missing effects. Between runs it tries one step back up, so a single bad
// moment (a notification, the app waking up) doesn't cost quality forever.

const QUALITY_KEY = 'dontdie_quality_v2';
export const MAX_QUALITY_STEP = 4;

const deviceDpr = window.devicePixelRatio || 1;

function dprFor(step: number, fxReduced: boolean): number {
  let cap = fxReduced ? 2 : 3;
  if (step >= 3) cap = Math.min(cap, 2.5);
  if (step >= 4) cap = Math.min(cap, 2);
  return Math.min(deviceDpr, cap);
}

const storedStep = Math.min(MAX_QUALITY_STEP, Math.max(0, parseInt(read(QUALITY_KEY) ?? '0', 10) || 0));

/** Height of the phone's notch / status bar area, read from CSS. */
function measureSafeArea(): { top: number; bottom: number } {
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:fixed;top:0;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px);visibility:hidden';
  document.body.appendChild(probe);
  const style = getComputedStyle(probe);
  const value = { top: parseFloat(style.paddingTop) || 0, bottom: parseFloat(style.paddingBottom) || 0 };
  probe.remove();
  return value;
}

let safe = measureSafeArea();
type Listener = () => void;
const qualityListeners: Listener[] = [];

export const display = {
  /** Current rendering resolution multiplier. */
  dpr: dprFor(storedStep, read('dontdie_fx_reduced') === '1'),
  /** Current step on the quality ladder (0 = best). */
  quality: storedStep,
  /** Notch / status bar height in CSS px. Cached: measured on resize only. */
  safeTop: () => safe.top,
  /** Home indicator height in CSS px. */
  safeBottom: () => safe.bottom,
  /** Re-measure the safe areas (called on resize). */
  remeasure() {
    safe = measureSafeArea();
  },
  /** The canvas size in CSS pixels (what the player actually sees). */
  size(scene: Phaser.Scene) {
    return { w: scene.scale.width / this.dpr, h: scene.scale.height / this.dpr };
  },
  /** Called when the quality step changes (effects switch themselves on/off). */
  onQuality(fn: Listener) {
    qualityListeners.push(fn);
  },
  /**
   * Move along the quality ladder (+1 = cheaper, -1 = nicer). Saves the step
   * and resizes the canvas if the resolution changes. Returns true if anything
   * changed.
   */
  setQuality(step: number, fxReduced: boolean): boolean {
    step = Math.max(0, Math.min(MAX_QUALITY_STEP, step));
    if (step === this.quality) return false;
    this.quality = step;
    write(QUALITY_KEY, String(step));
    const dpr = dprFor(step, fxReduced);
    qualityListeners.forEach((fn) => fn());
    if (dpr !== this.dpr) {
      this.dpr = dpr;
      window.dispatchEvent(new Event('resize'));
    }
    return true;
  },
  /** Re-apply the resolution cap after the reduced-FX setting changed. */
  applyFxReduced(fxReduced: boolean) {
    const dpr = dprFor(this.quality, fxReduced);
    if (dpr !== this.dpr) {
      this.dpr = dpr;
      window.dispatchEvent(new Event('resize'));
    }
  },
};
