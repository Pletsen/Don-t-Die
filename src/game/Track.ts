import type { Course } from './course';
import type { HazardRules } from './levels';
import { seededRng, type Rng } from './rng';
import { METERS_PER_PX } from './tuning';

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

/** `duck` only appears in the bonus universe and is harmless (you bonk it). */
export type HazardKind = 'saw' | 'bomb' | 'duck';

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
  /** How fast a moving hazard sways (default 1.6). */
  moveSpeed?: number;
  alive: boolean;
  /**
   * Bombs only: 0 while the fuse burns, rising to 1 as it charges, and set
   * to -1 during the short blast, when the bomb hits twice as far.
   */
  charge?: number;
  /**
   * Ducks come in three kinds: normal (+1), red (runs about, +5, never
   * leaves: if you miss it, it runs further up the track) and golden (big,
   * 0.5 % rare, starts a DUCK FRENZY).
   */
  variant?: DuckVariant;
}

export type DuckVariant = 'normal' | 'red' | 'golden';

/** Chances for a spawned duck to be special. */
export const DUCK_CHANCE = { golden: 0.005, red: 0.1 };

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
  /** The hidden warp star, if it's on this segment. */
  warpStar: WarpStar | null;
}

export interface WarpStar {
  x: number;
  y: number;
  taken: boolean;
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
  private warpPlaced = false;
  /** At most one golden duck per run (set up front to allow none, e.g. the menu demo). */
  goldenPlaced = false;

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
      warpStar: null,
    };

    if (finishAt !== null) {
      seg.finish = { x: start.x + DIRS[dir].x * finishAt, y: start.y + DIRS[dir].y * finishAt };
    }

    seg.hazards = this.makeHazards(seg);
    this.placeWarpStar(seg);
    this.segments.push(seg);
    return seg;
  }

  /**
   * The warp star goes on the first straight at or after `warpAtPx`, near
   * one wall, so reaching it means turning early or late on purpose.
   */
  private placeWarpStar(seg: Segment) {
    const at = this.course.warpAtPx;
    if (at === null || this.warpPlaced || this.course.warped) return;
    // Not in the first two levels: beginners turning early hit it by accident.
    if (this.course.level && this.course.level.id <= 2) return;
    const margin = seg.halfWidth + 30;
    if (seg.length < margin * 2 + 20 || seg.travelled + seg.length - margin < at) return;
    const along = Math.max(margin, Math.min(seg.length - margin, at - seg.travelled));
    const side = this.rng() < 0.5 ? -1 : 1;
    const lateral = side * seg.halfWidth * this.rand(0.5, 0.66);
    const d = DIRS[seg.dir];
    seg.warpStar = {
      x: seg.start.x + d.x * along - d.y * lateral,
      y: seg.start.y + d.y * along + d.x * lateral,
      taken: false,
    };
    // Keep the star's straight clear, so it's a pure skill shot.
    seg.hazards = [];
    this.warpPlaced = true;
  }

  /** Re-roll a segment's hazards under the course's current rules. */
  refillHazards(seg: Segment) {
    seg.hazards = this.makeHazards(seg);
  }

  private makeHazards(seg: Segment): Hazard[] {
    const rules = this.course.hazardsAt(seg.travelled);
    const roll = this.rng();
    // In a level, hazards ease in: none in the first 60 m, then their chance
    // ramps up to full over the next ~120 m. No more dying on the first corner.
    const m = seg.travelled * METERS_PER_PX;
    const ramp = this.course.level && !this.course.warped ? Math.max(0, Math.min(1, (m - 60) / 120)) : 1;
    if (!rules || ramp <= 0 || roll > rules.chance * (0.4 + 0.6 * ramp)) return this.warpDanger(seg);
    // Too short a straight to fit a hazard fairly.
    if (seg.length < this.startMargin(seg) + seg.halfWidth + 24 + 20) return [];

    const side = this.rng() < 0.5 ? -1 : 1;
    const first = this.makeHazard(seg, rules, side, this.rand(0.4, 0.72), false);
    const out = [first];
    // A second hazard only next to a static first one: a moving hazard plus a
    // second one could close the lane completely (1-frame corners).
    if (rules.perSegment === 2 && !first.moving && this.rng() < 0.6) {
      // Second hazard: static and on the same side, so the far lane stays open.
      out.push(this.makeHazard(seg, { ...rules, placement: 'side', moving: 0 }, side, this.rand(0.2, 0.32), true));
    }
    // On short straights both can get squeezed into the same spot; keep one.
    if (out.length === 2 && Math.hypot(out[0].x - out[1].x, out[0].y - out[1].y) < 40) out.pop();
    const goal = this.course.goalPx;
    return out.filter((h) => goal === null || this.alongTrack(seg, h) < goal - 60);
  }

  /** Distance kept free after a corner: ~0.16 s of travel, at least 24 px. */
  private startMargin(seg: Segment) {
    return seg.halfWidth + Math.max(24, this.course.speedAt(seg.travelled) * 0.16);
  }

  /**
   * After the warp in worlds 3 and 4 the party isn't completely safe: now and
   * then a static saw sits at the side of a duck straight.
   */
  private warpDanger(seg: Segment): Hazard[] {
    const world = this.course.level?.world ?? 0;
    if (!this.course.warped || world < 2 || this.rng() > 0.25) return [];
    if (seg.length < this.startMargin(seg) + seg.halfWidth + 44) return [];
    const saw = this.makeHazard(seg, { chance: 1, kinds: ['saw'], placement: 'side', moving: 0 }, this.rng() < 0.5 ? -1 : 1, this.rand(0.4, 0.7), true);
    return [saw];
  }

  /**
   * Move a special duck you missed onto a segment further ahead, centred in
   * the lane, so it's waiting for you again. False if there's no room there.
   */
  moveDuckTo(hz: Hazard, seg: Segment): boolean {
    const margin = seg.halfWidth + 24;
    if (seg.length < margin * 2 + 20 || seg.warpStar) return false;
    const along = margin + this.rng() * (seg.length - margin * 2);
    const d = DIRS[seg.dir];
    hz.x = hz.baseX = seg.start.x + d.x * along;
    hz.y = hz.baseY = seg.start.y + d.y * along;
    hz.moveAxis = isHorizontal(seg.dir) ? 'y' : 'x';
    hz.moveRange = seg.halfWidth * (hz.variant === 'golden' ? 0.5 : 0.75);
    const goal = this.course.goalPx;
    if (goal !== null && this.alongTrack(seg, hz) > goal - 60) return false;
    seg.hazards.push(hz);
    return true;
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
    // always room to see them coming and steer around them. The gap after a
    // corner grows with speed, so there's always time to react.
    const startMargin = this.startMargin(seg);
    const endMargin = seg.halfWidth + 24;
    const along = Math.max(startMargin, Math.min(seg.length - endMargin, t * seg.length));
    const ax = seg.start.x + DIRS[seg.dir].x * along;
    const ay = seg.start.y + DIRS[seg.dir].y * along;
    const horizontal = isHorizontal(seg.dir);
    const x = horizontal ? ax : ax + lateral;
    const y = horizontal ? ay + lateral : ay;
    const kinds = rules.kinds;
    const kind = kinds[Math.floor(this.rng() * kinds.length) % kinds.length];
    const moving = this.rng() < (rules.moving ?? 0) && !forceStatic;
    const hazard: Hazard = {
      kind,
      x,
      y,
      baseX: x,
      baseY: y,
      radius: kind === 'saw' ? 15 : kind === 'duck' ? 13 : 14,
      moving,
      moveAxis: horizontal ? 'y' : 'x',
      moveRange: seg.halfWidth * 0.5,
      movePhase: this.rng() * Math.PI * 2,
      alive: true,
    };
    if (kind === 'duck') {
      // Not from the level's fixed seed: otherwise the same level would hand
      // out a golden duck on every single warp (farmable). One golden per run.
      let roll = Math.random();
      if (roll < DUCK_CHANCE.golden && this.goldenPlaced) roll = DUCK_CHANCE.golden;
      if (roll < DUCK_CHANCE.golden) this.goldenPlaced = true;
      hazard.variant = roll < DUCK_CHANCE.golden ? 'golden' : roll < DUCK_CHANCE.golden + DUCK_CHANCE.red ? 'red' : 'normal';
      if (hazard.variant !== 'normal') {
        // Special ducks run back and forth across the lane, centred on it.
        const golden = hazard.variant === 'golden';
        hazard.x = hazard.baseX = horizontal ? ax : seg.start.x;
        hazard.y = hazard.baseY = horizontal ? seg.start.y : ay;
        hazard.moving = true;
        hazard.moveRange = seg.halfWidth * (golden ? 0.5 : 0.75);
        hazard.moveSpeed = golden ? 1.1 : 3.2;
        if (golden) hazard.radius = 24;
      }
    }
    return hazard;
  }
}
