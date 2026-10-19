import type Phaser from 'phaser';
import { display } from '../game/display';
import { fonts } from '../game/palette';
import { RARITIES, RARITY_ORDER, SKINS, skinTexture, type Rarity } from '../game/skins';

// Everything the DUCK-O-MATIC draws, painted once into canvas textures: the
// machine, glass reels, soft light beams, glows, capsules, collection frames
// and stickers. Glows are baked with canvas shadowBlur instead of using
// Phaser filters, so the shop costs a handful of sprites per frame.

/** Machine geometry (logical px, origin at the machine's centre). */
export const M = {
  W: 300,
  H: 250,
  R: 26,
  reelW: 72,
  reelH: 128,
  reelGap: 9,
  reelY: -8,
  slotH: 56,
  marqueeY: -96,
  lcd: { x: -132, y: 66, w: 200, h: 42 },
  coin: { x: 104, y: 87 },
  bulbs: 14,
  bulbY: 118,
  pad: 30,
};
export const reelX = (r: number) => (r - 1) * (M.reelW + M.reelGap);

/** Collection tile frame: the texture's inner rect is TILE_IN of TILE_TEX pixels. */
export const TILE_TEX = 128;
export const TILE_IN = 112;

export const SHOP_TEX = {
  machine: 'shop:machine',
  glass: 'shop:glass',
  reelGlow: 'shop:reelGlow',
  payline: 'shop:payline',
  bulb: 'shop:bulb',
  beam: 'shop:beam',
  halo: 'shop:halo',
  ring: 'shop:ring',
  seam: 'shop:seam',
  capsuleBottom: 'shop:capsuleBottom',
  capsuleTop: (r: Rarity) => `shop:capsuleTop:${r}`,
  /** A whole capsule, the same size as a skin texture: the symbol on the reels' win line. */
  capsuleIcon: (r: Rarity) => `shop:capsuleIcon:${r}`,
  tile: (r: Rarity) => `shop:tile:${r}`,
  tileLocked: 'shop:tileLocked',
  tileWorn: 'shop:tileWorn',
  sticker: 'shop:new',
  knob: 'shop:knob',
  chip: 'shop:chip',
  silhouette: (id: string) => `skinsil:${id}`,
  /** Vertically smeared copy of a reel symbol for motion blur. */
  blur: (key: string) => `blur:${key}`,
};

/** Texture resolution: crisp on 3x phones, lighter on low-DPR screens. */
export const Q = Math.max(2, Math.min(3, Math.ceil(display.dpr)));

type Ctx = CanvasRenderingContext2D;

function paint(scene: Phaser.Scene, key: string, w: number, h: number, q: number, draw: (ctx: Ctx) => void) {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, Math.ceil(w * q), Math.ceil(h * q));
  if (!tex) return;
  const ctx = tex.getContext();
  ctx.save();
  ctx.scale(q, q);
  draw(ctx);
  ctx.restore();
  tex.refresh();
}

function rr(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function rgba(color: number, a: number) {
  return `rgba(${(color >> 16) & 255},${(color >> 8) & 255},${color & 255},${a})`;
}

/** Height of the home-indicator area at the bottom of an iPhone (0 elsewhere). */
export function safeBottom(): number {
  try {
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;bottom:0;padding-bottom:env(safe-area-inset-bottom,0px);visibility:hidden';
    document.body.appendChild(probe);
    const v = parseFloat(getComputedStyle(probe).paddingBottom) || 0;
    probe.remove();
    return v;
  } catch {
    return 0;
  }
}

export function ensureShopTextures(scene: Phaser.Scene) {
  paintMachine(scene);
  paintGlass(scene);
  paintGlows(scene);
  paintCapsules(scene);
  paintTiles(scene);
  paintDerived(scene);
}

function paintMachine(scene: Phaser.Scene) {
  const { W, H, pad } = M;
  paint(scene, SHOP_TEX.machine, W + pad * 2, H + pad * 2, Q, (ctx) => {
    ctx.translate(pad + W / 2, pad + H / 2);
    const x0 = -W / 2;
    const y0 = -H / 2;
    // Neon halo round the cabinet (baked: no filter at runtime).
    ctx.save();
    ctx.shadowColor = 'rgba(255,47,158,0.85)';
    ctx.shadowBlur = 24 * Q;
    rr(ctx, x0, y0, W, H, M.R);
    ctx.fillStyle = '#1a0b24';
    ctx.fill();
    ctx.restore();
    // Cabinet: deep plum lacquer with a glossy top.
    const body = ctx.createLinearGradient(0, y0, 0, y0 + H);
    body.addColorStop(0, '#45185e');
    body.addColorStop(0.3, '#2a0e3c');
    body.addColorStop(1, '#13061d');
    rr(ctx, x0, y0, W, H, M.R);
    ctx.fillStyle = body;
    ctx.fill();
    ctx.save();
    rr(ctx, x0, y0, W, H, M.R);
    ctx.clip();
    const gloss = ctx.createLinearGradient(0, y0, 0, y0 + 60);
    gloss.addColorStop(0, 'rgba(255,255,255,0.16)');
    gloss.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gloss;
    ctx.fillRect(x0, y0, W, 60);
    ctx.restore();
    // Chrome-pink rim and a gold pinstripe.
    const rim = ctx.createLinearGradient(0, y0, 0, y0 + H);
    rim.addColorStop(0, '#ffd6f0');
    rim.addColorStop(0.25, '#ff5cc0');
    rim.addColorStop(0.6, '#9a1f66');
    rim.addColorStop(1, '#ff6ac8');
    rr(ctx, x0 + 1.5, y0 + 1.5, W - 3, H - 3, M.R - 1);
    ctx.strokeStyle = rim;
    ctx.lineWidth = 3;
    ctx.stroke();
    rr(ctx, x0 + 9, y0 + 9, W - 18, H - 18, M.R - 8);
    ctx.strokeStyle = 'rgba(255,210,31,0.55)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    // Bulb sockets.
    for (let i = 0; i < M.bulbs; i++) {
      const bx = bulbX(i);
      for (const by of [-M.bulbY, M.bulbY]) {
        ctx.fillStyle = '#0d0612';
        ctx.beginPath();
        ctx.arc(bx, by, 4.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Marquee plate.
    rr(ctx, x0 + 22, M.marqueeY - 16, W - 44, 32, 12);
    const plate = ctx.createLinearGradient(0, M.marqueeY - 16, 0, M.marqueeY + 16);
    plate.addColorStop(0, '#0e0414');
    plate.addColorStop(1, '#1c0a26');
    ctx.fillStyle = plate;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,210,31,0.45)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    // Reel bay and the three windows with chrome bezels.
    rr(ctx, x0 + 14, M.reelY - M.reelH / 2 - 10, W - 28, M.reelH + 20, 16);
    ctx.fillStyle = '#08030c';
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,60,140,0.8)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    for (let r = 0; r < 3; r++) {
      const x = reelX(r) - M.reelW / 2;
      const y = M.reelY - M.reelH / 2;
      const win = ctx.createLinearGradient(0, y, 0, y + M.reelH);
      win.addColorStop(0, '#05070c');
      win.addColorStop(0.5, '#141d2b');
      win.addColorStop(1, '#05070c');
      rr(ctx, x, y, M.reelW, M.reelH, 11);
      ctx.fillStyle = win;
      ctx.fill();
      const bez = ctx.createLinearGradient(0, y, 0, y + M.reelH);
      bez.addColorStop(0, '#f0f4ff');
      bez.addColorStop(0.5, '#6a7488');
      bez.addColorStop(1, '#d8deea');
      rr(ctx, x - 1.5, y - 1.5, M.reelW + 3, M.reelH + 3, 12);
      ctx.strokeStyle = bez;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    // Win-line arrows.
    ctx.fillStyle = '#ffd21f';
    for (const s of [-1, 1]) {
      const tip = s * (reelX(2) + M.reelW / 2 + 4);
      ctx.beginPath();
      ctx.moveTo(tip, M.reelY);
      ctx.lineTo(tip + s * 9, M.reelY - 7);
      ctx.lineTo(tip + s * 9, M.reelY + 7);
      ctx.closePath();
      ctx.fill();
    }
    // LCD for the pity counters.
    const { lcd, coin } = M;
    rr(ctx, lcd.x, lcd.y, lcd.w, lcd.h, 9);
    const scr = ctx.createLinearGradient(0, lcd.y, 0, lcd.y + lcd.h);
    scr.addColorStop(0, '#060a10');
    scr.addColorStop(1, '#0c1420');
    ctx.fillStyle = scr;
    ctx.fill();
    ctx.strokeStyle = 'rgba(160,170,200,0.55)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.025)';
    for (let y = lcd.y + 3; y < lcd.y + lcd.h - 2; y += 3) ctx.fillRect(lcd.x + 3, y, lcd.w - 6, 1);
    // Coin slot plate.
    const cw = 52;
    const ch = 42;
    rr(ctx, coin.x - cw / 2, coin.y - ch / 2, cw, ch, 10);
    const chrome = ctx.createLinearGradient(0, coin.y - ch / 2, 0, coin.y + ch / 2);
    chrome.addColorStop(0, '#f4f6ff');
    chrome.addColorStop(0.45, '#8a92a8');
    chrome.addColorStop(0.55, '#5a6278');
    chrome.addColorStop(1, '#c8cede');
    ctx.fillStyle = chrome;
    ctx.fill();
    rr(ctx, coin.x - 4, coin.y - 14, 8, 28, 4);
    ctx.fillStyle = '#05030a';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 1;
    ctx.stroke();
  });
}

export const bulbX = (i: number) => -M.W / 2 + 26 + (i * (M.W - 52)) / (M.bulbs - 1);

function paintGlass(scene: Phaser.Scene) {
  const { reelW: w, reelH: h } = M;
  paint(scene, SHOP_TEX.glass, w, h, Q, (ctx) => {
    ctx.save();
    rr(ctx, 0, 0, w, h, 11);
    ctx.clip();
    // The drum curves away: dark at the top and bottom.
    const v = ctx.createLinearGradient(0, 0, 0, h);
    v.addColorStop(0, 'rgba(2,3,8,0.95)');
    v.addColorStop(0.24, 'rgba(2,3,8,0)');
    v.addColorStop(0.76, 'rgba(2,3,8,0)');
    v.addColorStop(1, 'rgba(2,3,8,0.95)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, w, h);
    // ... and at the sides.
    const s = ctx.createLinearGradient(0, 0, w, 0);
    s.addColorStop(0, 'rgba(0,0,0,0.45)');
    s.addColorStop(0.2, 'rgba(0,0,0,0)');
    s.addColorStop(0.8, 'rgba(0,0,0,0)');
    s.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = s;
    ctx.fillRect(0, 0, w, h);
    // Gloss: a soft diagonal sheen and a crisp highlight near the top.
    ctx.fillStyle = 'rgba(255,255,255,0.09)';
    ctx.beginPath();
    ctx.moveTo(0, h * 0.08);
    ctx.lineTo(w * 0.55, 0);
    ctx.lineTo(w, 0);
    ctx.lineTo(w, h * 0.04);
    ctx.lineTo(0, h * 0.42);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(8, 7);
    ctx.quadraticCurveTo(w / 2, 3, w - 8, 7);
    ctx.stroke();
    ctx.restore();
    // Inner shadow along the bezel.
    ctx.save();
    rr(ctx, 0, 0, w, h, 11);
    ctx.clip();
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur = 6 * Q;
    rr(ctx, -6, -6, w + 12, h + 12, 16);
    ctx.lineWidth = 12;
    ctx.strokeStyle = '#000';
    ctx.stroke();
    ctx.restore();
  });
  // Soft glow round a reel window: flashes gold when that reel stops.
  const g = 18;
  paint(scene, SHOP_TEX.reelGlow, w + g * 2, h + g * 2, 2, (ctx) => {
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 12 * 2;
    rr(ctx, g, g, w, h, 11);
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
  });
}

function paintGlows(scene: Phaser.Scene) {
  // Win line: a bright core with a soft halo that fades at both ends.
  paint(scene, SHOP_TEX.payline, 260, 40, 2, (ctx) => {
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 10 * 2;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(14, 18.5, 232, 3);
    ctx.shadowBlur = 0;
    ctx.globalCompositeOperation = 'destination-in';
    const f = ctx.createLinearGradient(0, 0, 260, 0);
    f.addColorStop(0, 'rgba(0,0,0,0)');
    f.addColorStop(0.12, 'rgba(0,0,0,1)');
    f.addColorStop(0.88, 'rgba(0,0,0,1)');
    f.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = f;
    ctx.fillRect(0, 0, 260, 40);
  });
  paint(scene, SHOP_TEX.bulb, 20, 20, 2, (ctx) => {
    const g = ctx.createRadialGradient(10, 10, 0, 10, 10, 10);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.3, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 20, 20);
  });
  // A soft light beam: narrow at the bottom (origin), wide and faded at the
  // top. The blur is a shadow cast from a shape drawn off-canvas, which works
  // on every browser (ctx.filter doesn't on Safari).
  const bw = 90;
  const bh = 420;
  paint(scene, SHOP_TEX.beam, bw, bh, 1, (ctx) => {
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 16;
    ctx.shadowOffsetX = 1000;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(bw / 2 - 2 - 1000, bh);
    ctx.lineTo(bw * 0.2 - 1000, 10);
    ctx.lineTo(bw * 0.8 - 1000, 10);
    ctx.lineTo(bw / 2 + 2 - 1000, bh);
    ctx.closePath();
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.globalCompositeOperation = 'destination-in';
    const f = ctx.createLinearGradient(0, 0, 0, bh);
    f.addColorStop(0, 'rgba(0,0,0,0)');
    f.addColorStop(0.45, 'rgba(0,0,0,0.55)');
    f.addColorStop(0.9, 'rgba(0,0,0,1)');
    f.addColorStop(1, 'rgba(0,0,0,0.6)');
    ctx.fillStyle = f;
    ctx.fillRect(0, 0, bw, bh);
  });
  paint(scene, SHOP_TEX.halo, 256, 256, 1, (ctx) => {
    const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.2, 'rgba(255,255,255,0.6)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.18)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
  });
  paint(scene, SHOP_TEX.ring, 256, 256, 1, (ctx) => {
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 14;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(128, 128, 104, 0, Math.PI * 2);
    ctx.stroke();
  });
  // Light leaking out of the capsule's seam.
  paint(scene, SHOP_TEX.seam, 160, 40, 2, (ctx) => {
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 9 * 2;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(80, 20, 62, 3, 0, 0, Math.PI * 2);
    ctx.fill();
  });
  // The lever's knob.
  paint(scene, SHOP_TEX.knob, 30, 30, Q, (ctx) => {
    const g = ctx.createRadialGradient(11, 10, 1, 15, 15, 14);
    g.addColorStop(0, '#ffd0dc');
    g.addColorStop(0.35, '#ff3a64');
    g.addColorStop(1, '#8a0a2a');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(15, 15, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath();
    ctx.ellipse(10.5, 9, 4, 2.5, -0.6, 0, Math.PI * 2);
    ctx.fill();
  });
  // Balance chip.
  paint(scene, SHOP_TEX.chip, 104, 32, Q, (ctx) => {
    rr(ctx, 1, 1, 102, 30, 15);
    ctx.fillStyle = 'rgba(28,20,4,0.92)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,210,31,0.75)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  });
}

const CAPSULE_COLORS: Record<Rarity, [string, string, string]> = {
  common: ['#eef4fa', '#9fb3c8', '#4a5a6c'],
  rare: ['#e6fdff', '#2be8ff', '#0a6f8a'],
  epic: ['#f2e6ff', '#b36bff', '#4a1a8a'],
  legendary: ['#fffbe0', '#ffd21f', '#9a6a00'],
};

function capsuleHalf(ctx: Ctx, cx: number, cy: number, r: number, top: boolean, colors: [string, string, string]) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, top ? Math.PI : 0, top ? Math.PI * 2 : Math.PI);
  ctx.closePath();
  ctx.clip();
  const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.45, r * 0.05, cx, cy, r * 1.05);
  g.addColorStop(0, colors[0]);
  g.addColorStop(0.45, colors[1]);
  g.addColorStop(1, colors[2]);
  ctx.fillStyle = g;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  if (top) {
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath();
    ctx.ellipse(cx - r * 0.38, cy - r * 0.55, r * 0.26, r * 0.13, -0.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function paintCapsules(scene: Phaser.Scene) {
  const r = 46;
  const w = 104;
  const bottom: [string, string, string] = ['#ffffff', '#dfe6f0', '#7a8698'];
  paint(scene, SHOP_TEX.capsuleBottom, w, 56, Q, (ctx) => {
    capsuleHalf(ctx, w / 2, 4, r, false, bottom);
    ctx.fillStyle = 'rgba(20,24,34,0.55)';
    ctx.fillRect(w / 2 - r, 3, r * 2, 4);
  });
  for (const rarity of RARITY_ORDER) {
    const colors = CAPSULE_COLORS[rarity];
    paint(scene, SHOP_TEX.capsuleTop(rarity), w, 56, Q, (ctx) => {
      capsuleHalf(ctx, w / 2, 52, r, true, colors);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(w / 2 - r, 49, r * 2, 3);
    });
    // Reel symbol: a closed capsule with a question mark, 128 px like a skin.
    paint(scene, SHOP_TEX.capsuleIcon(rarity), 128, 128, 1, (ctx) => {
      ctx.save();
      ctx.shadowColor = rgba(RARITIES[rarity].color, 0.9);
      ctx.shadowBlur = 16;
      ctx.fillStyle = rgba(RARITIES[rarity].color, 0.5);
      ctx.beginPath();
      ctx.arc(64, 64, 42, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      capsuleHalf(ctx, 64, 64, 44, true, colors);
      capsuleHalf(ctx, 64, 64, 44, false, bottom);
      ctx.fillStyle = 'rgba(20,24,34,0.6)';
      ctx.fillRect(20, 62, 88, 4);
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      ctx.lineWidth = 4;
      ctx.font = `700 34px ${fonts.display}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.strokeText('?', 64, 44);
      ctx.fillText('?', 64, 44);
    });
  }
}

function paintTiles(scene: Phaser.Scene) {
  const o = (TILE_TEX - TILE_IN) / 2;
  const rad = 24;
  for (const rarity of RARITY_ORDER) {
    const c = RARITIES[rarity].color;
    paint(scene, SHOP_TEX.tile(rarity), TILE_TEX, TILE_TEX, 1, (ctx) => {
      if (rarity === 'epic' || rarity === 'legendary') {
        ctx.save();
        ctx.shadowColor = rgba(c, 0.9);
        ctx.shadowBlur = 10;
        rr(ctx, o, o, TILE_IN, TILE_IN, rad);
        ctx.fillStyle = rgba(c, 0.6);
        ctx.fill();
        ctx.restore();
      }
      rr(ctx, o, o, TILE_IN, TILE_IN, rad);
      ctx.fillStyle = '#0a0f16';
      ctx.fill();
      const f = ctx.createLinearGradient(0, o, 0, o + TILE_IN);
      f.addColorStop(0, rgba(c, 0.34));
      f.addColorStop(1, rgba(c, 0.07));
      ctx.fillStyle = f;
      ctx.fill();
      ctx.lineWidth = rarity === 'legendary' ? 6 : 4.5;
      if (rarity === 'legendary') {
        const g = ctx.createLinearGradient(o, o, o + TILE_IN, o + TILE_IN);
        g.addColorStop(0, '#fff6b0');
        g.addColorStop(0.45, '#ffd21f');
        g.addColorStop(0.7, '#b8860b');
        g.addColorStop(1, '#ffe680');
        ctx.strokeStyle = g;
      } else ctx.strokeStyle = rgba(c, 1);
      rr(ctx, o + 2, o + 2, TILE_IN - 4, TILE_IN - 4, rad - 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(o + rad, o + 8);
      ctx.lineTo(o + TILE_IN - rad, o + 8);
      ctx.stroke();
    });
  }
  // Not found yet: dark glass, a faint border (tinted per rarity at runtime).
  paint(scene, SHOP_TEX.tileLocked, TILE_TEX, TILE_TEX, 1, (ctx) => {
    rr(ctx, o, o, TILE_IN, TILE_IN, rad);
    ctx.fillStyle = 'rgba(16,20,28,0.92)';
    ctx.fill();
    rr(ctx, o + 2, o + 2, TILE_IN - 4, TILE_IN - 4, rad - 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.setLineDash([6, 7]);
    rr(ctx, o + 10, o + 10, TILE_IN - 20, TILE_IN - 20, rad - 9);
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 2;
    ctx.stroke();
  });
  // The skin you wear: a glowing ring behind its tile.
  paint(scene, SHOP_TEX.tileWorn, TILE_TEX, TILE_TEX, 1, (ctx) => {
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 12;
    rr(ctx, o - 3, o - 3, TILE_IN + 6, TILE_IN + 6, rad + 3);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 5;
    ctx.stroke();
  });
  // "NEW!" sticker.
  paint(scene, SHOP_TEX.sticker, 52, 26, Q, (ctx) => {
    rr(ctx, 2, 2, 48, 22, 11);
    const g = ctx.createLinearGradient(0, 2, 0, 24);
    g.addColorStop(0, '#ff5c7a');
    g.addColorStop(1, '#e0103a');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 13px ${fonts.display}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('NEW!', 26, 14);
  });
}

/** Silhouettes (for skins not found yet) and motion-blurred reel symbols. */
function paintDerived(scene: Phaser.Scene) {
  const reelSymbols = [...SKINS.map((s) => skinTexture(s.id)), ...RARITY_ORDER.map((r) => SHOP_TEX.capsuleIcon(r))];
  for (const skin of SKINS) {
    const src = scene.textures.exists(skinTexture(skin.id)) ? scene.textures.get(skinTexture(skin.id)).getSourceImage() : null;
    if (!src) continue;
    paint(scene, SHOP_TEX.silhouette(skin.id), 128, 128, 1, (ctx) => {
      ctx.drawImage(src as CanvasImageSource, 0, 0, 128, 128);
      ctx.globalCompositeOperation = 'source-in';
      const g = ctx.createLinearGradient(0, 16, 0, 112);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(1, '#8a8a8a');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 128, 128);
    });
  }
  // Half resolution and taller: several faint copies stacked vertically.
  for (const key of reelSymbols) {
    if (!scene.textures.exists(key)) continue;
    const src = scene.textures.get(key).getSourceImage() as CanvasImageSource;
    paint(scene, SHOP_TEX.blur(key), 64, 104, 1, (ctx) => {
      const n = 9;
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        ctx.globalAlpha = 0.16 + 0.22 * Math.sin(t * Math.PI);
        ctx.drawImage(src, 0, t * 40, 64, 64);
      }
    });
  }
}
