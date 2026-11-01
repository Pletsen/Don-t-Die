import Phaser from 'phaser';
import { fonts } from '../game/palette';
import { GhostPlayback, type GhostRun, type GhostEnd } from '../game/ghost';
import { TEX } from './textures';

/** The ghost sits under everything that matters: above the corridor floor, below hazards and the player. */
const DEPTH = 3;
const ALPHA = 0.34;
const TRAIL = 7;
/** Seconds between trail dots. */
const TRAIL_GAP = 0.028;
const COLOR = 0xcfefff;

/**
 * The ghost of your best run on this level: a faint ball that follows the
 * recorded line by run time, with a short thin trail and "BEST" over it for
 * the first moments. It never collides with anything. Where the best run
 * ended it vanishes (GameScene adds a small burst there).
 *
 * Cheap on purpose: one image, a few pooled dots and one text, all created
 * once; per frame it's a handful of setPosition calls.
 */
export class GhostView {
  private ball: Phaser.GameObjects.Image;
  private halo: Phaser.GameObjects.Image;
  private dots: Phaser.GameObjects.Image[] = [];
  private label: Phaser.GameObjects.Text;
  private play: GhostPlayback | null = null;
  private done = true;
  private shown = false;
  private pos = { x: 0, y: 0 };
  private trailPos = { x: 0, y: 0 };

  constructor(scene: Phaser.Scene, radius: number) {
    for (let i = 0; i < TRAIL; i++) {
      const k = 1 - i / TRAIL;
      this.dots.push(
        scene.add
          .image(0, 0, TEX.glow)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setTint(COLOR)
          .setScale((radius * (1.5 * k + 0.4)) / 128)
          .setAlpha(0.2 * k)
          .setDepth(DEPTH)
          .setVisible(false),
      );
    }
    this.halo = scene.add.image(0, 0, TEX.glow).setBlendMode(Phaser.BlendModes.ADD).setTint(COLOR).setScale((radius * 3.4) / 128).setAlpha(0.16).setDepth(DEPTH).setVisible(false);
    this.ball = scene.add.image(0, 0, TEX.orb).setTint(COLOR).setScale((radius * 2.1) / 96).setAlpha(ALPHA).setDepth(DEPTH).setVisible(false);
    this.label = scene.add
      .text(0, 0, 'BEST', { fontFamily: fonts.mono, fontStyle: '700', fontSize: '10px', color: '#cfefff', resolution: 2 })
      .setOrigin(0.5, 1)
      .setLetterSpacing(2)
      .setDepth(DEPTH)
      .setVisible(false);
  }

  /** A new run: follow this ghost (or show nothing). */
  start(run: GhostRun | null) {
    this.play = run ? new GhostPlayback(run) : null;
    this.done = !run;
    this.setVisible(false);
  }

  /** Gone for this run (it ended, or the run did). */
  stop() {
    this.play = null;
    this.done = true;
    this.setVisible(false);
  }

  /** Out of sight for now (the player crashed); `update` brings it back after a CONTINUE. */
  hide() {
    this.setVisible(false);
  }

  /**
   * Move to run time `t`. Returns where the ghost ended the moment it does
   * (once), so the scene can mark the spot; otherwise null.
   */
  update(t: number): { x: number; y: number; end: GhostEnd } | null {
    const play = this.play;
    if (!play || this.done) return null;
    if (t >= play.duration) {
      const last = play.run.pts[play.run.pts.length - 1];
      this.stop();
      return { x: last.x, y: last.y, end: play.run.end };
    }
    this.setVisible(true);
    const p = play.at(t, this.pos);
    this.ball.setPosition(p.x, p.y);
    this.halo.setPosition(p.x, p.y);
    // "BEST" floats over it for the first second and a half, then fades.
    const labelAlpha = t < 1.2 ? 0.75 : Math.max(0, 0.75 - (t - 1.2) * 1.5);
    this.label.setVisible(labelAlpha > 0).setAlpha(labelAlpha).setPosition(p.x, p.y - 16);
    // The trail: where the ghost was a moment ago (searched back from t, not with the cursor).
    const q = this.trailPos;
    for (let i = 0; i < TRAIL; i++) {
      const tt = t - (i + 1) * TRAIL_GAP;
      const dot = this.dots[i];
      if (tt < 0) {
        dot.setVisible(false);
        continue;
      }
      play.at(tt, q, true);
      dot.setVisible(true).setPosition(q.x, q.y);
    }
    return null;
  }

  private setVisible(on: boolean) {
    if (on === this.shown) return;
    this.shown = on;
    this.ball.setVisible(on);
    this.halo.setVisible(on);
    this.label.setVisible(on);
    for (const d of this.dots) d.setVisible(on);
  }
}
