import type Phaser from 'phaser';

// Textures for the corridor, painted once with Canvas 2D into ONE atlas, so
// the whole corridor batches into a single draw call. Everything is white
// (only alpha varies): one frame can be tinted to any world colour every
// frame for free. Sizes are world units times TPU texels per unit.

/** Texels per world unit for the corridor textures. */
export const TPU = 4;
/** Outer wall glow reaches this far outside the lane (world units). */
export const GLOW = 26;
/** Light spills this far into the lane from each wall. */
export const SPILL = 22;
/** Grid cell (world units), the same grid as before so lines continue across pieces. */
export const GRID = 36;
/** Lane chevron: arm size the frame is drawn at, and its padding. */
export const CHEV = { size: 16, pad: 2 };
/** Turn arrow in the gate: arm size and padding. */
export const ARROW = { size: 24, pad: 7 };
/** Runner (current pulse along a wall): length and height. */
export const RUNNER = { len: 84, h: 12 };

export const WTEX = {
  atlas: 'wd-atlas',
  /** Stand-alone textures for game objects outside the corridor. */
  px: 'wd-px',
  rainbow: 'wd-rainbow',
} as const;

/**
 * Atlas frames. H/V and R/D are the same art turned a quarter turn, so
 * every quad stays axis-aligned (mirror a quad to get the other two sides):
 * glowH: wall at the bottom edge, haze going up (out of the lane).
 * spillH: wall at the top edge, light fading down (into the lane).
 * corner: corner point at the bottom-right texel.
 * chevR/arrowR/runnerR point right; the D versions point down.
 */
export const AF = {
  px: 'px',
  glowH: 'glowH',
  glowV: 'glowV',
  spillH: 'spillH',
  spillV: 'spillV',
  corner: 'corner',
  softH: 'softH',
  softV: 'softV',
  chevR: 'chevR',
  chevD: 'chevD',
  arrowR: 'arrowR',
  arrowD: 'arrowD',
  arrowCoreR: 'arrowCoreR',
  arrowCoreD: 'arrowCoreD',
  runnerR: 'runnerR',
  runnerD: 'runnerD',
} as const;

type Painter = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

function paint(scene: Phaser.Scene, key: string, w: number, h: number, draw: Painter) {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, w, h);
  if (!tex) return;
  draw(tex.getContext(), w, h);
  tex.refresh();
}

function canvas(w: number, h: number, draw?: Painter): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  if (draw) draw(c.getContext('2d')!, w, h);
  return c;
}

/** A quarter turn: +1 clockwise, -1 counter-clockwise. */
function turn(src: HTMLCanvasElement, dir: 1 | -1): HTMLCanvasElement {
  return canvas(src.height, src.width, (ctx) => {
    if (dir === 1) ctx.translate(src.height, 0);
    else ctx.translate(0, src.width);
    ctx.rotate((dir * Math.PI) / 2);
    ctx.drawImage(src, 0, 0);
  });
}

/** Outer glow alpha at distance `d` (world units) outside the wall line. */
export function glowAlpha(d: number) {
  if (d >= GLOW) return 0;
  const far = 1 - smooth(10, GLOW - 2, d);
  return 0.26 * Math.exp(-d / 4) + 0.085 * far;
}

function smooth(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** A row-by-row alpha profile (white). */
function profile(w: number, h: number, alphaAt: (row: number) => number): HTMLCanvasElement {
  return canvas(w, h, (ctx) => {
    const img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      const a = Math.round(Math.min(1, Math.max(0, alphaAt(y))) * 255);
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
        img.data[i + 3] = a;
      }
    }
    ctx.putImageData(img, 0, 0);
  });
}

function chevronPath(ctx: CanvasRenderingContext2D, size: number, pad: number) {
  const s = size * TPU;
  const p = pad * TPU;
  ctx.beginPath();
  ctx.moveTo(p, p);
  ctx.lineTo(p + s, p + s);
  ctx.lineTo(p, p + s * 2);
}

function chevron(size: number, pad: number, width: number, blur: number): HTMLCanvasElement {
  return canvas((size + pad * 2) * TPU, (size * 2 + pad * 2) * TPU, (ctx) => {
    ctx.strokeStyle = '#fff';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (blur > 0) {
      ctx.shadowColor = '#fff';
      ctx.shadowBlur = blur * TPU;
    }
    ctx.lineWidth = width * TPU;
    chevronPath(ctx, size, pad);
    ctx.stroke();
  });
}

function frames(): Record<string, HTMLCanvasElement> {
  const gh = GLOW * TPU;
  const glowH = profile(4, gh, (y) => glowAlpha((gh - 1 - y + 0.5) / TPU));
  const spillH = profile(4, SPILL * TPU, (y) => {
    const k = 1 - (y + 0.5) / (SPILL * TPU);
    return 0.14 * k * k;
  });
  const corner = canvas(gh, gh, (ctx, w, h) => {
    const img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const d = Math.hypot(w - x - 0.5, h - y - 0.5) / TPU;
        const i = (y * w + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
        img.data[i + 3] = Math.round(glowAlpha(d) * 255);
      }
    }
    ctx.putImageData(img, 0, 0);
  });
  const softH = profile(4, 64, (y) => {
    const d = (y + 0.5 - 32) / 32;
    return Math.exp(-d * d * 4.5);
  });
  const chevR = chevron(CHEV.size, CHEV.pad, 2, 0);
  const arrowR = chevron(ARROW.size, ARROW.pad, 4.5, 3);
  const arrowCoreR = chevron(ARROW.size, ARROW.pad, 1.3, 0);
  // Runner: a dash whose head (right end) is brightest, a fading tail and a
  // little halo around the head.
  const runnerR = canvas(RUNNER.len * TPU, RUNNER.h * TPU, (ctx, w, h) => {
    const cy = h / 2;
    const halo = ctx.createRadialGradient(w - 7 * TPU, cy, 0, w - 7 * TPU, cy, cy);
    halo.addColorStop(0, 'rgba(255,255,255,0.32)');
    halo.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(w - 7 * TPU - cy, 0, cy * 2, h);
    const tail = ctx.createLinearGradient(0, 0, w, 0);
    tail.addColorStop(0, 'rgba(255,255,255,0)');
    tail.addColorStop(0.55, 'rgba(255,255,255,0.35)');
    tail.addColorStop(0.82, 'rgba(255,255,255,0.85)');
    tail.addColorStop(1, 'rgba(255,255,255,1)');
    ctx.fillStyle = tail;
    ctx.fillRect(0, cy - 1.5 * TPU, w - TPU, 3 * TPU);
    ctx.fillStyle = '#fff';
    ctx.fillRect(w - 14 * TPU, cy - 2 * TPU, 13 * TPU, 4 * TPU);
  });
  return {
    [AF.px]: canvas(4, 4, (ctx) => {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, 4, 4);
    }),
    [AF.glowH]: glowH,
    [AF.glowV]: turn(glowH, -1),
    [AF.spillH]: spillH,
    [AF.spillV]: turn(spillH, -1),
    [AF.corner]: corner,
    [AF.softH]: softH,
    [AF.softV]: turn(softH, -1),
    [AF.chevR]: chevR,
    [AF.chevD]: turn(chevR, 1),
    [AF.arrowR]: arrowR,
    [AF.arrowD]: turn(arrowR, 1),
    [AF.arrowCoreR]: arrowCoreR,
    [AF.arrowCoreD]: turn(arrowCoreR, 1),
    [AF.runnerR]: runnerR,
    [AF.runnerD]: turn(runnerR, 1),
  };
}

/** Pack the frames into one canvas texture (rows, tallest first). */
function createAtlas(scene: Phaser.Scene) {
  if (scene.textures.exists(WTEX.atlas)) return;
  const all = frames();
  const names = Object.keys(all).sort((a, b) => all[b].height - all[a].height);
  // Each frame gets a border of copies of its own edge pixels, so linear
  // filtering never picks up a neighbour.
  const P = 2;
  const W = 1024;
  const spots: Record<string, { x: number; y: number }> = {};
  let x = 0;
  let y = 0;
  let row = 0;
  for (const n of names) {
    const c = all[n];
    if (x + c.width + P * 2 > W) {
      x = 0;
      y += row;
      row = 0;
    }
    spots[n] = { x: x + P, y: y + P };
    x += c.width + P * 2;
    row = Math.max(row, c.height + P * 2);
  }
  const H = Math.pow(2, Math.ceil(Math.log2(y + row)));
  const tex = scene.textures.createCanvas(WTEX.atlas, W, H);
  if (!tex) return;
  const ctx = tex.getContext();
  ctx.imageSmoothingEnabled = false;
  for (const n of names) {
    const c = all[n];
    const { x: fx, y: fy } = spots[n];
    const w = c.width;
    const h = c.height;
    ctx.drawImage(c, fx, fy);
    ctx.drawImage(c, 0, 0, 1, h, fx - P, fy, P, h);
    ctx.drawImage(c, w - 1, 0, 1, h, fx + w, fy, P, h);
    ctx.drawImage(c, 0, 0, w, 1, fx, fy - P, w, P);
    ctx.drawImage(c, 0, h - 1, w, 1, fx, fy + h, w, P);
    ctx.drawImage(c, 0, 0, 1, 1, fx - P, fy - P, P, P);
    ctx.drawImage(c, w - 1, 0, 1, 1, fx + w, fy - P, P, P);
    ctx.drawImage(c, 0, h - 1, 1, 1, fx - P, fy + h, P, P);
    ctx.drawImage(c, w - 1, h - 1, 1, 1, fx + w, fy + h, P, P);
    tex.add(n, 0, fx, fy, w, h);
  }
  tex.refresh();
}

export function createWorldTextures(scene: Phaser.Scene) {
  createAtlas(scene);
  paint(scene, WTEX.px, 4, 4, (ctx) => {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, 4, 4);
  });
  // Six rainbow stripes, for the pizza's trail in Universe 2.
  paint(scene, WTEX.rainbow, 17, 30, (ctx) => {
    ['#ff2f9e', '#ff9a2e', '#ffd21f', '#7cff6b', '#2be8ff', '#b36bff'].forEach((c, i) => {
      ctx.fillStyle = c;
      ctx.fillRect(0, i * 5, 17, 5);
    });
  });
}
