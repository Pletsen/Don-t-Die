import Phaser from 'phaser';
import { EV, type ClearData, type DeathData, type HudData } from '../game/shared';
import { display } from '../game/display';
import { save } from '../game/storage';
import { css, palette, hueColor } from '../game/palette';
import { LEVELS, WORLDS, levelById } from '../game/levels';
import { sfx } from '../audio/Sfx';
import { TEX } from '../fx/textures';
import { GLOW_PAD, hexColor, makeButton, makeText, type Button, type TextOpts } from '../ui/widgets';
import { LevelSelect, nextLevelToPlay } from '../ui/LevelSelect';
import { ClearScreen } from '../ui/ClearScreen';
import { SkinShop } from '../ui/SkinShop';

type Mode = 'title' | 'select' | 'skins' | 'play' | 'dead' | 'clear';

/**
 * Top layer: HUD, title, level map, game-over and level-clear screens.
 *
 * It is also the single place that listens for taps. Buttons handle their own
 * taps; a tap anywhere else means something different per screen (start,
 * turn, retry, next level), decided in `onBackgroundTap`.
 *
 * The camera is zoomed by the device pixel ratio with its origin at the
 * top-left, so every position here is in plain CSS pixels.
 */
export class UIScene extends Phaser.Scene {
  private mode: Mode = 'title';
  /** The level being played, or null for survival. */
  private level: number | null = null;
  /** Ignore background taps until this time, so a panicked tap doesn't skip a screen. */
  private tapsFrom = 0;

  private hud!: Phaser.GameObjects.Container;
  private distLabel!: Phaser.GameObjects.Text;
  private distValue!: Phaser.GameObjects.Text;
  private subValue!: Phaser.GameObjects.Text;
  private rightLabel!: Phaser.GameObjects.Text;
  private rightValue!: Phaser.GameObjects.Text;
  private progress!: Phaser.GameObjects.Graphics;
  private comboText!: Phaser.GameObjects.Text;
  private soundBtn!: Phaser.GameObjects.Container;
  private fxBtn!: Phaser.GameObjects.Container;

  private title!: Phaser.GameObjects.Container;
  private titleLayers: Phaser.GameObjects.Text[] = [];
  private subtitle!: Phaser.GameObjects.Text;
  private tapRing!: Phaser.GameObjects.Image;
  private tapHint!: Phaser.GameObjects.Text;
  private statsLine!: Phaser.GameObjects.Text;

  private scrim!: Phaser.GameObjects.Rectangle;
  private select!: LevelSelect;
  private clearScreen!: ClearScreen;
  private shop!: SkinShop;

  private over!: Phaser.GameObjects.Container;
  private causeText!: Phaser.GameObjects.Text;
  private scoreText!: Phaser.GameObjects.Text;
  private timeText!: Phaser.GameObjects.Text;
  private bestText!: Phaser.GameObjects.Text;
  private flavorText!: Phaser.GameObjects.Text;
  private retryPill!: Phaser.GameObjects.Container;
  private overLevels!: Button;

  private glitchUntil = 0;
  private toastText!: Phaser.GameObjects.Text;
  private konami: string[] = [];

  constructor() {
    super('UI');
  }

  create() {
    const cam = this.cameras.main;
    cam.setOrigin(0, 0).setZoom(display.dpr);

    // Creation order is drawing order: HUD, title, scrim, then the screens on top.
    this.buildHud();
    this.buildTitle();
    this.scrim = this.add.rectangle(0, 0, 10, 10, 0x020305, 0.62).setOrigin(0, 0).setAlpha(0);
    this.buildGameOver();
    this.select = new LevelSelect(
      this,
      (level) => this.play(level),
      () => this.toggleRainbow(),
      () => this.showSkins(),
    );
    this.shop = new SkinShop(
      this,
      () => this.showSelect(),
      () => this.game.events.emit(EV.skin),
    );
    this.clearScreen = new ClearScreen(this, {
      next: () => this.nextLevel(),
      retry: () => this.play(this.level),
      levels: () => this.showSelect(),
    });
    this.buildToggles();
    this.toastText = this.text(0, 0, '', { size: 15, glow: true, spacing: 2 }).setOrigin(0.5).setAlpha(0);

    this.layout();
    this.showTitle();

    this.input.on('pointerdown', (_p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (over.length === 0) this.onBackgroundTap();
    });
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => {
      this.checkKonami(e.code);
      if (e.code === 'Space' || e.code === 'Enter' || e.code === 'ArrowRight') {
        e.preventDefault();
        if (this.mode === 'select') this.play(nextLevelToPlay());
        else this.onBackgroundTap();
      } else if (e.code === 'Escape' && this.mode !== 'play') {
        this.showSelect();
      }
    });

    this.game.events.on(EV.started, this.onStarted, this);
    this.game.events.on(EV.hud, this.onHud, this);
    this.game.events.on(EV.died, this.onDied, this);
    this.game.events.on(EV.cleared, this.onCleared, this);
    this.game.events.on(EV.combo, this.onCombo, this);
    this.game.events.on(EV.warp, () => {
      this.toast('WELCOME TO UNIVERSE 2', 2600);
      this.glitchUntil = this.time.now + 400;
    });
    this.scale.on('resize', (size: Phaser.Structs.Size) => {
      cam.setSize(size.width, size.height);
      this.layout();
    });
  }

  /** Easter egg: ↑ ↑ ↓ ↓ ← → ← → B A toggles a rainbow trail. */
  private checkKonami(code: string) {
    const seq = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'KeyB', 'KeyA'];
    this.konami = [...this.konami, code].slice(-seq.length);
    if (this.konami.join() === seq.join()) {
      this.konami = [];
      this.toggleRainbow();
    }
  }

  private toggleRainbow() {
    save.setRainbow(!save.rainbow);
    sfx.unlock();
    sfx.newBest();
    this.toast(save.rainbow ? 'RAINBOW MODE' : 'RAINBOW MODE OFF');
  }

  private toast(msg: string, hold = 1600) {
    const { w, h } = display.size(this);
    this.toastText.setText(msg).setPosition(w / 2, h - 60 - display.safeTop());
    this.tweens.killTweensOf(this.toastText);
    this.toastText.setAlpha(1).setScale(1.4);
    this.tweens.add({ targets: this.toastText, scale: 1, duration: 250, ease: 'Back.easeOut' });
    this.tweens.add({ targets: this.toastText, alpha: 0, delay: hold, duration: 400 });
  }

  private onBackgroundTap() {
    if (this.time.now < this.tapsFrom) return;
    switch (this.mode) {
      case 'title':
        sfx.unlock();
        sfx.click();
        this.showSelect();
        break;
      case 'play':
        this.game.events.emit(EV.tap);
        break;
      case 'dead':
        this.play(this.level);
        break;
      case 'clear':
        this.nextLevel();
        break;
    }
  }

  // --- Building blocks ------------------------------------------------------

  private text(x: number, y: number, str: string, o: TextOpts) {
    return makeText(this, x, y, str, o);
  }

  private iconButton(label: string, onPress: () => void) {
    const bg = this.add.graphics();
    const txt = this.text(0, 0, label, { size: 12, font: 'mono', weight: '700', color: css.inkDim }).setOrigin(0.5);
    const hit = this.add.zone(0, 0, 44, 44).setInteractive({ useHandCursor: true });
    const btn = this.add.container(0, 0, [bg, txt, hit]);
    hit.on('pointerdown', () => {
      sfx.unlock();
      onPress();
    });
    return btn;
  }

  private paintButton(btn: Phaser.GameObjects.Container, active: boolean) {
    const bg = btn.list[0] as Phaser.GameObjects.Graphics;
    const txt = btn.list[1] as Phaser.GameObjects.Text;
    bg.clear();
    bg.fillStyle(0x0a0e14, 0.6).fillCircle(0, 0, 17);
    bg.lineStyle(1, active ? palette.cyan : 0x182432, 1).strokeCircle(0, 0, 17);
    txt.setColor(active ? css.cyan : css.inkDim);
  }

  private refreshButtons() {
    this.paintButton(this.soundBtn, !save.muted);
    (this.soundBtn.list[1] as Phaser.GameObjects.Text).setText(save.muted ? 'OFF' : 'SND');
    this.paintButton(this.fxBtn, save.fxReduced);
  }

  private buildHud() {
    this.progress = this.add.graphics();
    this.distLabel = this.text(0, 0, 'DISTANCE', { font: 'mono', size: 10, color: css.inkDim, spacing: 1.6 });
    this.distValue = this.text(0, 0, '0.0 M', { size: 26, weight: '600', glow: true });
    this.subValue = this.text(0, 0, '', { font: 'mono', size: 11, color: css.inkDim });
    this.rightLabel = this.text(0, 0, 'BEST', { font: 'mono', size: 10, color: css.inkDim, spacing: 1.6 }).setOrigin(1, 0);
    this.rightValue = this.text(0, 0, '', { size: 26, weight: '600', glow: true }).setOrigin(1, 0);
    this.comboText = this.text(0, 0, '', { size: 16, color: css.orange, glow: true, spacing: 1.2 })
      .setOrigin(0.5)
      .setAlpha(0);

    this.hud = this.add.container(0, 0, [
      this.progress,
      this.distLabel,
      this.distValue,
      this.subValue,
      this.rightLabel,
      this.rightValue,
      this.comboText,
    ]);
    this.hud.setVisible(false);
  }

  private buildToggles() {
    this.soundBtn = this.iconButton('SND', () => {
      save.setMuted(!save.muted);
      sfx.setMuted(save.muted);
      this.refreshButtons();
    });
    this.fxBtn = this.iconButton('FX', () => {
      save.setFxReduced(!save.fxReduced);
      this.game.events.emit(EV.fxChanged);
      this.refreshButtons();
    });
    this.refreshButtons();
  }

  private buildTitle() {
    const make = (color: string, alpha: number) =>
      this.text(0, 0, "DON'T DIE", { size: 72, color, glow: color === css.ink }).setOrigin(0.5).setAlpha(alpha);
    // Three copies of the title: magenta and cyan ghosts behind a white one.
    // Nudging the ghosts apart now and then gives a chromatic "glitch".
    const magenta = make(css.magenta, 0.75).setBlendMode(Phaser.BlendModes.ADD);
    const cyan = make(css.cyan, 0.75).setBlendMode(Phaser.BlendModes.ADD);
    const main = make(css.ink, 1);
    main.setShadow(0, 0, css.cyan, 24, false, true);
    this.titleLayers = [magenta, cyan, main];

    this.subtitle = this.text(0, 0, 'CHAOS ARCADE', { font: 'mono', size: 12, color: css.inkDim, spacing: 5 }).setOrigin(0.5);
    this.tapRing = this.add.image(0, 0, TEX.ring).setTint(palette.cyan).setBlendMode(Phaser.BlendModes.ADD);
    this.tapHint = this.text(0, 0, 'TAP TO START', { font: 'mono', size: 11, color: css.cyan, spacing: 3 }).setOrigin(0.5);
    this.statsLine = this.text(0, 0, '', { font: 'mono', size: 10, color: css.inkDim, spacing: 1.5 }).setOrigin(0.5);

    this.title = this.add.container(0, 0, [...this.titleLayers, this.subtitle, this.tapRing, this.tapHint, this.statsLine]);
  }

  private buildGameOver() {
    this.causeText = this.text(0, 0, '', { size: 13, color: css.magenta, spacing: 3 }).setOrigin(0.5);
    this.scoreText = this.text(0, 0, '0.0 M', { size: 76, glow: true }).setOrigin(0.5);
    this.timeText = this.text(0, 0, '', { font: 'mono', size: 13, color: css.inkDim, spacing: 1.5 }).setOrigin(0.5);
    this.bestText = this.text(0, 0, '', { font: 'mono', size: 13, color: css.inkDim, spacing: 1.5 }).setOrigin(0.5);
    this.flavorText = this.text(0, 0, '', { size: 14, color: css.magenta, spacing: 1.2 }).setOrigin(0.5);
    this.retryPill = makeButton(this, { label: 'TAP TO RETRY', width: 184, onPress: () => this.play(this.level) });
    this.overLevels = makeButton(this, { label: 'LEVELS', width: 120, style: 'ghost', onPress: () => this.showSelect() });

    this.over = this.add.container(0, 0, [
      this.causeText,
      this.scoreText,
      this.timeText,
      this.bestText,
      this.flavorText,
      this.retryPill,
      this.overLevels,
    ]);
    this.over.setAlpha(0).setVisible(false);
  }

  private layout() {
    const { w, h } = display.size(this);
    const top = 16 + display.safeTop();
    const side = 16;

    this.distLabel.setPosition(side, top);
    this.distValue.setPosition(side - GLOW_PAD, top + 12 - GLOW_PAD);
    this.subValue.setPosition(side, top + 44);
    this.rightLabel.setPosition(w - side, top);
    this.rightValue.setPosition(w - side + GLOW_PAD, top + 12 - GLOW_PAD);
    this.soundBtn.setPosition(w / 2 - 22, top + 18);
    this.fxBtn.setPosition(w / 2 + 22, top + 18);
    this.comboText.setPosition(w / 2, top + 72);

    const titleSize = Phaser.Math.Clamp(w * 0.14, 44, 96);
    this.titleLayers.forEach((t) => t.setFontSize(titleSize));
    const cy = h * 0.4;
    this.titleLayers.forEach((t) => t.setPosition(w / 2, cy));
    this.subtitle.setPosition(w / 2, cy + titleSize * 0.62);
    this.tapRing.setPosition(w / 2, h * 0.7);
    this.tapHint.setPosition(w / 2, h * 0.7 + 50);
    this.statsLine.setPosition(w / 2, h - 28);

    this.scrim.setSize(w, h);
    const oy = h * 0.4;
    this.causeText.setPosition(w / 2, oy - 76);
    this.scoreText.setPosition(w / 2, oy - 18).setFontSize(Phaser.Math.Clamp(w * 0.17, 52, 104));
    this.timeText.setPosition(w / 2, oy + 38);
    this.bestText.setPosition(w / 2, oy + 60);
    this.flavorText.setPosition(w / 2, oy + 92);
    this.retryPill.setPosition(w / 2, oy + 150);
    this.overLevels.setPosition(w / 2, oy + 212);

    this.select.layout(w, h, top + 52);
    this.shop.layout(w, h, top + 48);
    this.clearScreen.layout(w, h);
    this.drawProgress(this.lastHud);
  }

  // --- Screens --------------------------------------------------------------

  private fadeOut(target: Phaser.GameObjects.Container) {
    if (!target.visible) return;
    this.tweens.add({ targets: target, alpha: 0, duration: 180, onComplete: () => target.setVisible(false) });
  }

  private fadeIn(target: Phaser.GameObjects.Container | Phaser.GameObjects.Rectangle, alpha = 1) {
    if ('setVisible' in target) target.setVisible(true);
    this.tweens.add({ targets: target, alpha, duration: 220 });
  }

  private showTitle() {
    this.mode = 'title';
    this.title.setVisible(true).setAlpha(1);
    const stars = save.totalStars();
    this.statsLine.setText(
      stars > 0
        ? `${stars} STARS  ·  ${save.deaths} DEATHS`
        : save.deaths > 0
          ? `BEST ${save.best.toFixed(1)} M  ·  ${save.deaths} DEATHS`
          : 'ONE TAP. ONE RULE.',
    );
  }

  private showSkins() {
    this.mode = 'skins';
    sfx.swoosh();
    this.fadeOut(this.select.root);
    this.shop.refresh();
    this.shop.root.setVisible(true).setAlpha(0);
    this.fadeIn(this.shop.root);
  }

  private showSelect() {
    const fromRun = this.mode === 'dead' || this.mode === 'clear';
    this.fadeOut(this.shop.root);
    this.mode = 'select';
    this.fadeOut(this.title);
    this.fadeOut(this.over);
    this.fadeOut(this.hud);
    if (this.clearScreen.root.visible) this.clearScreen.hide();
    if (fromRun) this.game.events.emit(EV.menu);

    sfx.swoosh();
    this.select.refresh();
    this.select.root.setAlpha(0);
    this.fadeIn(this.select.root);
    this.fadeIn(this.scrim);
  }

  private play(level: number | null) {
    this.level = level;
    this.fadeOut(this.title);
    this.fadeOut(this.over);
    this.fadeOut(this.select.root);
    if (this.clearScreen.root.visible) this.clearScreen.hide();
    this.tweens.add({ targets: this.scrim, alpha: 0, duration: 180 });
    this.game.events.emit(EV.play, { level });
  }

  private nextLevel() {
    const last = LEVELS[LEVELS.length - 1].id;
    if (this.level === null || this.level >= last) this.showSelect();
    else this.play(this.level + 1);
  }

  private onStarted(d: HudData) {
    this.mode = 'play';
    this.hud.setVisible(true).setAlpha(0);
    this.fadeIn(this.hud);

    const level = this.level === null ? null : levelById(this.level);
    if (level) {
      const color = hexColor(WORLDS[level.world].color);
      this.rightLabel.setText('LEVEL');
      this.rightValue.setText(String(level.id)).setShadow(0, 0, color, 16, false, true);
    } else {
      this.rightLabel.setText('BEST');
      this.rightValue.setText(`${save.best.toFixed(1)} M`).setShadow(0, 0, css.cyan, 16, false, true);
    }
    this.onHud(d);
  }

  private lastHud: HudData = { meters: 0, seconds: 0, goal: null };

  private onHud(d: HudData) {
    this.lastHud = d;
    this.distValue.setText(`${d.meters.toFixed(1)} M`);
    this.subValue.setText(d.goal === null ? `${d.seconds.toFixed(2)} SEC` : `GOAL ${d.goal.toFixed(0)} M`);
    this.drawProgress(d);
  }

  /** Thin bar along the top edge showing how far to the finish line. */
  private drawProgress(d: HudData) {
    const g = this.progress.clear();
    if (d.goal === null || this.level === null) return;
    const { w } = display.size(this);
    const level = levelById(this.level)!;
    const color = WORLDS[level.world].color;
    const k = Math.min(1, d.meters / d.goal);
    const y = 4 + display.safeTop();
    g.fillStyle(0xffffff, 0.08).fillRect(0, y, w, 3);
    g.fillStyle(color, 0.25).fillRect(0, y - 2, w * k, 7);
    g.fillStyle(color, 1).fillRect(0, y, w * k, 3);
  }

  private onCombo(n: number) {
    const labels: Record<number, string> = { 2: 'x2', 3: 'x3', 4: 'x4', 5: 'x5 INSANE', 6: 'x6 UNBELIEVABLE' };
    this.comboText.setText(n >= 7 ? `x${n} HOW?` : (labels[n] ?? 'PERFECT'));
    this.tweens.killTweensOf(this.comboText);
    this.comboText.setAlpha(1).setScale(1.5);
    this.tweens.add({ targets: this.comboText, scale: 1, duration: 200, ease: 'Back.easeOut' });
    this.tweens.add({ targets: this.comboText, alpha: 0, delay: 650, duration: 250 });
    if (n >= 5) this.glitchUntil = this.time.now + 180;
  }

  private onDied(d: DeathData) {
    this.mode = 'dead';
    this.tapsFrom = this.time.now + 450;
    this.onHud(d);

    const causes = { wall: 'HIT THE WALL', saw: 'SLICED', bomb: 'BLOWN UP' };
    this.causeText.setText(d.warped ? `${causes[d.cause]} IN UNIVERSE 2` : causes[d.cause]);
    this.bestText.setShadow(0, 0, 'transparent', 0);

    if (d.goal !== null && d.level !== null) {
      const level = levelById(d.level)!;
      const pct = Math.floor((d.meters / d.goal) * 100);
      this.timeText.setText(`${d.meters.toFixed(0)} / ${d.goal.toFixed(0)} M  ·  ${pct}%`);
      this.bestText.setText(`LEVEL ${d.level} · ${WORLDS[level.world].name}`).setColor(hexColor(WORLDS[level.world].color));
      this.flavorText.setText(
        d.warped && d.ducks > 0 ? `${d.ducks} DUCKS LOST. FINISH TO KEEP THEM.` : d.goal - d.meters < 30 ? 'SO CLOSE.' : '',
      );
    } else {
      this.rightValue.setText(`${d.best.toFixed(1)} M`);
      this.timeText.setText(`${d.seconds.toFixed(2)} SEC`);
      this.bestText.setText(d.isNewBest ? 'NEW BEST' : `BEST ${d.best.toFixed(1)} M`);
      this.bestText.setColor(d.isNewBest ? css.orange : css.inkDim);
      if (d.isNewBest) this.bestText.setShadow(0, 0, css.orange, 14, false, true);
      this.flavorText.setText(this.flavorLine(d));
    }

    this.over.setVisible(true).setAlpha(0);
    this.fadeIn(this.scrim);
    this.fadeIn(this.over);

    // Count the score up for a bit of drama.
    const counter = { v: 0 };
    this.scoreText.setScale(0.7);
    this.tweens.add({ targets: this.scoreText, scale: 1, duration: 420, ease: 'Back.easeOut' });
    this.tweens.add({
      targets: counter,
      v: d.meters,
      duration: Math.min(900, 300 + d.meters * 2),
      ease: 'Cubic.easeOut',
      onUpdate: () => this.scoreText.setText(`${counter.v.toFixed(1)} M`),
    });
    [this.retryPill, this.overLevels].forEach((b, i) => {
      b.setScale(0.9).setAlpha(0);
      this.tweens.add({ targets: b, alpha: 1, scale: 1, delay: 350 + i * 80, duration: 300, ease: 'Back.easeOut' });
    });
  }

  private onCleared(d: ClearData) {
    this.mode = 'clear';
    this.tapsFrom = this.time.now + 1200;
    this.onHud(d);
    this.fadeOut(this.hud);
    this.fadeIn(this.scrim);
    this.clearScreen.show(d);
  }

  private flavorLine(d: DeathData) {
    const gap = d.best - d.meters;
    if (!d.isNewBest && gap > 0.05 && gap < 8) return `${gap.toFixed(1)} M FROM RECORD`;
    if (d.deaths === 100) return "YOU'RE REALLY COMMITTED.";
    if (d.deaths === 500) return 'WE NEED TO TALK.';
    const hr = new Date().getHours();
    if (hr < 5) return 'STILL HERE?';
    return '';
  }

  // --- Per-frame animation ---------------------------------------------------

  update(time: number) {
    const t = time / 1000;

    if (this.title.visible) {
      // Occasional glitch bursts, otherwise a gentle drift of the ghosts.
      if (Math.random() < 0.012) this.glitchUntil = time + 90 + Math.random() * 120;
      const glitching = time < this.glitchUntil;
      const amp = glitching ? 6 : 1.6;
      const [m, c, main] = this.titleLayers;
      const { w, h } = display.size(this);
      const cy = h * 0.4;
      m.setPosition(w / 2 - amp + (glitching ? Math.random() * 4 : 0), cy + (glitching ? Math.random() * 3 - 1.5 : 0));
      c.setPosition(w / 2 + amp - (glitching ? Math.random() * 4 : 0), cy - (glitching ? Math.random() * 3 - 1.5 : 0));
      main.setPosition(w / 2, cy).setScale(1 + Math.sin(t * 2) * 0.01);

      const k = (t * 0.9) % 1;
      this.tapRing.setScale(0.22 + k * 0.12).setAlpha(1 - k);
    }

    if (this.mode === 'select') this.select.update(time);
    if (this.mode === 'skins') this.shop.update(time);
    if (this.toastText.alpha > 0 && (save.rainbow || this.mode === 'play')) this.toastText.setColor(hexColor(hueColor(time / 3)));
    this.clearScreen.update(time);

    if (this.mode === 'dead' && this.over.visible && this.retryPill.alpha >= 1) {
      this.retryPill.setScale(1 + 0.025 * Math.sin(t * 4));
    }
  }
}
