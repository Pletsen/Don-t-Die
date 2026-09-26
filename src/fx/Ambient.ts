import Phaser from 'phaser';
import { shared } from '../game/shared';
import { hueColor } from '../game/palette';
import { TEX } from './textures';

/**
 * Ambient motes: a few specks of light drifting slowly upward around the
 * camera, tinted with the current sector colour. They sit behind the track
 * and stay faint and small, so they give the space some life and depth
 * without ever looking like something you could hit.
 */
export class Ambient {
  private motes: Phaser.GameObjects.Particles.ParticleEmitter;
  private zone = new Phaser.Geom.Rectangle(-300, -400, 600, 800);
  private nextTint = 0;

  constructor(scene: Phaser.Scene) {
    this.motes = scene.add
      .particles(0, 0, TEX.spark, {
        frequency: 140,
        lifespan: { min: 5000, max: 9000 },
        speedX: { min: -6, max: 6 },
        speedY: { min: -18, max: -4 },
        scale: { min: 0.1, max: 0.3 },
        // Fade in, hang, fade out: never pops in or out.
        alpha: { onEmit: () => 0, onUpdate: (_p, _k, t) => Math.sin(t * Math.PI) * 0.4 },
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
      this.motes.setParticleTint(shared.warp > 0.5 ? hueColor(time * 70) : shared.accent);
    }
  }

  setEnabled(on: boolean) {
    this.motes.emitting = on;
    if (!on) this.motes.killAll();
  }
}
