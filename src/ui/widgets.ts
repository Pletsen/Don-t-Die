import Phaser from 'phaser';
import { display } from '../game/display';
import { css, fonts, palette } from '../game/palette';
import { sfx } from '../audio/Sfx';

// Small building blocks shared by every UI screen.

/** Extra space around glowing text. Top-left anchored text must be shifted by it. */
export const GLOW_PAD = 24;

export interface TextOpts {
  font?: 'display' | 'mono';
  size: number;
  color?: string;
  weight?: string;
  spacing?: number;
  glow?: boolean | string;
}

export function makeText(scene: Phaser.Scene, x: number, y: number, str: string, o: TextOpts) {
  const t = scene.add.text(x, y, str, {
    fontFamily: o.font === 'mono' ? fonts.mono : fonts.display,
    fontStyle: o.weight ?? (o.font === 'mono' ? '500' : '700'),
    fontSize: `${o.size}px`,
    color: o.color ?? css.ink,
    resolution: display.dpr * 1.5,
    // Room for the glow, otherwise it gets clipped into a visible box.
    padding: o.glow ? { x: GLOW_PAD, y: GLOW_PAD } : undefined,
  });
  if (o.spacing) t.setLetterSpacing(o.spacing);
  if (o.glow) t.setShadow(0, 0, typeof o.glow === 'string' ? o.glow : (o.color ?? css.cyan), 16, false, true);
  return t;
}

/** A five-pointed star. Drawn as a shape so it never depends on a font. */
export function drawStar(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  r: number,
  color: number,
  filled: boolean,
  alpha = 1,
) {
  const pts: Phaser.Math.Vector2[] = [];
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.46;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(new Phaser.Math.Vector2(x + Math.cos(a) * rad, y + Math.sin(a) * rad));
  }
  if (filled) {
    g.fillStyle(color, alpha);
    g.fillPoints(pts, true);
  } else {
    g.lineStyle(Math.max(1, r * 0.12), color, alpha);
    g.strokePoints(pts, true);
  }
}

export interface ButtonOpts {
  label: string;
  width: number;
  height?: number;
  /** `primary` is a filled pill; `ghost` is an outline. */
  style?: 'primary' | 'ghost';
  color?: number;
  onPress: () => void;
}

export type Button = Phaser.GameObjects.Container & { setLabel(label: string): void };

export function makeButton(scene: Phaser.Scene, o: ButtonOpts): Button {
  const w = o.width;
  const h = o.height ?? (o.style === 'ghost' ? 40 : 48);
  const color = o.color ?? palette.cyan;
  const ghost = o.style === 'ghost';
  const r = h / 2;

  const bg = scene.add.graphics();
  if (ghost) {
    bg.fillStyle(0x0a0e14, 0.55).fillRoundedRect(-w / 2, -h / 2, w, h, r);
    bg.lineStyle(1.5, color, 0.8).strokeRoundedRect(-w / 2, -h / 2, w, h, r);
  } else {
    // Soft glow: a few rounded rectangles, each larger and fainter.
    for (let i = 4; i >= 1; i--) {
      const grow = i * 5;
      bg.fillStyle(color, 0.06).fillRoundedRect(-w / 2 - grow, -h / 2 - grow, w + grow * 2, h + grow * 2, r + grow);
    }
    bg.fillStyle(color, 1).fillRoundedRect(-w / 2, -h / 2, w, h, r);
  }
  const hex = `#${color.toString(16).padStart(6, '0')}`;
  const txt = makeText(scene, 0, 0, o.label, {
    size: ghost ? 13 : 15,
    color: ghost ? hex : css.bg,
    spacing: 2,
  }).setOrigin(0.5);
  const hit = scene.add.zone(0, 0, w, h).setInteractive({ useHandCursor: true });

  const btn = scene.add.container(0, 0, [bg, txt, hit]) as Button;
  btn.setLabel = (label: string) => txt.setText(label);
  hit.on('pointerdown', () => {
    sfx.unlock();
    sfx.click();
    scene.tweens.add({ targets: btn, scale: 0.94, duration: 60, yoyo: true });
    o.onPress();
  });
  return btn;
}

export const hexColor = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
