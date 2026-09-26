import Phaser from 'phaser';
import { Track, DIRS, pointInRect, distToRectEdge, trackDistance, type Dir, type Hazard, type Segment, type WarpStar } from '../game/Track';
import { tuning, METERS_PER_PX } from '../game/tuning';
import { shared, EV, type DeathData, type ClearData, type PlayRequest } from '../game/shared';
import { endlessCourse, levelCourse, type Course } from '../game/course';
import { levelById } from '../game/levels';
import { display } from '../game/display';
import { save } from '../game/storage';
import { css, palette, hueColor } from '../game/palette';
import { sfx, haptic } from '../audio/Sfx';
import { music } from '../audio/Music';
import { CorridorView, LOOKAHEAD } from '../fx/CorridorView';
import { PlayerView } from '../fx/PlayerView';
import { HazardView } from '../fx/HazardView';
import { Effects } from '../fx/Effects';
import { Backdrop } from '../fx/Backdrop';
import { BackgroundEvents } from '../fx/BackgroundEvents';
import { WarpStarView } from '../fx/WarpStarView';

type State = 'ready' | 'play' | 'dead' | 'clear';

const MILESTONES: [number, string][] = [
  [404, '404: EXIT NOT FOUND'],
  [1000, '1 KM. RESPECT.'],
  [1337, '1337'],
  [2001, 'A SPACE ODYSSEY'],
  [3000, 'ARE YOU A BOT?'],
];

const clamp = Phaser.Math.Clamp;
const lerp = Phaser.Math.Linear;
/** Frame-rate independent smoothing: `rate` is how much is left after 1 s. */
const damp = (rate: number, dt: number) => 1 - Math.pow(rate, dt);

/**
 * The world: track, player, hazards and camera. It owns the game rules and
 * tells the UI scene what happened through events on `game.events`.
 */
export class GameScene extends Phaser.Scene {
  private state: State = 'ready';
  private course: Course = endlessCourse();
  private track!: Track;
  private current = 0;

  private player = { x: 0, y: 0, dir: 0 as Dir };
  private distance = 0;
  private elapsed = 0;
  private combo = 0;
  private perfects = 0;
  private gateTurns = 0;
  private turnCount = 0;
  private nextTickAt = 0;
  private lastSector = 0;
  private coast = 0;
  private slowMo = 0;
  private nearWallFlags = new Set<number>();
  private nearHazardFlags = new WeakSet<Hazard>();

  private cam = { x: 0, y: 0, zoom: 1, punch: 0 };
  private deathFade = 0;

  private corridor!: CorridorView;
  private playerView!: PlayerView;
  private effects!: Effects;
  private backdrop!: Backdrop;
  private visitors!: BackgroundEvents;
  private milestonesHit = new Set<number>();
  private hazardViews = new Map<Hazard, HazardView>();
  private starView: WarpStarView | null = null;
  private starSparkled = false;
  private ducks = 0;

  private bloom?: Phaser.Types.Actions.AddEffectBloomReturn;
  private grade?: Phaser.Filters.ColorMatrix;

  constructor() {
    super('Game');
  }

  create() {
    this.backdrop = new Backdrop(this);
    this.visitors = new BackgroundEvents(this);
    this.corridor = new CorridorView(this);
    this.playerView = new PlayerView(this, tuning.playerRadius);
    this.effects = new Effects(this);

    this.setupCamera();
    this.resetRun(endlessCourse());

    const listeners: [string, (...args: any[]) => void][] = [
      [EV.play, this.onPlay],
      [EV.menu, this.onMenu],
      [EV.tap, this.onTap],
      [EV.fxChanged, this.applyFxSetting],
      [EV.skin, () => this.playerView.setSkin(save.skin)],
    ];
    listeners.forEach(([ev, fn]) => this.game.events.on(ev, fn, this));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      listeners.forEach(([ev, fn]) => this.game.events.off(ev, fn, this));
    });
  }

  // --- Camera & post-processing ---------------------------------------------

  private setupCamera() {
    const cam = this.cameras.main;

    // Bloom makes bright pixels bleed light into their surroundings. This is
    // what turns flat coloured lines into glowing neon.
    this.bloom = Phaser.Actions.AddEffectBloom(cam, {
      threshold: 0.56,
      blurRadius: 1.8,
      blurSteps: 4,
      blurQuality: 1,
      blendAmount: 1.1,
    })[0];

    // Colour grading, used to drain the colour out of the world on death.
    this.grade = cam.filters.internal.addColorMatrix();
    this.grade.active = false;

    this.applyFxSetting();

    this.scale.on('resize', (size: Phaser.Structs.Size) => cam.setSize(size.width, size.height));
  }

  private applyFxSetting() {
    if (this.bloom) this.bloom.parallelFilters.active = !save.fxReduced;
  }

  /** Base zoom so the track looks similar on a phone and a big monitor. */
  private baseZoom() {
    const { w, h } = display.size(this);
    return clamp(Math.min(w, h) / 430, 0.85, 1.45);
  }

  // --- Run lifecycle --------------------------------------------------------

  private resetRun(course: Course) {
    this.hazardViews.forEach((v) => v.destroy());
    this.hazardViews.clear();
    this.effects.clear();
    this.starView?.destroy();
    this.starView = null;
    this.starSparkled = false;
    this.ducks = 0;
    this.setUniverse(false);

    this.state = 'ready';
    this.course = course;
    this.track = new Track(course);
    this.current = 0;
    this.player = { x: 0, y: 0, dir: 0 };
    this.distance = 0;
    this.elapsed = 0;
    this.combo = 0;
    this.perfects = 0;
    this.gateTurns = 0;
    this.turnCount = 0;
    this.nextTickAt = 0;
    this.lastSector = 0;
    this.slowMo = 0;
    this.nearWallFlags.clear();
    this.milestonesHit.clear();
    this.nearHazardFlags = new WeakSet();

    this.playerView.reset();
    this.playerView.setSkin(save.skin);
    this.playerView.setPosition(0, 0);
    this.playerView.setEmitting(false);

    this.cam = { x: 60, y: 0, zoom: 1, punch: 0 };
  }

  private onPlay(req: PlayRequest) {
    const level = req.level === null ? undefined : levelById(req.level);
    this.resetRun(level ? levelCourse(level) : endlessCourse());
    sfx.unlock();
    sfx.start();
    this.state = 'play';
    music.setEnergy(1);
    this.playerView.setEmitting(true);
    this.effects.shockwave(0, 0, this.course.accentAt(0), 90, 500);
    this.game.events.emit(EV.started, { meters: 0, seconds: 0, goal: this.goalMeters() });
  }

  private onMenu() {
    music.setEnergy(0);
    this.resetRun(endlessCourse());
  }

  private onTap() {
    if (this.state === 'play') this.turn();
  }

  private goalMeters() {
    return this.course.goalPx === null ? null : this.course.goalPx * METERS_PER_PX;
  }

  /** Snapshot used by automated browser tests (see scripts/). */
  debugState() {
    const next = this.track.get(this.current + 1);
    return {
      state: this.state,
      level: this.course.level?.id ?? null,
      x: this.player.x,
      y: this.player.y,
      dir: this.player.dir,
      meters: this.distance * METERS_PER_PX,
      combo: this.combo,
      perfect: next?.perfect ?? null,
      gate: next?.gate ?? null,
    };
  }

  // --- Rules ----------------------------------------------------------------

  private turn() {
    const next = this.track.get(this.current + 1);
    const inGate = !!next?.gate && pointInRect(this.player.x, this.player.y, next.gate);
    const perfect = inGate && !!next?.perfect && pointInRect(this.player.x, this.player.y, next.perfect);

    const oldHeading = Math.atan2(DIRS[this.player.dir].y, DIRS[this.player.dir].x);
    this.player.dir = ((this.player.dir + 1) % 4) as Dir;
    this.playerView.onTurn();
    this.effects.turn(this.player.x, this.player.y, oldHeading, palette.cyan, save.fxReduced);
    sfx.turn(this.turnCount++);
    haptic(8);

    if (!inGate) return;
    this.gateTurns++;
    if (perfect) {
      this.combo++;
      this.perfects++;
      const label = this.combo > 1 ? `PERFECT x${this.combo}` : 'PERFECT';
      this.effects.floater(this.player.x, this.player.y - 26, label, css.orange, this.combo > 4 ? 17 : 14);
      this.effects.shockwave(this.player.x, this.player.y, palette.orange, 70 + Math.min(this.combo, 6) * 10);
      this.effects.burst(this.player.x, this.player.y, [palette.orange, 0xffe0b0], save.fxReduced ? 6 : 18);
      this.cam.punch = 0.05 + Math.min(this.combo, 6) * 0.008;
      shared.pulse = 1;
      sfx.perfect(this.combo);
      haptic(16);
      this.game.events.emit(EV.combo, this.combo);
    } else {
      this.combo = 0;
    }
  }

  private die(cause: DeathData['cause'], color: number) {
    if (this.state !== 'play') return;
    this.state = 'dead';
    music.duck();
    music.setEnergy(0);
    this.slowMo = 0.6;

    const { x, y } = this.player;
    const fx = save.fxReduced;
    this.effects.burst(x, y, [color, 0xffffff], fx ? 16 : 46);
    this.effects.debris(x, y, color, fx ? 8 : 22);
    this.effects.shockwave(x, y, color, 220, 650);
    this.effects.flare(x, y, color, 140);
    this.playerView.fadeOut(this);

    const cam = this.cameras.main;
    cam.shake(fx ? 150 : 320, fx ? 0.004 : 0.012);
    if (!fx) cam.flash(220, 255, 255, 255);
    this.cam.punch = 0.12;

    if (cause === 'wall') sfx.death();
    else sfx.hazard();
    haptic([30, 20, 50]);

    // The best-distance record belongs to survival mode only.
    const meters = this.distance * METERS_PER_PX;
    const endless = this.course.level === null;
    const isNewBest = endless && meters > save.best;
    if (isNewBest) save.setBest(meters);
    save.addDeath();

    const data: DeathData = {
      meters,
      seconds: this.elapsed,
      goal: this.goalMeters(),
      level: this.course.level?.id ?? null,
      warped: this.course.warped,
      ducks: this.ducks,
      best: save.best,
      isNewBest,
      cause,
      deaths: save.deaths,
    };
    this.time.delayedCall(520, () => {
      if (isNewBest && meters > 1) sfx.newBest();
      this.game.events.emit(EV.died, data);
    });
  }

  /** Crossed the finish line. */
  private clear() {
    const level = this.course.level!;
    this.state = 'clear';
    this.coast = this.course.speedAt(this.distance);
    this.combo = 0;
    this.playerView.setEmitting(false);

    // Stars: 1 for finishing, 2 for half the turns PERFECT, 3 for 90 %.
    const ratio = this.gateTurns > 0 ? this.perfects / this.gateTurns : 0;
    const stars = 1 + (ratio >= 0.5 ? 1 : 0) + (ratio >= 0.9 ? 1 : 0);
    const previousStars = save.starsFor(level.id);
    save.recordStars(level.id, stars);
    if (this.course.warped) {
      save.recordWarp(level.id);
      // Ducks only become currency when you make it to the finish.
      save.addDucks(this.ducks);
    }

    const { x, y } = this.player;
    const color = this.course.accentAt(this.distance);
    this.effects.shockwave(x, y, color, 260, 800);
    this.effects.shockwave(x, y, 0xffffff, 160, 600);
    this.effects.burst(x, y, [color, 0xffffff, palette.orange], save.fxReduced ? 20 : 60);
    this.effects.flare(x, y, color, 160);
    this.cam.punch = 0.1;
    shared.pulse = 1;
    sfx.clear();
    music.setEnergy(0);
    haptic([20, 40, 20]);

    const data: ClearData = {
      level: level.id,
      meters: this.distance * METERS_PER_PX,
      seconds: this.elapsed,
      goal: this.goalMeters(),
      stars,
      previousStars,
      perfects: this.perfects,
      turns: this.gateTurns,
      warped: this.course.warped,
      ducks: this.ducks,
    };
    this.time.delayedCall(650, () => this.game.events.emit(EV.cleared, data));
  }

  // --- Frame loop -----------------------------------------------------------

  update(_time: number, deltaMs: number) {
    const dt = Math.min(deltaMs / 1000, 1 / 30);
    const t = this.time.now / 1000;

    if (this.state === 'play') this.step(dt);
    else if (this.slowMo > 0) this.slowMo = Math.max(0, this.slowMo - dt);
    if (this.state === 'clear') this.coastToStop(dt);

    const speed = this.course.speedAt(this.distance);
    const speedNorm = clamp((speed - 230) / 390, 0, 1);
    // The bonus universe cycles through the rainbow.
    const accent = this.course.warped ? hueColor(t * 70) : this.course.accentAt(this.distance);
    shared.warp = lerp(shared.warp, this.course.warped ? 1 : 0, damp(this.course.warped ? 0.2 : 0.0001, dt));
    this.updateWarpStar(t);

    // Hazards animate even while the menu is up. Only those on visible
    // segments are shown; ones on track already passed are hidden.
    const shown = new Set<Hazard>();
    for (const seg of this.visibleSegments()) {
      for (const hz of seg.hazards) {
        if (!hz.alive) continue;
        shown.add(hz);
        let view = this.hazardViews.get(hz);
        if (!view) {
          view = new HazardView(this, hz);
          this.hazardViews.set(hz, view);
        }
        view.update(t, dt);
      }
    }
    this.hazardViews.forEach((view, hz) => view.setVisible(shown.has(hz)));

    this.corridor.draw(this.track.segments, this.current, this.player, accent, t, save.fxReduced);
    this.playerView.setPosition(this.player.x, this.player.y);
    const heading = Math.atan2(DIRS[this.player.dir].y, DIRS[this.player.dir].x);
    this.playerView.update(t, dt, heading, speedNorm, tuning.playerRadius);

    this.updateCamera(dt, speedNorm, t);
    this.visitors.update(this.cam.x, this.cam.y, this.cameras.main, dt, t, save.fxReduced);
    this.updateGrade(dt);

    shared.accent = accent;
    shared.intensity = lerp(shared.intensity, this.state === 'play' ? speedNorm : 0.15, damp(0.2, dt));
    shared.pulse = Math.max(0, shared.pulse - dt * 2.5);

    if (this.state === 'play') {
      this.game.events.emit(EV.hud, {
        meters: this.distance * METERS_PER_PX,
        seconds: this.elapsed,
        goal: this.goalMeters(),
      });
    }
  }

  /** After the finish line the orb glides to a stop instead of crashing. */
  private coastToStop(dt: number) {
    this.coast *= Math.pow(0.02, dt);
    const d = DIRS[this.player.dir];
    this.player.x += d.x * this.coast * dt;
    this.player.y += d.y * this.coast * dt;
  }

  /** Advance the simulation by one frame while playing. */
  private step(dt: number) {
    this.elapsed += dt;
    if (this.slowMo > 0) this.slowMo = Math.max(0, this.slowMo - dt);
    const sim = dt * (this.slowMo > 0 ? 0.35 : 1);

    const speed = this.course.speedAt(this.distance);
    const d = DIRS[this.player.dir];
    this.player.x += d.x * speed * sim;
    this.player.y += d.y * speed * sim;

    this.track.ensureAhead(this.current, tuning.segmentsAhead);

    let cur = this.track.get(this.current)!;
    let next = this.track.get(this.current + 1);
    if (next && this.player.dir === next.dir && pointInRect(this.player.x, this.player.y, next.rect)) {
      this.current++;
      cur = next;
      next = this.track.get(this.current + 1);
      this.pruneTrack();
    }

    // Distance is measured along the track, not summed from movement, so it
    // agrees exactly with where the finish line is drawn. It never goes
    // backwards (a late turn briefly overshoots the corner).
    if (this.player.dir === cur.dir) {
      this.distance = Math.max(this.distance, trackDistance(cur, this.player.x, this.player.y));
    }
    if (cur.finish && this.course.goalPx !== null && this.player.dir === cur.dir && this.distance >= this.course.goalPx) {
      this.distance = this.course.goalPx;
      this.clear();
      return;
    }

    const inCur = pointInRect(this.player.x, this.player.y, cur.rect);
    const inNext = !!next && pointInRect(this.player.x, this.player.y, next.rect);
    if (!inCur && !inNext) {
      this.die('wall', palette.ink);
      return;
    }

    if (!this.course.level) this.checkMilestones();
    this.tickNearbyBombs(cur, next);
    for (const seg of [cur, next]) {
      if (seg?.warpStar && !seg.warpStar.taken) this.checkWarpStar(seg.warpStar);
      if (this.state !== 'play') return;
    }

    // Near miss against the walls: once per segment.
    const edge = distToRectEdge(this.player.x, this.player.y, inCur ? cur.rect : next!.rect);
    if (edge < 10 && !this.nearWallFlags.has(cur.id)) {
      this.nearWallFlags.add(cur.id);
      const extreme = edge < 3;
      this.effects.floater(this.player.x, this.player.y - 20, extreme ? '1PX' : 'CLOSE', css.cyan, extreme ? 16 : 12);
      this.slowMo = Math.max(this.slowMo, 0.1);
      sfx.near();
      haptic(5);
    }

    const nearby = [...cur.hazards, ...(next?.hazards ?? [])];
    for (const hz of nearby) {
      if (!hz.alive) continue;
      if (hz.moving) {
        // Driven by run time, so moving hazards repeat exactly on every attempt.
        const osc = Math.sin(this.elapsed * 1.6 + hz.movePhase) * hz.moveRange;
        if (hz.moveAxis === 'y') hz.y = hz.baseY + osc;
        else hz.x = hz.baseX + osc;
      }
      const dist = Math.hypot(this.player.x - hz.x, this.player.y - hz.y);
      if (hz.kind === 'duck') {
        if (dist < hz.radius + tuning.playerRadius) this.bonkDuck(hz);
        continue;
      }
      if (dist < hz.radius + tuning.playerRadius) {
        // The hazard stays on screen: you should see what got you.
        this.die(hz.kind === 'saw' ? 'saw' : 'bomb', hz.kind === 'saw' ? palette.magenta : palette.orange);
        return;
      }
      if (dist < hz.radius + tuning.playerRadius + 16 && !this.nearHazardFlags.has(hz)) {
        this.nearHazardFlags.add(hz);
        this.effects.floater(this.player.x, this.player.y - 20, 'CLOSE', css.magenta, 12);
        this.slowMo = Math.max(this.slowMo, 0.09);
        sfx.near();
      }
    }
  }

  // --- The warp star and the bonus universe ---------------------------------

  /** Show the star while its segment is on screen. */
  private updateWarpStar(t: number) {
    const seg = this.visibleSegments().find((s) => s.warpStar && !s.warpStar.taken);
    if (seg && !this.starView) this.starView = new WarpStarView(this, seg.warpStar!);
    if (!seg && this.starView) {
      this.starView.destroy();
      this.starView = null;
    }
    this.starView?.update(t);
  }

  private checkWarpStar(star: WarpStar) {
    const dist = Math.hypot(this.player.x - star.x, this.player.y - star.y);
    if (dist < 80 && !this.starSparkled) {
      this.starSparkled = true;
      sfx.starNear();
    }
    // Deliberately tiny pickup radius: it should be hard to hit.
    if (dist < tuning.playerRadius + 5) this.warp(star);
  }

  /** You hit the star: off to the bonus universe for the rest of the run. */
  private warp(star: WarpStar) {
    star.taken = true;
    this.starView?.destroy();
    this.starView = null;
    this.course.enterWarp(this.distance);

    // Hazards already generated ahead are swapped out: the new universe
    // brings its own (harmless, but loud) residents.
    for (const seg of this.track.segments.slice(this.current + 1)) {
      seg.finish = null; // the finish moves twice as far away
      for (const hz of seg.hazards) {
        this.hazardViews.get(hz)?.destroy();
        this.hazardViews.delete(hz);
      }
      this.track.refillHazards(seg);
    }

    const { x, y } = this.player;
    const rainbow = [0xff2f9e, 0xffd21f, 0x2be8ff, 0x7cff6b, 0xff9a2e, 0xb36bff];
    rainbow.forEach((c, i) => this.time.delayedCall(i * 70, () => this.effects.shockwave(x, y, c, 120 + i * 60, 700)));
    this.effects.burst(x, y, rainbow, save.fxReduced ? 20 : 70);
    this.effects.floater(x, y - 34, 'WARP!', '#ffffff', 26);
    if (!save.fxReduced) this.cameras.main.flash(400, 255, 255, 255);
    this.cam.punch = 0.25;
    this.slowMo = 0.5;
    shared.pulse = 1;
    sfx.warp();
    haptic([40, 30, 40, 30, 80]);
    this.setUniverse(true);
    this.game.events.emit(EV.warp);
  }

  /** Switch everything between the normal and the bonus universe. */
  private setUniverse(on: boolean) {
    sfx.party = on;
    music.setParty(on);
    this.playerView.setParty(on);
    this.visitors.setParty(on);
  }

  /** Rubber ducks are harmless: bonk them out of the way. */
  private bonkDuck(hz: Hazard) {
    hz.alive = false;
    const view = this.hazardViews.get(hz);
    this.hazardViews.delete(hz);
    const d = DIRS[this.player.dir];
    view?.knockAway(d.x, d.y);
    this.ducks++;
    sfx.quack();
    const lines = ['QUACK', 'BONK', 'SORRY DUCK', 'QUACK QUACK', 'DUCK OFF', 'WHEEE'];
    this.effects.floater(hz.x, hz.y - 20, lines[this.ducks % lines.length], '#ffd21f', 14);
    this.effects.burst(hz.x, hz.y, [0xffd21f, 0xffffff, 0xff9a2e], save.fxReduced ? 6 : 16);
  }

  /** Bombs tick when you get close, faster the closer you are. */
  private tickNearbyBombs(cur: Segment, next: Segment | undefined) {
    let closest = Infinity;
    for (const hz of [...cur.hazards, ...(next?.hazards ?? [])]) {
      if (hz.kind === 'bomb') closest = Math.min(closest, Math.hypot(this.player.x - hz.x, this.player.y - hz.y));
    }
    if (closest > 170 || this.elapsed < this.nextTickAt) return;
    const closeness = 1 - closest / 170;
    sfx.bombTick(closeness);
    this.nextTickAt = this.elapsed + 0.42 - closeness * 0.32;
  }

  /** Survival easter eggs: a little message at special distances. */
  private checkMilestones() {
    const m = this.distance * METERS_PER_PX;
    // A rising sweep each time the world changes colour.
    const sector = [250, 550, 950].filter((s) => m >= s).length;
    if (sector > this.lastSector) {
      this.lastSector = sector;
      sfx.sweep();
    }
    for (const [at, text] of MILESTONES) {
      if (m < at || this.milestonesHit.has(at)) continue;
      this.milestonesHit.add(at);
      this.effects.floater(this.player.x, this.player.y - 34, text, css.ink, 15);
      this.effects.shockwave(this.player.x, this.player.y, 0xffffff, 120, 500);
      sfx.newBest();
    }
  }

  private pruneTrack() {
    const keepFrom = this.current - 2;
    if (keepFrom <= 0) return;
    for (const seg of this.track.pruneBefore(keepFrom)) {
      for (const hz of seg.hazards) {
        this.hazardViews.get(hz)?.destroy();
        this.hazardViews.delete(hz);
      }
    }
    this.current -= keepFrom;
  }

  private visibleSegments(): Segment[] {
    const s = this.track.segments;
    return s.slice(Math.max(0, this.current - 1), Math.min(s.length, this.current + LOOKAHEAD + 1));
  }

  private updateCamera(dt: number, speedNorm: number, t: number) {
    const cam = this.cameras.main;
    const d = DIRS[this.player.dir];

    // Look ahead in the direction of travel, further at higher speed.
    const look = this.state === 'ready' ? 0 : this.state === 'clear' ? 20 : 70 + speedNorm * 50;
    let tx = this.player.x + d.x * look;
    let ty = this.player.y + d.y * look;
    if (this.state === 'ready') {
      // Title screen: idle drift, with the track sitting below the logo.
      const { h } = display.size(this);
      tx += Math.sin(t * 0.4) * 20 + 60;
      ty += Math.cos(t * 0.33) * 14 - (h * 0.17) / this.baseZoom();
    }
    this.cam.x = lerp(this.cam.x, tx, damp(0.002, dt));
    this.cam.y = lerp(this.cam.y, ty, damp(0.002, dt));

    this.cam.punch = lerp(this.cam.punch, 0, damp(0.004, dt));

    const targetZoom = 1 - speedNorm * 0.1 + (this.state === 'ready' ? 0.08 : this.state === 'clear' ? 0.15 : 0);
    this.cam.zoom = lerp(this.cam.zoom, targetZoom, damp(0.05, dt));
    const zoom = this.baseZoom() * (this.cam.zoom + this.cam.punch);

    cam.setZoom(zoom * display.dpr);
    cam.centerOn(this.cam.x, this.cam.y);
    this.backdrop.update(cam, this.cam.x, this.cam.y);

    shared.camX = this.cam.x;
    shared.camY = this.cam.y;
    shared.zoom = zoom;
  }

  /** Drain colour from the world after death; restore it on a new run. */
  private updateGrade(dt: number) {
    if (!this.grade) return;
    const target = this.state === 'dead' ? 1 : 0;
    this.deathFade = lerp(this.deathFade, target, damp(this.state === 'dead' ? 0.02 : 0.0001, dt));
    if (this.deathFade < 0.01) {
      this.grade.active = false;
      return;
    }
    this.grade.active = true;
    this.grade.colorMatrix.reset();
    this.grade.colorMatrix.saturate(-0.75 * this.deathFade, true);
    this.grade.colorMatrix.brightness(1 - 0.35 * this.deathFade, true);
  }
}
