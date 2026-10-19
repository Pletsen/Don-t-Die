import Phaser from 'phaser';
import { save } from '../game/storage';
import { css, palette } from '../game/palette';
import { EV, type StatEvent } from '../game/shared';
import { PITY, RARITIES, RARITY_ORDER, SKINS, SPIN_COST, skinById, skinTexture, type Rarity, type Skin } from '../game/skins';
import { gacha, type SpinResult } from '../game/gacha';
import { abilityFor } from '../game/abilities';
import { sfx } from '../audio/Sfx';
import { TEX, DUCK_RES } from '../fx/textures';
import { makeButton, makeText, type Button } from './widgets';
import { M, Q, SHOP_TEX, TILE_IN, TILE_TEX, bulbX, ensureShopTextures, reelX, safeBottom } from './shopTextures';
import { shopSfx } from './shopSfx';

const REEL_SLOTS = 8;
const COLS = 8;
const GAP = 6;
/** Where the machine sits in the root container (left of centre: room for the lever). */
const MACHINE_DX = -20;
/** Reel symbol scale: 128 px textures shown at 54 px. */
const SYM = 0.42;
const BLUR_SYM = SYM * 2;
/** Reveal layout (reveal container coordinates, origin at the screen centre). */
const PRIZE_Y = -78;
const SHAKES: Record<Rarity, number> = { common: 1, rare: 2, epic: 3, legendary: 4 };
const BEAMS: Record<Rarity, { count: number; alpha: number }> = {
  common: { count: 6, alpha: 0.22 },
  rare: { count: 8, alpha: 0.3 },
  epic: { count: 10, alpha: 0.38 },
  legendary: { count: 12, alpha: 0.46 },
};
const DUPE_DUCKS: Record<Rarity, number> = { common: 5, rare: 7, epic: 9, legendary: 12 };

const wrap = (d: number) => {
  let v = d % REEL_SLOTS;
  if (v < -REEL_SLOTS / 2) v += REEL_SLOTS;
  if (v >= REEL_SLOTS / 2) v -= REEL_SLOTS;
  return v;
};
const cubicOut = (u: number) => 1 - Math.pow(1 - u, 3);
const sineInOut = (u: number) => 0.5 - 0.5 * Math.cos(Math.PI * u);
const clamp01 = (u: number) => Math.max(0, Math.min(1, u));

interface Reel {
  x: number;
  images: Phaser.GameObjects.Image[];
  /** Texture key (sharp version) shown in each slot. */
  keys: string[];
  /** Scroll position in slots; whole numbers line slot `pos % 8` up with the win line. */
  pos: number;
  last: number;
  from: number;
  to: number;
  t0: number;
  dur: number;
  /** Extra slow creep at the end (the third reel's near-miss suspense). */
  crawl: number;
  state: 'idle' | 'spin' | 'done';
  stopped: boolean;
  teased: boolean;
  target: number;
  tick: number;
  blur: boolean;
  glow: Phaser.GameObjects.Image;
}

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
 * Skins screen: the DUCK-O-MATIC on top, your collection below.
 *
 * A pull costs SPIN_COST ducks (or one free spin). The rules (odds, pity, no
 * duplicates until a rarity is complete, refunds) live in game/gacha.ts; this
 * class is the show: ducks into the coin slot, glass reels with motion blur,
 * a capsule that drops out and pops open, and the prize. Owned skins can be
 * tapped to wear them.
 */
export class SkinShop {
  readonly root: Phaser.GameObjects.Container;
  private title: Phaser.GameObjects.Text;
  private back: Button;
  private chip: Phaser.GameObjects.Image;
  private balance: Phaser.GameObjects.Text;
  private balanceIcon: Phaser.GameObjects.Image;
  private freeNote: Phaser.GameObjects.Text;
  private shownDucks = 0;

  private machine: Phaser.GameObjects.Container;
  private bulbs: Phaser.GameObjects.Image[] = [];
  private bulbStep = -1;
  private reels: Reel[] = [];
  private payline: Phaser.GameObjects.Image;
  private coinGlow: Phaser.GameObjects.Image;
  private lcdLegend: Phaser.GameObjects.Text;
  private lcdEpic: Phaser.GameObjects.Text;
  private lcdBars: Phaser.GameObjects.Graphics;
  private lcdState = '';
  private lever: Phaser.GameObjects.Container;
  private arm: Phaser.GameObjects.Container;
  private pull: Button;
  private freePull: Button;
  private odds: Phaser.GameObjects.Text[] = [];
  private rule: Phaser.GameObjects.Text;
  private message: Phaser.GameObjects.Text;

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
  private beams: Phaser.GameObjects.Container;
  private beamImgs: Phaser.GameObjects.Image[] = [];
  private halo: Phaser.GameObjects.Image;
  private flash: Phaser.GameObjects.Image;
  private ring: Phaser.GameObjects.Image;
  private sparks: Phaser.GameObjects.Image[] = [];
  private capsule: Phaser.GameObjects.Container;
  private capTop: Phaser.GameObjects.Image;
  private capBottom: Phaser.GameObjects.Image;
  private seam: Phaser.GameObjects.Image;
  private prize: Phaser.GameObjects.Image;
  private prizeShine: Phaser.GameObjects.Image;
  private revealRarity: Phaser.GameObjects.Text;
  private revealName: Phaser.GameObjects.Text;
  private nameShine: Phaser.GameObjects.Text;
  private revealNote: Phaser.GameObjects.Text;
  private refundText: Phaser.GameObjects.Text;
  private revealEquip: Button;
  private revealOk: Button;
  private revealAgain: Button;
  private fx: Phaser.GameObjects.Container;
  private ducks: Phaser.GameObjects.Image[] = [];

  private phase: 'idle' | 'spin' | 'reveal' = 'idle';
  private result: SpinResult | null = null;
  /** Shop clock (ms): advances only while the shop is on screen, so a spin pauses with it. */
  private clock = 0;
  private lastTime = -1;
  private lastTick = 0;
  private winAt = 0;
  private revealAt = 0;
  private capsuleTimers: Phaser.Time.TimerEvent[] = [];
  private capsuleStage = false;
  /** From the pull until the capsule pops, the collection and pity display don't change (no spoilers). */
  private hold = false;
  private revealScale = 1;

  constructor(
    private scene: Phaser.Scene,
    private onBack: () => void,
    private onEquip: () => void,
  ) {
    ensureShopTextures(scene);
    const add = scene.add;
    this.title = makeText(scene, 0, 0, 'SKINS', { size: 22, spacing: 1.5 }).setOrigin(0.5, 0);
    this.back = makeButton(scene, { label: 'BACK', width: 84, height: 34, style: 'ghost', onPress: () => this.onBack() });
    this.chip = add.image(0, 0, SHOP_TEX.chip).setScale(1 / Q);
    this.balanceIcon = add.image(0, 0, TEX.duck).setScale(0.26 / DUCK_RES);
    this.balance = makeText(scene, 0, 0, '0', { font: 'mono', size: 15, weight: '700', color: '#ffd21f' }).setOrigin(1, 0.5);
    this.freeNote = makeText(scene, 0, 0, '', { font: 'mono', size: 10, weight: '700', color: '#ffd21f', spacing: 1 }).setOrigin(0.5, 0);

    // --- Machine ----------------------------------------------------------
    const parts: Phaser.GameObjects.GameObject[] = [add.image(0, 0, SHOP_TEX.machine).setScale(1 / Q)];
    parts.push(
      makeText(scene, 0, M.marqueeY, 'DUCK-O-MATIC', { size: 19, color: '#ffd21f', glow: '#ff9a2e', spacing: 2.5 }).setOrigin(0.5),
    );
    for (let i = 0; i < M.bulbs; i++) {
      for (const y of [-M.bulbY, M.bulbY]) {
        const b = add.image(bulbX(i), y, SHOP_TEX.bulb).setScale(0.55).setBlendMode(Phaser.BlendModes.ADD);
        this.bulbs.push(b);
        parts.push(b);
      }
    }
    for (let r = 0; r < 3; r++) {
      const x = reelX(r);
      const glow = add
        .image(x, M.reelY, SHOP_TEX.reelGlow)
        .setScale(0.5)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(0xffd21f)
        .setAlpha(0);
      const reel: Reel = {
        x,
        images: [],
        keys: [],
        pos: Math.floor(Math.random() * REEL_SLOTS),
        last: 0,
        from: 0,
        to: 0,
        t0: 0,
        dur: 0,
        crawl: 0,
        state: 'idle',
        stopped: true,
        teased: false,
        target: -1,
        tick: 0,
        blur: false,
        glow,
      };
      reel.last = reel.pos;
      for (let k = 0; k < REEL_SLOTS; k++) {
        const key = this.randomSymbol();
        reel.keys.push(key);
        const img = add.image(x, 0, key).setScale(SYM);
        reel.images.push(img);
        parts.push(img);
      }
      this.reels.push(reel);
      parts.push(add.image(x, M.reelY, SHOP_TEX.glass).setScale(1 / Q), glow);
    }
    this.payline = add.image(0, M.reelY, SHOP_TEX.payline).setScale(0.5 * 1.08, 0.5).setBlendMode(Phaser.BlendModes.ADD).setTint(0xffd21f).setAlpha(0);
    this.coinGlow = add.image(M.coin.x, M.coin.y, SHOP_TEX.halo).setScale(0.32).setBlendMode(Phaser.BlendModes.ADD).setTint(0xffd21f).setAlpha(0);
    const lx = M.lcd.x + 12;
    this.lcdLegend = makeText(scene, lx, M.lcd.y + 13, '', { font: 'mono', size: 11, weight: '700', color: '#ffd21f', spacing: 0.5 }).setOrigin(0, 0.5);
    this.lcdEpic = makeText(scene, lx, M.lcd.y + 29, '', { font: 'mono', size: 11, weight: '700', color: '#c896ff', spacing: 0.5 }).setOrigin(0, 0.5);
    this.lcdBars = add.graphics();
    this.lever = this.buildLever();
    this.arm = this.lever.getData('arm') as Phaser.GameObjects.Container;
    parts.push(this.payline, this.coinGlow, this.lcdBars, this.lcdLegend, this.lcdEpic, this.lever);
    this.machine = add.container(0, 0, parts);
    const machineHit = add.zone(0, M.reelY, M.W, M.reelH + 30).setInteractive();
    machineHit.on('pointerdown', () => this.hurry());
    this.machine.addAt(machineHit, 1);

    this.pull = makeButton(scene, { label: `SPIN  ·  ${SPIN_COST} DUCKS`, width: 240, color: palette.orange, onPress: () => this.spin() });
    this.freePull = makeButton(scene, { label: 'FREE SPIN', width: 240, color: 0xffd21f, onPress: () => this.spin() });
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
    this.rule = makeText(scene, 0, 0, 'NO REPEATS UNTIL A RARITY IS COMPLETE', {
      font: 'mono',
      size: 10,
      color: '#8fa3b5',
      spacing: 0.3,
    }).setOrigin(0.5);
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

    // --- Prize reveal -----------------------------------------------------
    this.dim = add.rectangle(0, 0, 4000, 4000, 0x020305, 0.9).setInteractive();
    this.dim.on('pointerdown', () => this.skipCapsule());
    this.beams = add.container(0, PRIZE_Y);
    for (let i = 0; i < 12; i++) {
      const b = add.image(0, 0, SHOP_TEX.beam).setOrigin(0.5, 1).setBlendMode(Phaser.BlendModes.ADD);
      this.beamImgs.push(b);
      this.beams.add(b);
    }
    this.halo = add.image(0, PRIZE_Y, SHOP_TEX.halo).setBlendMode(Phaser.BlendModes.ADD);
    this.ring = add.image(0, PRIZE_Y, SHOP_TEX.ring).setBlendMode(Phaser.BlendModes.ADD);
    for (let i = 0; i < 16; i++) this.sparks.push(add.image(0, 0, TEX.spark).setBlendMode(Phaser.BlendModes.ADD).setVisible(false));
    this.capTop = add.image(0, 0, SHOP_TEX.capsuleTop('common')).setOrigin(0.5, 52 / 56).setScale(1 / Q);
    this.capBottom = add.image(0, 0, SHOP_TEX.capsuleBottom).setOrigin(0.5, 4 / 56).setScale(1 / Q);
    this.seam = add.image(0, 0, SHOP_TEX.seam).setScale(0.5).setBlendMode(Phaser.BlendModes.ADD);
    this.capsule = add.container(0, PRIZE_Y, [this.capBottom, this.capTop, this.seam]);
    this.prize = add.image(0, PRIZE_Y, skinTexture('classic'));
    this.prizeShine = add.image(0, PRIZE_Y, skinTexture('classic')).setTint(0xffffff).setTintMode(Phaser.TintModes.FILL).setBlendMode(Phaser.BlendModes.ADD);
    this.flash = add.image(0, PRIZE_Y, SHOP_TEX.halo).setBlendMode(Phaser.BlendModes.ADD);
    this.revealRarity = makeText(scene, 0, 62, '', { size: 16, spacing: 5, glow: true }).setOrigin(0.5);
    this.revealName = makeText(scene, 0, 96, '', { size: 32, glow: true }).setOrigin(0.5);
    this.nameShine = makeText(scene, 0, 96, '', { size: 32, color: '#ffffff' }).setOrigin(0.5).setBlendMode(Phaser.BlendModes.ADD);
    this.revealNote = makeText(scene, 0, 132, '', { font: 'mono', size: 12, weight: '700', color: css.inkDim, spacing: 1.2 }).setOrigin(0.5);
    this.refundText = makeText(scene, 0, PRIZE_Y, '', { size: 34, color: '#ffd21f', glow: '#ff9a2e' }).setOrigin(0.5);
    this.revealEquip = makeButton(scene, { label: 'WEAR IT', width: 150, onPress: () => this.closeReveal('wear') });
    this.revealOk = makeButton(scene, { label: 'NICE', width: 110, style: 'ghost', onPress: () => this.closeReveal('ok') });
    this.revealAgain = makeButton(scene, { label: 'SPIN AGAIN', width: 200, height: 40, style: 'ghost', color: palette.orange, onPress: () => this.closeReveal('again') });
    this.reveal = add
      .container(0, 0, [
        this.dim,
        this.beams,
        this.halo,
        this.ring,
        ...this.sparks,
        this.capsule,
        this.prize,
        this.prizeShine,
        this.flash,
        this.revealRarity,
        this.revealName,
        this.nameShine,
        this.revealNote,
        this.refundText,
        this.revealEquip,
        this.revealOk,
        this.revealAgain,
      ])
      .setVisible(false);

    for (let i = 0; i < 14; i++) this.ducks.push(add.image(0, 0, TEX.duck).setVisible(false));
    this.fx = add.container(0, 0, this.ducks);

    this.root = add.container(0, 0, [
      this.title,
      this.back,
      this.machine,
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
      this.reveal,
      // The duck counter stays above the reveal's dim: refunds fly into it.
      this.chip,
      this.balanceIcon,
      this.balance,
      this.freeNote,
      this.fx,
    ]);
    this.root.setVisible(false);
    this.placeReels(0);
  }

  private buildLever() {
    const s = this.scene;
    const base = s.add.graphics();
    base.fillStyle(0x2a2f3a, 1).fillRoundedRect(-10, -16, 20, 32, 7);
    base.fillStyle(0x8a92a8, 1).fillRoundedRect(-6, -12, 12, 24, 5);
    const arm = s.add.graphics();
    arm.fillStyle(0xb8c2d0, 1).fillRect(-3, -66, 6, 66);
    arm.fillStyle(0xffffff, 0.55).fillRect(-2, -66, 1.5, 66);
    const knob = s.add.image(0, -70, SHOP_TEX.knob).setScale(1 / Q);
    const hit = s.add.zone(0, -40, 56, 110).setInteractive({ useHandCursor: true });
    hit.on('pointerdown', () => this.spin());
    const armBox = s.add.container(0, 0, [arm, knob, hit]);
    const lever = s.add.container(M.W / 2 + 22, M.reelY, [base, armBox]);
    lever.setData('arm', armBox);
    return lever;
  }

  private randomSymbol(not?: string) {
    let key = skinTexture(SKINS[Math.floor(Math.random() * SKINS.length)].id);
    if (key === not) key = skinTexture(SKINS[(SKINS.findIndex((s) => skinTexture(s.id) === key) + 1) % SKINS.length].id);
    return key;
  }

  // --- Layout ----------------------------------------------------------------

  layout(w: number, h: number, top: number) {
    const width = Math.min(w - 32, 370);
    const left = -width / 2;
    let y = 0;
    this.back.setPosition(left + 42, y + 17);
    this.title.setPosition(0, y + 4);
    this.chip.setPosition(-left - 52, y + 17);
    this.balance.setPosition(-left - 12, y + 17);
    this.freeNote.setPosition(-left - 52, y + 36);
    y += 48;

    this.machine.setPosition(MACHINE_DX, y + M.H / 2);
    y += M.H + 34;
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
    const s = Math.floor((width - (COLS - 1) * GAP) / COLS);
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
    y += Math.ceil(this.tiles.length / COLS) * (s + GAP) + 6;
    this.infoTitle.setPosition(0, y);
    this.infoBody.setPosition(0, y + 22).setWordWrapWidth(width - 10);
    y += 82;

    const avail = h - top - 10 - safeBottom();
    const scale = Math.min(1, avail / y);
    this.root.setScale(scale).setPosition(w / 2, top + Math.max(0, (avail - y * scale) / 2));

    // The reveal fills the screen and is centred on it, whatever the root's scale.
    this.revealScale = 1 / scale;
    this.reveal.setScale(1 / scale).setPosition(0, (h / 2 - this.root.y) / scale);
    const bottomRoom = h / 2 - safeBottom() - 24;
    const by = Math.min(196, bottomRoom - 80);
    this.revealEquip.setPosition(-70, by);
    this.revealOk.setPosition(80, by);
    this.revealAgain.setPosition(0, by + 58);
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
    setText(this.freeNote, free > 0 ? `+${free} FREE SPIN${free > 1 ? 'S' : ''}` : '');
    const useFree = free > 0;
    this.freePull.setVisible(useFree);
    this.pull.setVisible(!useFree);
    if (useFree) this.freePull.setLabel(free > 1 ? `FREE SPIN  ·  ${free} LEFT` : 'FREE SPIN');
    this.pull.setAlpha(save.ducks >= SPIN_COST || this.phase !== 'idle' ? 1 : 0.5);
    if (this.hold) return;
    this.refreshLcd();

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

  private refreshLcd() {
    const leg = gacha.legendaryIn();
    const epic = gacha.epicIn();
    const state = `${leg}|${epic}`;
    if (state === this.lcdState) return;
    this.lcdState = state;
    setText(this.lcdLegend, leg <= 1 ? 'NEXT SPIN: LEGENDARY!' : `LEGENDARY IN ≤ ${leg}`);
    setText(this.lcdEpic, epic <= 1 ? 'NEXT SPIN: EPIC OR BETTER!' : `EPIC+ IN ≤ ${epic}`);
    // LED bars: how close each guarantee is.
    const g = this.lcdBars.clear();
    const bx = M.lcd.x + M.lcd.w - 62;
    const show = leg > 1 && epic > 1;
    if (!show) return;
    for (const [y, frac, color] of [
      [M.lcd.y + 13, 1 - (leg - 1) / (PITY.legendary - 1), 0xffd21f],
      [M.lcd.y + 29, 1 - (epic - 1) / (PITY.epic - 1), 0xc896ff],
    ] as const) {
      const lit = Math.round(frac * 10);
      for (let i = 0; i < 10; i++) {
        g.fillStyle(color, i < lit ? 1 : 0.16).fillRect(bx + i * 5, y - 4, 3.5, 8);
      }
    }
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

  /** Pull: pay, decide, save, then put on the show. */
  spin() {
    if (this.phase === 'spin') return this.hurry();
    if (this.phase !== 'idle' || this.reveal.visible) return;
    sfx.unlock();
    const before = save.ducks;
    const res = gacha.spin();
    if (!res) {
      sfx.nope();
      this.scene.tweens.add({ targets: this.machine, x: MACHINE_DX + 6, duration: 45, yoyo: true, repeat: 3, onComplete: () => this.machine.setX(MACHINE_DX) });
      this.say(`NEED ${SPIN_COST} DUCKS  ·  YOU HAVE ${save.ducks}  ·  CLEAR WARP LEVELS`);
      return;
    }
    this.result = res;
    this.phase = 'spin';
    this.selected = null;
    this.shownDucks = res.free ? before : before - SPIN_COST;
    this.hold = true;
    this.refresh();
    this.coinStream(res.free);

    this.scene.tweens.add({ targets: this.arm, angle: 155, duration: 200, delay: 140, yoyo: true, hold: 60, ease: 'Quad.easeIn', onStart: () => shopSfx.lever() });

    const start = this.clock + 400;
    this.reels.forEach((reel, r) => {
      // 3..5 slots on: the prize slot and its neighbours start out of sight.
      const offset = 3 + Math.floor(Math.random() * 3);
      reel.from = reel.pos;
      reel.to = Math.ceil(reel.pos) + REEL_SLOTS * (2 + r) + offset;
      reel.t0 = start + r * 70;
      reel.dur = 950 + r * 380;
      reel.crawl = r === 2 ? 450 : 0;
      reel.state = 'spin';
      reel.stopped = false;
      reel.teased = false;
      reel.target = ((reel.to % REEL_SLOTS) + REEL_SLOTS) % REEL_SLOTS;
      const capsule = SHOP_TEX.capsuleIcon(res.rarity);
      this.setSymbol(reel, reel.target, capsule);
      this.setSymbol(reel, (reel.target + 1) % REEL_SLOTS, this.randomSymbol());
      this.setSymbol(reel, (reel.target + REEL_SLOTS - 1) % REEL_SLOTS, this.randomSymbol());
    });
    this.winAt = 0;
    this.revealAt = 0;
  }

  /** Tap the machine while it spins: everything goes 3x faster. */
  private hurry() {
    if (this.phase !== 'spin') return;
    for (const reel of this.reels) {
      if (reel.state !== 'spin') continue;
      const t = this.clock - reel.t0;
      // Squeeze what's left of this reel's timeline into a third.
      const total = reel.dur + reel.crawl + 150;
      const left = Math.max(0, total - Math.max(0, t));
      const shift = left - left / 3;
      reel.dur = Math.max(1, reel.dur - shift * (reel.dur / total));
      reel.crawl = Math.max(0, reel.crawl - shift * (reel.crawl / total));
    }
  }

  private setSymbol(reel: Reel, k: number, key: string) {
    reel.keys[k] = key;
    reel.images[k].setTexture(reel.blur ? SHOP_TEX.blur(key) : key);
  }

  /** Ducks leave the counter and drop into the coin slot (a golden one for a free spin). */
  private coinStream(free: boolean) {
    const from = { x: this.balanceIcon.x, y: this.balanceIcon.y };
    const to = { x: this.machine.x + M.coin.x, y: this.machine.y + M.coin.y - 12 };
    const n = free ? 1 : 8;
    for (let i = 0; i < n; i++) {
      const d = this.takeDuck();
      if (!d) break;
      d.setTexture(free ? TEX.duckGold : TEX.duck).setPosition(from.x, from.y).setScale((free ? 0.42 : 0.26) / DUCK_RES).setAlpha(1).setAngle(0);
      const mx = (from.x + to.x) / 2 + 30;
      const my = Math.min(from.y, to.y) - 40;
      this.scene.tweens.addCounter({
        from: 0,
        to: 1,
        delay: i * 45,
        duration: free ? 520 : 380,
        ease: 'Sine.easeIn',
        onUpdate: (tw) => {
          const u = tw.getValue() ?? 0;
          const a = 1 - u;
          d.setPosition(a * a * from.x + 2 * a * u * mx + u * u * to.x, a * a * from.y + 2 * a * u * my + u * u * to.y);
          d.setScale(((free ? 0.42 : 0.26) - u * 0.12) / DUCK_RES).setAngle(u * 160);
        },
        onComplete: () => {
          d.setVisible(false);
          shopSfx.coin(i);
          this.coinGlow.setAlpha(0.9);
          this.scene.tweens.add({ targets: this.coinGlow, alpha: 0, duration: 220 });
          if (i === n - 1 && free) this.say('FREE SPIN!');
        },
      });
    }
  }

  private takeDuck() {
    const d = this.ducks.find((x) => !x.visible);
    return d ? d.setVisible(true) : null;
  }

  // --- Per frame ---------------------------------------------------------------

  update(time: number) {
    const dt = this.lastTime < 0 ? 16.7 : Math.max(0, Math.min(50, time - this.lastTime));
    this.lastTime = time;
    this.clock += dt;
    const now = this.clock;

    if (this.phase === 'spin') this.stepReels(now, dt);
    this.updateBulbs(now);

    if (this.reveal.visible && this.result) {
      const t = now / 1000;
      this.beams.rotation = t * 0.22;
      this.halo.setScale(1.5 + Math.sin(t * 2.2) * 0.06);
      if (!this.capsuleStage) this.prize.setY(PRIZE_Y + Math.sin(t * 2.4) * 5);
      if (this.result.rarity === 'legendary' && this.prize.visible) this.shimmer(now);
    }
  }

  private stepReels(now: number, dt: number) {
    let allDone = true;
    for (let r = 0; r < this.reels.length; r++) {
      const reel = this.reels[r];
      if (reel.state === 'spin') {
        const t = now - reel.t0;
        const A = reel.from - 0.2;
        const B = reel.crawl > 0 ? reel.to - 0.55 : reel.to + 0.14;
        let pos: number;
        if (t < 0) {
          // Wind-up: the reel kicks back a little while the lever comes down.
          pos = reel.from - 0.2 * Math.sin(clamp01((t + 170) / 170) * (Math.PI / 2));
        } else if (t < reel.dur) {
          pos = A + (B - A) * cubicOut(t / reel.dur);
        } else if (t < reel.dur + reel.crawl) {
          if (!reel.teased) {
            reel.teased = true;
            shopSfx.tease();
            reel.glow.setTint(RARITIES[this.result!.rarity].color).setAlpha(0.35);
            this.scene.tweens.add({ targets: reel.glow, alpha: 0.85, duration: 220, yoyo: true, repeat: 1 });
          }
          pos = B + (reel.to + 0.14 - B) * sineInOut((t - reel.dur) / reel.crawl);
        } else {
          if (!reel.stopped) this.reelStopped(r);
          const u = clamp01((t - reel.dur - reel.crawl) / 150);
          pos = reel.to + 0.14 * (1 - Math.sin(u * (Math.PI / 2)));
          if (u >= 1) {
            pos = reel.to;
            reel.state = 'done';
          }
        }
        reel.pos = pos;
        const tick = Math.round(pos);
        if (tick !== reel.tick) {
          reel.tick = tick;
          if (now - this.lastTick > 38) {
            this.lastTick = now;
            shopSfx.tick();
          }
        }
      }
      if (reel.state !== 'done') allDone = false;
    }
    this.placeReels(dt);
    if (allDone && this.winAt === 0) this.win(now);
    if (this.revealAt > 0 && now >= this.revealAt) {
      this.revealAt = 0;
      this.startReveal();
    }
  }

  private reelStopped(r: number) {
    const reel = this.reels[r];
    reel.stopped = true;
    shopSfx.reelStop(r);
    this.scene.tweens.killTweensOf(reel.glow);
    reel.glow.setTint(0xffd21f).setAlpha(0.9);
    this.scene.tweens.add({ targets: reel.glow, alpha: 0, duration: 320 });
    this.scene.tweens.add({ targets: this.machine, y: this.machine.y + 2, duration: 50, yoyo: true });
  }

  /** All three reels show the capsule: flash the win line, then pop it out. */
  private win(now: number) {
    this.winAt = now;
    shopSfx.win();
    this.payline.setAlpha(0);
    this.scene.tweens.add({ targets: this.payline, alpha: { from: 1, to: 0.25 }, duration: 130, yoyo: true, repeat: 2, onComplete: () => this.payline.setAlpha(0) });
    this.revealAt = now + 520;
  }

  /** Lay out reel symbols like a spinning drum: squashed at the top and bottom, blurred when fast. */
  private placeReels(dt: number) {
    const lim = M.reelH / 2 + 12;
    for (const reel of this.reels) {
      const v = dt > 0 ? (Math.abs(reel.pos - reel.last) / dt) * 1000 : 0;
      reel.last = reel.pos;
      const blur = v > 7;
      const stretch = blur ? Math.min(0.35, v / 120) : 0;
      const swap = blur !== reel.blur;
      reel.blur = blur;
      const farFromEnd = reel.state === 'spin' && reel.to - reel.pos > REEL_SLOTS;
      reel.images.forEach((img, k) => {
        const d = wrap(reel.pos - k);
        const y = d * M.slotH;
        const k01 = Math.min(1, Math.abs(y) / lim);
        const visible = k01 < 1;
        // Out of sight at the back of the drum: put a new symbol on it.
        if (!visible && farFromEnd && k !== reel.target && img.visible) this.setSymbol(reel, k, this.randomSymbol());
        else if (swap) img.setTexture(blur ? SHOP_TEX.blur(reel.keys[k]) : reel.keys[k]);
        img.setVisible(visible);
        if (!visible) return;
        const sq = Math.cos(k01 * (Math.PI / 2)) + 0.02;
        const base = blur ? BLUR_SYM * 0.84 : SYM;
        img.setPosition(reel.x, M.reelY + Math.sin((y / lim) * (Math.PI / 2)) * (M.reelH / 2 - 14));
        img.setScale(base, base * sq * (1 + stretch));
        img.setAlpha(1 - k01 * 0.5);
      });
    }
  }

  private updateBulbs(now: number) {
    const mode = this.phase === 'spin' ? (this.winAt > 0 ? 'win' : 'fast') : 'idle';
    const hz = mode === 'idle' ? 4 : mode === 'fast' ? 14 : 9;
    const step = Math.floor((now / 1000) * hz) * 4 + (mode === 'idle' ? 0 : mode === 'fast' ? 1 : 2);
    if (step === this.bulbStep) return;
    this.bulbStep = step;
    const s = step >> 2;
    const winColor = this.result ? RARITIES[this.result.rarity].color : 0xffd21f;
    this.bulbs.forEach((b, i) => {
      const n = i >> 1;
      const on = mode === 'win' ? s % 2 === 0 : (s + n) % 3 === 0;
      b.setTint(on ? (mode === 'win' ? winColor : 0xffd21f) : 0x6a4a14).setAlpha(on ? 1 : 0.45);
    });
  }

  // --- Reveal ----------------------------------------------------------------

  private startReveal() {
    const res = this.result;
    if (!res) return;
    this.phase = 'reveal';
    const tw = this.scene.tweens;
    const rarity = res.rarity;
    const color = RARITIES[rarity].color;

    this.reveal.setVisible(true).setAlpha(1);
    this.dim.setAlpha(0);
    tw.add({ targets: this.dim, alpha: 1, duration: 240 });
    for (const o of [this.prize, this.prizeShine, this.revealRarity, this.revealName, this.nameShine, this.revealNote, this.refundText]) o.setVisible(false);
    for (const b of [this.revealEquip, this.revealOk, this.revealAgain]) b.setVisible(false);
    this.flash.setAlpha(0);
    this.ring.setAlpha(0);
    this.halo.setAlpha(0).setTint(color);
    const beam = BEAMS[rarity];
    this.beamImgs.forEach((b, i) => {
      const on = i < beam.count;
      b.setVisible(on);
      if (!on) return;
      b.setRotation((i / beam.count) * Math.PI * 2).setTint(i % 2 ? color : mixWhite(color)).setScale(i % 2 ? 0.75 : 1, i % 2 ? 0.8 : 1);
    });
    this.beams.setScale(0.25).setAlpha(0);

    // The capsule jumps out of the middle reel and lands centre screen.
    const fromRoot = { x: this.machine.x + reelX(1), y: this.machine.y + M.reelY };
    const sx = (fromRoot.x - this.reveal.x) / this.revealScale;
    const sy = (fromRoot.y - this.reveal.y) / this.revealScale;
    this.capTop.setTexture(SHOP_TEX.capsuleTop(rarity)).setPosition(0, 0).setAngle(0).setAlpha(1);
    this.capBottom.setPosition(0, 0).setAngle(0).setAlpha(1);
    this.seam.setTint(color).setAlpha(0).setScale(0.5);
    this.capsule.setVisible(true).setPosition(sx, sy).setScale(0.4 / this.revealScale).setAngle(0);
    this.capsuleStage = true;
    shopSfx.capsule();
    tw.add({ targets: this.capsule, x: 0, y: PRIZE_Y, scale: 1.25, angle: { from: -25, to: 0 }, duration: 460, ease: 'Back.easeOut' });

    const shakes = SHAKES[rarity];
    let t = 520;
    this.capsuleTimers = [];
    for (let i = 0; i < shakes; i++) {
      const k = (i + 1) / shakes;
      this.capsuleTimers.push(
        this.scene.time.delayedCall(t, () => {
          shopSfx.shake(i);
          tw.add({ targets: this.capsule, angle: { from: -12 - 4 * k, to: 12 + 4 * k }, duration: 70, yoyo: true, repeat: 1, ease: 'Sine.easeInOut', onComplete: () => this.capsule.setAngle(0) });
          tw.add({ targets: this.capsule, y: PRIZE_Y - 8, duration: 110, yoyo: true, ease: 'Quad.easeOut' });
          // Light leaks through the seam, stronger each shake.
          tw.add({ targets: this.seam, alpha: 0.35 + 0.65 * k, scaleY: 0.5 + k * 0.6, duration: 160 });
          tw.add({ targets: this.beams, alpha: beam.alpha * 0.7 * k, scale: 0.25 + 0.2 * k, duration: 200 });
        }),
      );
      t += 330;
    }
    this.capsuleTimers.push(this.scene.time.delayedCall(t, () => this.popCapsule()));
  }

  /** Tap during the capsule shake: open it now. */
  private skipCapsule() {
    if (this.capsuleStage) this.popCapsule();
  }

  private popCapsule() {
    const res = this.result;
    if (!res || !this.capsuleStage) return;
    this.capsuleStage = false;
    for (const ev of this.capsuleTimers) ev.remove(false);
    this.capsuleTimers = [];
    const tw = this.scene.tweens;
    tw.killTweensOf([this.capsule, this.seam, this.beams]);
    const { skin, rarity, isNew } = res;
    const color = RARITIES[rarity].color;
    const cssColor = RARITIES[rarity].css;
    this.capsule.setAngle(0).setPosition(0, PRIZE_Y).setScale(1.25);
    this.seam.setAlpha(1);

    shopSfx.pop(rarity);
    this.hold = false;
    this.refresh();
    this.scene.game.events.emit(EV.stat, { type: 'spin', skin: skin.id, rarity, isNew } satisfies StatEvent);

    // Halves fly apart.
    tw.add({ targets: this.capTop, y: -70, x: -26, angle: -38, alpha: 0, duration: 420, ease: 'Cubic.easeOut' });
    tw.add({ targets: this.capBottom, y: 70, x: 22, angle: 30, alpha: 0, duration: 420, ease: 'Cubic.easeOut', onComplete: () => this.capsule.setVisible(false) });
    tw.add({ targets: this.seam, alpha: 0, scaleX: 2.2, duration: 260 });
    this.flash.setTint(0xffffff).setAlpha(1).setScale(0.4);
    tw.add({ targets: this.flash, scale: 3.4, alpha: 0, duration: 420, ease: 'Cubic.easeOut' });
    this.ring.setTint(color).setAlpha(1).setScale(0.3);
    tw.add({ targets: this.ring, scale: 1.7, alpha: 0, duration: 560, ease: 'Cubic.easeOut' });
    tw.add({ targets: this.halo, alpha: 0.6, duration: 300 });
    tw.add({ targets: this.beams, alpha: BEAMS[rarity].alpha, scale: 1, duration: 520, ease: 'Cubic.easeOut' });
    this.sparks.forEach((sp, i) => {
      const a = (i / this.sparks.length) * Math.PI * 2 + Math.random() * 0.3;
      const d = 90 + Math.random() * 90;
      sp.setVisible(true).setPosition(0, PRIZE_Y).setAlpha(1).setScale(0.6 + Math.random() * 0.6).setTint(i % 3 ? color : 0xffffff);
      tw.add({
        targets: sp,
        x: Math.cos(a) * d,
        y: PRIZE_Y + Math.sin(a) * d,
        alpha: 0,
        scale: 0.2,
        duration: 600 + Math.random() * 250,
        ease: 'Cubic.easeOut',
        onComplete: () => sp.setVisible(false),
      });
    });
    if (rarity === 'epic' || rarity === 'legendary') {
      this.scene.cameras.main.flash(260, 255, 230, 150);
      this.scene.cameras.main.shake(260, 0.005);
    }

    this.prize.setTexture(skinTexture(skin.id)).setVisible(true).setAlpha(1).setScale(0.2).setAngle(-25).setY(PRIZE_Y);
    tw.add({ targets: this.prize, scale: 1.6, angle: 0, duration: 560, ease: 'Back.easeOut' });
    this.prizeShine.setTexture(skinTexture(skin.id)).setVisible(false).setScale(1.6);

    const legendary = rarity === 'legendary';
    const label = legendary ? `★ ${RARITIES[rarity].label} ★` : RARITIES[rarity].label;
    this.revealRarity.setText(label).setColor(cssColor).setShadow(0, 0, cssColor, 16, false, true);
    this.revealName.setText(skin.name).setColor(legendary ? '#ffd21f' : css.ink).setShadow(0, 0, cssColor, 20, false, true);
    this.nameShine.setText(skin.name).setVisible(false);
    const ab = abilityFor(skin.id);
    this.revealNote
      .setText(isNew ? `NEW SKIN!  ·  ${ab.name}` : `DUPLICATE  ·  +${res.refund} DUCKS BACK`)
      .setColor(isNew ? '#ffd21f' : css.ink);
    [this.revealRarity, this.revealName, this.revealNote].forEach((o, i) => {
      const y0 = [62, 96, 132][i];
      o.setVisible(true).setAlpha(0).setY(y0 + 14);
      tw.add({ targets: o, alpha: 1, y: y0, duration: 300, delay: 200 + i * 70, ease: 'Cubic.easeOut' });
    });

    if (!isNew) this.scene.time.delayedCall(950, () => this.dupeBurst(res));
    this.scene.time.delayedCall(isNew ? 520 : 1500, () => this.showRevealButtons(res));
  }

  private showRevealButtons(res: SpinResult) {
    if (!this.reveal.visible || this.result !== res) return;
    const canWear = save.skin !== res.skin.id;
    this.revealEquip.setVisible(canWear);
    this.revealOk.setVisible(true).setX(canWear ? 80 : 0);
    const pay = gacha.payment();
    this.revealAgain.setVisible(pay !== null);
    if (pay) this.revealAgain.setLabel(pay === 'free' ? 'FREE SPIN AGAIN' : `SPIN AGAIN  ·  ${SPIN_COST}`);
    const btns = [this.revealEquip, this.revealOk, this.revealAgain].filter((b) => b.visible);
    btns.forEach((b, i) => {
      b.setAlpha(0).setScale(0.9);
      this.scene.tweens.add({ targets: b, alpha: 1, scale: 1, duration: 220, delay: i * 50, ease: 'Back.easeOut' });
    });
  }

  /** A duplicate bursts into ducks that fly into the counter. */
  private dupeBurst(res: SpinResult) {
    if (!this.reveal.visible || this.result !== res) return;
    const tw = this.scene.tweens;
    const color = RARITIES[res.rarity].color;
    shopSfx.burst();
    tw.killTweensOf(this.prize);
    tw.add({ targets: this.prize, scale: 2, alpha: 0, duration: 220, ease: 'Cubic.easeOut', onComplete: () => this.prize.setVisible(false) });
    this.prizeShine.setVisible(false);
    this.flash.setTint(color).setAlpha(0.9).setScale(0.5);
    tw.add({ targets: this.flash, scale: 2.6, alpha: 0, duration: 380 });
    this.refundText.setText(`+${res.refund}`).setVisible(true).setAlpha(1).setScale(0.5).setY(PRIZE_Y);
    tw.add({ targets: this.refundText, scale: 1, duration: 380, ease: 'Back.easeOut' });

    const n = DUPE_DUCKS[res.rarity];
    const cx = this.reveal.x;
    const cy = this.reveal.y + PRIZE_Y * this.revealScale;
    const target = { x: this.balanceIcon.x, y: this.balanceIcon.y };
    const startShown = this.shownDucks;
    for (let i = 0; i < n; i++) {
      const d = this.takeDuck();
      if (!d) break;
      const a = (i / n) * Math.PI * 2 + 0.3;
      const r = 70 + (i % 3) * 22;
      d.setTexture(TEX.duck).setPosition(cx, cy).setScale(0.12 / DUCK_RES).setAlpha(1).setAngle(0);
      tw.add({ targets: d, x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, scale: 0.36 / DUCK_RES, duration: 380, ease: 'Back.easeOut' });
      tw.add({
        targets: d,
        x: target.x,
        y: target.y,
        scale: 0.2 / DUCK_RES,
        angle: 200,
        delay: 520 + i * 55,
        duration: 440,
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
      if (!this.reveal.visible || this.result !== res) return;
      this.prize.setVisible(true).setAlpha(0).setScale(0.6);
      tw.add({ targets: this.prize, alpha: 1, scale: 1.25, duration: 320, ease: 'Back.easeOut' });
    });
  }

  /** Legendary: a white sweep of light runs across the name and the prize. */
  private shimmer(now: number) {
    const u = (now % 2200) / 1100 - 0.2; // -0.2 .. 1.8: sweep, then a pause
    const on = u >= -0.1 && u <= 1.1;
    this.nameShine.setVisible(on && this.revealName.visible);
    this.prizeShine.setVisible(on && this.prize.alpha >= 1);
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
    const res = this.result;
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
        this.capsule.setVisible(false);
        if (action === 'again') this.spin();
      },
    });
    this.phase = 'idle';
    this.capsuleStage = false;
    this.hold = false;
    this.result = action === 'again' ? res : null;
    this.shownDucks = save.ducks;
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

/** A lighter version of a colour, for alternating beams. */
const mixWhite = (c: number) => mix(c, 0xffffff, 0.55);

