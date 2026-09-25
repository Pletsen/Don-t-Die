import Phaser from 'phaser';
import { type Rect, type Segment, DIRS } from '../game/Track';
import { mixColor, palette } from '../game/palette';
import { TEX } from './textures';

const GRID = 36;
const SHADOW = 10;
/** How far around a new segment the previous floor gets re-painted. */
const PATCH = 20;
const STREAKS_PER_SEGMENT = 2;

/**
 * Draws the corridor into one Graphics object, oldest segment first, so newer
 * track pieces lie on top of older ones like bridges (with a drop shadow).
 *
 * Neon edges are drawn just OUTSIDE each segment. Where a segment joins the
 * previous one, its edge would cut across the previous floor, so we patch the
 * previous floor back over that spot before drawing the new floor. The result
 * is clean corners with no lines crossing the turns.
 */
export class CorridorView {
  private track: Phaser.GameObjects.Graphics;
  private gate: Phaser.GameObjects.Graphics;
  private streaks: Phaser.GameObjects.Image[] = [];

  constructor(private scene: Phaser.Scene) {
    this.track = scene.add.graphics().setDepth(1);
    this.gate = scene.add.graphics().setDepth(2);
  }

  draw(
    segs: Segment[],
    current: number,
    player: { x: number; y: number },
    accent: number,
    time: number,
    fxReduced: boolean,
  ) {
    const from = Math.max(0, current - 1);
    const to = Math.min(segs.length - 1, current + 4);
    const visible = segs.slice(from, to + 1);
    const bright = mixColor(accent, 0xffffff, 0.35);
    const floor = mixColor(palette.floor, accent, 0.05);
    const g = this.track.clear();

    // Track behind the player dissolves as you move away from it, so the
    // road ahead reads clearly even where the spiral crosses itself.
    const alphaOf = (s: Segment, index: number) =>
      index >= current ? 1 : Phaser.Math.Clamp(1 - distToRect(player.x, player.y, s.rect) / 240, 0, 1);

    visible.forEach((s, i) => {
      const a = alphaOf(s, from + i);
      if (a <= 0) return;
      const prev = i > 0 ? visible[i - 1] : null;
      const r = s.rect;

      // Drop shadow: sells the "floating track" look where pieces overlap.
      g.fillStyle(0x000000, 0.45 * a);
      g.fillRect(r.x1 + SHADOW, r.y1 + SHADOW, r.x2 - r.x1, r.y2 - r.y1);

      // Neon edge: wide faint glow, medium haze, thin bright core.
      if (!fxReduced) {
        g.lineStyle(18, accent, 0.07 * a);
        strokeOutside(g, r, 18);
      }
      g.lineStyle(7, accent, 0.25 * a);
      strokeOutside(g, r, 7);
      g.lineStyle(2.5, bright, a);
      strokeOutside(g, r, 2.5);

      if (prev) {
        const patch = intersect(prev.rect, expand(r, PATCH));
        const pa = alphaOf(prev, from + i - 1);
        if (patch && pa > 0) this.floorPatch(patch, floor, accent, pa);
      }
      this.floorPatch(r, floor, accent, a);
      this.chevrons(s, accent, a);
    });

    // --- The next turn ----------------------------------------------------
    const gg = this.gate.clear();
    // Only show the finish once it's close, so it isn't mistaken for part of
    // the track where the spiral crosses itself.
    for (let i = current; i <= current + 1; i++) if (segs[i]?.finish) this.finishLine(segs[i], time);
    const next = segs[current + 1];
    if (next?.gate) {
      const r = next.gate;
      const pulse = 0.5 + 0.5 * Math.sin(time * 6);
      gg.fillStyle(0xffffff, 0.035 + pulse * 0.045);
      gg.fillRect(r.x1, r.y1, r.x2 - r.x1, r.y2 - r.y1);
      gg.lineStyle(1.5, 0xffffff, 0.35 + pulse * 0.35);
      gg.strokeRect(r.x1, r.y1, r.x2 - r.x1, r.y2 - r.y1);

      // Brighter band = the PERFECT zone.
      if (next.perfect) {
        const p = next.perfect;
        gg.fillStyle(accent, 0.07 + pulse * 0.06);
        gg.fillRect(p.x1, p.y1, p.x2 - p.x1, p.y2 - p.y1);
      }

      // Ripple expanding out of the gate.
      if (!fxReduced) {
        const k = (time * 1.4) % 1;
        const grow = k * 14;
        gg.lineStyle(2, 0xffffff, (1 - k) * 0.45);
        gg.strokeRect(r.x1 - grow, r.y1 - grow, r.x2 - r.x1 + grow * 2, r.y2 - r.y1 + grow * 2);
      }

      // Arrow pointing where the turn goes.
      const d = DIRS[next.dir];
      const cx = (r.x1 + r.x2) / 2;
      const cy = (r.y1 + r.y2) / 2;
      const size = Math.min(r.x2 - r.x1, r.y2 - r.y1) * 0.16;
      const px = -d.y;
      const py = d.x;
      gg.lineStyle(3, 0xffffff, 0.5 + pulse * 0.4);
      for (let i = 0; i < 2; i++) {
        const o = (i - 0.5) * size * 0.9 + ((time * 2) % 1) * size * 0.3;
        const tx = cx + d.x * o;
        const ty = cy + d.y * o;
        gg.beginPath();
        gg.moveTo(tx - d.x * size + px * size, ty - d.y * size + py * size);
        gg.lineTo(tx, ty);
        gg.lineTo(tx - d.x * size - px * size, ty - d.y * size - py * size);
        gg.strokePath();
      }
    }

    this.drawStreaks(visible, accent, time, fxReduced);
  }


  /** Checkered finish strip across the lane, with a pulsing glow. */
  private finishLine(s: Segment, time: number) {
    const g = this.gate;
    const f = s.finish!;
    const d = DIRS[s.dir];
    const px = -d.y;
    const py = d.x;
    const hw = s.halfWidth;
    const cell = (hw * 2) / 8;
    const pulse = 0.5 + 0.5 * Math.sin(time * 5);

    // Glow band first, then two rows of checkers.
    g.lineStyle(cell * 3, 0xffffff, 0.08 + pulse * 0.08);
    g.lineBetween(f.x - px * hw, f.y - py * hw, f.x + px * hw, f.y + py * hw);
    for (let row = 0; row < 2; row++) {
      for (let i = 0; i < 8; i++) {
        const light = (i + row) % 2 === 0;
        g.fillStyle(light ? 0xffffff : 0x0b121b, 0.9);
        const a = -hw + i * cell;
        const b = (row - 1) * cell;
        const cx = f.x + px * (a + cell / 2) + d.x * (b + cell / 2);
        const cy = f.y + py * (a + cell / 2) + d.y * (b + cell / 2);
        g.fillRect(cx - cell / 2, cy - cell / 2, cell, cell);
      }
    }
  }

  /** Flat floor plus a world-aligned grid, so lines continue across pieces. */
  private floorPatch(r: Rect, floor: number, accent: number, alpha: number) {
    const g = this.track;
    g.fillStyle(floor, alpha);
    g.fillRect(r.x1, r.y1, r.x2 - r.x1, r.y2 - r.y1);
    g.lineStyle(1, accent, 0.07 * alpha);
    for (let x = Math.ceil(r.x1 / GRID) * GRID; x < r.x2; x += GRID) g.lineBetween(x, r.y1, x, r.y2);
    for (let y = Math.ceil(r.y1 / GRID) * GRID; y < r.y2; y += GRID) g.lineBetween(r.x1, y, r.x2, y);
  }

  /** Chevrons down the middle of the lane, pointing the way. */
  private chevrons(s: Segment, accent: number, alpha: number) {
    const g = this.track;
    const d = DIRS[s.dir];
    const px = -d.y;
    const py = d.x;
    const size = s.halfWidth * 0.18;
    g.lineStyle(2, accent, 0.16 * alpha);
    for (let t = 70; t < s.length - 40; t += 70) {
      const cx = s.start.x + d.x * t;
      const cy = s.start.y + d.y * t;
      g.beginPath();
      g.moveTo(cx - d.x * size + px * size, cy - d.y * size + py * size);
      g.lineTo(cx, cy);
      g.lineTo(cx - d.x * size - px * size, cy - d.y * size - py * size);
      g.strokePath();
    }
  }

  /** Pulses of light running along each lane. */
  private drawStreaks(visible: Segment[], accent: number, time: number, fxReduced: boolean) {
    const needed = fxReduced ? 0 : visible.length * STREAKS_PER_SEGMENT;
    while (this.streaks.length < needed) {
      this.streaks.push(
        this.scene.add.image(0, 0, TEX.streak).setBlendMode(Phaser.BlendModes.ADD).setDepth(3),
      );
    }
    this.streaks.forEach((img, i) => {
      if (i >= needed) {
        img.setVisible(false);
        return;
      }
      const s = visible[Math.floor(i / STREAKS_PER_SEGMENT)];
      const k = i % STREAKS_PER_SEGMENT;
      const len = s.length;
      const along = (((time * 180 + k * len * 0.5 + s.id * 97) % len) + len) % len;
      const d = DIRS[s.dir];
      const fade = Math.min(1, along / 60, (len - along) / 60);
      img
        .setVisible(true)
        .setPosition(s.start.x + d.x * along, s.start.y + d.y * along)
        .setRotation(Math.atan2(d.y, d.x))
        .setScale(0.55, s.halfWidth / 90)
        .setTint(accent)
        .setAlpha(0.55 * fade);
    });
  }
}

function distToRect(x: number, y: number, r: Rect) {
  const dx = Math.max(r.x1 - x, 0, x - r.x2);
  const dy = Math.max(r.y1 - y, 0, y - r.y2);
  return Math.hypot(dx, dy);
}

function expand(r: Rect, by: number): Rect {
  return { x1: r.x1 - by, y1: r.y1 - by, x2: r.x2 + by, y2: r.y2 + by };
}

function intersect(a: Rect, b: Rect): Rect | null {
  const r = { x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1), x2: Math.min(a.x2, b.x2), y2: Math.min(a.y2, b.y2) };
  return r.x2 <= r.x1 || r.y2 <= r.y1 ? null : r;
}

/** Stroke a rectangle so the line lies entirely outside it. */
function strokeOutside(g: Phaser.GameObjects.Graphics, r: Rect, width: number) {
  const o = width / 2;
  g.strokeRect(r.x1 - o, r.y1 - o, r.x2 - r.x1 + o * 2, r.y2 - r.y1 + o * 2);
}
