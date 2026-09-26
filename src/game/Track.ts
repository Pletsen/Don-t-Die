import type { Course } from './course';
import type { HazardRules } from './levels';
import { seededRng, type Rng } from './rng';

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
  hazards: Hazard[];
  /** Where the finish line crosses this segment, if it does. */
  finish: Vec | null;
}

export const pointInRect = (x: number, y: number, r: Rect) =>
  x >= r.x1 && x <= r.x2 && y >= r.y1 && y <= r.y2;

/**
 * How far along the track a point is: the segment's start distance plus how
 * far the point is along the segment's direction. Measured on the track
 * itself, so it matches where the finish line is drawn no matter how early
 * or late the player turned.
 */
export const trackDistance = (seg: Segment, x: number, y: number) =>
  seg.travelled + (x - seg.start.x) * DIRS[seg.dir].x + (y - seg.start.y) * DIRS[seg.dir].y;

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

/** Straight track left after the finish line, in px (plus the end wall's half width). */
const FINISH_RUNOUT = 170;

export class Track {
  segments: Segment[] = [];
  private nextId = 0;
  private rng: Rng;

  constructor(
    private course: Course,
    initial = 6,
  ) {
    this.rng = seededRng(course.seed);
    for (let i = 0; i < initial; i++) this.push();
  }

  private rand(a: number, b: number) {
    return lerp(a, b, this.rng());
  }

  get(i: number): Segment | undefined {
    return this.segments[i];
  }

  /** True once the segment with the finish line exists: the track ends there. */
  get ended() {
    return !!this.segments[this.segments.length - 1]?.finish;
  }

  /** Keep at least `ahead` segments in front of index `current`. */
  ensureAhead(current: number, ahead: number) {
    while (!this.ended && this.segments.length - current < ahead) this.push();
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

    const halfWidth = this.course.halfWidthAt(travelled, loopIndex);
    const range = this.course.segmentLengthRange(travelled, loopIndex);
    let length = this.rand(range.min, range.max);

    // The finish line must sit on a straight, never inside a turn square.
    // If the goal would land near this segment's end, this segment becomes
    // the last one and is sized to fit the line and its run-out.
    const goal = this.course.goalPx;
    const margin = halfWidth + 30;
    let finishAt: number | null = null;
    if (goal !== null && goal >= travelled) {
      const k = goal - travelled;
      if (k >= margin && k <= length - margin) finishAt = k;
      else if (k > length - margin && k < length + margin + 40) finishAt = k;
    }
    // The last segment ends in a closed run-out just past the finish line:
    // no more turns after it, only room to glide to a stop.
    if (finishAt !== null) length = finishAt + FINISH_RUNOUT;
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
      hazards: [],
      finish: null,
    };

    if (finishAt !== null) {
      seg.finish = { x: start.x + DIRS[dir].x * finishAt, y: start.y + DIRS[dir].y * finishAt };
    }

    seg.hazards = this.makeHazards(seg);
    this.segments.push(seg);
    return seg;
  }

  private makeHazards(seg: Segment): Hazard[] {
    const rules = this.course.hazardsAt(seg.travelled);
    const roll = this.rng();
    if (!rules || roll > rules.chance) return [];
    // Too short a straight to fit a hazard fairly.
    if (seg.length < (seg.halfWidth + 24) * 2 + 20) return [];

    const side = this.rng() < 0.5 ? -1 : 1;
    const first = this.makeHazard(seg, rules, side, this.rand(0.4, 0.72), false);
    const out = [first];
    if (rules.perSegment === 2 && this.rng() < 0.6) {
      // Second hazard: static and on the same side, so the far lane stays open.
      out.push(this.makeHazard(seg, { ...rules, placement: 'side', moving: 0 }, side, this.rand(0.2, 0.32), true));
    }
    // On short straights both can get squeezed into the same spot; keep one.
    if (out.length === 2 && Math.hypot(out[0].x - out[1].x, out[0].y - out[1].y) < 40) out.pop();
    const goal = this.course.goalPx;
    return out.filter((h) => goal === null || this.alongTrack(seg, h) < goal - 60);
  }

  private alongTrack(seg: Segment, h: Hazard) {
    const d = DIRS[seg.dir];
    return seg.travelled + (h.baseX - seg.start.x) * d.x + (h.baseY - seg.start.y) * d.y;
  }

  private makeHazard(seg: Segment, rules: HazardRules, side: number, t: number, forceStatic: boolean): Hazard {
    const placement = rules.placement ?? 'side';
    const spread =
      placement === 'side' ? this.rand(0.42, 0.62) : placement === 'center' ? this.rand(0, 0.15) : this.rand(0, 0.62);
    const lateral = side * seg.halfWidth * spread;
    // Keep hazards on the straight, clear of both turn squares, so there is
    // always room to see them coming and steer around them.
    const margin = seg.halfWidth + 24;
    const along = Math.max(margin, Math.min(seg.length - margin, t * seg.length));
    const ax = seg.start.x + DIRS[seg.dir].x * along;
    const ay = seg.start.y + DIRS[seg.dir].y * along;
    const horizontal = isHorizontal(seg.dir);
    const x = horizontal ? ax : ax + lateral;
    const y = horizontal ? ay + lateral : ay;
    const kinds = rules.kinds;
    const kind = kinds[Math.floor(this.rng() * kinds.length) % kinds.length];
    const moving = this.rng() < (rules.moving ?? 0) && !forceStatic;
    return {
      kind,
      x,
      y,
      baseX: x,
      baseY: y,
      radius: kind === 'saw' ? 15 : 14,
      moving,
      moveAxis: horizontal ? 'y' : 'x',
      moveRange: seg.halfWidth * 0.5,
      movePhase: this.rng() * Math.PI * 2,
      alive: true,
    };
  }
}
