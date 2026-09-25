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
}
