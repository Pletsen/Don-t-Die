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
}
