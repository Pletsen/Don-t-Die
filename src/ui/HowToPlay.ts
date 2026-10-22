import Phaser from 'phaser';
import { css, palette } from '../game/palette';
import { save } from '../game/storage';
import { SKINS, skinById, skinTexture, SPIN_COST } from '../game/skins';
import { abilityFor } from '../game/abilities';
import { TEX } from '../fx/textures';
import { sfx } from '../audio/Sfx';
import { hexColor, makeButton, makeText, type Button } from './widgets';

/**
 * HOW TO PLAY: a few cards, each with a small looping animation that shows
 * the idea instead of explaining it. The animations are drawn live every
 * frame with one Graphics object (lines, rectangles, circles) plus a few
 * images for the ball, hazards and ducks.
 */

interface Card {
  title: string;
  color: number;
  body: string;
  note: string;
  /** Images this card uses (created once, shown only on this card). */
  images: Phaser.GameObjects.Image[];
  /** Floating words ("TAP!", "PERFECT"), also per card. */
  words: Phaser.GameObjects.Text[];
  /** Draw one frame of the animation. `t` is seconds since the card opened. */
  draw: (g: Phaser.GameObjects.Graphics, t: number) => void;
}

const BALL_R = 11;
const LANE = 26;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export class HowToPlay {
  readonly root: Phaser.GameObjects.Container;
  private header: Phaser.GameObjects.Text;
  private title: Phaser.GameObjects.Text;
  private body: Phaser.GameObjects.Text;
  private note: Phaser.GameObjects.Text;
  private stage: Phaser.GameObjects.Container;
  private g: Phaser.GameObjects.Graphics;
  private dots: Phaser.GameObjects.Graphics;
  private back: Button;
  private next: Button;
  private cards: Card[] = [];
  private index = 0;
  /** In single-card mode: what to do when the card is dismissed. */
  private single: (() => void) | null = null;
  private openedAt = 0;
  /** Every ball image, so the equipped skin can be swapped in. */
  private balls: Phaser.GameObjects.Image[] = [];

  constructor(
    private scene: Phaser.Scene,
    private onDone: (finished: boolean) => void,
  ) {
    this.header = makeText(scene, 0, 0, '', { font: 'mono', size: 11, color: css.inkDim, spacing: 3 }).setOrigin(0.5);
    this.title = makeText(scene, 0, 0, '', { size: 30, glow: true, spacing: 1 }).setOrigin(0.5);
    this.body = makeText(scene, 0, 0, '', { size: 16, spacing: 0.5 }).setOrigin(0.5, 0).setAlign('center').setLineSpacing(4);
    this.note = makeText(scene, 0, 0, '', { font: 'mono', size: 11, color: css.inkDim, spacing: 1 })
      .setOrigin(0.5, 0)
      .setAlign('center')
      .setLineSpacing(4);
    this.g = scene.add.graphics();
    this.stage = scene.add.container(0, 0, [this.g]);
    this.dots = scene.add.graphics();
    this.back = makeButton(scene, { label: 'BACK', width: 110, style: 'ghost', onPress: () => this.go(-1) });
    this.next = makeButton(scene, { label: 'NEXT', width: 150, onPress: () => this.go(1) });

    this.buildCards();

    this.root = scene.add.container(0, 0, [
      this.header,
      this.title,
      this.stage,
      this.body,
      this.note,
      this.dots,
      this.back,
      this.next,
    ]);
    this.root.setVisible(false);
  }

  // --- Helpers for building cards --------------------------------------------

  private img(key: string, size: number) {
    const im = this.scene.add.image(0, 0, key);
    im.setScale(size / Math.max(im.width, im.height));
    this.stage.add(im);
    return im;
  }

  private ball() {
    const im = this.scene.add.image(0, 0, skinTexture(save.skin)).setScale((BALL_R * 2.1) / 96);
    this.stage.add(im);
    this.balls.push(im);
    return im;
  }

  private word(text: string, color: string, size = 16) {
    const t = makeText(this.scene, 0, 0, text, { size, color, glow: true, spacing: 1 }).setOrigin(0.5);
    this.stage.add(t);
    return t;
  }

  /** A straight piece of neon track between two points. */
  private lane(g: Phaser.GameObjects.Graphics, x1: number, y1: number, x2: number, y2: number, color: number) {
    const x = Math.min(x1, x2) - LANE;
    const y = Math.min(y1, y2) - LANE;
    const w = Math.abs(x2 - x1) + LANE * 2;
    const h = Math.abs(y2 - y1) + LANE * 2;
    g.fillStyle(palette.floor, 0.95).fillRect(x, y, w, h);
    g.lineStyle(2, color, 0.9).strokeRect(x, y, w, h);
  }

  /** An expanding ring, like a finger tap. */
  private ripple(g: Phaser.GameObjects.Graphics, x: number, y: number, k: number, color = 0xffffff) {
    if (k < 0 || k > 1) return;
    g.lineStyle(3 * (1 - k) + 1, color, 1 - k).strokeCircle(x, y, 8 + k * 30);
  }

  /** Show a floating word that rises and fades over `k` 0 → 1. */
  private float(t: Phaser.GameObjects.Text, x: number, y: number, k: number) {
    const on = k >= 0 && k <= 1;
    t.setVisible(on);
    if (on) t.setPosition(x, y - k * 24).setAlpha(k < 0.7 ? 1 : (1 - k) / 0.3).setScale(0.8 + Math.min(k * 4, 1) * 0.2);
  }

  // --- The cards ----------------------------------------------------------------

  private buildCards() {
    // 1. The goal.
    {
      const ball = this.ball();
      const win = this.word('FINISH!', css.ink, 18);
      this.cards.push({
        title: 'REACH THE FINISH',
        color: palette.cyan,
        body: 'Your ball rolls by itself.\nGet it to the finish line.',
        note: 'PLAY: 20 LEVELS (+20 HARD), UP TO 3 STARS\nSURVIVAL: ENDLESS. HOW FAR CAN YOU GO?',
        images: [ball],
        words: [win],
        draw: (g, t) => {
          const k = (t % 3.2) / 2.4;
          this.lane(g, -140, 0, 150, 0, palette.cyan);
          // Checkered finish line.
          for (let i = 0; i < 6; i++) {
            for (let j = 0; j < 2; j++) {
              g.fillStyle((i + j) % 2 ? 0xffffff : 0x111820, 1).fillRect(104 + j * 7, -LANE + i * (LANE / 3), 7, LANE / 3);
            }
          }
          ball.setPosition(-130 + clamp01(k) * 250, 0);
          if (k >= 1) this.ripple(g, 120, 0, (k - 1) * 2.5, palette.cyan);
          this.float(win, 120, -48, (k - 1) * 2.5);
        },
      });
    }

    // 2. Steering: tap to turn right.
    {
      const ball = this.ball();
      const tap = this.word('TAP!', css.ink, 20);
      this.cards.push({
        title: 'TAP TO TURN',
        color: palette.cyan,
        body: 'Tap anywhere on the screen.\nThe ball turns RIGHT, 90°.',
        note: 'TURN INSIDE THE CORNER.\nTOUCH A WALL AND YOU DIE.',
        images: [ball],
        words: [tap],
        draw: (g, t) => {
          const cx = -70;
          const cy = -50;
          this.lane(g, cx, 74, cx, cy, palette.cyan);
          this.lane(g, cx, cy, 150, cy, palette.cyan);
          g.fillStyle(palette.floor, 1).fillRect(cx - LANE + 2, cy - LANE + 2, LANE * 2 - 4, LANE * 2 - 4);
          // The corner square glows: that's where you tap.
          const pulse = 0.35 + 0.25 * Math.sin(t * 6);
          g.lineStyle(2, 0xffffff, pulse).strokeRect(cx - LANE + 4, cy - LANE + 4, LANE * 2 - 8, LANE * 2 - 8);
          const k = (t % 3) / 2.4;
          const up = 116; // distance to the corner
          const total = up + 210;
          const d = clamp01(k) * total;
          if (d < up) ball.setPosition(cx, 66 - d);
          else ball.setPosition(cx + (d - up), cy);
          const at = up / total;
          this.ripple(g, cx, cy, (k - at) * 3);
          this.float(tap, cx - 56, cy, (k - at) * 1.6);
        },
      });
    }

    // 3. PERFECT turns.
    {
      const ball = this.ball();
      const perfect = this.word('PERFECT', css.orange, 20);
      this.cards.push({
        title: 'HIT THE MIDDLE',
        color: palette.orange,
        body: 'Turn right in the middle of the corner\nfor a PERFECT. Chain them!',
        note: 'PERFECTS GIVE COMBOS AND STARS.',
        images: [ball],
        words: [perfect],
        draw: (g, t) => {
          const cx = -40;
          const cy = -30;
          const big = LANE * 1.5;
          g.fillStyle(palette.floor, 0.95).fillRect(cx - big, cy - big, big * 2, 150 + big);
          g.fillRect(cx - big, cy - big, 190 + big, big * 2);
          g.lineStyle(2, palette.orange, 0.8).strokeRect(cx - big, cy - big, big * 2, big * 2);
          // The small bright square in the middle is the PERFECT zone.
          const pz = 11;
          g.fillStyle(palette.orange, 0.3 + 0.2 * Math.sin(t * 8)).fillRect(cx - pz, cy - pz, pz * 2, pz * 2);
          g.lineStyle(2, palette.orange, 1).strokeRect(cx - pz, cy - pz, pz * 2, pz * 2);
          const k = (t % 2.6) / 2;
          const up = 120;
          const total = up + 170;
          const d = clamp01(k) * total;
          if (d < up) ball.setPosition(cx, cy + up - d);
          else ball.setPosition(cx + (d - up), cy);
          const at = up / total;
          const hit = (k - at) * 2.2;
          if (hit >= 0 && hit <= 1) g.lineStyle(4 * (1 - hit), palette.orange, 1 - hit).strokeCircle(cx, cy, 10 + hit * 60);
          this.float(perfect, cx, cy - 46, (k - at) * 1.4);
        },
      });
    }

    // 4. What kills you.
    {
      const saw = this.img(TEX.saw, 52);
      const bomb = this.img(TEX.bomb, 50);
      const ball = this.ball();
      const labels = [this.word('WALLS', css.cyan, 13), this.word('SAWS', css.magenta, 13), this.word('BOMBS', css.orange, 13)];
      this.cards.push({
        title: 'DON’T TOUCH',
        color: palette.magenta,
        body: 'Walls, saws and bombs = game over.\nSome of them move. Steer around!',
        note: 'BOMBS BLOW UP EVERY FEW SECONDS:\nWATCH THEM SWELL, THEN TIME YOUR TURN.',
        images: [saw, bomb, ball],
        words: labels,
        draw: (g, t) => {
          // A wall with the ball bumping into it.
          const wx = -110;
          g.lineStyle(3, palette.cyan, 0.9).lineBetween(wx - 30, -30, wx + 30, -30);
          g.fillStyle(palette.floor, 0.9).fillRect(wx - 30, -30, 60, 60);
          const bump = Math.abs(Math.sin(t * 2.5));
          ball.setPosition(wx, 4 - bump * 22);
          if (bump > 0.97) g.lineStyle(2, palette.red, 1).strokeCircle(wx, -30, 14);
          saw.setPosition(0, Math.sin(t * 1.6) * 16).setRotation(t * 9);
          const beat = Math.pow(Math.max(0, Math.sin(t * 7)), 6);
          bomb.setPosition(110, 0).setScale((50 / 128) * (1 + beat * 0.12));
          // Red crosses: no touching.
          for (const x of [-110, 0, 110]) {
            g.lineStyle(3, palette.red, 0.9);
            g.lineBetween(x + 24, 26, x + 40, 42).lineBetween(x + 40, 26, x + 24, 42);
          }
          labels.forEach((l, i) => l.setPosition(-110 + i * 110, 66));
        },
      });
    }

    // 5. Ducks.
    {
      const star = this.img(TEX.warpStar, 30);
      const yellow = this.img(TEX.duck, 40);
      const red = this.img(TEX.duckRed, 40);
      const gold = this.img(TEX.duckGold, 66);
      const glow = this.img(TEX.glow, 130).setTint(0xffe680).setBlendMode(Phaser.BlendModes.ADD);
      this.stage.moveBelow(glow, gold);
      const labels = [
        this.word('+1', '#ffd21f', 18),
        this.word('+5', '#ff6a55', 18),
        this.word('FRENZY', '#ffe680', 18),
        this.word('UNIVERSE 2', css.ink, 12),
      ];
      this.cards.push({
        title: 'CATCH DUCKS',
        color: 0xffd21f,
        body: 'Bonk ducks to keep them (half if you die).\nA star hidden late on: UNIVERSE 2!',
        note: 'RED DUCKS RUN AWAY. CATCH THEM LATER.\nGOLDEN DUCK (VERY RARE): TAP LIKE CRAZY\nFOR UP TO 70 DUCKS!',
        images: [star, yellow, red, gold, glow],
        words: labels,
        draw: (g, t) => {
          star.setPosition(-20, -70).setRotation(t * 2).setScale((30 / 64) * (1 + 0.15 * Math.sin(t * 6)));
          labels[3].setPosition(50, -70);
          g.lineStyle(1, 0x2a3644, 1).lineBetween(-150, -40, 150, -40);
          yellow.setPosition(-110, 10 + Math.sin(t * 4) * 2).setRotation(Math.sin(t * 3) * 0.15);
          red.setPosition(Math.sin(t * 3.2) * 26, 10 - Math.abs(Math.sin(t * 18)) * 3).setRotation(Math.sin(t * 18) * 0.25);
          const shine = 0.5 + 0.5 * Math.sin(t * 5);
          gold.setPosition(110, 4 + Math.sin(t * 2.5) * 3).setRotation(Math.sin(t * 2) * 0.12);
          glow.setPosition(110, 4).setAlpha(0.45 + shine * 0.4);
          labels[0].setPosition(-110, 58);
          labels[1].setPosition(0, 58);
          labels[2].setPosition(110, 58);
        },
      });
    }

    // 6. The super power: tap 4 times fast.
    {
      const ball = this.ball();
      const aura = this.img(TEX.glow, 70).setBlendMode(Phaser.BlendModes.ADD);
      this.stage.moveBelow(aura, ball);
      const nums = [1, 2, 3, 4].map((n) => this.word(String(n), css.ink, 18));
      const name = this.word('', css.ink, 18);
      this.cards.push({
        title: 'SUPER POWER',
        color: 0xb36bff,
        body: 'Tap 4 times fast to activate\nyour skin’s super power!',
        note: 'YOU SPIN A QUICK LOOP AND KEEP GOING.\nLASTS 10 SECONDS. ONCE PER LEVEL.',
        images: [ball, aura],
        words: [...nums, name],
        draw: (g, t) => {
          const skin = skinById(save.skin);
          name.setText(abilityFor(skin.id).name).setColor(hexColor(skin.glow));
          this.lane(g, -150, 0, 150, 0, 0x6b4ab0);
          // Path: right along the lane, then a small square loop (four right
          // turns) back onto the same line, then on to the end.
          const T = t % 4.4;
          const side = 22;
          const start = -140;
          const loopAt = -40;
          const speed = 120;
          const tLoop = (loopAt - start) / speed;
          const tSide = side / speed;
          let x: number;
          let y: number;
          if (T < tLoop) {
            x = start + T * speed;
            y = 0;
          } else if (T < tLoop + tSide * 4) {
            const s = (T - tLoop) / tSide;
            const leg = Math.floor(s);
            const f = s - leg;
            const corners = [
              [loopAt, 0],
              [loopAt, side],
              [loopAt - side, side],
              [loopAt - side, 0],
              [loopAt, 0],
            ];
            const [ax, ay] = corners[leg];
            const [bx, by] = corners[leg + 1];
            x = ax + (bx - ax) * f;
            y = ay + (by - ay) * f;
          } else {
            x = Math.min(150, loopAt + (T - tLoop - tSide * 4) * speed);
            y = 0;
          }
          ball.setPosition(x, y);
          // The loop you drive, drawn as a faint trace.
          g.lineStyle(2, 0xffffff, 0.25).strokeRect(loopAt - side, 0, side, side);
          nums.forEach((n, i) => this.float(n, -120 + i * 34, -52, (T - tLoop - tSide * i) * 1.2));
          for (let i = 0; i < 4; i++) this.ripple(g, x, y, (T - tLoop - tSide * i) * 3, 0xffffff);
          const on = T - tLoop - tSide * 4;
          aura.setVisible(on > 0).setPosition(x, y).setTint(skin.glow);
          if (on > 0) {
            aura.setAlpha(0.6 + 0.3 * Math.sin(t * 10));
            this.ripple(g, loopAt, 0, on * 1.2, skin.glow);
            this.ripple(g, loopAt, 0, on * 1.2 - 0.2, skin.glow);
          }
          this.float(name, 40, -48, on * 0.5);
        },
      });
    }

    // 7. Skins.
    {
      const duck = this.img(TEX.duck, 40);
      const shown = ['kitty', 'unicorn', 'pizza', 'crown', 'ufo', 'froggy'];
      const skins = shown.map((id) => this.img(skinTexture(id), 36));
      const cost = this.word(`${SPIN_COST}`, '#ffd21f', 22);
      const count = this.word(`${SKINS.length} SKINS`, css.ink, 12);
      this.cards.push({
        title: 'GET SKINS',
        color: 0xffd21f,
        body: `${SPIN_COST} ducks = 1 spin on the DUCK-O-MATIC.\nEvery skin has its own super power.`,
        note: 'RARER SKINS HAVE STRONGER POWERS.\nCHOOSE YOUR SKIN UNDER SKINS IN THE MENU.',
        images: [duck, ...skins],
        words: [cost, count],
        draw: (g, t) => {
          duck.setPosition(-120, -6);
          cost.setPosition(-120, 34);
          // Arrow into the machine.
          g.lineStyle(3, 0xffd21f, 0.8).lineBetween(-86, 0, -58, 0).lineBetween(-66, -8, -58, 0).lineBetween(-66, 8, -58, 0);
          // The machine: a box with three spinning reels.
          g.fillStyle(0x0a0e14, 0.95).fillRoundedRect(-44, -40, 150, 80, 12);
          g.lineStyle(2, 0xffd21f, 0.9).strokeRoundedRect(-44, -40, 150, 80, 12);
          skins.forEach((s) => s.setVisible(false));
          for (let r = 0; r < 3; r++) {
            const stop = (t % 3) > 1 + r * 0.4;
            const i = stop ? (r * 2 + Math.floor(t / 3)) % skins.length : Math.floor(t * 14 + r * 2) % skins.length;
            const x = -12 + r * 43;
            g.fillStyle(0x121a24, 1).fillRoundedRect(x - 20, -26, 40, 52, 6);
            // A stopped reel shows its skin; a spinning one is a blur.
            if (stop) skins[i].setVisible(true).setPosition(x, 0);
            else g.fillStyle(0xffffff, 0.12).fillCircle(x, ((t * 300 + r * 40) % 52) - 26, 12);
          }
          count.setPosition(31, 58);
        },
      });
    }
  }

  // --- Showing, paging ---------------------------------------------------------

  show() {
    for (const b of this.balls) b.setTexture(skinTexture(save.skin));
    this.single = null;
    this.index = 0;
    this.render();
  }

  /** Show one card on its own (a tip right before it matters), then call `done`. */
  showSingle(index: number, done: () => void) {
    for (const b of this.balls) b.setTexture(skinTexture(save.skin));
    this.single = done;
    this.index = Math.max(0, Math.min(this.cards.length - 1, index));
    this.render();
  }

  /** Card numbers for showSingle. */
  static readonly CARD = { goal: 0, tap: 1, perfect: 2, danger: 3, ducks: 4, power: 5, skins: 6 } as const;

  private go(delta: number) {
    if (this.single) {
      const done = this.single;
      this.single = null;
      done();
      return;
    }
    const to = this.index + delta;
    if (to < 0) {
      this.onDone(false);
      return;
    }
    if (to >= this.cards.length) {
      save.setIntroSeen();
      this.onDone(true);
      return;
    }
    this.index = to;
    sfx.swoosh();
    this.render();
    this.stage.setAlpha(0);
    this.scene.tweens.add({ targets: this.stage, alpha: 1, duration: 200 });
  }

  /** A tap outside the buttons also moves on. */
  tap() {
    this.go(1);
  }

  private render() {
    const card = this.cards[this.index];
    this.openedAt = this.scene.time.now;
    this.header.setText(this.single ? 'NEW!' : `HOW TO PLAY  ·  ${this.index + 1} / ${this.cards.length}`);
    this.title.setText(card.title).setShadow(0, 0, hexColor(card.color), 16, false, true);
    this.body.setText(card.body);
    this.note.setText(card.note);
    this.cards.forEach((c) => {
      const on = c === card;
      c.images.forEach((i) => i.setVisible(on));
      c.words.forEach((w) => w.setVisible(on));
    });
    this.back.setLabel(this.index === 0 ? 'MENU' : 'BACK');
    this.next.setLabel(this.single ? 'GOT IT!' : this.index === this.cards.length - 1 ? 'LET’S GO!' : 'NEXT');
    this.back.setVisible(!this.single);
    this.dots.setVisible(!this.single);
    this.drawDots();
  }

  private drawDots() {
    const n = this.cards.length;
    const g = this.dots.clear();
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * 16;
      if (i === this.index) g.fillStyle(this.cards[i].color, 1).fillCircle(x, 0, 5);
      else g.fillStyle(0x2a3644, 1).fillCircle(x, 0, 3.5);
    }
  }

  layout(w: number, h: number, top: number) {
    this.root.setPosition(w / 2, 0);
    const wrap = Math.min(w - 40, 360);
    const scale = Math.min(1, (w - 24) / 330);
    this.header.setPosition(0, top);
    this.title.setPosition(0, top + 36);
    const stageY = top + 76 + 100 * scale;
    this.stage.setPosition(0, stageY).setScale(scale);
    this.body.setPosition(0, stageY + 118 * scale).setWordWrapWidth(wrap);
    this.note.setPosition(0, stageY + 118 * scale + 58).setWordWrapWidth(wrap);
    this.dots.setPosition(0, h - 96);
    this.back.setPosition(-80, h - 50);
    this.next.setPosition(66, h - 50);
  }

  update(time: number) {
    if (!this.root.visible) return;
    const t = (time - this.openedAt) / 1000;
    const g = this.g.clear();
    this.cards[this.index].draw(g, t);
  }
}
