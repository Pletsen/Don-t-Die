import Phaser from 'phaser';
import { EV, type ClearData, type DeathData, type HudData } from '../game/shared';
import { display } from '../game/display';
import { save } from '../game/storage';
import { css, palette, hueColor } from '../game/palette';
import { LEVELS, WORLDS, levelById } from '../game/levels';
import { sfx } from '../audio/Sfx';
import { GLOW_PAD, hexColor, makeButton, makeText, type Button, type TextOpts } from '../ui/widgets';
import { LevelSelect, nextLevelToPlay } from '../ui/LevelSelect';
import { SKINS, skinById, skinTexture, RARITIES, SPIN_COST } from '../game/skins';
import { abilityFor } from '../game/abilities';
import { ClearScreen } from '../ui/ClearScreen';
import { SkinShop } from '../ui/SkinShop';

type Mode = 'menu' | 'select' | 'skins' | 'play' | 'dead' | 'clear';

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
function setIfChanged(t: Phaser.GameObjects.Text, s: string) {
  if (t.text !== s) t.setText(s);
}

export class UIScene extends Phaser.Scene {
  private mode: Mode = 'menu';
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
  private statsLine!: Phaser.GameObjects.Text;
  private playBtn!: Button;
  private survivalBtn!: Button;
  private skinsBtn!: Button;
  private playNote!: Phaser.GameObjects.Text;
  private survivalNote!: Phaser.GameObjects.Text;
  private skinsNote!: Phaser.GameObjects.Text;

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
  private overMenu!: Button;

  private glitchUntil = 0;
  private toastText!: Phaser.GameObjects.Text;
  private konami: string[] = [];

  constructor() {
    super('UI');
  }

  create() {
    const cam = this.cameras.main;
    cam.setOrigin(0, 0).setZoom(display.dpr);

    // Creation order is drawing order: HUD, scrim, then the screens on top.
    this.buildHud();
    this.scrim = this.add.rectangle(0, 0, 10, 10, 0x020305, 0.62).setOrigin(0, 0).setAlpha(0);
    this.buildTitle();
    this.buildGameOver();
    this.select = new LevelSelect(
      this,
      (level) => this.play(level),
      () => this.toggleRainbow(),
      () => this.showMenu(),
    );
    this.shop = new SkinShop(
      this,
      () => this.showMenu(),
      () => this.game.events.emit(EV.skin),
    );
    this.clearScreen = new ClearScreen(this, {
      next: () => this.nextLevel(),
      retry: () => this.play(this.level),
      levels: () => this.showSelect(),
      menu: () => this.showMenu(),
    });
    this.buildToggles();
    this.buildAbilityPill();
    this.toastText = this.text(0, 0, '', { size: 15, glow: true, spacing: 2 }).setOrigin(0.5).setAlpha(0);

    this.layout();
    this.showMenu();

    this.input.on('pointerdown', (_p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (over.length === 0) this.onBackgroundTap();
    });
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => {
      this.checkKonami(e.code);
      if (e.code === 'Space' || e.code === 'Enter' || e.code === 'ArrowRight') {
        e.preventDefault();
        if (this.mode === 'select') this.play(nextLevelToPlay());
        else if (this.mode === 'menu') this.showSelect();
        else this.onBackgroundTap();
      } else if (e.code === 'Escape' && this.mode !== 'play' && this.mode !== 'menu') {
        this.showMenu();
      }
    });

    this.game.events.on(EV.started, this.onStarted, this);
    this.game.events.on(EV.hud, this.onHud, this);
    this.game.events.on(EV.died, this.onDied, this);
    this.game.events.on(EV.cleared, this.onCleared, this);
    this.game.events.on(EV.combo, this.onCombo, this);
    this.game.events.on(EV.ability, this.onAbility, this);
    this.game.events.on(EV.warp, () => {
      this.toast('WELCOME TO UNIVERSE 2', 2600);
      this.glitchUntil = this.time.now + 400;
    });
    this.scale.on('resize', (size: Phaser.Structs.Size) => {
      cam.setSize(size.width, size.height).setZoom(display.dpr);
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

  // --- Ability pill (bottom of the HUD) ---------------------------------------

  private abilityPill!: Phaser.GameObjects.Container;
  private abilityBg!: Phaser.GameObjects.Graphics;
  private abilityIcon!: Phaser.GameObjects.Image;
  private abilityName!: Phaser.GameObjects.Text;
  private abilityStatus!: Phaser.GameObjects.Text;
  private abilityState = { state: 'ready', frac: 0 };
  private lastAbilityDraw = 0;

  private buildAbilityPill() {
    this.abilityBg = this.add.graphics();
    this.abilityIcon = this.add.image(-96, 0, skinTexture('classic')).setScale(0.3);
    this.abilityName = this.text(-76, -8, '', { size: 13, spacing: 1.2 }).setOrigin(0, 0.5);
    this.abilityStatus = this.text(-76, 9, '', { font: 'mono', size: 9, color: css.inkDim, spacing: 1 }).setOrigin(0, 0.5);
    this.abilityPill = this.add.container(0, 0, [this.abilityBg, this.abilityIcon, this.abilityName, this.abilityStatus]);
    this.hud.add(this.abilityPill);
  }

  private onAbility(a: { state: string; frac: number }) {
    const changed = a.state !== this.abilityState.state;
    this.abilityState = a;
    if (!changed && this.time.now - this.lastAbilityDraw < 80) return;
    this.lastAbilityDraw = this.time.now;
    this.drawAbilityPill();
  }

  private drawAbilityPill() {
    const skin = skinById(save.skin);
    const def = abilityFor(skin.id);
    const { state, frac } = this.abilityState;
    const w = 230;
    const h = 44;
    const color = skin.glow;
    const g = this.abilityBg.clear();
    g.fillStyle(0x0a0e14, 0.72).fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
    g.lineStyle(1.5, state === 'used' || state === 'recharging' ? 0x2a3644 : color, state === 'active' ? 1 : 0.7);
    g.strokeRoundedRect(-w / 2, -h / 2, w, h, h / 2);
    if (state === 'active') {
      g.fillStyle(color, 0.28).fillRoundedRect(-w / 2 + 3, -h / 2 + 3, Math.max(h - 6, (w - 6) * frac), h - 6, (h - 6) / 2);
    }
    this.abilityIcon.setTexture(skinTexture(skin.id)).setAlpha(state === 'used' ? 0.4 : 1);
    setIfChanged(this.abilityName, def.name);
    this.abilityName.setColor(state === 'used' || state === 'recharging' ? css.inkDim : css.ink);
    const status =
      state === 'ready' ? 'TAP 4× FAST TO ACTIVATE' : state === 'active' ? `${Math.ceil(frac * 10)} SEC` : state === 'used' ? 'USED THIS LEVEL' : 'RECHARGING';
    setIfChanged(this.abilityStatus, status);
    this.abilityStatus.setColor(state === 'ready' ? hexColor(RARITIES[skin.rarity].color) : css.inkDim);
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
    this.statsLine = this.text(0, 0, '', { font: 'mono', size: 10, color: css.inkDim, spacing: 1.5 }).setOrigin(0.5);

    // Main menu: the game opens here.
    const note = () => this.text(0, 0, '', { font: 'mono', size: 10, color: css.inkDim, spacing: 1.2 }).setOrigin(0.5);
    this.playBtn = makeButton(this, { label: 'PLAY', width: 260, height: 56, onPress: () => this.showSelect() });
    this.survivalBtn = makeButton(this, { label: 'SURVIVAL', width: 260, style: 'ghost', onPress: () => this.play(null) });
    this.skinsBtn = makeButton(this, {
      label: 'SKINS',
      width: 260,
      style: 'ghost',
      color: 0xffd21f,
      onPress: () => this.showSkins(),
    });
    this.playNote = note();
    this.survivalNote = note();
    this.skinsNote = note();

    // (Named `title` for history: it is the whole main menu.)
    this.title = this.add.container(0, 0, [
      ...this.titleLayers,
      this.subtitle,
      this.playBtn,
      this.playNote,
      this.survivalBtn,
      this.survivalNote,
      this.skinsBtn,
      this.skinsNote,
      this.statsLine,
    ]);
  }

  private buildGameOver() {
    this.causeText = this.text(0, 0, '', { size: 13, color: css.magenta, spacing: 3 }).setOrigin(0.5);
    this.scoreText = this.text(0, 0, '0.0 M', { size: 76, glow: true }).setOrigin(0.5);
    this.timeText = this.text(0, 0, '', { font: 'mono', size: 13, color: css.inkDim, spacing: 1.5 }).setOrigin(0.5);
    this.bestText = this.text(0, 0, '', { font: 'mono', size: 13, color: css.inkDim, spacing: 1.5 }).setOrigin(0.5);
    this.flavorText = this.text(0, 0, '', { size: 14, color: css.magenta, spacing: 1.2 }).setOrigin(0.5);
    this.retryPill = makeButton(this, { label: 'TAP TO RETRY', width: 184, onPress: () => this.play(this.level) });
    this.overLevels = makeButton(this, { label: 'LEVELS', width: 110, style: 'ghost', onPress: () => this.showSelect() });
    this.overMenu = makeButton(this, { label: 'MENU', width: 110, style: 'ghost', onPress: () => this.showMenu() });
    this.buildSpinBanner();

    this.over = this.add.container(0, 0, [
      this.causeText,
      this.scoreText,
      this.timeText,
      this.bestText,
      this.flavorText,
      this.retryPill,
      this.overLevels,
      this.overMenu,
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
    this.abilityPill?.setPosition(w / 2, h - 40);

    const titleSize = Phaser.Math.Clamp(w * 0.14, 44, 96);
    this.titleLayers.forEach((t) => t.setFontSize(titleSize));
    const cy = this.titleY();
    this.titleLayers.forEach((t) => t.setPosition(w / 2, cy));
    this.subtitle.setPosition(w / 2, cy + titleSize * 0.62);
    const my = Math.max(cy + titleSize * 0.62 + 70, h * 0.5);
    this.playBtn.setPosition(w / 2, my);
    this.playNote.setPosition(w / 2, my + 42);
    this.survivalBtn.setPosition(w / 2, my + 96);
    this.survivalNote.setPosition(w / 2, my + 132);
    this.skinsBtn.setPosition(w / 2, my + 186);
    this.skinsNote.setPosition(w / 2, my + 222);
    this.statsLine.setPosition(w / 2, h - 28);

    this.scrim.setSize(w, h);
    const oy = h * 0.4;
    this.causeText.setPosition(w / 2, oy - 76);
    this.scoreText.setPosition(w / 2, oy - 18).setFontSize(Phaser.Math.Clamp(w * 0.17, 52, 104));
    this.timeText.setPosition(w / 2, oy + 38);
    this.bestText.setPosition(w / 2, oy + 60);
    this.flavorText.setPosition(w / 2, oy + 92);
    this.retryPill.setPosition(w / 2, oy + 150);
    this.overLevels.setPosition(w / 2 - 62, oy + 212);
    this.overMenu.setPosition(w / 2 + 62, oy + 212);
    this.spinBanner?.setPosition(w / 2, top + 88);

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

  private titleY() {
    return display.size(this).h * 0.24 + display.safeTop();
  }

  /** The main menu: logo, PLAY, SURVIVAL and SKINS. */
  private showMenu() {
    const fromRun = this.mode === 'dead' || this.mode === 'clear';
    this.mode = 'menu';
    this.hideSpinBanner();
    this.fadeOut(this.select.root);
    this.fadeOut(this.shop.root);
    this.fadeOut(this.over);
    this.fadeOut(this.hud);
    if (this.clearScreen.root.visible) this.clearScreen.hide();
    if (fromRun) this.game.events.emit(EV.menu);
    this.tweens.add({ targets: this.scrim, alpha: 0.5, duration: 220 });

    const next = nextLevelToPlay();
    this.playNote.setText(save.totalStars() > 0 ? `NEXT UP  ·  LEVEL ${next}` : '20 LEVELS  ·  4 WORLDS');
    this.survivalNote.setText(save.best > 0 ? `ENDLESS  ·  BEST ${save.best.toFixed(1)} M` : 'ENDLESS  ·  HOW FAR CAN YOU GO?');
    this.skinsNote.setText(`${save.ducks} DUCKS  ·  ${save.skins.size} / ${SKINS.length} SKINS`);

    this.title.setVisible(true).setAlpha(0);
    this.fadeIn(this.title);
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
    const fromRun = this.mode === 'dead' || this.mode === 'clear';
    this.mode = 'skins';
    sfx.swoosh();
    this.hideSpinBanner();
    this.fadeOut(this.title);
    this.fadeOut(this.select.root);
    this.fadeOut(this.over);
    this.fadeOut(this.hud);
    if (this.clearScreen.root.visible) this.clearScreen.hide();
    if (fromRun) this.game.events.emit(EV.menu);
    this.fadeIn(this.scrim);
    this.shop.refresh();
    this.shop.root.setVisible(true).setAlpha(0);
    this.fadeIn(this.shop.root);
  }

  private showSelect() {
    const fromRun = this.mode === 'dead' || this.mode === 'clear';
    this.hideSpinBanner();
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
    this.hideSpinBanner();
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
    this.abilityState = { state: 'ready', frac: 0 };
    this.drawAbilityPill();
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
    this.onHud(d, true);
  }

  private lastHud: HudData = { meters: 0, seconds: 0, goal: null };

  private lastHudDraw = 0;

  /**
   * Redrawing glowing text is expensive (it's re-rendered and re-uploaded to
   * the GPU), so the HUD updates about 12 times a second instead of every
   * frame, and only when the text actually changed.
   */
  private onHud(d: HudData, force = false) {
    this.lastHud = d;
    const now = this.time.now;
    if (!force && now - this.lastHudDraw < 80) return;
    this.lastHudDraw = now;
    setIfChanged(this.distValue, `${d.meters.toFixed(1)} M`);
    setIfChanged(this.subValue, d.goal === null ? `${d.seconds.toFixed(2)} SEC` : `GOAL ${d.goal.toFixed(0)} M`);
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
    this.onHud(d, true);

    const causes = { wall: 'HIT THE WALL', saw: 'SLICED', bomb: 'BLOWN UP' };
    this.causeText.setText(d.warped ? `${causes[d.cause]} IN UNIVERSE 2` : causes[d.cause]);
    this.bestText.setShadow(0, 0, 'transparent', 0);

    // Survival has no level map to go back to, so only MENU.
    this.overLevels.setVisible(d.level !== null);
    this.overMenu.setX(d.level === null ? display.size(this).w / 2 : display.size(this).w / 2 + 62);
    if (d.goal !== null && d.level !== null) {
      const level = levelById(d.level)!;
      const pct = Math.floor((d.meters / d.goal) * 100);
      this.timeText.setText(`${d.meters.toFixed(0)} / ${d.goal.toFixed(0)} M  ·  ${pct}%`);
      this.bestText.setText(`LEVEL ${d.level} · ${WORLDS[level.world].name}`).setColor(hexColor(WORLDS[level.world].color));
      this.flavorText.setText(
        d.ducks > 0 ? `${d.ducks} DUCKS LOST. FINISH TO KEEP THEM.` : d.goal - d.meters < 30 ? 'SO CLOSE.' : '',
      );
    } else {
      this.rightValue.setText(`${d.best.toFixed(1)} M`);
      this.timeText.setText(`${d.seconds.toFixed(2)} SEC`);
      this.bestText.setText(d.isNewBest ? 'NEW BEST' : `BEST ${d.best.toFixed(1)} M`);
      this.bestText.setColor(d.isNewBest ? css.orange : css.inkDim);
      if (d.isNewBest) this.bestText.setShadow(0, 0, css.orange, 14, false, true);
      this.flavorText.setText(d.ducks > 0 ? `+${d.ducks} DUCKS  ·  ${save.ducks} IN TOTAL` : this.flavorLine(d));
      if (d.ducks > 0) this.maybeShowSpinBanner();
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
    [this.retryPill, this.overLevels, this.overMenu].forEach((b, i) => {
      b.setScale(0.9).setAlpha(0);
      this.tweens.add({ targets: b, alpha: 1, scale: 1, delay: 350 + i * 80, duration: 300, ease: 'Back.easeOut' });
    });
  }

  private onCleared(d: ClearData) {
    this.mode = 'clear';
    this.tapsFrom = this.time.now + 1200;
    this.onHud(d, true);
    this.fadeOut(this.hud);
    this.fadeIn(this.scrim);
    this.clearScreen.show(d);
    if (d.ducks > 0) this.maybeShowSpinBanner(1600);
  }

  // --- "You can spin" banner -------------------------------------------------

  private spinBanner!: Phaser.GameObjects.Container;
  private spinBannerText!: Phaser.GameObjects.Text;

  private buildSpinBanner() {
    const w = 300;
    const h = 74;
    const bg = this.add.graphics();
    for (let i = 3; i >= 1; i--) {
      bg.fillStyle(0xffd21f, 0.07).fillRoundedRect(-w / 2 - i * 5, -h / 2 - i * 5, w + i * 10, h + i * 10, 20 + i * 5);
    }
    bg.fillStyle(0x1c1404, 0.95).fillRoundedRect(-w / 2, -h / 2, w, h, 20);
    bg.lineStyle(2, 0xffd21f, 1).strokeRoundedRect(-w / 2, -h / 2, w, h, 20);
    const icon = this.add.image(-w / 2 + 34, 0, 'duck').setScale(0.42);
    const title = this.text(-w / 2 + 64, -14, 'DUCK-O-MATIC READY!', { size: 15, color: '#ffd21f', spacing: 1 }).setOrigin(0, 0.5);
    this.spinBannerText = this.text(-w / 2 + 64, 10, '', { font: 'mono', size: 10, color: css.ink, spacing: 1 }).setOrigin(0, 0.5);
    const go = this.text(w / 2 - 18, 10, 'SPIN NOW', { size: 12, color: '#ffd21f', spacing: 2 }).setOrigin(1, 0.5);
    const hit = this.add.zone(0, 0, w, h).setInteractive({ useHandCursor: true });
    hit.on('pointerdown', () => {
      sfx.click();
      this.hideSpinBanner();
      this.showSkins();
    });
    this.spinBanner = this.add.container(0, 0, [bg, icon, title, this.spinBannerText, go, hit]).setVisible(false);
  }

  /** Pops up when you've got enough ducks for a pull on the slot machine. */
  private maybeShowSpinBanner(delay = 900) {
    if (save.ducks < SPIN_COST) return;
    this.spinBannerText.setText(`YOU HAVE ${save.ducks} DUCKS`);
    const b = this.spinBanner;
    this.tweens.killTweensOf(b);
    b.setVisible(true).setAlpha(0).setScale(0.6);
    this.tweens.add({
      targets: b,
      alpha: 1,
      scale: 1,
      delay,
      duration: 420,
      ease: 'Back.easeOut',
      onStart: () => sfx.reveal('rare'),
    });
    this.tweens.add({ targets: b, angle: { from: -2, to: 2 }, delay: delay + 420, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  private hideSpinBanner() {
    const b = this.spinBanner;
    if (!b.visible) return;
    this.tweens.killTweensOf(b);
    this.tweens.add({ targets: b, alpha: 0, duration: 150, onComplete: () => b.setVisible(false).setAngle(0) });
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
      const { w } = display.size(this);
      const cy = this.titleY();
      m.setPosition(w / 2 - amp + (glitching ? Math.random() * 4 : 0), cy + (glitching ? Math.random() * 3 - 1.5 : 0));
      c.setPosition(w / 2 + amp - (glitching ? Math.random() * 4 : 0), cy - (glitching ? Math.random() * 3 - 1.5 : 0));
      main.setPosition(w / 2, cy).setScale(1 + Math.sin(t * 2) * 0.01);
      if (this.mode === 'menu') this.playBtn.setScale(1 + 0.02 * Math.sin(t * 3));
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
