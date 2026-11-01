import Phaser from 'phaser';

// A very cheap way to draw a few hundred flat, axis-aligned, tinted quads
// from one texture atlas: one game object, no per-quad game objects, no
// containers, no vector tessellation and (with one atlas) one draw call.
// It reuses Phaser's own quad batcher the same way Blitter does.

const getTint = Phaser.Renderer.WebGL.Utils.getTintAppendFloatAlpha;

/**
 * Per-quad fade channel. The quad's alpha is multiplied by the list's
 * channel value, so a whole group of quads can fade without touching them.
 */
export const CH = {
  none: 0,
  /** Walls that close the lane behind you as the previous piece fades. */
  cap: 1,
  /** A corner glow that hides while the next piece is visible. */
  front: 2,
  /** Outer haze, off with reduced effects. */
  fx: 3,
  capFx: 4,
  frontFx: 5,
} as const;

/** A growable list of quads: rect (x1,y1)-(x2,y2), atlas frame, colour slot, alpha. */
export class QuadList {
  n = 0;
  x1 = new Float32Array(64);
  y1 = new Float32Array(64);
  x2 = new Float32Array(64);
  y2 = new Float32Array(64);
  a = new Float32Array(64);
  kind = new Uint8Array(64);
  chan = new Uint8Array(64);
  frame: Phaser.Textures.Frame[] = [];
  /** Alpha of the whole list (e.g. a track piece fading in or out). */
  alpha = 1;
  /** Values for each fade channel, see CH. */
  chanAlpha = [1, 1, 1, 1, 1, 1];

  clear() {
    this.n = 0;
  }

  /**
   * Add a quad. Swap x1/x2 or y1/y2 to mirror the frame. `kind` picks the
   * colour from the layer palette, so recolouring never touches the quads.
   */
  push(frame: Phaser.Textures.Frame, x1: number, y1: number, x2: number, y2: number, kind: number, alpha = 1, chan = 0) {
    if (this.n === this.x1.length) this.grow();
    const i = this.n++;
    this.x1[i] = x1;
    this.y1[i] = y1;
    this.x2[i] = x2;
    this.y2[i] = y2;
    this.a[i] = alpha;
    this.kind[i] = kind;
    this.chan[i] = chan;
    this.frame[i] = frame;
  }

  private grow() {
    const size = this.x1.length * 2;
    const f = (old: Float32Array) => {
      const next = new Float32Array(size);
      next.set(old);
      return next;
    };
    this.x1 = f(this.x1);
    this.y1 = f(this.y1);
    this.x2 = f(this.x2);
    this.y2 = f(this.y2);
    this.a = f(this.a);
    const k = new Uint8Array(size);
    k.set(this.kind);
    this.kind = k;
    const c = new Uint8Array(size);
    c.set(this.chan);
    this.chan = c;
  }
}

const viewMatrix = new Phaser.GameObjects.Components.TransformMatrix();
const transformer = { quad: new Float32Array(8) };
const texturer: { frame: Phaser.Textures.Frame | null; uvSource: Phaser.Textures.Frame | null } = { frame: null, uvSource: null };
const tinter = {
  tintEffect: 0,
  tintTopLeft: 0,
  tintBottomLeft: 0,
  tintTopRight: 0,
  tintBottomRight: 0,
  tint2TopLeft: 0,
  tint2BottomLeft: 0,
  tint2TopRight: 0,
  tint2BottomRight: 0,
};

/**
 * Renders its lists in order (first = bottom). Built on Blitter so it gets
 * Phaser's quad render nodes, depth, visibility and camera handling for free;
 * the bobs are not used.
 */
export class QuadLayer extends Phaser.GameObjects.Blitter {
  lists: QuadList[] = [];
  /** Colour for each `kind` (0xRRGGBB). */
  palette: number[] = [];

  constructor(scene: Phaser.Scene, texture: string) {
    super(scene, 0, 0, texture);
    scene.add.existing(this);
  }

  // Phaser calls this (via the render step captured at construction).
  renderWebGL(
    _renderer: Phaser.Renderer.WebGL.WebGLRenderer,
    src: QuadLayer,
    drawingContext: Phaser.Renderer.WebGL.DrawingContext,
    parentMatrix?: Phaser.GameObjects.Components.TransformMatrix,
  ) {
    const camera = drawingContext.camera!;
    camera.addToRenderList(src);
    const m = viewMatrix.copyWithScrollFactorFrom(
      camera.getViewMatrix(!drawingContext.useCanvas),
      camera.scrollX,
      camera.scrollY,
      src.scrollFactorX,
      src.scrollFactorY,
    );
    if (parentMatrix) m.multiply(parentMatrix);
    const nodes = src.customRenderNodes as Record<string, { run: (...args: unknown[]) => void }>;
    const defaults = src.defaultRenderNodes as Record<string, { run: (...args: unknown[]) => void }>;
    const submitter = nodes.Submitter || defaults.Submitter;
    const layerAlpha = src.alpha;
    const palette = src.palette;
    for (let l = 0; l < src.lists.length; l++) {
      const list = src.lists[l];
      const la = list.alpha * layerAlpha;
      if (la <= 0) continue;
      const ch = list.chanAlpha;
      for (let i = 0; i < list.n; i++) {
        const a = list.a[i] * la * ch[list.chan[i]];
        if (a <= 0.002) continue;
        m.setQuad(list.x1[i], list.y1[i], list.x2[i], list.y2[i], transformer.quad);
        const frame = list.frame[i];
        texturer.frame = frame;
        texturer.uvSource = frame;
        const t = getTint(palette[list.kind[i]], a);
        tinter.tintTopLeft = t;
        tinter.tintBottomLeft = t;
        tinter.tintTopRight = t;
        tinter.tintBottomRight = t;
        submitter.run(drawingContext, src, parentMatrix, 0, texturer, transformer, tinter, undefined, 0);
      }
    }
  }
}
