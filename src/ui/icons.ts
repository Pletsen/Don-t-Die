import type Phaser from 'phaser';

/**
 * Line icons drawn with Phaser Graphics on a 24 x 24 grid (2 px strokes),
 * centred on (x, y) and scaled to `size`. Vector, so they're sharp at any
 * pixel density, and no image files are needed.
 */
export type IconName =
  | 'pause'
  | 'play'
  | 'retry'
  | 'home'
  | 'back'
  | 'sound'
  | 'mute'
  | 'sparkle'
  | 'lock'
  | 'star'
  | 'trophy'
  | 'flame'
  | 'levels'
  | 'infinity'
  | 'gift'
  | 'help'
  | 'share'
  | 'close';

export function drawIcon(
  g: Phaser.GameObjects.Graphics,
  name: IconName,
  x: number,
  y: number,
  size: number,
  color: number,
  alpha = 1,
) {
  const k = size / 24;
  // Grid coordinates (0..24) to screen.
  const X = (v: number) => x + (v - 12) * k;
  const Y = (v: number) => y + (v - 12) * k;
  const lw = Math.max(1.5, 2 * k);
  g.lineStyle(lw, color, alpha);
  g.fillStyle(color, alpha);
  const line = (x1: number, y1: number, x2: number, y2: number) => g.lineBetween(X(x1), Y(y1), X(x2), Y(y2));
  const poly = (pts: number[], fill = false) => {
    g.beginPath();
    g.moveTo(X(pts[0]), Y(pts[1]));
    for (let i = 2; i < pts.length; i += 2) g.lineTo(X(pts[i]), Y(pts[i + 1]));
    g.closePath();
    if (fill) g.fillPath();
    else g.strokePath();
  };
  const arc = (cx: number, cy: number, r: number, a0: number, a1: number) => {
    g.beginPath();
    g.arc(X(cx), Y(cy), r * k, a0, a1, false);
    g.strokePath();
  };

  switch (name) {
    case 'pause':
      g.fillRoundedRect(X(6), Y(5), 4 * k, 14 * k, 1.2 * k);
      g.fillRoundedRect(X(14), Y(5), 4 * k, 14 * k, 1.2 * k);
      break;
    case 'play':
      poly([8, 5, 19, 12, 8, 19], true);
      break;
    case 'retry': {
      arc(12, 12, 7, -Math.PI * 0.35, Math.PI * 1.45);
      poly([16.5, 3.5, 19.5, 6.8, 15.2, 8.2], true);
      break;
    }
    case 'home':
      poly([4, 11, 12, 4, 20, 11]);
      g.strokeRect(X(6.5), Y(11), 11 * k, 9 * k);
      g.fillRect(X(10.5), Y(14.5), 3 * k, 5.5 * k);
      break;
    case 'back':
      line(15, 5, 8, 12);
      line(8, 12, 15, 19);
      break;
    case 'close':
      line(6, 6, 18, 18);
      line(18, 6, 6, 18);
      break;
    case 'sound':
    case 'mute':
      poly([4, 9.5, 8, 9.5, 13, 5, 13, 19, 8, 14.5, 4, 14.5], true);
      if (name === 'sound') {
        arc(13, 12, 4, -Math.PI / 3.2, Math.PI / 3.2);
        arc(13, 12, 7.5, -Math.PI / 3.2, Math.PI / 3.2);
      } else {
        line(16, 9, 21, 15);
        line(21, 9, 16, 15);
      }
      break;
    case 'sparkle':
      poly([12, 3, 13.8, 10.2, 21, 12, 13.8, 13.8, 12, 21, 10.2, 13.8, 3, 12, 10.2, 10.2], true);
      g.fillCircle(X(19), Y(5), 1.4 * k);
      break;
    case 'lock':
      g.fillRoundedRect(X(5.5), Y(10.5), 13 * k, 10 * k, 2 * k);
      arc(12, 10.5, 4.5, Math.PI, Math.PI * 2);
      line(7.5, 10.5, 7.5, 8.5);
      line(16.5, 10.5, 16.5, 8.5);
      break;
    case 'star': {
      const pts: number[] = [];
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? 9.5 : 4.2;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        pts.push(12 + Math.cos(a) * r, 12.5 + Math.sin(a) * r);
      }
      poly(pts, true);
      break;
    }
    case 'trophy':
      poly([7, 4, 17, 4, 16, 12, 12, 14.5, 8, 12], true);
      arc(7, 7.5, 3, Math.PI / 2, Math.PI * 1.5);
      arc(17, 7.5, 3, -Math.PI / 2, Math.PI / 2);
      line(12, 14.5, 12, 18);
      g.fillRect(X(8), Y(18), 8 * k, 2.4 * k);
      break;
    case 'flame':
      poly([12, 2.5, 16.5, 9, 18, 14, 15.5, 19.5, 12, 21, 8.5, 19.5, 6, 14, 8, 9.5, 10, 12, 10.5, 6.5], true);
      break;
    case 'levels':
      for (const [cx, cy] of [
        [7, 7],
        [17, 7],
        [7, 17],
        [17, 17],
      ]) {
        g.strokeRoundedRect(X(cx - 4), Y(cy - 4), 8 * k, 8 * k, 1.6 * k);
      }
      break;
    case 'infinity':
      arc(8, 12, 4, 0, Math.PI * 2);
      arc(16, 12, 4, 0, Math.PI * 2);
      break;
    case 'gift':
      g.strokeRect(X(4.5), Y(10), 15 * k, 10 * k);
      g.strokeRect(X(3.5), Y(7), 17 * k, 3 * k);
      line(12, 7, 12, 20);
      arc(9.5, 6, 2.5, 0, Math.PI * 2);
      arc(14.5, 6, 2.5, 0, Math.PI * 2);
      break;
    case 'share':
      // A tray with an arrow coming out of it.
      line(6, 11, 6, 20);
      line(6, 20, 18, 20);
      line(18, 20, 18, 11);
      line(6, 11, 9, 11);
      line(15, 11, 18, 11);
      line(12, 3, 12, 15);
      line(8.5, 6.5, 12, 3);
      line(15.5, 6.5, 12, 3);
      break;
    case 'help':
      arc(12, 9, 4, Math.PI * 1.1, Math.PI * 2.4);
      line(12, 13, 12, 15.5);
      g.fillCircle(X(12), Y(19), 1.4 * k);
      break;
  }
}
