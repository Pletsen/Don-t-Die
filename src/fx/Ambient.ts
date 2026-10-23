import Phaser from 'phaser';
import { shared } from '../game/shared';
import { TEX } from './textures';
import { WORLD_SKY, mix, u2Color, worldIndex } from './worldPalette';

const rand = Phaser.Math.FloatBetween;

/**
 * How the motes drift in each world (world units per second):
 * BASICS specks rising gently, SAWS embers rising faster, BOMBS spores
 * drifting sideways through the haze, CHAOS ash falling.
 */
const DRIFT = [
  { x: [-6, 6], y: [-18, -4] },
  { x: [-10, 10], y: [-32, -12] },
  { x: [6, 16], y: [-6, 6] },
  { x: [-10, 4], y: [8, 22] },
];

/**
 * Ambient motes: a few specks of light drifting slowly around the camera,
 * tinted with the world's colour. They sit behind the track and stay faint
 * and small, so they give the space some life and depth without ever
 * looking like something you could hit.
 */
export class Ambient {
  private motes: Phaser.GameObjects.Particles.ParticleEmitter;
  private zone = new Phaser.Geom.Rectangle(-300, -400, 600, 800);
  private nextTint = 0;

  constructor(scene: Phaser.Scene) {
    const drift = () => DRIFT[shared.warp > 0.5 ? 0 : worldIndex(shared.world)];
    this.motes = scene.add
      .particles(0, 0, TEX.spark, {
        frequency: 140,
        lifespan: { min: 5000, max: 9000 },
        speedX: { onEmit: () => rand(drift().x[0], drift().x[1]) },
        speedY: { onEmit: () => rand(drift().y[0], drift().y[1]) },
        scale: { min: 0.1, max: 0.3 },
        // Fade in, hang, fade out: never pops in or out.
        alpha: { onEmit: () => 0, onUpdate: (_p, _k, t) => Math.sin(t * Math.PI) * 0.38 },
        blendMode: Phaser.BlendModes.ADD,
        emitZone: { type: 'random', source: this.zone, quantity: 1 } as Phaser.Types.GameObjects.Particles.EmitZoneData,
      })
      .setDepth(-40);
  }

  update(cam: Phaser.Cameras.Scene2D.Camera, time: number) {
    const view = cam.worldView;
    // Spawn anywhere in (a bit more than) the visible area.
    this.zone.setTo(-view.width * 0.6, -view.height * 0.6, view.width * 1.2, view.height * 1.2);
    this.motes.setPosition(view.centerX, view.centerY);
    if (time > this.nextTint) {
      this.nextTint = time + 0.5;
      const world = WORLD_SKY[worldIndex(shared.world)];
      // Universe 2 stays in its cyan..pink range, so motes never look like ducks.
      const c = shared.warp > 0.5 ? u2Color(time) : mix(shared.accent, world.accent2, 0.25);
      this.motes.setParticleTint(mix(c, 0xffffff, 0.2));
    }
  }

  setEnabled(on: boolean) {
    this.motes.emitting = on;
    if (!on) this.motes.killAll();
  }
}
