import Phaser from 'phaser';
import { Track, DIRS, pointInRect, distToRectEdge, trackDistance, type Dir, type Hazard, type Segment, type WarpStar } from '../game/Track';
import { tuning, METERS_PER_PX, SECTOR_METERS } from '../game/tuning';
import { shared, EV, type DeathData, type ClearData, type PlayRequest, type FrenzyData } from '../game/shared';
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
import { TEX } from '../fx/textures';
import { glowFx } from '../fx/glow';
import { Ambient } from '../fx/Ambient';
import { abilityFor, ABILITY_SECONDS, SPIN_TAP_WINDOW, SURVIVAL_RECHARGE_M, type AbilityDef } from '../game/abilities';
import { skinById } from '../game/skins';

type State = 'ready' | 'play' | 'dead' | 'clear';

const MILESTONES: [number, string][] = [
  [404, '404: EXIT NOT FOUND'],
  [1000, '1 KM. RESPECT.'],
  [1337, '1337'],
  [2001, 'A SPACE ODYSSEY'],
  [3000, 'ARE YOU A BOT?'],
];

/** DUCK FRENZY: tap as fast as you can for this long, one duck per tap. */
const FRENZY_SECONDS = 8;
const FRENZY_MAX = 70;
/** Pause after the frenzy so leftover taps don't steer you into a wall. */
const FRENZY_COOLDOWN = 1.4;
/** What a red duck is worth. */
const RED_DUCK_VALUE = 5;

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
  /** When the crash happened (ms), so the colour drains only after the blast. */
  private diedAt = 0;

  private corridor!: CorridorView;
  private playerView!: PlayerView;
  private effects!: Effects;
  private backdrop!: Backdrop;
  private visitors!: BackgroundEvents;
  private ambient!: Ambient;
  private milestonesHit = new Set<number>();
  private hazardViews = new Map<Hazard, HazardView>();
  private starView: WarpStarView | null = null;
  private starSparkled = false;
  private ducks = 0;

  // Skin ability state.
  private ability: {
    def: AbilityDef;
    until: number;
    shield: number;
    revive: number;
    graceUntil: number;
    nextLaser: number;
    nextImplode: number;
  } | null = null;
  private abilityCharges = 1;
  private rechargeAtM = Infinity;
  /** Recent taps: time and heading before each, to spot the 4-tap spin. */
  private recentTaps: { t: number; dirBefore: Dir }[] = [];
  /** Walls don't kill until this time: room for the quick spin's side steps. */
  private spinGuardUntil = 0;
  /** Drives moving hazards; stops while they're frozen. */
  private hazardClock = 0;
  /** DUCK FRENZY in progress: the world is paused and taps become ducks. */
  private frenzy: { left: number; count: number; cooldown: number; x: number; y: number } | null = null;
  /** Hazards can't hurt you until this run time (right after a frenzy). */
  private safeUntil = 0;

  private bloom?: Phaser.Types.Actions.AddEffectBloomReturn;
  private grade?: Phaser.Filters.ColorMatrix;

  constructor() {
    super('Game');
  }

  create() {
    this.backdrop = new Backdrop(this);
    this.visitors = new BackgroundEvents(this);
    this.ambient = new Ambient(this);
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
      blurSteps: 3,
      blurQuality: 0,
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
    glowFx.setEnabled(!save.fxReduced);
    this.ambient?.setEnabled(!save.fxReduced);
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
    this.ability = null;
    this.abilityCharges = 1;
    this.rechargeAtM = Infinity;
    this.recentTaps = [];
    this.spinGuardUntil = 0;
    this.hazardClock = 0;
    this.frenzy = null;
    this.safeUntil = 0;

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
    this.emitAbility();
  }

  private onMenu() {
    music.setEnergy(0);
    this.resetRun(endlessCourse());
  }

  /**
   * Every tap turns right away. Four quick taps in a row turn you all the
   * way round (4 × 90°) back to where you were heading, and that fires the
   * skin's ability.
   */
  private onTap() {
    if (this.state !== 'play') return;
    if (this.frenzy) {
      this.frenzyTap();
      return;
    }
    if (this.ability?.def.autopilot) return; // hands off: the ability is driving
    const now = this.time.now;
    const dirBefore = this.player.dir;
    this.turn();
    if (this.state !== 'play') return;

    // A tap that comes too long after the previous one starts a new sequence.
    const last = this.recentTaps[this.recentTaps.length - 1];
    if (last && now - last.t > SPIN_TAP_WINDOW) this.recentTaps = [];
    this.recentTaps.push({ t: now, dirBefore });
    this.spinGuardUntil = now + SPIN_TAP_WINDOW;

    if (this.recentTaps.length >= 4) {
      const back = this.player.dir === this.recentTaps[0].dirBefore;
      this.recentTaps = [];
      if (back) this.tryActivateAbility();
    }
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
    const perfect =
      inGate && (!!this.ability?.def.perfectAll || (!!next?.perfect && pointInRect(this.player.x, this.player.y, next.perfect)));

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
    if (this.tryRevive()) return;
    this.endAbility(true);
    this.state = 'dead';
    this.diedAt = this.time.now;
    music.duck();
    music.setEnergy(0);
    this.slowMo = 0.6;

    const { x, y } = this.player;
    const fx = save.fxReduced;
    this.effects.deathBlast(x, y, color, skinById(save.skin).glow, fx);
    this.effects.debris(x, y, color, fx ? 8 : 22);
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
    // Survival never finishes, so its ducks are kept when the run ends.
    if (endless && this.ducks > 0) save.addDucks(this.ducks);

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
    if (this.course.warped) save.recordWarp(level.id);
    // Ducks only become currency when you make it to the finish.
    if (this.ducks > 0) save.addDucks(this.ducks);
    this.endAbility(true);

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

    if (this.state === 'play') {
      if (this.frenzy) this.stepFrenzy(dt);
      else this.step(dt);
      this.watchPerformance();
    }
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
        view.setFrozen(!!this.ability?.def.freeze);
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
    this.ambient.update(this.cameras.main, t);
    this.updateGrade(dt);

    shared.accent = accent;
    shared.intensity = lerp(shared.intensity, this.state === 'play' ? speedNorm : 0.15, damp(0.2, dt));
    shared.pulse = Math.max(0, shared.pulse - dt * 2.5);

    if (this.state === 'play' && this.ability) this.emitAbility();
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
    if (this.ability && this.elapsed >= this.ability.until) this.endAbility();
    const ab = this.ability?.def;
    if (this.slowMo > 0) this.slowMo = Math.max(0, this.slowMo - dt);
    const sim = dt * (this.slowMo > 0 ? 0.35 : 1) * (ab?.slow ?? 1);
    if (!ab?.freeze) this.hazardClock += sim;

    const speed = this.course.speedAt(this.distance) * (ab?.speed ?? 1);
    const d = DIRS[this.player.dir];
    this.player.x += d.x * speed * sim;
    this.player.y += d.y * speed * sim;

    this.track.ensureAhead(this.current, tuning.segmentsAhead);

    let cur = this.track.get(this.current)!;
    let next = this.track.get(this.current + 1);
    if (next && this.player.dir === next.dir && pointInRect(this.player.x, this.player.y, next.rect)) {
      this.runAwayDucks(cur);
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

    if (ab && next && this.player.dir === cur.dir) this.autoTurn(ab, cur, next);

    const inCur = pointInRect(this.player.x, this.player.y, cur.rect);
    const inNext = !!next && pointInRect(this.player.x, this.player.y, next.rect);
    // Mid-spin you may poke outside the lane for a moment; that's allowed.
    if (!inCur && !inNext && this.time.now >= this.spinGuardUntil) {
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
    const edge = inCur || inNext ? distToRectEdge(this.player.x, this.player.y, inCur ? cur.rect : next!.rect) : Infinity;
    if (edge < 10 && !this.nearWallFlags.has(cur.id)) {
      this.nearWallFlags.add(cur.id);
      const extreme = edge < 3;
      this.effects.floater(this.player.x, this.player.y - 20, extreme ? '1PX' : 'CLOSE', css.cyan, extreme ? 16 : 12);
      this.slowMo = Math.max(this.slowMo, 0.1);
      sfx.near();
      haptic(5);
    }

    if (this.ability) this.runAbility(sim);
    if (this.state !== 'play') return;

    // Moving hazards: driven by run time, so they repeat exactly on every
    // attempt. Everything on screen moves, not just what's near you.
    for (const seg of this.visibleSegments()) {
      for (const hz of seg.hazards) {
        if (!hz.alive || !hz.moving) continue;
        const osc = Math.sin(this.hazardClock * (hz.moveSpeed ?? 1.6) + hz.movePhase) * hz.moveRange;
        if (hz.moveAxis === 'y') hz.y = hz.baseY + osc;
        else hz.x = hz.baseX + osc;
      }
    }

    const radius = this.playerRadius();
    const nearby = [...cur.hazards, ...(next?.hazards ?? [])];
    for (const hz of nearby) {
      if (!hz.alive) continue;
      const dist = Math.hypot(this.player.x - hz.x, this.player.y - hz.y);
      if (hz.kind === 'duck') {
        if (dist < hz.radius + radius) this.bonkDuck(hz);
        if (this.frenzy) return;
        continue;
      }
      if (dist < hz.radius + radius) {
        if (this.elapsed < this.safeUntil) continue;
        const a = this.ability;
        if (a && (this.elapsed < a.graceUntil || a.def.ghost)) continue;
        if (a && (a.def.smash || a.def.vacuum || a.def.laser)) {
          this.smashHazard(hz);
          continue;
        }
        if (a && a.shield > 0) {
          a.shield--;
          this.playerView.setBubble(a.shield > 0);
          sfx.pop();
          this.smashHazard(hz);
          continue;
        }
        // The hazard stays on screen: you should see what got you.
        this.die(hz.kind === 'saw' ? 'saw' : 'bomb', hz.kind === 'saw' ? palette.magenta : palette.orange);
        return;
      }
      if (dist < hz.radius + radius + 16 && !this.nearHazardFlags.has(hz)) {
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
    if (dist < this.playerRadius() + 5) this.warp(star);
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
    const mult = this.ability?.def.duckMult ?? 1;

    if (hz.variant === 'golden') {
      this.startFrenzy(hz);
      return;
    }
    if (hz.variant === 'red') {
      const value = RED_DUCK_VALUE * mult;
      this.ducks += value;
      sfx.redDuck();
      haptic([15, 20, 30]);
      this.effects.floater(hz.x, hz.y - 24, `GOTCHA! +${value}`, '#ff6a55', 18);
      this.effects.shockwave(hz.x, hz.y, 0xff5a4a, 110, 450);
      this.effects.burst(hz.x, hz.y, [0xff5a4a, 0xffd21f, 0xffffff], save.fxReduced ? 10 : 28);
      this.cam.punch = 0.08;
      return;
    }

    this.ducks += mult;
    sfx.quack();
    const lines = ['QUACK', 'BONK', 'SORRY DUCK', 'QUACK QUACK', 'DUCK OFF', 'WHEEE'];
    this.effects.floater(hz.x, hz.y - 20, lines[this.ducks % lines.length], '#ffd21f', 14);
    this.effects.burst(hz.x, hz.y, [0xffd21f, 0xffffff, 0xff9a2e], save.fxReduced ? 6 : 16);
  }

  /**
   * Red and golden ducks never give up: if you pass one without catching it,
   * it scurries off up the track and waits for you on a later straight.
   */
  private runAwayDucks(left: Segment) {
    const runners = left.hazards.filter((hz) => hz.alive && hz.kind === 'duck' && hz.variant && hz.variant !== 'normal');
    if (!runners.length) return;
    left.hazards = left.hazards.filter((hz) => !runners.includes(hz));
    for (const hz of runners) {
      const color = hz.variant === 'golden' ? '#ffe680' : '#ff6a55';
      this.effects.floater(hz.x, hz.y - 22, hz.variant === 'golden' ? 'COME BACK!' : 'TOO SLOW!', color, 14);
      this.hazardViews.get(hz)?.destroy();
      this.hazardViews.delete(hz);
      // Land just beyond what's on screen, so it pops up again ahead of you.
      const placed = [LOOKAHEAD + 2, LOOKAHEAD + 3, LOOKAHEAD + 4].some((ahead) => {
        const seg = this.track.get(this.current + ahead);
        return !!seg && this.track.moveDuckTo(hz, seg);
      });
      if (placed) sfx.duckEscape();
    }
  }

  // --- DUCK FRENZY ------------------------------------------------------------

  /** Hit the golden duck: the world freezes and every tap is a duck. */
  private startFrenzy(hz: Hazard) {
    this.frenzy = { left: FRENZY_SECONDS, count: 0, cooldown: 0, x: hz.x, y: hz.y };
    this.recentTaps = [];
    const gold = [0xffe680, 0xffd21f, 0xffffff, 0xff9a2e];
    this.effects.burst(hz.x, hz.y, gold, save.fxReduced ? 20 : 60);
    [0, 1, 2].forEach((i) =>
      this.time.delayedCall(i * 90, () => this.effects.shockwave(hz.x, hz.y, gold[i], 160 + i * 90, 700)),
    );
    if (!save.fxReduced) this.cameras.main.flash(350, 255, 220, 90);
    this.cam.punch = 0.3;
    shared.pulse = 1;
    sfx.frenzyStart();
    haptic([40, 30, 40, 30, 120]);
    this.emitFrenzy('start');
  }

  private frenzyTap() {
    const f = this.frenzy!;
    if (f.cooldown > 0 || f.count >= FRENZY_MAX) return;
    f.count++;
    this.ducks++;
    sfx.frenzyTap(f.count);
    haptic(6);
    shared.pulse = Math.min(1, shared.pulse + 0.35);
    this.cam.punch = Math.min(0.2, this.cam.punch + 0.025);
    // A duck squirts out of the player and tumbles away.
    const a = Math.random() * Math.PI * 2;
    const { x, y } = this.player;
    const duck = this.add.image(x, y, TEX.duck).setScale(0.15).setDepth(8).setFlipX(Math.cos(a) < 0);
    this.tweens.add({
      targets: duck,
      x: x + Math.cos(a) * (90 + Math.random() * 80),
      y: y + Math.sin(a) * (90 + Math.random() * 80),
      scale: 0.4,
      angle: (Math.random() - 0.5) * 540,
      alpha: 0,
      duration: 650,
      ease: 'Cubic.easeOut',
      onComplete: () => duck.destroy(),
    });
    if (!save.fxReduced) this.effects.burst(x + Math.cos(a) * 30, y + Math.sin(a) * 30, [0xffd21f, 0xffffff], 4);
    if (f.count % 10 === 0) {
      this.effects.shockwave(this.player.x, this.player.y, 0xffd21f, 120 + f.count, 400);
      this.effects.floater(this.player.x, this.player.y - 40, `${f.count}!`, '#ffe680', 22);
    }
    if (f.count >= FRENZY_MAX) this.endFrenzy();
    else this.emitFrenzy('tick');
  }

  private stepFrenzy(dt: number) {
    const f = this.frenzy!;
    if (f.cooldown > 0) {
      f.cooldown -= dt;
      if (f.cooldown <= 0) {
        this.frenzy = null;
        this.safeUntil = this.elapsed + 1;
        this.spinGuardUntil = this.time.now + 300;
      }
      return;
    }
    f.left -= dt;
    // Ducks sparkle around you the whole time.
    if (Math.random() < dt * 20) {
      const a = Math.random() * Math.PI * 2;
      const r = 40 + Math.random() * 60;
      this.effects.burst(this.player.x + Math.cos(a) * r, this.player.y + Math.sin(a) * r, [0xffe680], 2);
    }
    if (f.left <= 0) this.endFrenzy();
    else this.emitFrenzy('tick');
  }

  private endFrenzy() {
    const f = this.frenzy!;
    f.left = 0;
    f.cooldown = FRENZY_COOLDOWN;
    const { x, y } = this.player;
    this.effects.shockwave(x, y, 0xffe680, 260, 700);
    this.effects.burst(x, y, [0xffd21f, 0xffffff, 0xff9a2e], save.fxReduced ? 16 : 50);
    this.cam.punch = 0.2;
    sfx.frenzyEnd(f.count);
    haptic([30, 40, 80]);
    this.emitFrenzy('end');
  }

  private emitFrenzy(phase: FrenzyData['phase']) {
    const f = this.frenzy!;
    const data: FrenzyData = { phase, count: f.count, max: FRENZY_MAX, frac: Math.max(0, f.left / FRENZY_SECONDS) };
    this.game.events.emit(EV.frenzy, data);
  }

  // --- Skin abilities -------------------------------------------------------

  private playerRadius() {
    return tuning.playerRadius * (this.ability?.def.shrink ?? 1);
  }

  private emitAbility() {
    const a = this.ability;
    const state = a ? 'active' : this.abilityCharges > 0 ? 'ready' : this.course.level ? 'used' : 'recharging';
    this.game.events.emit(EV.ability, { state, frac: a ? Math.max(0, (a.until - this.elapsed) / ABILITY_SECONDS) : 0 });
  }

  private tryActivateAbility() {
    if (this.ability) return;
    if (this.abilityCharges <= 0) {
      const msg = this.course.level ? 'ONCE PER LEVEL' : 'RECHARGING';
      this.effects.floater(this.player.x, this.player.y - 28, msg, css.inkDim, 12);
      sfx.denied();
      return;
    }
    const skin = skinById(save.skin);
    const def = abilityFor(skin.id);
    this.abilityCharges--;
    if (!this.course.level) this.rechargeAtM = this.distance * METERS_PER_PX + SURVIVAL_RECHARGE_M;
    this.ability = {
      def,
      until: this.elapsed + ABILITY_SECONDS,
      shield: def.shield ?? 0,
      revive: def.revive ?? 0,
      graceUntil: 0,
      nextLaser: 0,
      nextImplode: 0,
    };

    const { x, y } = this.player;
    this.playerView.setAbilityLook(skin.glow, { bubble: (def.shield ?? 0) > 0, size: def.shrink });
    this.effects.shockwave(x, y, skin.glow, 200, 600);
    this.effects.shockwave(x, y, 0xffffff, 110, 400);
    this.effects.burst(x, y, [skin.glow, 0xffffff], save.fxReduced ? 12 : 36);
    this.effects.floater(x, y - 36, def.name, '#ffffff', 20);
    this.cam.punch = 0.15;
    shared.pulse = 1;
    sfx.ability(skin.rarity);
    haptic([20, 30, 60]);
    this.emitAbility();
  }

  /** Ability over (or cut short by death / finish). */
  private endAbility(silent = false) {
    if (!this.ability) return;
    this.ability = null;
    this.playerView.setAbilityLook(null);
    this.hazardViews.forEach((v) => v.setFrozen(false));
    if (!silent) {
      this.effects.floater(this.player.x, this.player.y - 28, 'POWER DOWN', css.inkDim, 12);
      sfx.powerDown();
    }
    this.emitAbility();
  }

  /**
   * Autopilot makes a perfect turn in the middle of the next gate; bounce
   * turns at the last moment before the wall instead of crashing.
   */
  private autoTurn(ab: AbilityDef, cur: Segment, next: Segment) {
    const d = DIRS[cur.dir];
    if (ab.autopilot && next.perfect && pointInRect(this.player.x, this.player.y, next.gate!)) {
      const cx = (next.perfect.x1 + next.perfect.x2) / 2;
      const cy = (next.perfect.y1 + next.perfect.y2) / 2;
      const passed = [this.player.x >= cx, this.player.y >= cy, this.player.x <= cx, this.player.y <= cy][cur.dir];
      if (passed) {
        this.turn();
        return;
      }
    }
    if (!ab.bounce && !ab.autopilot) return;
    const along = trackDistance(cur, this.player.x, this.player.y) - cur.travelled;
    const limit = cur.length + cur.halfWidth - this.playerRadius() - 2;
    if (along < limit) return;
    // Step back to just before the wall, then bounce round the corner.
    this.player.x -= d.x * (along - limit);
    this.player.y -= d.y * (along - limit);
    this.turn();
    this.effects.shockwave(this.player.x, this.player.y, 0xffffff, 60, 250);
    sfx.boing();
    if (this.ability?.def.word === 'BOOT') this.effects.floater(this.player.x, this.player.y - 24, 'BANK SHOT', '#ffffff', 13);
  }

  /** Per-frame effects of the running ability. */
  private runAbility(sim: number) {
    const a = this.ability!;
    const def = a.def;
    const p = this.player;
    const segs = this.visibleSegments();
    const entries = segs.flatMap((seg) => seg.hazards.filter((h) => h.alive).map((h) => ({ h, seg })));
    const hazards = entries.map((e) => e.h);

    for (const { h: hz, seg } of entries) {
      const dx = p.x - hz.x;
      const dy = p.y - hz.y;
      const dist = Math.hypot(dx, dy) || 1;

      // Turn saws and bombs into rubber ducks.
      if (def.ducksFromHazards && hz.kind !== 'duck') {
        hz.kind = 'duck';
        hz.radius = 13;
        hz.moving = false;
        this.hazardViews.get(hz)?.destroy();
        this.hazardViews.delete(hz);
        this.effects.burst(hz.x, hz.y, [0xffd21f, 0xffffff], 8);
      }

      const pull = (speed: number) => {
        const k = Math.min(dist, speed * sim) / dist;
        hz.x += dx * k;
        hz.y += dy * k;
        hz.baseX = hz.x;
        hz.baseY = hz.y;
        hz.moving = false;
      };
      if (hz.kind === 'duck' && def.magnet && dist < def.magnet) pull(480);
      if (hz.kind !== 'duck' && def.vacuum && dist < def.vacuum) {
        pull(520);
        if (dist < 26) this.smashHazard(hz);
      }

      // Shy hazards slide sideways, away from your line.
      if (def.shy && hz.kind !== 'duck' && dist < 230) {
        // Sideways = across the hazard's own segment.
        const lateralY = seg.dir % 2 === 0;
        const away = Math.sign(lateralY ? hz.y - p.y : hz.x - p.x) || 1;
        const move = away * 170 * sim;
        const lim = seg.halfWidth - hz.radius - 4;
        if (lateralY) {
          hz.baseY = clamp(hz.baseY + move, seg.start.y - lim, seg.start.y + lim);
          if (!hz.moving) hz.y = hz.baseY;
        } else {
          hz.baseX = clamp(hz.baseX + move, seg.start.x - lim, seg.start.x + lim);
          if (!hz.moving) hz.x = hz.baseX;
        }
      }
    }

    // Lasers pick off the nearest hazard ahead.
    if (def.laser && this.elapsed >= a.nextLaser) {
      const d = DIRS[p.dir];
      const target = hazards
        .filter((h) => h.kind !== 'duck' && (h.x - p.x) * d.x + (h.y - p.y) * d.y > -20)
        .map((h) => ({ h, dist: Math.hypot(h.x - p.x, h.y - p.y) }))
        .filter((o) => o.dist < def.laser!)
        .sort((a1, b1) => a1.dist - b1.dist)[0];
      if (target) {
        this.effects.laser(p.x, p.y, target.h.x, target.h.y, 0xff2240);
        sfx.laser();
        this.smashHazard(target.h);
        a.nextLaser = this.elapsed + 0.22;
      }
    }

    // Black hole: rings keep collapsing into you.
    if (def.vacuum && this.elapsed >= a.nextImplode) {
      this.effects.implode(p.x, p.y, 0xb36bff, def.vacuum * 1.2);
      a.nextImplode = this.elapsed + 0.3;
    }

    // Magnet also reels in the warp star.
    if (def.magnet) {
      for (const seg of segs) {
        const star = seg.warpStar;
        if (!star || star.taken) continue;
        const dist = Math.hypot(p.x - star.x, p.y - star.y) || 1;
        if (dist > def.magnet) continue;
        const k = Math.min(dist, 380 * sim) / dist;
        star.x += (p.x - star.x) * k;
        star.y += (p.y - star.y) * k;
        this.checkWarpStar(star);
      }
    }
  }

  /** A hazard destroyed by an ability: it shatters instead of killing you. */
  private smashHazard(hz: Hazard) {
    if (!hz.alive) return;
    hz.alive = false;
    this.hazardViews.get(hz)?.destroy();
    this.hazardViews.delete(hz);
    const color = hz.kind === 'saw' ? palette.magenta : palette.orange;
    this.effects.debris(hz.x, hz.y, color, save.fxReduced ? 5 : 14);
    this.effects.burst(hz.x, hz.y, [color, 0xffffff], save.fxReduced ? 6 : 16);
    this.effects.floater(hz.x, hz.y - 18, this.ability?.def.word ?? 'SMASH', '#ffffff', 13);
    sfx.smash();
  }

  /** Extra life: pop back onto the middle of the track instead of dying. */
  private tryRevive(): boolean {
    const a = this.ability;
    if (!a || a.revive <= 0) return false;
    a.revive--;
    const cur = this.track.get(this.current)!;
    const d = DIRS[cur.dir];
    const along = clamp(trackDistance(cur, this.player.x, this.player.y) - cur.travelled, 0, cur.length - cur.halfWidth - 30);
    this.player = { x: cur.start.x + d.x * along, y: cur.start.y + d.y * along, dir: cur.dir };
    a.graceUntil = this.elapsed + 1.2;
    this.slowMo = 0.5;
    const { x, y } = this.player;
    const kitty = save.skin === 'kitty';
    this.effects.flare(x, y, 0xffffff, 150);
    this.effects.shockwave(x, y, skinById(save.skin).glow, 180, 600);
    this.effects.floater(x, y - 34, kitty ? '8 LIVES LEFT' : 'EXTRA LIFE', '#ffffff', 18);
    this.cameras.main.shake(200, 0.006);
    sfx.revive();
    haptic([40, 40, 40]);
    return true;
  }

  // --- Automatic quality ---------------------------------------------------

  private perf = { start: 0, frames: 0, warmupUntil: 0 };

  /**
   * Watches the frame rate while playing. If the device can't keep up
   * (under ~48 fps for two seconds), lower the rendering resolution one step:
   * 3x -> 2x -> 1.5x. Most of the GPU cost scales with the pixel count.
   */
  private watchPerformance() {
    // Real wall-clock time: Phaser smooths its own frame delta, which would
    // hide exactly the stutter we're looking for.
    const now = performance.now();
    const p = this.perf;
    if (p.warmupUntil === 0) p.warmupUntil = now + 3000;
    if (now < p.warmupUntil) {
      p.start = now;
      p.frames = 0;
      return;
    }
    p.frames++;
    const elapsed = now - p.start;
    if (elapsed < 2000) return;
    const fps = (p.frames * 1000) / elapsed;
    p.start = now;
    p.frames = 0;
    if (fps >= 48) return;
    const next = display.dpr > 2 ? 2 : display.dpr > 1.5 ? 1.5 : null;
    if (next && display.lowerDpr(next)) p.warmupUntil = now + 2000;
    // Out of resolution to give up: drop the per-object glows next.
    else if (!next && glowFx.enabled && fps < 40) glowFx.setEnabled(false);
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
    // Survival: the ability recharges every so often.
    if (this.abilityCharges === 0 && !this.ability && m >= this.rechargeAtM) {
      this.abilityCharges = 1;
      this.effects.floater(this.player.x, this.player.y - 30, 'ABILITY READY', css.ink, 14);
      sfx.revive();
      this.emitAbility();
    }
    // A rising sweep each time the world changes colour.
    const sector = SECTOR_METERS.filter((s) => m >= s).length;
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
    // Let the explosion burn in full neon for a moment before the grey sets in.
    const target = this.state === 'dead' && this.time.now - this.diedAt > 450 ? 1 : 0;
    this.deathFade = lerp(this.deathFade, target, damp(this.state === 'dead' ? 0.02 : 0.0001, dt));
    shared.gloom = this.deathFade;
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
