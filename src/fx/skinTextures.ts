import type Phaser from 'phaser';
import { SKINS, skinTexture } from '../game/skins';

// Paints every player skin into a 128×128 texture at boot. The orb's body is
// a circle of radius R around the centre; the extra room around it is for
// ears, crowns and other things that stick out.

const S = 128;
const C = S / 2;
const R = 44;

type Ctx = CanvasRenderingContext2D;

/** Shaded ball: light from the upper left. `stops` go from highlight to edge. */
function ball(ctx: Ctx, stops: string[], r = R) {
  const g = ctx.createRadialGradient(C - r * 0.3, C - r * 0.35, r * 0.05, C, C, r);
  stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(C, C, r, 0, Math.PI * 2);
  ctx.fill();
}

function shine(ctx: Ctx, alpha = 0.85) {
  ctx.fillStyle = `rgba(255,255,255,${alpha})`;
  ctx.beginPath();
  ctx.ellipse(C - R * 0.36, C - R * 0.42, R * 0.22, R * 0.12, -0.6, 0, Math.PI * 2);
  ctx.fill();
}

/** Clip following drawing to the ball. */
function inside(ctx: Ctx, draw: () => void) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(C, C, R, 0, Math.PI * 2);
  ctx.clip();
  draw();
  ctx.restore();
}

function dot(ctx: Ctx, x: number, y: number, r: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

/** Simple cute face: two eyes and a small smile. */
function face(ctx: Ctx, opts: { y?: number; eye?: string; blush?: string; closed?: boolean } = {}) {
  const y = C + (opts.y ?? 0);
  const eye = opts.eye ?? '#1b1b24';
  if (opts.closed) {
    ctx.strokeStyle = eye;
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    for (const x of [C - 14, C + 14]) {
      ctx.beginPath();
      ctx.arc(x, y + 2, 6, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
    }
  } else {
    for (const x of [C - 14, C + 14]) {
      dot(ctx, x, y, 5.5, eye);
      dot(ctx, x + 2, y - 2, 1.8, '#ffffff');
    }
  }
  if (opts.blush) for (const x of [C - 24, C + 24]) dot(ctx, x, y + 9, 5.5, opts.blush);
  ctx.strokeStyle = eye;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(C, y + 8, 6, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();
}

function crown(ctx: Ctx, y: number, w: number, h: number) {
  const x = C - w / 2;
  ctx.fillStyle = '#ffd21f';
  ctx.strokeStyle = '#b8860b';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w * 0.1, y - h);
  ctx.lineTo(x + w * 0.3, y - h * 0.45);
  ctx.lineTo(x + w * 0.5, y - h * 1.15);
  ctx.lineTo(x + w * 0.7, y - h * 0.45);
  ctx.lineTo(x + w * 0.9, y - h);
  ctx.lineTo(x + w, y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  dot(ctx, C, y - h * 0.35, 3.5, '#ff2f5e');
  dot(ctx, x + w * 0.2, y - h * 0.25, 2.5, '#2be8ff');
  dot(ctx, x + w * 0.8, y - h * 0.25, 2.5, '#3dff6b');
}

/** Repeatable pseudo-random numbers, so a texture looks the same every launch. */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Points spread evenly over the ball's face (sunflower pattern). `k` is the
 * distance from the centre (0..1) and `a` the angle, for foreshortening.
 */
function sunflower(n: number, maxR: number, cb: (x: number, y: number, k: number, a: number) => void) {
  for (let i = 0; i < n; i++) {
    const k = Math.sqrt((i + 0.5) / n);
    const a = i * 2.39996;
    cb(C + Math.cos(a) * k * maxR, C + Math.sin(a) * k * maxR, k, a);
  }
}

/** Soft light from the upper left and a darker rim over what's painted (keeps transparency). */
function shade(ctx: Ctx, strength = 0.45, r = R) {
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  const g = ctx.createRadialGradient(C - r * 0.35, C - r * 0.4, r * 0.1, C, C, r * 1.05);
  g.addColorStop(0, 'rgba(255,255,255,0.18)');
  g.addColorStop(0.55, 'rgba(255,255,255,0)');
  g.addColorStop(1, `rgba(0,0,0,${strength})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  ctx.restore();
}

/** Thin bright rim on the shadow side: makes balls read as glossy and round. */
function rimLight(ctx: Ctx, color = 'rgba(255,255,255,0.5)', width = 2) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(C, C, R - width / 2 - 0.5, 0.08 * Math.PI, 0.72 * Math.PI);
  ctx.stroke();
}

/** A small irregular blob (chocolate chip, pebble ...), squashed toward the edge of the ball. */
function blob(ctx: Ctx, x: number, y: number, r: number, k: number, a: number, rand: () => number, fill: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  ctx.scale(Math.max(0.35, Math.sqrt(1 - k * k * 0.85)), 1);
  ctx.fillStyle = fill;
  ctx.beginPath();
  const n = 5 + Math.floor(rand() * 2);
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const rr = r * (0.7 + rand() * 0.45);
    ctx.lineTo(Math.cos(t) * rr, Math.sin(t) * rr);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Four-pointed sparkle. */
function glint(ctx: Ctx, x: number, y: number, r: number, color = '#ffffff') {
  ctx.save();
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = r;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const t = (i * Math.PI) / 4;
    const rr = i % 2 === 0 ? r : r * 0.22;
    ctx.lineTo(x + Math.cos(t) * rr, y + Math.sin(t) * rr);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** A leaf from (x, y) pointing at `angle`, `len` long. */
function leaf(ctx: Ctx, x: number, y: number, angle: number, len: number, light = '#8ee04a', dark = '#3a8f1f') {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  const g = ctx.createLinearGradient(0, -len * 0.25, 0, len * 0.25);
  g.addColorStop(0, light);
  g.addColorStop(1, dark);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(len * 0.45, -len * 0.42, len, 0);
  ctx.quadraticCurveTo(len * 0.45, len * 0.42, 0, 0);
  ctx.fill();
  ctx.strokeStyle = 'rgba(20,70,10,0.6)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(1, 0);
  ctx.lineTo(len * 0.85, 0);
  ctx.stroke();
  ctx.restore();
}

/** A flame tongue from (x, y) pointing at `angle`. */
function flame(ctx: Ctx, x: number, y: number, angle: number, len: number, width: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  const g = ctx.createLinearGradient(0, 0, len, 0);
  g.addColorStop(0, '#ff3a1a');
  g.addColorStop(0.45, '#ff9a1f');
  g.addColorStop(1, '#fff3a0');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, -width / 2);
  ctx.bezierCurveTo(len * 0.4, -width * 0.7, len * 0.7, -width * 0.1, len, 0);
  ctx.bezierCurveTo(len * 0.6, width * 0.25, len * 0.35, width * 0.7, 0, width / 2);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** One wedge of a fruit slice, from radius r0 to r1 between angles a0 and a1. */
function wedge(ctx: Ctx, r0: number, r1: number, a0: number, a1: number) {
  ctx.beginPath();
  ctx.arc(C, C, r1, a0, a1);
  ctx.arc(C, C, r0, a1, a0, true);
  ctx.closePath();
}

const painters: Record<string, (ctx: Ctx) => void> = {
  classic: (ctx) => {
    // Clear cyan glass: light focuses inside it at the bottom right.
    ball(ctx, ['#ffffff', '#e6fbff', '#7fe3f5', '#139fc4']);
    inside(ctx, () => {
      const g = ctx.createRadialGradient(C + 12, C + 16, 1, C + 12, C + 16, R * 0.7);
      g.addColorStop(0, 'rgba(255,255,255,0.55)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, S, S);
    });
    shade(ctx, 0.3);
    rimLight(ctx, 'rgba(210,252,255,0.85)', 2.5);
    shine(ctx, 0.95);
    dot(ctx, C + R * 0.45, C + R * 0.42, 2.6, 'rgba(255,255,255,0.6)');
  },
  mint: (ctx) => {
    // Mint-chip ice cream: a scoop with chocolate flecks.
    ball(ctx, ['#ffffff', '#e8fff5', '#a8f2d4', '#4fc79c']);
    inside(ctx, () => {
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      for (const [y, w] of [[-20, 0.7], [-2, 0.9], [16, 0.8], [32, 0.55]] as const) {
        ctx.beginPath();
        ctx.ellipse(C - 4, C + y, R * w, 7, 0.08, 0.15 * Math.PI, 0.85 * Math.PI);
        ctx.stroke();
      }
      const rand = seeded(7);
      sunflower(26, R * 0.92, (x, y, k, a) => {
        if (rand() < 0.15) return;
        const r = 2.6 + rand() * 2.4;
        blob(ctx, x, y, r * (1 - k * 0.3), k, a, rand, '#3b2416');
        blob(ctx, x - 0.8, y - 0.8, r * 0.45, k, a, rand, '#7a4c2c');
      });
    });
    shade(ctx, 0.32);
    shine(ctx, 0.75);
  },
  bubblegum: (ctx) => {
    // A blown gum bubble: see-through middle, saturated rim, window reflections.
    const g = ctx.createRadialGradient(C, C, R * 0.1, C, C, R);
    g.addColorStop(0, '#ffd0e8');
    g.addColorStop(0.65, '#ff9ad2');
    g.addColorStop(0.9, '#ff5cb8');
    g.addColorStop(1, '#d81f7a');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(C, C, R, 0, Math.PI * 2);
    ctx.fill();
    inside(ctx, () => {
      const c = ctx.createRadialGradient(C + 10, C + 14, 1, C + 10, C + 14, R * 0.75);
      c.addColorStop(0, 'rgba(255,255,255,0.4)');
      c.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = c;
      ctx.fillRect(0, 0, S, S);
    });
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(C, C, R - 1.2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(C, C, R * 0.78, 1.08 * Math.PI, 1.42 * Math.PI);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath();
    ctx.ellipse(C - R * 0.2, C - R * 0.62, 6, 3.6, -0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    ctx.ellipse(C + R * 0.5, C + R * 0.48, 7, 3, -0.8, 0, Math.PI * 2);
    ctx.fill();
  },
  lemon: (ctx) => {
    // A lemon slice: rind, pith and juicy segments.
    const rind = ctx.createRadialGradient(C - 10, C - 12, 4, C, C, R);
    rind.addColorStop(0, '#fff07a');
    rind.addColorStop(1, '#e0a800');
    ctx.fillStyle = rind;
    ctx.beginPath();
    ctx.arc(C, C, R, 0, Math.PI * 2);
    ctx.fill();
    dot(ctx, C, C, R - 4.5, '#fff8d8');
    const n = 9;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2 + 0.07;
      const a1 = ((i + 1) / n) * Math.PI * 2 - 0.07;
      const g = ctx.createRadialGradient(C, C, 4, C, C, R - 8);
      g.addColorStop(0, '#fff6b0');
      g.addColorStop(0.6, '#ffe047');
      g.addColorStop(1, '#ffc81a');
      ctx.fillStyle = g;
      wedge(ctx, 6, R - 8.5, a0, a1);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 1.4;
      ctx.lineCap = 'round';
      for (let j = 0; j < 4; j++) {
        const t = a0 + ((j + 0.5) / 4) * (a1 - a0);
        const r0 = 12 + (j % 2) * 9;
        ctx.beginPath();
        ctx.moveTo(C + Math.cos(t) * r0, C + Math.sin(t) * r0);
        ctx.lineTo(C + Math.cos(t) * (r0 + 7), C + Math.sin(t) * (r0 + 7));
        ctx.stroke();
      }
    }
    dot(ctx, C, C, 5, '#fff8d8');
    shade(ctx, 0.22);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.ellipse(C - R * 0.4, C - R * 0.45, 9, 4, -0.7, 0, Math.PI * 2);
    ctx.fill();
  },
  grape: (ctx) => {
    // A bunch of grapes with a stem and a leaf.
    const rows: [number, number[]][] = [
      [-22, [-30, -10, 10, 30]],
      [-3, [-20, 0, 20]],
      [16, [-10, 10]],
      [34, [0]],
    ];
    ctx.strokeStyle = '#6b4a22';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(C, C - 30);
    ctx.quadraticCurveTo(C - 2, C - 44, C + 6, C - 52);
    ctx.stroke();
    leaf(ctx, C + 2, C - 40, -0.35, 30);
    for (const [y, xs] of rows) {
      for (const x of xs) {
        const gx = C + x;
        const gy = C + y;
        const g = ctx.createRadialGradient(gx - 4, gy - 5, 1, gx, gy, 12.5);
        g.addColorStop(0, '#efe0ff');
        g.addColorStop(0.3, '#b384ff');
        g.addColorStop(0.75, '#6e30e8');
        g.addColorStop(1, '#3a1488');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(gx, gy, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(30,8,70,0.55)';
        ctx.lineWidth = 1;
        ctx.stroke();
        dot(ctx, gx - 4.5, gy - 5, 2.2, 'rgba(255,255,255,0.85)');
      }
    }
  },
  tangerine: (ctx) => {
    // Dimpled peel, a little stem and a leaf.
    ball(ctx, ['#ffe9c7', '#ffb757', '#ff8a1f', '#d85a00']);
    inside(ctx, () => {
      sunflower(190, R * 0.98, (x, y, k, a) => {
        const s = 1.35 * (1 - k * 0.35);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(a);
        ctx.scale(Math.max(0.3, Math.sqrt(1 - k * k)), 1);
        ctx.fillStyle = 'rgba(170,55,0,0.3)';
        ctx.beginPath();
        ctx.arc(0.5, 0.5, s, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,225,170,0.32)';
        ctx.beginPath();
        ctx.arc(-0.6, -0.6, s * 0.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });
    });
    shade(ctx, 0.35);
    shine(ctx, 0.7);
    leaf(ctx, C + 3, C - R + 4, -0.75, 26);
    dot(ctx, C + 1, C - R + 5, 4.2, '#5f7f22');
    dot(ctx, C + 1, C - R + 5, 2, '#8fb03a');
  },
  frosty: (ctx) => {
    // A faceted ice crystal: a ring of bevelled facets round a flat top.
    const n = 10;
    const outer = (i: number): [number, number] => {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      return [C + Math.cos(a) * R, C + Math.sin(a) * R];
    };
    const inner = (i: number): [number, number] => {
      const a = ((i + 0.5) / n) * Math.PI * 2 - Math.PI / 2;
      return [C + Math.cos(a) * R * 0.56, C + Math.sin(a) * R * 0.56];
    };
    const tone = (a: number, base: number) => {
      const b = Math.max(0, Math.min(1, base + 0.38 * Math.cos(a + 2.3)));
      const lerp = (p: number, q: number) => Math.round(p + (q - p) * b);
      return `rgb(${lerp(70, 245)},${lerp(150, 252)},${lerp(205, 255)})`;
    };
    for (let i = 0; i < n; i++) {
      const o0 = outer(i);
      const o1 = outer(i + 1);
      const i0 = inner(i);
      const im = inner(i - 1);
      const mid = ((i + 0.5) / n) * Math.PI * 2 - Math.PI / 2;
      ctx.fillStyle = tone(mid, 0.5);
      ctx.beginPath();
      ctx.moveTo(...o0);
      ctx.lineTo(...o1);
      ctx.lineTo(...i0);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = tone(mid - Math.PI / n, 0.62);
      ctx.beginPath();
      ctx.moveTo(...im);
      ctx.lineTo(...i0);
      ctx.lineTo(...o0);
      ctx.closePath();
      ctx.fill();
    }
    const top = ctx.createLinearGradient(C - 20, C - 20, C + 20, C + 20);
    top.addColorStop(0, '#f6fdff');
    top.addColorStop(1, '#a8dcf5');
    ctx.fillStyle = top;
    ctx.beginPath();
    for (let i = 0; i < n; i++) ctx.lineTo(...inner(i));
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 1.1;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      ctx.moveTo(...outer(i));
      ctx.lineTo(...inner(i));
      ctx.moveTo(...outer(i));
      ctx.lineTo(...inner(i - 1));
    }
    ctx.moveTo(...inner(0));
    for (let i = 1; i <= n; i++) ctx.lineTo(...inner(i % n));
    ctx.moveTo(...outer(0));
    for (let i = 1; i <= n; i++) ctx.lineTo(...outer(i % n));
    ctx.stroke();
    // A snowflake frozen inside.
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI) / 3 + Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(C - Math.cos(a) * 11, C - Math.sin(a) * 11);
      ctx.lineTo(C + Math.cos(a) * 11, C + Math.sin(a) * 11);
      ctx.stroke();
    }
    glint(ctx, C - R * 0.5, C - R * 0.55, 7);
    glint(ctx, C + R * 0.62, C + R * 0.2, 4);
  },
  blush: (ctx) => {
    ball(ctx, ['#fff7f2', '#ffe1d6', '#ffc0b0', '#ff9a8a']);
    face(ctx, { closed: true, blush: 'rgba(255,90,120,0.55)', eye: '#5a2a2a' });
    shine(ctx, 0.6);
  },
  moon: (ctx) => {
    ball(ctx, ['#ffffff', '#e8edf2', '#b9c3cd', '#7d8894']);
    inside(ctx, () => {
      for (const [x, y, r] of [[C + 12, C - 10, 9], [C - 16, C + 12, 7], [C + 8, C + 22, 5], [C - 20, C - 16, 4]] as const) {
        dot(ctx, x, y, r, 'rgba(90,100,112,0.45)');
        dot(ctx, x - 1.5, y - 1.5, r * 0.7, 'rgba(160,170,180,0.5)');
      }
    });
    shine(ctx, 0.5);
  },
  potato: (ctx) => {
    ctx.fillStyle = '#c99a5b';
    ctx.beginPath();
    ctx.ellipse(C, C + 2, R * 1.02, R * 0.84, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#b3824a';
    for (const [x, y] of [[C - 22, C - 14], [C + 24, C + 12], [C - 8, C + 24], [C + 10, C - 22]] as const) dot(ctx, x, y, 3, '#8a5f2e');
    face(ctx, { y: -4, eye: '#3a2512' });
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.ellipse(C - 18, C - 16, 10, 5, -0.5, 0, Math.PI * 2);
    ctx.fill();
  },
  melon: (ctx) => {
    // A watermelon slice: rind rings, red flesh and seeds.
    dot(ctx, C, C, R, '#1f6f22');
    dot(ctx, C, C, R - 3.5, '#62c24a');
    dot(ctx, C, C, R - 6.5, '#e6fbd2');
    const g = ctx.createRadialGradient(C - 6, C - 8, 3, C, C, R - 8);
    g.addColorStop(0, '#ff8a98');
    g.addColorStop(0.6, '#ff4560');
    g.addColorStop(1, '#e01f45');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(C, C, R - 8.5, 0, Math.PI * 2);
    ctx.fill();
    const rand = seeded(11);
    for (let i = 0; i < 40; i++) {
      const a = rand() * Math.PI * 2;
      const r = rand() * (R - 12);
      dot(ctx, C + Math.cos(a) * r, C + Math.sin(a) * r, 0.9 + rand(), 'rgba(255,200,205,0.35)');
    }
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + (i % 2) * 0.15;
      const r = i % 2 ? 18 : 26;
      ctx.save();
      ctx.translate(C + Math.cos(a) * r, C + Math.sin(a) * r);
      ctx.rotate(a + Math.PI / 2);
      ctx.fillStyle = '#1a1010';
      ctx.beginPath();
      ctx.ellipse(0, 0, 2.6, 4.4, 0, 0, Math.PI * 2);
      ctx.fill();
      dot(ctx, -0.8, -1.5, 0.9, 'rgba(255,255,255,0.7)');
      ctx.restore();
    }
    shade(ctx, 0.25);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    ctx.ellipse(C - R * 0.38, C - R * 0.44, 9, 4, -0.7, 0, Math.PI * 2);
    ctx.fill();
  },
  cookie: (ctx) => {
    // A chocolate-chip cookie with a bite out of it.
    const rand = seeded(5);
    const n = 30;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = R - 1 + Math.sin(i * 1.7) * 1.4 + rand() * 1.4;
      ctx.lineTo(C + Math.cos(a) * r, C + Math.sin(a) * r);
    }
    ctx.closePath();
    const g = ctx.createRadialGradient(C - 6, C - 8, 4, C, C, R);
    g.addColorStop(0, '#f6cf88');
    g.addColorStop(0.65, '#e0a55a');
    g.addColorStop(1, '#a8682a');
    ctx.fillStyle = g;
    ctx.fill();
    // Baked cracks and speckles.
    ctx.strokeStyle = 'rgba(140,80,30,0.45)';
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 6; i++) {
      const a = rand() * Math.PI * 2;
      const r = 8 + rand() * 24;
      ctx.beginPath();
      ctx.moveTo(C + Math.cos(a) * r, C + Math.sin(a) * r);
      ctx.lineTo(C + Math.cos(a + 0.25) * (r + 6), C + Math.sin(a + 0.25) * (r + 6));
      ctx.stroke();
    }
    for (let i = 0; i < 30; i++) {
      const a = rand() * Math.PI * 2;
      const r = rand() * (R - 4);
      dot(ctx, C + Math.cos(a) * r, C + Math.sin(a) * r, 0.8, 'rgba(255,240,200,0.5)');
    }
    sunflower(11, R * 0.8, (x, y, k, a) => {
      blob(ctx, x, y, 4.5 + rand() * 2, k * 0.6, a, rand, '#3e2213');
      blob(ctx, x - 1, y - 1.2, 1.8, 0, a, rand, '#7a4a2a');
    });
    // The bite.
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    for (const [a, r] of [[-0.95, 10], [-0.55, 11], [-0.15, 9.5]] as const) dot(ctx, C + Math.cos(a) * (R + 3), C + Math.sin(a) * (R + 3), r, '#000');
    ctx.restore();
    shade(ctx, 0.25);
    for (const [x, y, r] of [[C + 44, C - 6, 1.8], [C + 40, C + 8, 1.3], [C + 47, C - 22, 1.5]] as const) dot(ctx, x, y, r, '#d99a50');
  },
  kitty: (ctx) => {
    ctx.fillStyle = '#ffc6e3';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(C + side * 38, C - 20);
      ctx.lineTo(C + side * 34, C - 58);
      ctx.lineTo(C + side * 10, C - 38);
      ctx.fill();
      ctx.fillStyle = '#ff8ccb';
      ctx.beginPath();
      ctx.moveTo(C + side * 32, C - 28);
      ctx.lineTo(C + side * 31, C - 49);
      ctx.lineTo(C + side * 17, C - 37);
      ctx.fill();
      ctx.fillStyle = '#ffc6e3';
    }
    ball(ctx, ['#ffffff', '#ffe6f3', '#ffc6e3', '#ff9ad5']);
    face(ctx, { blush: 'rgba(255,110,160,0.5)' });
    dot(ctx, C, C + 4, 3, '#ff5c9a');
    ctx.strokeStyle = '#6a4a5a';
    ctx.lineWidth = 1.5;
    for (const side of [-1, 1]) {
      for (const dy of [-3, 4]) {
        ctx.beginPath();
        ctx.moveTo(C + side * 22, C + 6 + dy * 0.3);
        ctx.lineTo(C + side * 42, C + 4 + dy);
        ctx.stroke();
      }
    }
  },
  froggy: (ctx) => {
    ball(ctx, ['#e6ffd6', '#9cf57a', '#4fd13a', '#2a8f1f']);
    for (const side of [-1, 1]) {
      dot(ctx, C + side * 20, C - 36, 14, '#4fd13a');
      dot(ctx, C + side * 20, C - 37, 10, '#ffffff');
      dot(ctx, C + side * 21, C - 36, 5, '#111111');
    }
    ctx.strokeStyle = '#1d5a14';
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(C, C - 2, 26, 0.2 * Math.PI, 0.8 * Math.PI);
    ctx.stroke();
    for (const side of [-1, 1]) dot(ctx, C + side * 26, C + 6, 5, 'rgba(255,120,140,0.45)');
  },
  panda: (ctx) => {
    for (const side of [-1, 1]) dot(ctx, C + side * 32, C - 32, 13, '#1b1b1b');
    ball(ctx, ['#ffffff', '#ffffff', '#e8e8e8', '#b8b8b8']);
    for (const side of [-1, 1]) {
      ctx.fillStyle = '#1b1b1b';
      ctx.beginPath();
      ctx.ellipse(C + side * 15, C - 2, 9, 12, side * -0.5, 0, Math.PI * 2);
      ctx.fill();
      dot(ctx, C + side * 14, C - 4, 3.5, '#ffffff');
    }
    dot(ctx, C, C + 12, 4.5, '#1b1b1b');
  },
  beachball: (ctx) => {
    const colors = ['#ff2f5e', '#ffffff', '#ffd21f', '#ffffff', '#2be8ff', '#ffffff'];
    inside(ctx, () => {
      colors.forEach((c, i) => {
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.moveTo(C, C);
        ctx.arc(C, C, R, (i * Math.PI) / 3 - 0.3, ((i + 1) * Math.PI) / 3 - 0.3);
        ctx.fill();
      });
      const g = ctx.createRadialGradient(C - 14, C - 16, 4, C, C, R);
      g.addColorStop(0, 'rgba(255,255,255,0.35)');
      g.addColorStop(1, 'rgba(0,0,0,0.3)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, S, S);
    });
    dot(ctx, C, C, 5, '#ffffff');
    shine(ctx, 0.7);
  },
  donut: (ctx) => {
    ball(ctx, ['#f5d49a', '#e8b56a', '#c98a3a', '#9a6424']);
    ctx.fillStyle = '#ff8ccb';
    ctx.beginPath();
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const r = R * 0.8 + Math.sin(i * 2.3) * 3;
      ctx.lineTo(C + Math.cos(a) * r, C + Math.sin(a) * r);
    }
    ctx.fill();
    dot(ctx, C, C, 11, '#9a6424');
    dot(ctx, C, C, 8, 'rgba(10,14,20,0.9)');
    const sprinkles = ['#ffffff', '#ffd21f', '#2be8ff', '#3dff6b', '#b36bff'];
    for (let i = 0; i < 16; i++) {
      const a = i * 2.4;
      const r = 17 + (i % 3) * 7;
      ctx.save();
      ctx.translate(C + Math.cos(a) * r, C + Math.sin(a) * r);
      ctx.rotate(a * 3);
      ctx.fillStyle = sprinkles[i % sprinkles.length];
      ctx.fillRect(-3.5, -1.2, 7, 2.4);
      ctx.restore();
    }
    shine(ctx, 0.5);
  },
  soccer: (ctx) => {
    ball(ctx, ['#ffffff', '#ffffff', '#e6e6e6', '#9a9a9a']);
    inside(ctx, () => {
      const pent = (x: number, y: number, r: number) => {
        ctx.fillStyle = '#161616';
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
          const a = -Math.PI / 2 + (i * Math.PI * 2) / 5;
          ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
        }
        ctx.fill();
      };
      pent(C, C, 12);
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i * Math.PI * 2) / 5;
        pent(C + Math.cos(a) * 36, C + Math.sin(a) * 36, 10);
      }
    });
    shine(ctx, 0.6);
  },
  eyeball: (ctx) => {
    ball(ctx, ['#ffffff', '#ffffff', '#f3e6e6', '#d9a8a8']);
    ctx.strokeStyle = 'rgba(220,40,40,0.6)';
    ctx.lineWidth = 1.3;
    for (let i = 0; i < 7; i++) {
      const a = i * 0.9 + 2;
      ctx.beginPath();
      ctx.moveTo(C + Math.cos(a) * R * 0.95, C + Math.sin(a) * R * 0.95);
      ctx.quadraticCurveTo(C + Math.cos(a + 0.3) * 30, C + Math.sin(a + 0.3) * 30, C + Math.cos(a) * 22, C + Math.sin(a) * 22);
      ctx.stroke();
    }
    // Iris looks forward (right, the direction of travel).
    dot(ctx, C + 16, C, 17, '#2a7fd8');
    dot(ctx, C + 16, C, 12, '#5ab0ff');
    dot(ctx, C + 18, C, 8, '#0a0a0a');
    dot(ctx, C + 14, C - 5, 3, '#ffffff');
  },
  bee: (ctx) => {
    // Wings behind, a striped fuzzy body, antennae and a happy face.
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(C + side * 34, C - 28);
      ctx.rotate(side * 1.0);
      ctx.fillStyle = 'rgba(205,235,255,0.5)';
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.ellipse(0, 0, 13, 21, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, 14);
      ctx.lineTo(0, -12);
      ctx.stroke();
      ctx.restore();
    }
    ball(ctx, ['#fffbd0', '#ffe347', '#ffc400', '#d38f00']);
    inside(ctx, () => {
      ctx.fillStyle = '#2a2218';
      for (const [y, t] of [[10, 9], [28, 9]] as const) {
        ctx.beginPath();
        ctx.moveTo(C - R, C + y);
        ctx.quadraticCurveTo(C, C + y + 9, C + R, C + y);
        ctx.lineTo(C + R, C + y + t);
        ctx.quadraticCurveTo(C, C + y + t + 9, C - R, C + y + t);
        ctx.closePath();
        ctx.fill();
      }
    });
    ctx.strokeStyle = '#2a2218';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(C + side * 8, C - R + 3);
      ctx.quadraticCurveTo(C + side * 12, C - R - 12, C + side * 22, C - R - 14);
      ctx.stroke();
      dot(ctx, C + side * 22, C - R - 14, 3.5, '#2a2218');
    }
    face(ctx, { y: -12, blush: 'rgba(255,110,60,0.45)' });
    shade(ctx, 0.3);
    shine(ctx, 0.7);
  },
  disco: (ctx) => {
    // A mirror ball: rows of little mirrors catching coloured lights.
    dot(ctx, C, C, R, '#221c38');
    const rand = seeded(3);
    const step = 13;
    const tilt = -0.3;
    const lx = -0.5;
    const ly = -0.6;
    const lz = 0.62;
    const project = (lat: number, lon: number): [number, number] => {
      const x = Math.cos(lat) * Math.sin(lon);
      const y = Math.sin(lat);
      return [C + R * (x * Math.cos(tilt) - y * Math.sin(tilt)), C + R * (x * Math.sin(tilt) + y * Math.cos(tilt))];
    };
    const colors = ['#ff5cf0', '#2be8ff', '#ffe03a'];
    inside(ctx, () => {
      for (let la = -84; la < 84; la += step) {
        for (let lo = -90; lo < 90; lo += step) {
          const d = (Math.PI / 180) * 0.5;
          const a0 = (la + 0.8) * 2 * d;
          const a1 = (la + step - 0.8) * 2 * d;
          const b0 = (lo + 0.8) * 2 * d;
          const b1 = (lo + step - 0.8) * 2 * d;
          const cl = (a0 + a1) / 2;
          const cb = (b0 + b1) / 2;
          const nx = Math.cos(cl) * Math.sin(cb);
          const ny = Math.sin(cl);
          const nz = Math.cos(cl) * Math.cos(cb);
          const lam = Math.max(0, nx * lx + ny * ly + nz * lz);
          const r = rand();
          const v = Math.round(60 + 170 * lam * (0.55 + r * 0.45));
          ctx.fillStyle = r > 0.82 ? colors[Math.floor(rand() * 3)] : `rgb(${v},${v},${Math.min(255, v + 25)})`;
          ctx.beginPath();
          ctx.moveTo(...project(a0, b0));
          ctx.lineTo(...project(a0, b1));
          ctx.lineTo(...project(a1, b1));
          ctx.lineTo(...project(a1, b0));
          ctx.closePath();
          ctx.fill();
        }
      }
    });
    shade(ctx, 0.45);
    glint(ctx, C - R * 0.42, C - R * 0.4, 10);
    glint(ctx, C + R * 0.35, C - R * 0.62, 5, '#ffe0ff');
    glint(ctx, C + R * 0.1, C + R * 0.5, 4, '#d0faff');
  },
  ghost: (ctx) => {
    // A friendly little ghost with a wavy hem.
    ctx.save();
    ctx.shadowColor = 'rgba(160,210,255,0.9)';
    ctx.shadowBlur = 12;
    const g = ctx.createLinearGradient(0, C - R, 0, C + R);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.65, '#eef6ff');
    g.addColorStop(1, '#c4dcf5');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(C, C - 6, 38, Math.PI, 0);
    ctx.lineTo(C + 38, C + 30);
    const bumps = 4;
    for (let i = 0; i < bumps; i++) {
      const x0 = C + 38 - (i * 76) / bumps;
      const x1 = C + 38 - ((i + 1) * 76) / bumps;
      ctx.quadraticCurveTo((x0 + x1) / 2, C + 46, x1, C + 30);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    shade(ctx, 0.28);
    for (const side of [-1, 1]) {
      ctx.fillStyle = '#20202e';
      ctx.beginPath();
      ctx.ellipse(C + side * 13, C - 8, 5.5, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      dot(ctx, C + side * 13 + 1.5, C - 11, 1.9, '#ffffff');
      dot(ctx, C + side * 22, C + 5, 4.5, 'rgba(255,130,170,0.45)');
    }
    ctx.fillStyle = '#2a2a3a';
    ctx.beginPath();
    ctx.ellipse(C, C + 10, 5, 6.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath();
    ctx.ellipse(C - 18, C - 30, 9, 4.5, -0.6, 0, Math.PI * 2);
    ctx.fill();
  },
  lava: (ctx) => {
    ball(ctx, ['#5a1a0a', '#3a0d05', '#240602', '#120201']);
    ctx.strokeStyle = '#ff7a00';
    ctx.shadowColor = '#ff4a00';
    ctx.shadowBlur = 8;
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    inside(ctx, () => {
      const cracks = [
        [[C - 40, C - 8], [C - 18, C - 2], [C - 6, C - 18], [C + 16, C - 12], [C + 40, C - 24]],
        [[C - 30, C + 26], [C - 10, C + 12], [C + 8, C + 20], [C + 30, C + 8]],
        [[C - 6, C - 18], [C - 2, C - 42]],
        [[C + 8, C + 20], [C + 6, C + 44]],
      ];
      for (const line of cracks) {
        ctx.beginPath();
        line.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.stroke();
      }
    });
    ctx.shadowBlur = 0;
    shine(ctx, 0.35);
  },
  galaxy: (ctx) => {
    ball(ctx, ['#6a3cff', '#3a1a8a', '#1a0a4a', '#08031e']);
    inside(ctx, () => {
      const neb = ctx.createRadialGradient(C + 10, C + 8, 2, C + 10, C + 8, 34);
      neb.addColorStop(0, 'rgba(255,80,190,0.8)');
      neb.addColorStop(1, 'rgba(255,80,190,0)');
      ctx.fillStyle = neb;
      ctx.fillRect(0, 0, S, S);
      for (let i = 0; i < 26; i++) {
        const a = i * 2.39996;
        const r = 4 + ((i * 37) % 40);
        dot(ctx, C + Math.cos(a) * r, C + Math.sin(a) * r, i % 5 === 0 ? 1.8 : 1, '#ffffff');
      }
    });
    shine(ctx, 0.45);
  },
  cyber: (ctx) => {
    ball(ctx, ['#f2f5f8', '#b8c2cc', '#6a7580', '#2a3038']);
    ctx.strokeStyle = 'rgba(20,24,30,0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(C, C, R * 0.72, 0, Math.PI * 2);
    ctx.stroke();
    dot(ctx, C + 10, C, 20, '#1a0508');
    ctx.shadowColor = '#ff2240';
    ctx.shadowBlur = 14;
    dot(ctx, C + 10, C, 12, '#ff2240');
    ctx.shadowBlur = 0;
    dot(ctx, C + 10, C, 5, '#ffd0d6');
    ctx.strokeStyle = 'rgba(255,34,64,0.8)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(C - 30, C);
    ctx.lineTo(C - 12, C);
    ctx.stroke();
    shine(ctx, 0.6);
  },
  pizza: (ctx) => {
    dot(ctx, C, C, R, '#d9822b');
    dot(ctx, C, C, R - 6, '#ffcf5a');
    for (const [x, y] of [[C - 18, C + 14], [C + 20, C + 16], [C - 22, C - 16], [C + 22, C - 18], [C, C + 28]] as const) dot(ctx, x, y, 7, '#d6333f');
    ctx.fillStyle = '#111111';
    ctx.beginPath();
    ctx.roundRect(C - 30, C - 10, 26, 13, 5);
    ctx.roundRect(C + 4, C - 10, 26, 13, 5);
    ctx.fill();
    ctx.fillRect(C - 5, C - 7, 10, 3);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillRect(C - 26, C - 7, 7, 3);
    ctx.fillRect(C + 8, C - 7, 7, 3);
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(C, C + 8, 9, 0.2, Math.PI - 0.2);
    ctx.stroke();
  },
  plasma: (ctx) => {
    // A plasma globe: lightning from a hot core to the glass.
    ball(ctx, ['#3a2a66', '#1c1238', '#0c0720', '#05030e']);
    const rand = seeded(9);
    inside(ctx, () => {
      const core = ctx.createRadialGradient(C, C, 0, C, C, R * 0.6);
      core.addColorStop(0, 'rgba(255,255,255,1)');
      core.addColorStop(0.18, 'rgba(255,160,250,0.9)');
      core.addColorStop(0.45, 'rgba(255,74,240,0.35)');
      core.addColorStop(1, 'rgba(255,74,240,0)');
      ctx.fillStyle = core;
      ctx.fillRect(0, 0, S, S);
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + rand() * 0.5;
        const pts: [number, number][] = [];
        for (let j = 0; j <= 7; j++) {
          const t = j / 7;
          const r = 5 + t * (R - 6);
          const off = j === 0 || j === 7 ? 0 : (rand() - 0.5) * 0.5;
          pts.push([C + Math.cos(a + off) * r, C + Math.sin(a + off) * r]);
        }
        const col = i % 3 === 0 ? '#6af0ff' : '#ff6af5';
        ctx.save();
        ctx.shadowColor = col;
        ctx.shadowBlur = 8;
        ctx.strokeStyle = col;
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        pts.forEach((p, j) => (j ? ctx.lineTo(...p) : ctx.moveTo(...p)));
        ctx.stroke();
        ctx.restore();
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        pts.forEach((p, j) => (j ? ctx.lineTo(...p) : ctx.moveTo(...p)));
        ctx.stroke();
        dot(ctx, pts[7][0], pts[7][1], 2.4, 'rgba(255,230,255,0.9)');
      }
    });
    rimLight(ctx, 'rgba(160,240,255,0.6)', 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(C, C, R * 0.82, 1.1 * Math.PI, 1.4 * Math.PI);
    ctx.stroke();
    shine(ctx, 0.6);
  },
  fishbowl: (ctx) => {
    // A round fishbowl: water, sand, weed, bubbles and a goldfish looking ahead.
    dot(ctx, C, C, R, 'rgba(190,230,255,0.32)');
    inside(ctx, () => {
      const wy = C - 12;
      const water = ctx.createLinearGradient(0, wy, 0, C + R);
      water.addColorStop(0, '#62d6ff');
      water.addColorStop(0.6, '#1f86de');
      water.addColorStop(1, '#0c4fa0');
      ctx.fillStyle = water;
      ctx.beginPath();
      ctx.moveTo(C - R, wy);
      for (let x = -R; x <= R; x += 4) ctx.lineTo(C + x, wy + Math.sin(x * 0.18) * 2.2);
      ctx.lineTo(C + R, C + R);
      ctx.lineTo(C - R, C + R);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (let x = -R; x <= R; x += 4) (x === -R ? ctx.moveTo : ctx.lineTo).call(ctx, C + x, wy + Math.sin(x * 0.18) * 2.2);
      ctx.stroke();
      ctx.fillStyle = '#f0d08a';
      ctx.beginPath();
      ctx.ellipse(C, C + R + 2, R, 13, 0, 0, Math.PI * 2);
      ctx.fill();
      for (const [x, c] of [[-16, '#ff7a9a'], [-4, '#ffffff'], [10, '#7ad0ff'], [22, '#b98cff']] as const) dot(ctx, C + x, C + R - 8, 3, c);
      ctx.strokeStyle = '#3dbb4a';
      ctx.lineWidth = 3.5;
      ctx.lineCap = 'round';
      for (const [x0, h] of [[-26, 30], [-19, 22]] as const) {
        ctx.beginPath();
        ctx.moveTo(C + x0, C + R - 6);
        ctx.quadraticCurveTo(C + x0 - 7, C + R - 6 - h * 0.5, C + x0 + 2, C + R - 6 - h);
        ctx.stroke();
      }
    });
    // Goldfish.
    const fx = C + 4;
    const fy = C + 10;
    ctx.fillStyle = '#ff7a1a';
    ctx.beginPath();
    ctx.moveTo(fx - 10, fy);
    ctx.quadraticCurveTo(fx - 20, fy - 12, fx - 24, fy - 8);
    ctx.quadraticCurveTo(fx - 19, fy, fx - 24, fy + 8);
    ctx.quadraticCurveTo(fx - 20, fy + 12, fx - 10, fy);
    ctx.fill();
    const body = ctx.createLinearGradient(fx, fy - 9, fx, fy + 9);
    body.addColorStop(0, '#ffc060');
    body.addColorStop(1, '#ff6a00');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(fx, fy, 14, 9.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff9a3a';
    ctx.beginPath();
    ctx.ellipse(fx - 2, fy - 8, 6, 3, -0.3, 0, Math.PI * 2);
    ctx.fill();
    dot(ctx, fx + 8, fy - 2, 3.4, '#ffffff');
    dot(ctx, fx + 9, fy - 2, 2, '#111111');
    for (const [x, y, r] of [[fx + 18, fy - 6, 2.2], [fx + 22, fy - 15, 1.7], [fx + 17, fy - 22, 1.3]] as const) {
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Glass.
    ctx.strokeStyle = 'rgba(255,255,255,0.65)';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(C, C, R - 1.1, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.ellipse(C, C - R + 7, 17, 4, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(C, C, R * 0.8, 1.05 * Math.PI, 1.38 * Math.PI);
    ctx.stroke();
    shine(ctx, 0.7);
  },
  crown: (ctx) => {
    ball(ctx, ['#fffbe0', '#ffe066', '#e6b000', '#9a6a00']);
    shine(ctx);
    crown(ctx, C - R + 8, 48, 22);
  },
  blackhole: (ctx) => {
    const glow = ctx.createRadialGradient(C, C, R * 0.4, C, C, R * 1.35);
    glow.addColorStop(0, 'rgba(255,160,60,0.9)');
    glow.addColorStop(0.5, 'rgba(160,80,255,0.35)');
    glow.addColorStop(1, 'rgba(160,80,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, S, S);
    ctx.save();
    ctx.translate(C, C);
    ctx.rotate(-0.35);
    ctx.strokeStyle = '#ffd9a0';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.ellipse(0, 0, R * 1.3, R * 0.32, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    dot(ctx, C, C, R * 0.62, '#000000');
    ctx.strokeStyle = 'rgba(255,220,170,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(C, C, R * 0.64, 0, Math.PI * 2);
    ctx.stroke();
  },
  duckking: (ctx) => {
    ctx.fillStyle = '#ffd21f';
    ctx.strokeStyle = '#c99400';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(C, C + 12, R * 0.95, R * 0.62, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    dot(ctx, C + 6, C - 12, 24, '#ffd21f');
    ctx.fillStyle = '#ff8a1f';
    ctx.beginPath();
    ctx.ellipse(C + 32, C - 8, 12, 6, 0.1, 0, Math.PI * 2);
    ctx.fill();
    dot(ctx, C + 14, C - 18, 4, '#111111');
    dot(ctx, C + 15, C - 19, 1.4, '#ffffff');
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.ellipse(C - 14, C + 4, 14, 5, -0.3, 0, Math.PI * 2);
    ctx.fill();
    crown(ctx, C - 30, 34, 16);
  },
  phoenix: (ctx) => {
    // A firebird: a ring of flames, a blazing body, a fierce eye and a beak.
    const aura = ctx.createRadialGradient(C, C, R * 0.5, C, C, R * 1.42);
    aura.addColorStop(0, 'rgba(255,190,70,0.7)');
    aura.addColorStop(1, 'rgba(255,90,20,0)');
    ctx.fillStyle = aura;
    ctx.fillRect(0, 0, S, S);
    ctx.save();
    ctx.shadowColor = '#ff6a00';
    ctx.shadowBlur = 10;
    const tongues: [number, number, number][] = [
      [-2.2, 18, 12],
      [-1.85, 22, 13],
      [-1.5, 19, 12],
      [-2.6, 15, 11],
      [-3.0, 17, 12],
      [2.75, 15, 11],
      [2.3, 13, 10],
      [-0.6, 12, 10],
    ];
    for (const [a, len, w] of tongues) flame(ctx, C + Math.cos(a) * (R - 6), C + Math.sin(a) * (R - 6), a, len + 6, w);
    ctx.restore();
    ball(ctx, ['#fff8c8', '#ffd24a', '#ff8a1f', '#d6331f']);
    inside(ctx, () => {
      ctx.strokeStyle = 'rgba(190,50,0,0.35)';
      ctx.lineWidth = 2;
      for (let row = 0; row < 3; row++) {
        for (let i = -3; i <= 3; i++) {
          const x = C - 8 + i * 12 + (row % 2) * 6;
          const y = C + 12 + row * 10;
          ctx.beginPath();
          ctx.arc(x, y, 6, 0.15 * Math.PI, 0.85 * Math.PI);
          ctx.stroke();
        }
      }
    });
    // Eye looks ahead (right), with a fiery brow.
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(C + 14, C - 8, 8, 6, -0.15, 0, Math.PI * 2);
    ctx.fill();
    dot(ctx, C + 16, C - 8, 3.6, '#1a0a00');
    dot(ctx, C + 17.5, C - 9.5, 1.3, '#ffffff');
    ctx.strokeStyle = '#a8200a';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(C + 4, C - 18);
    ctx.lineTo(C + 22, C - 15);
    ctx.stroke();
    ctx.fillStyle = '#ffe14a';
    ctx.strokeStyle = '#c47a00';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(C + R - 10, C - 4);
    ctx.lineTo(C + R + 8, C + 2);
    ctx.lineTo(C + R - 9, C + 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    shine(ctx, 0.75);
  },
  cherry: (ctx) => {
    // A glossy cherry: deep red with a dimple on top, a stem and a leaf.
    ball(ctx, ['#ffc4cf', '#ff2a52', '#c20a2e', '#5a0016']);
    inside(ctx, () => {
      const dimple = ctx.createRadialGradient(C + 1, C - R + 5, 1, C + 1, C - R + 5, 16);
      dimple.addColorStop(0, 'rgba(70,0,14,0.6)');
      dimple.addColorStop(1, 'rgba(70,0,14,0)');
      ctx.fillStyle = dimple;
      ctx.fillRect(0, 0, S, S);
      // A darker crease running down from the dimple.
      ctx.strokeStyle = 'rgba(90,0,20,0.35)';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(C + 1, C - R + 8);
      ctx.quadraticCurveTo(C + 8, C - 6, C + 3, C + R - 6);
      ctx.stroke();
    });
    shade(ctx, 0.3);
    rimLight(ctx, 'rgba(255,140,165,0.6)', 2.5);
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.beginPath();
    ctx.ellipse(C - R * 0.4, C - R * 0.32, R * 0.22, R * 0.11, -0.95, 0, Math.PI * 2);
    ctx.fill();
    dot(ctx, C - R * 0.12, C - R * 0.55, 2.6, 'rgba(255,255,255,0.75)');
    dot(ctx, C + R * 0.45, C + R * 0.4, 2.4, 'rgba(255,255,255,0.45)');
    // Stem out of the dimple, with a leaf.
    ctx.strokeStyle = '#3f6a18';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(C + 1, C - R + 7);
    ctx.quadraticCurveTo(C - 3, C - R - 4, C + 10, C - R - 11);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(200,240,140,0.55)';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(C, C - R + 5);
    ctx.quadraticCurveTo(C - 4, C - R - 3, C + 8, C - R - 10);
    ctx.stroke();
    leaf(ctx, C + 8, C - R - 9, -0.05, 26);
  },
  marble: (ctx) => {
    // A glass marble: clear glass with a twisted ribbon of colour inside.
    const glass = ctx.createRadialGradient(C - 12, C - 14, 2, C, C, R);
    glass.addColorStop(0, 'rgba(255,255,255,0.6)');
    glass.addColorStop(0.55, 'rgba(200,238,255,0.26)');
    glass.addColorStop(1, 'rgba(110,180,225,0.6)');
    ctx.fillStyle = glass;
    ctx.beginPath();
    ctx.arc(C, C, R, 0, Math.PI * 2);
    ctx.fill();
    const ribbon = (angle: number, light: string, dark: string, w: number) => {
      ctx.save();
      ctx.translate(C, C);
      ctx.rotate(angle);
      const g = ctx.createLinearGradient(0, -R, 0, R);
      g.addColorStop(0, dark);
      g.addColorStop(0.5, light);
      g.addColorStop(1, dark);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-R, -w * 0.4);
      ctx.bezierCurveTo(-R * 0.35, -R * 0.75 - w, R * 0.35, R * 0.75 - w, R, -w * 0.4);
      ctx.lineTo(R, w * 0.4);
      ctx.bezierCurveTo(R * 0.35, R * 0.75 + w, -R * 0.35, -R * 0.75 + w, -R, w * 0.4);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(-R, -w * 0.1);
      ctx.bezierCurveTo(-R * 0.35, -R * 0.75 - w * 0.6, R * 0.35, R * 0.75 - w * 0.6, R, -w * 0.1);
      ctx.stroke();
      ctx.restore();
    };
    inside(ctx, () => {
      ribbon(0.5, '#ffb08f', '#d8402a', 8);
      ribbon(-1.05, '#8ff5e2', '#159c8c', 6);
      ribbon(2.2, '#fff1a8', '#e0a81f', 3.5);
      // Light focused through the glass, bottom right.
      const c = ctx.createRadialGradient(C + 14, C + 17, 1, C + 14, C + 17, R * 0.6);
      c.addColorStop(0, 'rgba(255,255,255,0.6)');
      c.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = c;
      ctx.fillRect(0, 0, S, S);
    });
    shade(ctx, 0.28);
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(C, C, R - 0.8, 0, Math.PI * 2);
    ctx.stroke();
    rimLight(ctx, 'rgba(220,250,255,0.85)', 2.5);
    shine(ctx, 0.95);
    glint(ctx, C + R * 0.5, C + R * 0.46, 4);
  },
  tennis: (ctx) => {
    // A fuzzy neon tennis ball with its curved white seams.
    ball(ctx, ['#fbffd0', '#eaff4a', '#c4e000', '#6e8a00']);
    const rand = seeded(13);
    inside(ctx, () => {
      // Felt: lots of tiny light and dark fibres.
      sunflower(420, R, (x, y, k) => {
        const a = rand() * Math.PI * 2;
        const l = 1.6 + rand() * 1.8;
        ctx.strokeStyle = rand() < 0.5 ? `rgba(255,255,220,${0.35 - k * 0.15})` : `rgba(90,110,0,${0.28 + k * 0.1})`;
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
        ctx.stroke();
      });
      // The seam: two curves that bulge towards each other.
      for (const side of [-1, 1]) {
        const cx = C + side * R * 1.08;
        ctx.strokeStyle = 'rgba(80,90,20,0.45)';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(cx, C + 1.5, R * 0.78, side < 0 ? -0.95 : Math.PI - 0.95, side < 0 ? 0.95 : Math.PI + 0.95);
        ctx.stroke();
        ctx.strokeStyle = '#fbfff0';
        ctx.lineWidth = 3.6;
        ctx.beginPath();
        ctx.arc(cx, C, R * 0.78, side < 0 ? -0.95 : Math.PI - 0.95, side < 0 ? 0.95 : Math.PI + 0.95);
        ctx.stroke();
      }
    });
    shade(ctx, 0.38);
    // Fuzz sticking out past the edge.
    for (let i = 0; i < 90; i++) {
      const a = (i / 90) * Math.PI * 2 + rand() * 0.05;
      const r0 = R - 1.5;
      const l = 1.5 + rand() * 2.2;
      ctx.strokeStyle = `rgba(230,255,90,${0.35 + rand() * 0.3})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(C + Math.cos(a) * r0, C + Math.sin(a) * r0);
      ctx.lineTo(C + Math.cos(a + 0.03) * (r0 + l), C + Math.sin(a + 0.03) * (r0 + l));
      ctx.stroke();
    }
    shine(ctx, 0.35);
  },
  eightball: (ctx) => {
    // A black billiard ball: deep gloss, a white circle and an 8.
    ball(ctx, ['#7a7a8c', '#2c2c38', '#121218', '#000000']);
    inside(ctx, () => {
      const g = ctx.createRadialGradient(C + 4, C - 2, 2, C + 4, C - 2, 19);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.75, '#f2f2f6');
      g.addColorStop(1, '#c8c8d4');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(C + 5, C - 2, 18, 18.5, 0, 0, Math.PI * 2);
      ctx.fill();
      // The 8: two stacked rings.
      ctx.strokeStyle = '#101014';
      ctx.lineWidth = 3.4;
      ctx.beginPath();
      ctx.ellipse(C + 5, C - 8, 4.6, 4.2, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(C + 5, C + 3.5, 5.6, 5.2, 0, 0, Math.PI * 2);
      ctx.stroke();
    });
    shade(ctx, 0.25);
    rimLight(ctx, 'rgba(150,165,255,0.75)', 2.5);
    // A window reflected in the lacquer.
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.ellipse(C - R * 0.42, C - R * 0.44, R * 0.24, R * 0.12, -0.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.ellipse(C - R * 0.12, C - R * 0.66, R * 0.1, R * 0.05, -0.35, 0, Math.PI * 2);
    ctx.fill();
  },
  egg: (ctx) => {
    // A cream egg, fast asleep: droopy eyelids, a little snore and a Z.
    ctx.save();
    ctx.shadowColor = 'rgba(255,230,170,0.6)';
    ctx.shadowBlur = 6;
    const g = ctx.createRadialGradient(C - 12, C - 14, 3, C, C + 4, R * 1.05);
    g.addColorStop(0, '#fffef6');
    g.addColorStop(0.45, '#fff2d2');
    g.addColorStop(0.85, '#efd39c');
    g.addColorStop(1, '#c79f5e');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(C, C - R - 2);
    ctx.bezierCurveTo(C + R * 0.72, C - R - 2, C + R * 0.95, C + 2, C + R * 0.92, C + R * 0.3);
    ctx.bezierCurveTo(C + R * 0.88, C + R * 0.82, C + R * 0.5, C + R + 1, C, C + R + 1);
    ctx.bezierCurveTo(C - R * 0.5, C + R + 1, C - R * 0.88, C + R * 0.82, C - R * 0.92, C + R * 0.3);
    ctx.bezierCurveTo(C - R * 0.95, C + 2, C - R * 0.72, C - R - 2, C, C - R - 2);
    ctx.fill();
    ctx.restore();
    const rand = seeded(21);
    for (let i = 0; i < 14; i++) {
      const a = rand() * Math.PI * 2;
      const r = 8 + rand() * 26;
      dot(ctx, C + Math.cos(a) * r * 0.8, C + Math.sin(a) * r, 0.8 + rand() * 0.9, 'rgba(190,140,80,0.35)');
    }
    const ey = C + 6;
    ctx.strokeStyle = '#4a3420';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    for (const x of [C - 13, C + 13]) {
      // Sleepy: eyelids curving down, with tiny lashes.
      ctx.beginPath();
      ctx.arc(x, ey - 3, 6.5, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
      ctx.lineWidth = 1.6;
      for (const t of [0.35, 0.5, 0.65]) {
        const a = t * Math.PI;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(a) * 6.5, ey - 3 + Math.sin(a) * 6.5);
        ctx.lineTo(x + Math.cos(a) * 9, ey - 3 + Math.sin(a) * 9);
        ctx.stroke();
      }
      ctx.lineWidth = 3;
    }
    for (const x of [C - 24, C + 24]) dot(ctx, x, ey + 9, 5.2, 'rgba(255,140,120,0.45)');
    ctx.fillStyle = '#6a3a28';
    ctx.beginPath();
    ctx.ellipse(C, ey + 14, 3.2, 2.6, 0, 0, Math.PI * 2);
    ctx.fill();
    // Z z.
    ctx.strokeStyle = '#7fb8ff';
    ctx.lineJoin = 'round';
    for (const [x, y, s, w] of [[C + 22, C - 30, 9, 2.6], [C + 34, C - 44, 6, 2]] as const) {
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(x - s / 2, y - s / 2);
      ctx.lineTo(x + s / 2, y - s / 2);
      ctx.lineTo(x - s / 2, y + s / 2);
      ctx.lineTo(x + s / 2, y + s / 2);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.ellipse(C - R * 0.36, C - R * 0.5, 9, 4.5, -0.8, 0, Math.PI * 2);
    ctx.fill();
  },
  pumpkin: (ctx) => {
    // A jack-o'-lantern: ribbed orange shell, a curly stem and a carved grin with a candle inside.
    const ribs: [number, number][] = [[-27, 17], [27, 17], [-14, 19], [14, 19], [0, 20]];
    for (const [x, w] of ribs) {
      const g = ctx.createRadialGradient(C + x - w * 0.3, C - 14, 2, C + x, C + 2, R);
      g.addColorStop(0, '#ffd08a');
      g.addColorStop(0.35, '#ff9a24');
      g.addColorStop(0.8, '#e2600a');
      g.addColorStop(1, '#9a3a00');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(C + x, C + 3, w, R * 0.9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(120,40,0,0.45)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    // Stem.
    ctx.fillStyle = '#5f7f22';
    ctx.strokeStyle = '#3a5212';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(C - 5, C - R + 4);
    ctx.quadraticCurveTo(C - 4, C - R - 10, C + 6, C - R - 14);
    ctx.lineTo(C + 9, C - R - 9);
    ctx.quadraticCurveTo(C + 3, C - R - 6, C + 5, C - R + 4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = '#6f9a2a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(C + 6, C - R - 6);
    ctx.bezierCurveTo(C + 20, C - R - 12, C + 22, C - R + 2, C + 14, C - R - 1);
    ctx.stroke();
    // Carved face, lit from inside.
    ctx.save();
    ctx.shadowColor = '#ffcf3a';
    ctx.shadowBlur = 10;
    const lit = ctx.createRadialGradient(C, C + 6, 2, C, C + 6, 34);
    lit.addColorStop(0, '#fff6b0');
    lit.addColorStop(0.5, '#ffd23a');
    lit.addColorStop(1, '#ff8a00');
    ctx.fillStyle = lit;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(C + side * 6, C - 4);
      ctx.lineTo(C + side * 24, C - 4);
      ctx.lineTo(C + side * 14, C - 19);
      ctx.closePath();
      ctx.fill();
    }
    ctx.beginPath();
    ctx.moveTo(C - 4, C + 5);
    ctx.lineTo(C + 4, C + 5);
    ctx.lineTo(C, C - 1);
    ctx.closePath();
    ctx.fill();
    // The grin, with two teeth.
    ctx.beginPath();
    ctx.moveTo(C - 27, C + 10);
    ctx.quadraticCurveTo(C, C + 34, C + 27, C + 10);
    ctx.quadraticCurveTo(C + 18, C + 15, C + 12, C + 13);
    ctx.lineTo(C + 9, C + 19);
    ctx.lineTo(C + 4, C + 15);
    ctx.quadraticCurveTo(C, C + 16, C - 4, C + 15);
    ctx.lineTo(C - 9, C + 19);
    ctx.lineTo(C - 12, C + 13);
    ctx.quadraticCurveTo(C - 18, C + 15, C - 27, C + 10);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath();
    ctx.ellipse(C - 22, C - 22, 7, 4, -0.7, 0, Math.PI * 2);
    ctx.fill();
  },
  owl: (ctx) => {
    // A night owl: feather tufts, a pale facial disc and huge amber eyes.
    ctx.fillStyle = '#7a5636';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(C + side * 14, C - R + 10);
      ctx.quadraticCurveTo(C + side * 30, C - R - 6, C + side * 40, C - R - 14);
      ctx.quadraticCurveTo(C + side * 38, C - R + 6, C + side * 34, C - 20);
      ctx.closePath();
      ctx.fill();
    }
    ball(ctx, ['#f0dcbc', '#b88c5c', '#7a5636', '#45301c']);
    inside(ctx, () => {
      // Chest feathers: little V marks.
      ctx.strokeStyle = 'rgba(70,45,25,0.55)';
      ctx.lineWidth = 1.6;
      ctx.lineCap = 'round';
      for (let row = 0; row < 3; row++) {
        for (let i = -2; i <= 2; i++) {
          const x = C + i * 10 + (row % 2) * 5;
          const y = C + 22 + row * 8;
          ctx.beginPath();
          ctx.moveTo(x - 3, y - 2);
          ctx.lineTo(x, y + 1.5);
          ctx.lineTo(x + 3, y - 2);
          ctx.stroke();
        }
      }
    });
    // Facial disc: two pale rings round the eyes.
    for (const side of [-1, 1]) {
      const g = ctx.createRadialGradient(C + side * 15, C - 6, 4, C + side * 15, C - 6, 21);
      g.addColorStop(0, '#fff6e6');
      g.addColorStop(0.75, '#ead2ad');
      g.addColorStop(1, 'rgba(200,160,110,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(C + side * 15, C - 6, 21, 0, Math.PI * 2);
      ctx.fill();
    }
    shade(ctx, 0.3);
    for (const side of [-1, 1]) {
      const x = C + side * 15;
      const y = C - 6;
      dot(ctx, x, y, 13.5, '#2a1a0a');
      const iris = ctx.createRadialGradient(x, y, 2, x, y, 12.5);
      iris.addColorStop(0, '#fff3a0');
      iris.addColorStop(0.55, '#ffc23a');
      iris.addColorStop(1, '#e07a00');
      ctx.fillStyle = iris;
      ctx.beginPath();
      ctx.arc(x, y, 12.5, 0, Math.PI * 2);
      ctx.fill();
      dot(ctx, x + side * 0.5, y + 0.5, 7, '#0a0604');
      dot(ctx, x + 3, y - 4, 2.8, '#ffffff');
      dot(ctx, x - 3, y + 3, 1.2, 'rgba(255,255,255,0.8)');
    }
    // Beak.
    ctx.fillStyle = '#ffb02e';
    ctx.strokeStyle = '#9a5a00';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(C - 5, C + 4);
    ctx.lineTo(C + 5, C + 4);
    ctx.lineTo(C, C + 15);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    shine(ctx, 0.45);
  },
  penguin: (ctx) => {
    // A penguin: black head, a white heart-shaped face, an orange beak.
    ball(ctx, ['#626a80', '#2a2f3e', '#14161f', '#05060a']);
    inside(ctx, () => {
      const g = ctx.createLinearGradient(0, C - 30, 0, C + R);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(1, '#d6dde8');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(C, C - 10);
      ctx.bezierCurveTo(C - 8, C - 30, C - 34, C - 26, C - 31, C - 2);
      ctx.bezierCurveTo(C - 30, C + 16, C - 22, C + R, C, C + R + 4);
      ctx.bezierCurveTo(C + 22, C + R, C + 30, C + 16, C + 31, C - 2);
      ctx.bezierCurveTo(C + 34, C - 26, C + 8, C - 30, C, C - 10);
      ctx.fill();
    });
    shade(ctx, 0.3);
    rimLight(ctx, 'rgba(150,215,255,0.7)', 2.2);
    for (const side of [-1, 1]) {
      dot(ctx, C + side * 13, C - 4, 5.5, '#14161f');
      dot(ctx, C + side * 13 + 2, C - 6, 1.9, '#ffffff');
      dot(ctx, C + side * 23, C + 9, 5, 'rgba(255,130,160,0.5)');
    }
    // Beak: two orange halves.
    ctx.fillStyle = '#ffa31a';
    ctx.strokeStyle = '#b8600a';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(C - 8, C + 5);
    ctx.quadraticCurveTo(C, C + 1, C + 8, C + 5);
    ctx.quadraticCurveTo(C + 3, C + 15, C, C + 16);
    ctx.quadraticCurveTo(C - 3, C + 15, C - 8, C + 5);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(150,70,0,0.6)';
    ctx.beginPath();
    ctx.moveTo(C - 6, C + 8);
    ctx.quadraticCurveTo(C, C + 10, C + 6, C + 8);
    ctx.stroke();
    shine(ctx, 0.6);
  },
  robot: (ctx) => {
    // A chrome robot head: bolts, an antenna, a visor with LED eyes.
    ctx.strokeStyle = '#9aa6b4';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(C, C - 36);
    ctx.lineTo(C, C - 52);
    ctx.stroke();
    ctx.save();
    ctx.shadowColor = '#ff4a6a';
    ctx.shadowBlur = 10;
    dot(ctx, C, C - 54, 5, '#ff4a6a');
    ctx.restore();
    dot(ctx, C - 1.5, C - 55.5, 1.6, '#ffd0d8');
    for (const side of [-1, 1]) {
      ctx.fillStyle = '#7a8696';
      ctx.beginPath();
      ctx.roundRect(C + side * 40 - 5, C - 12, 10, 24, 4);
      ctx.fill();
    }
    const chrome = ctx.createLinearGradient(0, C - 38, 0, C + 40);
    chrome.addColorStop(0, '#ffffff');
    chrome.addColorStop(0.18, '#c8d2de');
    chrome.addColorStop(0.42, '#7a8696');
    chrome.addColorStop(0.5, '#e6edf5');
    chrome.addColorStop(0.75, '#9aa6b4');
    chrome.addColorStop(1, '#4a5462');
    ctx.fillStyle = chrome;
    ctx.beginPath();
    ctx.roundRect(C - 38, C - 38, 76, 78, 22);
    ctx.fill();
    ctx.strokeStyle = 'rgba(40,48,60,0.7)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    for (const [x, y] of [[C - 30, C - 30], [C + 30, C - 30], [C - 30, C + 32], [C + 30, C + 32]] as const) {
      dot(ctx, x, y, 2.6, '#5a6676');
      dot(ctx, x - 0.6, y - 0.6, 1.1, '#ffffff');
    }
    // Visor and LED eyes.
    ctx.fillStyle = '#0c1424';
    ctx.beginPath();
    ctx.roundRect(C - 29, C - 17, 58, 24, 11);
    ctx.fill();
    ctx.save();
    ctx.shadowColor = '#3d9bff';
    ctx.shadowBlur = 10;
    ctx.fillStyle = '#7cc4ff';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.roundRect(C + side * 12 - 6, C - 11, 12, 12, 4);
      ctx.fill();
    }
    ctx.restore();
    for (const side of [-1, 1]) dot(ctx, C + side * 12 - 2, C - 8, 1.6, '#ffffff');
    // LED smile.
    ctx.fillStyle = '#3d9bff';
    for (let i = -3; i <= 3; i++) {
      const y = C + 20 - (Math.abs(i) === 3 ? 3 : 0);
      ctx.fillRect(C + i * 6 - 2, y, 4, 4);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath();
    ctx.ellipse(C - 22, C - 29, 9, 3.5, -0.3, 0, Math.PI * 2);
    ctx.fill();
  },
  hamster: (ctx) => {
    // A hamster in a clear hamster ball: vent slots, a seam, and a chubby face inside.
    const glass = ctx.createRadialGradient(C - 12, C - 14, 2, C, C, R);
    glass.addColorStop(0, 'rgba(255,255,255,0.45)');
    glass.addColorStop(0.6, 'rgba(190,240,255,0.22)');
    glass.addColorStop(1, 'rgba(120,200,240,0.55)');
    ctx.fillStyle = glass;
    ctx.beginPath();
    ctx.arc(C, C, R, 0, Math.PI * 2);
    ctx.fill();
    inside(ctx, () => {
      // Ears, head, cheeks.
      for (const side of [-1, 1]) {
        dot(ctx, C + side * 17, C - 13, 8, '#e0904a');
        dot(ctx, C + side * 17, C - 13, 4.5, '#ffb4b4');
      }
      const fur = ctx.createRadialGradient(C - 6, C - 2, 3, C, C + 8, 34);
      fur.addColorStop(0, '#ffd7a0');
      fur.addColorStop(0.7, '#f0a050');
      fur.addColorStop(1, '#c0702a');
      ctx.fillStyle = fur;
      ctx.beginPath();
      ctx.ellipse(C, C + 10, 30, 26, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff4e4';
      ctx.beginPath();
      ctx.ellipse(C, C + 20, 21, 17, 0, 0, Math.PI * 2);
      ctx.fill();
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(C + side * 14, C + 14, 9, 7.5, 0, 0, Math.PI * 2);
        ctx.fill();
        dot(ctx, C + side * 17, C + 15, 4, 'rgba(255,130,140,0.45)');
        dot(ctx, C + side * 9, C + 4, 3.6, '#1a1008');
        dot(ctx, C + side * 9 + 1.2, C + 2.8, 1.3, '#ffffff');
      }
      dot(ctx, C, C + 10, 2.4, '#ff7a8a');
      ctx.strokeStyle = '#6a4024';
      ctx.lineWidth = 1.4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(C, C + 12);
      ctx.lineTo(C, C + 14.5);
      ctx.arc(C - 2.5, C + 14.5, 2.5, 0, Math.PI * 0.9);
      ctx.moveTo(C, C + 14.5);
      ctx.arc(C + 2.5, C + 14.5, 2.5, Math.PI, Math.PI * 0.1, true);
      ctx.stroke();
      // Little paws on the glass.
      for (const side of [-1, 1]) dot(ctx, C + side * 9, C + 30, 4, '#ffd7a0');
    });
    // The ball's seam and vent slots.
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(C, C, R - 1, R * 0.32, -0.25, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(40,110,150,0.45)';
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI * 0.9 + i * 0.27;
      const r0 = R - 9;
      ctx.beginPath();
      ctx.moveTo(C + Math.cos(a) * r0, C + Math.sin(a) * r0 * 0.95);
      ctx.lineTo(C + Math.cos(a) * (r0 - 6), C + Math.sin(a) * (r0 - 6) * 0.95);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(C, C, R - 0.8, 0, Math.PI * 2);
    ctx.stroke();
    rimLight(ctx, 'rgba(220,250,255,0.8)', 2.5);
    shine(ctx, 0.9);
  },
  bunny: (ctx) => {
    // A white bunny: long ears with pink insides, a twitchy nose and buck teeth.
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(C + side * 15, C - 31);
      ctx.rotate(side * 0.22);
      const g = ctx.createLinearGradient(-8, 0, 8, 0);
      g.addColorStop(0, '#e6e0f2');
      g.addColorStop(0.5, '#ffffff');
      g.addColorStop(1, '#d8d0e6');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(0, -8, 10, 22, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffb3d0';
      ctx.beginPath();
      ctx.ellipse(0, -7, 5, 16, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ball(ctx, ['#ffffff', '#fbf8ff', '#e6def2', '#b8aecb']);
    for (const side of [-1, 1]) {
      dot(ctx, C + side * 14, C - 4, 5.8, '#2a1f33');
      dot(ctx, C + side * 14 + 2, C - 6.5, 2.1, '#ffffff');
      dot(ctx, C + side * 24, C + 9, 5.5, 'rgba(255,140,180,0.5)');
    }
    // Nose, mouth, teeth.
    ctx.fillStyle = '#ff7aa8';
    ctx.beginPath();
    ctx.moveTo(C - 4.5, C + 4);
    ctx.lineTo(C + 4.5, C + 4);
    ctx.lineTo(C, C + 9);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#6a4a6a';
    ctx.lineWidth = 1.8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(C, C + 9);
    ctx.lineTo(C, C + 12);
    ctx.arc(C - 4, C + 12, 4, 0, Math.PI * 0.85);
    ctx.moveTo(C, C + 12);
    ctx.arc(C + 4, C + 12, 4, Math.PI, Math.PI * 0.15, true);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#9a8aa8';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(C - 3.6, C + 13.5, 3.4, 5, 1);
    ctx.roundRect(C + 0.2, C + 13.5, 3.4, 5, 1);
    ctx.fill();
    ctx.stroke();
    // Whisker dots.
    for (const side of [-1, 1]) for (const [dx, dy] of [[10, 9], [13, 12], [9, 13]] as const) dot(ctx, C + side * dx, C + dy, 0.9, '#b8a0b8');
    shine(ctx, 0.6);
  },
  octopus: (ctx) => {
    // A purple octopus: curly little tentacles with suckers, a spotty head, big eyes.
    const tentacles: [number, number][] = [[-2.5, -1], [-1.75, 1], [-1.0, -1], [-0.3, 1], [0.3, -1], [1.0, 1], [1.75, -1], [2.5, 1]];
    for (const [a0, curl] of tentacles) {
      // A tapered tube that curls at the tip: stacked dots along a turning path.
      let heading = Math.PI / 2 + a0 * 0.44;
      let x = C + Math.cos(heading) * (R - 12);
      let y = C + Math.sin(heading) * (R - 12);
      const pts: [number, number, number][] = [];
      for (let i = 0; i < 26; i++) {
        const t = i / 25;
        pts.push([x, y, 6.2 * (1 - t * 0.72)]);
        heading += curl * (0.015 + 0.2 * t * t);
        x += Math.cos(heading) * 1.25;
        y += Math.sin(heading) * 1.25;
      }
      for (const [px, py, r] of pts) dot(ctx, px, py, r + 1.3, '#4a1488');
      for (const [px, py, r] of pts) dot(ctx, px, py, r, '#a54af0');
      for (const [px, py, r] of pts) dot(ctx, px - r * 0.3, py - r * 0.35, r * 0.45, 'rgba(230,180,255,0.55)');
      for (let i = 6; i < 24; i += 5) dot(ctx, pts[i][0], pts[i][1] + pts[i][2] * 0.35, 1.3, '#ffd0f4');
    }
    ball(ctx, ['#f6e2ff', '#c47aff', '#8a2fe0', '#43107e']);
    inside(ctx, () => {
      for (const [x, y, r] of [[C - 20, C - 26, 4.5], [C + 4, C - 34, 3.5], [C + 22, C - 22, 5], [C - 30, C - 8, 3], [C + 31, C - 4, 2.8]] as const) {
        dot(ctx, x, y, r, 'rgba(240,190,255,0.55)');
      }
    });
    shade(ctx, 0.3);
    for (const side of [-1, 1]) {
      dot(ctx, C + side * 14, C + 2, 9, '#ffffff');
      dot(ctx, C + side * 14 + side * 0.5, C + 3, 6, '#1a0828');
      dot(ctx, C + side * 14 + 2.5, C - 0.5, 2.3, '#ffffff');
      dot(ctx, C + side * 25, C + 13, 5, 'rgba(255,120,200,0.5)');
    }
    ctx.strokeStyle = '#3a0a5a';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.ellipse(C, C + 16, 3.4, 2.6, 0, 0, Math.PI * 2);
    ctx.stroke();
    shine(ctx, 0.7);
  },
  ufo: (ctx) => {
    // A flying saucer: a little green alien under a glass dome, rim lights all round.
    const beam = ctx.createLinearGradient(0, C + 14, 0, C + R + 14);
    beam.addColorStop(0, 'rgba(160,255,120,0.45)');
    beam.addColorStop(1, 'rgba(160,255,120,0)');
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.moveTo(C - 14, C + 16);
    ctx.lineTo(C + 14, C + 16);
    ctx.lineTo(C + 30, C + R + 14);
    ctx.lineTo(C - 30, C + R + 14);
    ctx.closePath();
    ctx.fill();
    // The dome: glass with the alien inside.
    const dy = C - 8;
    dot(ctx, C, dy, 31, 'rgba(170,240,255,0.25)');
    ctx.save();
    ctx.beginPath();
    ctx.arc(C, dy, 31, 0, Math.PI * 2);
    ctx.clip();
    for (const side of [-1, 1]) {
      ctx.strokeStyle = '#5ad42a';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(C + side * 6, dy - 14);
      ctx.quadraticCurveTo(C + side * 12, dy - 26, C + side * 16, dy - 26);
      ctx.stroke();
      dot(ctx, C + side * 16, dy - 26, 3.2, '#c8ff6a');
    }
    const skin = ctx.createRadialGradient(C - 5, dy - 4, 2, C, dy + 2, 22);
    skin.addColorStop(0, '#d8ff9a');
    skin.addColorStop(0.6, '#7ce03a');
    skin.addColorStop(1, '#3a9a14');
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.ellipse(C, dy + 4, 18, 21, 0, 0, Math.PI * 2);
    ctx.fill();
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(C + side * 8, dy + 1);
      ctx.rotate(side * 0.45);
      ctx.fillStyle = '#0c1408';
      ctx.beginPath();
      ctx.ellipse(0, 0, 5.5, 8.5, 0, 0, Math.PI * 2);
      ctx.fill();
      dot(ctx, -1.5, -3.5, 1.8, '#ffffff');
      ctx.restore();
    }
    ctx.strokeStyle = '#2a6a10';
    ctx.lineWidth = 1.8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(C, dy + 12, 4, 0.2 * Math.PI, 0.8 * Math.PI);
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(C, dy, 26, 1.1 * Math.PI, 1.42 * Math.PI);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(200,250,255,0.6)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(C, dy, 30.5, Math.PI, 0);
    ctx.stroke();
    // The saucer.
    const metal = ctx.createLinearGradient(0, C + 2, 0, C + 26);
    metal.addColorStop(0, '#f2f6fa');
    metal.addColorStop(0.35, '#a8b4c4');
    metal.addColorStop(0.6, '#5a6676');
    metal.addColorStop(1, '#2a3240');
    ctx.fillStyle = metal;
    ctx.beginPath();
    ctx.ellipse(C, C + 13, 56, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#c8d2de';
    ctx.beginPath();
    ctx.ellipse(C, C + 9, 40, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    const lights = ['#ff5a8a', '#ffe14a', '#4affd0', '#ff5a8a', '#ffe14a', '#4affd0', '#ff5a8a'];
    lights.forEach((c, i) => {
      const t = (i / (lights.length - 1)) * 2 - 1;
      ctx.save();
      ctx.shadowColor = c;
      ctx.shadowBlur = 6;
      dot(ctx, C + t * 44, C + 15 + (1 - t * t) * 4, 3, c);
      ctx.restore();
    });
  },
  ninja: (ctx) => {
    // A ninja: black hood, a slit for fierce eyes, a red headband with flowing tails.
    for (const [dy, len, w] of [[-14, 30, 7], [-8, 24, 6]] as const) {
      ctx.save();
      ctx.translate(C + R - 6, C + dy);
      ctx.rotate(0.35 + dy * 0.02);
      ctx.fillStyle = '#c81c34';
      ctx.beginPath();
      ctx.moveTo(0, -w / 2);
      ctx.quadraticCurveTo(len * 0.5, -w, len, -w * 0.2);
      ctx.lineTo(len - 3, w * 0.5);
      ctx.quadraticCurveTo(len * 0.5, 0, 0, w / 2);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ball(ctx, ['#5f6478', '#2c2f3e', '#16171f', '#07070b']);
    inside(ctx, () => {
      // Hood folds.
      ctx.strokeStyle = 'rgba(120,128,160,0.35)';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      for (const [x0, y0, x1, y1] of [[C - 30, C + 18, C - 12, C + 32], [C + 28, C + 16, C + 12, C + 34], [C - 4, C + 26, C + 4, C + 40]] as const) {
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.quadraticCurveTo((x0 + x1) / 2 + 4, (y0 + y1) / 2, x1, y1);
        ctx.stroke();
      }
      // Headband.
      const band = ctx.createLinearGradient(0, C - 30, 0, C - 18);
      band.addColorStop(0, '#ff4a5e');
      band.addColorStop(1, '#a8102a');
      ctx.fillStyle = band;
      ctx.beginPath();
      ctx.moveTo(C - R, C - 30);
      ctx.quadraticCurveTo(C, C - 36, C + R, C - 28);
      ctx.lineTo(C + R, C - 16);
      ctx.quadraticCurveTo(C, C - 24, C - R, C - 18);
      ctx.closePath();
      ctx.fill();
    });
    // Metal plate on the band.
    const plate = ctx.createLinearGradient(0, C - 33, 0, C - 20);
    plate.addColorStop(0, '#f2f6fa');
    plate.addColorStop(1, '#7a8696');
    ctx.fillStyle = plate;
    ctx.beginPath();
    ctx.roundRect(C - 11, C - 33, 22, 12, 3);
    ctx.fill();
    ctx.fillStyle = '#3a4250';
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4 + Math.PI / 4;
      const r = i % 2 === 0 ? 4.6 : 1.4;
      ctx.lineTo(C + Math.cos(a) * r, C - 27 + Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
    // The eye slit and the eyes.
    ctx.fillStyle = '#f2c69a';
    ctx.beginPath();
    ctx.roundRect(C - 30, C - 14, 60, 18, 9);
    ctx.fill();
    for (const side of [-1, 1]) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(C + side * 12, C - 5, 7, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      dot(ctx, C + side * 12 + 1.5, C - 4.5, 3.3, '#14161f');
      dot(ctx, C + side * 12 + 2.5, C - 5.8, 1.1, '#ffffff');
      // Brows, angled down to the middle.
      ctx.strokeStyle = '#14161f';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(C + side * 20, C - 13);
      ctx.lineTo(C + side * 5, C - 9);
      ctx.stroke();
    }
    shine(ctx, 0.4);
  },
  dragon: (ctx) => {
    // A baby dragon: teal scales, ivory horns, a spiky crest, slit-pupil eyes, a smoky snout.
    for (const side of [-1, 1]) {
      const g = ctx.createLinearGradient(C + side * 16, C - 30, C + side * 30, C - 58);
      g.addColorStop(0, '#d8c8a0');
      g.addColorStop(1, '#fff8e6');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(C + side * 10, C - 34);
      ctx.quadraticCurveTo(C + side * 22, C - 50, C + side * 34, C - 58);
      ctx.quadraticCurveTo(C + side * 30, C - 42, C + side * 26, C - 28);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(140,120,80,0.5)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.fillStyle = '#0e8a7a';
    for (const [x, h] of [[-5, 10], [5, 9]] as const) {
      ctx.beginPath();
      ctx.moveTo(C + x - 5, C - R + 4);
      ctx.lineTo(C + x, C - R - h);
      ctx.lineTo(C + x + 5, C - R + 4);
      ctx.closePath();
      ctx.fill();
    }
    ball(ctx, ['#e0fff7', '#45f0d2', '#14b39a', '#08504a']);
    inside(ctx, () => {
      ctx.strokeStyle = 'rgba(8,80,70,0.4)';
      ctx.lineWidth = 1.6;
      for (let row = 0; row < 4; row++) {
        for (let i = -4; i <= 4; i++) {
          const x = C + i * 11 + (row % 2) * 5.5;
          const y = C - 38 + row * 8;
          ctx.beginPath();
          ctx.arc(x, y, 5.5, 0.1 * Math.PI, 0.9 * Math.PI);
          ctx.stroke();
        }
      }
      // A pale belly / snout.
      const g = ctx.createRadialGradient(C, C + 20, 2, C, C + 20, 26);
      g.addColorStop(0, '#fff2c8');
      g.addColorStop(0.8, '#ffe0a0');
      g.addColorStop(1, 'rgba(255,224,160,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(C, C + 20, 26, 20, 0, 0, Math.PI * 2);
      ctx.fill();
    });
    shade(ctx, 0.3);
    for (const side of [-1, 1]) {
      const x = C + side * 15;
      const y = C - 6;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(x, y, 9, 8.5, 0, 0, Math.PI * 2);
      ctx.fill();
      const iris = ctx.createRadialGradient(x, y, 1, x, y, 7.5);
      iris.addColorStop(0, '#fff6a0');
      iris.addColorStop(1, '#ffb800');
      ctx.fillStyle = iris;
      ctx.beginPath();
      ctx.arc(x + side, y + 0.5, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#140c00';
      ctx.beginPath();
      ctx.ellipse(x + side, y + 0.5, 2, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      dot(ctx, x + 3, y - 3, 1.8, '#ffffff');
    }
    // Nostrils, a grin and two little fangs.
    for (const side of [-1, 1]) dot(ctx, C + side * 6, C + 13, 2, '#7a4a1a');
    ctx.strokeStyle = '#5a3410';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(C - 13, C + 21);
    ctx.quadraticCurveTo(C, C + 28, C + 13, C + 21);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(C + side * 8 - 2.5, C + 23.5);
      ctx.lineTo(C + side * 8 + 2.5, C + 23.5);
      ctx.lineTo(C + side * 8, C + 28);
      ctx.closePath();
      ctx.fill();
    }
    // A puff of smoke.
    for (const [x, y, r, a] of [[C + 14, C + 7, 3, 0.5], [C + 20, C + 2, 4, 0.4], [C + 27, C - 4, 5, 0.3]] as const) {
      dot(ctx, x, y, r, `rgba(220,230,235,${a})`);
    }
    shine(ctx, 0.55);
  },
  storm: (ctx) => {
    // A storm cloud: a dark puffy cloud with grumpy eyes and a crackling bolt.
    const puffs: [number, number, number][] = [[-22, 6, 21], [22, 6, 21], [-10, -12, 24], [14, -14, 22], [0, 10, 24]];
    ctx.save();
    ctx.shadowColor = 'rgba(160,180,255,0.6)';
    ctx.shadowBlur = 10;
    for (const [x, y, r] of puffs) {
      const g = ctx.createRadialGradient(C + x - r * 0.3, C + y - r * 0.4, 2, C + x, C + y, r);
      g.addColorStop(0, '#b4bcd8');
      g.addColorStop(0.6, '#5a6080');
      g.addColorStop(1, '#2a2e44');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(C + x, C + y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    // The bolt, below the cloud.
    ctx.save();
    ctx.shadowColor = '#fff27a';
    ctx.shadowBlur = 12;
    ctx.fillStyle = '#fff27a';
    ctx.beginPath();
    ctx.moveTo(C + 4, C + 20);
    ctx.lineTo(C - 10, C + 40);
    ctx.lineTo(C - 1, C + 40);
    ctx.lineTo(C - 8, C + 58);
    ctx.lineTo(C + 13, C + 33);
    ctx.lineTo(C + 3, C + 33);
    ctx.lineTo(C + 12, C + 20);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(C + 6, C + 23);
    ctx.lineTo(C - 4, C + 37);
    ctx.lineTo(C + 1, C + 37);
    ctx.lineTo(C + 6, C + 28);
    ctx.closePath();
    ctx.fill();
    // Grumpy face.
    for (const side of [-1, 1]) {
      dot(ctx, C + side * 12, C - 2, 4.5, '#0c0e18');
      dot(ctx, C + side * 12 + 1.5, C - 3.5, 1.5, '#ffffff');
      ctx.strokeStyle = '#0c0e18';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(C + side * 19, C - 13);
      ctx.lineTo(C + side * 6, C - 9);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(C, C + 13, 6, 1.15 * Math.PI, 1.85 * Math.PI);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    ctx.ellipse(C - 16, C - 26, 9, 4, -0.5, 0, Math.PI * 2);
    ctx.fill();
  },
  unicorn: (ctx) => {
    // A unicorn: pearly white, a rainbow mane flowing down the back, a golden spiral horn.
    const mane = ['#ff5aa0', '#ff9a3a', '#ffe14a', '#5ae07a', '#4ab8ff', '#a06bff'];
    ctx.lineCap = 'round';
    mane.forEach((c, i) => {
      // Locks from the crown sweeping down the left side, behind the head.
      ctx.strokeStyle = c;
      ctx.lineWidth = 8.5;
      ctx.beginPath();
      ctx.moveTo(C + 4 - i * 4, C - R + 4 + i * 3);
      ctx.bezierCurveTo(C - 30 - i * 3, C - R - 4 + i * 4, C - R - 12 + i, C - 10 + i * 6, C - R - 4 + i * 3, C + 14 + i * 7);
      ctx.stroke();
    });
    for (const side of [-1, 1]) {
      ctx.fillStyle = '#f6eefc';
      ctx.beginPath();
      ctx.moveTo(C + side * 18, C - 35);
      ctx.lineTo(C + side * 28, C - 56);
      ctx.lineTo(C + side * 34, C - 30);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ffb3d6';
      ctx.beginPath();
      ctx.moveTo(C + side * 23, C - 35);
      ctx.lineTo(C + side * 28, C - 49);
      ctx.lineTo(C + side * 31, C - 33);
      ctx.closePath();
      ctx.fill();
    }
    ball(ctx, ['#ffffff', '#fdf6ff', '#eedff8', '#c4b0dc']);
    // A short forelock curling over the brow.
    mane.slice(0, 3).forEach((c, i) => {
      ctx.strokeStyle = c;
      ctx.lineWidth = 5.5;
      ctx.beginPath();
      ctx.moveTo(C - 6 + i * 5, C - R + 5);
      ctx.quadraticCurveTo(C - 20 + i * 4, C - R + 8 + i * 2, C - 22 + i * 5, C - 22 + i * 3);
      ctx.stroke();
    });
    // The horn, with a spiral.
    ctx.save();
    ctx.shadowColor = '#ffd21f';
    ctx.shadowBlur = 10;
    const gold = ctx.createLinearGradient(C - 10, 0, C + 10, 0);
    gold.addColorStop(0, '#c88a00');
    gold.addColorStop(0.45, '#fff2a0');
    gold.addColorStop(1, '#e0a400');
    ctx.fillStyle = gold;
    ctx.beginPath();
    ctx.moveTo(C - 9, C - R + 9);
    ctx.lineTo(C + 3, C - R - 16);
    ctx.lineTo(C + 10, C - R + 9);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(150,100,0,0.65)';
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 4; i++) {
      const y = C - R + 6 - i * 5.5;
      const hw = 8.5 - i * 2;
      const x = C + 0.5 + i * 0.7;
      ctx.beginPath();
      ctx.moveTo(x - hw, y + 2);
      ctx.lineTo(x + hw, y - 1.5);
      ctx.stroke();
    }
    // Sparkly eyes with lashes.
    for (const side of [-1, 1]) {
      const x = C + side * 14;
      dot(ctx, x, C + 2, 6.5, '#3a1a5a');
      dot(ctx, x, C + 3, 4, '#7a4ac8');
      dot(ctx, x + 2, C - 0.5, 2.2, '#ffffff');
      dot(ctx, x - 1.5, C + 4.5, 1, '#ffffff');
      // Lashes at the outer corner.
      ctx.strokeStyle = '#3a1a5a';
      ctx.lineWidth = 1.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x + side * 5.5, C - 0.5);
      ctx.lineTo(x + side * 9, C - 1.5);
      ctx.moveTo(x + side * 4.5, C - 3);
      ctx.lineTo(x + side * 7.5, C - 5);
      ctx.stroke();
      dot(ctx, C + side * 24, C + 13, 5, 'rgba(255,140,190,0.5)');
    }
    ctx.strokeStyle = '#6a4a8a';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(C, C + 14, 5, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
    shine(ctx, 0.6);
    glint(ctx, C + R + 2, C - R + 8, 6, '#fff6c0');
    glint(ctx, C - R + 2, C + R - 10, 4, '#ffd6f5');
  },
  supernova: (ctx) => {
    // A white-hot star going supernova: long and short rays, a blazing core, a shock ring.
    const aura = ctx.createRadialGradient(C, C, R * 0.3, C, C, S / 2);
    aura.addColorStop(0, 'rgba(255,240,170,0.9)');
    aura.addColorStop(0.5, 'rgba(255,120,60,0.35)');
    aura.addColorStop(0.8, 'rgba(255,74,240,0.12)');
    aura.addColorStop(1, 'rgba(255,74,240,0)');
    ctx.fillStyle = aura;
    ctx.fillRect(0, 0, S, S);
    const rays = 16;
    for (let i = 0; i < rays; i++) {
      const a = (i / rays) * Math.PI * 2 + 0.1;
      const long = i % 2 === 0;
      const len = long ? 62 : 50;
      const w = long ? 0.13 : 0.1;
      const g = ctx.createRadialGradient(C, C, R * 0.6, C, C, len);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.5, long ? 'rgba(255,230,120,0.95)' : 'rgba(255,150,80,0.9)');
      g.addColorStop(1, 'rgba(255,90,200,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(C + Math.cos(a - w) * R * 0.7, C + Math.sin(a - w) * R * 0.7);
      ctx.lineTo(C + Math.cos(a) * len, C + Math.sin(a) * len);
      ctx.lineTo(C + Math.cos(a + w) * R * 0.7, C + Math.sin(a + w) * R * 0.7);
      ctx.closePath();
      ctx.fill();
    }
    const core = ctx.createRadialGradient(C, C, 0, C, C, R * 0.82);
    core.addColorStop(0, '#ffffff');
    core.addColorStop(0.45, '#fffbe0');
    core.addColorStop(0.75, '#ffe07a');
    core.addColorStop(1, '#ff9a2e');
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(C, C, R * 0.82, 0, Math.PI * 2);
    ctx.fill();
    // Boiling surface.
    const rand = seeded(17);
    inside(ctx, () => {
      for (let i = 0; i < 18; i++) {
        const a = rand() * Math.PI * 2;
        const r = R * (0.3 + rand() * 0.45);
        dot(ctx, C + Math.cos(a) * r, C + Math.sin(a) * r, 2 + rand() * 3, 'rgba(255,170,60,0.25)');
      }
    });
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(C, C, R * 1.12, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,120,220,0.5)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(C, C, R * 1.2, 0, Math.PI * 2);
    ctx.stroke();
    glint(ctx, C - R * 0.3, C - R * 0.32, 9);
    glint(ctx, C + R * 0.95, C - R * 0.75, 5, '#ffe0ff');
    glint(ctx, C - R * 0.9, C + R * 0.85, 4, '#fff2a0');
  },
};

export function createSkinTextures(scene: Phaser.Scene) {
  for (const skin of SKINS) {
    const key = skinTexture(skin.id);
    if (scene.textures.exists(key)) continue;
    const tex = scene.textures.createCanvas(key, S, S);
    if (!tex) continue;
    (painters[skin.id] ?? painters.classic)(tex.getContext());
    tex.refresh();
  }
}
