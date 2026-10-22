import Phaser from 'phaser';
import { save } from '../game/storage';
import { read, write } from '../game/persist';
import { css, palette } from '../game/palette';
import { EV, type StatEvent } from '../game/shared';
import { RARITIES, RARITY_ORDER, SKINS, SPIN_COST, skinById, skinTexture, type Rarity, type Skin } from '../game/skins';
import { gacha, type SpinResult } from '../game/gacha';
import { abilityFor } from '../game/abilities';
import { sfx } from '../audio/Sfx';
import { skinVoices } from '../audio/skinVoices';
import { TEX, DUCK_RES } from '../fx/textures';
import { makeButton, makeText, type Button } from './widgets';
import { BAY, Q, SHOP_TEX, TILE_IN, TILE_TEX, ensureShopTextures, safeBottom } from './shopTextures';
import { shopSfx } from './shopSfx';
import { CREAK, QuackReactor, STAGE_IN, TEASE_CHANCE, crossed, makePlan, overloadAt, type Plan } from './QuackReactor';
import { PRIZE_Y, ReactorReveal } from './ReactorReveal';

/** The collection: 50 skins in 5 tidy rows of 10. */
const COLS = 10;
const GAP = 5;
/** Ducks in a duplicate's shower (only the look: the refund itself is REFUND[rarity]). */
const DUPE_DUCKS: Record<Rarity, number> = { common: 6, rare: 9, epic: 12, legendary: 16 };
/** Reveals the player has watched to the end; after SKIP_AFTER of them a tap skips to the crack. */
const SEEN_KEY = 'dontdie_reactor_reveals';
const SKIP_AFTER = 2;
/** The card under the prize (reveal coordinates). */
const CARD_Y = { rarity: 44, name: 78, note: 112, power: 138, desc: 157 };
/** On short phones the bay is no taller than this (the collection keeps its size). */
const BAY_MIN_H = 244;

interface Tile {
  skin: Skin;
  root: Phaser.GameObjects.Container;
  worn: Phaser.GameObjects.Image;
  frame: Phaser.GameObjects.Image;
  sil: Phaser.GameObjects.Image;
  img: Phaser.GameObjects.Image;
  sticker: Phaser.GameObjects.Image;
  hit: Phaser.GameObjects.Zone;
  /** What's drawn now, so refresh() only touches tiles that changed. */
  look: string;
}

/**
 * The QUACK REACTOR screen: the reactor on top, your collection below.
 *
 * A charge costs SPIN_COST ducks (or one free charge). The rules (odds, pity,
 * no duplicates until a rarity is complete, refunds) live in game/gacha.ts and
 * are settled the moment you press the button; this class is the show: ducks
 * march into the reactor (QuackReactor), it overloads and bursts, an orb in a
 * shell of the rarity's colour flies out and cracks open (ReactorReveal), and
 * the skin's card. Owned skins can be tapped to wear them.
 */
export class SkinShop {
  readonly root: Phaser.GameObjects.Container;
  private logoTop: Phaser.GameObjects.Text;
  private title: Phaser.GameObjects.Text;
  private back: Button;
  private chip: Phaser.GameObjects.Image;
  private balance: Phaser.GameObjects.Text;
  private balanceIcon: Phaser.GameObjects.Image;
  private freeNote: Phaser.GameObjects.Text;
  private shownDucks = 0;

  private reactor: QuackReactor;
  private pull: Button;
  private freePull: Button;
  private odds: Phaser.GameObjects.Text[] = [];
  private rule: Phaser.GameObjects.Text;
  private message: Phaser.GameObjects.Text;
  private skipZone: Phaser.GameObjects.Zone;

  private collectionLabel: Phaser.GameObjects.Text;
  private rarityCounts: Phaser.GameObjects.Text[] = [];
  private rarityDots: Phaser.GameObjects.Graphics;
  private tiles: Tile[] = [];
  private infoTitle: Phaser.GameObjects.Text;
  private infoBody: Phaser.GameObjects.Text;
  private selected: string | null = null;
  private stickerTween: Phaser.Tweens.Tween | null = null;

  private reveal: Phaser.GameObjects.Container;
  private dim: Phaser.GameObjects.Rectangle;
  private fx: ReactorReveal;
  private prize: Phaser.GameObjects.Image;
  private prizeShine: Phaser.GameObjects.Image;
  private revealRarity: Phaser.GameObjects.Text;
  private revealName: Phaser.GameObjects.Text;
  private nameShine: Phaser.GameObjects.Text;
  private revealNote: Phaser.GameObjects.Text;
  private revealPower: Phaser.GameObjects.Text;
  private revealDesc: Phaser.GameObjects.Text;
  private refundText: Phaser.GameObjects.Text;
  private skipHint: Phaser.GameObjects.Text;
  /** The fuel counter on the stage (the bay's LCD fades out with the panel). */
  private stageCount: Phaser.GameObjects.Text;
  private stageLabel: Phaser.GameObjects.Text;
  private stageFuel = -1;
  private revealEquip: Button;
  private revealOk: Button;
  private revealAgain: Button;
  private flyers: Phaser.GameObjects.Container;
  private ducks: Phaser.GameObjects.Image[] = [];

  private phase: 'idle' | 'show' | 'card' = 'idle';
  /** A reveal is playing (banners wait until the card is in). */
  get revealing() {
    return this.phase === 'show';
  }
  private plan: Plan | null = null;
  /** Show clock (ms since the charge); only runs while the screen is on, so a show pauses with it. */
  private t = 0;
  private lastTime = -1;
  /** Balance before the charge: the counter drains as the ducks march in. */
  private before = 0;
  /** From the charge until the shell cracks, the collection and pity read-out don't change (no spoilers). */
  private hold = false;
  private revealScale = 1;
  /** The reactor in its bay (shop root coordinates). */
  private bayScale = 1;
  private bayY = 0;
  /** During a show the reactor lives in the reveal, on the stage. */
  private staged = false;
  private pageShown = true;
  private screenW = 390;
  private screenH = 844;
  private seen = Math.max(0, parseInt(read(SEEN_KEY) ?? '0', 10) || 0);
  /** For tests: force (true) or forbid (false) the upgrade tease; null rolls it. */
  forceTease: boolean | null = null;

  constructor(
    private scene: Phaser.Scene,
    private onBack: () => void,
    private onEquip: () => void,
  ) {
    ensureShopTextures(scene);
    const add = scene.add;
    this.logoTop = makeText(scene, 0, 0, 'QUACK', { size: 11, color: '#ffd21f', spacing: 7 }).setOrigin(0.5, 0);
    this.title = makeText(scene, 0, 0, 'REACTOR', { size: 21, spacing: 2, glow: css.magenta }).setOrigin(0.5);
    this.back = makeButton(scene, {
      label: 'BACK',
      width: 84,
      height: 34,
      style: 'ghost',
      onPress: () => {
        // The show pauses while the screen is away; its drone mustn't keep playing.
        shopSfx.chargeStop();
        this.onBack();
      },
    });
    this.chip = add.image(0, 0, SHOP_TEX.chip).setScale(1 / Q);
    this.balanceIcon = add.image(0, 0, TEX.duck).setScale(0.26 / DUCK_RES);
    this.balance = makeText(scene, 0, 0, '0', { font: 'mono', size: 15, weight: '700', color: '#ffd21f' }).setOrigin(1, 0.5);
    this.freeNote = makeText(scene, 0, 0, '', { font: 'mono', size: 10, weight: '700', color: '#ffd21f', spacing: 1 }).setOrigin(0.5, 0);

    // --- Reactor ----------------------------------------------------------
    this.reactor = new QuackReactor(scene);
    this.pull = makeButton(scene, { label: `CHARGE  ·  ${SPIN_COST} DUCKS`, width: 250, color: palette.magenta, onPress: () => this.spin() });
    this.freePull = makeButton(scene, { label: 'FREE CHARGE', width: 250, color: 0xffd21f, onPress: () => this.spin() });
    let ox = 0;
    for (const r of RARITY_ORDER) {
      const t = makeText(scene, 0, 0, `${RARITIES[r].label} ${Math.round(RARITIES[r].chance * 100)}%`, {
        font: 'mono',
        size: 10,
        weight: '700',
        color: RARITIES[r].css,
        spacing: 0.5,
      }).setOrigin(0, 0.5);
      t.setData('x', ox);
      ox += t.width + 14;
      this.odds.push(t);
    }
    this.odds.forEach((t) => t.setData('x', (t.getData('x') as number) - (ox - 14) / 2));
    this.rule = makeText(scene, 0, 0, '', { font: 'mono', size: 10, color: '#8fa3b5', spacing: 0.3 }).setOrigin(0.5);
    this.message = makeText(scene, 0, 0, '', { font: 'mono', size: 11, weight: '700', color: css.magenta, spacing: 1 }).setOrigin(0.5).setAlpha(0);

    // --- Collection -------------------------------------------------------
    this.collectionLabel = makeText(scene, 0, 0, '', { font: 'mono', size: 11, weight: '700', color: css.ink, spacing: 1.5 }).setOrigin(0, 0.5);
    this.rarityDots = add.graphics();
    for (const r of RARITY_ORDER) {
      this.rarityCounts.push(makeText(scene, 0, 0, '', { font: 'mono', size: 10, weight: '700', color: RARITIES[r].css }).setOrigin(1, 0.5));
    }
    for (const skin of SKINS) {
      const worn = add.image(0, 0, SHOP_TEX.tileWorn).setVisible(false);
      const frame = add.image(0, 0, SHOP_TEX.tileLocked);
      const sil = add.image(0, 0, SHOP_TEX.silhouette(skin.id)).setTint(mix(0x2c3a4c, RARITIES[skin.rarity].color, 0.22));
      const img = add.image(0, 0, skinTexture(skin.id));
      const sticker = add.image(0, 0, SHOP_TEX.sticker).setVisible(false).setAngle(-14);
      const hit = add.zone(0, 0, 10, 10).setInteractive({ useHandCursor: true });
      const root = add.container(0, 0, [worn, frame, sil, img, sticker, hit]);
      hit.on('pointerdown', () => this.tapTile(skin));
      this.tiles.push({ skin, root, worn, frame, sil, img, sticker, hit, look: '' });
    }
    this.infoTitle = makeText(scene, 0, 0, '', { size: 15, spacing: 1 }).setOrigin(0.5, 0);
    this.infoBody = makeText(scene, 0, 0, '', { size: 12, color: css.ink, spacing: 0.3 }).setOrigin(0.5, 0).setAlign('center').setLineSpacing(3);

    // While a show runs, a tap below the header skips it (once allowed).
    this.skipZone = add.zone(0, 2040, 4000, 4000).setInteractive();
    this.skipZone.on('pointerdown', () => this.tapShow());
    this.skipZone.input!.enabled = false;

    // --- Reveal -----------------------------------------------------------
    this.dim = add.rectangle(0, 0, 4000, 4000, 0x020305, 1).setInteractive();
    this.dim.on('pointerdown', () => this.tapShow());
    this.fx = new ReactorReveal(scene, this.dim);
    this.prize = add.image(0, PRIZE_Y, skinTexture('classic')).setVisible(false);
    this.prizeShine = add.image(0, PRIZE_Y, skinTexture('classic')).setTint(0xffffff).setTintMode(Phaser.TintModes.FILL).setBlendMode(Phaser.BlendModes.ADD);
    this.revealRarity = makeText(scene, 0, CARD_Y.rarity, '', { size: 16, spacing: 5, glow: true }).setOrigin(0.5);
    this.revealName = makeText(scene, 0, CARD_Y.name, '', { size: 32, glow: true }).setOrigin(0.5);
    this.nameShine = makeText(scene, 0, CARD_Y.name, '', { size: 32, color: '#ffffff' }).setOrigin(0.5).setBlendMode(Phaser.BlendModes.ADD);
    this.revealNote = makeText(scene, 0, CARD_Y.note, '', { font: 'mono', size: 12, weight: '700', color: css.inkDim, spacing: 1.2 }).setOrigin(0.5);
    this.revealPower = makeText(scene, 0, CARD_Y.power, '', { size: 14, spacing: 1.5 }).setOrigin(0.5);
    this.revealDesc = makeText(scene, 0, CARD_Y.desc, '', { size: 12, color: css.ink, spacing: 0.3 })
      .setOrigin(0.5, 0)
      .setAlign('center')
      .setLineSpacing(2)
      .setWordWrapWidth(300);
    this.refundText = makeText(scene, 0, PRIZE_Y, '', { size: 34, color: '#ffd21f', glow: '#ff9a2e' }).setOrigin(0.5);
    this.skipHint = makeText(scene, 0, 0, 'TAP TO SKIP', { font: 'mono', size: 10, weight: '700', color: css.inkDim, spacing: 2 }).setOrigin(0.5);
    this.stageCount = makeText(scene, 0, 0, '', { font: 'mono', size: 44, weight: '700', color: '#ffd21f', glow: '#ff9a2e' }).setOrigin(0.5);
    this.stageLabel = makeText(scene, 0, 0, '', { font: 'mono', size: 11, weight: '700', color: css.inkDim, spacing: 3 }).setOrigin(0.5);
    this.revealEquip = makeButton(scene, { label: 'WEAR IT', width: 150, onPress: () => this.closeReveal('wear') });
    this.revealOk = makeButton(scene, { label: 'NICE', width: 110, style: 'ghost', onPress: () => this.closeReveal('ok') });
    this.revealAgain = makeButton(scene, {
      label: 'CHARGE AGAIN',
      width: 220,
      height: 40,
      style: 'ghost',
      color: palette.magenta,
      onPress: () => this.closeReveal('again'),
    });
    this.reveal = add
      .container(0, 0, [
        this.dim,
        this.fx.back,
        this.prize,
        this.prizeShine,
        this.fx.front,
        this.revealRarity,
        this.revealName,
        this.nameShine,
        this.revealNote,
        this.revealPower,
        this.revealDesc,
        this.refundText,
        this.skipHint,
        this.stageCount,
        this.stageLabel,
        this.revealEquip,
        this.revealOk,
        this.revealAgain,
      ])
      .setVisible(false);

    for (let i = 0; i < 16; i++) this.ducks.push(add.image(0, 0, TEX.duck).setVisible(false));
    this.flyers = add.container(0, 0, this.ducks);

    this.root = add.container(0, 0, [
      this.logoTop,
      this.title,
      this.back,
      this.reactor.root,
      this.pull,
      this.freePull,
      ...this.odds,
      this.rule,
      this.message,
      this.collectionLabel,
      this.rarityDots,
      ...this.rarityCounts,
      ...this.tiles.map((t) => t.root),
      this.infoTitle,
      this.infoBody,
      this.skipZone,
      this.reveal,
      // The duck counter stays above the reveal's dim: refunds fly into it.
      this.chip,
      this.balanceIcon,
      this.balance,
      this.freeNote,
      this.flyers,
    ]);
    this.root.setVisible(false);
  }

  // --- Layout ----------------------------------------------------------------

  layout(w: number, h: number, top: number) {
    const width = Math.min(w - 32, 370);
    const left = -width / 2;
    let y = 0;
    this.back.setPosition(left + 42, y + 17);
    this.logoTop.setPosition(0, y - 1);
    this.title.setPosition(0, y + 23);
    this.chip.setPosition(-left - 52, y + 17);
    this.balance.setPosition(-left - 12, y + 17);
    this.freeNote.setPosition(-left - 52, y + 36);
    y += 48;

    // The grid may use a little more of the width than the rest.
    const gridRoom = Math.min(w - 24, 380);
    const s = Math.floor((gridRoom - (COLS - 1) * GAP) / COLS);
    const gridH = Math.ceil(this.tiles.length / COLS) * (s + GAP);
    const avail = h - top - 10 - safeBottom();
    // The bay is a little wider than the rest and as big as the screen allows:
    // up to the full width, but on short phones no taller than it used to be
    // (BAY_MIN_H), so the collection doesn't shrink for it.
    const rest = 48 + 32 + 40 + 17 + 24 + 16 + gridH + 6 + 82;
    const fitW = Math.min(1.06, (w - 16) / BAY.W);
    const bayScale = Math.max(Math.min(fitW, BAY_MIN_H / BAY.H), Math.min(fitW, (avail - rest) / BAY.H));
    this.bayScale = bayScale;
    this.bayY = y + (BAY.H / 2) * bayScale;
    if (!this.staged) this.reactor.root.setScale(bayScale).setPosition(0, this.bayY);
    y += BAY.H * bayScale + 32;
    this.pull.setPosition(0, y);
    this.freePull.setPosition(0, y);
    y += 40;
    for (const t of this.odds) t.setPosition(t.getData('x') as number, y);
    y += 17;
    this.rule.setPosition(0, y);
    this.message.setPosition(0, y);
    y += 24;

    this.collectionLabel.setPosition(left, y);
    let cx = -left;
    const dots = this.rarityDots.clear();
    for (let i = RARITY_ORDER.length - 1; i >= 0; i--) {
      const t = this.rarityCounts[i];
      t.setText(this.countLabel(RARITY_ORDER[i]));
      t.setPosition(cx, y);
      dots.fillStyle(RARITIES[RARITY_ORDER[i]].color, 1).fillCircle(cx - t.width - 6, y, 3);
      cx -= t.width + 20;
    }
    y += 16;
    const gridW = COLS * s + (COLS - 1) * GAP;
    const gx = -gridW / 2;
    const k = (s * TILE_TEX) / TILE_IN / TILE_TEX;
    this.tiles.forEach((t, i) => {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      t.root.setPosition(gx + s / 2 + col * (s + GAP), y + s / 2 + row * (s + GAP));
      t.frame.setScale(k);
      t.worn.setScale(k * 1.04);
      t.sil.setScale((s / 128) * 1.14);
      t.img.setScale((s / 128) * 1.14);
      t.sticker.setScale((s / 46) * 0.68 / Q).setPosition(s * 0.32, -s * 0.44);
      t.hit.setSize(s + GAP, s + GAP);
      t.look = '';
    });
    y += gridH + 6;
    this.infoTitle.setPosition(0, y);
    this.infoBody.setPosition(0, y + 22).setWordWrapWidth(width - 10);
    y += 82;

    const scale = Math.min(1, avail / y);
    this.root.setScale(scale).setPosition(w / 2, top + Math.max(0, (avail - y * scale) / 2));

    // The reveal fills the screen and is centred on it, whatever the root's scale.
    this.revealScale = 1 / scale;
    this.reveal.setScale(1 / scale).setPosition(0, (h / 2 - this.root.y) / scale);
    this.screenW = w;
    this.screenH = h;
    this.fx.layout(w, h);
    if (this.staged) this.placeStage(this.t);
    const bottomRoom = h / 2 - safeBottom() - 24;
    const by = Math.min(218, bottomRoom - 80);
    this.revealEquip.setPosition(-70, by);
    this.revealOk.setPosition(80, by);
    this.revealAgain.setPosition(0, by + 56);
    this.skipHint.setPosition(0, by + 30);
    this.refresh();
  }

  private countLabel(r: Rarity) {
    const [have, total] = gacha.owned(r);
    return `${have}/${total}`;
  }

  // --- State -> display ------------------------------------------------------

  refresh() {
    if (this.phase === 'idle') this.shownDucks = save.ducks;
    this.setBalance(this.shownDucks);
    const free = save.freeSpins;
    setText(this.freeNote, free > 0 ? `+${free} FREE CHARGE${free > 1 ? 'S' : ''}` : '');
    const useFree = free > 0;
    this.freePull.setVisible(useFree && this.pageShown);
    this.pull.setVisible(!useFree && this.pageShown);
    if (useFree) this.freePull.setLabel(free > 1 ? `FREE CHARGE  ·  ${free} LEFT` : 'FREE CHARGE');
    this.pull.setAlpha(save.ducks >= SPIN_COST || this.phase !== 'idle' ? 1 : 0.5);
    if (this.phase === 'idle') this.setRule();
    if (this.hold) return;
    this.reactor.setPity(gacha.epicIn(), gacha.legendaryIn());

    const [owned, total] = gacha.ownedAll();
    setText(this.collectionLabel, owned === total ? `COMPLETE!  ${owned}/${total}` : `COLLECTION  ${owned}/${total}`);
    RARITY_ORDER.forEach((r, i) => setText(this.rarityCounts[i], this.countLabel(r)));

    let anyNew = false;
    for (const t of this.tiles) {
      const have = save.skins.has(t.skin.id);
      const worn = save.skin === t.skin.id;
      const isNew = gacha.isUnseen(t.skin.id);
      anyNew ||= isNew;
      const look = `${have}${worn}${isNew}`;
      if (look === t.look) continue;
      t.look = look;
      const rc = RARITIES[t.skin.rarity].color;
      t.frame.setTexture(have ? SHOP_TEX.tile(t.skin.rarity) : SHOP_TEX.tileLocked);
      if (have) t.frame.clearTint();
      else t.frame.setTint(rc);
      t.worn.setVisible(worn).setTint(rc);
      t.img.setVisible(have);
      t.sil.setVisible(!have);
      t.sticker.setVisible(isNew);
      t.root.setScale(worn ? 1.06 : 1);
    }
    this.syncStickerTween(anyNew);
    this.showInfo(this.selected ?? save.skin);
  }

  /** The line under the odds: the first-charge promise, or the no-repeats rule. */
  private setRule() {
    const first = gacha.stats.spins === 0;
    setText(this.rule, first ? 'YOUR FIRST CHARGE IS RARE OR BETTER!' : 'NO REPEATS UNTIL A RARITY IS COMPLETE');
    this.rule.setColor(first ? RARITIES.rare.css : '#8fa3b5');
  }

  private syncStickerTween(on: boolean) {
    if (on && !this.stickerTween) {
      this.stickerTween = this.scene.tweens.add({
        targets: this.tiles.map((t) => t.sticker),
        angle: { from: -18, to: -8 },
        duration: 420,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    } else if (!on && this.stickerTween) {
      this.stickerTween.remove();
      this.stickerTween = null;
    }
  }

  private setBalance(n: number) {
    setText(this.balance, String(n));
    this.balanceIcon.setPosition(this.balance.x - this.balance.width - 15, this.balance.y);
  }

  private showInfo(id: string) {
    const skin = skinById(id);
    const have = save.skins.has(skin.id);
    const rarity = RARITIES[skin.rarity];
    if (have) {
      const ab = abilityFor(skin.id);
      setText(this.infoTitle, `${skin.name}  ·  ${ab.name}`);
      setText(this.infoBody, `${ab.desc}\n${save.skin === skin.id ? 'WEARING IT  ·  TAP 4 TIMES FAST TO ACTIVATE' : 'TAP IT TO WEAR IT'}`);
    } else {
      const [got, total] = gacha.owned(skin.rarity);
      setText(this.infoTitle, `???  ·  ${rarity.label}`);
      setText(this.infoBody, `NOT FOUND YET  ·  ${total - got} ${rarity.label} SKIN${total - got > 1 ? 'S' : ''} LEFT TO FIND\nYOU CAN'T GET A REPEAT UNTIL YOU HAVE THEM ALL`);
    }
    if (this.infoTitle.getData('c') !== rarity.css) {
      this.infoTitle.setData('c', rarity.css).setColor(rarity.css);
    }
  }

  // --- Actions ---------------------------------------------------------------

  private tapTile(skin: Skin) {
    if (this.phase !== 'idle') return;
    sfx.unlock();
    gacha.markSeen(skin.id);
    if (!save.skins.has(skin.id)) {
      sfx.denied();
      this.selected = skin.id;
      this.refresh();
      return;
    }
    sfx.click();
    skinVoices.preview(skin.id);
    this.selected = skin.id;
    if (save.skin !== skin.id) {
      save.setSkin(skin.id);
      this.onEquip();
    }
    this.refresh();
  }

  private say(msg: string) {
    setText(this.message, msg);
    this.message.setAlpha(1);
    this.rule.setAlpha(0);
    this.scene.tweens.killTweensOf([this.message, this.rule]);
    this.scene.tweens.add({ targets: this.message, alpha: 0, delay: 1900, duration: 350 });
    this.scene.tweens.add({ targets: this.rule, alpha: 1, delay: 2150, duration: 300 });
  }

  private get canSkip() {
    return this.seen >= SKIP_AFTER;
  }

  /** Charge: pay, decide, save, then put on the show. */
  spin() {
    if (this.phase === 'show') return this.tapShow();
    if (this.phase !== 'idle' || this.reveal.visible) return;
    sfx.unlock();
    const before = save.ducks;
    const res = gacha.spin();
    if (!res) {
      sfx.nope();
      const r = this.reactor.root;
      const x0 = r.x;
      this.scene.tweens.add({ targets: r, x: x0 + 6, duration: 45, yoyo: true, repeat: 3, onComplete: () => r.setX(x0) });
      this.say(`NEED ${SPIN_COST} DUCKS  ·  YOU HAVE ${save.ducks}  ·  BONK DUCKS ON THE LEVELS`);
      return;
    }
    const tease = this.forceTease ?? (res.rarity !== 'common' && Math.random() < TEASE_CHANCE);
    this.plan = makePlan(res, tease);
    this.fx.begin(this.plan);
    this.t = 0;
    this.phase = 'show';
    this.selected = null;
    this.before = before;
    this.shownDucks = before;
    this.hold = true;
    skinVoices.prepare(res.skin.id);
    this.refresh();
    this.scene.tweens.killTweensOf([this.message, this.rule]);
    this.message.setAlpha(0);
    setText(this.rule, this.canSkip ? 'TAP TO SKIP' : res.free ? 'FREE CHARGE!' : 'CHARGING...');
    this.rule.setAlpha(1).setColor(res.free ? '#ffd21f' : css.inkDim);
    this.skipZone.input!.enabled = true;
    this.openStage();
  }

  /**
   * The show takes over the screen: the reveal opens (its dim fades the page
   * out) and the reactor moves into it, to be zoomed onto the stage.
   */
  private openStage() {
    this.reveal.setVisible(true).setAlpha(1);
    for (const o of [this.prize, this.prizeShine, this.revealRarity, this.revealName, this.nameShine, this.revealNote, this.revealPower, this.revealDesc, this.refundText])
      o.setVisible(false);
    for (const b of [this.revealEquip, this.revealOk, this.revealAgain]) b.setVisible(false);
    const r = this.reactor.root;
    this.root.remove(r);
    this.reveal.addAt(r, 1);
    this.staged = true;
    this.stageFuel = -1;
    this.placeStage(0);
  }

  /** The reactor back in its bay, above the collection. */
  private closeStage() {
    if (!this.staged) return;
    const r = this.reactor.root;
    this.reveal.remove(r);
    this.root.addAt(r, this.root.getIndex(this.back) + 1);
    r.setScale(this.bayScale).setPosition(0, this.bayY).setAlpha(1);
    this.reveal.setScale(this.revealScale);
    this.staged = false;
    this.showPage(true);
  }

  /** The page under the stage: hidden while the dim covers it anyway (fewer sprites to draw). */
  private showPage(on: boolean) {
    if (this.pageShown === on) return;
    this.pageShown = on;
    for (const o of [this.pull, this.freePull, ...this.odds, this.rule, this.message, this.collectionLabel, this.rarityDots, ...this.rarityCounts, this.infoTitle, this.infoBody])
      o.setVisible(on);
    for (const t of this.tiles) t.root.setVisible(on);
    // The buttons' and the free note's own rules.
    if (on) this.refresh();
  }

  /**
   * Where the reactor is at show time `t` (reveal coordinates: screen pixels
   * round the screen's centre). It zooms from its bay until the housing fills
   * most of the screen's width, creeps closer as it overloads, and after the
   * burst falls back into the dark behind the orb.
   */
  private placeStage(t: number) {
    const p = this.plan;
    const r = this.reactor.root;
    const w = this.screenW;
    const h = this.screenH;
    const zoom = Math.min((w * 0.86) / (2 * BAY.housingR), (h * 0.4) / (2 * BAY.housingR));
    const k0 = Math.min(1, Math.max(0, t / STAGE_IN));
    const k = k0 < 0.5 ? 4 * k0 * k0 * k0 : 1 - Math.pow(-2 * k0 + 2, 3) / 2;
    const u = p ? overloadAt(p, t) : 0;
    const gone = p ? Math.min(1, Math.max(0, (t - p.blast - 80) / 450)) : 0;
    const z = zoom * (1 + 0.07 * u * u + 0.05 * (p && t >= p.blast ? 1 : 0) + 0.06 * gone);
    // The bay's core in reveal coordinates, and its scale there.
    const s0 = this.bayScale / this.revealScale;
    const cx0 = (BAY.core.x * this.bayScale) / this.revealScale;
    const cy0 = (this.bayY + BAY.core.y * this.bayScale - this.reveal.y) / this.revealScale;
    const sc = s0 + (z - s0) * k;
    const cx = cx0 * (1 - k);
    const cy = cy0 + (h * 0.05 - cy0) * k;
    const x = cx - BAY.core.x * sc;
    const y = cy - BAY.core.y * sc;
    // ... and when the shell cracks it fades out of the way of the card.
    const out = p ? Math.min(1, Math.max(0, (t - p.crack) / 350)) : 0;
    r.setScale(sc).setPosition(x, y).setAlpha((1 - 0.72 * gone) * (1 - out));
    this.showPage(k0 < 1);
    this.reactor.setStage(k, (-w / 2 - x) / sc, (-h / 2 - y) / sc, (w / 2 - x) / sc, (h / 2 - y) / sc, sc);
    this.reveal.setScale(this.revealScale * (1 + this.fx.kick));
    // The fuel counter hangs over the reactor while the ducks go in.
    const fade = p ? Math.min(1, Math.max(0, (p.feedEnd + 300 - t) / 250)) : 0;
    const top = cy - BAY.housingR * sc;
    this.stageCount.setPosition(0, top - 58).setAlpha(k * fade).setVisible(k * fade > 0);
    this.stageLabel.setPosition(0, top - 26).setAlpha(k * fade).setVisible(k * fade > 0);
  }

  /** A tap during the show: skips to the shell cracking, once the player has seen a couple of reveals. */
  private tapShow() {
    const p = this.plan;
    if (this.phase !== 'show' || !p || !this.canSkip) return;
    const target = p.crack - CREAK;
    if (this.t >= target) return;
    shopSfx.chargeStop();
    this.advance(0, target, true);
  }

  // --- Per frame ---------------------------------------------------------------

  update(time: number) {
    const gap = this.lastTime < 0 ? 16.7 : time - this.lastTime;
    const dt = Math.max(0, Math.min(50, gap));
    this.lastTime = time;
    const p = this.plan;
    if (this.phase === 'show' && p) {
      // Back on the screen mid-overload (it was left): the drone picks up again.
      if (gap > 250 && this.t >= p.feedEnd && this.t < p.blast - 140) shopSfx.charge((p.blast - 140 - this.t) / 1000, p.first);
      this.advance(dt, this.t + dt, false);
    } else {
      this.reactor.update(dt, null, 0, 0, false, save.fxReduced);
      if (this.phase === 'card') {
        this.fx.idle(dt);
        if (this.staged) this.placeStage(this.t);
        if (this.plan?.rarity === 'legendary' && this.prize.visible) this.shimmer(this.lastTime);
      }
    }
    if (this.phase === 'card' && this.prize.visible && this.prize.alpha >= 1) {
      this.prize.setY(PRIZE_Y + Math.sin(time * 0.0024) * 5);
    }
  }

  /** Move the show's clock to `to` (quiet: skipping, no sound or particles). */
  private advance(dt: number, to: number, quiet: boolean) {
    const p = this.plan!;
    const prev = this.t;
    this.t = to;
    const reduced = save.fxReduced;
    if (this.staged) this.placeStage(to);
    this.reactor.update(dt, p, prev, to, quiet, reduced);
    if (!p.free) {
      const shown = this.before - (SPIN_COST - this.reactor.fuel);
      // Only while the ducks go in: a duplicate's refund counts up later.
      if (shown !== this.shownDucks && prev < p.blast) {
        this.shownDucks = shown;
        this.setBalance(shown);
      }
    }
    // The reactor is in the reveal, so its core is already in reveal coordinates.
    this.fx.update(dt, prev, to, this.reactor.coreWorld(), quiet, reduced);
    this.skipHint.setVisible(this.canSkip && to < p.crack - CREAK);
    const fuel = this.reactor.fuel;
    if (fuel !== this.stageFuel && this.stageCount.visible) {
      const first = this.stageFuel < 0;
      this.stageFuel = fuel;
      this.stageCount.setText(p.free ? (fuel > 0 ? 'FREE' : 'GO!') : String(fuel)).setScale(first ? 1 : 1.18);
      this.stageLabel.setText(p.free ? 'GOLDEN CHARGE' : fuel > 0 ? 'DUCKS TO GO' : 'FULL!');
    }
    if (this.stageCount.scale > 1) this.stageCount.setScale(Math.max(1, this.stageCount.scale - dt * 0.004));
    if (crossed(p.crack - CREAK, prev, to)) this.skipZone.input!.enabled = false;
    if (crossed(p.crack, prev, to)) this.crack();
    if (crossed(p.card, prev, to)) {
      this.seen++;
      write(SEEN_KEY, String(this.seen));
    }
    if (crossed(p.dupe, prev, to)) this.dupeBurst(p.res);
    if (crossed(p.buttons, prev, to)) {
      this.phase = 'card';
      this.showRevealButtons(p.res);
    }
  }

  // --- Reveal ----------------------------------------------------------------

  /** The shell breaks: the skin and its card. */
  private crack() {
    const res = this.plan!.res;
    const tw = this.scene.tweens;
    const { skin, rarity, isNew } = res;
    const cssColor = RARITIES[rarity].css;
    shopSfx.shatter(rarity);
    if (isNew) skinVoices.reveal(skin.id, rarity);
    this.hold = false;
    this.refresh();
    this.scene.game.events.emit(EV.stat, { type: 'spin', skin: skin.id, rarity, isNew } satisfies StatEvent);

    this.prize.setTexture(skinTexture(skin.id)).setVisible(true).setAlpha(1).setScale(0.2).setAngle(-25).setY(PRIZE_Y);
    tw.add({ targets: this.prize, scale: 1.6, angle: 0, duration: 520, ease: 'Back.easeOut' });
    this.prizeShine.setTexture(skinTexture(skin.id)).setVisible(false).setScale(1.6);

    const legendary = rarity === 'legendary';
    const label = legendary ? `★ ${RARITIES[rarity].label} ★` : RARITIES[rarity].label;
    this.revealRarity.setText(label).setColor(cssColor).setShadow(0, 0, cssColor, 16, false, true);
    this.revealName.setText(skin.name).setColor(legendary ? '#ffd21f' : css.ink).setShadow(0, 0, cssColor, 20, false, true);
    this.nameShine.setText(skin.name).setVisible(false);
    const ab = abilityFor(skin.id);
    this.revealNote.setText(isNew ? 'NEW SKIN!' : `DUPLICATE  ·  +${res.refund} DUCKS BACK`).setColor(isNew ? '#ffd21f' : css.ink);
    this.revealPower.setText(`POWER: ${ab.name}`).setColor(cssColor);
    this.revealDesc.setText(ab.desc);
    const items: [Phaser.GameObjects.Text, number][] = [
      [this.revealRarity, CARD_Y.rarity],
      [this.revealName, CARD_Y.name],
      [this.revealNote, CARD_Y.note],
      [this.revealPower, CARD_Y.power],
      [this.revealDesc, CARD_Y.desc],
    ];
    items.forEach(([o, y0], i) => {
      o.setVisible(true).setAlpha(0).setY(y0 + 14);
      tw.add({ targets: o, alpha: 1, y: y0, duration: 280, delay: 120 + i * 60, ease: 'Cubic.easeOut' });
    });
  }

  private showRevealButtons(res: SpinResult) {
    if (!this.reveal.visible || this.plan?.res !== res) return;
    const canWear = save.skin !== res.skin.id;
    this.revealEquip.setVisible(canWear);
    this.revealOk.setVisible(true).setX(canWear ? 80 : 0);
    const pay = gacha.payment();
    this.revealAgain.setVisible(pay !== null);
    if (pay) this.revealAgain.setLabel(pay === 'free' ? 'CHARGE AGAIN  ·  FREE' : `CHARGE AGAIN  ·  ${SPIN_COST}`);
    const btns = [this.revealEquip, this.revealOk, this.revealAgain].filter((b) => b.visible);
    btns.forEach((b, i) => {
      b.setAlpha(0).setScale(0.9);
      this.scene.tweens.add({ targets: b, alpha: 1, scale: 1, duration: 220, delay: i * 50, ease: 'Back.easeOut' });
    });
  }

  /** A duplicate bursts into a shower of ducks that fly into the counter. */
  private dupeBurst(res: SpinResult) {
    if (!this.reveal.visible) return;
    const tw = this.scene.tweens;
    shopSfx.burst();
    tw.killTweensOf(this.prize);
    tw.add({ targets: this.prize, scale: 2, alpha: 0, duration: 220, ease: 'Cubic.easeOut', onComplete: () => this.prize.setVisible(false) });
    this.prizeShine.setVisible(false);
    this.refundText.setText(`+${res.refund}`).setVisible(true).setAlpha(1).setScale(0.5).setY(PRIZE_Y);
    tw.add({ targets: this.refundText, scale: 1, duration: 380, ease: 'Back.easeOut' });

    const n = DUPE_DUCKS[res.rarity];
    const cx = this.reveal.x;
    const cy = this.reveal.y + PRIZE_Y * this.revealScale;
    const target = { x: this.balanceIcon.x, y: this.balanceIcon.y };
    const startShown = this.shownDucks;
    for (let i = 0; i < n; i++) {
      const d = this.ducks.find((x) => !x.visible);
      if (!d) break;
      const a = (i / n) * Math.PI * 2 + 0.3;
      const r = 60 + (i % 3) * 24;
      d.setVisible(true).setTexture(TEX.duck).setPosition(cx, cy).setScale(0.12 / DUCK_RES).setAlpha(1).setAngle(0);
      tw.add({ targets: d, x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, angle: (Math.random() - 0.5) * 60, scale: 0.34 / DUCK_RES, duration: 380, ease: 'Back.easeOut' });
      tw.add({
        targets: d,
        x: target.x,
        y: target.y,
        scale: 0.2 / DUCK_RES,
        angle: 200,
        delay: 500 + i * 45,
        duration: 420,
        ease: 'Cubic.easeIn',
        onComplete: () => {
          d.setVisible(false);
          this.shownDucks = i === n - 1 ? save.ducks : startShown + Math.round(((i + 1) * res.refund) / n);
          this.setBalance(this.shownDucks);
          shopSfx.duckIn(i);
          tw.killTweensOf(this.balance);
          this.balance.setScale(1.25);
          tw.add({ targets: this.balance, scale: 1, duration: 160 });
        },
      });
    }
    tw.add({ targets: this.refundText, alpha: 0, y: PRIZE_Y - 30, delay: 900, duration: 400 });
    // ... and the skin itself pops back, smaller.
    this.scene.time.delayedCall(1050, () => {
      if (!this.reveal.visible || this.plan?.res !== res) return;
      this.prize.setVisible(true).setAlpha(0).setScale(0.6);
      tw.add({ targets: this.prize, alpha: 1, scale: 1.25, duration: 320, ease: 'Back.easeOut' });
    });
  }

  /** Legendary: a white sweep of light runs across the name and the prize. */
  private shimmer(now: number) {
    const u = (now % 2200) / 1100 - 0.2; // -0.2 .. 1.8: sweep, then a pause
    const on = u >= -0.1 && u <= 1.1;
    this.nameShine.setVisible(on && this.revealName.visible);
    this.prizeShine.setVisible(on && this.prize.visible && this.prize.alpha >= 1);
    if (!on) return;
    const band = 0.13;
    for (const [o, img] of [
      [this.nameShine, false],
      [this.prizeShine, true],
    ] as const) {
      const fw = o.frame.width;
      const fh = o.frame.height;
      const x0 = Math.max(0, (u - band / 2) * fw);
      const x1 = Math.min(fw, (u + band / 2) * fw);
      if (x1 <= x0) o.setVisible(false);
      else o.setCrop(x0, 0, x1 - x0, fh);
      if (img) {
        o.setPosition(this.prize.x, this.prize.y).setScale(this.prize.scaleX).setAlpha(0.32);
      } else o.setAlpha(0.9);
    }
  }

  private closeReveal(action: 'wear' | 'ok' | 'again') {
    const res = this.plan?.res;
    if (action === 'wear' && res) {
      save.setSkin(res.skin.id);
      gacha.markSeen(res.skin.id);
      this.onEquip();
      this.selected = res.skin.id;
    } else if (res) this.selected = res.skin.id;
    this.scene.tweens.add({
      targets: this.reveal,
      alpha: 0,
      duration: 180,
      onComplete: () => {
        this.reveal.setVisible(false);
        this.fx.clear();
        if (action === 'again') this.spin();
      },
    });
    this.phase = 'idle';
    this.hold = false;
    this.plan = null;
    this.skipZone.input!.enabled = false;
    this.shownDucks = save.ducks;
    this.closeStage();
    this.reactor.reset(action === 'again');
    this.refresh();
  }
}

function setText(t: Phaser.GameObjects.Text, s: string) {
  if (t.text !== s) t.setText(s);
}

function mix(a: number, b: number, t: number) {
  const ch = (s: number) => Math.round(((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * t) << s;
  return ch(16) | ch(8) | ch(0);
}
