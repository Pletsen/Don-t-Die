import Phaser from 'phaser';
import { shared } from '../game/shared';
import { display } from '../game/display';
import { fonts } from '../game/palette';
import { TEX, DUCK_RES } from './textures';
import { sfx } from '../audio/Sfx';
import { mix, u2Color } from './worldPalette';
import { WTEX, createWorldTextures } from './worldTextures';

/**
 * Little things happening far away behind the track: shooting stars, a
 * drifting planet, a UFO that stops to beam something up, a tumbling
 * astronaut who says hi, and (rarely) a neon space whale.
 *
 * Each visitor lives in its own "layer space" and is drawn with parallax
 * factor `p`: 0 would stay glued to the screen, 1 would move with the track.
 * Small values make things feel very far away.
 */
interface Visitor {
  kind: 'star' | 'planet' | 'ufo' | 'astronaut' | 'whale' | 'duck' | 'pizza' | 'disco' | 'words';
  obj: Phaser.GameObjects.Container;
  p: number;
  lx: number;
  ly: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  tick?: (v: Visitor, dt: number, t: number) => void;
}

const rand = Phaser.Math.FloatBetween;
const DEPTH = -50;
/** Far-away things are tinted toward this deep space blue, not toward white. */
const SPACE = 0x2a3a52;

export class BackgroundEvents {
  private visitors: Visitor[] = [];
  private nextAt = 2;
  private clock = 0;
  private cx = 0;
  private cy = 0;
  private vw = 400;
  private vh = 800;
  private party = false;

  constructor(private scene: Phaser.Scene) {
    createWorldTextures(scene);
  }

  /**
   * Bonus universe on/off. On: a disco ball appears and silly things show up
   * much more often. Off: the party guests are cleared away.
   */
  setParty(on: boolean) {
    if (on === this.party) return;
    this.party = on;
    if (on) {
      this.disco();
      this.nextAt = this.clock + 0.6;
    } else {
      this.visitors = this.visitors.filter((v) => {
        const partyGuest = v.kind === 'duck' || v.kind === 'pizza' || v.kind === 'disco' || v.kind === 'words';
        if (partyGuest) v.obj.destroy();
        return !partyGuest;
      });
    }
  }

  private has(kind: Visitor['kind']) {
    return this.visitors.some((v) => v.kind === kind);
  }

  /** Place something at an offset from the screen centre (world units). */
  private add(v: Omit<Visitor, 'lx' | 'ly' | 'age'> & { ox: number; oy: number }): Visitor {
    const visitor: Visitor = { ...v, lx: v.ox + this.cx * v.p, ly: v.oy + this.cy * v.p, age: 0 };
    visitor.obj.setDepth(DEPTH);
    this.visitors.push(visitor);
    this.place(visitor);
    return visitor;
  }

  private place(v: Visitor) {
    v.obj.setPosition(this.cx + (v.lx - this.cx * v.p), this.cy + (v.ly - this.cy * v.p));
  }

  update(camX: number, camY: number, cam: Phaser.Cameras.Scene2D.Camera, dt: number, t: number, fxReduced: boolean) {
    this.cx = camX;
    this.cy = camY;
    this.vw = cam.width / cam.zoom;
    this.vh = cam.height / cam.zoom;
    this.clock += dt;

    if (this.clock >= this.nextAt) {
      if (this.party) {
        this.spawnPartyThing();
        this.nextAt = this.clock + rand(1, 2.2) * (fxReduced ? 2 : 1);
      } else {
        this.spawnSomething();
        this.nextAt = this.clock + rand(3.5, 7) * (fxReduced ? 2 : 1);
      }
    }

    for (const v of this.visitors) {
      v.age += dt;
      v.lx += v.vx * dt;
      v.ly += v.vy * dt;
      v.tick?.(v, dt, t);
      this.place(v);
    }
    // Drop the ones whose time is up, in place (no new array every frame).
    let keep = 0;
    for (let i = 0; i < this.visitors.length; i++) {
      const v = this.visitors[i];
      if (v.age < v.life) this.visitors[keep++] = v;
      else v.obj.destroy();
    }
    this.visitors.length = keep;
  }

  private spawnSomething() {
    const r = Math.random();
    if (!this.has('planet') && (r < 0.15 || this.clock < 3)) return this.planet(this.clock < 3);
    if (r < 0.32 && !this.has('ufo')) return this.ufo();
    if (r < 0.45 && !this.has('astronaut')) return this.astronaut();
    if (r < 0.55 && !this.has('whale')) return this.whale();
    if (Math.random() < 0.15) {
      // Meteor shower.
      sfx.shimmer();
      for (let i = 0; i < 6; i++) this.scene.time.delayedCall(i * rand(120, 320), () => this.shootingStar());
    } else {
      sfx.shimmer();
      this.shootingStar();
    }
  }

  private shootingStar() {
    const dir = Math.random() < 0.5 ? -1 : 1;
    const angle = Math.PI / 2 - dir * rand(0.5, 0.9);
    const speed = rand(900, 1300);
    const trail = this.scene.add
      .image(-60, 0, TEX.streak)
      .setScale(1.6, 0.28)
      .setTint(0xfff3dd)
      .setBlendMode(Phaser.BlendModes.ADD);
    const head = this.scene.add.image(0, 0, TEX.spark).setScale(0.5).setBlendMode(Phaser.BlendModes.ADD);
    const obj = this.scene.add.container(0, 0, [trail, head]).setRotation(angle);
    this.add({
      kind: 'star',
      obj,
      p: 0.1,
      ox: rand(-0.5, 0.5) * this.vw - Math.cos(angle) * 200,
      oy: -this.vh * rand(0.25, 0.5),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: rand(0.7, 1.1),
      tick: (v) => v.obj.setAlpha(Math.sin((Math.PI * v.age) / v.life)),
    });
  }

  private planet(startInView: boolean) {
    const dir = Math.random() < 0.5 ? -1 : 1;
    // Kept small and dim, and tinted toward deep space, so it reads as far
    // away and never competes with the track.
    const img = this.scene.add.image(0, 0, TEX.planet).setAlpha(0.3);
    const obj = this.scene.add.container(0, 0, [img]).setScale(rand(0.45, 0.7));
    let tinted = -1;
    const speed = rand(10, 16);
    const edge = this.vw / 2 + 240;
    this.add({
      kind: 'planet',
      obj,
      p: 0.03,
      ox: startInView ? rand(-0.3, 0.3) * this.vw : -dir * edge,
      oy: rand(-0.35, 0.25) * this.vh,
      vx: dir * speed,
      vy: 0,
      life: (edge * 2) / speed,
      tick: () => {
        if (shared.accent === tinted) return;
        tinted = shared.accent;
        img.setTint(mix(shared.accent, SPACE, 0.45));
      },
    });
  }

  private ufo() {
    const dir = Math.random() < 0.5 ? -1 : 1;
    const beam = this.scene.add.graphics();
    beam.fillStyle(0xa0fff0, 0.16);
    beam.beginPath();
    beam.moveTo(-9, 16);
    beam.lineTo(9, 16);
    beam.lineTo(46, 150);
    beam.lineTo(-46, 150);
    beam.closePath();
    beam.fillPath();
    beam.lineStyle(1.5, 0xa0fff0, 0.35);
    beam.lineBetween(-9, 16, -46, 150);
    beam.lineBetween(9, 16, 46, 150);
    beam.setAlpha(0);
    const body = this.scene.add.image(0, 0, TEX.ufo).setScale(0.5);
    const lights = [-24, -8, 8, 24].map((x) =>
      this.scene.add.image(x, 6, TEX.glow).setScale(0.09).setBlendMode(Phaser.BlendModes.ADD),
    );
    const obj = this.scene.add.container(0, 0, [beam, body, ...lights]);
    const cruise = 170;
    const hoverAt = ((this.vw / 2 + 120) / cruise) * rand(0.7, 1.15);
    let beeped = false;
    this.add({
      kind: 'ufo',
      obj,
      p: 0.3,
      ox: -dir * (this.vw / 2 + 120),
      oy: -this.vh * rand(0.15, 0.38),
      vx: dir * cruise,
      vy: 0,
      life: hoverAt + 1.8 + 2.5,
      tick: (v, _dt, t) => {
        // Cruise in, stop and beam for a moment, then zip away.
        const hovering = v.age > hoverAt && v.age < hoverAt + 1.8;
        if (hovering && !beeped) {
          beeped = true;
          sfx.ufo();
        }
        const leaving = v.age >= hoverAt + 1.8;
        v.vx = hovering ? 0 : leaving ? dir * 720 : dir * cruise;
        v.vy = leaving ? -90 : 0;
        body.setY(Math.sin(t * 5) * 2.5);
        body.setRotation(hovering ? Math.sin(t * 3) * 0.05 : dir * (leaving ? 0.12 : 0.04));
        beam.setAlpha(hovering ? 0.6 + 0.4 * Math.sin(t * 18) : Math.max(0, beam.alpha - 0.1));
        lights.forEach((l, i) => {
          const on = Math.floor(t * 8 + i) % lights.length === 0;
          l.setTint(i % 2 ? 0xff2f9e : 0x2be8ff).setAlpha(on ? 1 : 0.25);
        });
      },
    });
  }

  private astronaut() {
    const dir = Math.random() < 0.5 ? -1 : 1;
    const suit = this.scene.add.image(0, 0, TEX.astronaut).setScale(0.42);
    const hi = this.scene.add
      .text(18, -28, 'HI!', {
        fontFamily: fonts.display,
        fontStyle: '700',
        fontSize: '11px',
        color: '#eaf6ff',
        resolution: display.dpr,
      })
      .setAlpha(0);
    const obj = this.scene.add.container(0, 0, [suit, hi]);
    const speed = rand(22, 32);
    const edge = this.vw / 2 + 60;
    const sayAt = rand(0.35, 0.55);
    this.add({
      kind: 'astronaut',
      obj,
      p: 0.22,
      ox: -dir * edge,
      oy: rand(-0.4, 0.3) * this.vh,
      vx: dir * speed,
      vy: rand(-6, 6),
      life: (edge * 2) / speed,
      tick: (v, dt) => {
        suit.rotation += dt * 0.6 * dir;
        const k = v.age / v.life;
        hi.setAlpha(k > sayAt && k < sayAt + 0.12 ? 1 : 0);
      },
    });
  }

  private whale() {
    const dir = Math.random() < 0.5 ? -1 : 1;
    const art = this.scene.add.image(0, 0, TEX.whale).setAlpha(0.38).setFlipX(dir < 0);
    const obj = this.scene.add.container(0, 0, [art]).setScale(rand(0.9, 1.25));
    const speed = rand(26, 36);
    const edge = this.vw / 2 + 220;
    let nextSpout = 2;
    let sang = false;
    this.add({
      kind: 'whale',
      obj,
      p: 0.08,
      ox: -dir * edge,
      oy: rand(-0.3, 0.2) * this.vh,
      vx: dir * speed,
      vy: 0,
      life: (edge * 2) / speed,
      tick: (v, _dt, t) => {
        art.setY(Math.sin(t * 0.8) * 8).setRotation(Math.sin(t * 0.8 + 1) * 0.04);
        art.setTint(mix(shared.accent, SPACE, 0.3));
        if (!sang && v.age > v.life * 0.4) {
          sang = true;
          sfx.whaleSong();
        }
        if (v.age > nextSpout) {
          nextSpout = v.age + rand(3, 6);
          this.spout(obj, dir * 70, art.y - 40);
        }
      },
    });
  }

  // --- Bonus universe guests ----------------------------------------------

  private spawnPartyThing() {
    const r = Math.random();
    if (r < 0.3) this.floatingDuck();
    else if (r < 0.48 && !this.has('pizza')) this.pizza();
    else if (r < 0.7) this.words();
    else if (r < 0.8 && !this.has('whale')) this.whale();
    else if (r < 0.88 && !this.has('ufo')) this.ufo();
    else for (let i = 0; i < 4; i++) this.scene.time.delayedCall(i * 150, () => this.shootingStar());
  }

  /** Giant rubber duck bobbing past in the background. */
  private floatingDuck() {
    const dir = Math.random() < 0.5 ? -1 : 1;
    // Big, dim and tinted: clearly scenery, never mistaken for a duck to bonk.
    const img = this.scene.add.image(0, 0, TEX.duck).setScale(1 / DUCK_RES).setFlipX(dir < 0).setAlpha(0.5);
    img.setTint(mix(0xffffff, u2Color(this.clock), 0.35));
    const obj = this.scene.add.container(0, 0, [img]).setScale(rand(0.7, 1.2));
    const speed = rand(60, 110);
    const edge = this.vw / 2 + 80;
    this.add({
      kind: 'duck',
      obj,
      p: rand(0.12, 0.3),
      ox: -dir * edge,
      oy: rand(-0.45, 0.4) * this.vh,
      vx: dir * speed,
      vy: 0,
      life: (edge * 2) / speed,
      tick: (_v, _dt, t) => img.setY(Math.sin(t * 3) * 6).setRotation(Math.sin(t * 2.2) * 0.2),
    });
  }

  /** A pizza slice in sunglasses, flying past on a rainbow. */
  private pizza() {
    const dir = Math.random() < 0.5 ? -1 : 1;
    // Rainbow trail: 14 pre-painted stripe blocks that only bob up and down.
    const trail: Phaser.GameObjects.Image[] = [];
    for (let seg = 0; seg < 14; seg++) {
      trail.push(
        this.scene.add
          .image(-dir * (26 + seg * 16), 0, WTEX.rainbow)
          .setDisplaySize(17, 30)
          .setAlpha(0.85 * (1 - seg / 14)),
      );
    }
    const img = this.scene.add.image(0, 0, TEX.pizza).setScale(0.6).setFlipX(dir < 0);
    const obj = this.scene.add.container(0, 0, [...trail, img]);
    const speed = rand(220, 300);
    const edge = this.vw / 2 + 120;
    this.add({
      kind: 'pizza',
      obj,
      p: 0.25,
      ox: -dir * edge,
      oy: rand(-0.4, -0.1) * this.vh,
      vx: dir * speed,
      vy: 0,
      life: (edge * 2 + 400) / speed,
      tick: (_v, _dt, t) => {
        // Wavy rainbow stripes streaming out behind.
        for (let seg = 0; seg < trail.length; seg++) trail[seg].setY(Math.sin(t * 10 - seg * 0.9) * 4);
        img.setRotation(Math.sin(t * 6) * 0.2);
      },
    });
  }

  /** Disco ball hanging over everything, throwing light beams. */
  private disco() {
    // Eight light beams: stretched quads that only turn and change colour.
    const beams: Phaser.GameObjects.Image[] = [];
    for (let i = 0; i < 8; i++) {
      beams.push(this.scene.add.image(0, 0, WTEX.px).setOrigin(0, 0.5).setAlpha(0.1).setBlendMode(Phaser.BlendModes.ADD));
    }
    const ball = this.scene.add.image(0, 0, TEX.disco).setScale(0.55);
    const obj = this.scene.add.container(0, 0, [...beams, ball]).setScale(0);
    this.scene.tweens.add({ targets: obj, scale: 1, duration: 900, ease: 'Back.easeOut' });
    this.add({
      kind: 'disco',
      obj,
      p: 0,
      ox: 0,
      oy: -this.vh * 0.36,
      vx: 0,
      vy: 0,
      life: Infinity,
      tick: (v, _dt, t) => {
        // Glued to the top of the screen.
        v.ly = -this.vh * 0.36;
        for (let i = 0; i < 8; i++) {
          const a = t * 0.8 + (i * Math.PI * 2) / 8;
          const ex = Math.cos(a) * 900;
          const ey = Math.abs(Math.sin(a)) * 900 + 100;
          beams[i]
            .setRotation(Math.atan2(ey, ex))
            .setDisplaySize(Math.hypot(ex, ey), 10)
            .setTint(u2Color(t * 0.85, i * 45));
        }
        ball.setRotation(Math.sin(t) * 0.1);
      },
    });
  }

  /** Big silly messages drifting through space. */
  private words() {
    const lines = [
      'HELLO FROM UNIVERSE 2',
      'IS THIS EVEN LEGAL?',
      'NO THOUGHTS. JUST VIBES.',
      'DUCK SEASON',
      'WHEEEEEE',
      'YOU FOUND THE STAR!',
      'PIZZA IS A VEGETABLE HERE',
      'GRAVITY IS OPTIONAL',
      'BONUS DIMENSION',
      'BE THE DUCK',
    ];
    const text = this.scene.add
      .text(0, 0, lines[Math.floor(Math.random() * lines.length)], {
        fontFamily: fonts.display,
        fontStyle: '700',
        fontSize: '30px',
        color: '#ffffff',
        resolution: display.dpr,
      })
      .setOrigin(0.5)
      .setAlpha(0);
    const obj = this.scene.add.container(0, 0, [text]).setRotation(rand(-0.15, 0.15));
    this.add({
      kind: 'words',
      obj,
      p: 0.08,
      ox: rand(-0.25, 0.25) * this.vw,
      oy: rand(-0.4, 0.4) * this.vh,
      vx: rand(-20, 20),
      vy: rand(-15, 15),
      life: 3.2,
      tick: (v, _dt, t) => {
        text.setAlpha(0.55 * Math.sin((Math.PI * v.age) / v.life));
        // A tint, not setColor: changing the colour would re-render and
        // re-upload the text texture every frame.
        text.setTint(mix(u2Color(t * 1.7), 0xffffff, 0.35));
        obj.setScale(1 + Math.sin(t * 5) * 0.04);
      },
    });
  }

  /** A few bubbles rising from the whale's blowhole. */
  private spout(parent: Phaser.GameObjects.Container, x: number, y: number) {
    for (let i = 0; i < 5; i++) {
      const b = this.scene.add.image(x + rand(-6, 6), y, TEX.spark).setScale(rand(0.2, 0.4)).setAlpha(0.8);
      b.setBlendMode(Phaser.BlendModes.ADD);
      parent.add(b);
      this.scene.tweens.add({
        targets: b,
        y: y - rand(30, 60),
        x: b.x + rand(-12, 12),
        alpha: 0,
        delay: i * 90,
        duration: rand(900, 1400),
        onComplete: () => b.destroy(),
      });
    }
  }

  clear() {
    this.visitors.forEach((v) => v.obj.destroy());
    this.visitors = [];
  }
}
