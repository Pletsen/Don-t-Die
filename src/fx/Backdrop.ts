import Phaser from 'phaser';
import { backgroundFrag } from './backgroundShader';
import { shared } from '../game/shared';
import { display } from '../game/display';
import { WORLD_SKY, mix, worldIndex } from './worldPalette';

const SKY_KEY = 'wd-sky';

/**
 * The sky behind everything. A full-screen shader renders into its own
 * texture at reduced resolution (about 1.5 pixels per CSS pixel, so a quarter
 * of the work on a 3x phone), and an Image stretches that texture over the
 * camera view. The image lives in the game world, so the camera's
 * post-processing (bloom, colour grading) applies to it too. The sky is all
 * soft gradients, so the upscale is invisible.
 */
export class Backdrop {
  private shader: Phaser.GameObjects.Shader;
  private image: Phaser.GameObjects.Image | null = null;
  /** Quad size and visible area, in world units. */
  private size = { w: 1, h: 1 };
  private view = { w: 1, h: 1 };
  /** Render target size in pixels. */
  private px = { w: 0, h: 0 };
  /** Cross-fade weight of each world's sky. */
  private weights = [1, 0, 0, 0];
  private accent2 = WORLD_SKY[0].accent2;
  private lastTime = 0;
  private beams = [0, -1, 0, -1, 0, 1];
  /** Render targets can come out upside down; checked once at start-up. */
  private flipY = 0;

  constructor(private scene: Phaser.Scene) {
    this.shader = scene.add
      .shader(
        {
          name: 'Backdrop',
          fragmentSource: backgroundFrag,
          setupUniforms: (setUniform: (name: string, value: unknown) => void) => {
            const a = shared.accent;
            const b = this.accent2;
            const w = this.weights;
            setUniform('uSize', [this.size.w, this.size.h]);
            setUniform('uView', [this.view.w, this.view.h]);
            setUniform('uCam', [shared.camX, shared.camY]);
            setUniform('uTime', this.scene.time.now / 1000);
            setUniform('uAccent', [((a >> 16) & 255) / 255, ((a >> 8) & 255) / 255, (a & 255) / 255]);
            setUniform('uAccent2', [((b >> 16) & 255) / 255, ((b >> 8) & 255) / 255, (b & 255) / 255]);
            setUniform('uWorld', [w[0], w[1], w[2], w[3]]);
            setUniform('uBeams', [this.beams[0], this.beams[1], this.beams[2], this.beams[3]]);
            setUniform('uBeam3', [this.beams[4], this.beams[5]]);
            setUniform('uIntensity', shared.intensity);
            setUniform('uPulse', shared.pulse);
            setUniform('uWarp', shared.warp);
            setUniform('uFlipY', this.flipY);
          },
        },
        0,
        0,
        1,
        1,
      )
      .setOrigin(0.5)
      .setDepth(-101);
  }

  /** Cover the camera's view, with a hair of margin for the zoom punch. */
  update(cam: Phaser.Cameras.Scene2D.Camera, centerX: number, centerY: number) {
    this.view.w = cam.width / cam.zoom;
    this.view.h = cam.height / cam.zoom;
    this.size.w = this.view.w * 1.04;
    this.size.h = this.view.h * 1.04;

    // Pixels: about 1.5 per CSS pixel, never more than the screen has.
    const scale = Math.min(1, 1.5 / display.dpr);
    const pw = Math.max(16, Math.ceil(cam.width * 1.04 * scale));
    const ph = Math.max(16, Math.ceil(cam.height * 1.04 * scale));
    if (pw !== this.px.w || ph !== this.px.h) this.resize(pw, ph);
    this.image?.setPosition(centerX, centerY).setDisplaySize(this.size.w, this.size.h);

    this.updateSky();
  }

  private resize(pw: number, ph: number) {
    this.px.w = pw;
    this.px.h = ph;
    this.shader.setSize(pw, ph);
    if (!this.image) {
      this.shader.setRenderToTexture(SKY_KEY);
      this.image = this.scene.add.image(0, 0, SKY_KEY).setDepth(-100);
    }
  }

  /** Cross-fade between the world skies and steer the searchlights. */
  private updateSky() {
    const now = this.scene.time.now / 1000;
    const dt = Math.min(0.1, Math.max(0, now - this.lastTime));
    this.lastTime = now;
    const target = worldIndex(shared.world);
    const k = 1 - Math.exp(-dt * 2.2);
    let sum = 0;
    for (let i = 0; i < 4; i++) {
      this.weights[i] += ((i === target ? 1 : 0) - this.weights[i]) * k;
      if (this.weights[i] < 0.002) this.weights[i] = 0;
      sum += this.weights[i];
    }
    // Mix the second sky colour by weight (accent itself comes from shared).
    let col = WORLD_SKY[0].accent2;
    let acc = 0;
    for (let i = 0; i < 4; i++) {
      const w = this.weights[i] / (sum || 1);
      if (w <= 0) continue;
      acc += w;
      col = acc === w ? WORLD_SKY[i].accent2 : mix(col, WORLD_SKY[i].accent2, w / acc);
    }
    this.accent2 = col;

    // Searchlights: slow, out-of-step sweeps.
    const t = now;
    const a = -Math.PI / 2 + 0.34 * Math.sin(t * 0.37) + 0.12;
    const b = -Math.PI / 2 + 0.34 * Math.sin(t * 0.29 + 2.1) - 0.12;
    const c = Math.PI / 2 + 0.24 * Math.sin(t * 0.21 + 4.0);
    this.beams[0] = Math.cos(a);
    this.beams[1] = Math.sin(a);
    this.beams[2] = Math.cos(b);
    this.beams[3] = Math.sin(b);
    this.beams[4] = Math.cos(c);
    this.beams[5] = Math.sin(c);
  }
}
