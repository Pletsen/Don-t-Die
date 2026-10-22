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

/**
 * Leaf atlas for the crown cards: left half a broadleaf cluster, right half a needle spray. Grey values, tinted
 * by the per-tree instance colour. Alpha-cut.
 */
export function leafAtlas(): THREE.CanvasTexture {
  const rng = new Rng(41);
  const [c, g] = canvas(256, 128);
  // broadleaf cluster: overlapping ellipses with a midrib
  for (let i = 0; i < 90; i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = Math.sqrt(rng.next()) * 50;
    const x = 64 + Math.cos(a) * r;
    const y = 64 + Math.sin(a) * r;
    const v = Math.floor(rng.range(120, 235));
    g.save();
    g.translate(x, y);
    g.rotate(a + rng.range(-0.8, 0.8));
    g.fillStyle = `rgb(${v},${v},${Math.floor(v * 0.92)})`;
    g.beginPath();
    g.ellipse(0, 0, rng.range(6, 10), rng.range(3.2, 5), 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = `rgba(40,40,30,0.35)`;
    g.lineWidth = 0.8;
    g.beginPath();
    g.moveTo(-8, 0);
    g.lineTo(8, 0);
    g.stroke();
    g.restore();
  }
  // needle spray: a twig with many thin needles, fanning out and drooping
  g.save();
  g.translate(128, 0);
  for (let b = 0; b < 5; b++) {
    const x0 = 64 + rng.range(-10, 10);
    const ang = -Math.PI / 2 + (b - 2) * 0.32;
    const len = rng.range(70, 110);
    for (let k = 0; k < 46; k++) {
      const t = k / 46;
      const px = x0 + Math.cos(ang) * len * t;
      const py = 124 + Math.sin(ang) * len * t;
      const v = Math.floor(rng.range(90, 200));
      g.strokeStyle = `rgb(${v},${v},${Math.floor(v * 0.9)})`;
      g.lineWidth = 1.6;
      for (const s of [-1, 1]) {
        const na = ang + s * rng.range(0.6, 1.1);
        const nl = (1 - t * 0.6) * rng.range(10, 18);
        g.beginPath();
        g.moveTo(px, py);
        g.lineTo(px + Math.cos(na) * nl, py + Math.sin(na) * nl);
        g.stroke();
      }
    }
  }
  g.restore();
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

const cache = new Map<string, THREE.Texture>();

/** Soft round dot (white, alpha falloff) for particles, glints and smoke. Shared and cached. */
export function softDot(hard = 0.0): THREE.Texture {
  const key = 'dot' + hard;
  let t = cache.get(key);
  if (t) return t;
  const [c, g] = canvas(64, 64);
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(Math.max(0.05, hard), 'rgba(255,255,255,0.85)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  t = new THREE.CanvasTexture(c);
  cache.set(key, t);
  return t;
}

/** Soft puffy smoke blob (noisy, alpha). Shared and cached. */
export function smokeTexture(): THREE.Texture {
  let t = cache.get('smoke');
  if (t) return t;
  const rng = new Rng(8);
  const [c, g] = canvas(64, 64);
  for (let i = 0; i < 26; i++) {
    const x = 32 + rng.range(-12, 12);
    const y = 32 + rng.range(-12, 12);
    const r = rng.range(8, 18);
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,0.22)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
  }
  t = new THREE.CanvasTexture(c);
  cache.set('smoke', t);
  return t;
}

/** Four-point star glint for loot. Shared and cached. */
export function glintTexture(): THREE.Texture {
  let t = cache.get('glint');
  if (t) return t;
  const [c, g] = canvas(64, 64);
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 10);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  for (const [dx, dy] of [[1, 0], [0, 1]]) {
    const lg = g.createLinearGradient(32 - dx * 32, 32 - dy * 32, 32 + dx * 32, 32 + dy * 32);
    lg.addColorStop(0, 'rgba(255,255,255,0)');
    lg.addColorStop(0.5, 'rgba(255,255,255,0.95)');
    lg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = lg;
    if (dx) g.fillRect(0, 31, 64, 2);
    else g.fillRect(31, 0, 2, 64);
  }
  t = new THREE.CanvasTexture(c);
  cache.set('glint', t);
  return t;
}

/** Raw meat: dark red with pale fat streaks. Shared and cached. */
export function meatTexture(): THREE.Texture {
  let t = cache.get('meat');
  if (t) return t;
  const rng = new Rng(13);
  const [c, g] = canvas(64, 64);
  g.fillStyle = '#7a1e18';
  g.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 14; i++) {
    g.strokeStyle = `rgba(235,215,190,${rng.range(0.25, 0.6)})`;
    g.lineWidth = rng.range(0.6, 2);
    g.beginPath();
    let x = rng.range(0, 64);
    let y = rng.range(0, 64);
    g.moveTo(x, y);
    for (let k = 0; k < 4; k++) {
      x += rng.range(-14, 14);
      y += rng.range(-6, 6);
      g.lineTo(x, y);
    }
    g.stroke();
  }
  const tx = new THREE.CanvasTexture(c);
  tx.colorSpace = THREE.SRGBColorSpace;
  cache.set('meat', tx);
  return tx;
}
