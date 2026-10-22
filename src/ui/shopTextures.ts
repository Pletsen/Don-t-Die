import type Phaser from 'phaser';
import { display } from '../game/display';
import { fonts } from '../game/palette';
import { RARITIES, RARITY_ORDER, SKINS, skinTexture, type Rarity } from '../game/skins';

// Everything the QUACK REACTOR draws, painted once into canvas textures: the
// bay with its fuel counter and core gauge, the reactor housing, spinning
// rings and armour petals, the conveyor belt, the energy shell, its cracks and
// lightning, smoke, light beams, glows, collection frames and stickers. Glows
// are baked with canvas shadowBlur instead of using Phaser filters, so the
// show costs a few dozen pooled sprites per frame.

/** Bay geometry (logical px, origin at the bay's centre). */
export const BAY = {
  W: 350,
  H: 284,
  R: 22,
  pad: 26,
  /** The reactor's centre. */
  core: { x: 52, y: -26 },
  housingR: 104,
  ringOuterR: 85,
  ringInnerR: 71,
  chamberR: 58,
  petalR: 55,
  lampR: 97,
  /** Steam vents on top of the housing (angles in degrees, 0 = right, 90 = down). */
  vents: [236, 304],
  /** Lamps round the housing (degrees), leaving room for the vents. */
  lamps: [0, 30, 60, 90, 120, 150, 180, 210, 270, 330],
  /** Fuel counter LCD. */
  counter: { x: -165, y: -128, w: 92, h: 58 },
  /** Core temperature gauge. */
  dial: { x: -118, y: 8, r: 32 },
  /** The conveyor: ducks walk on y = beltY from beltX0 into the intake at mouthX. */
  beltY: 104,
  beltX0: -170,
  mouthX: -70,
  /** Pity read-out along the bottom. */
  strip: { x: -165, y: 114, w: 330, h: 23 },
};

/** Gauge needle angle (radians) for a charge of 0..1: from lower left over the top to lower right. */
export const dialAngle = (k: number) => ((200 + 140 * Math.max(0, Math.min(1, k))) * Math.PI) / 180;

/** Collection tile frame: the texture's inner rect is TILE_IN of TILE_TEX pixels. */
export const TILE_TEX = 128;
export const TILE_IN = 112;

/** Energy shell texture: SHELL_TEX px wide, the bright rim at radius SHELL_R. */
export const SHELL_TEX = 200;
export const SHELL_R = 88;
/** Lightning arcs are painted round a circle of this radius (texture centre = circle centre). */
export const BOLT_R = 94;
export const BOLT_ARCS = 4;
export const BOLT_STRIKES = 2;
/** Lid lightning variants. */
export const ZAPS = 4;

export const SHOP_TEX = {
  bay: 'shop:bay',
  housing: 'shop:housing',
  ringOuter: 'shop:ringOuter',
  ringInner: 'shop:ringInner',
  petal: 'shop:petal',
  seams: 'shop:seams',
  lamp: 'shop:lamp',
  belt: 'shop:belt',
  mouth: 'shop:mouth',
  needle: 'shop:needle',
  shell: 'shop:shell',
  cracks: 'shop:cracks',
  /** Jagged arc hugging a circle of BOLT_R (rotate it round the shell). */
  boltArc: (i: number) => `shop:boltArc:${i}`,
  /** Jagged strike from the shell outwards (origin at the shell's centre). */
  boltStrike: (i: number) => `shop:boltStrike:${i}`,
  smoke: 'shop:smoke',
  beam: 'shop:beam',
  halo: 'shop:halo',
  ring: 'shop:ring',
  /** Lightning from the core out over the lid to the rim (origin at the core). */
  zap: (i: number) => `shop:zap:${i}`,
  /** Glow round the screen's edges (stretched to the screen). */
  edge: 'shop:edge',
  /** Spiral energy swirling inside the shell. */
  swirl: 'shop:swirl',
  /** A four-pointed star glint. */
  flare: 'shop:flare',
  /** A thick soft shockwave (the blast). */
  wave: 'shop:wave',
  tile: (r: Rarity) => `shop:tile:${r}`,
  tileLocked: 'shop:tileLocked',
  tileWorn: 'shop:tileWorn',
  sticker: 'shop:new',
  chip: 'shop:chip',
  silhouette: (id: string) => `skinsil:${id}`,
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

/** Small seeded random, so baked art (cracks, lightning) looks the same every boot. */
function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
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
  paintBay(scene);
  paintReactor(scene);
  paintShell(scene);
  paintLightning(scene);
  paintGlows(scene);
  paintTiles(scene);
  paintSilhouettes(scene);
}

const NEON = 'rgba(255,47,158,0.85)';

function paintBay(scene: Phaser.Scene) {
  const { W, H, pad } = BAY;
  paint(scene, SHOP_TEX.bay, W + pad * 2, H + pad * 2, Q, (ctx) => {
    ctx.translate(pad + W / 2, pad + H / 2);
    const x0 = -W / 2;
    const y0 = -H / 2;
    // Neon halo round the bay (baked: no filter at runtime).
    ctx.save();
    ctx.shadowColor = NEON;
    ctx.shadowBlur = 22 * Q;
    rr(ctx, x0, y0, W, H, BAY.R);
    ctx.fillStyle = '#0a0f1a';
    ctx.fill();
    ctx.restore();
    // Blue steel with a faint hex floor.
    const body = ctx.createLinearGradient(0, y0, 0, y0 + H);
    body.addColorStop(0, '#16213a');
    body.addColorStop(0.45, '#0c1324');
    body.addColorStop(1, '#070b14');
    rr(ctx, x0, y0, W, H, BAY.R);
    ctx.fillStyle = body;
    ctx.fill();
    ctx.save();
    rr(ctx, x0, y0, W, H, BAY.R);
    ctx.clip();
    ctx.strokeStyle = 'rgba(120,160,255,0.07)';
    ctx.lineWidth = 1;
    const hr = 11;
    const hw = hr * Math.sqrt(3);
    for (let row = 0, y = y0; y < y0 + H + hr; row++, y += hr * 1.5) {
      for (let x = x0 - hw + (row % 2) * (hw / 2); x < x0 + W + hw; x += hw) {
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = Math.PI / 6 + (k * Math.PI) / 3;
          ctx.lineTo(x + Math.cos(a) * hr, y + Math.sin(a) * hr);
        }
        ctx.closePath();
        ctx.stroke();
      }
    }
    const gloss = ctx.createLinearGradient(0, y0, 0, y0 + 70);
    gloss.addColorStop(0, 'rgba(255,255,255,0.1)');
    gloss.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gloss;
    ctx.fillRect(x0, y0, W, 70);
    ctx.restore();
    // Rim: magenta chrome and an inner pinstripe.
    const rim = ctx.createLinearGradient(0, y0, 0, y0 + H);
    rim.addColorStop(0, '#ffd6f0');
    rim.addColorStop(0.3, '#ff5cc0');
    rim.addColorStop(0.65, '#8a1f66');
    rim.addColorStop(1, '#ff6ac8');
    rr(ctx, x0 + 1.5, y0 + 1.5, W - 3, H - 3, BAY.R - 1);
    ctx.strokeStyle = rim;
    ctx.lineWidth = 3;
    ctx.stroke();
    rr(ctx, x0 + 8, y0 + 8, W - 16, H - 16, BAY.R - 7);
    ctx.strokeStyle = 'rgba(255,47,158,0.28)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Fuel counter LCD.
    const c = BAY.counter;
    lcd(ctx, c.x, c.y, c.w, c.h, 10);

    // Core temperature gauge: green, amber and red zones over the top.
    const d = BAY.dial;
    ctx.save();
    ctx.beginPath();
    ctx.arc(d.x, d.y, d.r + 6, Math.PI * 1.03, Math.PI * 1.97);
    ctx.lineTo(d.x + d.r * 0.5, d.y + 7);
    ctx.lineTo(d.x - d.r * 0.5, d.y + 7);
    ctx.closePath();
    ctx.fillStyle = '#05080e';
    ctx.fill();
    ctx.strokeStyle = 'rgba(160,170,200,0.5)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
    const zones: [number, number, string][] = [
      [0, 0.5, '#3dff8a'],
      [0.5, 0.78, '#ffd21f'],
      [0.78, 1, '#ff2d55'],
    ];
    ctx.lineWidth = 4;
    for (const [a, b, col] of zones) {
      ctx.strokeStyle = col;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r - 3, dialAngle(a) + 0.02, dialAngle(b) - 0.02);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(234,246,255,0.5)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 10; i++) {
      const a = dialAngle(i / 10);
      const r0 = i % 5 === 0 ? d.r - 14 : d.r - 10;
      ctx.beginPath();
      ctx.moveTo(d.x + Math.cos(a) * r0, d.y + Math.sin(a) * r0);
      ctx.lineTo(d.x + Math.cos(a) * (d.r - 7), d.y + Math.sin(a) * (d.r - 7));
      ctx.stroke();
    }

    // Intake duct and the reactor's pedestal.
    const { beltY, mouthX, core } = BAY;
    const top = beltY - 30;
    const duct = ctx.createLinearGradient(0, top, 0, beltY);
    duct.addColorStop(0, '#3a4766');
    duct.addColorStop(0.5, '#1d263a');
    duct.addColorStop(1, '#0d1220');
    rr(ctx, mouthX, top, core.x - mouthX, beltY - top + 2, 6);
    ctx.fillStyle = duct;
    ctx.fill();
    ctx.strokeStyle = 'rgba(160,180,220,0.45)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(core.x - 76, beltY - 44);
    ctx.lineTo(core.x + 76, beltY - 44);
    ctx.lineTo(core.x + 98, beltY + 4);
    ctx.lineTo(core.x - 98, beltY + 4);
    ctx.closePath();
    const ped = ctx.createLinearGradient(0, beltY - 44, 0, beltY + 4);
    ped.addColorStop(0, '#2c3854');
    ped.addColorStop(1, '#0c111d');
    ctx.fillStyle = ped;
    ctx.fill();
    ctx.stroke();
    // Hazard stripes along the pedestal's foot.
    ctx.save();
    ctx.beginPath();
    ctx.rect(core.x - 96, beltY - 6, 192, 7);
    ctx.clip();
    ctx.fillStyle = '#ffd21f';
    ctx.fillRect(core.x - 96, beltY - 6, 192, 7);
    ctx.fillStyle = '#141414';
    for (let x = core.x - 108; x < core.x + 102; x += 12) {
      ctx.beginPath();
      ctx.moveTo(x, beltY + 1);
      ctx.lineTo(x + 6, beltY - 6);
      ctx.lineTo(x + 12, beltY - 6);
      ctx.lineTo(x + 6, beltY + 1);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    // The intake mouth: a dark hole with a glowing lip (the front lip is a sprite over the ducks).
    rr(ctx, mouthX, top + 3, 16, beltY - top - 3, 4);
    const hole = ctx.createLinearGradient(mouthX, 0, mouthX + 16, 0);
    hole.addColorStop(0, '#020306');
    hole.addColorStop(1, '#14061a');
    ctx.fillStyle = hole;
    ctx.fill();
    // Belt bed with rollers under the moving belt.
    rr(ctx, BAY.beltX0 - 3, beltY - 1, mouthX - BAY.beltX0 + 6, 10, 4);
    ctx.fillStyle = '#0a0d14';
    ctx.fill();
    ctx.strokeStyle = 'rgba(160,180,220,0.35)';
    ctx.stroke();
    for (let x = BAY.beltX0 + 6; x < mouthX; x += 16) {
      ctx.fillStyle = '#3a4560';
      ctx.beginPath();
      ctx.arc(x, beltY + 7, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Pity read-out strip.
    const s = BAY.strip;
    lcd(ctx, s.x, s.y, s.w, s.h, 8);
  });
}

/** A dark LCD panel with scanlines. */
function lcd(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  rr(ctx, x, y, w, h, r);
  const scr = ctx.createLinearGradient(0, y, 0, y + h);
  scr.addColorStop(0, '#04070c');
  scr.addColorStop(1, '#0b1320');
  ctx.fillStyle = scr;
  ctx.fill();
  ctx.strokeStyle = 'rgba(160,170,200,0.5)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.025)';
  for (let yy = y + 3; yy < y + h - 2; yy += 3) ctx.fillRect(x + 3, yy, w - 6, 1);
}

function paintReactor(scene: Phaser.Scene) {
  const R = BAY.housingR;
  const pad = 22;
  const S = (R + pad) * 2;
  paint(scene, SHOP_TEX.housing, S, S, Q, (ctx) => {
    ctx.translate(S / 2, S / 2);
    // Vent chimneys (behind the body).
    for (const deg of BAY.vents) {
      ctx.save();
      ctx.rotate((deg * Math.PI) / 180);
      rr(ctx, R - 14, -8, 26, 16, 4);
      const v = ctx.createLinearGradient(0, -8, 0, 8);
      v.addColorStop(0, '#5a6680');
      v.addColorStop(1, '#1a2132');
      ctx.fillStyle = v;
      ctx.fill();
      ctx.fillStyle = '#05070c';
      ctx.fillRect(R + 7, -5, 4, 10);
      ctx.restore();
    }
    // Neon halo and the steel body.
    ctx.save();
    ctx.shadowColor = NEON;
    ctx.shadowBlur = 16 * Q;
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.fillStyle = '#1a2234';
    ctx.fill();
    ctx.restore();
    const body = ctx.createRadialGradient(-R * 0.35, -R * 0.45, R * 0.1, 0, 0, R);
    body.addColorStop(0, '#56627e');
    body.addColorStop(0.55, '#2a3348');
    body.addColorStop(1, '#141a28');
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.fillStyle = body;
    ctx.fill();
    const rim = ctx.createLinearGradient(0, -R, 0, R);
    rim.addColorStop(0, '#ffd6f0');
    rim.addColorStop(0.4, '#ff5cc0');
    rim.addColorStop(1, '#7a1a5a');
    ctx.strokeStyle = rim;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    // Lamp sockets.
    for (const deg of BAY.lamps) {
      const a = (deg * Math.PI) / 180;
      ctx.fillStyle = '#07090f';
      ctx.beginPath();
      ctx.arc(Math.cos(a) * BAY.lampR, Math.sin(a) * BAY.lampR, 3.6, 0, Math.PI * 2);
      ctx.fill();
    }
    // The ring track: a dark channel the rings spin in.
    ctx.beginPath();
    ctx.arc(0, 0, BAY.ringOuterR + 6, 0, Math.PI * 2);
    ctx.arc(0, 0, BAY.chamberR + 1, 0, Math.PI * 2, true);
    ctx.fillStyle = '#060912';
    ctx.fill();
    ctx.strokeStyle = 'rgba(160,180,220,0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, BAY.ringOuterR + 6, 0, Math.PI * 2);
    ctx.stroke();
    // Core chamber: deep glass the energy glows in.
    const ch = ctx.createRadialGradient(0, 0, 0, 0, 0, BAY.chamberR);
    ch.addColorStop(0, '#1a0a1e');
    ch.addColorStop(1, '#05030a');
    ctx.beginPath();
    ctx.arc(0, 0, BAY.chamberR, 0, Math.PI * 2);
    ctx.fillStyle = ch;
    ctx.fill();
    const bez = ctx.createLinearGradient(0, -BAY.chamberR, 0, BAY.chamberR);
    bez.addColorStop(0, '#f0f4ff');
    bez.addColorStop(0.5, '#6a7488');
    bez.addColorStop(1, '#d8deea');
    ctx.strokeStyle = bez;
    ctx.lineWidth = 2.5;
    ctx.stroke();
  });

  // Rings: white line art, tinted and blended additively at runtime.
  const ringTex = (key: string, r: number, draw: (ctx: Ctx) => void) => {
    const s = (r + 10) * 2;
    paint(scene, key, s, s, 2, (ctx) => {
      ctx.translate(s / 2, s / 2);
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 5 * 2;
      ctx.strokeStyle = '#ffffff';
      ctx.fillStyle = '#ffffff';
      ctx.lineCap = 'round';
      draw(ctx);
    });
  };
  ringTex(SHOP_TEX.ringOuter, BAY.ringOuterR, (ctx) => {
    const n = 12;
    ctx.lineWidth = 3.2;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(0, 0, BAY.ringOuterR, a + 0.07, a + (Math.PI * 2) / n - 0.07);
      ctx.stroke();
    }
  });
  ringTex(SHOP_TEX.ringInner, BAY.ringInnerR, (ctx) => {
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(0, 0, BAY.ringInnerR, a, a + 1.5);
      ctx.stroke();
      // A bright dot leading each arc.
      ctx.beginPath();
      ctx.arc(Math.cos(a + 1.5) * BAY.ringInnerR, Math.sin(a + 1.5) * BAY.ringInnerR, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.lineWidth = 1;
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * (BAY.ringInnerR - 5), Math.sin(a) * (BAY.ringInnerR - 5));
      ctx.lineTo(Math.cos(a) * (BAY.ringInnerR - 2), Math.sin(a) * (BAY.ringInnerR - 2));
      ctx.stroke();
    }
  });

  // Armour petal: a quarter of the core's lid, pointing right from the
  // centre (origin at x = 0). Four of them, turned 90 degrees apart, close
  // the core; the reactor blows them off when it bursts.
  const pr = BAY.petalR;
  paint(scene, SHOP_TEX.petal, pr + 2, pr * 1.5, Q, (ctx) => {
    ctx.translate(0, (pr * 1.5) / 2);
    const gap = 1.6;
    ctx.beginPath();
    ctx.moveTo(gap * 1.5, 0);
    ctx.arc(0, 0, pr, -Math.PI / 4 + gap / pr, Math.PI / 4 - gap / pr);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, -pr / 2, pr, pr / 2);
    g.addColorStop(0, '#7a86a4');
    g.addColorStop(0.5, '#3a4560');
    g.addColorStop(1, '#1c2436');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(220,230,255,0.55)';
    ctx.lineWidth = 1;
    ctx.stroke();
    // A hazard chevron and a rivet.
    ctx.save();
    ctx.clip();
    ctx.fillStyle = '#ffd21f';
    ctx.beginPath();
    ctx.arc(0, 0, pr - 3, -0.42, 0.42);
    ctx.arc(0, 0, pr - 9, 0.42, -0.42, true);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#141414';
    for (let k = -2; k <= 2; k++) {
      const a = k * 0.17;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a - 0.04) * (pr - 2), Math.sin(a - 0.04) * (pr - 2));
      ctx.lineTo(Math.cos(a + 0.05) * (pr - 2), Math.sin(a + 0.05) * (pr - 2));
      ctx.lineTo(Math.cos(a - 0.02) * (pr - 10), Math.sin(a - 0.02) * (pr - 10));
      ctx.lineTo(Math.cos(a - 0.11) * (pr - 10), Math.sin(a - 0.11) * (pr - 10));
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    ctx.fillStyle = '#c8d0e4';
    ctx.beginPath();
    ctx.arc(pr * 0.5, 0, 2.2, 0, Math.PI * 2);
    ctx.fill();
  });
  // Energy leaking through the seams between the petals: an X with a hot centre.
  const ss = (BAY.petalR + 10) * 2;
  paint(scene, SHOP_TEX.seams, ss, ss, 2, (ctx) => {
    ctx.translate(ss / 2, ss / 2);
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 7 * 2;
    ctx.strokeStyle = '#ffffff';
    ctx.lineCap = 'round';
    ctx.lineWidth = 2.6;
    const l = BAY.petalR - 1;
    for (const a of [Math.PI / 4, -Math.PI / 4]) {
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * -l, Math.sin(a) * -l);
      ctx.lineTo(Math.cos(a) * l, Math.sin(a) * l);
      ctx.stroke();
    }
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 0, 6, 0, Math.PI * 2);
    ctx.fill();
  });
  // Bulb.
  paint(scene, SHOP_TEX.lamp, 20, 20, 2, (ctx) => {
    const g = ctx.createRadialGradient(10, 10, 0, 10, 10, 10);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.3, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 20, 20);
  });
  // Conveyor belt tile (scrolled sideways at runtime).
  paint(scene, SHOP_TEX.belt, 16, 7, Q, (ctx) => {
    ctx.fillStyle = '#1e2638';
    ctx.fillRect(0, 0, 16, 7);
    ctx.fillStyle = '#3c4864';
    ctx.fillRect(0, 0, 3, 7);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(0, 0, 16, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, 6, 16, 1);
  });
  // The intake's front lip, drawn over the ducks as they walk in.
  paint(scene, SHOP_TEX.mouth, 12, 36, Q, (ctx) => {
    ctx.save();
    ctx.shadowColor = NEON;
    ctx.shadowBlur = 5 * Q;
    rr(ctx, 3, 2, 5, 32, 2.5);
    ctx.fillStyle = '#ff5cc0';
    ctx.fill();
    ctx.restore();
    rr(ctx, 4, 3, 2, 30, 1);
    ctx.fillStyle = '#ffd6f0';
    ctx.fill();
  });
  // Gauge needle: origin at the pivot (x = 5).
  paint(scene, SHOP_TEX.needle, 36, 10, Q, (ctx) => {
    ctx.fillStyle = '#ff3b4e';
    ctx.beginPath();
    ctx.moveTo(5, 2.5);
    ctx.lineTo(34, 5);
    ctx.lineTo(5, 7.5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#eaf6ff';
    ctx.beginPath();
    ctx.arc(5, 5, 4, 0, Math.PI * 2);
    ctx.fill();
  });
}

function paintShell(scene: Phaser.Scene) {
  const S = SHELL_TEX;
  const c = S / 2;
  // Energy shell: a glass-like bubble, almost clear inside with a bright rim
  // and a faint honeycomb. White: tinted per rarity.
  paint(scene, SHOP_TEX.shell, S, S, 2, (ctx) => {
    const g = ctx.createRadialGradient(c, c, 0, c, c, SHELL_R + 8);
    g.addColorStop(0, 'rgba(255,255,255,0.05)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.1)');
    g.addColorStop(0.82, 'rgba(255,255,255,0.32)');
    g.addColorStop(0.92, 'rgba(255,255,255,1)');
    g.addColorStop(0.97, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
    ctx.save();
    ctx.beginPath();
    ctx.arc(c, c, SHELL_R - 3, 0, Math.PI * 2);
    ctx.clip();
    const hr = 13;
    const hw = hr * Math.sqrt(3);
    ctx.lineWidth = 1.2;
    for (let row = 0, y = 0; y < S + hr; row++, y += hr * 1.5) {
      for (let x = (row % 2) * (hw / 2); x < S + hw; x += hw) {
        const d = Math.hypot(x - c, y - c) / SHELL_R;
        ctx.strokeStyle = `rgba(255,255,255,${0.04 + 0.22 * d * d})`;
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = Math.PI / 6 + (k * Math.PI) / 3;
          ctx.lineTo(x + Math.cos(a) * (hr - 1.5), y + Math.sin(a) * (hr - 1.5));
        }
        ctx.closePath();
        ctx.stroke();
      }
    }
    ctx.restore();
    // Highlight, upper left.
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(c, c, SHELL_R - 10, Math.PI * 1.08, Math.PI * 1.38);
    ctx.stroke();
  });
  // Cracks: jagged lines from near the centre to the rim, with branches.
  paint(scene, SHOP_TEX.cracks, S, S, 2, (ctx) => {
    const rnd = seeded(7);
    ctx.translate(c, c);
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 6 * 2;
    ctx.strokeStyle = '#ffffff';
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const n = 8;
    for (let i = 0; i < n; i++) {
      let a = (i / n) * Math.PI * 2 + rnd() * 0.5;
      let r = 8 + rnd() * 14;
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      while (r < SHELL_R + 2) {
        r += 9 + rnd() * 10;
        a += (rnd() - 0.5) * 0.5;
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        if (rnd() < 0.3 && r < SHELL_R - 20) {
          // A short branch.
          const ba = a + (rnd() < 0.5 ? -1 : 1) * (0.35 + rnd() * 0.3);
          const br = r + 14 + rnd() * 12;
          ctx.moveTo(Math.cos(ba) * br, Math.sin(ba) * br);
          ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
      }
      ctx.stroke();
    }
  });
}

function paintLightning(scene: Phaser.Scene) {
  const rnd = seeded(31);
  const glowLine = (ctx: Ctx, pts: number[][], w: number) => {
    for (const [width, blur, alpha] of [
      [w * 2.6, 10, 0.45],
      [w, 3, 1],
    ]) {
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = blur * 2;
      ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
      ctx.lineWidth = width;
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
      ctx.stroke();
    }
  };
  // Arcs that crawl round the shell.
  const S = (BOLT_R + 24) * 2;
  for (let i = 0; i < BOLT_ARCS; i++) {
    paint(scene, SHOP_TEX.boltArc(i), S, S, 2, (ctx) => {
      ctx.translate(S / 2, S / 2);
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      const span = 1.4 + rnd() * 0.8;
      const steps = 12 + Math.floor(rnd() * 5);
      const pts: number[][] = [];
      for (let k = 0; k <= steps; k++) {
        const a = -span / 2 + (span * k) / steps;
        const r = BOLT_R + (k === 0 || k === steps ? 0 : (rnd() - 0.5) * 16);
        pts.push([Math.cos(a) * r, Math.sin(a) * r]);
      }
      glowLine(ctx, pts, 1.8);
      // One or two forks flicking outwards.
      for (let f = 0; f < 2; f++) {
        const k = 2 + Math.floor(rnd() * (steps - 4));
        const [x, y] = pts[k];
        const a = Math.atan2(y, x);
        const fork = [
          [x, y],
          [x + Math.cos(a + 0.4) * 9, y + Math.sin(a + 0.4) * 9],
          [x + Math.cos(a - 0.1) * 17, y + Math.sin(a - 0.1) * 17],
        ];
        glowLine(ctx, fork, 1.1);
      }
    });
  }
  // Strikes from the shell outwards: origin (x = 0) is the shell's centre.
  for (let i = 0; i < BOLT_STRIKES; i++) {
    paint(scene, SHOP_TEX.boltStrike(i), 210, 64, 2, (ctx) => {
      ctx.translate(0, 32);
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      const pts: number[][] = [];
      let y = 0;
      for (let x = BOLT_R - 6; x < 200; x += 9 + rnd() * 8) {
        pts.push([x, y]);
        y = Math.max(-22, Math.min(22, y + (rnd() - 0.5) * 18));
      }
      glowLine(ctx, pts, 2);
      const k = Math.floor(pts.length / 2);
      glowLine(ctx, [pts[k], [pts[k][0] + 14, pts[k][1] + 12], [pts[k][0] + 26, pts[k][1] + 9]], 1.1);
    });
  }
  // Lid lightning: from the core out across the lid and the rings to the
  // housing's rim (origin, x = 0, at the core), with a fork or two.
  const zl = BAY.housingR + 14;
  for (let i = 0; i < ZAPS; i++) {
    paint(scene, SHOP_TEX.zap(i), zl, 52, 2, (ctx) => {
      ctx.translate(0, 26);
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      const pts: number[][] = [];
      let y = 0;
      for (let x = 8; x < BAY.housingR + 6; x += 7 + rnd() * 7) {
        pts.push([x, y]);
        y = Math.max(-14, Math.min(14, y + (rnd() - 0.5) * 13));
      }
      glowLine(ctx, pts, 1.6);
      for (let f = 0; f < 2; f++) {
        const k = 3 + Math.floor(rnd() * (pts.length - 5));
        const [x, y0] = pts[k];
        const s = rnd() < 0.5 ? -1 : 1;
        glowLine(ctx, [[x, y0], [x + 8, y0 + s * 7], [x + 15, y0 + s * 9]], 1);
      }
    });
  }
}

function paintGlows(scene: Phaser.Scene) {
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
  // A thick, soft shockwave: a faint fill that swells into a bright edge.
  paint(scene, SHOP_TEX.wave, 256, 256, 1, (ctx) => {
    const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 126);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.04)');
    g.addColorStop(0.8, 'rgba(255,255,255,0.3)');
    g.addColorStop(0.9, 'rgba(255,255,255,1)');
    g.addColorStop(0.95, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
  });
  // Screen-edge glow: bright along the edges, clear in the middle. Painted
  // small and stretched over the screen (it is all soft gradients).
  paint(scene, SHOP_TEX.edge, 128, 256, 1, (ctx) => {
    const edge = (x0: number, y0: number, x1: number, y1: number, rx: number, ry: number, rw: number, rh: number) => {
      const g = ctx.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.25, 'rgba(255,255,255,0.4)');
      g.addColorStop(0.6, 'rgba(255,255,255,0.08)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(rx, ry, rw, rh);
    };
    edge(0, 0, 24, 0, 0, 0, 24, 256);
    edge(128, 0, 104, 0, 104, 0, 24, 256);
    edge(0, 0, 0, 30, 0, 0, 128, 30);
    edge(0, 256, 0, 226, 0, 226, 128, 30);
  });
  // Energy swirling inside the shell: three glowing spiral arms (2x, like the shell).
  paint(scene, SHOP_TEX.swirl, SHELL_TEX, SHELL_TEX, 2, (ctx) => {
    ctx.translate(SHELL_TEX / 2, SHELL_TEX / 2);
    ctx.lineCap = 'round';
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 6 * 2;
    const R = SHELL_R - 10;
    for (let arm = 0; arm < 3; arm++) {
      const a0 = (arm / 3) * Math.PI * 2;
      for (let r = 10; r < R; r += 3) {
        const k = r / R;
        const a = a0 + r * 0.05;
        const b = a0 + (r + 3.5) * 0.05;
        ctx.strokeStyle = `rgba(255,255,255,${0.75 * Math.sin(Math.PI * Math.min(1, k * 1.15))})`;
        ctx.lineWidth = 1.2 + 5 * (1 - k) * k * 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        ctx.lineTo(Math.cos(b) * (r + 3.5), Math.sin(b) * (r + 3.5));
        ctx.stroke();
      }
    }
  });
  // Star glint: a hot centre and four long thin spikes (two of them fainter).
  paint(scene, SHOP_TEX.flare, 160, 160, 1, (ctx) => {
    ctx.translate(80, 80);
    const spike = (rot: number, len: number, thick: number, a: number) => {
      ctx.save();
      ctx.rotate(rot);
      ctx.scale(1, thick);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, len);
      g.addColorStop(0, `rgba(255,255,255,${a})`);
      g.addColorStop(0.25, `rgba(255,255,255,${a * 0.5})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, len, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };
    spike(0, 80, 0.07, 1);
    spike(Math.PI / 2, 80, 0.07, 1);
    spike(Math.PI / 4, 46, 0.06, 0.55);
    spike(-Math.PI / 4, 46, 0.06, 0.55);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 26);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-26, -26, 52, 52);
  });
  // Smoke / steam puff: a few soft overlapping blobs (tinted, normal blend).
  paint(scene, SHOP_TEX.smoke, 64, 64, 1, (ctx) => {
    const rnd = seeded(5);
    for (let i = 0; i < 6; i++) {
      const x = 32 + (rnd() - 0.5) * 22;
      const y = 32 + (rnd() - 0.5) * 18;
      const r = 13 + rnd() * 8;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,0.42)');
      g.addColorStop(0.6, 'rgba(255,255,255,0.2)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 64, 64);
    }
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

/** Silhouettes for skins not found yet. */
function paintSilhouettes(scene: Phaser.Scene) {
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
}
