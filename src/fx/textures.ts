import type Phaser from 'phaser';

// Every image in the game is painted here with the Canvas 2D API when the game
// boots, then uploaded to the GPU as a Phaser texture. Textures are painted at
// 4x their on-screen size so they stay crisp when the camera zooms in.

type Painter = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

function paint(scene: Phaser.Scene, key: string, w: number, h: number, draw: Painter) {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, w, h);
  if (!tex) return;
  const ctx = tex.getContext();
  draw(ctx, w, h);
  tex.refresh();
}

export const TEX = {
  glow: 'glow',
  spark: 'spark',
  streak: 'streak',
  orb: 'orb',
  ring: 'ring',
  saw: 'saw',
  bomb: 'bomb',
  shard: 'shard',
  planet: 'planet',
  ufo: 'ufo',
  whale: 'whale',
  astronaut: 'astronaut',
  warpStar: 'warpStar',
  duck: 'duck',
  duckRed: 'duckRed',
  duckGold: 'duckGold',
  pizza: 'pizza',
  disco: 'disco',
  vignette: 'vignette',
} as const;

export function createTextures(scene: Phaser.Scene) {
  // Soft round light. Tinted and blended additively, it becomes halos,
  // trails and glows of any colour.
  paint(scene, TEX.glow, 128, 128, (ctx, w) => {
    const r = w / 2;
    const g = ctx.createRadialGradient(r, r, 0, r, r, r);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.18, 'rgba(255,255,255,0.75)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.22)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, w);
  });

  // Vignette: clear in the middle, easing into the background colour at the
  // edges. Stretched over the whole screen, so it becomes an ellipse that
  // fits any phone. The corners of the square are sqrt(2) from the centre,
  // so the gradient runs out to there.
  paint(scene, TEX.vignette, 256, 256, (ctx, w) => {
    const r = w / 2;
    const g = ctx.createRadialGradient(r, r, 0, r, r, r * Math.SQRT2);
    g.addColorStop(0, 'rgba(5,7,10,0)');
    g.addColorStop(0.4, 'rgba(5,7,10,0)');
    g.addColorStop(0.58, 'rgba(5,7,10,0.3)');
    g.addColorStop(0.78, 'rgba(5,7,10,0.66)');
    g.addColorStop(1, 'rgba(5,7,10,0.92)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, w);
  });

  // Small hot particle with a bright centre.
  paint(scene, TEX.spark, 32, 32, (ctx, w) => {
    const r = w / 2;
    const g = ctx.createRadialGradient(r, r, 0, r, r, r);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.8)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, w);
  });

  // Elongated light for energy pulses running along the corridor.
  paint(scene, TEX.streak, 128, 32, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.75, 'rgba(255,255,255,0.9)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(w / 2, h / 2, w / 2, h / 4, 0, 0, Math.PI * 2);
    ctx.fill();
  });

  // The player: a glossy bead of light.
  paint(scene, TEX.orb, 96, 96, (ctx, w) => {
    const r = w / 2;
    const body = ctx.createRadialGradient(r * 0.72, r * 0.68, r * 0.05, r, r, r * 0.92);
    body.addColorStop(0, '#ffffff');
    body.addColorStop(0.4, '#eaf6ff');
    body.addColorStop(0.85, '#7fd6ee');
    body.addColorStop(1, '#2be8ff');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(r, r, r * 0.92, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.ellipse(r * 0.7, r * 0.64, r * 0.22, r * 0.13, -0.6, 0, Math.PI * 2);
    ctx.fill();
  });

  // Thin ring, used for the player's orbit and shockwaves.
  paint(scene, TEX.ring, 256, 256, (ctx, w) => {
    const r = w / 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(r, r, r - 12, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,1)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(r, r, r - 12, 0, Math.PI * 2);
    ctx.stroke();
  });

  // Spinning saw blade.
  paint(scene, TEX.saw, 128, 128, (ctx, w) => {
    const r = w / 2;
    const teeth = 10;
    const g = ctx.createRadialGradient(r * 0.75, r * 0.7, r * 0.1, r, r, r);
    g.addColorStop(0, '#fff1f8');
    g.addColorStop(0.3, '#ff8ecb');
    g.addColorStop(0.75, '#e0217f');
    g.addColorStop(1, '#6a0a3e');
    ctx.fillStyle = g;
    ctx.beginPath();
    for (let i = 0; i < teeth; i++) {
      const a1 = (i / teeth) * Math.PI * 2;
      const a2 = a1 + (Math.PI / teeth) * 0.35;
      const a3 = a1 + Math.PI / teeth;
      ctx.lineTo(r + Math.cos(a1) * r * 0.62, r + Math.sin(a1) * r * 0.62);
      ctx.lineTo(r + Math.cos(a2) * r * 0.98, r + Math.sin(a2) * r * 0.98);
      ctx.lineTo(r + Math.cos(a3) * r * 0.66, r + Math.sin(a3) * r * 0.66);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,220,240,0.7)';
    ctx.lineWidth = 2;
    ctx.stroke();
    // Hub and bolt holes.
    ctx.fillStyle = '#2a0418';
    ctx.beginPath();
    ctx.arc(r, r, r * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffb3d9';
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(r + Math.cos(a) * r * 0.4, r + Math.sin(a) * r * 0.4, r * 0.06, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  // Bomb: hot orange sphere with a dark band.
  paint(scene, TEX.bomb, 128, 128, (ctx, w) => {
    const r = w / 2;
    const g = ctx.createRadialGradient(r * 0.7, r * 0.65, r * 0.05, r, r, r * 0.9);
    g.addColorStop(0, '#fff4df');
    g.addColorStop(0.3, '#ffb35c');
    g.addColorStop(0.75, '#e2600c');
    g.addColorStop(1, '#5a1502');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(r, r, r * 0.9, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.arc(r, r, r * 0.9, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = 'rgba(40,8,0,0.55)';
    ctx.fillRect(0, r - r * 0.12, w, r * 0.24);
    ctx.fillStyle = 'rgba(255,230,160,0.9)';
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.arc(r * 0.3 + i * r * 0.35, r, r * 0.045, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.ellipse(r * 0.66, r * 0.55, r * 0.2, r * 0.1, -0.6, 0, Math.PI * 2);
    ctx.fill();
  });

  // Sharp triangle debris for explosions.
  paint(scene, TEX.shard, 32, 32, (ctx) => {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(16, 2);
    ctx.lineTo(30, 28);
    ctx.lineTo(4, 22);
    ctx.closePath();
    ctx.fill();
  });
  // --- Background visitors (see fx/BackgroundEvents.ts) ------------------

  // Ringed gas giant, painted white-ish so it can be tinted per world.
  paint(scene, TEX.planet, 320, 200, (ctx, w, h) => {
    const cx = w / 2;
    const cy = h / 2;
    const r = 62;
    const ring = (front: boolean) => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-0.28);
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 2.1, r * 0.5, 0, front ? 0 : Math.PI, front ? Math.PI : Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = 7;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 16;
      ctx.stroke();
      ctx.restore();
    };
    ring(false);
    const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.55, '#b9c4d0');
    g.addColorStop(1, '#3a4450');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    for (let i = -3; i <= 3; i++) ctx.fillRect(cx - r, cy + i * 17 - 4, r * 2, 7);
    ctx.restore();
    ring(true);
  });

  // Flying saucer with a glass dome and a row of lights.
  paint(scene, TEX.ufo, 160, 90, (ctx, w) => {
    const cx = w / 2;
    ctx.fillStyle = 'rgba(160,255,240,0.55)';
    ctx.beginPath();
    ctx.ellipse(cx, 38, 26, 22, 0, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.ellipse(cx - 8, 28, 7, 5, -0.5, 0, Math.PI * 2);
    ctx.fill();
    const hull = ctx.createLinearGradient(0, 36, 0, 60);
    hull.addColorStop(0, '#e8eef5');
    hull.addColorStop(1, '#5a6573');
    ctx.fillStyle = hull;
    ctx.beginPath();
    ctx.ellipse(cx, 46, 70, 15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2a323c';
    ctx.beginPath();
    ctx.ellipse(cx, 55, 30, 6, 0, 0, Math.PI * 2);
    ctx.fill();
  });

  // Neon line-art whale. Drawn with a canvas glow so it reads as light.
  paint(scene, TEX.whale, 300, 160, (ctx) => {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const draw = () => {
      ctx.beginPath();
      ctx.moveTo(236, 84);
      ctx.bezierCurveTo(236, 44, 168, 34, 120, 46);
      ctx.bezierCurveTo(86, 54, 62, 70, 44, 76);
      ctx.lineTo(16, 54);
      ctx.lineTo(28, 80);
      ctx.lineTo(14, 108);
      ctx.lineTo(46, 90);
      ctx.bezierCurveTo(74, 106, 130, 120, 176, 116);
      ctx.bezierCurveTo(218, 112, 236, 102, 236, 84);
      ctx.stroke();
      // Flipper.
      ctx.beginPath();
      ctx.moveTo(150, 112);
      ctx.lineTo(134, 138);
      ctx.lineTo(166, 116);
      ctx.stroke();
      // Throat grooves.
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(172 + i * 6, 104 - i * 1.5);
        ctx.lineTo(226 - i * 2, 96 - i * 3);
        ctx.stroke();
      }
    };
    ctx.strokeStyle = '#ffffff';
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 8;
    ctx.lineWidth = 3;
    draw();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(206, 74, 3.5, 0, Math.PI * 2);
    ctx.fill();
  });

  // Tiny astronaut.
  paint(scene, TEX.astronaut, 64, 80, (ctx) => {
    ctx.fillStyle = '#e9eef4';
    ctx.strokeStyle = '#9aa6b3';
    ctx.lineWidth = 2;
    const round = (x: number, y: number, w: number, h: number, r: number) => {
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, r);
      ctx.fill();
      ctx.stroke();
    };
    round(10, 30, 10, 26, 5); // left arm
    round(44, 30, 10, 26, 5); // right arm
    round(20, 54, 10, 22, 5); // legs
    round(34, 54, 10, 22, 5);
    round(18, 28, 28, 32, 8); // torso
    round(38, 34, 14, 20, 4); // backpack peeking out
    ctx.beginPath();
    ctx.arc(32, 20, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    const visor = ctx.createLinearGradient(20, 12, 44, 28);
    visor.addColorStop(0, '#2be8ff');
    visor.addColorStop(1, '#0b3a52');
    ctx.fillStyle = visor;
    ctx.beginPath();
    ctx.ellipse(33, 20, 11, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath();
    ctx.ellipse(28, 17, 3.5, 2, -0.5, 0, Math.PI * 2);
    ctx.fill();
  });
  // --- The warp star and the bonus universe --------------------------------

  // Tiny star: white-hot centre fading to gold. Tinted rainbow in game.
  paint(scene, TEX.warpStar, 64, 64, (ctx, w) => {
    const c = w / 2;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? c * 0.95 : c * 0.42;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      ctx.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r);
    }
    ctx.closePath();
    const g = ctx.createRadialGradient(c, c, 0, c, c, c);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.5, '#fff6c2');
    g.addColorStop(1, '#ffc93a');
    ctx.fillStyle = g;
    ctx.fill();
  });

  // Rubber duck, facing right.
  // Rubber ducks: plain yellow, the red runner and the golden king. Painted
  // at twice the size they are shown (DUCK_RES), so they stay crisp on
  // retina screens and when the camera zooms in.
  paint(scene, TEX.duck, 96 * DUCK_RES, 84 * DUCK_RES, (ctx) => paintDuck(ctx, DUCKS.normal));
  paint(scene, TEX.duckRed, 96 * DUCK_RES, 84 * DUCK_RES, (ctx) => paintDuck(ctx, DUCKS.red));
  paint(scene, TEX.duckGold, 96 * DUCK_RES, 84 * DUCK_RES, (ctx) => paintDuck(ctx, DUCKS.golden));

  // Pizza slice wearing sunglasses.
  paint(scene, TEX.pizza, 110, 110, (ctx) => {
    ctx.beginPath();
    ctx.moveTo(10, 16);
    ctx.lineTo(100, 16);
    ctx.lineTo(55, 104);
    ctx.closePath();
    ctx.fillStyle = '#ffcf5a';
    ctx.fill();
    ctx.fillStyle = '#d9822b'; // crust
    ctx.beginPath();
    ctx.roundRect(6, 8, 98, 14, 7);
    ctx.fill();
    ctx.fillStyle = '#d6333f'; // pepperoni
    for (const [x, y, r] of [[34, 44, 7], [70, 40, 8], [55, 72, 6]] as const) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#111111'; // sunglasses
    ctx.beginPath();
    ctx.roundRect(30, 30, 20, 11, 4);
    ctx.roundRect(58, 30, 20, 11, 4);
    ctx.fill();
    ctx.fillRect(48, 33, 12, 3);
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(55, 52, 9, 0.2, Math.PI - 0.2); // smile
    ctx.stroke();
  });

  // Disco ball.
  paint(scene, TEX.disco, 96, 96, (ctx, w) => {
    const c = w / 2;
    const r = c - 4;
    const g = ctx.createRadialGradient(c - 12, c - 14, 4, c, c, r);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.6, '#a9b6c4');
    g.addColorStop(1, '#4a5663');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(c, c, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = 'rgba(30,40,50,0.55)';
    ctx.lineWidth = 1.2;
    for (let i = -r; i <= r; i += 9) {
      ctx.beginPath();
      ctx.moveTo(c - r, c + i);
      ctx.lineTo(c + r, c + i);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(c, c, Math.abs(i) + 1, r, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    for (let i = 0; i < 9; i++) ctx.fillRect(c - 20 + ((i * 13) % 34), c - 22 + ((i * 7) % 30), 5, 5);
    ctx.restore();
  });
}

/** Duck textures are painted at this multiple of their 96 px design size. */
export const DUCK_RES = 2;

interface DuckLook {
  light: string;
  base: string;
  shade: string;
  outline: string;
  beak: string;
  beakShade: string;
  extra: 'none' | 'headband' | 'crown';
}

const DUCKS: Record<'normal' | 'red' | 'golden', DuckLook> = {
  normal: { light: '#fff3a0', base: '#ffd21f', shade: '#e0a200', outline: '#8a5a00', beak: '#ff9a2e', beakShade: '#d9621a', extra: 'none' },
  // The runner: bright red with a sweatband, because it never stops moving.
  red: { light: '#ff9a8a', base: '#ff3b30', shade: '#b8141c', outline: '#5c0610', beak: '#ffb02e', beakShade: '#d9731a', extra: 'headband' },
  // The golden king: polished metal and a crown.
  golden: { light: '#fffbe0', base: '#ffd84a', shade: '#c08a10', outline: '#6b4700', beak: '#ff8a1f', beakShade: '#c4520f', extra: 'crown' },
};

/**
 * A rubber duck in a 96 x 84 design space (scaled up by DUCK_RES): body and
 * head with a soft light-to-shadow gradient, a feathered wing, tail, a
 * two-part beak, a glossy eye and a highlight, all with a dark outline so it
 * reads at small sizes.
 */
function paintDuck(ctx: CanvasRenderingContext2D, c: DuckLook) {
  ctx.scale(DUCK_RES, DUCK_RES);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const shaded = (x: number, y: number, r: number) => {
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.45, r * 0.1, x, y, r * 1.1);
    g.addColorStop(0, c.light);
    g.addColorStop(0.45, c.base);
    g.addColorStop(1, c.shade);
    return g;
  };

  // Tail feather.
  ctx.fillStyle = c.base;
  ctx.strokeStyle = c.outline;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(16, 54);
  ctx.quadraticCurveTo(4, 44, 6, 32);
  ctx.quadraticCurveTo(16, 38, 24, 46);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Body.
  ctx.fillStyle = shaded(42, 56, 34);
  ctx.beginPath();
  ctx.ellipse(44, 58, 34, 20, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Wing: a darker teardrop with three feather lines.
  ctx.fillStyle = c.shade;
  ctx.globalAlpha = 0.55;
  ctx.beginPath();
  ctx.moveTo(24, 52);
  ctx.quadraticCurveTo(40, 40, 58, 52);
  ctx.quadraticCurveTo(44, 70, 24, 52);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = c.outline;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(24, 52);
  ctx.quadraticCurveTo(40, 40, 58, 52);
  ctx.quadraticCurveTo(44, 70, 24, 52);
  ctx.stroke();
  ctx.beginPath();
  for (const [x1, y1, x2, y2] of [
    [32, 55, 44, 53],
    [34, 59, 48, 56],
    [38, 62, 50, 59],
  ]) {
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
  }
  ctx.globalAlpha = 0.6;
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Head.
  ctx.lineWidth = 2.2;
  ctx.fillStyle = shaded(60, 30, 18);
  ctx.beginPath();
  ctx.arc(60, 30, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Beak: upper and lower half, so it looks like it could quack.
  ctx.lineWidth = 1.6;
  ctx.fillStyle = c.beakShade;
  ctx.beginPath();
  ctx.ellipse(80, 37, 10, 4, 0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = c.beak;
  ctx.beginPath();
  ctx.ellipse(81, 33, 11.5, 5, 0.05, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath();
  ctx.ellipse(80, 31.5, 5, 1.6, 0.05, 0, Math.PI * 2);
  ctx.fill();

  // Cheek blush.
  ctx.fillStyle = 'rgba(255,90,90,0.35)';
  ctx.beginPath();
  ctx.ellipse(66, 37, 4.5, 2.8, 0, 0, Math.PI * 2);
  ctx.fill();

  // Eye: white, pupil, two glints.
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = c.outline;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.ellipse(66, 25, 5, 5.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#16181c';
  ctx.beginPath();
  ctx.arc(67.4, 25.6, 3.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(68.6, 24.2, 1.2, 0, Math.PI * 2);
  ctx.arc(66.4, 27.2, 0.6, 0, Math.PI * 2);
  ctx.fill();

  if (c.extra === 'headband') {
    // Sweatband across the forehead, above the eye.
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = c.outline;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(45, 17);
    ctx.quadraticCurveTo(60, 7, 75, 14);
    ctx.lineTo(76.5, 18.5);
    ctx.quadraticCurveTo(60, 11.5, 44, 21.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#2be8ff';
    ctx.fillRect(57, 11.2, 6, 3);
    // The loose ends of the band flutter behind.
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(45.5, 18);
    ctx.lineTo(35, 13);
    ctx.lineTo(36, 19);
    ctx.lineTo(44.5, 21);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (c.extra === 'crown') {
    // Crown with three points and gems.
    const g = ctx.createLinearGradient(48, 4, 72, 18);
    g.addColorStop(0, '#fff6c0');
    g.addColorStop(0.5, '#ffc21a');
    g.addColorStop(1, '#b37400');
    ctx.fillStyle = g;
    ctx.strokeStyle = c.outline;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(48, 16);
    ctx.lineTo(47, 4);
    ctx.lineTo(54, 10);
    ctx.lineTo(60, 1);
    ctx.lineTo(66, 10);
    ctx.lineTo(73, 4);
    ctx.lineTo(72, 16);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ff2f9e';
    ctx.beginPath();
    ctx.arc(60, 12, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2be8ff';
    ctx.beginPath();
    ctx.arc(52, 13, 1.4, 0, Math.PI * 2);
    ctx.arc(68, 13, 1.4, 0, Math.PI * 2);
    ctx.fill();
    // Sparkles on the polished body.
    ctx.fillStyle = '#ffffff';
    for (const [x, y, r] of [
      [30, 50, 2.4],
      [54, 64, 1.6],
      [50, 22, 1.8],
    ]) {
      ctx.beginPath();
      ctx.moveTo(x, y - r * 2);
      ctx.lineTo(x + r * 0.5, y - r * 0.5);
      ctx.lineTo(x + r * 2, y);
      ctx.lineTo(x + r * 0.5, y + r * 0.5);
      ctx.lineTo(x, y + r * 2);
      ctx.lineTo(x - r * 0.5, y + r * 0.5);
      ctx.lineTo(x - r * 2, y);
      ctx.lineTo(x - r * 0.5, y - r * 0.5);
      ctx.closePath();
      ctx.fill();
    }
  }

  // Glossy highlights on body and head.
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.beginPath();
  ctx.ellipse(34, 48, 11, 3.6, -0.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(53, 22, 4.5, 2.2, -0.6, 0, Math.PI * 2);
  ctx.fill();
}
