import { tuning } from './tuning';

// The track is pure data: rectangles in world space. It knows nothing about
// drawing, which keeps the rules easy to read and test on their own.

export interface Vec {
  x: number;
  y: number;
}

export interface Rect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** 0 = east, 1 = south, 2 = west, 3 = north. Turning adds 1 (clockwise). */
export type Dir = 0 | 1 | 2 | 3;
export const DIRS: readonly Vec[] = [
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 0, y: -1 },
];

export const isHorizontal = (dir: Dir) => dir === 0 || dir === 2;

export type HazardKind = 'saw' | 'bomb';

export interface Hazard {
  kind: HazardKind;
  x: number;
  y: number;
  baseX: number;
  baseY: number;
  radius: number;
  moving: boolean;
  moveAxis: 'x' | 'y';
  moveRange: number;
  movePhase: number;
  alive: boolean;
}

export interface Segment {
  id: number;
  dir: Dir;
  start: Vec;
  end: Vec;
  length: number;
  rect: Rect;
  halfWidth: number;
  /** Track distance travelled before this segment starts. */
  travelled: number;
  loopIndex: number;
  /** Overlap with the previous segment: where you must turn. */
  gate: Rect | null;
  /** The centre part of the gate that counts as a PERFECT turn. */
  perfect: Rect | null;
  hazard: Hazard | null;
}

export const pointInRect = (x: number, y: number, r: Rect) =>
  x >= r.x1 && x <= r.x2 && y >= r.y1 && y <= r.y2;

export const distToRectEdge = (x: number, y: number, r: Rect) =>
  Math.min(x - r.x1, r.x2 - x, y - r.y1, r.y2 - y);

function intersect(a: Rect, b: Rect): Rect | null {
  const r = {
    x1: Math.max(a.x1, b.x1),
    x2: Math.min(a.x2, b.x2),
    y1: Math.max(a.y1, b.y1),
    y2: Math.min(a.y2, b.y2),
  };
  return r.x2 <= r.x1 || r.y2 <= r.y1 ? null : r;
}

function shrinkAlong(r: Rect, axis: 'x' | 'y', fraction: number): Rect {
  const out = { ...r };
  if (axis === 'x') {
    const pad = ((r.x2 - r.x1) * fraction) / 2;
    out.x1 += pad;
    out.x2 -= pad;
  } else {
    const pad = ((r.y2 - r.y1) * fraction) / 2;
    out.y1 += pad;
    out.y2 -= pad;
  }
  return out;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const rand = (a: number, b: number) => lerp(a, b, Math.random());

export class Track {
  segments: Segment[] = [];
  private nextId = 0;

  constructor(initial = 6) {
    for (let i = 0; i < initial; i++) this.push();
  }

  get(i: number): Segment | undefined {
    return this.segments[i];
  }

  /** Keep at least `ahead` segments in front of index `current`. */
  ensureAhead(current: number, ahead: number) {
    while (this.segments.length - current < ahead) this.push();
  }

  /** Drop segments far behind the player. Returns how many were removed. */
  pruneBefore(index: number): Segment[] {
    if (index <= 0) return [];
    return this.segments.splice(0, index);
  }

  private push(): Segment {
    const prev = this.segments[this.segments.length - 1];
    const dir: Dir = prev ? (((prev.dir + 1) % 4) as Dir) : 0;
    const start = prev ? prev.end : { x: 0, y: 0 };
    const travelled = prev ? prev.travelled + prev.length : 0;
    const id = this.nextId++;
    const loopIndex = Math.floor(id / 4);

    const halfWidth = tuning.corridorHalfWidthAt(travelled, loopIndex);
    const range = tuning.segmentLengthRange(travelled, loopIndex);
    const length = rand(range.min, range.max);
    const end = { x: start.x + DIRS[dir].x * length, y: start.y + DIRS[dir].y * length };

    const rect: Rect = isHorizontal(dir)
      ? {
          x1: Math.min(start.x, end.x) - halfWidth,
          x2: Math.max(start.x, end.x) + halfWidth,
          y1: start.y - halfWidth,
          y2: start.y + halfWidth,
        }
      : {
          x1: start.x - halfWidth,
          x2: start.x + halfWidth,
          y1: Math.min(start.y, end.y) - halfWidth,
          y2: Math.max(start.y, end.y) + halfWidth,
        };

    let gate: Rect | null = null;
    let perfect: Rect | null = null;
    if (prev) {
      gate = intersect(prev.rect, rect);
      if (gate) perfect = shrinkAlong(gate, isHorizontal(prev.dir) ? 'x' : 'y', 0.55);
    }

    const seg: Segment = {
      id,
      dir,
      start,
      end,
      length,
      rect,
      halfWidth,
      travelled,
      loopIndex,
      gate,
      perfect,
      hazard: null,
    };
    seg.hazard = this.makeHazard(seg);
    this.segments.push(seg);
    return seg;
  }

  private makeHazard(seg: Segment): Hazard | null {
    if (Math.random() > tuning.hazardChanceAt(seg.travelled)) return null;
    const t = rand(0.4, 0.72);
    const side = Math.random() < 0.5 ? -1 : 1;
    const lateral = side * seg.halfWidth * rand(0.42, 0.62);
    const ax = lerp(seg.start.x, seg.end.x, t);
    const ay = lerp(seg.start.y, seg.end.y, t);
    const horizontal = isHorizontal(seg.dir);
    const x = horizontal ? ax : ax + lateral;
    const y = horizontal ? ay + lateral : ay;
    const kind: HazardKind = Math.random() < 0.55 ? 'saw' : 'bomb';
    return {
      kind,
      x,
      y,
      baseX: x,
      baseY: y,
      radius: kind === 'saw' ? 15 : 14,
      moving: Math.random() < 0.3,
      moveAxis: horizontal ? 'y' : 'x',
      moveRange: seg.halfWidth * 0.5,
      movePhase: Math.random() * Math.PI * 2,
      alive: true,
    };
  }
}
