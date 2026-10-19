import Phaser from 'phaser';
import { EV, type NotifyData } from '../game/shared';
import { display } from '../game/display';
import { css } from '../game/palette';
import { progress } from '../game/progress';
import { TEX, DUCK_RES } from '../fx/textures';
import { makeText } from './widgets';
import { CAPTION, GOLD, GOLD_CSS, drawGlyph } from './DailyScreen';

const W_MAX = 360;
const H = 64;
const H_COMPACT = 44;
const HOLD = 2200;
/** Shorter holds while more banners are waiting. */
const HOLD_BUSY = 1500;

/**
 * Banners that slide down from the top (below the notch): mission done,
 * achievement, record, streak, rewards. Listens to EV.notify by itself and
 * queues, one at a time. Built once; each banner sets its texts once.
 *
 * During a run call setInRun(true): banners get compact (title + "+N"),
 * sit below the HUD and ignore taps (taps there must still turn the ball).
 */
export class NotifyBanner {
  readonly root: Phaser.GameObjects.Container;
  private bg: Phaser.GameObjects.Graphics;
  private icon: Phaser.GameObjects.Graphics;
  private duck: Phaser.GameObjects.Image;
  private title: Phaser.GameObjects.Text;
  private subtitle: Phaser.GameObjects.Text;
  private amount: Phaser.GameObjects.Text;
  private hit: Phaser.GameObjects.Zone;
  private queue: NotifyData[] = [];
  private showing = false;
  private inRun = false;
  private w = W_MAX;
  private screenW = 390;
  private top = 8;
  private hideTimer: Phaser.Time.TimerEvent | null = null;

  constructor(private scene: Phaser.Scene) {
    this.bg = scene.add.graphics();
    this.icon = scene.add.graphics();
    this.duck = scene.add.image(0, 0, TEX.duck).setScale(0.3 / DUCK_RES);
    this.title = makeText(scene, 0, 0, '', { size: 16, spacing: 1 }).setOrigin(0, 0.5);
    this.subtitle = makeText(scene, 0, 0, '', { font: 'mono', size: 11, color: CAPTION, spacing: 1 }).setOrigin(0, 0.5);
    this.amount = makeText(scene, 0, 0, '', { font: 'mono', size: 17, weight: '700', color: GOLD_CSS }).setOrigin(1, 0.5);
    this.hit = scene.add.zone(0, 0, 10, 10);
    this.hit.on('pointerdown', () => this.dismiss());
    this.root = scene.add
      .container(0, 0, [this.bg, this.icon, this.duck, this.title, this.subtitle, this.amount, this.hit])
      .setDepth(1000)
      .setVisible(false);

    const onNotify = (n: NotifyData) => this.push(n);
    scene.game.events.on(EV.notify, onNotify);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.game.events.off(EV.notify, onNotify));
    // Anything raised before this banner existed (e.g. on boot).
    progress.flushNotifications();
  }

  /** `top` is the y just below the notch / status bar. */
  layout(w: number, _h: number, top = 8 + display.safeTop()) {
    this.screenW = w;
    this.top = top;
    this.w = Math.min(w - 24, W_MAX);
    if (this.showing) this.root.setPosition(w / 2, this.restY());
  }

  /** Compact, tap-through banners below the HUD while playing. */
  setInRun(on: boolean) {
    this.inRun = on;
  }

  push(n: NotifyData) {
    this.queue.push(n);
    if (!this.showing) this.next();
  }

  /** Hide the current banner now (tap on it). */
  dismiss() {
    if (!this.showing) return;
    this.hideTimer?.remove();
    this.hideTimer = null;
    this.hide();
  }

  /** Drop everything (e.g. when the app goes to the background). */
  clear() {
    this.queue = [];
    this.dismiss();
  }

  private restY() {
    // In a run, sit under the HUD's distance readout and the combo badge
    // (centred at top + 76, 34 high), so the two never overlap.
    return this.inRun ? this.top + 110 + H_COMPACT / 2 : this.top + H / 2;
  }

  private next() {
    const n = this.queue.shift();
    if (!n) {
      this.showing = false;
      this.root.setVisible(false);
      return;
    }
    this.showing = true;
    this.draw(n);
    const y = this.restY();
    this.scene.tweens.killTweensOf(this.root);
    // In a run the banner rises into place from below, so it never slides
    // across the HUD and combo badge above it.
    this.root.setPosition(this.screenW / 2, this.inRun ? y + 18 : y - 90).setAlpha(0).setScale(1).setVisible(true);
    this.scene.tweens.add({ targets: this.root, y, alpha: 1, duration: 320, ease: 'Back.easeOut' });
    if (n.ducks) {
      // The "+N" pops a moment after the banner lands.
      this.amount.setScale(0.4);
      this.duck.setScale(0.15 / DUCK_RES);
      this.scene.tweens.add({ targets: this.amount, scale: 1, delay: 260, duration: 300, ease: 'Back.easeOut' });
      this.scene.tweens.add({ targets: this.duck, scale: 0.3 / DUCK_RES, delay: 220, duration: 300, ease: 'Back.easeOut' });
    }
    // A long queue (end of a big run) moves faster.
    const hold = this.queue.length > 3 ? HOLD_BUSY * 0.7 : this.queue.length > 0 ? HOLD_BUSY : HOLD;
    this.hideTimer = this.scene.time.delayedCall(hold, () => this.hide());
  }

  private hide() {
    this.scene.tweens.killTweensOf(this.root);
    this.scene.tweens.add({
      targets: this.root,
      y: this.root.y + (this.inRun ? 18 : -70),
      alpha: 0,
      duration: 220,
      ease: 'Cubic.easeIn',
      onComplete: () => this.next(),
    });
  }

  private draw(n: NotifyData) {
    const compact = this.inRun;
    const w = compact ? Math.min(this.w, 300) : this.w;
    const h = compact ? H_COMPACT : H;
    const color = n.color ?? GOLD;
    const r = compact ? 16 : 20;
    const g = this.bg.clear();
    // Soft glow in the accent colour, then the plate and its edge.
    for (let i = 3; i >= 1; i--) g.fillStyle(color, 0.05).fillRoundedRect(-w / 2 - i * 4, -h / 2 - i * 4, w + i * 8, h + i * 8, r + i * 4);
    g.fillStyle(0x0a0f18, 0.94).fillRoundedRect(-w / 2, -h / 2, w, h, r);
    g.lineStyle(1.5, color, 0.9).strokeRoundedRect(-w / 2, -h / 2, w, h, r);

    // Left badge.
    const ix = -w / 2 + (compact ? 24 : 32);
    const ig = this.icon.clear();
    ig.fillStyle(color, 0.16).fillCircle(ix, 0, compact ? 14 : 19);
    ig.lineStyle(1.5, color, 0.9).strokeCircle(ix, 0, compact ? 14 : 19);
    drawGlyph(ig, glyphFor(n), ix, 0, compact ? 7 : 9, color);

    const tx = ix + (compact ? 22 : 30);
    this.title.setText(n.title).setColor(n.color === undefined || n.color === GOLD ? GOLD_CSS : css.ink);
    this.title.setFontSize(compact ? 14 : 16);
    const sub = !compact && !!n.subtitle;
    this.title.setPosition(tx, sub ? -10 : 0);
    this.subtitle.setVisible(sub);
    if (sub) this.subtitle.setText(n.subtitle!).setPosition(tx, 12);

    const hasDucks = !!n.ducks && n.ducks > 0;
    this.amount.setVisible(hasDucks);
    this.duck.setVisible(hasDucks);
    if (hasDucks) {
      this.amount.setText(`+${n.ducks}`).setPosition(w / 2 - (compact ? 14 : 18), 0);
      this.duck.setPosition(this.amount.x - this.amount.width - 16, 0);
    }
    // Keep long subtitles inside the plate.
    const room = (hasDucks ? this.duck.x - 18 : w / 2 - 16) - tx;
    if (sub) this.subtitle.setScale(Math.min(1, room / Math.max(1, this.subtitle.width)), 1);
    this.title.setScale(Math.min(1, room / Math.max(1, this.title.width)), 1);

    this.hit.setSize(w, h);
    if (compact) this.hit.disableInteractive();
    else this.hit.setInteractive({ useHandCursor: true });
  }
}

function glyphFor(n: NotifyData) {
  const t = n.title;
  if (/^ACHIEVEMENT/.test(n.subtitle ?? '') || /ACHIEVEMENTS/.test(t)) return 'crown' as const;
  if (/^ZONE/.test(t)) return 'road' as const;
  if (/STREAK/.test(t)) return 'flame' as const;
  if (/MISSION/.test(t)) return 'check' as const;
  if (/RECORD|BEST|TOP 5/.test(t)) return 'road' as const;
  if (/STAR/.test(t)) return 'star' as const;
  if (n.ducks) return 'duck' as const;
  return 'star' as const;
}
