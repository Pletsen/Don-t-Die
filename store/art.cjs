#!/usr/bin/env node
// The app icon, the launch artwork and the web icons, drawn from code so they
// can be tweaked and regenerated:
//
//   npm install                                    (once: the game's fonts)
//   NODE_PATH=$(npm root -g) node store/art.cjs          (or: node store/art.cjs icon  to redo one file)
//
// Writes (all opaque RGB PNGs: the App Store rejects an icon with alpha):
//   store/art/icon-1024.png      App Store / Xcode app icon. Square, no rounded
//                                corners: iOS masks it itself.
//   store/art/splash-1024.png    launch artwork (logo + orb)
//   store/art/splash-2732.png    the same centred on 2732 x 2732 for Capacitor's
//                                splash, kept inside the middle so iOS's
//                                aspect-fill crop on a tall phone never cuts it
//   public/apple-touch-icon.png  180 x 180 for "Add to Home Screen" (index.html)
//   public/favicon-32.png        browser tab icon (a simpler drawing: at 32 px
//                                the corridor would only be noise)
//   store/art/preview/           the icon at 60 and 120 px, to check it reads small
//
// The look copies the game: the glossy orb with its tilted orbit ring
// (fx/textures.ts, fx/PlayerView.ts), the cyan neon corridor of world 1
// (fx/CorridorView.ts) and the background colour #05070a (game/palette.ts).

const fs = require('fs');
const path = require('path');
const { launch, ROOT, fontDataUrl, readCanvas } = require('./lib/browser.cjs');
const { encodeRGB, pngInfo } = require('./lib/png.cjs');

const OUT = path.join(ROOT, 'store', 'art');
const PUBLIC = path.join(ROOT, 'public');

// Everything below runs inside the page.
function paintAll() {
  const BG = '#05070a';
  const CYAN = [43, 232, 255];
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

  function background(ctx, S, cx, cy) {
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, S, S);
    // A faint cyan haze around the orb, like the bloom in the game.
    const haze = ctx.createRadialGradient(cx, cy, 0, cx, cy, S * 0.75);
    haze.addColorStop(0, rgba(CYAN, 0.16));
    haze.addColorStop(0.45, rgba(CYAN, 0.05));
    haze.addColorStop(1, rgba(CYAN, 0));
    ctx.fillStyle = haze;
    ctx.fillRect(0, 0, S, S);
  }

  /** A neon line: wide soft glow, a cyan body and a hot white core. */
  function neon(ctx, k, pts, width = 1) {
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (const p of pts.slice(1)) ctx.lineTo(p[0], p[1]);
    };
    ctx.save();
    ctx.lineJoin = 'miter';
    ctx.lineCap = 'butt';
    ctx.globalCompositeOperation = 'lighter';
    for (const [w, a] of [
      [70, 0.05],
      [42, 0.1],
      [24, 0.22],
    ]) {
      ctx.strokeStyle = rgba(CYAN, a);
      ctx.lineWidth = w * k * width;
      path();
      ctx.stroke();
    }
    ctx.restore();
    ctx.save();
    ctx.lineJoin = 'miter';
    ctx.shadowColor = rgba(CYAN, 1);
    ctx.shadowBlur = 30 * k;
    ctx.strokeStyle = rgba(CYAN, 1);
    ctx.lineWidth = 15 * k * width;
    path();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#d6fbff';
    ctx.lineWidth = 6 * k * width;
    path();
    ctx.stroke();
    ctx.restore();
  }

  /**
   * The corner of the corridor: it comes up from the bottom and turns right
   * (every tap turns the orb 90° clockwise). (cx, cy) is the corner square's
   * centre, hw the corridor's half width.
   */
  function corridor(ctx, S, k, cx, cy, hw) {
    const far = S + 80 * k;
    ctx.save();
    ctx.beginPath();
    ctx.rect(cx - hw, cy - hw, 2 * hw, far - (cy - hw));
    ctx.rect(cx - hw, cy - hw, far - (cx - hw), 2 * hw);
    const floor = ctx.createRadialGradient(cx, cy, 0, cx, cy, S * 0.9);
    floor.addColorStop(0, '#11202c');
    floor.addColorStop(1, '#0a121b');
    ctx.fillStyle = floor;
    ctx.fill('nonzero');
    ctx.clip('nonzero');
    // The floor grid.
    ctx.strokeStyle = rgba(CYAN, 0.07);
    ctx.lineWidth = 2 * k;
    const step = hw / 2.5;
    for (let x = cx - hw; x < far; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, far);
      ctx.stroke();
    }
    for (let y = cy - hw; y < far; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(far, y);
      ctx.stroke();
    }
    // The corner square, where the turn happens, a touch brighter.
    const sq = ctx.createRadialGradient(cx, cy, 0, cx, cy, hw * 1.25);
    sq.addColorStop(0, rgba(CYAN, 0.14));
    sq.addColorStop(1, rgba(CYAN, 0.02));
    ctx.fillStyle = sq;
    ctx.fillRect(cx - hw, cy - hw, 2 * hw, 2 * hw);
    // Chevrons in the new direction, like the corridor's turn arrows.
    ctx.strokeStyle = rgba(CYAN, 0.42);
    ctx.lineWidth = 12 * k;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const dx of [0, 0.42]) {
      const x = cx + hw * (1.62 + dx);
      ctx.beginPath();
      ctx.moveTo(x - hw * 0.2, cy - hw * 0.36);
      ctx.lineTo(x + hw * 0.12, cy);
      ctx.lineTo(x - hw * 0.2, cy + hw * 0.36);
      ctx.stroke();
    }
    ctx.restore();
    // The walls: the outer one bends round the corner, the inner one too.
    neon(ctx, k, [
      [cx - hw, far],
      [cx - hw, cy - hw],
      [far, cy - hw],
    ]);
    neon(ctx, k, [
      [cx + hw, far],
      [cx + hw, cy + hw],
      [far, cy + hw],
    ]);
  }

  /** The trail behind the orb (it came up the corridor). */
  function trail(ctx, k, cx, cy, R, len) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // Stacked tapers, wide and faint to narrow and bright: a soft streak.
    for (const [w, a, l] of [
      [1.0, 0.1, 1],
      [0.75, 0.14, 0.85],
      [0.5, 0.2, 0.7],
      [0.28, 0.35, 0.55],
    ]) {
      const g = ctx.createLinearGradient(cx, cy, cx, cy + len * l);
      g.addColorStop(0, rgba(CYAN, a));
      g.addColorStop(1, rgba(CYAN, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(cx - R * w, cy);
      ctx.quadraticCurveTo(cx - R * w * 0.5, cy + len * l * 0.5, cx, cy + len * l);
      ctx.quadraticCurveTo(cx + R * w * 0.5, cy + len * l * 0.5, cx + R * w, cy);
      ctx.closePath();
      ctx.fill();
    }
    // A few embers shed along the way.
    const embers = [
      [0.42, 0.7, 0.1],
      [-0.38, 1.05, 0.08],
      [0.22, 1.5, 0.07],
      [-0.2, 2.0, 0.06],
      [0.08, 2.5, 0.05],
    ];
    for (const [dx, dy, r] of embers) {
      const ex = cx + dx * R;
      const ey = cy + R + dy * R;
      const eg = ctx.createRadialGradient(ex, ey, 0, ex, ey, r * R * 2.2);
      eg.addColorStop(0, 'rgba(255,255,255,0.95)');
      eg.addColorStop(0.3, rgba(CYAN, 0.7));
      eg.addColorStop(1, rgba(CYAN, 0));
      ctx.fillStyle = eg;
      ctx.beginPath();
      ctx.arc(ex, ey, r * R * 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /** Half of the orbit ring: the back half goes behind the orb, the front half over it. */
  function ringHalf(ctx, k, cx, cy, R, front, thick = 1) {
    const rx = R * 2.2;
    const ry = rx * 0.4;
    const tilt = -0.42;
    // The front half overlaps the back a little so the seams don't show.
    const [a0, a1] = front ? [-0.08, Math.PI + 0.08] : [Math.PI, Math.PI * 2];
    const arc = () => {
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, tilt, a0, a1);
    };
    ctx.save();
    ctx.lineCap = 'round';
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rgba(CYAN, front ? 0.22 : 0.14);
    ctx.lineWidth = 34 * k * thick;
    arc();
    ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.lineCap = 'round';
    ctx.shadowColor = rgba(CYAN, 1);
    ctx.shadowBlur = 26 * k;
    ctx.strokeStyle = front ? rgba(CYAN, 1) : rgba(CYAN, 0.75);
    ctx.lineWidth = 15 * k * thick;
    arc();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = front ? '#e4fdff' : 'rgba(214,251,255,0.7)';
    ctx.lineWidth = 6 * k * thick;
    arc();
    ctx.stroke();
    ctx.restore();
  }

  /** The glossy orb with its halo (fx/textures.ts `orb`). */
  function orb(ctx, k, cx, cy, R) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const halo = ctx.createRadialGradient(cx, cy, R * 0.6, cx, cy, R * 3.1);
    halo.addColorStop(0, rgba(CYAN, 0.62));
    halo.addColorStop(0.3, rgba(CYAN, 0.24));
    halo.addColorStop(1, rgba(CYAN, 0));
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 3.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.shadowColor = rgba(CYAN, 1);
    ctx.shadowBlur = 60 * k;
    const body = ctx.createRadialGradient(cx - R * 0.28, cy - R * 0.32, R * 0.05, cx, cy, R);
    body.addColorStop(0, '#ffffff');
    body.addColorStop(0.4, '#eaf6ff');
    body.addColorStop(0.85, '#7fd6ee');
    body.addColorStop(1, '#2be8ff');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.ellipse(cx - R * 0.33, cy - R * 0.39, R * 0.24, R * 0.14, -0.6, 0, Math.PI * 2);
    ctx.fill();
  }

  function orbWithRing(ctx, k, cx, cy, R, thick) {
    ringHalf(ctx, k, cx, cy, R, false, thick);
    orb(ctx, k, cx, cy, R);
    ringHalf(ctx, k, cx, cy, R, true, thick);
  }

  /** The app icon: the orb at the corridor's corner. */
  function icon(ctx, S) {
    const k = S / 1024;
    const cx = 476 * k;
    const cy = 484 * k;
    const R = 136 * k;
    background(ctx, S, cx, cy);
    corridor(ctx, S, k, cx, cy, 238 * k);
    trail(ctx, k, cx, cy, R, 520 * k);
    orbWithRing(ctx, k * 1.1, cx, cy, R, 1);
  }

  /** Tiny sizes: just the orb and a bold ring on the dark background. */
  function simpleIcon(ctx, S) {
    const k = S / 1024;
    const c = S / 2;
    const R = 210 * k;
    background(ctx, S, c, c);
    orbWithRing(ctx, k * 1.6, c, c, R, 1.7);
  }

  /** The DUCKWISE wordmark as on the menu: magenta and cyan ghosts behind white. */
  function wordmark(ctx, k, cx, cy, size) {
    ctx.save();
    ctx.font = `700 ${size}px "Chakra Petch"`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const text = "DUCKWISE";
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = '#ff2f9e';
    ctx.fillText(text, cx - size * 0.035, cy + size * 0.01);
    ctx.fillStyle = '#2be8ff';
    ctx.fillText(text, cx + size * 0.035, cy - size * 0.01);
    ctx.restore();
    ctx.save();
    ctx.font = `700 ${size}px "Chakra Petch"`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = '#2be8ff';
    ctx.shadowBlur = size * 0.33;
    ctx.fillStyle = '#eaf6ff';
    ctx.fillText(text, cx, cy);
    ctx.shadowBlur = size * 0.12;
    ctx.fillText(text, cx, cy);
    ctx.restore();
  }

  /** Launch artwork: orb on top, logo and tagline under it, on a square of side `box`. */
  function splash(ctx, S, box) {
    const k = box / 1024;
    const cx = S / 2;
    const top = (S - box) / 2;
    const oy = top + 420 * k;
    background(ctx, S, cx, oy);
    // The corridor corner, faint, so the orb still sits in its world. Drawn
    // on its own layer so it can fade out before it reaches the logo.
    const layer = document.createElement('canvas');
    layer.width = layer.height = S;
    const lc = layer.getContext('2d');
    lc.globalAlpha = 0.4;
    const hw = 150 * k;
    const far = 2 * S;
    const walls = [
      [
        [cx - hw, far],
        [cx - hw, oy - hw],
        [far, oy - hw],
      ],
      [
        [cx + hw, far],
        [cx + hw, oy + hw],
        [far, oy + hw],
      ],
    ];
    for (const w of walls) neon(lc, k, w, 0.6);
    lc.globalAlpha = 1;
    lc.globalCompositeOperation = 'destination-in';
    const fade = lc.createLinearGradient(0, oy, 0, top + 640 * k);
    fade.addColorStop(0, 'rgba(0,0,0,1)');
    fade.addColorStop(1, 'rgba(0,0,0,0)');
    lc.fillStyle = fade;
    lc.fillRect(0, 0, S, S);
    ctx.drawImage(layer, 0, 0);
    const R = 92 * k;
    trail(ctx, k, cx, oy, R, 300 * k);
    orbWithRing(ctx, k * 0.8, cx, oy, R, 1);
    wordmark(ctx, k, cx, top + 720 * k, 150 * k);
    ctx.save();
    ctx.font = `500 ${30 * k}px "JetBrains Mono"`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#8fa3b5';
    ctx.letterSpacing = `${10 * k}px`;
    ctx.fillText('ONE TAP. ALWAYS RIGHT.', cx + 5 * k, top + 830 * k);
    ctx.restore();
  }

  /** Downscale a drawing in halving steps (sharper than one big jump). */
  function shrink(src, size) {
    let cur = src;
    while (cur.width / 2 >= size) {
      const c = document.createElement('canvas');
      c.width = c.height = cur.width / 2;
      const x = c.getContext('2d');
      x.imageSmoothingQuality = 'high';
      x.drawImage(cur, 0, 0, c.width, c.height);
      cur = c;
    }
    const out = document.createElement('canvas');
    out.width = out.height = size;
    const x = out.getContext('2d');
    x.imageSmoothingQuality = 'high';
    x.drawImage(cur, 0, 0, size, size);
    return out;
  }

  window.renderArt = (kind, size) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (kind === 'icon') icon(ctx, size);
    else if (kind === 'simple') simpleIcon(ctx, size);
    else if (kind === 'splash') splash(ctx, size, size);
    else if (kind === 'splash-safe') splash(ctx, size, size * 0.42);
    else if (kind.startsWith('icon@')) {
      const big = document.createElement('canvas');
      big.width = big.height = 1024;
      icon(big.getContext('2d'), 1024);
      canvas.getContext('2d').drawImage(shrink(big, size), 0, 0);
    } else if (kind.startsWith('simple@')) {
      const big = document.createElement('canvas');
      big.width = big.height = 512;
      simpleIcon(big.getContext('2d'), 512);
      canvas.getContext('2d').drawImage(shrink(big, size), 0, 0);
    }
    canvas.id = 'out';
    document.getElementById('out')?.remove();
    document.body.appendChild(canvas);
  };
}

const JOBS = [
  { kind: 'icon', size: 1024, file: path.join(OUT, 'icon-1024.png') },
  { kind: 'splash', size: 1024, file: path.join(OUT, 'splash-1024.png') },
  { kind: 'splash-safe', size: 2732, file: path.join(OUT, 'splash-2732.png') },
  { kind: 'icon@180', size: 180, file: path.join(PUBLIC, 'apple-touch-icon.png') },
  { kind: 'simple@32', size: 32, file: path.join(PUBLIC, 'favicon-32.png') },
  // How the icon reads on a home screen (not shipped).
  { kind: 'icon@60', size: 60, file: path.join(OUT, 'preview', 'icon-60.png') },
  { kind: 'icon@120', size: 120, file: path.join(OUT, 'preview', 'icon-120.png') },
];

async function main() {
  const only = process.argv.slice(2);
  fs.mkdirSync(path.join(OUT, 'preview'), { recursive: true });
  const browser = await launch();
  const page = await browser.newPage();
  await page.setContent(`<!doctype html><html><head><style>
    @font-face { font-family: "Chakra Petch"; font-weight: 700; src: url(${fontDataUrl('chakra-petch/files/chakra-petch-latin-700-normal.woff2')}); }
    @font-face { font-family: "JetBrains Mono"; font-weight: 500; src: url(${fontDataUrl('jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff2')}); }
    body { margin: 0; background: #05070a; }
  </style></head><body></body></html>`);
  await page.evaluate(() => Promise.all([document.fonts.load('700 40px "Chakra Petch"'), document.fonts.load('500 20px "JetBrains Mono"')]));
  await page.evaluate(paintAll);
  for (const job of JOBS) {
    if (only.length && !only.some((o) => job.file.includes(o))) continue;
    await page.evaluate(({ kind, size }) => window.renderArt(kind, size), job);
    const px = await readCanvas(page, '#out', job.size, job.size);
    const png = encodeRGB(px, job.size, job.size);
    fs.writeFileSync(job.file, png);
    const info = pngInfo(png);
    console.log(`${path.relative(ROOT, job.file)}  ${info.width}x${info.height}  ${info.alpha ? 'ALPHA!' : 'RGB'}  ${(png.length / 1024).toFixed(0)} KB`);
  }
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
