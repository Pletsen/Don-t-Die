import * as THREE from 'three';
import { Rng } from '../game/rng';

/** Procedural textures, so the game still needs no image files. */

function valueNoise(rng: Rng, n: number): Float32Array {
  const a = new Float32Array(n * n);
  for (let i = 0; i < a.length; i++) a[i] = rng.next();
  return a;
}

/** Tileable fractal noise in 0..1. */
function fbm(grids: Float32Array[], sizes: number[], u: number, v: number): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  for (let o = 0; o < grids.length; o++) {
    const n = sizes[o];
    const x = u * n;
    const y = v * n;
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const g = (ix: number, iy: number) => grids[o][((iy % n) + n) % n * n + (((ix % n) + n) % n)];
    const top = g(x0, y0) * (1 - sx) + g(x0 + 1, y0) * sx;
    const bot = g(x0, y0 + 1) * (1 - sx) + g(x0 + 1, y0 + 1) * sx;
    sum += (top * (1 - sy) + bot * sy) * amp;
    norm += amp;
    amp *= 0.5;
  }
  return sum / norm;
}

function tex(c: HTMLCanvasElement, repeatX = 1, repeatY = 1, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

/** Ground detail: soil, moss and leaf litter speckles in greys, tinted by vertex colours. Also used as the bump map. */
export function groundTexture(seed: number, repeatX: number, repeatY: number): THREE.CanvasTexture {
  const S = 256;
  const rng = new Rng(seed);
  const sizes = [4, 8, 16, 32, 64];
  const grids = sizes.map((n) => valueNoise(rng, n));
  const [c, g] = canvas(S, S);
  const img = g.createImageData(S, S);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const n = fbm(grids, sizes, x / S, y / S);
      const v = 90 + n * 150;
      const i = (y * S + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  // fallen needles and leaves
  for (let i = 0; i < 900; i++) {
    const v = Math.floor(rng.range(70, 210));
    g.save();
    g.translate(rng.range(0, S), rng.range(0, S));
    g.rotate(rng.range(0, 6.28));
    g.fillStyle = `rgba(${v},${v},${v},0.7)`;
    g.fillRect(0, 0, rng.range(2, 7), rng.range(0.8, 1.6));
    g.restore();
  }
  return tex(c, repeatX, repeatY);
}

export function barkTexture(seed: number, birch = false): THREE.CanvasTexture {
  const rng = new Rng(seed);
  const [c, g] = canvas(128, 256);
  const col = new Float32Array(128);
  for (let x = 0; x < 128; x++) col[x] = rng.next();
  const img = g.createImageData(128, 256);
  for (let y = 0; y < 256; y++)
    for (let x = 0; x < 128; x++) {
      const stripe = 0.5 + 0.5 * Math.sin(x * 0.55 + col[(x >> 2) << 2] * 6 + Math.sin(y * 0.03 + x * 0.1) * 1.4);
      const grain = col[(x * 7 + y) % 128];
      let v = birch ? 215 - stripe * 25 - grain * 20 : 70 + stripe * 90 + grain * 40;
      if (birch && ((y * 5 + (x >> 3) * 37) % 41 < 3) && grain > 0.35) v = 40; // dark birch marks
      const i = (y * 128 + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  return tex(c, 2, 1.5);
}

/** Alpha-cut grass blades. */
export function grassTexture(): THREE.CanvasTexture {
  const rng = new Rng(5);
  const [c, g] = canvas(128, 128);
  for (let i = 0; i < 16; i++) {
    const x = 12 + (i / 15) * 104 + rng.range(-5, 5);
    const h = rng.range(60, 122);
    const lean = rng.range(-22, 22);
    const w = rng.range(3, 6);
    const shade = rng.range(0.55, 1);
    const grad = g.createLinearGradient(0, 128, 0, 128 - h);
    grad.addColorStop(0, `rgb(${40 * shade},${70 * shade},${28 * shade})`);
    grad.addColorStop(1, `rgb(${150 * shade},${190 * shade},${70 * shade})`);
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(x - w, 128);
    g.quadraticCurveTo(x - w * 0.4 + lean * 0.4, 128 - h * 0.6, x + lean, 128 - h);
    g.quadraticCurveTo(x + w * 0.4 + lean * 0.4, 128 - h * 0.6, x + w, 128);
    g.closePath();
    g.fill();
  }
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

export function fernTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(64, 128);
  g.strokeStyle = '#5c9a3a';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(32, 128);
  g.quadraticCurveTo(30, 64, 32, 4);
  g.stroke();
  for (let i = 0; i < 22; i++) {
    const y = 120 - i * 5.2;
    const len = 26 * Math.sin((i / 22) * Math.PI * 0.9 + 0.3) + 4;
    const grad = g.createLinearGradient(32, y, 32 + len, y - 6);
    grad.addColorStop(0, '#3f7a28');
    grad.addColorStop(1, '#8cc455');
    g.strokeStyle = grad;
    g.lineWidth = 2.2;
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(32, y);
      g.quadraticCurveTo(32 + s * len * 0.6, y - 2, 32 + s * len, y - 7);
      g.stroke();
    }
  }
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** Fur / foliage grain: a soft noise used as the colour map on animals and tree crowns. */
export function grainTexture(seed: number, contrast = 0.35): THREE.CanvasTexture {
  const rng = new Rng(seed);
  const sizes = [8, 16, 32];
  const grids = sizes.map((n) => valueNoise(rng, n));
  const S = 128;
  const [c, g] = canvas(S, S);
  const img = g.createImageData(S, S);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const n = fbm(grids, sizes, x / S, y / S);
      const sp = rng.next() * 0.25;
      const v = Math.max(0, Math.min(255, 255 * (1 - contrast + contrast * (n * 1.4 + sp))));
      const i = (y * S + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  return tex(c, 2, 2);
}
