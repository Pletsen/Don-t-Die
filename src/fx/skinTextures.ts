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

const painters: Record<string, (ctx: Ctx) => void> = {
  classic: (ctx) => {
    ball(ctx, ['#ffffff', '#eaf6ff', '#7fd6ee', '#2be8ff']);
    shine(ctx);
  },
  mint: (ctx) => {
    ball(ctx, ['#ffffff', '#d9fff0', '#6ff0c0', '#14b87e']);
    shine(ctx);
  },
  bubblegum: (ctx) => {
    ball(ctx, ['#ffffff', '#ffe0f0', '#ff8ccb', '#e0217f']);
    shine(ctx);
  },
  lemon: (ctx) => {
    ball(ctx, ['#ffffff', '#fffbd0', '#ffe45c', '#e0a800']);
    shine(ctx);
  },
  grape: (ctx) => {
    ball(ctx, ['#ffffff', '#eadcff', '#b98cff', '#6a2cef']);
    shine(ctx);
  },
  tangerine: (ctx) => {
    ball(ctx, ['#ffffff', '#ffe6cc', '#ffab5c', '#f06a00']);
    shine(ctx);
  },
  frosty: (ctx) => {
    ball(ctx, ['#ffffff', '#f0fbff', '#bfeaff', '#7cc4ea']);
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 2;
    for (const [x, y, s] of [[C + 12, C + 8, 9], [C - 18, C + 16, 6], [C + 20, C - 18, 5]] as const) {
      for (let i = 0; i < 3; i++) {
        const a = (i * Math.PI) / 3;
        ctx.beginPath();
        ctx.moveTo(x - Math.cos(a) * s, y - Math.sin(a) * s);
        ctx.lineTo(x + Math.cos(a) * s, y + Math.sin(a) * s);
        ctx.stroke();
      }
    }
    shine(ctx);
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
