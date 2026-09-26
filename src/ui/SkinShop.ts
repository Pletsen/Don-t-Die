import Phaser from 'phaser';
import { save } from '../game/storage';
import { css, hueColor, palette } from '../game/palette';
import { DUPLICATE_REFUND, RARITIES, SKINS, SPIN_COST, rollSkin, skinTexture, type Skin } from '../game/skins';
import { sfx } from '../audio/Sfx';
import { TEX, DUCK_RES } from '../fx/textures';
import { hexColor, makeButton, makeText, type Button } from './widgets';
import { abilityFor } from '../game/abilities';
import { skinById } from '../game/skins';

const REEL_SLOTS = 8;
const SLOT_H = 56;
const REEL_W = 70;
const REEL_H = 124;
const MACHINE_W = 300;
const MACHINE_H = 236;
const COLS = 6;

interface Reel {
  images: Phaser.GameObjects.Image[];
  /** Scroll position in slots; whole numbers line a slot up with the win line. */
  pos: number;
  x: number;
}

/**
 * Skins screen: the DUCK-O-MATIC slot machine on top, your collection below.
 *
 * One pull costs 50 ducks. All three reels land on
 * the prize; a duplicate gives 5 ducks back. Owned skins can be tapped to
 * wear them.
 */
export class SkinShop {
  readonly root: Phaser.GameObjects.Container;
  private title: Phaser.GameObjects.Text;
  private balance: Phaser.GameObjects.Text;
  private balanceIcon: Phaser.GameObjects.Image;
  private back: Button;

  private machine: Phaser.GameObjects.Container;
  private frame: Phaser.GameObjects.Graphics;
  private lights: Phaser.GameObjects.Graphics;
  private reels: Reel[] = [];
  private lever: Phaser.GameObjects.Container;
  private pull: Button;
  private message: Phaser.GameObjects.Text;
  private odds: Phaser.GameObjects.Text;

  private collectionLabel: Phaser.GameObjects.Text;
  private abilityInfo: Phaser.GameObjects.Text;
  private tiles: { skin: Skin; root: Phaser.GameObjects.Container; bg: Phaser.GameObjects.Graphics; img: Phaser.GameObjects.Image; q: Phaser.GameObjects.Text }[] = [];

  private reveal: Phaser.GameObjects.Container;
  private revealRays: Phaser.GameObjects.Graphics;
  private revealImg: Phaser.GameObjects.Image;
  private revealRarity: Phaser.GameObjects.Text;
  private revealName: Phaser.GameObjects.Text;
  private revealNote: Phaser.GameObjects.Text;
  private revealEquip: Button;
  private revealOk: Button;
  private revealSkin: Skin | null = null;

  private spinning = false;
  private tileSize = 46;

  constructor(
    private scene: Phaser.Scene,
    private onBack: () => void,
    private onEquip: () => void,
  ) {
    this.title = makeText(scene, 0, 0, 'SKINS', { size: 22, spacing: 1.5 }).setOrigin(0.5, 0);
    this.back = makeButton(scene, { label: 'BACK', width: 84, height: 34, style: 'ghost', onPress: () => this.onBack() });
    this.balanceIcon = scene.add.image(0, 0, TEX.duck).setScale(0.28 / DUCK_RES);
    this.balance = makeText(scene, 0, 0, '0', { font: 'mono', size: 15, weight: '700', color: '#ffd21f' }).setOrigin(1, 0.5);

    // --- Machine ----------------------------------------------------------
    this.frame = scene.add.graphics();
    this.lights = scene.add.graphics();
    const marquee = makeText(scene, 0, -MACHINE_H / 2 + 26, 'DUCK-O-MATIC', {
      size: 20,
      color: '#ffd21f',
      glow: '#ff9a2e',
      spacing: 2,
    }).setOrigin(0.5);
    const reelParts: Phaser.GameObjects.GameObject[] = [];
    for (let r = 0; r < 3; r++) {
      const x = (r - 1) * (REEL_W + 10);
      const reel: Reel = { images: [], pos: Math.floor(Math.random() * REEL_SLOTS), x };
      for (let k = 0; k < REEL_SLOTS; k++) {
        const skin = SKINS[Math.floor(Math.random() * SKINS.length)];
        const img = scene.add.image(x, 0, skinTexture(skin.id)).setScale(0.42);
        reel.images.push(img);
        reelParts.push(img);
      }
      this.reels.push(reel);
    }

    this.lever = this.buildLever();
    this.machine = scene.add.container(0, 0, [this.frame, this.lights, marquee, ...reelParts, this.lever]);

    this.pull = makeButton(scene, { label: 'PULL', width: 220, color: palette.orange, onPress: () => this.spin() });
    this.message = makeText(scene, 0, 0, '', { font: 'mono', size: 11, color: css.magenta, spacing: 1.2 }).setOrigin(0.5);
    this.odds = makeText(
      scene,
      0,
      0,
      (Object.values(RARITIES) as { label: string; chance: number }[])
        .map((r) => `${r.label} ${Math.round(r.chance * 100)}%`)
        .join('  ·  '),
      { font: 'mono', size: 9, color: css.inkDim, spacing: 0.5 },
    ).setOrigin(0.5);

    // --- Collection -------------------------------------------------------
    this.collectionLabel = makeText(scene, 0, 0, '', { font: 'mono', size: 11, color: css.inkDim, spacing: 2 });
    this.abilityInfo = makeText(scene, 0, 0, '', { size: 13, color: css.ink, spacing: 0.5 }).setOrigin(0.5, 0);
    this.abilityInfo.setAlign('center').setLineSpacing(4);
    for (const skin of SKINS) {
      const bg = scene.add.graphics();
      const img = scene.add.image(0, 0, skinTexture(skin.id));
      const q = makeText(scene, 0, 0, '?', { size: 18, color: '#34414f' }).setOrigin(0.5);
      const hit = scene.add.zone(0, 0, 10, 10).setInteractive({ useHandCursor: true });
      const root = scene.add.container(0, 0, [bg, img, q, hit]);
      hit.on('pointerdown', () => this.equip(skin));
      this.tiles.push({ skin, root, bg, img, q });
    }

    // --- Prize reveal -----------------------------------------------------
    const dim = scene.add.rectangle(0, 0, 4000, 4000, 0x020305, 0.8).setInteractive();
    this.revealRays = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    this.revealImg = scene.add.image(0, 0, skinTexture('classic'));
    this.revealRarity = makeText(scene, 0, 0, '', { size: 16, spacing: 4, glow: true }).setOrigin(0.5);
    this.revealName = makeText(scene, 0, 0, '', { size: 30, glow: true }).setOrigin(0.5);
    this.revealNote = makeText(scene, 0, 0, '', { font: 'mono', size: 12, color: css.inkDim, spacing: 1.5 }).setOrigin(0.5);
    this.revealEquip = makeButton(scene, { label: 'WEAR IT', width: 150, onPress: () => this.closeReveal(true) });
    this.revealOk = makeButton(scene, { label: 'NICE', width: 110, style: 'ghost', onPress: () => this.closeReveal(false) });
    this.reveal = scene.add
      .container(0, 0, [dim, this.revealRays, this.revealImg, this.revealRarity, this.revealName, this.revealNote, this.revealEquip, this.revealOk])
      .setVisible(false);

    this.root = scene.add.container(0, 0, [
      this.title,
      this.back,
      this.balanceIcon,
      this.balance,
      this.machine,
      this.pull,
      this.message,
      this.odds,
      this.collectionLabel,
      ...this.tiles.map((t) => t.root),
      this.abilityInfo,
      this.reveal,
    ]);
    this.root.setVisible(false);
  }

  private buildLever() {
    const base = this.scene.add.graphics();
    base.fillStyle(0x3a4450, 1).fillRoundedRect(-8, -12, 16, 24, 5);
    const arm = this.scene.add.graphics();
    arm.fillStyle(0xc9d2dc, 1).fillRect(-3, -70, 6, 70);
    arm.fillStyle(0xff2f5e, 1).fillCircle(0, -74, 11);
    arm.fillStyle(0xffffff, 0.6).fillCircle(-3, -78, 3.5);
    const hit = this.scene.add.zone(0, -40, 50, 100).setInteractive({ useHandCursor: true });
    hit.on('pointerdown', () => this.spin());
    const armBox = this.scene.add.container(0, 0, [arm, hit]);
    const lever = this.scene.add.container(MACHINE_W / 2 + 20, -10, [base, armBox]);
    lever.setData('arm', armBox);
    return lever;
  }

  // --- Layout & drawing ------------------------------------------------------

  layout(w: number, h: number, top: number) {
    const width = Math.min(w - 32, 360);
    const left = -width / 2;
    let y = 0;
    this.back.setPosition(left + 42, y + 17);
    this.title.setPosition(0, y + 4);
    this.balance.setPosition(-left, y + 17);
    y += 44;

    this.machine.setPosition(-12, y + MACHINE_H / 2);
    this.drawFrame();
    y += MACHINE_H + 34;
    this.pull.setPosition(0, y);
    y += 36;
    this.message.setPosition(0, y);
    y += 18;
    this.odds.setPosition(0, y);
    y += 28;

    this.collectionLabel.setPosition(left, y);
    y += 22;
    this.tileSize = Math.min(52, (width - (COLS - 1) * 8) / COLS);
    const s = this.tileSize;
    this.tiles.forEach((t, i) => {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      t.root.setPosition(left + s / 2 + col * (s + 8), y + s / 2 + row * (s + 8));
      (t.root.list[3] as Phaser.GameObjects.Zone).setSize(s, s);
    });
    y += Math.ceil(this.tiles.length / COLS) * (s + 8);
    this.abilityInfo.setPosition(0, y + 6).setWordWrapWidth(width);
    y += 76;

    const avail = h - top - 12;
    const scale = Math.min(1, avail / y);
    this.root.setScale(scale).setPosition(w / 2, top + Math.max(0, (avail - y * scale) / 2));

    // The reveal is centred on the screen, whatever the root's scale.
    this.reveal.setScale(1 / scale).setPosition(0, (h / 2 - this.root.y) / scale);
    this.revealImg.setPosition(0, -60);
    this.revealRarity.setPosition(0, 30);
    this.revealName.setPosition(0, 62);
    this.revealNote.setPosition(0, 96);
    this.revealEquip.setPosition(-70, 150);
    this.revealOk.setPosition(80, 150);
    this.refresh();
  }

  private drawFrame() {
    const g = this.frame.clear();
    const x = -MACHINE_W / 2;
    const y = -MACHINE_H / 2;
    for (let i = 3; i >= 1; i--) {
      g.fillStyle(palette.magenta, 0.07).fillRoundedRect(x - i * 5, y - i * 5, MACHINE_W + i * 10, MACHINE_H + i * 10, 22 + i * 5);
    }
    g.fillStyle(0x140a1c, 1).fillRoundedRect(x, y, MACHINE_W, MACHINE_H, 22);
    g.lineStyle(2.5, palette.magenta, 1).strokeRoundedRect(x, y, MACHINE_W, MACHINE_H, 22);
    g.lineStyle(1.5, 0xffd21f, 0.8).strokeRoundedRect(x + 8, y + 8, MACHINE_W - 16, MACHINE_H - 16, 16);
    // Reel windows and the win line.
    const wy = 14;
    for (const reel of this.reels) {
      g.fillStyle(0x05070a, 1).fillRoundedRect(reel.x - REEL_W / 2, wy - REEL_H / 2, REEL_W, REEL_H, 10);
      g.lineStyle(1.5, 0x3a2a4a, 1).strokeRoundedRect(reel.x - REEL_W / 2, wy - REEL_H / 2, REEL_W, REEL_H, 10);
    }
    g.lineStyle(2, 0xffd21f, 0.9);
    g.lineBetween(x + 14, wy, x + 22, wy);
    g.lineBetween(-x - 22, wy, -x - 14, wy);
    this.placeReels();
  }

  /** Lay out reel icons like a spinning drum: squashed and faded at the edges. */
  private placeReels() {
    const wy = 14;
    for (const reel of this.reels) {
      reel.images.forEach((img, k) => {
        let d = (k - reel.pos) % REEL_SLOTS;
        if (d < -REEL_SLOTS / 2) d += REEL_SLOTS;
        if (d >= REEL_SLOTS / 2) d -= REEL_SLOTS;
        const y = d * SLOT_H;
        const k01 = Math.min(1, Math.abs(y) / (REEL_H / 2 + 10));
        img.setVisible(k01 < 1);
        img.setPosition(reel.x, wy + Math.sin((y / (REEL_H / 2 + 10)) * (Math.PI / 2)) * (REEL_H / 2 - 18));
        img.setScale(0.42, 0.42 * Math.cos(k01 * (Math.PI / 2)) + 0.02);
        img.setAlpha(1 - k01 * 0.8);
      });
    }
  }

  refresh() {
    this.balance.setText(String(save.ducks));
    this.balanceIcon.setPosition(this.balance.x - this.balance.width - 16, this.balance.y);
    this.pull.setLabel(`PULL  ·  ${SPIN_COST} DUCKS`);
    const owned = SKINS.filter((s) => save.skins.has(s.id)).length;
    const worn = skinById(save.skin);
    const ab = abilityFor(worn.id);
    this.abilityInfo.setText(`${worn.name}  ·  ${ab.name}\n${ab.desc}\nTAP 4 TIMES FAST TO ACTIVATE`);
    this.collectionLabel.setText(`COLLECTION  ${owned} / ${SKINS.length}`);

    const s = this.tileSize;
    for (const t of this.tiles) {
      const have = save.skins.has(t.skin.id);
      const worn = save.skin === t.skin.id;
      const rc = RARITIES[t.skin.rarity].color;
      t.bg.clear();
      if (worn) t.bg.fillStyle(rc, 0.22).fillRoundedRect(-s / 2 - 4, -s / 2 - 4, s + 8, s + 8, 14);
      t.bg.fillStyle(have ? rc : 0x0a0f16, have ? 0.12 : 0.85).fillRoundedRect(-s / 2, -s / 2, s, s, 10);
      t.bg.lineStyle(worn ? 2.5 : 1.2, have ? rc : 0x1c2733, have ? 1 : 0.9).strokeRoundedRect(-s / 2, -s / 2, s, s, 10);
      if (!have) t.bg.lineStyle(1, rc, 0.35).strokeRoundedRect(-s / 2 + 3, -s / 2 + 3, s - 6, s - 6, 8);
      t.img.setVisible(have).setScale((s / 128) * 1.15);
      t.q.setVisible(!have);
    }
  }

  // --- Actions ---------------------------------------------------------------

  private equip(skin: Skin) {
    if (this.spinning) return;
    sfx.unlock();
    if (!save.skins.has(skin.id)) {
      sfx.denied();
      this.say(`${RARITIES[skin.rarity].label} SKIN · NOT FOUND YET`);
      return;
    }
    sfx.click();
    save.setSkin(skin.id);
    this.onEquip();
    this.refresh();
  }

  private say(msg: string) {
    this.message.setText(msg).setAlpha(1);
    this.scene.tweens.killTweensOf(this.message);
    this.scene.tweens.add({ targets: this.message, alpha: 0, delay: 1800, duration: 400 });
  }

  private spin() {
    if (this.spinning || this.reveal.visible) return;
    sfx.unlock();
    if (save.ducks < SPIN_COST) {
      sfx.nope();
      this.scene.tweens.add({ targets: this.machine, x: this.machine.x + 6, duration: 45, yoyo: true, repeat: 3 });
      this.say(`NEED ${SPIN_COST} DUCKS · FINISH A WARP LEVEL`);
      return;
    } else {
      save.addDucks(-SPIN_COST);
    }

    const prize = rollSkin();
    const isNew = !save.skins.has(prize.id);
    if (isNew) save.addSkin(prize.id);
    else save.addDucks(DUPLICATE_REFUND);

    this.spinning = true;
    this.balance.setText(String(save.ducks - (isNew ? 0 : DUPLICATE_REFUND)));
    sfx.leverPull();
    const arm = this.lever.getData('arm') as Phaser.GameObjects.Container;
    this.scene.tweens.add({ targets: arm, angle: 150, duration: 220, yoyo: true, ease: 'Quad.easeIn' });

    const ticker = this.scene.time.addEvent({ delay: 70, loop: true, callback: () => sfx.spinTick() });
    this.reels.forEach((reel, r) => {
      // Spin whole turns plus a few slots, and put the prize on the slot
      // that will stop on the win line (never one visible right now).
      const extra = 2 + Math.floor(Math.random() * (REEL_SLOTS - 3));
      const target = Math.round(reel.pos) + REEL_SLOTS * (3 + r) + extra;
      reel.images[((target % REEL_SLOTS) + REEL_SLOTS) % REEL_SLOTS].setTexture(skinTexture(prize.id));
      this.scene.tweens.add({
        targets: reel,
        pos: target,
        delay: 150,
        duration: 1300 + r * 550,
        ease: 'Cubic.easeOut',
        onUpdate: () => this.placeReels(),
        onComplete: () => {
          sfx.reelStop(r);
          if (r === this.reels.length - 1) {
            ticker.remove();
            this.scene.time.delayedCall(350, () => this.showPrize(prize, isNew));
          }
        },
      });
    });
  }

  private showPrize(skin: Skin, isNew: boolean) {
    this.spinning = false;
    this.revealSkin = skin;
    const rarity = RARITIES[skin.rarity];
    this.revealImg.setTexture(skinTexture(skin.id)).setScale(0).setAngle(-30);
    this.revealRarity.setText(rarity.label).setColor(rarity.css).setShadow(0, 0, rarity.css, 16, false, true);
    this.revealName.setText(skin.name).setShadow(0, 0, rarity.css, 20, false, true);
    this.revealNote
      .setText(
        isNew
          ? `NEW SKIN!  ·  ABILITY: ${abilityFor(skin.id).name}`
          : `ALREADY OWNED  ·  +${DUPLICATE_REFUND} DUCKS BACK`,
      )
      .setColor(isNew ? '#ffd21f' : css.inkDim);
    this.revealEquip.setVisible(save.skin !== skin.id);
    this.revealOk.setPosition(save.skin !== skin.id ? 80 : 0, 150);

    this.reveal.setVisible(true).setAlpha(0);
    this.scene.tweens.add({ targets: this.reveal, alpha: 1, duration: 200 });
    this.scene.tweens.add({ targets: this.revealImg, scale: 1.1, angle: 0, duration: 650, ease: 'Back.easeOut' });
    sfx.reveal(skin.rarity);
    if (skin.rarity === 'legendary' || skin.rarity === 'epic') {
      this.scene.cameras.main.flash(300, 255, 230, 150);
      this.scene.cameras.main.shake(300, 0.006);
    }
    this.refresh();
  }

  private closeReveal(wear: boolean) {
    if (wear && this.revealSkin) {
      save.setSkin(this.revealSkin.id);
      this.onEquip();
    }
    this.scene.tweens.add({ targets: this.reveal, alpha: 0, duration: 180, onComplete: () => this.reveal.setVisible(false) });
    this.refresh();
  }

  update(time: number) {
    const t = time / 1000;
    // Chasing marquee lights.
    const g = this.lights.clear();
    const n = 14;
    for (let i = 0; i < n; i++) {
      const x = -MACHINE_W / 2 + 22 + (i * (MACHINE_W - 44)) / (n - 1);
      const on = (Math.floor(t * (this.spinning ? 14 : 4)) + i) % 3 === 0;
      g.fillStyle(on ? 0xffd21f : 0x5a4a1a, on ? 1 : 0.6).fillCircle(x, -MACHINE_H / 2 + 8, 3);
      g.fillStyle(on ? 0xffd21f : 0x5a4a1a, on ? 1 : 0.6).fillCircle(x, MACHINE_H / 2 - 8, 3);
    }

    if (this.reveal.visible && this.revealSkin) {
      // Spinning rays behind the prize, brighter for rarer skins.
      const rarity = this.revealSkin.rarity;
      const count = { common: 8, rare: 12, epic: 16, legendary: 24 }[rarity];
      const color = rarity === 'legendary' ? hueColor(t * 90) : RARITIES[rarity].color;
      const rg = this.revealRays.clear();
      for (let i = 0; i < count; i++) {
        const a = t * 0.6 + (i * Math.PI * 2) / count;
        rg.fillStyle(color, 0.12);
        rg.fillTriangle(0, -60, Math.cos(a - 0.08) * 420, -60 + Math.sin(a - 0.08) * 420, Math.cos(a + 0.08) * 420, -60 + Math.sin(a + 0.08) * 420);
      }
      this.revealImg.setY(-60 + Math.sin(t * 2.5) * 5);
      if (rarity === 'legendary') this.revealName.setColor(hexColor(hueColor(t * 120)));
    }
  }
}
