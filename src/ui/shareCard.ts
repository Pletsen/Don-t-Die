import { css, fonts } from '../game/palette';

/** What goes on a shared result card. */
export interface CardInfo {
  /** Small line at the top, e.g. "LEVEL 7 · SAWS" or "DAILY RUN · SAW STORM". */
  kicker: string;
  /** The big number or word: "1234 M", "87%", "CLEAR". */
  big: string;
  /** One line under it: "BEST 1500 M", "16.1 SEC · PERFECT 7/7". */
  sub: string;
  /** Accent colour (#rrggbb). */
  color: string;
  /** Gold stars to draw under the big text (levels). */
  stars?: number;
}

const W = 1080;
const H = 1350;

/** A 1080x1350 neon result card as a PNG, for sharing. */
export async function renderCard(info: CardInfo): Promise<Blob | null> {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Dark sky with a glow of the accent colour and a faint grid.
  ctx.fillStyle = css.bg;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W / 2, H * 0.48, 40, W / 2, H * 0.48, W * 0.75);
  glow.addColorStop(0, info.color + '55');
  glow.addColorStop(1, info.color + '00');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(43, 232, 255, 0.07)';
  ctx.lineWidth = 2;
  for (let x = 0; x <= W; x += 90) line(ctx, x, 0, x, H);
  for (let y = 0; y <= H; y += 90) line(ctx, 0, y, W, y);

  // A neon corridor corner, like the track.
  ctx.save();
  ctx.shadowColor = info.color;
  ctx.shadowBlur = 40;
  ctx.strokeStyle = info.color;
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(90, 1040);
  ctx.lineTo(W - 250, 1040);
  ctx.lineTo(W - 250, H + 20);
  ctx.moveTo(90, 1180);
  ctx.lineTo(W - 390, 1180);
  ctx.lineTo(W - 390, H + 20);
  ctx.stroke();
  ctx.restore();
  // The ball, with its trail.
  const trail = ctx.createLinearGradient(140, 0, W - 330, 0);
  trail.addColorStop(0, 'rgba(43, 232, 255, 0)');
  trail.addColorStop(1, 'rgba(43, 232, 255, 0.9)');
  ctx.fillStyle = trail;
  ctx.fillRect(140, 1098, W - 470, 24);
  ctx.save();
  ctx.shadowColor = css.cyan;
  ctx.shadowBlur = 60;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(W - 320, 1110, 34, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  try {
    await Promise.all([document.fonts.load(`700 150px ${fonts.display}`), document.fonts.load(`700 40px ${fonts.mono}`)]);
  } catch {
    // Fallback fonts are fine.
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Logo.
  glowText(ctx, 'DUCKWISE', W / 2, 190, `700 150px ${fonts.display}`, '#ffffff', css.cyan, 30);
  spaced(ctx, 'ONE TAP. ALWAYS RIGHT.', W / 2, 300, `500 34px ${fonts.mono}`, css.inkDim, 10);

  // The result.
  spaced(ctx, info.kicker, W / 2, 470, `700 44px ${fonts.mono}`, info.color, 6);
  glowText(ctx, info.big, W / 2, 640, `700 ${info.big.length > 7 ? 190 : 230}px ${fonts.display}`, '#ffffff', info.color, 40);
  let y = 810;
  if (info.stars !== undefined) {
    for (let i = 0; i < 3; i++) star(ctx, W / 2 + (i - 1) * 130, y, 52, i < info.stars ? '#ffd21f' : '#2a3644');
    y += 110;
  }
  spaced(ctx, info.sub, W / 2, y, `500 40px ${fonts.mono}`, css.ink, 4);

  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
}

function line(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function glowText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, font: string, fill: string, glow: string, blur: number) {
  ctx.save();
  ctx.font = font;
  ctx.shadowColor = glow;
  ctx.shadowBlur = blur;
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
  ctx.shadowBlur = blur / 3;
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** Letter-spaced text, centred on x. */
function spaced(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, font: string, fill: string, spacing: number) {
  ctx.save();
  ctx.font = font;
  ctx.fillStyle = fill;
  ctx.textAlign = 'left';
  const widths = [...text].map((c) => ctx.measureText(c).width);
  const total = widths.reduce((a, w) => a + w, 0) + spacing * (text.length - 1);
  let at = x - total / 2;
  [...text].forEach((c, i) => {
    ctx.fillText(c, at, y);
    at += widths[i] + spacing;
  });
  ctx.restore();
}

function star(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string) {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = color === '#ffd21f' ? 30 : 0;
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.45;
    ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
