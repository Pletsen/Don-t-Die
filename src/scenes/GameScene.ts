import Phaser from 'phaser';
import { Track, DIRS, pointInRect, distToRectEdge, type Dir, type Hazard, type Segment } from '../game/Track';
import { tuning, sectorColorAt, METERS_PER_PX } from '../game/tuning';
import { shared, EV, type DeathData } from '../game/shared';
import { display } from '../game/display';
import { save } from '../game/storage';
import { css, palette } from '../game/palette';
import { sfx, haptic } from '../audio/Sfx';
import { CorridorView } from '../fx/CorridorView';
import { PlayerView } from '../fx/PlayerView';
import { HazardView } from '../fx/HazardView';
import { Effects } from '../fx/Effects';
import { Backdrop } from '../fx/Backdrop';

type State = 'ready' | 'play' | 'dead';

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
  private track!: Track;
  private current = 0;

  private player = { x: 0, y: 0, dir: 0 as Dir };
  private distance = 0;
  private elapsed = 0;
  private combo = 0;
  private slowMo = 0;
  private deathAt = 0;
  private nearWallFlags = new Set<number>();
  private nearHazardFlags = new WeakSet<Hazard>();

  private cam = { x: 0, y: 0, zoom: 1, punch: 0, tilt: 0 };
  private deathFade = 0;

  private corridor!: CorridorView;
  private playerView!: PlayerView;
  private effects!: Effects;
  private backdrop!: Backdrop;
  private hazardViews = new Map<number, HazardView>();

  private bloom?: Phaser.Types.Actions.AddEffectBloomReturn;
  private grade?: Phaser.Filters.ColorMatrix;

  constructor() {
    super('Game');
  }

  create() {
    this.backdrop = new Backdrop(this);
    this.corridor = new CorridorView(this);
    this.playerView = new PlayerView(this, tuning.playerRadius);
    this.effects = new Effects(this);

    this.setupCamera();
    this.resetRun();

    this.game.events.on(EV.tap, this.onTap, this);
    this.game.events.on(EV.fxChanged, this.applyFxSetting, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(EV.tap, this.onTap, this);
      this.game.events.off(EV.fxChanged, this.applyFxSetting, this);
    });
  }

  // --- Camera & post-processing ---------------------------------------------

  private setupCamera() {
    const cam = this.cameras.main;

    // Bloom makes bright pixels bleed light into their surroundings. This is
    // what turns flat coloured lines into glowing neon.
    this.bloom = Phaser.Actions.AddEffectBloom(cam, {
      threshold: 0.42,
      blurRadius: 2.4,
      blurSteps: 4,
      blurQuality: 0,
      blendAmount: 1.15,
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

  private resetRun() {
    this.hazardViews.forEach((v) => v.destroy());
    this.hazardViews.clear();
    this.effects.clear();

    this.track = new Track();
    this.current = 0;
    this.player = { x: 0, y: 0, dir: 0 };
    this.distance = 0;
    this.elapsed = 0;
    this.combo = 0;
    this.slowMo = 0;
    this.deathFade = 0;
    this.nearWallFlags.clear();
    this.nearHazardFlags = new WeakSet();

    this.playerView.reset();
    this.playerView.setPosition(0, 0);
    this.playerView.setEmitting(false);

    this.cam = { x: 60, y: 0, zoom: 1, punch: 0, tilt: 0 };
    shared.accent = palette.cyan;
  }

  private onTap() {
    if (this.state === 'ready') {
      this.beginRun();
    } else if (this.state === 'play') {
      this.turn();
    } else if (this.state === 'dead' && this.time.now - this.deathAt > 650) {
      this.resetRun();
      this.beginRun();
    }
  }

  private beginRun() {
    sfx.unlock();
    sfx.start();
    this.state = 'play';
    this.playerView.setEmitting(true);
    this.effects.shockwave(this.player.x, this.player.y, palette.cyan, 90, 500);
    this.game.events.emit(EV.started);
  }

  /** Snapshot used by automated browser tests (see scripts/). */
  debugState() {
    const next = this.track.get(this.current + 1);
    return {
      state: this.state,
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

    this.player.dir = ((this.player.dir + 1) % 4) as Dir;
    this.playerView.onTurn();
    this.effects.burst(this.player.x, this.player.y, palette.cyan, save.fxReduced ? 4 : 10);
    this.cam.tilt += 0.012;
    sfx.turn();
    haptic(8);

    if (!inGate) return;
    if (perfect) {
      this.combo++;
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
    this.deathAt = this.time.now;
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

    const meters = this.distance * METERS_PER_PX;
    const isNewBest = meters > save.best;
    if (isNewBest) save.setBest(meters);
    save.addDeath();

    const data: DeathData = {
      meters,
      seconds: this.elapsed,
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

  // --- Frame loop -----------------------------------------------------------

  update(_time: number, deltaMs: number) {
    const dt = Math.min(deltaMs / 1000, 1 / 30);
    const t = this.time.now / 1000;

    if (this.state === 'play') this.step(dt);
    else if (this.slowMo > 0) this.slowMo = Math.max(0, this.slowMo - dt);

    const speed = tuning.speedAt(this.distance);
    const speedNorm = clamp((speed - 230) / 390, 0, 1);
    const accent = sectorColorAt(this.distance);

    // Hazards animate even while the menu is up.
    for (const seg of this.visibleSegments()) {
      const hz = seg.hazard;
      if (!hz || !hz.alive) continue;
      let view = this.hazardViews.get(seg.id);
      if (!view) {
        view = new HazardView(this, hz);
        this.hazardViews.set(seg.id, view);
      }
      view.update(t, dt);
    }

    this.corridor.draw(this.track.segments, this.current, this.player, accent, t, save.fxReduced);
    this.playerView.setPosition(this.player.x, this.player.y);
    const heading = Math.atan2(DIRS[this.player.dir].y, DIRS[this.player.dir].x);
    this.playerView.update(t, dt, heading, speedNorm, tuning.playerRadius);

    this.updateCamera(dt, speedNorm, t);
    this.updateGrade(dt);

    shared.accent = accent;
    shared.intensity = lerp(shared.intensity, this.state === 'play' ? speedNorm : 0.15, damp(0.2, dt));
    shared.pulse = Math.max(0, shared.pulse - dt * 2.5);

    if (this.state === 'play') {
      this.game.events.emit(EV.hud, { meters: this.distance * METERS_PER_PX, seconds: this.elapsed });
    }
  }

  /** Advance the simulation by one frame while playing. */
  private step(dt: number) {
    this.elapsed += dt;
    if (this.slowMo > 0) this.slowMo = Math.max(0, this.slowMo - dt);
    const sim = dt * (this.slowMo > 0 ? 0.35 : 1);

    const speed = tuning.speedAt(this.distance);
    const d = DIRS[this.player.dir];
    this.player.x += d.x * speed * sim;
    this.player.y += d.y * speed * sim;
    this.distance += speed * sim;

    this.track.ensureAhead(this.current, tuning.segmentsAhead);

    let cur = this.track.get(this.current)!;
    let next = this.track.get(this.current + 1);
    if (next && this.player.dir === next.dir && pointInRect(this.player.x, this.player.y, next.rect)) {
      this.current++;
      cur = next;
      next = this.track.get(this.current + 1);
      this.pruneTrack();
    }

    const inCur = pointInRect(this.player.x, this.player.y, cur.rect);
    const inNext = !!next && pointInRect(this.player.x, this.player.y, next.rect);
    if (!inCur && !inNext) {
      this.die('wall', palette.ink);
      return;
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

    for (const seg of [cur, next]) {
      const hz = seg?.hazard;
      if (!hz || !hz.alive) continue;
      if (hz.moving) {
        const osc = Math.sin(this.time.now / 1000 * 1.6 + hz.movePhase) * hz.moveRange;
        if (hz.moveAxis === 'y') hz.y = hz.baseY + osc;
        else hz.x = hz.baseX + osc;
      }
      const dist = Math.hypot(this.player.x - hz.x, this.player.y - hz.y);
      if (dist < hz.radius + tuning.playerRadius) {
        hz.alive = false;
        this.hazardViews.get(seg!.id)?.destroy();
        this.hazardViews.delete(seg!.id);
        this.die(hz.kind, hz.kind === 'saw' ? palette.magenta : palette.orange);
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

  private pruneTrack() {
    const keepFrom = this.current - 2;
    if (keepFrom <= 0) return;
    for (const seg of this.track.pruneBefore(keepFrom)) {
      this.hazardViews.get(seg.id)?.destroy();
      this.hazardViews.delete(seg.id);
    }
    this.current -= keepFrom;
  }

  private visibleSegments(): Segment[] {
    const s = this.track.segments;
    return s.slice(Math.max(0, this.current - 1), Math.min(s.length, this.current + 5));
  }

  private updateCamera(dt: number, speedNorm: number, t: number) {
    const cam = this.cameras.main;
    const d = DIRS[this.player.dir];

    // Look ahead in the direction of travel, further at higher speed.
    const look = this.state === 'ready' ? 0 : 70 + speedNorm * 50;
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
    this.cam.tilt = lerp(this.cam.tilt, 0, damp(0.0005, dt));

    const targetZoom = 1 - speedNorm * 0.1 + (this.state === 'ready' ? 0.08 : 0);
    this.cam.zoom = lerp(this.cam.zoom, targetZoom, damp(0.05, dt));
    const zoom = this.baseZoom() * (this.cam.zoom + this.cam.punch);

    cam.setZoom(zoom * display.dpr);
    cam.setRotation(this.cam.tilt);
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
