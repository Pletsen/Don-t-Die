import Phaser from 'phaser';
import { display } from '../game/display';
import { sfx } from '../audio/Sfx';
import { GLOW_PAD, hexColor, makeButton, makeText, type Button } from './widgets';

/**
 * One-time introductions: a card that pops up over whatever is on screen
 * (a picture, a few lines, one or two buttons), and a spotlight tour that
 * points at the menu buttons one by one. Both swallow every tap until
 * they're done, so nothing underneath fires by accident.
 */

/** A picture for a card: drawn around (0, 0), about 300 x 120 px. */
export interface CardArt {
  root: Phaser.GameObjects.Container;
  /** Animate; `t` is seconds since the card opened. */
  update?(t: number): void;
}

export interface CardSpec {
  title: string;
  color: number;
  body: string;
  note?: string;
  art: (scene: Phaser.Scene) => CardArt;
  primary: { label: string; onPress?: () => void };
  secondary?: { label: string; onPress?: () => void };
}

export interface TourStep {
  /** The thing to point at, in screen px (centre and size). */
  target: () => { x: number; y: number; w: number; h: number };
  title: string;
  body: string;
  color: number;
}

const ART_H = 130;

export class Coach {
  private readonly root: Phaser.GameObjects.Container;
  private readonly blocker: Phaser.GameObjects.Zone;
  private readonly dim: Phaser.GameObjects.Graphics;
  // The card.
  private readonly card: Phaser.GameObjects.Container;
  private readonly plate: Phaser.GameObjects.Graphics;
  private readonly title: Phaser.GameObjects.Text;
  private readonly body: Phaser.GameObjects.Text;
  private readonly note: Phaser.GameObjects.Text;
  private primary: Button | null = null;
  private secondary: Button | null = null;
  private art: CardArt | null = null;
  // The tour bubble.
  private readonly bubble: Phaser.GameObjects.Container;
  private readonly bubblePlate: Phaser.GameObjects.Graphics;
  private readonly bubbleTitle: Phaser.GameObjects.Text;
  private readonly bubbleBody: Phaser.GameObjects.Text;
  private readonly bubbleFoot: Phaser.GameObjects.Text;
  private readonly skip: Phaser.GameObjects.Text;
  private readonly ring: Phaser.GameObjects.Graphics;

  private queue: CardSpec[] = [];
  private spec: CardSpec | null = null;
  private steps: TourStep[] = [];
  private step = -1;
  private tourDone: (() => void) | null = null;
  private openedAt = 0;
  /** Taps are ignored for a moment after something opens (the tap that led here). */
  private armedAt = 0;

  /**
   * `allow` says whether a waiting card may open now (the owner returns false
   * while a run is on); cards that can't wait in the queue until `resume()`.
   */
  constructor(
    private scene: Phaser.Scene,
    private allow: () => boolean = () => true,
  ) {
    const add = scene.add;
    this.blocker = add.zone(0, 0, 10, 10).setOrigin(0).setInteractive();
    this.blocker.on('pointerdown', () => this.tapBackground());
    this.dim = add.graphics();

    this.plate = add.graphics();
    this.title = makeText(scene, 0, 0, '', { size: 24, spacing: 1, glow: true }).setOrigin(0.5, 0);
    this.body = makeText(scene, 0, 0, '', { size: 15, spacing: 0.3 }).setOrigin(0.5, 0).setAlign('center').setLineSpacing(4);
    this.note = makeText(scene, 0, 0, '', { font: 'mono', size: 10, color: '#8fa3b5', spacing: 1 })
      .setOrigin(0.5, 0)
      .setAlign('center')
      .setLineSpacing(4);
    this.card = add.container(0, 0, [this.plate, this.title, this.body, this.note]).setVisible(false);

    this.ring = add.graphics();
    this.bubblePlate = add.graphics();
    this.bubbleTitle = makeText(scene, 0, 0, '', { size: 17, spacing: 1 }).setOrigin(0, 0);
    this.bubbleBody = makeText(scene, 0, 0, '', { size: 13, spacing: 0.3 }).setOrigin(0, 0).setLineSpacing(3);
    this.bubbleFoot = makeText(scene, 0, 0, '', { font: 'mono', size: 9, color: '#8fa3b5', spacing: 1.5 }).setOrigin(0, 0.5);
    this.skip = makeText(scene, 0, 0, 'SKIP', { font: 'mono', size: 11, weight: '700', color: '#8fa3b5', spacing: 2 }).setOrigin(1, 0.5);
    this.skip.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      if (this.scene.time.now < this.armedAt) return;
      sfx.click();
      this.endTour();
    });
    this.bubble = add.container(0, 0, [this.bubblePlate, this.bubbleTitle, this.bubbleBody, this.bubbleFoot, this.skip]).setVisible(false);

    this.root = add.container(0, 0, [this.blocker, this.dim, this.ring, this.card, this.bubble]).setDepth(950).setVisible(false);
  }

  /** A card or the tour is on screen. */
  get active() {
    return this.root.visible;
  }

  /** Show a card (after any that are already showing or waiting). */
  show(spec: CardSpec) {
    if (this.spec || this.steps.length) {
      this.queue.push(spec);
      return;
    }
    this.open(spec);
  }

  /** Point at things one by one; `done` runs at the end or on SKIP. */
  tour(steps: TourStep[], done: () => void) {
    if (this.active) return;
    this.steps = steps;
    this.tourDone = done;
    this.step = -1;
    this.blocker.setInteractive();
    this.root.setVisible(true).setAlpha(0);
    this.scene.tweens.add({ targets: this.root, alpha: 1, duration: 220 });
    this.nextStep();
  }

  /** Open the next waiting card, if there is one and it may open now. */
  resume() {
    if (this.spec || this.steps.length || !this.queue.length || !this.allow()) return;
    this.open(this.queue.shift()!);
  }

  /** Close the tour at once (another screen is taking over). */
  cancelTour() {
    if (this.steps.length) this.endTour();
  }

  /** Space / Enter: the card's main button, or the tour's next step. */
  key() {
    if (this.scene.time.now < this.armedAt) return;
    if (this.steps.length) this.nextStep();
    else if (this.spec) this.press(this.spec.primary);
  }

  update(time: number) {
    if (!this.root.visible) return;
    const t = (time - this.openedAt) / 1000;
    this.art?.update?.(t);
    if (this.steps.length) this.ring.setAlpha(0.65 + 0.35 * Math.sin(t * 5));
  }

  layout() {
    const { w, h } = display.size(this.scene);
    this.blocker.setSize(w, h);
    this.blocker.input!.hitArea.setSize(w, h);
    if (this.spec) this.placeCard();
    if (this.steps.length && this.step >= 0) this.placeStep();
  }

  // --- Cards -------------------------------------------------------------------

  private open(spec: CardSpec) {
    this.spec = spec;
    const color = hexColor(spec.color);
    this.title.setText(spec.title).setColor(color).setShadow(0, 0, color, 16, false, true);
    this.body.setText(spec.body);
    this.note.setText(spec.note ?? '').setVisible(!!spec.note);
    this.art = spec.art(this.scene);
    this.card.addAt(this.art.root, 1);
    this.primary = makeButton(this.scene, { label: spec.primary.label, width: 250, color: spec.color, onPress: () => this.press(spec.primary) });
    this.card.add(this.primary);
    if (spec.secondary) {
      const s = spec.secondary;
      this.secondary = makeButton(this.scene, { label: s.label, width: 250, style: 'ghost', color: spec.color, onPress: () => this.press(s) });
      this.card.add(this.secondary);
    }
    this.placeCard();
    this.openedAt = this.scene.time.now;
    this.armedAt = this.scene.time.now + 450;
    this.scene.tweens.killTweensOf(this.root);
    this.root.setVisible(true).setAlpha(1);
    this.blocker.setInteractive();
    this.dim.setAlpha(0);
    this.scene.tweens.add({ targets: this.dim, alpha: 1, duration: 200 });
    this.card.setVisible(true).setAlpha(0).setScale(0.86);
    this.scene.tweens.add({ targets: this.card, alpha: 1, scale: this.card.getData('fit'), duration: 320, ease: 'Back.easeOut' });
    sfx.reveal('rare');
  }

  private placeCard() {
    const { w, h } = display.size(this.scene);
    this.dim.clear().fillStyle(0x020408, 0.82).fillRect(0, 0, w, h);
    const cw = Math.min(w - 24, 350);
    const wrap = cw - 28;
    // Long lines shrink a little on narrow phones rather than wrapping awkwardly.
    const k = Math.min(1, (cw - 20) / 330);
    this.body.setScale(k).setWordWrapWidth(wrap / k);
    this.note.setScale(k).setWordWrapWidth(wrap / k);
    let y = 22;
    this.art!.root.setPosition(0, y + ART_H / 2).setScale(Math.min(1, cw / 330));
    y += ART_H + 12;
    // A long title (HARD MODE UNLOCKED!) shrinks to fit inside the card.
    this.title.setScale(Math.min(1, wrap / Math.max(1, this.title.width - GLOW_PAD * 2)));
    this.title.setPosition(0, y);
    y += this.title.displayHeight + 4;
    this.body.setPosition(0, y);
    y += this.body.displayHeight + 10;
    if (this.note.visible) {
      this.note.setPosition(0, y);
      y += this.note.displayHeight + 14;
    }
    y += 28;
    this.primary?.setPosition(0, y);
    y += 28;
    if (this.secondary) {
      y += 30;
      this.secondary.setPosition(0, y);
      y += 22;
    }
    y += 18;
    const ch = y;
    const col = this.spec!.color;
    this.plate.clear();
    for (let i = 3; i >= 1; i--) this.plate.fillStyle(col, 0.05).fillRoundedRect(-cw / 2 - i * 5, -i * 5, cw + i * 10, ch + i * 10, 26 + i * 5);
    this.plate.fillStyle(0x0a0f18, 0.97).fillRoundedRect(-cw / 2, 0, cw, ch, 26);
    this.plate.lineStyle(2, col, 0.9).strokeRoundedRect(-cw / 2, 0, cw, ch, 26);
    // Centred on the screen, a little high; shrunk on short screens.
    const s = Math.min(1, (h - display.safeTop() - display.safeBottom() - 24) / ch);
    this.card.setPosition(w / 2, Math.max(display.safeTop() + 12, h / 2 - (ch * s) / 2 - 10));
    this.card.setData('fit', s);
    if (this.card.alpha >= 1) this.card.setScale(s);
  }

  private press(b: { onPress?: () => void }) {
    if (this.scene.time.now < this.armedAt || !this.spec) return;
    // The button's action first, so closing knows whether a run has started.
    const spec = this.spec;
    b.onPress?.();
    if (this.spec === spec) this.closeCard();
  }

  private closeCard() {
    const card = this.card;
    const art = this.art;
    const buttons = [this.primary, this.secondary];
    this.spec = null;
    this.art = null;
    this.primary = null;
    this.secondary = null;
    this.scene.tweens.killTweensOf(card);
    this.scene.tweens.add({
      targets: card,
      alpha: 0,
      scale: 0.94,
      duration: 160,
      onComplete: () => {
        art?.root.destroy();
        for (const b of buttons) b?.destroy();
        if (!this.spec) card.setVisible(false);
      },
    });
    // The next card follows, unless the button just pressed started a run.
    if (this.queue.length) {
      this.scene.time.delayedCall(200, () => {
        if (this.spec || this.steps.length) return;
        if (this.allow()) this.open(this.queue.shift()!);
        else this.fadeAway();
      });
      return;
    }
    this.fadeAway();
  }

  private fadeAway() {
    // If the button started a run (or opened another screen), taps reach it at
    // once; else the fading card still swallows them (a double tap on its button).
    if (!this.allow()) this.blocker.disableInteractive();
    this.scene.tweens.add({ targets: this.dim, alpha: 0, duration: 180, onComplete: () => !this.spec && !this.steps.length && this.root.setVisible(false) });
  }

  private tapBackground() {
    // A card waits for its buttons; the tour moves on with any tap.
    if (this.steps.length && this.scene.time.now >= this.armedAt) this.nextStep();
  }

  // --- The tour ------------------------------------------------------------------

  private nextStep() {
    this.step++;
    if (this.step >= this.steps.length) {
      this.endTour();
      return;
    }
    if (this.step > 0) sfx.click();
    this.armedAt = this.scene.time.now + 350;
    this.openedAt = this.scene.time.now;
    this.placeStep();
    this.bubble.setVisible(true).setAlpha(0).setScale(0.92);
    this.scene.tweens.killTweensOf(this.bubble);
    this.scene.tweens.add({ targets: this.bubble, alpha: 1, scale: 1, duration: 220, ease: 'Back.easeOut' });
  }

  private placeStep() {
    const s = this.steps[this.step];
    const { w, h } = display.size(this.scene);
    const r = s.target();
    const pad = 8;
    // (Kept inside the screen, so the ring isn't cut off round a full-width button.)
    const x1 = Math.max(7, r.x - r.w / 2 - pad);
    const y1 = Math.max(7, r.y - r.h / 2 - pad);
    const x2 = Math.min(w - 7, r.x + r.w / 2 + pad);
    const y2 = Math.min(h - 7, r.y + r.h / 2 + pad);
    // Dark everywhere but a hole round the target.
    const a = 0.8;
    this.dim.clear().fillStyle(0x020408, a);
    this.dim.fillRect(0, 0, w, y1).fillRect(0, y2, w, h - y2).fillRect(0, y1, x1, y2 - y1).fillRect(x2, y1, w - x2, y2 - y1);
    this.dim.setAlpha(1);
    const rad = Math.min(24, (y2 - y1) / 2);
    this.ring.clear();
    this.ring.lineStyle(6, s.color, 0.25).strokeRoundedRect(x1 - 3, y1 - 3, x2 - x1 + 6, y2 - y1 + 6, rad + 3);
    this.ring.lineStyle(2.5, s.color, 1).strokeRoundedRect(x1, y1, x2 - x1, y2 - y1, rad);

    // The bubble: above the target if there's room, else below.
    const bw = Math.min(w - 24, 330);
    const color = hexColor(s.color);
    this.bubbleTitle.setText(s.title).setColor(color);
    this.bubbleBody.setText(s.body).setWordWrapWidth(bw - 32);
    this.bubbleFoot.setText(this.step < this.steps.length - 1 ? `TAP TO CONTINUE  ·  ${this.step + 1}/${this.steps.length}` : `TAP TO FINISH  ·  ${this.step + 1}/${this.steps.length}`);
    this.skip.setVisible(this.step < this.steps.length - 1);
    const bh = 16 + this.bubbleTitle.height + 6 + this.bubbleBody.height + 14 + 16 + 12;
    this.bubbleTitle.setPosition(-bw / 2 + 16, 16);
    this.bubbleBody.setPosition(-bw / 2 + 16, 16 + this.bubbleTitle.height + 6);
    this.bubbleFoot.setPosition(-bw / 2 + 16, bh - 20);
    this.skip.setPosition(bw / 2 - 16, bh - 20);
    const above = y1 - 18 - bh > display.safeTop() + 8;
    const by = above ? y1 - 18 - bh : y2 + 18;
    const bx = Phaser.Math.Clamp(r.x, 12 + bw / 2, w - 12 - bw / 2);
    this.bubble.setPosition(bx, by);
    const g = this.bubblePlate.clear();
    g.fillStyle(0x0a0f18, 0.97).fillRoundedRect(-bw / 2, 0, bw, bh, 18);
    g.lineStyle(2, s.color, 1).strokeRoundedRect(-bw / 2, 0, bw, bh, 18);
    // The point, aimed at the target.
    const px = Phaser.Math.Clamp(r.x - bx, -bw / 2 + 24, bw / 2 - 24);
    if (above) {
      g.fillStyle(0x0a0f18, 0.97).fillTriangle(px - 10, bh - 1, px + 10, bh - 1, px, bh + 11);
      g.lineStyle(2, s.color, 1).lineBetween(px - 10, bh, px, bh + 11).lineBetween(px + 10, bh, px, bh + 11);
    } else {
      g.fillStyle(0x0a0f18, 0.97).fillTriangle(px - 10, 1, px + 10, 1, px, -11);
      g.lineStyle(2, s.color, 1).lineBetween(px - 10, 0, px, -11).lineBetween(px + 10, 0, px, -11);
    }
  }

  private endTour() {
    const done = this.tourDone;
    this.steps = [];
    this.step = -1;
    this.tourDone = null;
    this.ring.clear();
    this.scene.tweens.killTweensOf([this.bubble, this.root]);
    this.scene.tweens.add({
      targets: this.root,
      alpha: 0,
      duration: 180,
      onComplete: () => {
        if (this.spec) return;
        this.root.setVisible(false).setAlpha(1);
        this.bubble.setVisible(false);
      },
    });
    done?.();
    if (this.queue.length) this.scene.time.delayedCall(220, () => this.resume());
  }
}
