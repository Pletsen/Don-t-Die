import Phaser from 'phaser';
import { type Rect, type Segment, DIRS, trackDistance } from '../game/Track';
import { mix } from './worldPalette';
import { AF, ARROW, CHEV, GLOW, GRID, RUNNER, SPILL, WTEX, createWorldTextures } from './worldTextures';
import { CH, QuadLayer, QuadList } from './worldQuads';

/** How many segments ahead of the current one are drawn. The last one fades in. */
export const LOOKAHEAD = 2;
const SHADOW = 10;
/** Near a junction the newer piece's shadow is left off the older floor. */
const PATCH = 20;
/** Bright core line of the wall, just outside the lane. */
const CORE = 2.5;
const FLOOR = 0x101b27;
const GRID_ALPHA = 0.07;

/** Colour slots in the layer palette. Quads store a slot, not a colour. */
const K = { floor: 0, accent: 1, bright: 2, black: 3, white: 4, gate: 5, runner: 6, dark: 7 } as const;

type Frames = Record<keyof typeof AF, Phaser.Textures.Frame>;

interface SegView {
  seg: Segment | null;
  list: QuadList;
}

/**
 * Draws the corridor from cached quads instead of re-drawing vector paths
 * every frame. When a track piece comes into view its floor, grid, chevrons
 * and walls (light spill, outer glow, bright core) are laid out once as a
 * list of flat quads from one texture atlas. Per frame only the list's fade
 * values and the palette (world colour) change, and everything renders in
 * one batch.
 *
 * Pieces are stacked oldest first, so newer track lies on top of older
 * track like a bridge (with a drop shadow). Where a piece joins the previous
 * one, the walls around the turn square are already drawn by that previous
 * piece and the inner wall is open, so those walls sit on a "cap" channel
 * that only fades in as the previous piece dissolves behind you: no line
 * ever crosses a turn and no glow is drawn twice.
 *
 * Gate markers, the finish line and the wall runners are a second, small
 * quad list rebuilt each frame (a few dozen quads, no allocations).
 */
export class CorridorView {
  private track: QuadLayer;
  private top: QuadLayer;
  private topList = new QuadList();
  private views: SegView[] = [];
  private f: Frames;
  private fxReduced = false;
  private accent = -1;

  constructor(scene: Phaser.Scene) {
    createWorldTextures(scene);
    this.track = new QuadLayer(scene, WTEX.atlas).setDepth(1) as QuadLayer;
    this.top = new QuadLayer(scene, WTEX.atlas).setDepth(2) as QuadLayer;
    this.top.lists.push(this.topList);
    const f = {} as Frames;
    for (const k of Object.keys(AF) as (keyof typeof AF)[]) f[k] = scene.textures.getFrame(WTEX.atlas, AF[k]);
    this.f = f;
    const palette = [FLOOR, 0xffffff, 0xffffff, 0x000000, 0xffffff, 0xffffff, 0xffffff, 0x0b121b];
    this.track.palette = palette;
    this.top.palette = palette;
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
    const to = Math.min(segs.length - 1, current + LOOKAHEAD);
    this.fxReduced = fxReduced;
    if (accent !== this.accent) {
      // A world colour change is five numbers, not a rebuild.
      this.accent = accent;
      const p = this.track.palette;
      p[K.floor] = mix(FLOOR, accent, 0.08);
      p[K.accent] = accent;
      p[K.bright] = mix(accent, 0xffffff, 0.35);
      p[K.gate] = mix(accent, 0xffffff, 0.6);
      p[K.runner] = mix(accent, 0xffffff, 0.55);
    }

    // 1. Let go of pieces that left the window, then make sure every
    //    visible piece has its (cached) quads, oldest first.
    for (const v of this.views) {
      if (!v.seg) continue;
      let keep = false;
      for (let i = from; i <= to; i++) if (segs[i] === v.seg) keep = true;
      if (!keep) this.release(v);
    }
    for (let i = from; i <= to; i++) {
      if (this.viewOf(segs[i])) continue;
      const v = this.acquire();
      v.seg = segs[i];
      this.build(v.list, segs[i], i > 0 ? segs[i - 1] : null);
      this.track.lists.push(v.list);
    }

    // 2. Fades. Track behind the player dissolves as you move away from it,
    //    and the farthest piece ahead fades in as you approach, so the road
    //    reads clearly even where the spiral crosses itself.
    const cur = segs[current];
    const along = cur ? Phaser.Math.Clamp(trackDistance(cur, player.x, player.y) - cur.travelled, 0, cur.length) / cur.length : 1;
    const fx = fxReduced ? 0 : 1;
    for (let i = from; i <= to; i++) {
      const list = this.viewOf(segs[i])!.list;
      list.alpha = alphaOf(segs[i], i, current, player, along);
      const cap = 1 - (i - 1 >= from ? alphaOf(segs[i - 1], i - 1, current, player, along) : 0);
      const front = 1 - (i + 1 <= to ? alphaOf(segs[i + 1], i + 1, current, player, along) : 0);
      const ch = list.chanAlpha;
      ch[CH.cap] = cap;
      ch[CH.front] = front;
      ch[CH.fx] = fx;
      ch[CH.capFx] = cap * fx;
      ch[CH.frontFx] = front * fx;
    }

    // 3. The next turn, the finish line and the wall runners.
    const top = this.topList;
    top.clear();
    this.drawGate(segs, current, time);
    this.drawFinish(segs, current, time);
    if (!fxReduced) this.drawRunners(segs, current, from, to, player, along, time);
  }

  // --- Cached track pieces --------------------------------------------------

  private viewOf(s: Segment): SegView | undefined {
    for (const v of this.views) if (v.seg === s) return v;
    return undefined;
  }

  private release(v: SegView) {
    v.seg = null;
    const lists = this.track.lists;
    const at = lists.indexOf(v.list);
    if (at >= 0) {
      for (let i = at; i < lists.length - 1; i++) lists[i] = lists[i + 1];
      lists.length--;
    }
  }

  private acquire(): SegView {
    for (const v of this.views) if (!v.seg) return v;
    const v: SegView = { seg: null, list: new QuadList() };
    this.views.push(v);
    return v;
  }

  /** Lay out one piece. Runs once per segment, when it comes into view. */
  private build(q: QuadList, s: Segment, prev: Segment | null) {
    const f = this.f;
    q.clear();
    const r = s.rect;
    const d = s.dir;
    const gate = prev ? s.gate : null;

    // Drop shadow, minus the end that joins the previous piece (it would
    // darken that piece's floor right at the turn).
    let sx1 = r.x1;
    let sx2 = r.x2;
    let sy1 = r.y1;
    let sy2 = r.y2;
    if (gate) {
      if (d === 0) sx1 = gate.x2 + PATCH;
      else if (d === 2) sx2 = gate.x1 - PATCH;
      else if (d === 1) sy1 = gate.y2 + PATCH;
      else sy2 = gate.y1 - PATCH;
    }
    if (sx2 > sx1 && sy2 > sy1) q.push(f.px, sx1 + SHADOW, sy1 + SHADOW, sx2 + SHADOW, sy2 + SHADOW, K.black, 0.45);

    // A solid floor: the road reads as a surface, not a wireframe.
    q.push(f.px, r.x1, r.y1, r.x2, r.y2, K.floor);

    // World-aligned grid, so lines continue across pieces.
    for (let x = Math.ceil((r.x1 + 2) / GRID) * GRID; x < r.x2 - 2; x += GRID) q.push(f.softV, x - 1.5, r.y1, x + 1.5, r.y2, K.accent, GRID_ALPHA);
    for (let y = Math.ceil((r.y1 + 2) / GRID) * GRID; y < r.y2 - 2; y += GRID) q.push(f.softH, r.x1, y - 1.5, r.x2, y + 1.5, K.accent, GRID_ALPHA);

    // Chevrons down the middle of the lane, pointing the way.
    const dv = DIRS[d];
    const k = (s.halfWidth * 0.18) / CHEV.size;
    for (let t = 70; t < s.length - 40; t += 70) {
      pointQuad(q, f.chevR, f.chevD, d, s.start.x + dv.x * t, s.start.y + dv.y * t,
        (CHEV.size + CHEV.pad * 2) * k, (CHEV.size * 2 + CHEV.pad * 2) * k, (CHEV.size + CHEV.pad) * k, K.accent, 0.16);
    }

    // Walls. Sides of the rect: 0 top, 1 right, 2 bottom, 3 left. Relative
    // to travel: outer (d), front (d+1), inner (d+2, the side turns go to)
    // and back (d+3).
    const outer = d;
    const front = (d + 1) % 4;
    const inner = (d + 2) % 4;
    const back = (d + 3) % 4;
    const longH = d === 0 || d === 2;
    const frontInner = (d + 2) % 4;
    const frontOuter = (d + 1) % 4;
    const span = (side: number): [number, number] => (side === 0 || side === 2 ? [r.x1, r.x2] : [r.y1, r.y2]);
    const hz = (side: number) => side === 0 || side === 2;

    // Light spill lies inside the lane, so no other piece can double it.
    for (let side = 0; side < 4; side++) {
      const [a, b] = span(side);
      spill(q, f, r, side, a, b, CH.none);
    }

    if (!gate) {
      // First piece: a closed box.
      for (let side = 0; side < 4; side++) {
        const [a, b] = span(side);
        glow(q, f, r, side, a, b, CH.fx);
        core(q, f, r, side, a, b, hz(side), hz(side), CH.none);
      }
      for (let c = 0; c < 4; c++) if (c !== frontInner) corner(q, f, r, c, CH.fx);
      corner(q, f, r, frontInner, CH.frontFx);
      return;
    }

    // Along the travel axis: the turn square is [g0, g1], the rest [g1, e].
    let g0: number;
    let g1: number;
    let e: number;
    if (d === 0) (g0 = r.x1), (g1 = gate.x2), (e = r.x2);
    else if (d === 2) (g0 = r.x2), (g1 = gate.x1), (e = r.x1);
    else if (d === 1) (g0 = r.y1), (g1 = gate.y2), (e = r.y2);
    else (g0 = r.y2), (g1 = gate.y1), (e = r.y1);
    const ra = Math.min(g1, e);
    const rb = Math.max(g1, e);
    const ca = Math.min(g0, g1);
    const cb = Math.max(g0, g1);

    // Our own walls past the turn square.
    for (const side of [outer, inner]) {
      glow(q, f, r, side, ra, rb, CH.fx);
      core(q, f, r, side, ra, rb, longH && e === ra, longH && e === rb, CH.none);
    }
    const [fa, fb] = span(front);
    glow(q, f, r, front, fa, fb, CH.fx);
    core(q, f, r, front, fa, fb, hz(front), hz(front), CH.none);
    corner(q, f, r, frontOuter, CH.fx);
    corner(q, f, r, frontInner, CH.frontFx);

    // The cap: inner opening, the outer wall along the turn square, the
    // back wall and the two back corners.
    spill(q, f, r, inner, ca, cb, CH.cap);
    glow(q, f, r, inner, ca, cb, CH.capFx);
    glow(q, f, r, outer, ca, cb, CH.capFx);
    const [ba, bb] = span(back);
    glow(q, f, r, back, ba, bb, CH.capFx);
    corner(q, f, r, (d + 3) % 4, CH.capFx);
    corner(q, f, r, d, CH.capFx);
    core(q, f, r, inner, ca, cb, longH && g0 === ca, longH && g0 === cb, CH.cap);
    core(q, f, r, outer, ca, cb, longH && g0 === ca, longH && g0 === cb, CH.cap);
    core(q, f, r, back, ba, bb, hz(back), hz(back), CH.cap);
  }

  // --- The next turn --------------------------------------------------------

  private drawGate(segs: Segment[], current: number, time: number) {
    const next = segs[current + 1];
    const cur = segs[current];
    const g = next?.gate;
    if (!g || !cur) return;
    const q = this.topList;
    const f = this.f;
    const pulse = 0.5 + 0.5 * Math.sin(time * 6);

    // Soft wash over the whole turn square.
    q.push(f.px, g.x1, g.y1, g.x2, g.y2, K.accent, 0.05 + pulse * 0.05);

    // Ripple expanding out of the turn square.
    if (!this.fxReduced) {
      const k = (time * 1.4) % 1;
      const grow = k * 14;
      const a = (1 - k) * 0.35;
      const x1 = g.x1 - grow;
      const y1 = g.y1 - grow;
      const x2 = g.x2 + grow;
      const y2 = g.y2 + grow;
      q.push(f.px, x1 - 1, y1 - 1, x2 + 1, y1 + 1, K.gate, a);
      q.push(f.px, x1 - 1, y2 - 1, x2 + 1, y2 + 1, K.gate, a);
      q.push(f.px, x1 - 1, y1 + 1, x1 + 1, y2 - 1, K.gate, a);
      q.push(f.px, x2 - 1, y1 + 1, x2 + 1, y2 - 1, K.gate, a);
    }

    // PERFECT sweet spot: a glowing line across the lane at the centre of
    // the zone, with notches on both walls where the zone starts and ends.
    const p = next.perfect ?? g;
    const glowA = 0.35 + pulse * 0.25;
    const coreA = 0.6 + pulse * 0.3;
    const notchA = 0.8 + pulse * 0.2;
    const N = 10;
    const T = 1.25;
    if (cur.dir === 0 || cur.dir === 2) {
      const cx = (p.x1 + p.x2) / 2;
      q.push(f.softV, cx - 9, g.y1, cx + 9, g.y2, K.accent, glowA);
      q.push(f.px, cx - 1.25, g.y1, cx + 1.25, g.y2, K.gate, coreA);
      for (let j = 0; j < 2; j++) {
        const x = j === 0 ? p.x1 : p.x2;
        q.push(f.px, x - T, g.y1, x + T, g.y1 + N, K.gate, notchA);
        q.push(f.px, x - T, g.y2 - N, x + T, g.y2, K.gate, notchA);
      }
    } else {
      const cy = (p.y1 + p.y2) / 2;
      q.push(f.softH, g.x1, cy - 9, g.x2, cy + 9, K.accent, glowA);
      q.push(f.px, g.x1, cy - 1.25, g.x2, cy + 1.25, K.gate, coreA);
      for (let j = 0; j < 2; j++) {
        const y = j === 0 ? p.y1 : p.y2;
        q.push(f.px, g.x1, y - T, g.x1 + N, y + T, K.gate, notchA);
        q.push(f.px, g.x2 - N, y - T, g.x2, y + T, K.gate, notchA);
      }
    }

    // Arrows pointing where the turn goes: world colour, thin white core.
    const dir = next.dir;
    const d = DIRS[dir];
    const cx = (g.x1 + g.x2) / 2;
    const cy = (g.y1 + g.y2) / 2;
    const size = Math.min(g.x2 - g.x1, g.y2 - g.y1) * 0.16;
    const k = size / ARROW.size;
    const along = (ARROW.size + ARROW.pad * 2) * k;
    const across = (ARROW.size * 2 + ARROW.pad * 2) * k;
    const tip = (ARROW.size + ARROW.pad) * k;
    const drift = ((time * 2) % 1) * size * 0.3;
    for (let i = 0; i < 2; i++) {
      const o = (i - 0.5) * size * 0.9 + drift;
      const tx = cx + d.x * o;
      const ty = cy + d.y * o;
      pointQuad(q, f.arrowR, f.arrowD, dir, tx, ty, along, across, tip, K.accent, 0.6 + pulse * 0.25);
      pointQuad(q, f.arrowCoreR, f.arrowCoreD, dir, tx, ty, along, across, tip, K.white, 0.75 + pulse * 0.25);
    }
  }

  /** Checkered finish strip across the lane, with a pulsing glow. */
  private drawFinish(segs: Segment[], current: number, time: number) {
    // Only show the finish once it's close, so it isn't mistaken for part of
    // the track where the spiral crosses itself.
    let s: Segment | null = null;
    for (let i = current; i <= current + 1; i++) if (segs[i]?.finish) s = segs[i];
    if (!s) return;
    const q = this.topList;
    const px = this.f.px;
    const fp = s.finish!;
    const hw = s.halfWidth;
    const cell = (hw * 2) / 8;
    const pulse = 0.5 + 0.5 * Math.sin(time * 5);
    const ga = 0.18 + pulse * 0.16;
    if (s.dir === 0 || s.dir === 2) {
      q.push(this.f.softV, fp.x - cell * 2.5, fp.y - hw, fp.x + cell * 2.5, fp.y + hw, K.white, ga);
      q.push(px, fp.x - cell, fp.y - hw, fp.x + cell, fp.y + hw, K.dark, 0.9);
    } else {
      q.push(this.f.softH, fp.x - hw, fp.y - cell * 2.5, fp.x + hw, fp.y + cell * 2.5, K.white, ga);
      q.push(px, fp.x - hw, fp.y - cell, fp.x + hw, fp.y + cell, K.dark, 0.9);
    }
    // Two rows of light squares on the dark strip.
    const d = DIRS[s.dir];
    const ax = -d.y;
    const ay = d.x;
    for (let row = 0; row < 2; row++) {
      for (let i = row % 2; i < 8; i += 2) {
        const a = -hw + i * cell + cell / 2;
        const b = (row - 1) * cell + cell / 2;
        const cx = fp.x + ax * a + d.x * b;
        const cy = fp.y + ay * a + d.y * b;
        q.push(px, cx - cell / 2, cy - cell / 2, cx + cell / 2, cy + cell / 2, K.white, 0.9);
      }
    }
  }

  /**
   * Current running along the walls: a bright dash with a fading tail, like
   * a pulse in a neon tube. They stay clear of the corners (where you need
   * to read the turn) and hide where a wall runs under another piece.
   */
  private drawRunners(
    segs: Segment[],
    current: number,
    from: number,
    to: number,
    player: { x: number; y: number },
    along: number,
    time: number,
  ) {
    const q = this.topList;
    for (let i = current; i <= to; i++) {
      const s = segs[i];
      const segAlpha = alphaOf(s, i, current, player, along);
      if (segAlpha <= 0) continue;
      const hw = s.halfWidth;
      const lo = hw * 2 + 24;
      const hi = s.length + hw * 2 - lo;
      const span = hi - lo;
      if (span < 60) continue;
      const dv = DIRS[s.dir];
      const px = -dv.y;
      const py = dv.x;
      for (let side = -1; side <= 1; side += 2) {
        const head = lo + ((time * 300 + s.id * 131 + (side > 0 ? span / 2 : 0)) % (span + 90));
        const a = Math.min(clamp01((head - lo) / 30), clamp01((hi - head) / 30)) * segAlpha;
        if (a <= 0) continue;
        const off = hw + 1.25;
        const hx = s.start.x + dv.x * (head - hw) + px * off * side;
        const hy = s.start.y + dv.y * (head - hw) + py * off * side;
        if (insideOther(segs, from, to, s, hx - dv.x * RUNNER.len * 0.5, hy - dv.y * RUNNER.len * 0.5)) continue;
        pointQuad(q, this.f.runnerR, this.f.runnerD, s.dir, hx, hy, RUNNER.len, RUNNER.h, RUNNER.len, K.runner, a);
      }
    }
  }
}

function alphaOf(s: Segment, index: number, current: number, player: { x: number; y: number }, along: number) {
  if (index < current) return Phaser.Math.Clamp(1 - distToRect(player.x, player.y, s.rect) / 240, 0, 1);
  if (index === current + LOOKAHEAD) return Phaser.Math.Clamp(0.15 + along * 1.2, 0, 1);
  return 1;
}

function insideOther(segs: Segment[], from: number, to: number, self: Segment, x: number, y: number) {
  for (let i = from; i <= to; i++) {
    const o = segs[i];
    if (o === self) continue;
    const r = o.rect;
    if (x > r.x1 && x < r.x2 && y > r.y1 && y < r.y2) return true;
  }
  return false;
}

/**
 * A shape that points along travel direction `dir` (frames R and D, mirrored
 * for W and N). `tip` is the distance from its back edge to (tx, ty).
 */
function pointQuad(q: QuadList, fR: Phaser.Textures.Frame, fD: Phaser.Textures.Frame, dir: number, tx: number, ty: number, along: number, across: number, tip: number, kind: number, alpha: number) {
  const h = across / 2;
  if (dir === 0) q.push(fR, tx - tip, ty - h, tx - tip + along, ty + h, kind, alpha);
  else if (dir === 2) q.push(fR, tx + tip, ty - h, tx + tip - along, ty + h, kind, alpha);
  else if (dir === 1) q.push(fD, tx - h, ty - tip, tx + h, ty - tip + along, kind, alpha);
  else q.push(fD, tx - h, ty + tip, tx + h, ty + tip - along, kind, alpha);
}

/** Outer haze along [a, b] of a rect side (mirrored per side). */
function glow(q: QuadList, f: Frames, r: Rect, side: number, a: number, b: number, chan: number) {
  if (b - a <= 0.5) return;
  if (side === 0) q.push(f.glowH, a, r.y1 - GLOW, b, r.y1, K.accent, 1, chan);
  else if (side === 2) q.push(f.glowH, a, r.y2 + GLOW, b, r.y2, K.accent, 1, chan);
  else if (side === 3) q.push(f.glowV, r.x1 - GLOW, a, r.x1, b, K.accent, 1, chan);
  else q.push(f.glowV, r.x2 + GLOW, a, r.x2, b, K.accent, 1, chan);
}

/** Light spilling into the lane along [a, b] of a rect side. */
function spill(q: QuadList, f: Frames, r: Rect, side: number, a: number, b: number, chan: number) {
  if (b - a <= 0.5) return;
  if (side === 0) q.push(f.spillH, a, r.y1, b, r.y1 + SPILL, K.accent, 1, chan);
  else if (side === 2) q.push(f.spillH, a, r.y2, b, r.y2 - SPILL, K.accent, 1, chan);
  else if (side === 3) q.push(f.spillV, r.x1, a, r.x1 + SPILL, b, K.accent, 1, chan);
  else q.push(f.spillV, r.x2, a, r.x2 - SPILL, b, K.accent, 1, chan);
}

/** The bright core line just outside [a, b]; horizontal ones can run on into corners. */
function core(q: QuadList, f: Frames, r: Rect, side: number, a: number, b: number, extA: boolean, extB: boolean, chan: number) {
  if (b - a <= 0.5) return;
  if (side === 0 || side === 2) {
    const x1 = a - (extA ? CORE : 0);
    const x2 = b + (extB ? CORE : 0);
    if (side === 0) q.push(f.px, x1, r.y1 - CORE, x2, r.y1, K.bright, 1, chan);
    else q.push(f.px, x1, r.y2, x2, r.y2 + CORE, K.bright, 1, chan);
  } else if (side === 3) q.push(f.px, r.x1 - CORE, a, r.x1, b, K.bright, 1, chan);
  else q.push(f.px, r.x2, a, r.x2 + CORE, b, K.bright, 1, chan);
}

/** Round glow around rect corner `c` (0 TL, 1 TR, 2 BR, 3 BL). */
function corner(q: QuadList, f: Frames, r: Rect, c: number, chan: number) {
  const x = c === 0 || c === 3 ? r.x1 : r.x2;
  const y = c === 0 || c === 1 ? r.y1 : r.y2;
  const ox = c === 0 || c === 3 ? x - GLOW : x + GLOW;
  const oy = c === 0 || c === 1 ? y - GLOW : y + GLOW;
  q.push(f.corner, ox, oy, x, y, K.accent, 1, chan);
}

function distToRect(x: number, y: number, r: Rect) {
  const dx = Math.max(r.x1 - x, 0, x - r.x2);
  const dy = Math.max(r.y1 - y, 0, y - r.y2);
  return Math.hypot(dx, dy);
}

function clamp01(v: number) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
