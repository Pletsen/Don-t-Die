import type Phaser from 'phaser';
import { display } from '../game/display';
import { fonts } from '../game/palette';

/**
 * Glowing bitmap fonts, painted once at boot.
 *
 * A normal Phaser Text is a little canvas: every time the number changes it
 * is redrawn and uploaded to the GPU again, which on a phone costs real time
 * when it happens many times a second (the HUD distance, the frenzy counter,
 * the death score counting up). A BitmapText instead just picks letters out
 * of one shared texture, so changing it is practically free.
 *
 * The glyphs are painted with the real web font, its glow included, at the
 * screen's pixel density, so they look exactly like the Text they replace.
 */
export interface GlowFontOpts {
  size: number;
  family?: 'display' | 'mono';
  weight?: string;
  color?: string;
  /** Glow colour, or none. */
  glow?: string;
  glowBlur?: number;
  chars?: string;
}

const DEFAULT_CHARS = ' 0123456789.,:;+-x×/%!?\'"#()ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function makeGlowFont(scene: Phaser.Scene, key: string, o: GlowFontOpts) {
  if (scene.cache.bitmapFont.exists(key)) return;
  const S = display.dpr;
  const size = Math.round(o.size * S);
  const blur = (o.glowBlur ?? 14) * S;
  const pad = o.glow ? Math.ceil(blur * 1.1) : Math.ceil(2 * S);
  const chars = o.chars ?? DEFAULT_CHARS;
  const font = `${o.weight ?? (o.family === 'mono' ? '500' : '700')} ${size}px ${o.family === 'mono' ? fonts.mono : fonts.display}`;

  // Measure every glyph.
  const probe = document.createElement('canvas').getContext('2d')!;
  probe.font = font;
  const lineH = Math.ceil(size * 1.25);
  const cellH = lineH + pad * 2;
  const maxW = 1024;
  type Cell = { ch: string; adv: number; w: number; x: number; y: number };
  const cells: Cell[] = [];
  let x = 0;
  let y = 0;
  for (const ch of chars) {
    const adv = Math.ceil(probe.measureText(ch).width);
    const w = adv + pad * 2;
    if (x + w > maxW) {
      x = 0;
      y += cellH;
    }
    cells.push({ ch, adv, w, x, y });
    x += w;
  }
  const texW = maxW;
  const texH = y + cellH;
  const texKey = `${key}__tex`;
  const tex = scene.textures.createCanvas(texKey, texW, texH);
  if (!tex) return;
  const ctx = tex.getContext();
  ctx.font = font;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = o.color ?? '#ffffff';
  const baseline = pad + Math.round(size * 0.98);
  for (const c of cells) {
    if (o.glow) {
      ctx.shadowColor = o.glow;
      ctx.shadowBlur = blur;
    }
    ctx.fillText(c.ch, c.x + pad, c.y + baseline);
    // A second pass without shadow keeps the letters crisp on top of their glow.
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
    ctx.fillText(c.ch, c.x + pad, c.y + baseline);
  }
  tex.refresh();

  const data: Phaser.Types.GameObjects.BitmapText.BitmapFontData = {
    font: key,
    size,
    lineHeight: lineH,
    retroFont: false,
    chars: {},
  };
  // (Phaser's types leave out xAdvance, which the renderer does use.)
  const glyphs = data.chars as Record<number, object>;
  for (const c of cells) {
    glyphs[c.ch.charCodeAt(0)] = {
      x: c.x,
      y: c.y,
      width: c.w,
      height: cellH,
      centerX: Math.floor(c.w / 2),
      centerY: Math.floor(cellH / 2),
      xOffset: -pad,
      yOffset: -pad,
      xAdvance: c.adv,
      data: {},
      kerning: {},
      u0: c.x / texW,
      v0: 1 - c.y / texH,
      u1: (c.x + c.w) / texW,
      v1: 1 - (c.y + cellH) / texH,
    };
  }
  scene.cache.bitmapFont.add(key, { data, texture: texKey, frame: null });
}

/** A BitmapText in CSS pixels (the font is painted at the screen's density). */
export function glowText(scene: Phaser.Scene, x: number, y: number, key: string, text: string, size: number) {
  return scene.add.bitmapText(x, y, key, text, size);
}
