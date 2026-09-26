import Phaser from 'phaser';
import { backgroundFrag } from './backgroundShader';
import { shared } from '../game/shared';
import { toRGB } from '../game/palette';

/**
 * A full-screen Shader game object that lives in the game world and follows
 * the camera. Living in the same scene as everything else means the camera's
 * post-processing (bloom, colour grading) applies to it too.
 */
export class Backdrop {
  private shader: Phaser.GameObjects.Shader;
  private size = { w: 1, h: 1 };
  private view = { w: 1, h: 1 };

  constructor(private scene: Phaser.Scene) {
    this.shader = scene.add
      .shader(
        {
          name: 'Backdrop',
          fragmentSource: backgroundFrag,
          setupUniforms: (setUniform: (name: string, value: unknown) => void) => {
            const accent = toRGB(shared.accent);
            setUniform('uSize', [this.size.w, this.size.h]);
            setUniform('uView', [this.view.w, this.view.h]);
            setUniform('uCam', [shared.camX, shared.camY]);
            setUniform('uTime', this.scene.time.now / 1000);
            setUniform('uAccent', [accent[0] / 255, accent[1] / 255, accent[2] / 255]);
            setUniform('uIntensity', shared.intensity);
            setUniform('uPulse', shared.pulse);
            setUniform('uWarp', shared.warp);
          },
        },
        0,
        0,
        1,
        1,
      )
      .setOrigin(0.5)
      .setDepth(-100);
  }

  /** Cover the camera's view (with margin, so camera tilt never shows edges). */
  update(cam: Phaser.Cameras.Scene2D.Camera, centerX: number, centerY: number) {
    this.view = { w: cam.width / cam.zoom, h: cam.height / cam.zoom };
    const w = Math.ceil(this.view.w * 1.3);
    const h = Math.ceil(this.view.h * 1.3);
    if (w !== this.size.w || h !== this.size.h) {
      this.size = { w, h };
      this.shader.setSize(w, h);
      this.shader.setDisplaySize(w, h);
      // Phaser only recalculates the pivot point when the origin is set.
      this.shader.setOrigin(0.5);
    }
    this.shader.setPosition(centerX, centerY);
  }
}
