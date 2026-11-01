import { read, write } from './persist';

// The ghost of your best attempt on a level. Levels have a fixed track, so a
// run is fully described by where the ball turned and when: the ghost is a
// polyline of points (x, y, track distance, run time) that is replayed by
// TIME. That keeps it in sync with how the original run went: speed ramps
// with distance, and slow-motion, hit-stops and abilities only change the
// live player's pace, never the ghost's.
//
// Between two points the ball always moved in a straight line at a steady
// pace, so a point is recorded at every turn, and wherever the pace changed
// (slow-mo, an ability) or the ball jumped (an extra life). A 40 s level is
// about a hundred points, a few hundred bytes once packed (see encode).
//
// One ghost per level id, in its own storage key: the furthest attempt, or
// once the level is cleared, the fastest clear. Runs that warped to Universe
// 2 are recorded up to the warp star (the track beyond it is a different
// one), and an attempt saved by a CONTINUE only up to its first crash.

export interface GhostPoint {
  /** World position, px. */
  x: number;
  y: number;
  /** Track distance, px. */
  d: number;
  /** Run time, seconds (the run's own clock: it stops in pauses and frenzies). */
  t: number;
}

/** How the recorded attempt ended at its last point. */
export type GhostEnd = 'clear' | 'dead' | 'warp';

export interface GhostRun {
  pts: GhostPoint[];
  end: GhostEnd;
  /** Track distance (px) and run time (s) at the end. */
  dist: number;
  time: number;
}

const KEY = (levelId: number) => `dontdie_ghost_${levelId}`;
const VERSION = 'g1';

/** True if `a` should replace `b` as the level's ghost. */
export function isBetter(a: GhostRun, b: GhostRun | null): boolean {
  if (!b) return true;
  if ((a.end === 'clear') !== (b.end === 'clear')) return a.end === 'clear';
  return a.end === 'clear' ? a.time < b.time : a.dist > b.dist;
}

// --- Packing ---------------------------------------------------------------
//
// Every value is a whole number (px, or 1/100 s), stored as the difference to
// the previous point (rounded first, so errors never add up), zig-zag
// encoded and written as base-64 digits of 5 bits each, with the 6th bit
// meaning "another digit follows". A straight is ~3 characters (one of dx /
// dy is 0), a distance ~2, a time ~2.

const DIGITS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function packInt(n: number, out: string[]) {
  let z = n >= 0 ? n * 2 : -n * 2 - 1;
  do {
    const bits = z & 31;
    z = Math.floor(z / 32);
    out.push(DIGITS[bits | (z > 0 ? 32 : 0)]);
  } while (z > 0);
}

function unpackInts(s: string): number[] {
  const out: number[] = [];
  let z = 0;
  let mul = 1;
  for (const ch of s) {
    const v = DIGITS.indexOf(ch);
    if (v < 0) throw new Error('bad ghost');
    z += (v & 31) * mul;
    mul *= 32;
    if (v & 32) continue;
    out.push(z % 2 === 0 ? z / 2 : -(z + 1) / 2);
    z = 0;
    mul = 1;
  }
  return out;
}

/** "g1;<end>;<dist>;<time cs>;<packed points>" */
export function encode(run: GhostRun): string {
  const out: string[] = [];
  let px = 0;
  let py = 0;
  let pd = 0;
  let pt = 0;
  for (const p of run.pts) {
    const x = Math.round(p.x);
    const y = Math.round(p.y);
    const d = Math.round(p.d);
    const t = Math.round(p.t * 100);
    packInt(x - px, out);
    packInt(y - py, out);
    packInt(d - pd, out);
    packInt(t - pt, out);
    px = x;
    py = y;
    pd = d;
    pt = t;
  }
  return [VERSION, run.end[0], Math.round(run.dist), Math.round(run.time * 100), out.join('')].join(';');
}

export function decode(s: string): GhostRun | null {
  try {
    const [v, e, dist, time, body] = s.split(';');
    const end = ({ c: 'clear', d: 'dead', w: 'warp' } as const)[e as 'c' | 'd' | 'w'];
    if (v !== VERSION || !end) return null;
    const ints = unpackInts(body ?? '');
    const pts: GhostPoint[] = [];
    let x = 0;
    let y = 0;
    let d = 0;
    let t = 0;
    for (let i = 0; i + 3 < ints.length; i += 4) {
      x += ints[i];
      y += ints[i + 1];
      d += ints[i + 2];
      t += ints[i + 3];
      pts.push({ x, y, d, t: t / 100 });
    }
    if (pts.length < 2) return null;
    return { pts, end, dist: Number(dist) || 0, time: (Number(time) || 0) / 100 };
  } catch {
    return null;
  }
}

export function loadGhost(levelId: number): GhostRun | null {
  const raw = read(KEY(levelId));
  return raw ? decode(raw) : null;
}

/** Keep `run` as the level's ghost if it beats the stored one. Returns true if it did. */
export function offerGhost(levelId: number, run: GhostRun): boolean {
  if (run.pts.length < 2 || !isBetter(run, loadGhost(levelId))) return false;
  write(KEY(levelId), encode(run));
  return true;
}

// --- Recording -----------------------------------------------------------------

/** Pace changes smaller than this (a fraction) don't need a point of their own. */
const PACE_TOLERANCE = 0.06;

/**
 * Records one attempt. GameScene calls `mark` at every turn and `sample`
 * once per frame; `sample` adds a point where the pace changed or the ball
 * jumped, by comparing how far it really moved with the course's speed.
 */
export class GhostRecorder {
  readonly pts: GhostPoint[] = [{ x: 0, y: 0, d: 0, t: 0 }];
  /** The previous frame's end. */
  private prev: GhostPoint = { x: 0, y: 0, d: 0, t: 0 };
  /** Pace (actual / course speed) since the last point, or -1 if not measured yet. */
  private pace = -1;

  /** A turn (or anything that changes the line) at this spot, now. */
  mark(x: number, y: number, d: number, t: number) {
    this.push({ x, y, d, t });
    this.pace = -1;
  }

  /** End of a frame: where the ball is now, and the course's speed here (px/s). */
  sample(x: number, y: number, d: number, t: number, courseSpeed: number) {
    const p = this.prev;
    const dt = t - p.t;
    const now = { x, y, d, t };
    if (dt <= 0) {
      // The run clock stood still (a frenzy): a move now is a jump.
      if (Math.abs(x - p.x) + Math.abs(y - p.y) > 0.5) {
        this.push(p);
        this.push(now);
      }
      this.prev = now;
      return;
    }
    // Path length (axis-aligned, so a turn inside the frame doesn't shorten it).
    const moved = Math.abs(x - p.x) + Math.abs(y - p.y);
    const pace = moved / (dt * Math.max(1, courseSpeed));
    if (pace > 4) {
      // Teleported (an extra life put the ball back on the track).
      this.push(p);
      this.push(now);
      this.pace = -1;
    } else if (this.pace < 0) {
      this.pace = pace;
    } else if (Math.abs(pace - this.pace) > PACE_TOLERANCE * Math.max(this.pace, 0.3)) {
      // The pace changed at the start of this frame.
      this.push(p);
      this.pace = pace;
    }
    this.prev = now;
  }

  /** The finished attempt (its last point is where it ended). */
  finish(x: number, y: number, d: number, t: number, end: GhostEnd): GhostRun {
    this.push({ x, y, d, t });
    return { pts: this.pts.slice(), end, dist: d, time: t };
  }

  private push(p: GhostPoint) {
    const last = this.pts[this.pts.length - 1];
    if (last && Math.abs(last.t - p.t) < 1e-6 && Math.abs(last.x - p.x) + Math.abs(last.y - p.y) < 0.5) return;
    this.pts.push({ ...p });
  }
}

/**
 * Plays a ghost back: where it is at run time `t`. Times only move forward
 * during a run, so a cursor makes each lookup O(1).
 */
export class GhostPlayback {
  private i = 0;

  constructor(readonly run: GhostRun) {}

  get duration() {
    return this.run.pts[this.run.pts.length - 1].t;
  }

  /** Position at time t, written into `out`. Uses the cursor when `seek` is false (t never decreases). */
  at(t: number, out: { x: number; y: number }, seek = false) {
    const pts = this.run.pts;
    let i = seek ? 0 : this.i;
    if (seek) {
      // Binary search for the last point at or before t.
      let lo = 0;
      let hi = pts.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (pts[mid].t <= t) lo = mid;
        else hi = mid - 1;
      }
      i = lo;
    } else {
      while (i < pts.length - 2 && pts[i + 1].t <= t) i++;
      this.i = i;
    }
    const a = pts[i];
    const b = pts[Math.min(i + 1, pts.length - 1)];
    const span = b.t - a.t;
    const k = span > 0 ? Math.max(0, Math.min(1, (t - a.t) / span)) : 1;
    out.x = a.x + (b.x - a.x) * k;
    out.y = a.y + (b.y - a.y) * k;
    return out;
  }
}
