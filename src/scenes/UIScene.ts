import Phaser from 'phaser';
import { EV, shared, type RunMode, type ClearData, type DeathData, type FrenzyData, type HudData } from '../game/shared';
import { display } from '../game/display';
import { save } from '../game/storage';
import { css, palette } from '../game/palette';
import { LEVELS, WORLDS, isHardLevel, lastOfSet, levelById, levelName, levelNumber } from '../game/levels';
import { sfx } from '../audio/Sfx';
import { music } from '../audio/Music';
import { hexColor, makeButton, makeIconButton, makeText, type Button, type IconButton, type TextOpts } from '../ui/widgets';
import { LevelSelect, nextLevelToPlay } from '../ui/LevelSelect';
import { skinById, skinTexture, RARITIES, SPIN_COST } from '../game/skins';
import { abilityFor } from '../game/abilities';
import { ClearScreen } from '../ui/ClearScreen';
import { SkinShop } from '../ui/SkinShop';
import { HowToPlay } from '../ui/HowToPlay';
import { progress } from '../game/progress';
import { DailyScreen } from '../ui/DailyScreen';
import { RecordsScreen } from '../ui/RecordsScreen';
import { NotifyBanner } from '../ui/NotifyBanner';
import { readJSON, writeJSON } from '../game/persist';
import { TEX, DUCK_RES } from '../fx/textures';
import { renderCard, type CardInfo } from '../ui/shareCard';
import { calmMoment, share } from '../native/bridge';
import { todaysGuest } from '../game/guest';

type Mode = 'menu' | 'select' | 'skins' | 'howto' | 'daily' | 'records' | 'play' | 'paused' | 'countdown' | 'dead' | 'clear';

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
/** Tip cards shown once, right before the level where they matter. */
const LEVEL_TIPS: Record<number, number> = {
  2: HowToPlay.CARD.perfect,
  3: HowToPlay.CARD.power,
  4: HowToPlay.CARD.ducks,
  6: HowToPlay.CARD.danger,
};
const TIPS_KEY = 'dontdie_tips_seen';
/** The one-time "your skins live in the REACTOR" bubble on the menu. */
const REACTOR_TIP_KEY = 'dontdie_tip_reactor';

/** Bright party colours that all read well on black (no deep blue). */
const PARTY_COLORS = [0xffd21f, 0xff9a2e, 0xff5cb8, 0x2be8ff, 0x7cff6b];

function setIfChanged(t: { text: string; setText(s: string): unknown }, s: string) {
  if (t.text !== s) t.setText(s);
}

export class UIScene extends Phaser.Scene {
  private mode: Mode = 'menu';
  private tipsSeen = new Set<number>(readJSON<number[]>(TIPS_KEY, []));
  /** The level being played, or null for survival. */
  private level: number | null = null;
  /** Ignore background taps until this time, so a panicked tap doesn't skip a screen. */
  private tapsFrom = 0;

  private hud!: Phaser.GameObjects.Container;
  private distLabel!: Phaser.GameObjects.Text;
  // Numbers that change every frame are BitmapText (glowFont.ts): free to update.
  private distValue!: Phaser.GameObjects.BitmapText;
  private subValue!: Phaser.GameObjects.BitmapText;
  private rightLabel!: Phaser.GameObjects.Text;
  private rightValue!: Phaser.GameObjects.BitmapText;
  private progress!: Phaser.GameObjects.Graphics;
  private comboText!: Phaser.GameObjects.Text;
  private comboBadge!: Phaser.GameObjects.Graphics;
  private musicBtn!: IconButton;
  private soundBtn!: IconButton;
  private fxBtn!: IconButton;
  private pauseBtn!: IconButton;

  private title!: Phaser.GameObjects.Container;
  private titleLayers: Phaser.GameObjects.Text[] = [];
  private subtitle!: Phaser.GameObjects.Text;
  private statsLine!: Phaser.GameObjects.Text;
  private playBtn!: Button;
  private levelsBtn!: Button;
  private survivalBtn!: Button;
  private skinsBtn!: Button;
  private dailyBtn!: Button;
  private helpBtn!: IconButton;
  private recordsBtn!: IconButton;
  /** The menu's bottom panel; the demo run plays above it. */
  private dock!: Phaser.GameObjects.Graphics;
  private howTo!: HowToPlay;

  private frenzy!: Phaser.GameObjects.Container;
  private frenzyTitle!: Phaser.GameObjects.Text;
  private frenzySub!: Phaser.GameObjects.Text;
  private frenzyCount!: Phaser.GameObjects.BitmapText;
  private frenzyMax!: Phaser.GameObjects.Text;
  private frenzyBar!: Phaser.GameObjects.Graphics;

  private scrim!: Phaser.GameObjects.Rectangle;
  private vignette!: Phaser.GameObjects.Image;
  private select!: LevelSelect;
  private clearScreen!: ClearScreen;
  private shop!: SkinShop;
  private daily!: DailyScreen;
  private records!: RecordsScreen;
  private banner!: NotifyBanner;
  /** What RETRY replays. */
  private runMode: RunMode = 'level';
  private dailyDot!: Phaser.GameObjects.Graphics;

  private over!: Phaser.GameObjects.Container;
  private causeText!: Phaser.GameObjects.Text;
  private scoreText!: Phaser.GameObjects.BitmapText;
  private overPlate!: Phaser.GameObjects.Graphics;
  private overBar!: Phaser.GameObjects.Graphics;
  private tipText!: Phaser.GameObjects.Text;
  private confetti!: Phaser.GameObjects.Particles.ParticleEmitter;
  /** Best progress (0..1) on a level, for the tick on the death card. Set by progress tracking. */
  levelBest: (id: number) => number | null = () => null;
  private timeText!: Phaser.GameObjects.Text;
  private bestText!: Phaser.GameObjects.Text;
  private flavorText!: Phaser.GameObjects.Text;
  /** After a Daily Run: "LIKE <GUEST>? FIRE UP THE REACTOR", opens the shop. */
  private guestLink!: Phaser.GameObjects.Text;
  // CONTINUE on the death card (levels only: GameScene decides when it's on offer).
  private continueBtn!: Button;
  private continueRing!: Phaser.GameObjects.Graphics;
  private continueDuck!: Phaser.GameObjects.Image;
  private continueNote!: Phaser.GameObjects.Text;
  /** The CONTINUE offer on screen: its price, when it started and runs out, when taps start to count. */
  private offer: { cost: number; from: number; until: number; armAt: number; death: DeathData } | null = null;
  private retryPill!: Button;
  private overLevels!: Button;
  private overMenu!: Button;
  private overShare!: IconButton;
  /** The result card for sharing, rendered as soon as a result shows (sharing must start right on the tap). */
  private card: { info: CardInfo; text: string; blob: Promise<Blob | null> } | null = null;
  private lastClear: ClearData | null = null;

  private glitchUntil = 0;
  private toastText!: Phaser.GameObjects.Text;
  private konami: string[] = [];

  constructor() {
    super('UI');
  }

  create() {
    const cam = this.cameras.main;
    cam.setOrigin(0, 0).setZoom(display.dpr);
    // Progress tracking (missions, records, achievements, daily) listens to the game.
    progress.attach(this.game);
    this.levelBest = (id: number) => {
      const b = progress.levelBest(id).best;
      return b > 0 ? b : null;
    };
    // Snap the UI to whole pixels: centred text never lands on half pixels and smears.
    cam.roundPixels = true;

    // Creation order is drawing order: vignette, HUD, scrim, then the screens.
    // The vignette darkens the screen edges so the eye goes to the middle.
    // It's one stretched image over the game, which costs almost nothing.
    this.vignette = this.add.image(0, 0, TEX.vignette).setOrigin(0, 0);
    this.buildHud();
    this.scrim = this.add.rectangle(0, 0, 10, 10, 0x020305, 0.62).setOrigin(0, 0).setAlpha(0);
    this.buildTitle();
    this.buildGameOver();
    this.select = new LevelSelect(
      this,
      (level) => this.play(level),
      () => this.toggleRainbow(),
      () => this.showMenu(),
      (msg) => this.toast(msg, 1800),
    );
    this.daily = new DailyScreen(this, { play: () => this.playDaily(), back: () => this.showMenu() });
    this.records = new RecordsScreen(this, { back: () => this.showMenu() });
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
      share: () => this.shareResult(),
    });
    // Finishing HOW TO PLAY before ever clearing level 1 starts level 1.
    this.howTo = new HowToPlay(this, (finished) => (finished && save.starsFor(1) === 0 ? this.play(1) : this.showMenu()));
    this.buildToggles();
    this.buildAbilityPill();
    this.buildFrenzy();
    this.buildPause();
    this.buildCutIn();
    // Banners (missions, achievements, records) draw above everything.
    this.banner = new NotifyBanner(this);
    this.toastText = this.text(0, 0, '', { size: 15, glow: true, spacing: 2 }).setOrigin(0.5).setAlpha(0);

    this.layout();
    this.showMenu();
    // First launch goes straight to the menu: PLAY starts level 1, which
    // teaches itself (slow corners with TAP! hints). HOW TO PLAY is one tap away.

    // Several fingers can tap at once (handy in a DUCK FRENZY).
    this.input.addPointer(2);

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
      } else if ((e.code === 'Escape' || e.code === 'KeyP') && this.mode === 'play') {
        this.game.events.emit(EV.pause);
      } else if (e.code === 'Escape' && this.mode === 'paused') {
        this.resume();
      } else if (e.code === 'Escape' && this.mode !== 'play' && this.mode !== 'menu' && this.mode !== 'countdown') {
        this.showMenu();
      }
    });

    this.game.events.on(EV.started, this.onStarted, this);
    this.game.events.on(EV.hud, this.onHud, this);
    this.game.events.on(EV.died, this.onDied, this);
    this.game.events.on(EV.cleared, this.onCleared, this);
    this.game.events.on(EV.combo, this.onCombo, this);
    this.game.events.on(EV.ability, this.onAbility, this);
    this.game.events.on(EV.frenzy, this.onFrenzy, this);
    this.game.events.on(EV.pause, this.onPauseRequest, this);
    this.game.events.on(EV.respawn, this.onRespawn, this);
    // Leaving the app (home button, a call, the notification shade) pauses the run.
    const onVisibility = () => {
      if (document.hidden) this.game.events.emit(EV.pause);
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onVisibility);
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
    // Long messages wrap instead of running off a narrow screen.
    this.toastText.setWordWrapWidth(w - 48).setAlign('center');
    this.toastText.setText(msg).setPosition(w / 2, h - 100 - display.safeBottom());
    this.tweens.killTweensOf(this.toastText);
    this.toastText.setAlpha(1).setScale(1.4);
    this.tweens.add({ targets: this.toastText, scale: 1, duration: 250, ease: 'Back.easeOut' });
    this.tweens.add({ targets: this.toastText, alpha: 0, delay: hold, duration: 400 });
  }

  /** True while a run is on screen (playing, paused, or its result showing). */
  private inRun() {
    return this.mode === 'dead' || this.mode === 'clear' || this.mode === 'paused' || this.mode === 'countdown' || this.mode === 'play';
  }

  private onBackgroundTap() {
    if (this.time.now < this.tapsFrom) return;
    switch (this.mode) {
      case 'paused':
        this.resume();
        break;
      case 'play':
        this.game.events.emit(EV.tap);
        break;
      case 'dead':
        this.retry();
        break;
      case 'clear':
        this.nextLevel();
        break;
      case 'howto':
        this.howTo.tap();
        break;
    }
  }

  // --- Building blocks ------------------------------------------------------

  private text(x: number, y: number, str: string, o: TextOpts) {
    return makeText(this, x, y, str, o);
  }

  private refreshButtons() {
    for (const b of [this.musicBtn, this.pauseMusic]) b?.setIcon(save.music ? 'music' : 'musicOff', save.music);
    for (const b of [this.soundBtn, this.pauseSound]) b?.setIcon(save.sound ? 'sound' : 'mute', save.sound);
    for (const b of [this.fxBtn, this.pauseFx]) b?.setIcon('sparkle', !save.fxReduced);
  }

  private buildHud() {
    this.progress = this.add.graphics();
    this.distLabel = this.text(0, 0, 'DISTANCE', { font: 'mono', size: 10, color: css.inkDim, spacing: 1.6 });
    this.distValue = this.add.bitmapText(0, 0, 'hud', '0.0 M', 28);
    this.subValue = this.add.bitmapText(0, 0, 'hudSmall', '', 11).setLetterSpacing(0.5);
    this.rightLabel = this.text(0, 0, 'BEST', { font: 'mono', size: 10, color: css.inkDim, spacing: 1.6 }).setOrigin(1, 0);
    this.rightValue = this.add.bitmapText(0, 0, 'hud', '', 28).setOrigin(1, 0);
    this.comboBadge = this.add.graphics().setAlpha(0);
    this.comboText = this.text(0, 0, '', { size: 18, color: css.orange, glow: true, spacing: 1.5 })
      .setOrigin(0.5)
      .setAlpha(0);

    this.hud = this.add.container(0, 0, [
      this.progress,
      this.distLabel,
      this.distValue,
      this.subValue,
      this.rightLabel,
      this.rightValue,
      this.comboBadge,
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
    if (changed && a.state === 'active') this.cutIn();
    this.abilityState = a;
    this.abilityPill.setVisible(a.state !== 'locked');
    if (!changed && this.time.now - this.lastAbilityDraw < 80) return;
    this.lastAbilityDraw = this.time.now;
    this.drawAbilityPill();
  }

  private drawAbilityPill() {
    const skin = skinById(shared.skin);
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
      state === 'ready' ? 'TAP 4 TIMES FAST TO ACTIVATE' : state === 'active' ? `${Math.ceil(frac * 10)} SEC` : state === 'used' ? 'USED THIS LEVEL' : 'RECHARGING';
    setIfChanged(this.abilityStatus, status);
    this.abilityStatus.setColor(state === 'ready' ? hexColor(RARITIES[skin.rarity].color) : css.inkDim);
  }

  // --- DUCK FRENZY overlay ------------------------------------------------------

  private frenzyActive = false;

  private buildFrenzy() {
    this.frenzyTitle = this.text(0, -70, 'DUCK FRENZY!', { size: 38, glow: '#ffd21f', spacing: 2 }).setOrigin(0.5);
    this.frenzySub = this.text(0, -26, 'TAP TAP TAP!', { size: 18, color: '#ffe680', spacing: 3 }).setOrigin(0.5);
    // The counter changes on every tap: a bitmap font, so that's free.
    this.frenzyCount = this.add.bitmapText(0, 40, 'big', '0', 84).setOrigin(0.5).setTint(0xffd21f);
    const plate = this.add.graphics();
    plate.fillStyle(0x0a0f18, 0.82).fillRoundedRect(-150, -112, 300, 256, 26);
    plate.lineStyle(1.5, 0xffd21f, 0.6).strokeRoundedRect(-150, -112, 300, 256, 26);
    this.frenzyMax = this.text(0, 96, '', { font: 'mono', size: 12, color: css.inkDim, spacing: 2 }).setOrigin(0.5);
    this.frenzyBar = this.add.graphics();
    this.frenzy = this.add.container(0, 0, [plate, this.frenzyTitle, this.frenzySub, this.frenzyCount, this.frenzyMax, this.frenzyBar]);
    this.frenzy.setVisible(false);
  }

  private onFrenzy(f: FrenzyData) {
    if (f.phase === 'start') {
      this.frenzyActive = true;
      this.tweens.killTweensOf(this.frenzy);
      this.frenzy.setVisible(true).setAlpha(1).setScale(0.4);
      this.tweens.add({ targets: this.frenzy, scale: 1, duration: 420, ease: 'Back.easeOut' });
      this.frenzySub.setText('TAP TAP TAP!');
      this.frenzyTitle.setText('DUCK FRENZY!');
    }
    const prev = this.frenzyCount.text;
    setIfChanged(this.frenzyCount, String(f.count));
    if (prev !== this.frenzyCount.text) {
      this.tweens.killTweensOf(this.frenzyCount);
      this.frenzyCount.setScale(1.25);
      this.tweens.add({ targets: this.frenzyCount, scale: 1, duration: 120 });
    }
    setIfChanged(this.frenzyMax, `DUCKS  ·  MAX ${f.max}`);
    const w = 220;
    const g = this.frenzyBar.clear();
    g.fillStyle(0x0a0e14, 0.8).fillRoundedRect(-w / 2, 118, w, 10, 5);
    g.fillStyle(f.frac > 0.25 ? 0xffd21f : 0xff5a4a, 1).fillRoundedRect(-w / 2, 118, Math.max(10, w * f.frac), 10, 5);

    if (f.phase === 'end') {
      this.frenzyActive = false;
      this.frenzySub.setScale(1).setText(f.count >= f.max ? 'MAXED OUT!' : f.count >= 40 ? 'INSANE!' : 'NICE!');
      this.frenzyTitle.setText(`+${f.count} DUCKS`).setTint(0xffd21f);
      this.tweens.add({
        targets: this.frenzy,
        alpha: 0,
        delay: 1100,
        duration: 300,
        onComplete: () => this.frenzy.setVisible(false),
      });
    }
  }

  private buildToggles() {
    // Music and sound effects switch off separately (see Sfx.ts and Music.ts).
    const toggleMusic = () => {
      save.setMusic(!save.music);
      music.setEnabled(save.music);
      this.refreshButtons();
      this.toast(save.music ? 'MUSIC ON' : 'MUSIC OFF', 900);
    };
    const toggleSound = () => {
      save.setSound(!save.sound);
      sfx.setSound(save.sound);
      this.refreshButtons();
      this.toast(save.sound ? 'SOUND ON' : 'SOUND OFF', 900);
    };
    const toggleFx = () => {
      save.setFxReduced(!save.fxReduced);
      this.game.events.emit(EV.fxChanged);
      this.refreshButtons();
      this.toast(save.fxReduced ? 'REDUCED EFFECTS' : 'FULL EFFECTS', 900);
    };
    this.musicBtn = makeIconButton(this, 'music', toggleMusic);
    this.musicBtn.on('toggle', toggleMusic);
    this.soundBtn = makeIconButton(this, 'sound', toggleSound);
    this.soundBtn.on('toggle', toggleSound);
    this.fxBtn = makeIconButton(this, 'sparkle', toggleFx);
    this.fxBtn.on('toggle', toggleFx);
    this.pauseBtn = makeIconButton(this, 'pause', () => this.game.events.emit(EV.pause));
    this.refreshButtons();
  }

  // --- Pause ----------------------------------------------------------------

  private pauseSheet!: Phaser.GameObjects.Container;
  private pauseMusic!: IconButton;
  private pauseSound!: IconButton;
  private pauseFx!: IconButton;
  private pausePlate!: Phaser.GameObjects.Graphics;
  private countdown!: Phaser.GameObjects.BitmapText;

  private buildPause() {
    this.pausePlate = this.add.graphics();
    const title = this.text(0, -96, 'PAUSED', { size: 34, glow: true, spacing: 3 }).setOrigin(0.5);
    const resume = makeButton(this, { label: 'RESUME', icon: 'play', width: 240, height: 56, onPress: () => this.resume() });
    resume.setY(-12);
    const retry = makeButton(this, { label: 'RETRY', icon: 'retry', width: 114, style: 'ghost', onPress: () => this.retry() });
    retry.setPosition(-63, 60);
    const menu = makeButton(this, { label: 'MENU', icon: 'home', width: 114, style: 'ghost', onPress: () => this.showMenu() });
    menu.setPosition(63, 60);
    // Music, sound and effects toggles live inside the sheet while paused.
    this.pauseMusic = makeIconButton(this, 'music', () => this.musicBtn.emit('toggle'));
    this.pauseMusic.setPosition(-56, 122);
    this.pauseSound = makeIconButton(this, 'sound', () => this.soundBtn.emit('toggle'));
    this.pauseSound.setPosition(0, 122);
    this.pauseFx = makeIconButton(this, 'sparkle', () => this.fxBtn.emit('toggle'));
    this.pauseFx.setPosition(56, 122);
    this.pauseSheet = this.add
      .container(0, 0, [this.pausePlate, title, resume, retry, menu, this.pauseMusic, this.pauseSound, this.pauseFx])
      .setVisible(false);
    this.refreshButtons();
    this.countdown = this.add.bitmapText(0, 0, 'big', '', 96).setOrigin(0.5).setVisible(false);
  }

  /** The run was paused (pause button, or the app went to the background). */
  private onPauseRequest() {
    if (this.mode !== 'play') return;
    this.mode = 'paused';
    this.tweens.killTweensOf(this.countdown);
    this.countdown.setVisible(false);
    this.pauseSheet.setVisible(true).setAlpha(0).setScale(0.96);
    this.tweens.add({ targets: this.pauseSheet, alpha: 1, scale: 1, duration: 180, ease: 'Back.easeOut' });
    this.tweens.add({ targets: this.scrim, alpha: 0.7, duration: 180 });
    this.tapsFrom = this.time.now + 250;
  }

  /** 3, 2, 1, go: time to get your thumb ready before the ball moves again. */
  private resume() {
    if (this.mode !== 'paused') return;
    this.mode = 'countdown';
    this.fadeOut(this.pauseSheet);
    this.tweens.add({ targets: this.scrim, alpha: 0, duration: 400 });
    const { w, h } = display.size(this);
    this.countdown.setPosition(w / 2, h * 0.42);
    const tick = (n: number) => {
      if (this.mode !== 'countdown') return;
      if (n === 0) {
        this.countdown.setVisible(false);
        this.mode = 'play';
        this.game.events.emit(EV.resume);
        return;
      }
      sfx.click();
      this.countdown.setText(String(n)).setVisible(true).setAlpha(1).setScale(1.5);
      this.tweens.add({ targets: this.countdown, scale: 1, alpha: 0.2, duration: 420, ease: 'Cubic.easeOut' });
      this.time.delayedCall(450, () => tick(n - 1));
    };
    tick(3);
  }

  private buildTitle() {
    const make = (color: string, alpha: number) =>
      this.text(0, 0, 'DUCKWISE', { size: 72, color, glow: color === css.ink }).setOrigin(0.5).setAlpha(alpha);
    // Three copies of the title: magenta and cyan ghosts behind a white one.
    // Nudging the ghosts apart now and then gives a chromatic "glitch".
    const magenta = make(css.magenta, 0.75).setBlendMode(Phaser.BlendModes.ADD);
    const cyan = make(css.cyan, 0.75).setBlendMode(Phaser.BlendModes.ADD);
    const main = make(css.ink, 1);
    main.setShadow(0, 0, css.cyan, 24, false, true);
    this.titleLayers = [magenta, cyan, main];

    this.subtitle = this.text(0, 0, 'ONE TAP. ALWAYS RIGHT.', { font: 'mono', size: 12, color: '#8fa3b5', spacing: 4 }).setOrigin(0.5);
    this.statsLine = this.text(0, 0, '', { font: 'mono', size: 11, color: '#8fa3b5', spacing: 1.2 }).setOrigin(0.5);

    // Main menu: the game opens here. The demo run plays in the top half,
    // behind the logo; the buttons sit on a dark dock in the bottom half.
    this.dock = this.add.graphics();
    this.playBtn = makeButton(this, { label: 'PLAY', icon: 'play', width: 300, height: 60, onPress: () => this.playNext() });
    this.levelsBtn = makeButton(this, { label: 'LEVELS', icon: 'levels', width: 146, height: 46, style: 'ghost', onPress: () => this.showSelect() });
    this.survivalBtn = makeButton(this, {
      label: 'SURVIVAL',
      icon: 'infinity',
      width: 146,
      height: 46,
      style: 'ghost',
      color: 0xff9a2e,
      onPress: () => this.play(null),
    });
    // The QUACK REACTOR: new skins come out of it, and your collection lives in it.
    this.skinsBtn = makeButton(this, {
      label: 'REACTOR',
      icon: 'sparkle',
      width: 146,
      height: 46,
      style: 'ghost',
      color: 0xffd21f,
      onPress: () => this.showSkins(),
    });
    this.dailyBtn = makeButton(this, {
      label: 'DAILY',
      icon: 'flame',
      width: 146,
      height: 46,
      style: 'ghost',
      color: 0xff5cb8,
      onPress: () => this.showDaily(),
    });
    // A gold dot on DAILY when there's something to collect today.
    this.dailyDot = this.add.graphics();
    this.dailyDot.fillStyle(0xffd21f, 1).fillCircle(0, 0, 5).lineStyle(2, 0x070b12, 1).strokeCircle(0, 0, 5);
    this.helpBtn = makeIconButton(this, 'help', () => this.showHowTo(), 0x8fa3b5);
    this.recordsBtn = makeIconButton(this, 'trophy', () => this.showRecords(), 0xffd21f);

    // (Named `title` for history: it is the whole main menu.)
    this.title = this.add.container(0, 0, [
      this.dock,
      ...this.titleLayers,
      this.subtitle,
      this.playBtn,
      this.levelsBtn,
      this.survivalBtn,
      this.skinsBtn,
      this.dailyBtn,
      this.dailyDot,
      this.helpBtn,
      this.recordsBtn,
      this.statsLine,
    ]);
  }

  private logoLit = false;

  /**
   * The first time the menu appears the logo switches on like a neon sign:
   * a few nervous flickers, then full power.
   */
  private igniteLogo() {
    this.logoLit = true;
    const layers = this.titleLayers;
    const steps: [number, number][] = [
      [0, 0],
      [140, 0.7],
      [200, 0.05],
      [320, 0.9],
      [370, 0.15],
      [430, 0.5],
      [470, 0.1],
      [600, 1],
    ];
    for (const [at, a] of steps) {
      this.time.delayedCall(at, () => {
        layers.forEach((l, i) => l.setAlpha(i === 2 ? a : a * 0.75));
        if (a > 0.6) sfx.click();
      });
    }
  }

  /** PLAY goes straight into the next level to beat. */
  private playNext() {
    this.play(nextLevelToPlay());
  }

  /** Fade out every screen (before showing another one). */
  private hideScreens() {
    this.hideSpinBanner();
    this.hideReactorTip();
    for (const c of [this.title, this.select.root, this.shop.root, this.howTo.root, this.daily.root, this.records.root, this.over, this.hud]) {
      this.fadeOut(c);
    }
    if (this.clearScreen.root.visible) this.clearScreen.hide();
  }

  /** DAILY: today's run, the streak and the three missions. */
  private showDaily() {
    const fromRun = this.inRun();
    this.hideScreens();
    this.mode = 'daily';
    sfx.swoosh();
    if (fromRun) this.game.events.emit(EV.menu);
    this.fadeIn(this.scrim, 0.85);
    this.daily.refresh();
    this.daily.root.setVisible(true).setAlpha(0);
    this.fadeIn(this.daily.root);
  }

  /** RECORDS: lifetime stats and achievements. */
  private showRecords() {
    const fromRun = this.inRun();
    this.hideScreens();
    this.mode = 'records';
    sfx.swoosh();
    if (fromRun) this.game.events.emit(EV.menu);
    this.fadeIn(this.scrim, 0.85);
    this.records.refresh();
    this.records.root.setVisible(true).setAlpha(0);
    this.fadeIn(this.records.root);
  }

  /** Today's Daily Run (same track for everyone today). */
  private playDaily() {
    this.level = null;
    this.runMode = 'daily';
    this.hideScreens();
    this.pauseSheet.setVisible(false);
    this.countdown.setVisible(false);
    this.frenzy.setVisible(false);
    this.tweens.add({ targets: this.scrim, alpha: 0, duration: 180 });
    this.game.events.emit(EV.play, { level: null, daily: true });
  }

  /** RETRY replays whatever was played last. */
  private retry() {
    if (this.runMode === 'daily') this.playDaily();
    else this.play(this.level);
  }

  private buildGameOver() {
    // The result card: a dark plate in the middle of the screen.
    this.overPlate = this.add.graphics();
    this.overBar = this.add.graphics();
    this.causeText = this.text(0, 0, '', { size: 14, color: css.magenta, spacing: 3 }).setOrigin(0.5);
    this.scoreText = this.add.bitmapText(0, 0, 'big', '0', 80).setOrigin(0.5);
    this.timeText = this.text(0, 0, '', { font: 'mono', size: 12, color: '#8fa3b5', spacing: 1.2 }).setOrigin(0.5);
    this.bestText = this.text(0, 0, '', { size: 15, color: css.inkDim, spacing: 2 }).setOrigin(0.5);
    this.tipText = this.text(0, 0, '', { size: 13, color: '#8fa3b5', spacing: 0.5 }).setOrigin(0.5).setAlign('center');
    this.tipText.setWordWrapWidth(270);
    this.flavorText = this.text(0, 0, '', { size: 14, color: css.magenta, spacing: 1.2 }).setOrigin(0.5);
    this.guestLink = this.text(0, 0, '', { size: 13, color: '#ffd21f', spacing: 1.2 }).setOrigin(0.5).setVisible(false);
    this.guestLink.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      if (this.mode !== 'dead' || !this.guestLink.visible || this.over.getData('inactive')) return;
      sfx.unlock();
      sfx.click();
      this.showSkins();
    });
    this.retryPill = makeButton(this, { label: 'RETRY', icon: 'retry', width: 226, height: 56, onPress: () => this.retry() });
    this.overLevels = makeButton(this, { label: 'LEVELS', icon: 'levels', width: 134, style: 'ghost', onPress: () => this.showSelect() });
    this.overMenu = makeButton(this, { label: 'MENU', icon: 'home', width: 134, style: 'ghost', onPress: () => this.showMenu() });
    this.overShare = makeIconButton(this, 'share', () => this.shareResult(), palette.cyan, true);
    this.continueBtn = makeButton(this, { label: 'CONTINUE', width: 236, height: 56, color: 0xffd21f, onPress: () => this.continueRun() });
    this.continueRing = this.add.graphics();
    this.continueDuck = this.add.image(0, 0, TEX.duck).setScale(0.26 / DUCK_RES);
    this.continueNote = this.text(0, 0, '', { font: 'mono', size: 11, color: '#8fa3b5', spacing: 1.2 }).setOrigin(0.5);
    this.confetti = this.add
      .particles(0, 0, TEX.shard, {
        emitting: false,
        speed: { min: 180, max: 460 },
        angle: { min: 205, max: 335 },
        gravityY: 700,
        lifespan: { min: 1200, max: 1900 },
        rotate: { min: 0, max: 360 },
        scale: { min: 0.25, max: 0.55 },
        tint: [0xffd21f, 0x2be8ff, 0xff5cb8, 0x7cff6b, 0xffffff],
      })
      .setDepth(50);
    this.buildSpinBanner();

    this.over = this.add.container(0, 0, [
      this.overPlate,
      this.overBar,
      this.causeText,
      this.scoreText,
      this.timeText,
      this.bestText,
      this.tipText,
      this.flavorText,
      this.guestLink,
      this.continueBtn,
      this.continueRing,
      this.continueDuck,
      this.continueNote,
      this.retryPill,
      this.overLevels,
      this.overMenu,
      this.overShare,
    ]);
    this.over.setAlpha(0).setVisible(false);
  }

  private layout() {
    const { w, h } = display.size(this);
    const top = 16 + display.safeTop();
    const side = 16;

    this.distLabel.setPosition(side, top);
    this.distValue.setPosition(side, top + 12);
    this.subValue.setPosition(side, top + 44);
    this.rightLabel.setPosition(w - side, top);
    this.rightValue.setPosition(w - side, top + 12);
    // Music, sound and effects sit top-right in menus; during a run only the
    // pause button shows (no accidental mutes mid-run).
    this.musicBtn.setPosition(w - side - 24 - 104, top + 22);
    this.soundBtn.setPosition(w - side - 24 - 52, top + 22);
    this.fxBtn.setPosition(w - side - 24, top + 22);
    this.pauseBtn.setPosition(w / 2, top + 22);
    this.pauseSheet.setPosition(w / 2, h * 0.45);
    this.pausePlate.clear().fillStyle(0x0a0f18, 0.92).fillRoundedRect(-160, -150, 320, 310, 24);
    this.pausePlate.lineStyle(1.5, 0x1c2a3a, 1).strokeRoundedRect(-160, -150, 320, 310, 24);
    this.comboText.setPosition(w / 2, top + 76);
    this.comboBadge.setPosition(w / 2, top + 76);
    this.abilityPill?.setPosition(w / 2, h - 40);

    const titleSize = Phaser.Math.Clamp(w * 0.17, 48, 100);
    this.titleLayers.forEach((t) => t.setFontSize(titleSize));
    const cy = this.titleY();
    this.titleLayers.forEach((t) => t.setPosition(w / 2, cy));
    this.subtitle.setPosition(w / 2, cy + titleSize * 0.6);
    this.helpBtn.setPosition(side + 24, top + 22);
    this.recordsBtn.setPosition(side + 24 + 52, top + 22);

    // The dock: a dark plate over the bottom of the screen.
    const bottom = h - display.safeBottom();
    const dockH = Math.min(330, Math.max(290, h * 0.4));
    const dockTop = bottom - dockH;
    const dw = Math.min(w - 16, 420);
    this.dock.clear();
    this.dock.fillStyle(0x070b12, 0.9).fillRoundedRect(w / 2 - dw / 2, dockTop, dw, dockH + 40, 28);
    this.dock.lineStyle(1, 0x1c2a3a, 1).strokeRoundedRect(w / 2 - dw / 2, dockTop, dw, dockH + 40, 28);
    this.playBtn.setPosition(w / 2, dockTop + 58);
    this.levelsBtn.setPosition(w / 2 - 78, dockTop + 132);
    this.survivalBtn.setPosition(w / 2 + 78, dockTop + 132);
    this.skinsBtn.setPosition(w / 2 - 78, dockTop + 190);
    this.dailyBtn.setPosition(w / 2 + 78, dockTop + 190);
    this.dailyDot.setPosition(w / 2 + 78 + 66, dockTop + 190 - 18);
    this.statsLine.setPosition(w / 2, dockTop + 244);
    this.scrim.setSize(w, h);
    this.vignette.setDisplaySize(w, h);
    this.layoutOver();

    this.select.layout(w, h, top + 52);
    this.shop.layout(w, h, top + 48);
    this.daily.layout(w, h, top + 4);
    this.records.layout(w, h, top + 4);
    this.banner?.layout(w, h, 8 + display.safeTop());
    this.howTo.layout(w, h, top + 40);
    this.frenzy.setPosition(w / 2, h * 0.3);
    this.clearScreen.layout(w, h);
    this.placeSpinBanner();
    this.drawProgress(this.lastHud);
  }

  // --- Screens --------------------------------------------------------------

  private fadeOut(target: Phaser.GameObjects.Container) {
    if (!target.visible) return;
    // Buttons on a screen that is fading away no longer react.
    target.setData('inactive', true);
    this.tweens.add({ targets: target, alpha: 0, duration: 180, onComplete: () => target.setVisible(false) });
  }

  private fadeIn(target: Phaser.GameObjects.Container | Phaser.GameObjects.Rectangle, alpha = 1) {
    this.tweens.killTweensOf(target);
    if ('setVisible' in target) target.setVisible(true);
    target.setData('inactive', false);
    this.tweens.add({ targets: target, alpha, duration: 220 });
  }

  private titleY() {
    return display.size(this).h * 0.2 + display.safeTop();
  }

  /** The main menu: logo, PLAY, SURVIVAL and SKINS. */
  private showMenu() {
    const fromRun = this.inRun();
    this.pauseSheet.setVisible(false);
    this.countdown.setVisible(false);
    this.mode = 'menu';
    this.banner.setInRun(false);
    this.hideScreens();
    this.fadeOut(this.select.root);
    this.fadeOut(this.shop.root);
    this.fadeOut(this.howTo.root);
    this.fadeOut(this.over);
    this.fadeOut(this.hud);
    if (this.clearScreen.root.visible) this.clearScreen.hide();
    if (fromRun) this.game.events.emit(EV.menu);
    // Light scrim: the demo run should glow through above the dock.
    this.tweens.add({ targets: this.scrim, alpha: 0.18, duration: 220 });

    const badge = progress.dailyBadge();
    this.dailyDot.setVisible(badge.claim || badge.missionsLeft > 0);
    this.dailyBtn.setLabel(badge.streak > 1 ? `DAILY · ${badge.streak}` : 'DAILY');
    const next = nextLevelToPlay();
    this.playBtn.setLabel(save.totalStars() > 0 || next > 1 ? `PLAY  ·  ${levelName(next)}` : 'PLAY');

    this.title.setVisible(true).setAlpha(0);
    this.fadeIn(this.title);
    if (!this.logoLit) this.igniteLogo();
    const stars = save.totalStars();
    const parts = [`${stars} / ${LEVELS.length * 3} STARS`, `${save.ducks} DUCKS`];
    if (save.hardStars() > 0) parts.splice(1, 0, `${save.hardStars()} HARD`);
    if (save.best > 0) parts.push(`BEST ${save.best.toFixed(0)} M`);
    this.statsLine.setText(parts.join('   ·   '));
    this.calmSoon();
    this.maybeShowReactorTip();
  }

  // --- "Your skins live in the REACTOR" ----------------------------------------

  private reactorTip: Phaser.GameObjects.Container | null = null;

  /**
   * Once: a bubble over the REACTOR button saying that's where the skins are
   * (the menu used to have a SKINS button). Not on the very first launch:
   * only once the player has a run behind them.
   */
  private maybeShowReactorTip() {
    if (readJSON<boolean>(REACTOR_TIP_KEY, false) || this.reactorTip) return;
    if (progress.stats().runs < 1 && save.skins.size <= 1) return;
    writeJSON(REACTOR_TIP_KEY, true);
    const { w } = display.size(this);
    const bw = 262;
    const bh = 84;
    const bx = this.skinsBtn.x;
    const by = this.skinsBtn.y - 23 - 14 - bh / 2;
    const cx = Phaser.Math.Clamp(bx, 12 + bw / 2, w - 12 - bw / 2);
    const g = this.add.graphics();
    g.fillStyle(0x140f02, 0.96).fillRoundedRect(-bw / 2, -bh / 2, bw, bh, 16);
    g.lineStyle(2, 0xffd21f, 1).strokeRoundedRect(-bw / 2, -bh / 2, bw, bh, 16);
    // The point, aimed at the button.
    const px = bx - cx;
    g.fillStyle(0x140f02, 0.96).fillTriangle(px - 10, bh / 2 - 1, px + 10, bh / 2 - 1, px, bh / 2 + 12);
    g.lineStyle(2, 0xffd21f, 1).lineBetween(px - 10, bh / 2, px, bh / 2 + 12).lineBetween(px + 10, bh / 2, px, bh / 2 + 12);
    const title = this.text(0, -24, 'NEW: THE QUACK REACTOR', { size: 15, color: '#ffd21f', spacing: 1 }).setOrigin(0.5);
    const body = this.text(0, 2, 'YOUR SKINS LIVE IN HERE NOW.\nFEED IT DUCKS FOR NEW ONES.', { font: 'mono', size: 11, color: css.ink, spacing: 0.5 })
      .setOrigin(0.5)
      .setAlign('center');
    const hint = this.text(0, 30, 'TAP TO CLOSE', { font: 'mono', size: 9, color: '#8fa3b5', spacing: 1.5 }).setOrigin(0.5);
    const tip = this.add.container(cx, by, [g, title, body, hint]).setDepth(900).setAlpha(0).setScale(0.8);
    this.reactorTip = tip;
    this.tweens.add({ targets: tip, alpha: 1, scale: 1, delay: 500, duration: 300, ease: 'Back.easeOut' });
    this.tweens.add({ targets: tip, y: by - 4, delay: 800, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    // Any tap closes it (and still reaches the button underneath). Armed a
    // moment later, so the tap that opened the menu doesn't close it.
    this.time.delayedCall(500, () => this.reactorTip === tip && this.input.once('pointerdown', () => this.hideReactorTip()));
  }

  private hideReactorTip() {
    const tip = this.reactorTip;
    if (!tip) return;
    this.reactorTip = null;
    this.tweens.killTweensOf(tip);
    this.tweens.add({ targets: tip, alpha: 0, scale: 0.9, duration: 160, onComplete: () => tip.destroy() });
  }

  /** Native app: a waiting system prompt (rating, reminders) may show if the player stays here. */
  private calmSoon() {
    const mode = this.mode;
    this.time.delayedCall(1200, () => this.mode === mode && calmMoment());
  }

  /** HOW TO PLAY: animated cards explaining the game. */
  private showHowTo() {
    this.hideScreens();
    this.mode = 'howto';
    sfx.swoosh();
    this.tweens.killTweensOf([this.title, this.scrim]);
    this.fadeOut(this.title);
    this.fadeIn(this.scrim, 0.92);
    this.howTo.show();
    this.howTo.root.setVisible(true).setAlpha(0);
    this.fadeIn(this.howTo.root);
    this.tapsFrom = this.time.now + 300;
  }

  private showSkins() {
    const fromRun = this.inRun();
    this.hideScreens();
    this.mode = 'skins';
    sfx.swoosh();
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
    const fromRun = this.inRun();
    this.hideScreens();
    this.fadeOut(this.shop.root);
    this.mode = 'select';
    this.fadeOut(this.title);
    this.fadeOut(this.over);
    this.fadeOut(this.hud);
    if (this.clearScreen.root.visible) this.clearScreen.hide();
    if (fromRun) this.game.events.emit(EV.menu);

    sfx.swoosh();
    // Re-layout (the level map may have changed since it was last laid out).
    const { w, h } = display.size(this);
    this.select.layout(w, h, 16 + display.safeTop() + 52);
    this.select.showSetOf(this.level ?? nextLevelToPlay());
    this.select.root.setAlpha(0);
    this.fadeIn(this.select.root);
    this.fadeIn(this.scrim);
    this.calmSoon();
  }

  private play(level: number | null) {
    // A one-time tip card right before a level that brings something new.
    const tip = level !== null ? LEVEL_TIPS[level] : undefined;
    if (tip !== undefined && !this.tipsSeen.has(level!)) {
      this.tipsSeen.add(level!);
      writeJSON(TIPS_KEY, [...this.tipsSeen]);
      this.mode = 'howto';
      this.hideSpinBanner();
      this.fadeOut(this.title);
      this.fadeOut(this.over);
      this.fadeOut(this.select.root);
      this.fadeOut(this.hud);
      if (this.clearScreen.root.visible) this.clearScreen.hide();
      this.fadeIn(this.scrim, 0.92);
      this.howTo.showSingle(tip, () => {
        this.fadeOut(this.howTo.root);
        this.play(level);
      });
      this.howTo.root.setVisible(true).setAlpha(0);
      this.fadeIn(this.howTo.root);
      this.tapsFrom = this.time.now + 400;
      return;
    }
    this.level = level;
    this.runMode = level === null ? 'survival' : 'level';
    this.fadeOut(this.howTo.root);
    this.fadeOut(this.daily.root);
    this.fadeOut(this.records.root);
    this.pauseSheet.setVisible(false);
    this.countdown.setVisible(false);
    this.frenzy.setVisible(false);
    this.hideSpinBanner();
    this.fadeOut(this.title);
    this.fadeOut(this.over);
    this.fadeOut(this.select.root);
    if (this.clearScreen.root.visible) this.clearScreen.hide();
    this.tweens.add({ targets: this.scrim, alpha: 0, duration: 180 });
    this.game.events.emit(EV.play, { level });
  }

  private nextLevel() {
    if (this.level === null || this.level >= lastOfSet(this.level)) this.showSelect();
    else this.play(this.level + 1);
  }

  private onStarted(d: HudData) {
    this.offer = null;
    this.banner.setInRun(true);
    this.abilityState = { state: 'ready', frac: 0 };
    this.drawAbilityPill();
    this.mode = 'play';
    this.hud.setVisible(true).setAlpha(0);
    this.fadeIn(this.hud);

    const level = this.level === null ? null : levelById(this.level);
    if (level) {
      this.rightLabel.setText(isHardLevel(level.id) ? 'HARD' : 'LEVEL');
      this.rightValue.setText(String(levelNumber(level.id))).setTint(WORLDS[level.world].color);
    } else if (this.runMode === 'daily') {
      // The Daily Run has its own best: today's.
      const run = progress.daily.run();
      this.rightLabel.setText(run.modifier.name);
      this.rightValue.setText(`${run.best.toFixed(0)} M`).setTint(run.modifier.color);
      this.toast(`TODAY'S GUEST: ${skinById(shared.skin).name}`, 1600);
    } else {
      this.rightLabel.setText('BEST');
      this.rightValue.setText(`${save.best.toFixed(1)} M`).clearTint();
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
    if (!force && now - this.lastHudDraw < 33) return;
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
    if (n < 2) return;
    const labels: Record<number, string> = { 5: 'x5  INSANE', 6: 'x6  UNREAL' };
    this.comboText.setText(n >= 7 ? `x${n}  HOW?` : (labels[n] ?? `x${n}  COMBO`));
    // A badge behind the words: orange pill, wider for longer labels.
    const bw = this.comboText.width - 24 + 30;
    this.comboBadge.clear();
    this.comboBadge.fillStyle(0x140a04, 0.85).fillRoundedRect(-bw / 2, -17, bw, 34, 17);
    this.comboBadge.lineStyle(1.5, 0xff9a2e, 0.9).strokeRoundedRect(-bw / 2, -17, bw, 34, 17);
    const parts = [this.comboText, this.comboBadge];
    this.tweens.killTweensOf(parts);
    for (const p of parts) p.setAlpha(1).setScale(1.4);
    this.tweens.add({ targets: parts, scale: 1, duration: 200, ease: 'Back.easeOut' });
    this.tweens.add({ targets: parts, alpha: 0, delay: 700, duration: 250 });
    if (n >= 5) this.glitchUntil = this.time.now + 180;
  }

  // --- Super move cut-in -----------------------------------------------------

  private cutInRoot!: Phaser.GameObjects.Container;
  private cutInBand!: Phaser.GameObjects.Graphics;
  private cutInFace!: Phaser.GameObjects.Image;
  private cutInName!: Phaser.GameObjects.Text;

  private buildCutIn() {
    this.cutInBand = this.add.graphics();
    this.cutInFace = this.add.image(-110, 0, skinTexture('classic')).setScale(0.9);
    this.cutInName = this.text(-50, 0, '', { size: 30, glow: '#000000', spacing: 2 }).setOrigin(0, 0.5);
    this.cutInRoot = this.add.container(0, 0, [this.cutInBand, this.cutInFace, this.cutInName]).setVisible(false);
  }

  /**
   * The ability fires: a slanted band in the skin's colour sweeps across with
   * the skin's face and the move's name, like a fighting-game super.
   */
  private cutIn() {
    const skin = skinById(shared.skin);
    const def = abilityFor(skin.id);
    const { w, h } = display.size(this);
    const g = this.cutInBand.clear();
    const bh = 92;
    g.fillStyle(skin.glow, 0.9);
    g.beginPath();
    g.moveTo(-w, -bh / 2 - 14);
    g.lineTo(w, -bh / 2 + 14);
    g.lineTo(w, bh / 2 + 14);
    g.lineTo(-w, bh / 2 - 14);
    g.closePath();
    g.fillPath();
    // Speed lines across the band.
    g.lineStyle(2, 0xffffff, 0.45);
    for (let i = 0; i < 9; i++) {
      const y = -bh / 2 + 8 + i * 9;
      const x = -w + ((i * 137) % w) * 2;
      g.lineBetween(x, y, x + 80 + (i % 3) * 40, y + 1);
    }
    g.fillStyle(0x05070a, 0.35).fillRect(-w, bh / 2 - 6, w * 2, 3);
    this.cutInFace.setTexture(skinTexture(skin.id));
    if (this.cutInName.text !== def.name) this.cutInName.setText(def.name);
    this.cutInRoot.setPosition(w / 2, h * 0.38).setRotation(-0.06).setVisible(true).setAlpha(1);
    this.cutInRoot.setX(-w);
    this.tweens.killTweensOf(this.cutInRoot);
    this.tweens.add({ targets: this.cutInRoot, x: w / 2, duration: 170, ease: 'Cubic.easeOut' });
    this.tweens.add({
      targets: this.cutInRoot,
      x: w * 1.6,
      alpha: 0,
      delay: 620,
      duration: 220,
      ease: 'Cubic.easeIn',
      onComplete: () => this.cutInRoot.setVisible(false),
    });
  }

  private lastDeath: DeathData | null = null;

  private onDied(d: DeathData) {
    this.mode = 'dead';
    this.banner.setInRun(false);
    this.pauseSheet.setVisible(false);
    this.countdown.setVisible(false);
    this.tapsFrom = this.time.now + 300;
    this.lastDeath = d;
    this.prepareCard('death');
    this.onHud(d, true);
    this.fadeOut(this.hud);

    const causes = { wall: 'HIT THE WALL', saw: 'SLICED', bomb: 'BLOWN UP' };
    const timing = d.hint === 'early' ? '  ·  TOO EARLY' : d.hint === 'late' ? '  ·  TOO LATE' : '';
    this.causeText.setText((d.warped ? `${causes[d.cause]} IN UNIVERSE 2` : causes[d.cause]) + timing);
    this.bestText.setShadow(0, 0, 'transparent', 0).setColor(css.inkDim);

    // Survival has no level map to go back to, so only MENU.
    this.overLevels.setVisible(d.level !== null);

    // Tips for the first deaths, so a crash always teaches something.
    const tips = {
      early: 'TOO EARLY. WAIT UNTIL THE BALL IS INSIDE THE CORNER SQUARE, THEN TAP.',
      late: 'TOO LATE. TAP AS SOON AS THE BALL ENTERS THE CORNER SQUARE.',
      hazard: 'TURN SO YOUR LINE MISSES WHAT IS AHEAD. EARLY TURNS GO LEFT, LATE TURNS RIGHT.',
      power: 'TIP: TAP 4 TIMES FAST FOR YOUR SKIN\'S SUPER POWER.',
    };
    let tip = '';
    if (d.deaths <= 25) {
      if (d.hint) tip = tips[d.hint];
      else if (d.cause !== 'wall') tip = d.deaths % 3 === 0 ? tips.power : tips.hazard;
    }
    this.tipText.setText(tip);

    let target = d.meters;
    let unit = ' M';
    this.overBar.clear();
    if (d.goal !== null && d.level !== null) {
      const level = levelById(d.level)!;
      const color = WORLDS[level.world].color;
      const frac = Math.min(1, d.meters / d.goal);
      target = Math.floor(frac * 100);
      unit = '%';
      this.scoreText.setTint(color);
      this.timeText.setText(`${d.meters.toFixed(0)} / ${d.goal.toFixed(0)} M   ·   ${levelName(d.level)} ${WORLDS[level.world].name}`);
      // While a CONTINUE is on offer the run isn't reported yet: compare with
      // the level's record as it stands (progress.lastRun is the attempt before).
      const run = d.continueCost === null ? progress.lastRun : null;
      const fresh = !!run && run.level === d.level;
      const best = fresh ? run!.bestBefore || null : this.levelBest(d.level);
      const newBest = fresh ? run!.newBest : best !== null && frac - best >= 0.01;
      if (newBest && frac > 0.02) {
        this.bestText.setText('NEW BEST').setColor('#ffd21f').setShadow(0, 0, '#ffd21f', 12, false, true);
      } else this.bestText.setText(best !== null ? `BEST ${Math.floor(best * 100)}%` : '');
      this.drawOverBar(frac, best, color);
      this.flavorText.setText(
        d.keptDucks > 0
          ? `KEPT ${d.keptDucks} OF ${d.ducks} DUCKS`
          : d.goal - d.meters < 30
            ? 'SO CLOSE.'
            : '',
      );
    } else {
      this.scoreText.clearTint();
      const run = progress.lastRun;
      const daily = this.runMode === 'daily';
      const bestM = daily && run ? run.best : d.best;
      this.timeText.setText(`${d.seconds.toFixed(1)} SEC   ·   ${daily ? 'TODAY\'S BEST' : 'BEST'} ${bestM.toFixed(0)} M`);
      if (d.isNewBest || (daily && run?.newBest)) {
        this.bestText.setText(daily ? 'NEW DAILY BEST' : 'NEW RECORD').setColor('#ffd21f').setShadow(0, 0, '#ffd21f', 14, false, true);
        const { w, h } = display.size(this);
        this.time.delayedCall(450, () => this.confetti.explode(70, w / 2, h * 0.3));
      } else this.bestText.setText(this.flavorLine(d));
      // Bonked ducks plus what progress paid for the run (distance, milestones).
      const earned = d.ducks + (run?.ducks ?? 0);
      this.flavorText.setText(earned > 0 ? `+${earned} DUCKS  ·  ${save.ducks} IN TOTAL` : '');
      if (earned > 0) this.maybeShowSpinBanner();
    }
    // The Daily Run was played with today's guest skin: here's where to get it.
    const guest = this.runMode === 'daily' ? todaysGuest() : null;
    const showGuest = !!guest && !save.skins.has(guest.id);
    this.guestLink.setText(showGuest ? `LIKE ${guest!.name}? FIRE UP THE REACTOR  ›` : '').setVisible(showGuest);

    // CONTINUE: buy the crash back for a few seconds (see GameScene.continueOffer).
    this.offer = null;
    const canContinue = d.continueCost !== null && save.ducks >= d.continueCost;
    for (const o of [this.continueBtn, this.continueRing, this.continueDuck, this.continueNote]) o.setVisible(canContinue).setAlpha(1);
    if (canContinue) {
      const now = this.time.now;
      // Taps only count after a moment: a panicked tap right after the crash mustn't spend ducks.
      this.offer = { cost: d.continueCost!, from: now, until: now + d.continueSeconds * 1000, armAt: now + 650, death: d };
      this.continueBtn.setLabel(`CONTINUE · ${d.continueCost} DUCKS`);
      this.continueNote.setText(`YOU HAVE ${save.ducks} DUCKS`);
      this.drawContinueRing(1);
    } else if (d.continueCost !== null) {
      // (Offered, but the ducks are gone: settle it now.)
      this.game.events.emit(EV.continueDecline);
    }
    this.layoutOver();

    this.over.setVisible(true).setAlpha(0).setY(32);
    this.tweens.add({ targets: this.scrim, alpha: 0.78, duration: 220 });
    this.over.setData('inactive', false);
    this.tweens.add({ targets: this.over, alpha: 1, y: 0, duration: 280, ease: 'Cubic.easeOut' });

    // Count the score up for a bit of drama (a bitmap font: free to update).
    const counter = { v: 0 };
    this.scoreText.setScale(0.7);
    this.tweens.add({ targets: this.scoreText, scale: 1, duration: 420, ease: 'Back.easeOut' });
    this.tweens.add({
      targets: counter,
      v: target,
      duration: Math.min(900, 300 + target * 4),
      ease: 'Cubic.easeOut',
      onUpdate: () => this.scoreText.setText(unit === '%' ? `${Math.round(counter.v)}%` : `${counter.v.toFixed(0)} M`),
    });
    [this.retryPill, this.overShare, this.overLevels, this.overMenu, this.guestLink].forEach((b, i) => {
      b.setAlpha(0);
      this.tweens.add({ targets: b, alpha: 1, delay: 220 + i * 60, duration: 240 });
    });
    if (this.offer) {
      // Fully there by the time it accepts taps.
      const row = [this.continueBtn, this.continueRing, this.continueDuck, this.continueNote];
      row.forEach((o) => o.setAlpha(0));
      this.tweens.add({ targets: row, alpha: 1, delay: 300, duration: 320 });
    }
  }

  /** Progress bar on the death card, with a tick at your best attempt. */
  private drawOverBar(frac: number, best: number | null, color: number) {
    const g = this.overBar.clear();
    const bw = 260;
    const y = 0;
    g.fillStyle(0x1a2433, 1).fillRoundedRect(-bw / 2, y, bw, 8, 4);
    g.fillStyle(color, 1).fillRoundedRect(-bw / 2, y, Math.max(8, bw * frac), 8, 4);
    if (best !== null && best > 0) {
      const bx = -bw / 2 + bw * Math.min(1, best);
      g.fillStyle(0xffd21f, 1).fillRect(bx - 1, y - 4, 2, 16);
    }
  }

  /** Lay out the death card: everything stacked inside the plate. */
  private layoutOver() {
    const { w, h } = display.size(this);
    const cx = w / 2;
    const level = this.lastDeath?.level != null;
    const hasTip = this.tipText.text.length > 0;
    const hasFlavor = this.flavorText.text.length > 0;
    const parts: [Phaser.GameObjects.Components.Transform & Phaser.GameObjects.GameObject, number][] = [
      [this.causeText, 30],
      [this.scoreText, 100],
    ];
    if (level) parts.push([this.overBar, 24]);
    parts.push([this.timeText, 26], [this.bestText, 26]);
    if (hasTip) parts.push([this.tipText, 50]);
    if (hasFlavor) parts.push([this.flavorText, 28]);
    if (this.guestLink.visible) parts.push([this.guestLink, 30]);
    const offer = this.continueBtn.visible;
    if (offer) parts.push([this.continueBtn, 62], [this.continueNote, 22]);
    parts.push([this.retryPill, 78], [this.overLevels, 56]);
    const total = parts.reduce((a, [, hgt]) => a + hgt, 0) + 36;
    const top = Math.max(display.safeTop() + 60, h * 0.47 - total / 2);
    let y = top + 22;
    for (const [obj, hgt] of parts) {
      obj.setPosition(cx, y + hgt / 2);
      y += hgt;
    }
    if (level) this.overBar.setX(cx);
    this.tipText.setWordWrapWidth(270);
    const btnY = this.overLevels.y;
    if (level) {
      this.overLevels.setPosition(cx - 72, btnY);
      this.overMenu.setPosition(cx + 72, btnY);
    } else this.overMenu.setPosition(cx, btnY);
    this.overBar.setY(this.overBar.y - 4);
    const pw = Math.min(w - 24, 340);
    // RETRY with the share button beside it.
    this.retryPill.setX(cx - 28);
    this.overShare.setPosition(cx + 117, this.retryPill.y);
    // CONTINUE above it, with its countdown ring (round a duck) where SHARE is.
    if (offer) {
      this.continueBtn.setX(cx - 33);
      this.continueNote.setX(cx - 33);
      this.continueRing.setPosition(cx + 117, this.continueBtn.y);
      this.continueDuck.setPosition(cx + 117, this.continueBtn.y);
    }
    this.overBox = { x: cx - pw / 2, y: top, w: pw, h: total };
    this.drawOverPlate(this.overBox);
  }

  private overBox = { x: 0, y: 0, w: 0, h: 0 };

  private drawOverPlate(b: { x: number; y: number; w: number; h: number }) {
    this.overPlate.clear();
    this.overPlate.fillStyle(0x0a0f18, 0.92).fillRoundedRect(b.x, b.y, b.w, b.h, 24);
    this.overPlate.lineStyle(1.5, 0x1c2a3a, 1).strokeRoundedRect(b.x, b.y, b.w, b.h, 24);
  }

  /** Re-lay the death card, sliding everything (and the plate) to its new place. */
  private reflowOver() {
    const objs = this.over.list.filter((o) => o !== this.overPlate) as (Phaser.GameObjects.GameObject & { y: number })[];
    const from = objs.map((o) => o.y);
    const box0 = { ...this.overBox };
    this.layoutOver();
    const to = objs.map((o) => o.y);
    const box1 = { ...this.overBox };
    const k = { v: 0 };
    objs.forEach((o, i) => (o.y = from[i]));
    this.drawOverPlate(box0);
    const mix = (a: number, b: number) => a + (b - a) * k.v;
    this.tweens.add({
      targets: k,
      v: 1,
      duration: 220,
      ease: 'Cubic.easeOut',
      onUpdate: () => {
        objs.forEach((o, i) => (o.y = mix(from[i], to[i])));
        this.drawOverPlate({ x: box1.x, w: box1.w, y: mix(box0.y, box1.y), h: mix(box0.h, box1.h) });
      },
    });
  }

  // --- CONTINUE ---------------------------------------------------------------

  /** The countdown ring round the duck: `left` is the share of the offer's time left. */
  private drawContinueRing(left: number) {
    const g = this.continueRing.clear();
    g.fillStyle(0x1c1404, 0.95).fillCircle(0, 0, 21);
    g.lineStyle(3, 0x3a2f10, 1).strokeCircle(0, 0, 19);
    if (left <= 0) return;
    g.lineStyle(3, left > 0.3 ? 0xffd21f : 0xff9a2e, 1);
    g.beginPath();
    g.arc(0, 0, 19, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left, false);
    g.strokePath();
  }

  /** Once a frame while the offer stands: run the ring down; at zero the crash stands. */
  private tickOffer() {
    const o = this.offer!;
    if (this.mode !== 'dead' || this.lastDeath !== o.death) {
      this.offer = null;
      return;
    }
    const left = Math.max(0, (o.until - this.time.now) / (o.until - o.from));
    this.drawContinueRing(left);
    this.continueBtn.setScale(1 + 0.025 * Math.sin(this.time.now / 110));
    if (left <= 0) this.endOffer();
  }

  /** The offer ran out: the row goes, the card closes up, and the crash is final. */
  private endOffer() {
    this.offer = null;
    const row = [this.continueBtn, this.continueRing, this.continueDuck, this.continueNote];
    this.tweens.killTweensOf(row);
    this.tweens.add({
      targets: row,
      alpha: 0,
      duration: 160,
      onComplete: () => {
        row.forEach((o) => o.setVisible(false));
        this.continueBtn.setScale(1);
        if (this.mode === 'dead' && this.over.visible) this.reflowOver();
      },
    });
    this.game.events.emit(EV.continueDecline);
  }

  /** CONTINUE pressed: GameScene puts the ball back (and says so with EV.respawn). */
  private continueRun() {
    const o = this.offer;
    if (!o || this.mode !== 'dead' || this.time.now < o.armAt) return;
    if (save.ducks < o.cost) {
      sfx.denied();
      return;
    }
    this.game.events.emit(EV.continueRun);
  }

  /** Back on the track after a CONTINUE: the HUD returns, then 3, 2, 1, GO. */
  private onRespawn(r: { count: number }) {
    if (this.mode === 'dead') {
      this.offer = null;
      this.mode = 'play';
      this.banner.setInRun(true);
      this.hideSpinBanner();
      this.fadeOut(this.over);
      this.tweens.add({ targets: this.scrim, alpha: 0, duration: 200 });
      this.hud.setVisible(true).setAlpha(0);
      this.fadeIn(this.hud);
      this.toast(`-${this.lastDeath?.continueCost ?? 0} DUCKS · ${save.ducks} LEFT`, 1000);
    }
    // Paused mid-count: the pause sheet's own 3-2-1 comes first.
    if (this.mode !== 'play') return;
    const { w, h } = display.size(this);
    this.tweens.killTweensOf(this.countdown);
    this.countdown.setPosition(w / 2, h * 0.42);
    sfx.click();
    const go = r.count === 0;
    this.countdown.setText(go ? 'GO!' : String(r.count)).setVisible(true).setAlpha(1).setScale(go ? 1.2 : 1.5);
    this.tweens.add({
      targets: this.countdown,
      scale: 1,
      alpha: go ? 0 : 0.2,
      duration: go ? 520 : 320,
      ease: 'Cubic.easeOut',
      onComplete: () => go && this.countdown.setVisible(false),
    });
  }

  private onCleared(d: ClearData) {
    this.mode = 'clear';
    this.lastClear = d;
    this.prepareCard('clear');
    this.banner.setInRun(false);
    this.pauseSheet.setVisible(false);
    this.countdown.setVisible(false);
    this.tapsFrom = this.time.now + 1200;
    this.onHud(d, true);
    this.fadeOut(this.hud);
    this.fadeIn(this.scrim);
    // Rewards progress paid for this clear (first clear, new stars ...).
    const run = progress.lastRun;
    const rewards = run && run.cleared ? run.rewards.filter((r) => r.ducks > 0) : [];
    this.clearScreen.show(d, rewards.map((r) => `${r.label} +${r.ducks}`).join('   ·   '));
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
    const icon = this.add.image(-w / 2 + 34, 0, TEX.duck).setScale(0.42 / DUCK_RES);
    const title = this.text(-w / 2 + 64, -14, 'REACTOR READY!', { size: 15, color: '#ffd21f', spacing: 1 }).setOrigin(0, 0.5);
    this.spinBannerText = this.text(-w / 2 + 64, 10, '', { font: 'mono', size: 10, color: css.ink, spacing: 1 }).setOrigin(0, 0.5);
    const go = this.text(w / 2 - 18, 10, 'CHARGE NOW', { size: 12, color: '#ffd21f', spacing: 2 }).setOrigin(1, 0.5);
    const hit = this.add.zone(0, 0, w, h).setInteractive({ useHandCursor: true });
    hit.on('pointerdown', () => {
      sfx.click();
      this.hideSpinBanner();
      this.showSkins();
    });
    this.spinBanner = this.add.container(0, 0, [bg, icon, title, this.spinBannerText, go, hit]).setVisible(false).setDepth(900);
  }

  /** Pops up when you've got enough ducks for a pull on the slot machine. */
  private maybeShowSpinBanner(delay = 900) {
    if (save.ducks < SPIN_COST) return;
    this.spinBannerText.setText(`YOU HAVE ${save.ducks} DUCKS`);
    this.placeSpinBanner();
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

  /** Below the clear card (never over its text), clamped above the home bar. */
  private placeSpinBanner() {
    if (!this.spinBanner || !this.clearScreen) return;
    const { w, h } = display.size(this);
    const below = this.clearScreen.bottom + 18 + 37;
    const floor = h - display.safeBottom() - 12 - 37;
    this.spinBanner.setPosition(w / 2, Math.min(below, floor));
  }

  private hideSpinBanner() {
    const b = this.spinBanner;
    if (!b.visible) return;
    this.tweens.killTweensOf(b);
    this.tweens.add({ targets: b, alpha: 0, duration: 150, onComplete: () => b.setVisible(false).setAngle(0) });
  }

  // --- Sharing -----------------------------------------------------------------

  /** Build the result card for the screen that just opened (rendering takes a moment). */
  private prepareCard(kind: 'death' | 'clear') {
    const made = kind === 'clear' ? this.clearCard() : this.deathCard();
    this.card = made ? { ...made, blob: renderCard(made.info) } : null;
  }

  private clearCard(): { info: CardInfo; text: string } | null {
    const d = this.lastClear;
    const level = d && levelById(d.level);
    if (!d || !level) return null;
    const name = levelName(d.level);
    return {
      info: {
        kicker: `${name} · ${WORLDS[level.world].name}`,
        big: 'CLEAR',
        stars: d.stars,
        sub: `${d.seconds.toFixed(1)} SEC  ·  PERFECT ${d.perfects}/${d.turns}`,
        color: hexColor(WORLDS[level.world].color),
      },
      text: `I cleared ${name} in DUCKWISE with ${d.stars} ${d.stars === 1 ? 'star' : 'stars'} ${'★'.repeat(d.stars)}. One tap. Always right.`,
    };
  }

  private deathCard(): { info: CardInfo; text: string } | null {
    const d = this.lastDeath;
    if (!d) return null;
    const m = d.meters.toFixed(0);
    const level = d.level !== null ? levelById(d.level) : undefined;
    if (level && d.goal !== null) {
      const pct = Math.floor(Math.min(1, d.meters / d.goal) * 100);
      return {
        info: { kicker: `${levelName(level.id)} · ${WORLDS[level.world].name}`, big: `${pct}%`, sub: `${m} / ${d.goal.toFixed(0)} M`, color: hexColor(WORLDS[level.world].color) },
        text: `I got ${pct}% of ${levelName(level.id)} in DUCKWISE. So close. One tap. Always right.`,
      };
    }
    if (this.runMode === 'daily') {
      const run = progress.daily.run();
      return {
        info: { kicker: `DAILY RUN · ${run.modifier.name}`, big: `${m} M`, sub: `${run.key}  ·  BEST ${run.best.toFixed(0)} M`, color: hexColor(run.modifier.color) },
        text: `Today's DUCKWISE Daily Run (${run.modifier.name}): ${m} m. Same track for everyone today. Can you beat it?`,
      };
    }
    return {
      info: { kicker: 'SURVIVAL', big: `${m} M`, sub: `BEST ${Math.max(d.best, d.meters).toFixed(0)} M  ·  ${d.seconds.toFixed(1)} SEC`, color: css.orange },
      text: `I survived ${m} m in DUCKWISE. Beat that!`,
    };
  }

  private async shareResult() {
    const card = this.card;
    if (!card) return;
    const blob = await card.blob;
    const r = await share(card.text, blob ?? undefined);
    if (r === 'copied') this.toast('COPIED: PASTE IT ANYWHERE');
    else if (r === 'failed') this.toast("COULDN'T SHARE");
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
    // Which corner buttons show depends on the screen.
    this.pauseBtn.setVisible(this.mode === 'play');
    // Music/sound/effects toggles: on the main menu (and inside the pause sheet).
    this.musicBtn.setVisible(this.mode === 'menu');
    this.soundBtn.setVisible(this.mode === 'menu');
    this.fxBtn.setVisible(this.mode === 'menu');
    // After a crash the darkness creeps in from the edges.
    this.vignette.setAlpha(0.85 + shared.gloom * 0.15);

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
    this.banner.setPaused(this.mode === 'skins' && this.shop.revealing);
    if (this.mode === 'daily') this.daily.update(time);
    if (this.mode === 'records') this.records.update(time);
    if (this.mode === 'howto') this.howTo.update(time);
    if (this.frenzy.visible && this.frenzyActive) {
      this.frenzySub.setScale(1 + 0.08 * Math.sin(t * 20));
      // Tint, not setColor: recolouring text re-renders and re-uploads it every frame.
      this.frenzyTitle.setTint(PARTY_COLORS[Math.floor(time / 120) % PARTY_COLORS.length]);
    }
    if (this.toastText.alpha > 0 && (save.rainbow || this.mode === 'play')) {
      this.toastText.setTint(PARTY_COLORS[Math.floor(time / 150) % PARTY_COLORS.length]);
    }
    this.clearScreen.update(time);

    if (this.offer) this.tickOffer();
    else if (this.mode === 'dead' && this.over.visible && this.retryPill.alpha >= 1) {
      this.retryPill.setScale(1 + 0.02 * Math.sin(t * 4));
    }
  }
}
