import Phaser from 'phaser';
import { LEVELS, WORLDS, levelById } from '../game/levels';
import type { ClearData } from '../game/shared';
import { css } from '../game/palette';
import { sfx } from '../audio/Sfx';
import { drawStar, hexColor, makeButton, makeText, type Button } from './widgets';

const STAR_R = 24;
const STAR_GAP = 64;

/** "LEVEL CLEAR" screen: stars pop in one by one, then next / retry / levels. */
export class ClearScreen {
  readonly root: Phaser.GameObjects.Container;
  private label: Phaser.GameObjects.Text;
  private title: Phaser.GameObjects.Text;
  private starSlots: Phaser.GameObjects.Graphics;
  private starFills: Phaser.GameObjects.Graphics[] = [];
  private stats: Phaser.GameObjects.Text;
  private hint: Phaser.GameObjects.Text;
  private next: Button;
  private retry: Button;
  private levels: Button;

  constructor(
    private scene: Phaser.Scene,
    handlers: { next: () => void; retry: () => void; levels: () => void },
  ) {
    this.label = makeText(scene, 0, 0, '', { font: 'mono', size: 12, spacing: 3 }).setOrigin(0.5);
    this.title = makeText(scene, 0, 0, 'CLEAR', { size: 68, glow: true }).setOrigin(0.5);
    this.starSlots = scene.add.graphics();
    for (let i = 0; i < 3; i++) {
      const g = scene.add.graphics();
      drawStar(g, 0, 0, STAR_R, 0xffffff, true);
      this.starFills.push(g);
    }
    this.stats = makeText(scene, 0, 0, '', { font: 'mono', size: 13, color: css.inkDim, spacing: 1.5 }).setOrigin(0.5);
    this.hint = makeText(scene, 0, 0, '', { size: 13, color: css.inkDim, spacing: 1.2 }).setOrigin(0.5);
    this.next = makeButton(scene, { label: 'NEXT LEVEL', width: 200, onPress: handlers.next });
    this.retry = makeButton(scene, { label: 'RETRY', width: 120, style: 'ghost', onPress: handlers.retry });
    this.levels = makeButton(scene, { label: 'LEVELS', width: 120, style: 'ghost', onPress: handlers.levels });

    this.root = scene.add.container(0, 0, [
      this.label,
      this.title,
      this.starSlots,
      ...this.starFills,
      this.stats,
      this.hint,
      this.next,
      this.retry,
      this.levels,
    ]);
    this.root.setVisible(false);
  }

  layout(w: number, h: number) {
    const cx = w / 2;
    const oy = h * 0.34;
    this.label.setPosition(cx, oy - 58);
    this.title.setPosition(cx, oy);
    this.starSlots.setPosition(cx, oy + 74);
    this.starFills.forEach((g, i) => g.setPosition(cx + (i - 1) * STAR_GAP, oy + 74));
    this.stats.setPosition(cx, oy + 124);
    this.hint.setPosition(cx, oy + 148);
    this.next.setPosition(cx, oy + 210);
    this.retry.setPosition(cx - 66, oy + 270);
    this.levels.setPosition(cx + 66, oy + 270);
  }

  show(d: ClearData) {
    const level = levelById(d.level)!;
    const color = WORLDS[level.world].color;
    const last = d.level === LEVELS[LEVELS.length - 1].id;

    this.label.setText(`LEVEL ${d.level} · ${WORLDS[level.world].name}`).setColor(hexColor(color));
    this.title.setText(last ? 'ALL CLEAR' : 'CLEAR').setShadow(0, 0, hexColor(color), 22, false, true);
    this.stats.setText(`PERFECT ${d.perfects}/${d.turns}  ·  ${d.seconds.toFixed(1)} SEC`);
    this.next.setLabel(last ? 'LEVELS' : 'NEXT LEVEL');

    if (d.stars < 2) this.hint.setText('2 STARS: HALF YOUR TURNS PERFECT').setColor(css.inkDim);
    else if (d.stars < 3) this.hint.setText('3 STARS: 90% OF TURNS PERFECT').setColor(css.inkDim);
    else this.hint.setText(d.previousStars < 3 ? 'FLAWLESS' : '').setColor(css.orange);

    this.starSlots.clear();
    for (let i = 0; i < 3; i++) drawStar(this.starSlots, (i - 1) * STAR_GAP, 0, STAR_R, 0x2a3644, true);

    this.root.setVisible(true).setAlpha(0);
    this.scene.tweens.add({ targets: this.root, alpha: 1, duration: 250 });
    this.title.setScale(0.6);
    this.scene.tweens.add({ targets: this.title, scale: 1, duration: 450, ease: 'Back.easeOut' });

    this.starFills.forEach((g, i) => {
      g.setScale(0).setAlpha(1);
      if (i >= d.stars) return;
      this.scene.tweens.add({
        targets: g,
        scale: 1,
        delay: 350 + i * 300,
        duration: 380,
        ease: 'Back.easeOut',
        onStart: () => sfx.star(i),
      });
    });

    [this.next, this.retry, this.levels].forEach((b, i) => {
      b.setAlpha(0);
      this.scene.tweens.add({ targets: b, alpha: 1, delay: 500 + d.stars * 300 + i * 60, duration: 250 });
    });
  }

  hide() {
    this.scene.tweens.add({ targets: this.root, alpha: 0, duration: 160, onComplete: () => this.root.setVisible(false) });
  }

  update(time: number) {
    if (!this.root.visible) return;
    this.starFills.forEach((g, i) => g.setAngle(Math.sin(time / 500 + i) * 4));
  }
}
