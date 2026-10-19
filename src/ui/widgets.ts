import Phaser from 'phaser';
import { display } from '../game/display';
import { css, fonts, palette } from '../game/palette';
import { sfx } from '../audio/Sfx';
import { drawIcon, type IconName } from './icons';

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
    // Exactly the screen's pixel density: sharp, without wasting memory.
    resolution: display.dpr,
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
  /** `primary` is a filled, glowing pill; `ghost` is an outline. */
  style?: 'primary' | 'ghost';
  color?: number;
  /** Optional line icon left of the label. */
  icon?: IconName;
  onPress: () => void;
}

export type Button = Phaser.GameObjects.Container & { setLabel(label: string): void };

const mix = (a: number, b: number, t: number) => {
  const ch = (c: number, s: number) => (c >> s) & 255;
  const m = (s: number) => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * t);
  return `rgb(${m(16)},${m(8)},${m(0)})`;
};

/**
 * Bake a button face into a texture at the screen's pixel density: soft glow
 * (a real blurred shadow, no visible rings), a top-lit gradient and a thin
 * highlight for primary buttons; a dark glassy plate with a crisp outline for
 * ghost buttons. Cached per size/colour/style.
 */
function bakeButton(scene: Phaser.Scene, w: number, h: number, color: number, ghost: boolean): { key: string; pad: number } {
  const S = display.dpr;
  const pad = ghost ? 4 : 22;
  const key = `btn_${w}x${h}_${color.toString(16)}_${ghost ? 'g' : 'p'}_${S}`;
  if (scene.textures.exists(key)) return { key, pad };
  const tex = scene.textures.createCanvas(key, Math.ceil((w + pad * 2) * S), Math.ceil((h + pad * 2) * S));
  if (!tex) return { key, pad };
  const ctx = tex.getContext();
  ctx.scale(S, S);
  const r = h / 2;
  const path = (inset = 0) => {
    ctx.beginPath();
    ctx.roundRect(pad + inset, pad + inset, w - inset * 2, h - inset * 2, Math.max(0, r - inset));
  };
  if (ghost) {
    path(1);
    ctx.fillStyle = 'rgba(8,12,18,0.72)';
    ctx.fill();
    ctx.fillStyle = mix(color, color, 0).replace('rgb', 'rgba').replace(')', ',0.08)');
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = mix(color, color, 0).replace('rgb', 'rgba').replace(')', ',0.9)');
    ctx.stroke();
  } else {
    // Glow: the shadow of the pill only (drawn far away, shadow offset back).
    ctx.save();
    ctx.shadowColor = mix(color, color, 0).replace('rgb', 'rgba').replace(')', ',0.55)');
    ctx.shadowBlur = 18 * S;
    ctx.shadowOffsetX = 4000 * S;
    ctx.translate(-4000, 0);
    path();
    ctx.fillStyle = '#000';
    ctx.fill();
    ctx.restore();
    // Body: light from above.
    const grad = ctx.createLinearGradient(0, pad, 0, pad + h);
    grad.addColorStop(0, mix(color, 0xffffff, 0.5));
    grad.addColorStop(0.5, mix(color, 0xffffff, 0.08));
    grad.addColorStop(1, mix(color, 0x000000, 0.12));
    path();
    ctx.fillStyle = grad;
    ctx.fill();
    // 1 px highlight along the top edge.
    ctx.save();
    path();
    ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillRect(pad, pad, w, 1.2);
    ctx.restore();
  }
  tex.refresh();
  return { key, pad };
}

/** True if this object or any container above it is fading out (taps ignored). */
function inactive(obj: Phaser.GameObjects.GameObject): boolean {
  let p: Phaser.GameObjects.Container | null = obj.parentContainer;
  while (p) {
    if (p.getData('inactive') || !p.visible) return true;
    p = p.parentContainer;
  }
  return false;
}

export function makeButton(scene: Phaser.Scene, o: ButtonOpts): Button {
  const w = o.width;
  const h = o.height ?? (o.style === 'ghost' ? 40 : 50);
  const color = o.color ?? palette.cyan;
  const ghost = o.style === 'ghost';

  const face = bakeButton(scene, w, h, color, ghost);
  const bg = scene.add.image(0, 0, face.key).setScale(1 / display.dpr);
  const hex = `#${color.toString(16).padStart(6, '0')}`;
  const txt = makeText(scene, 0, 0, o.label, {
    size: ghost ? 13 : 16,
    color: ghost ? hex : '#041016',
    spacing: 2,
  }).setOrigin(0.5);
  const parts: Phaser.GameObjects.GameObject[] = [bg, txt];
  let icon: Phaser.GameObjects.Graphics | null = null;
  if (o.icon) {
    icon = scene.add.graphics();
    parts.push(icon);
  }
  const placeIcon = () => {
    if (!icon || !o.icon) return;
    const size = ghost ? 16 : 18;
    const total = size + 8 + txt.width;
    txt.setX(-total / 2 + size + 8 + txt.width / 2);
    icon.clear();
    drawIcon(icon, o.icon, -total / 2 + size / 2, 0, size, ghost ? color : 0x041016);
  };
  placeIcon();
  const hit = scene.add.zone(0, 0, w, h).setInteractive({ useHandCursor: true });
  parts.push(hit);

  const btn = scene.add.container(0, 0, parts) as Button;
  btn.setLabel = (label: string) => {
    txt.setText(label);
    placeIcon();
  };
  hit.on('pointerdown', () => {
    if (inactive(hit)) return;
    sfx.unlock();
    sfx.click();
    scene.tweens.add({ targets: btn, scale: 0.94, duration: 60, yoyo: true });
    o.onPress();
  });
  return btn;
}

/**
 * A round 44 px icon button (pause, sound, back ...). `paint` redraws it, e.g.
 * to switch between the sound and mute icons.
 */
export type IconButton = Phaser.GameObjects.Container & { setIcon(name: IconName, active?: boolean): void };

export function makeIconButton(scene: Phaser.Scene, name: IconName, onPress: () => void, color: number = palette.cyan): IconButton {
  const g = scene.add.graphics();
  const hit = scene.add.zone(0, 0, 48, 48).setInteractive({ useHandCursor: true });
  const btn = scene.add.container(0, 0, [g, hit]) as IconButton;
  btn.setIcon = (icon: IconName, active = true) => {
    g.clear();
    g.fillStyle(0x080c12, 0.72).fillCircle(0, 0, 20);
    g.lineStyle(1.5, active ? color : 0x2a3644, active ? 0.9 : 1).strokeCircle(0, 0, 20);
    drawIcon(g, icon, 0, 0, 18, active ? color : 0x6f8496);
  };
  btn.setIcon(name);
  hit.on('pointerdown', () => {
    if (inactive(hit)) return;
    sfx.unlock();
    sfx.click();
    scene.tweens.add({ targets: btn, scale: 0.9, duration: 60, yoyo: true });
    onPress();
  });
  return btn;
}

export const hexColor = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
