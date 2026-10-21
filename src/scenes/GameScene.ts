import Phaser from 'phaser';
import { Track, DIRS, pointInRect, distToRectEdge, trackDistance, type Dir, type Hazard, type Segment, type WarpStar } from '../game/Track';
import { tuning, METERS_PER_PX, SECTOR_METERS } from '../game/tuning';
import { shared, EV, type DeathData, type ClearData, type PlayRequest, type FrenzyData, type StatEvent, type RunMode } from '../game/shared';
import { dailyCourse, endlessCourse, levelCourse, type Course } from '../game/course';
import { levelById } from '../game/levels';
import { display } from '../game/display';
import { save } from '../game/storage';
import { css, palette } from '../game/palette';
import { u2Color } from '../fx/worldPalette';
import { sfx as realSfx, haptic as realHaptic } from '../audio/Sfx';
import { music } from '../audio/Music';
import { skinVoices } from '../audio/skinVoices';
import { CorridorView, LOOKAHEAD } from '../fx/CorridorView';
import { PlayerView } from '../fx/PlayerView';
import { HazardView } from '../fx/HazardView';
import { Effects } from '../fx/Effects';
import { Backdrop } from '../fx/Backdrop';
import { BackgroundEvents } from '../fx/BackgroundEvents';
import { WarpStarView } from '../fx/WarpStarView';
import { GhostView } from '../fx/GhostView';
import { GhostRecorder, loadGhost, offerGhost, type GhostEnd } from '../game/ghost';
import { TEX, DUCK_RES } from '../fx/textures';
import { glowFx } from '../fx/glow';
import { Ambient } from '../fx/Ambient';
import { abilityFor, ABILITY_SECONDS, SPIN_TAP_WINDOW, SURVIVAL_RECHARGE_M, SURVIVAL_RECHARGE_S, type AbilityDef } from '../game/abilities';
import { skinById } from '../game/skins';
import { todaysGuest } from '../game/guest';

type State = 'ready' | 'play' | 'dead' | 'clear';

const MILESTONES: [number, string][] = [
  [404, '404: EXIT NOT FOUND'],
  [1000, '1 KM. RESPECT.'],
  [1337, '1337'],
  [2001, 'A SPACE ODYSSEY'],
  [3000, 'ARE YOU A BOT?'],
];

/** DUCK FRENZY: tap as fast as you can for this long, one duck per tap. */
/** Skin powers unlock on this level (levels before it teach the basics). */
const ABILITY_FROM_LEVEL = 3;
const FRENZY_SECONDS = 8;
const FRENZY_MAX = 70;
/** Pause after the frenzy so leftover taps don't steer you into a wall. */
const FRENZY_COOLDOWN = 1.4;
/** What a red duck is worth. */
const RED_DUCK_VALUE = 5;

/**
 * In the menu's attract mode the game plays itself, silently. While `silent`
 * is set, every sound and vibration from this scene is swallowed here.
 */
let silent = false;
const NOOP = () => {};
const sfx = new Proxy(realSfx, {
  get(target, key, receiver) {
    const value = Reflect.get(target, key, receiver);
    if (typeof value !== 'function') return value;
    return silent ? NOOP : value.bind(target);
  },
});
const haptic = (pattern: number | number[]) => {
  if (!silent) realHaptic(pattern);
};

/** The demo run behind the main menu: drives itself and can't crash. */
const DEMO_ABILITY: AbilityDef = { name: '', desc: '', autopilot: true, ghost: true };

const NO_HAZARDS: Hazard[] = [];
/** Saws and bombs collide at this fraction of their drawn radius. */
const HAZARD_HITBOX = 0.82;
/** Bombs pulse: they charge up, then blast out to this many times their radius. */
const BOMB_BLAST = 1.85;
const BOMB_PERIOD = 2.6;
const BOMB_BLAST_TIME = 0.22;
/** A bomb's charge at this point of the hazard clock (see Hazard.charge). */
function bombCharge(clock: number, phase: number): number {
  const t = (clock + (phase / (Math.PI * 2)) * BOMB_PERIOD) % BOMB_PERIOD;
  const blastAt = BOMB_PERIOD - BOMB_BLAST_TIME;
  if (t >= blastAt) return -1;
  const chargeFrom = blastAt - 0.9;
  return t < chargeFrom ? 0 : (t - chargeFrom) / 0.9;
}

/** Share of PERFECT turns for the 2nd and 3rd star. */
const STAR_RATIOS = [0.6, 0.8];

/**
 * CONTINUE: buy back a crash in a level (normal or HARD), once per attempt.
 * Not in Survival or the Daily Run: their records must not be buyable. Not
 * before 20 % of the level either: that early a RETRY costs nothing.
 */
const CONTINUE_COST = 30;
const CONTINUE_FROM = 0.2;
/** How long the death card offers it, seconds. */
const CONTINUE_SECONDS = 4.5;
/** Back on the track: the ball waits this long (3, 2, 1) before GO. */
const RESPAWN_HOLD = 1.05;
/** After GO, hazards can't hurt you for this long (the ball blinks). */
const CONTINUE_GRACE = 1.3;

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
  /** Attract mode: the menu's self-playing demo run. */
  private demo = false;
  /** The player paused (button or app sent to the background). */
  private userPaused = false;
  private bestCombo = 0;
  private abilityUsed = false;
  private mode: RunMode = 'survival';
  /** The skin this run is played with: the equipped one, or today's guest in the Daily Run. */
  private skinId = save.skin;
  /** The last tap that wasn't a corner turn, to explain a wall crash (TOO EARLY / TOO LATE). */
  private lastWildTurn: { t: number; early: boolean } | null = null;
  /** First-ever play of level 1: the first corners slow down with a TAP! hint. */
  private guidedGates = 0;
  private nextGuideAt = 0;
  private recordShown = false;
  private zoneIndex = -1;
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
  private frameNo = 0;
  private visScratch: Segment[] = [];
  private nearLists: Hazard[][] = [NO_HAZARDS, NO_HAZARDS];
  private starView: WarpStarView | null = null;
  /** The ghost of your best attempt on this level, and the recording of this one (levels only). */
  private ghostView!: GhostView;
  private ghostRec: GhostRecorder | null = null;
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
  /** Levels 1-2 teach the basics: no skin power yet (the tip comes before level 3). */
  private abilityLocked = false;
  /** Counts runs, so a result screen meant for a run that's over never shows up during the next. */
  private runId = 0;
  private rechargeAtM = Infinity;
  /** Survival: the ability also needs this much run time to pass (seconds). */
  private rechargeAtT = Infinity;
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

  // CONTINUE (see die()).
  /** A crash that can still be bought back: the run isn't settled yet. */
  private pendingDeath: { cause: DeathData['cause'] } | null = null;
  /** This attempt already used its CONTINUE. */
  private continued = false;
  /** Seconds left of the 3-2-1 after a CONTINUE (the ball waits, taps are ignored). */
  respawnHold = 0;
  private respawnCount = 0;
  /** The ball blinks until this run time (the grace after a CONTINUE). */
  private blinkUntil = 0;

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
    this.ghostView = new GhostView(this, tuning.playerRadius);
    this.effects = new Effects(this);

    this.setupCamera();
    this.startDemo();

    const listeners: [string, (...args: any[]) => void][] = [
      [EV.play, this.onPlay],
      [EV.menu, this.onMenu],
      [EV.tap, this.onTap],
      [EV.fxChanged, this.applyFxSetting],
      // A newly equipped skin shows at once, except over a Daily Run's guest.
      [EV.skin, () => (this.demo || this.mode !== 'daily') && this.useSkin(save.skin)],
      [EV.pause, this.onPause],
      [EV.resume, this.onResume],
      [EV.continueRun, this.onContinue],
      [EV.continueDecline, this.onContinueDeclined],
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
      blurRadius: 2.2,
      blurSteps: 2,
      blurQuality: 0,
      blendAmount: 1.1,
    })[0];

    // Colour grading, used to drain the colour out of the world on death.
    this.grade = cam.filters.internal.addColorMatrix();
    this.grade.active = false;

    this.applyFxSetting();
    display.onQuality(() => this.applyFxSetting());

    this.scale.on('resize', (size: Phaser.Structs.Size) => cam.setSize(size.width, size.height));
  }

  /** Switch effects on/off for the reduced-FX setting and the quality step. */
  private applyFxSetting() {
    const q = display.quality;
    if (this.bloom) {
      this.bloom.parallelFilters.active = !save.fxReduced;
      // Quality step 1+: one blur pass instead of two (a little wider to match).
      this.bloom.blur.steps = q >= 1 ? 1 : 2;
      this.bloom.blur.x = this.bloom.blur.y = q >= 1 ? 2.8 : 2.2;
    }
    glowFx.setEnabled(!save.fxReduced && q < 2);
    this.ambient?.setEnabled(!save.fxReduced && q < 2);
    display.applyFxReduced(save.fxReduced);
  }

  /** Base zoom so the track looks similar on a phone and a big monitor. */
  private baseZoom() {
    const { w, h } = display.size(this);
    return clamp(Math.min(w, h) / 430, 0.85, 1.45);
  }

  // --- Run lifecycle --------------------------------------------------------

  /** Dress the ball (and the HUD, through shared.skin) in a skin for this run. */
  private useSkin(id: string) {
    this.skinId = id;
    shared.skin = id;
    this.playerView.setSkin(id);
  }

  private resetRun(course: Course, skinId = save.skin) {
    this.runId++;
    this.hazardViews.forEach((v) => v.destroy());
    this.hazardViews.clear();
    this.effects.clear();
    this.starView?.destroy();
    this.starView = null;
    this.starSparkled = false;
    this.ducks = 0;
    this.ghostRec = null;
    this.ghostView.stop();
    this.setUniverse(false);
    this.ability = null;
    this.abilityCharges = 1;
    this.abilityLocked = false;
    this.rechargeAtM = Infinity;
    this.rechargeAtT = Infinity;
    this.recentTaps = [];
    this.spinGuardUntil = 0;
    this.hazardClock = 0;
    this.frenzy = null;
    this.safeUntil = 0;
    this.pendingDeath = null;
    this.continued = false;
    this.respawnHold = 0;
    this.respawnCount = 0;
    this.blinkUntil = 0;

    this.state = 'ready';
    this.demo = false;
    silent = false;
    this.effects.quiet = false;
    this.bestCombo = 0;
    this.abilityUsed = false;
    this.lastWildTurn = null;
    this.guidedGates = 0;
    this.recordShown = false;
    this.zoneIndex = -1;
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
    this.useSkin(skinId);
    this.playerView.setPosition(0, 0);
    this.playerView.setEmitting(false);

    this.cam = { x: 60, y: 0, zoom: 1, punch: 0 };
  }

  private onPlay(req: PlayRequest) {
    this.wake();
    this.maybeRaiseQuality();
    this.resetPerfWindow();
    this.quitRun();
    const level = req.level === null ? undefined : levelById(req.level);
    // The Daily Run is played with today's guest skin (power included).
    this.resetRun(req.daily ? dailyCourse() : level ? levelCourse(level) : endlessCourse(), req.daily ? todaysGuest().id : save.skin);
    this.mode = this.course.mode;
    // The UNIVERSE 2 daily starts in the bonus universe.
    if (this.course.warped) this.setUniverse(true);
    // Level 1, never cleared: guide the first corners.
    this.guidedGates = level && level.id === 1 && save.starsFor(1) === 0 ? 3 : 0;
    this.abilityLocked = !!level && level.id < ABILITY_FROM_LEVEL;
    if (this.abilityLocked) this.abilityCharges = 0;
    // Levels: race the ghost of your best attempt, and record this one.
    if (level && !req.daily) {
      this.ghostView.start(loadGhost(level.id));
      this.ghostRec = new GhostRecorder();
    }
    sfx.unlock();
    sfx.start();
    skinVoices.runStart(this.skinId);
    this.state = 'play';
    music.setEnergy(1);
    this.playerView.setEmitting(true);
    this.effects.shockwave(0, 0, this.course.accentAt(0), 90, 500);
    this.game.events.emit(EV.started, { meters: 0, seconds: 0, goal: this.goalMeters() });
    this.stat({ type: 'runStart', mode: this.mode, level: this.course.level?.id ?? null });
    this.emitAbility();
  }

  private onMenu() {
    this.quitRun();
    this.wake();
    music.setEnergy(0);
    this.startDemo();
  }

  /** The menu's attract mode: an endless run that plays itself, silently. */
  private startDemo() {
    this.resetRun(endlessCourse());
    // No golden duck in the demo: its frenzy wants the player's taps.
    this.track.goldenPlaced = true;
    this.demo = true;
    silent = true;
    this.effects.quiet = true;
    this.state = 'play';
    this.playerView.setEmitting(true);
    this.ability = { def: DEMO_ABILITY, until: Infinity, shield: 0, revive: 0, graceUntil: 0, nextLaser: 0, nextImplode: 0 };
  }

  /** Undo a pause or a hit-stop: the scene must be running for a new run. */
  private wake() {
    this.userPaused = false;
    if (this.sys.isPaused()) this.sys.resume();
  }

  private onPause() {
    if (this.demo || this.state !== 'play' || this.userPaused) return;
    this.userPaused = true;
    music.setEnergy(0);
    if (!this.sys.isPaused()) this.sys.pause();
  }

  private onResume() {
    if (!this.userPaused) return;
    this.userPaused = false;
    if (this.sys.isPaused()) this.sys.resume();
    music.setEnergy(1);
    this.resetPerfWindow();
    // A moment of grace: you just came back.
    this.spinGuardUntil = this.time.now + 300;
  }

  /**
   * First play of level 1: time slows as you reach a corner, and a pulsing
   * ring with "TAP!" shows where to tap. Three times, then you're on your own.
   */
  private guide(next: Segment) {
    const g = next.gate!;
    const cx = (g.x1 + g.x2) / 2;
    const cy = (g.y1 + g.y2) / 2;
    const dist = Math.hypot(this.player.x - cx, this.player.y - cy);
    if (dist > 190) return;
    this.slowMo = Math.max(this.slowMo, 0.12);
    if (this.time.now >= this.nextGuideAt) {
      this.nextGuideAt = this.time.now + 420;
      this.effects.shockwave(cx, cy, 0xffffff, 70, 420);
      if (dist > 60) this.effects.floater(cx, cy - 46, 'TAP!', '#ffffff', 20, 3);
    }
  }

  /** How far along the level's original goal you are, 0..1 (0 outside levels). */
  private levelProgress() {
    const level = this.course.level;
    return level ? Math.min(1, (this.distance * METERS_PER_PX) / level.goal) : 0;
  }

  /**
   * Leaving a run half-way (pause -> menu or retry) still counts as a run
   * for stats and missions.
   */
  private quitRun() {
    // Leaving the death card while it still offered a CONTINUE: the crash stands.
    if (this.pendingDeath) {
      this.onContinueDeclined();
      return;
    }
    if (this.state !== 'play' || this.demo) return;
    this.state = 'ready';
    this.stat({
      type: 'runEnd',
      mode: this.mode,
      level: this.course.level?.id ?? null,
      cleared: false,
      meters: this.distance * METERS_PER_PX,
      seconds: this.elapsed,
      progress: this.levelProgress(),
      stars: 0,
      perfects: this.perfects,
      gateTurns: this.gateTurns,
      bestCombo: this.bestCombo,
      ducks: this.ducks,
      warped: this.course.warped,
      cause: null,
      abilityUsed: this.abilityUsed,
      continued: this.continued,
    });
  }

  /** Survival zones: announce each one as you enter it. */
  private checkZone() {
    const z = this.course.zoneAt(this.distance);
    if (!z || z.index === this.zoneIndex) return;
    this.zoneIndex = z.index;
    const { x, y } = this.player;
    this.effects.floater(x, y - 44, z.def.name, `#${z.def.color.toString(16).padStart(6, '0')}`, 20, 3);
    this.effects.shockwave(x, y, z.def.color, 180, 650);
    sfx.sweep();
  }

  /** Tell progress tracking (missions, achievements, records) what happened. */
  private stat(e: StatEvent) {
    if (!this.demo) this.game.events.emit(EV.stat, e);
  }

  /**
   * Every tap turns right away. Four quick taps in a row turn you all the
   * way round (4 × 90°) back to where you were heading, and that fires the
   * skin's ability.
   */
  private onTap() {
    // (During the 3-2-1 after a CONTINUE the ball waits: taps don't count.)
    if (this.state !== 'play' || this.respawnHold > 0) return;
    if (this.frenzy) {
      this.frenzyTap();
      return;
    }
    if (this.ability?.def.autopilot) return; // hands off: the ability is driving
    // The guided first corners forgive an early tap: new players tap the
    // moment the run starts, and dying 3 seconds in teaches nothing.
    if (this.guidedGates > 0 && this.tooEarlyForGuide()) {
      this.effects.floater(this.player.x, this.player.y - 26, 'WAIT…', css.ink, 14, 2);
      return;
    }
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

  /** Heading for the next corner but not in its square yet. */
  private tooEarlyForGuide() {
    const cur = this.track.get(this.current);
    const next = this.track.get(this.current + 1);
    if (!cur || !next?.gate || this.player.dir !== cur.dir) return false;
    return !pointInRect(this.player.x, this.player.y, next.gate);
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
    this.ghostRec?.mark(this.player.x, this.player.y, this.distance, this.elapsed);
    this.player.dir = ((this.player.dir + 1) % 4) as Dir;
    this.playerView.onTurn();
    this.effects.turn(this.player.x, this.player.y, oldHeading, palette.cyan, save.fxReduced);
    sfx.turn(this.turnCount++);
    haptic(8);

    if (!inGate) {
      // A turn outside the corner: before it (too early) or after it (too late).
      if (next?.gate) {
        const cur = this.track.get(this.current)!;
        const along = trackDistance(cur, this.player.x, this.player.y) - cur.travelled;
        this.lastWildTurn = { t: this.elapsed, early: along < cur.length - cur.halfWidth * 2 };
      }
      return;
    }
    this.gateTurns++;
    if (this.guidedGates > 0) this.guidedGates--;
    if (perfect) {
      this.combo++;
      this.perfects++;
      this.bestCombo = Math.max(this.bestCombo, this.combo);
      this.stat({ type: 'perfect', combo: this.combo });
      const label = this.combo > 1 ? `PERFECT x${this.combo}` : 'PERFECT';
      this.effects.floater(this.player.x, this.player.y - 26, label, css.orange, this.combo > 4 ? 17 : 14);
      this.effects.shockwave(this.player.x, this.player.y, palette.orange, 70 + Math.min(this.combo, 6) * 10);
      this.effects.burst(this.player.x, this.player.y, [palette.orange, 0xffe0b0], save.fxReduced ? 6 : 18);
      this.cam.punch = 0.05 + Math.min(this.combo, 6) * 0.008;
      shared.pulse = 1;
      sfx.perfect(this.combo);
      haptic(16);
      if (!this.demo) this.game.events.emit(EV.combo, this.combo);
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
    this.effects.deathBlast(x, y, color, skinById(this.skinId).glow, fx);
    this.effects.debris(x, y, color, fx ? 8 : 22);
    this.playerView.fadeOut(this);

    // Impact: freeze on the crash for a split second, then a short, hard
    // shake and a flash in the colour of whatever got you.
    this.hitStop(50);
    this.cameras.main.shake(fx ? 140 : 240, fx ? 0.004 : 0.01);
    this.flash(color === palette.ink ? 0xffffff : color, 160, 0.4);
    this.cam.punch = 0.14;

    if (cause === 'wall') sfx.death();
    else sfx.hazard();
    haptic([30, 20, 50]);

    // This attempt's ghost ends at its first crash (what follows a CONTINUE isn't recorded).
    this.endGhost('dead');
    save.addDeath();
    // Why the wall? A recent turn outside the corner says early or late;
    // no turn at all means the corner was missed: late.
    let hint: DeathData['hint'] = null;
    if (cause === 'wall') {
      const w = this.lastWildTurn;
      hint = w && this.elapsed - w.t < 1.2 ? (w.early ? 'early' : 'late') : 'late';
    }
    // In a level the crash may be bought back (CONTINUE): then the run isn't
    // over yet, and paying out and reporting it waits until the offer is
    // turned down or runs out (onContinueDeclined).
    const offer = this.continueOffer();
    let settled = { isNewBest: false, keptDucks: this.keptDucks() };
    if (offer === null) settled = this.settleDeath(cause);
    else this.pendingDeath = { cause };

    const meters = this.distance * METERS_PER_PX;
    const data: DeathData = {
      meters,
      seconds: this.elapsed,
      goal: this.goalMeters(),
      level: this.course.level?.id ?? null,
      warped: this.course.warped,
      ducks: this.ducks,
      best: save.best,
      isNewBest: settled.isNewBest,
      cause,
      hint,
      keptDucks: settled.keptDucks,
      deaths: save.deaths,
      continueCost: offer,
      continueSeconds: CONTINUE_SECONDS,
    };
    const run = this.runId;
    this.time.delayedCall(380, () => {
      if (run !== this.runId) return;
      if (data.isNewBest && meters > 1) sfx.newBest();
      this.game.events.emit(EV.died, data);
    });
  }

  /** Ducks you keep when a run ends in a crash. */
  private keptDucks() {
    // Survival never finishes, so its ducks are kept when the run ends. In a
    // level you keep half of what you bonked: something to show for a great
    // run that ended badly.
    return this.mode !== 'level' ? this.ducks : Math.floor(this.ducks / 2);
  }

  /** The crash stands: pay out the ducks you keep, set records, report the run. */
  private settleDeath(cause: DeathData['cause']): { isNewBest: boolean; keptDucks: number } {
    const meters = this.distance * METERS_PER_PX;
    // The best-distance record belongs to Survival; the Daily Run has its own.
    const isNewBest = this.mode === 'survival' && meters > save.best;
    if (isNewBest) save.setBest(meters);
    const keptDucks = this.keptDucks();
    if (keptDucks > 0) save.addDucks(keptDucks, this.mode);
    this.stat({
      type: 'runEnd',
      mode: this.mode,
      level: this.course.level?.id ?? null,
      cleared: false,
      meters,
      seconds: this.elapsed,
      // Against the level's real goal (the warp doubles course.goalPx).
      progress: this.levelProgress(),
      stars: 0,
      perfects: this.perfects,
      gateTurns: this.gateTurns,
      bestCombo: this.bestCombo,
      ducks: this.ducks,
      warped: this.course.warped,
      cause,
      abilityUsed: this.abilityUsed,
      continued: this.continued,
    });
    return { isNewBest, keptDucks };
  }

  // --- CONTINUE -------------------------------------------------------------

  /**
   * What buying back this crash costs, or null if it can't be: only in a
   * level, once per attempt, from 20 % of the way, and only if you have the
   * ducks. (Without them the button isn't shown at all: a price you can't
   * pay on every death only rubs it in. A rewarded ad could stand in for the
   * ducks here later: see rewardedAdReady in native/bridge.ts.)
   */
  private continueOffer(): number | null {
    if (this.mode !== 'level' || this.demo || this.continued) return null;
    if (this.levelProgress() < CONTINUE_FROM) return null;
    return save.ducks >= CONTINUE_COST ? CONTINUE_COST : null;
  }

  /** The player bought the crash back (UI: EV.continueRun). */
  private onContinue(via: 'ducks' | 'ad' = 'ducks') {
    const pending = this.pendingDeath;
    if (!pending || this.state !== 'dead') return;
    const cost = via === 'ad' ? 0 : CONTINUE_COST;
    if (save.ducks < cost) return;
    if (cost > 0) save.addDucks(-cost, 'continue');
    this.pendingDeath = null;
    this.continued = true;
    this.stat({ type: 'continue', level: this.course.level?.id ?? null, cause: pending.cause, cost, via });
    this.respawn();
  }

  /** The offer ran out or was turned down (UI: EV.continueDecline, or a new run): the crash stands. */
  private onContinueDeclined() {
    const pending = this.pendingDeath;
    if (!pending) return;
    this.pendingDeath = null;
    this.settleDeath(pending.cause);
  }

  /**
   * Back on the track at a fair spot: the start of the straight you crashed
   * on, centred in the lane and heading along it. Distance, ducks, PERFECTs
   * and the run time carry on (the combo is broken). The ball waits through
   * a quick 3-2-1, then GO with a moment of slow motion and a short grace.
   */
  private respawn() {
    const cur = this.track.get(this.current)!;
    this.player = { x: cur.start.x, y: cur.start.y, dir: cur.dir };
    this.state = 'play';
    this.combo = 0;
    this.slowMo = 0;
    this.recentTaps = [];
    this.spinGuardUntil = 0;
    this.lastWildTurn = null;
    this.respawnHold = RESPAWN_HOLD;
    this.respawnCount = 3;
    this.blinkUntil = Infinity;
    this.playerView.revive();
    this.playerView.setPosition(this.player.x, this.player.y);
    const { x, y } = this.player;
    const glow = skinById(this.skinId).glow;
    this.effects.flare(x, y, 0xffffff, 120);
    this.effects.shockwave(x, y, glow, 170, 600);
    this.cam.punch = 0.08;
    music.setEnergy(1);
    sfx.revive();
    haptic([20, 30, 20]);
    this.game.events.emit(EV.respawn, { count: 3 });
    this.emitAbility();
  }

  /** The 3-2-1 after a CONTINUE. The run clock (and so the ghost) waits too. */
  private stepRespawn(dt: number) {
    this.respawnHold = Math.max(0, this.respawnHold - dt);
    const count = Math.ceil((this.respawnHold / RESPAWN_HOLD) * 3);
    const { x, y } = this.player;
    if (count > 0 && count < this.respawnCount) {
      this.respawnCount = count;
      this.effects.shockwave(x, y, 0xffffff, 90, 350);
      this.game.events.emit(EV.respawn, { count });
    }
    if (this.respawnHold > 0) return;
    // GO!
    this.respawnCount = 0;
    this.slowMo = 0.45;
    this.safeUntil = this.elapsed + CONTINUE_GRACE;
    this.blinkUntil = this.elapsed + CONTINUE_GRACE;
    this.playerView.setEmitting(true);
    this.effects.shockwave(x, y, skinById(this.skinId).glow, 140, 450);
    this.game.events.emit(EV.respawn, { count: 0 });
  }

  /** Crossed the finish line. */
  private clear() {
    const level = this.course.level!;
    this.state = 'clear';
    this.endGhost('clear');
    this.coast = this.course.speedAt(this.distance);
    this.combo = 0;
    this.playerView.setEmitting(false);

    // Stars: 1 for finishing, 2 for 60 % of the turns PERFECT, 3 for 80 %.
    // A clear saved by a CONTINUE counts (the next level opens) but gets 1
    // star at most: stars are for clean runs, and can't be bought.
    const ratio = this.gateTurns > 0 ? this.perfects / this.gateTurns : 0;
    const stars = this.continued ? 1 : 1 + (ratio >= STAR_RATIOS[0] ? 1 : 0) + (ratio >= STAR_RATIOS[1] ? 1 : 0);
    const previousStars = save.starsFor(level.id);
    save.recordStars(level.id, stars);
    if (this.course.warped) save.recordWarp(level.id);
    // Ducks only become currency when you make it to the finish.
    if (this.ducks > 0) save.addDucks(this.ducks, 'level');
    this.endAbility(true);
    this.stat({
      type: 'runEnd',
      mode: this.mode,
      level: level.id,
      cleared: true,
      meters: this.distance * METERS_PER_PX,
      seconds: this.elapsed,
      progress: 1,
      stars,
      perfects: this.perfects,
      gateTurns: this.gateTurns,
      bestCombo: this.bestCombo,
      ducks: this.ducks,
      warped: this.course.warped,
      cause: null,
      abilityUsed: this.abilityUsed,
      continued: this.continued,
    });

    const { x, y } = this.player;
    const color = this.course.accentAt(this.distance);
    this.effects.shockwave(x, y, color, 260, 800);
    this.effects.shockwave(x, y, 0xffffff, 160, 600);
    this.effects.burst(x, y, [color, 0xffffff, palette.orange], save.fxReduced ? 20 : 60);
    this.effects.flare(x, y, color, 160);
    this.flash(color, 260, 0.35);
    this.cam.punch = 0.16;
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
      continued: this.continued,
    };
    const run = this.runId;
    this.time.delayedCall(560, () => {
      if (run === this.runId) this.game.events.emit(EV.cleared, data);
    });
  }

  // --- Frame loop -----------------------------------------------------------

  update(_time: number, deltaMs: number) {
    const dt = Math.min(deltaMs / 1000, 1 / 30);
    const t = this.time.now / 1000;

    if (this.state === 'play') {
      if (this.respawnHold > 0) this.stepRespawn(dt);
      else if (this.frenzy) this.stepFrenzy(dt);
      else this.step(dt);
      if (!this.demo) this.watchPerformance();
      // The demo starts over before it gets too fast to look calm.
      else if (this.distance * METERS_PER_PX > 1800) this.startDemo();
    }
    else if (this.slowMo > 0) this.slowMo = Math.max(0, this.slowMo - dt);
    if (this.state === 'clear') this.coastToStop(dt);
    this.updateGhost();
    // After a CONTINUE the ball blinks while it can't be hurt.
    if (this.blinkUntil > 0) {
      if (this.state === 'play' && this.elapsed < this.blinkUntil) {
        this.playerView.root.setAlpha(Math.floor(t * 12) % 2 === 0 ? 0.4 : 1);
      } else {
        this.blinkUntil = 0;
        // (A crash fades the ball out by itself.)
        if (this.state !== 'dead') this.playerView.root.setAlpha(1);
      }
    }

    const speed = this.course.speedAt(this.distance);
    const speedNorm = clamp((speed - 230) / 390, 0, 1);
    // The bonus universe cycles through the rainbow.
    // Universe 2 cycles through the rainbow, but skips yellow-green so the
    // yellow ducks never melt into the track (hues 160°..330°, back and forth).
    const accent = this.course.warped ? u2Color(t) : this.course.accentAt(this.distance);
    shared.warp = lerp(shared.warp, this.course.warped ? 1 : 0, damp(this.course.warped ? 0.2 : 0.0001, dt));
    this.updateWarpStar(t);

    // Hazards animate even while the menu is up. Only those on visible
    // segments are shown; ones on track already passed are hidden.
    // (A frame stamp instead of a Set: no garbage every frame.)
    const frame = ++this.frameNo;
    for (const seg of this.visibleSegments()) {
      for (const hz of seg.hazards) {
        if (!hz.alive) continue;
        let view = this.hazardViews.get(hz);
        if (!view) {
          view = new HazardView(this, hz);
          this.hazardViews.set(hz, view);
        }
        view.shownAt = frame;
        view.setFrozen(!!this.ability?.def.freeze);
        view.update(t, dt);
      }
    }
    this.hazardViews.forEach((view) => view.setVisible(view.shownAt === frame));

    this.corridor.draw(this.track.segments, this.current, this.player, accent, t, save.fxReduced);
    this.playerView.setPosition(this.player.x, this.player.y);
    const heading = Math.atan2(DIRS[this.player.dir].y, DIRS[this.player.dir].x);
    this.playerView.update(t, dt, heading, speedNorm, tuning.playerRadius);

    this.updateCamera(dt, speedNorm, t);
    this.visitors.update(this.cam.x, this.cam.y, this.cameras.main, dt, t, save.fxReduced);
    this.ambient.update(this.cameras.main, t);
    this.updateGrade(dt);

    shared.accent = accent;
    const m = this.distance * METERS_PER_PX;
    shared.world = this.course.level
      ? this.course.level.world
      : SECTOR_METERS.filter((at) => m >= at).length;
    shared.intensity = lerp(shared.intensity, this.state === 'play' ? speedNorm : 0.15, damp(0.2, dt));
    shared.pulse = Math.max(0, shared.pulse - dt * 2.5);

    if (this.state === 'play' && this.ability && !this.demo) this.emitAbility();
    if (this.state === 'play' && !this.demo) {
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
    if (this.guidedGates > 0 && next?.gate && this.player.dir === cur.dir) this.guide(next);

    const inCur = pointInRect(this.player.x, this.player.y, cur.rect);
    const inNext = !!next && pointInRect(this.player.x, this.player.y, next.rect);
    // Mid-spin you may poke outside the lane for a moment; that's allowed.
    if (!inCur && !inNext && this.time.now >= this.spinGuardUntil) {
      this.die('wall', palette.ink);
      return;
    }

    if (!this.course.level) this.checkMilestones();
    if (!this.demo) this.checkZone();
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
      this.effects.floater(this.player.x, this.player.y - 20, extreme ? '1PX' : 'CLOSE', css.cyan, extreme ? 16 : 12, 0);
      this.slowMo = Math.max(this.slowMo, 0.1);
      // Zoom punch: the camera jolts in, like a flinch. Harder for 1 px.
      this.cam.punch = Math.max(this.cam.punch, extreme ? 0.09 : 0.05);
      this.stat({ type: 'nearMiss', kind: 'wall' });
      sfx.near();
      haptic(5);
    }

    if (this.ability) this.runAbility(sim);
    if (this.state !== 'play') return;

    // Moving hazards: driven by run time, so they repeat exactly on every
    // attempt. Everything on screen moves, not just what's near you.
    for (const seg of this.visibleSegments()) {
      for (const hz of seg.hazards) {
        // (Frozen bombs don't go off.)
        if (hz.alive && hz.kind === 'bomb') hz.charge = ab?.freeze ? 0 : bombCharge(this.hazardClock, hz.movePhase);
        if (!hz.alive || !hz.moving) continue;
        const osc = Math.sin(this.hazardClock * (hz.moveSpeed ?? 1.6) + hz.movePhase) * hz.moveRange;
        if (hz.moveAxis === 'y') hz.y = hz.baseY + osc;
        else hz.x = hz.baseX + osc;
      }
    }

    const radius = this.playerRadius();
    this.nearLists[0] = cur.hazards;
    this.nearLists[1] = next?.hazards ?? NO_HAZARDS;
    for (const list of this.nearLists) for (const hz of list) {
      if (!hz.alive) continue;
      const dist = Math.hypot(this.player.x - hz.x, this.player.y - hz.y);
      if (hz.kind === 'duck') {
        if (dist < hz.radius + radius) this.bonkDuck(hz);
        if (this.frenzy) return;
        continue;
      }
      // Saws and bombs hit a little inside their drawn edge: a graze that
      // looks like a miss should be a miss.
      // A bomb mid-blast reaches much further.
      const reach = hz.kind === 'bomb' && hz.charge === -1 ? BOMB_BLAST : HAZARD_HITBOX;
      if (dist < hz.radius * reach + radius) {
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
        this.effects.floater(this.player.x, this.player.y - 20, 'CLOSE', css.magenta, 12, 0);
        this.slowMo = Math.max(this.slowMo, 0.09);
        this.cam.punch = Math.max(this.cam.punch, 0.07);
        this.stat({ type: 'nearMiss', kind: 'hazard' });
        sfx.near();
      }
    }
  }

  // --- The ghost of your best run ----------------------------------------------

  /** Record this attempt and move the ghost along (by run time, see game/ghost.ts). */
  private updateGhost() {
    if (this.state !== 'play') {
      this.ghostView.hide();
      return;
    }
    const p = this.player;
    this.ghostRec?.sample(p.x, p.y, this.distance, this.elapsed, this.course.speedAt(this.distance));
    const gone = this.ghostView.update(this.elapsed);
    if (!gone || save.fxReduced) return;
    // Where the best run ended: a small puff ("that's where you died last time").
    const color = 0xcfefff;
    if (gone.end === 'warp') this.effects.burst(gone.x, gone.y, [0xff2f9e, 0xffd21f, 0x2be8ff, 0x7cff6b], 10);
    else this.effects.burst(gone.x, gone.y, [color, 0xffffff], gone.end === 'dead' ? 10 : 6);
    this.effects.shockwave(gone.x, gone.y, color, gone.end === 'dead' ? 46 : 34, 380);
  }

  /** This attempt's recording is over: keep it as the level's ghost if it's the best yet. */
  private endGhost(end: GhostEnd) {
    const rec = this.ghostRec;
    const level = this.course.level;
    this.ghostRec = null;
    if (!rec || !level || this.demo) return;
    offerGhost(level.id, rec.finish(this.player.x, this.player.y, this.distance, this.elapsed, end));
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
    // The ghost only follows the normal track: this attempt's ghost ends here.
    this.endGhost('warp');
    this.stat({ type: 'warp', level: this.course.level?.id ?? null });
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
    this.effects.floater(x, y - 34, 'WARP!', '#ffffff', 26, 3);
    this.flash(0xffffff, 400, 0.8);
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

    if (hz.variant === 'golden' && !this.demo) {
      this.stat({ type: 'duck', variant: 'golden', value: 0 });
      this.startFrenzy(hz);
      return;
    }
    if (hz.variant === 'red') {
      const value = RED_DUCK_VALUE * mult;
      this.ducks += value;
      this.stat({ type: 'duck', variant: 'red', value });
      sfx.redDuck();
      haptic([15, 20, 30]);
      this.effects.floater(hz.x, hz.y - 24, `GOTCHA! +${value}`, '#ff6a55', 18, 2);
      this.effects.shockwave(hz.x, hz.y, 0xff5a4a, 110, 450);
      this.effects.burst(hz.x, hz.y, [0xff5a4a, 0xffd21f, 0xffffff], save.fxReduced ? 10 : 28);
      this.cam.punch = 0.08;
      return;
    }

    this.ducks += mult;
    this.stat({ type: 'duck', variant: 'normal', value: mult });
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
      // Make sure there is track out there to run to.
      this.track.ensureAhead(this.current, LOOKAHEAD + 7);
      const placed = [LOOKAHEAD + 2, LOOKAHEAD + 3, LOOKAHEAD + 4, LOOKAHEAD + 5, LOOKAHEAD + 6].some((ahead) => {
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
    this.hitStop(40);
    this.flash(0xffdc5a, 350, 0.7);
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
    const duck = this.add.image(x, y, TEX.duck).setScale(0.15 / DUCK_RES).setDepth(8).setFlipX(Math.cos(a) < 0);
    this.tweens.add({
      targets: duck,
      x: x + Math.cos(a) * (90 + Math.random() * 80),
      y: y + Math.sin(a) * (90 + Math.random() * 80),
      scale: 0.4 / DUCK_RES,
      angle: (Math.random() - 0.5) * 540,
      alpha: 0,
      duration: 650,
      ease: 'Cubic.easeOut',
      onComplete: () => duck.destroy(),
    });
    if (!save.fxReduced) this.effects.burst(x + Math.cos(a) * 30, y + Math.sin(a) * 30, [0xffd21f, 0xffffff], 4);
    if (f.count % 10 === 0) {
      this.effects.shockwave(this.player.x, this.player.y, 0xffd21f, 120 + f.count, 400);
      this.effects.floater(this.player.x, this.player.y - 40, `${f.count}!`, '#ffe680', 22, 2);
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
    this.stat({ type: 'frenzy', count: f.count });
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
    const state = a ? 'active' : this.abilityLocked ? 'locked' : this.abilityCharges > 0 ? 'ready' : this.course.level ? 'used' : 'recharging';
    this.game.events.emit(EV.ability, { state, frac: a ? Math.max(0, (a.until - this.elapsed) / ABILITY_SECONDS) : 0 });
  }

  /**
   * After the 4-tap spin, face the way the track goes. If the spin started
   * with a corner tap (or right after one), four right turns would bring you
   * back to the heading BEFORE the corner, straight into the wall.
   */
  private snapToTrack() {
    const cur = this.track.get(this.current);
    const next = this.track.get(this.current + 1);
    if (!cur) return;
    const dir = next && pointInRect(this.player.x, this.player.y, next.rect) ? next.dir : cur.dir;
    if (dir !== this.player.dir) {
      this.player.dir = dir;
      this.playerView.onTurn();
    }
  }

  private tryActivateAbility() {
    if (this.ability) return;
    if (this.abilityLocked) {
      this.snapToTrack();
      return;
    }
    if (this.abilityCharges <= 0) {
      const msg = this.course.level ? 'ONCE PER LEVEL' : 'RECHARGING';
      this.effects.floater(this.player.x, this.player.y - 28, msg, css.inkDim, 12);
      sfx.denied();
      // The spin itself still works as a panic move: you come out facing the track.
      this.snapToTrack();
      return;
    }
    const skin = skinById(this.skinId);
    const def = abilityFor(skin.id);
    this.abilityCharges--;
    this.abilityUsed = true;
    this.stat({ type: 'ability', skin: skin.id });
    // A beat of freeze: the super move lands (the UI shows its cut-in).
    this.hitStop(90);
    // Survival recharge starts counting when the ability ENDS (see endAbility),
    // otherwise at top speed it would be ready again the moment it ran out.
    this.rechargeAtM = Infinity;
    this.rechargeAtT = Infinity;
    this.snapToTrack();
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
    this.effects.floater(x, y - 36, def.name, '#ffffff', 20, 3);
    this.cam.punch = 0.15;
    shared.pulse = 1;
    sfx.ability(skin.rarity);
    skinVoices.power(skin.id);
    haptic([20, 30, 60]);
    this.emitAbility();
  }

  /** Ability over (or cut short by death / finish). */
  private endAbility(silent = false) {
    if (!this.ability) return;
    this.ability = null;
    if (!this.course.level) {
      this.rechargeAtM = this.distance * METERS_PER_PX + SURVIVAL_RECHARGE_M;
      this.rechargeAtT = this.elapsed + SURVIVAL_RECHARGE_S;
    }
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
    this.hitStop(25);
    this.cameras.main.shake(90, 0.004);
    this.cam.punch = Math.max(this.cam.punch, 0.06);
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
    const kitty = this.skinId === 'kitty';
    this.effects.flare(x, y, 0xffffff, 150);
    this.effects.shockwave(x, y, skinById(this.skinId).glow, 180, 600);
    this.effects.floater(x, y - 34, kitty ? '8 LIVES LEFT' : 'EXTRA LIFE', '#ffffff', 18, 3);
    this.hitStop(40);
    this.cameras.main.shake(200, 0.006);
    this.flash(0xffffff, 200, 0.45);
    this.cam.punch = 0.12;
    sfx.revive();
    haptic([40, 40, 40]);
    return true;
  }

  // --- Camera juice -----------------------------------------------------------

  /**
   * Hit-stop: freeze the whole world for a few milliseconds so an impact
   * lands. The scene keeps rendering while paused, so you see the frozen
   * moment of the hit, then everything carries on. Real time (setTimeout),
   * because the scene's own clock is the thing being stopped.
   */
  private hitStop(ms: number) {
    // `sys.pause()` takes effect at once. (`this.scene.pause()` is queued to
    // the next frame, which could land after the resume and never lift.)
    if (this.sys.isPaused()) return;
    this.sys.pause();
    window.setTimeout(() => {
      if (this.sys.isPaused() && !this.userPaused) this.sys.resume();
    }, ms);
  }

  /**
   * A flash over the screen in any colour, starting at `strength` opacity
   * and fading out. Skipped in reduced FX (flashing can be uncomfortable).
   */
  private flash(color: number, ms: number, strength: number) {
    if (save.fxReduced) return;
    const cam = this.cameras.main;
    cam.flashEffect.alpha = strength;
    cam.flash(ms, (color >> 16) & 255, (color >> 8) & 255, color & 255, true);
  }

  // --- Automatic quality ---------------------------------------------------

  private perf = { start: 0, last: 0, frames: 0, bad: 0, runFrames: 0, runMs: 0, raiseCooldown: 0 };

  /** Forget the current measuring window (new run, after a pause). */
  private resetPerfWindow() {
    this.perf.start = 0;
    this.perf.last = 0;
    this.perf.bad = 0;
  }

  /**
   * Watches the frame rate while playing. Two bad 2-second windows in a row
   * (under 50 fps) step down the quality ladder (see display.ts). Gaps (a
   * hitch, the app in the background) restart the window instead of counting,
   * and a steady ~30 fps is the phone's Low Power Mode cap, which lowering
   * quality can't fix, so it's ignored.
   */
  private watchPerformance() {
    // Real wall-clock time: Phaser smooths its own frame delta, which would
    // hide exactly the stutter we're looking for.
    const now = performance.now();
    const p = this.perf;
    if (p.last && now - p.last > 120) p.start = 0;
    if (p.last && now - p.last <= 120) {
      p.runFrames++;
      p.runMs += now - p.last;
    }
    p.last = now;
    if (!p.start) {
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
    if (fps >= 50 || (fps > 27 && fps < 33)) {
      p.bad = 0;
      return;
    }
    if (++p.bad < 2) return;
    p.bad = 0;
    if (display.setQuality(display.quality + 1, save.fxReduced)) p.raiseCooldown = 3;
  }

  /**
   * Between runs: if the last run was smooth all the way, try one step back
   * up the quality ladder (at most every few runs, so a slow phone doesn't
   * bounce up and down).
   */
  private maybeRaiseQuality() {
    const p = this.perf;
    const avg = p.runMs > 0 ? (p.runFrames * 1000) / p.runMs : 0;
    const longEnough = p.runMs > 10000;
    p.runFrames = 0;
    p.runMs = 0;
    if (p.raiseCooldown > 0) {
      p.raiseCooldown--;
      return;
    }
    if (longEnough && avg >= 57 && display.quality > 0) {
      display.setQuality(display.quality - 1, save.fxReduced);
      p.raiseCooldown = 2;
    }
  }

  /** Bombs tick when you get close, faster the closer you are. */
  private tickNearbyBombs(cur: Segment, next: Segment | undefined) {
    let closest = Infinity;
    for (const list of [cur.hazards, next?.hazards ?? NO_HAZARDS]) for (const hz of list) {
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
    // Passing your record mid-run is a moment: say so, right there.
    if (!this.recordShown && this.mode === 'survival' && save.best >= 100 && m > save.best) {
      this.recordShown = true;
      const { x, y } = this.player;
      this.effects.floater(x, y - 40, 'NEW RECORD!', '#ffd21f', 24, 3);
      this.effects.shockwave(x, y, 0xffd21f, 220, 700);
      this.effects.burst(x, y, [0xffd21f, 0xffffff, 0xff9a2e], save.fxReduced ? 12 : 40);
      this.cam.punch = 0.12;
      this.flash(0xffd21f, 220, 0.25);
      sfx.newBest();
      haptic([20, 30, 20, 30, 60]);
    }
    // Survival: the ability recharges every so often.
    if (this.abilityCharges === 0 && !this.ability && m >= this.rechargeAtM && this.elapsed >= this.rechargeAtT) {
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

  /** The segments on screen. Returns a shared scratch array (no garbage); don't keep it. */
  private visibleSegments(): Segment[] {
    const s = this.track.segments;
    const out = this.visScratch;
    out.length = 0;
    const end = Math.min(s.length, this.current + LOOKAHEAD + 1);
    for (let i = Math.max(0, this.current - 1); i < end; i++) out.push(s[i]);
    return out;
  }

  private updateCamera(dt: number, speedNorm: number, t: number) {
    const cam = this.cameras.main;
    const d = DIRS[this.player.dir];

    // Look ahead in the direction of travel, further at higher speed. On a
    // tall phone screen the sideways legs have less room, so look further
    // ahead on those.
    const { w, h } = display.size(this);
    const sideways = d.x !== 0 && h > w;
    const look = this.state === 'ready' ? 0 : this.state === 'clear' ? 20 : (70 + speedNorm * 60) * (sideways ? 1.3 : 1);
    let tx = this.player.x + d.x * look;
    let ty = this.player.y + d.y * look;
    if (this.demo) {
      // Menu: the demo run plays in the gap between the logo and the menu
      // dock, so the ball never runs across the title text.
      tx = this.player.x + d.x * 40;
      ty = this.player.y + d.y * 40 + (h * 0.07) / this.baseZoom();
    } else if (this.state === 'ready') {
      tx += Math.sin(t * 0.4) * 20 + 60;
      ty += Math.cos(t * 0.33) * 14 + (h * 0.2) / this.baseZoom();
    }
    this.cam.x = lerp(this.cam.x, tx, damp(0.002, dt));
    this.cam.y = lerp(this.cam.y, ty, damp(0.002, dt));

    this.cam.punch = lerp(this.cam.punch, 0, damp(0.004, dt));

    // Zoom out with speed, so there's more to see when it matters most.
    const targetZoom = this.demo
      ? 0.92
      : 1 - speedNorm * 0.18 + (this.state === 'ready' ? 0.08 : this.state === 'clear' ? 0.15 : 0);
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
