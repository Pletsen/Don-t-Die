import Phaser from 'phaser';
import { HARD_LEVELS, HARD_OFFSET, LEVELS, WORLDS, isHardLevel, type LevelDef } from '../game/levels';
import { save } from '../game/storage';
import { css } from '../game/palette';
import { sfx } from '../audio/Sfx';
import { drawStar, hexColor, makeButton, makeIconButton, makeText, type Button, type IconButton } from './widgets';
import { palette } from '../game/palette';
import { drawIcon } from './icons';
import { TEX } from '../fx/textures';

const COLS = 5;
const GAP = 10;

interface Tile {
  level: LevelDef;
  root: Phaser.GameObjects.Container;
  glow: Phaser.GameObjects.Graphics;
  bg: Phaser.GameObjects.Graphics;
  num: Phaser.GameObjects.Text;
  stars: Phaser.GameObjects.Graphics;
  warp: Phaser.GameObjects.Image;
}

/** HARD MODE opens once level 20 is cleared. */
export const hardUnlocked = () => save.starsFor(LEVELS[LEVELS.length - 1].id) > 0;

export const isUnlocked = (id: number) => {
  if (isHardLevel(id)) return hardUnlocked() && (id === HARD_OFFSET + 1 || save.starsFor(id - 1) > 0);
  return id === 1 || save.starsFor(id - 1) > 0;
};

/**
 * The next level to play: the first unlocked one without stars; once all 20
 * are cleared, the first open HARD level without stars; else the last open.
 */
export function nextLevelToPlay(): number {
  const open = LEVELS.filter((l) => isUnlocked(l.id));
  const fresh = open.find((l) => save.starsFor(l.id) === 0);
  if (fresh) return fresh.id;
  if (!hardUnlocked()) return open[open.length - 1].id;
  const hard = HARD_LEVELS.filter((l) => isUnlocked(l.id));
  return (hard.find((l) => save.starsFor(l.id) === 0) ?? hard[hard.length - 1]).id;
}

/**
 * Level map: one row of five tiles per world. Levels unlock one at a time;
 * BACK returns to the main menu.
 */
export class LevelSelect {
  readonly root: Phaser.GameObjects.Container;
  private tiles: Tile[] = [];
  private header: Phaser.GameObjects.Text;
  private totalStars: Phaser.GameObjects.Text;
  private totalIcon: Phaser.GameObjects.Graphics;
  private worldLabels: Phaser.GameObjects.Text[] = [];
  private back: IconButton;
  private plate: Phaser.GameObjects.Graphics;
  private worldStars: Phaser.GameObjects.Text[] = [];
  private size = 58;
  /** Showing the HARD MODE set. */
  private hard = false;
  private normalTab: Button;
  private hardTab: Button;
  /** The HARD tab before level 20 is cleared: greyed, with a lock. */
  private hardLocked: Button;
  private pokes = 0;
  private lastPoke = 0;

  constructor(
    private scene: Phaser.Scene,
    private onPick: (level: number | null) => void,
    private onSecret: () => void,
    onBack: () => void,
    private toast: (msg: string) => void = () => {},
  ) {
    this.back = makeIconButton(scene, 'back', onBack);
    this.header = makeText(scene, 0, 0, 'LEVELS', { size: 24, spacing: 3 }).setOrigin(0.5);
    this.plate = scene.add.graphics();
    // Easter egg: poke the header. It complains at 5, and at 10 you get a secret.
    this.header.setInteractive().on('pointerdown', () => this.poke());
    this.totalStars = makeText(scene, 0, 0, '', { font: 'mono', size: 13, weight: '700', color: '#ffd21f' }).setOrigin(1, 0.5);
    this.totalIcon = scene.add.graphics();

    WORLDS.forEach((w, i) => {
      this.worldLabels.push(
        makeText(scene, 0, 0, `WORLD ${i + 1} · ${w.name}`, { font: 'mono', size: 11, color: hexColor(w.color), spacing: 2 }),
      );
      this.worldStars.push(makeText(scene, 0, 0, '', { font: 'mono', size: 11, color: '#8fa3b5', spacing: 1 }).setOrigin(1, 0));
    });

    // NORMAL / HARD tabs. Until level 20 is cleared the HARD tab is a teaser:
    // greyed, with a lock, and tapping it says what opens it.
    this.normalTab = makeButton(scene, { label: 'NORMAL', width: 120, height: 34, style: 'ghost', onPress: () => this.setHard(false) });
    this.hardTab = makeButton(scene, { label: 'HARD', width: 120, height: 34, style: 'ghost', color: palette.crimson, onPress: () => this.setHard(true) });
    this.hardLocked = makeButton(scene, { label: 'HARD', icon: 'lock', width: 120, height: 34, style: 'ghost', color: 0x4a5866, onPress: () => this.lockedHard() });

    for (const level of [...LEVELS, ...HARD_LEVELS]) {
      const glow = scene.add.graphics();
      const bg = scene.add.graphics();
      const num = makeText(scene, 0, 0, String(level.id % HARD_OFFSET || HARD_OFFSET), { size: 20 }).setOrigin(0.5);
      const stars = scene.add.graphics();
      const warp = scene.add.image(0, 0, TEX.warpStar).setScale(0.2).setVisible(false);
      const hit = scene.add.zone(0, 0, 10, 10).setInteractive({ useHandCursor: true });
      const root = scene.add.container(0, 0, [glow, bg, num, stars, warp, hit]);
      hit.on('pointerdown', () => {
        sfx.unlock();
        if (!isUnlocked(level.id)) {
          sfx.denied();
          scene.tweens.add({ targets: root, x: root.x + 4, duration: 40, yoyo: true, repeat: 2 });
          return;
        }
        sfx.click();
        this.onPick(level.id);
      });
      this.tiles.push({ level, root, glow, bg, num, stars, warp });
    }


    this.root = scene.add.container(0, 0, [
      this.plate,
      this.header,
      this.totalStars,
      this.totalIcon,
      ...this.worldLabels,
      ...this.worldStars,
      ...this.tiles.map((t) => t.root),
      this.normalTab,
      this.hardTab,
      this.hardLocked,
      this.back,
    ]);
    this.root.setVisible(false);
  }

  /** Tapped the locked HARD tab: it shakes, and a toast says how to open it. */
  private lockedHard() {
    sfx.denied();
    const tab = this.hardLocked;
    this.scene.tweens.killTweensOf(tab);
    tab.setX(66);
    this.scene.tweens.add({ targets: tab, x: 70, duration: 40, yoyo: true, repeat: 2, onComplete: () => tab.setX(66) });
    this.toast(`CLEAR LEVEL ${LEVELS[LEVELS.length - 1].id} TO UNLOCK HARD MODE`);
  }

  /** Show the NORMAL or the HARD set. */
  setHard(on: boolean) {
    if (on && !hardUnlocked()) return;
    if (on !== this.hard) sfx.click();
    this.hard = on;
    this.refresh();
  }

  /** Open on the set the next level to play is in. */
  showSetOf(id: number) {
    this.hard = isHardLevel(id) && hardUnlocked();
    this.refresh();
  }

  /** Redraw every tile from saved progress. */
  refresh() {
    const s = this.size;
    const next = nextLevelToPlay();
    const open = hardUnlocked();
    if (!open) this.hard = false;
    this.normalTab.setAlpha(this.hard ? 0.45 : 1);
    this.hardTab.setVisible(open).setAlpha(this.hard ? 1 : 0.45);
    this.hardLocked.setVisible(!open);
    this.header.setText(this.hard ? 'HARD MODE' : 'LEVELS').setColor(this.hard ? '#ff2d55' : '#eaf6ff');
    for (const t of this.tiles) {
      t.root.setVisible(!!t.level.hard === this.hard);
      if (!t.root.visible) continue;
      const color = WORLDS[t.level.world].color;
      const open = isUnlocked(t.level.id);
      const stars = save.starsFor(t.level.id);
      const r = 12;
      t.bg.clear();
      t.stars.clear();
      t.glow.clear();
      (t.root.list[5] as Phaser.GameObjects.Zone).setSize(s, s);
      t.warp.setVisible(false);

      if (!open) {
        // Locked: dim tile, small number, a lock.
        t.bg.fillStyle(0x0a0f16, 0.85).fillRoundedRect(-s / 2, -s / 2, s, s, r);
        t.bg.lineStyle(1, 0x1c2733, 1).strokeRoundedRect(-s / 2, -s / 2, s, s, r);
        t.num.setColor('#34414f').setY(-8).setScale(0.7);
        drawIcon(t.stars, 'lock', 0, s * 0.2, 14, 0x34414f);
        continue;
      }
      t.num.setScale(1);
      t.bg.fillStyle(color, stars > 0 ? 0.16 : 0.08).fillRoundedRect(-s / 2, -s / 2, s, s, r);
      t.bg.lineStyle(1.5, color, stars > 0 ? 0.9 : 0.6).strokeRoundedRect(-s / 2, -s / 2, s, s, r);
      t.num.setColor(css.ink).setY(stars > 0 ? -6 : 0);
      if (stars > 0) {
        // Earned stars are gold; missing ones dark.
        for (let i = 0; i < 3; i++) drawStar(t.stars, (i - 1) * 12, s * 0.26, 5, i < stars ? 0xffd21f : 0x2a3644, true);
      }
      // A tiny rainbow warp star in the corner: you found this level's secret.
      if (save.warps.has(t.level.id)) t.warp.setPosition(s / 2 - 9, -s / 2 + 9).setVisible(true);
      if (t.level.id === next) {
        // The next level to play: a thick outline that breathes (see update).
        t.glow.lineStyle(3, color, 1).strokeRoundedRect(-s / 2 - 4, -s / 2 - 4, s + 8, s + 8, r + 4);
      }
    }

    const set = this.hard ? HARD_LEVELS : LEVELS;
    const total = set.reduce((a, l) => a + save.starsFor(l.id), 0);
    this.totalStars.setText(`${total} / ${set.length * 3}`);
    this.totalIcon.clear();
    drawStar(this.totalIcon, this.totalStars.x - this.totalStars.width - 12, this.totalStars.y, 7.5, this.hard ? palette.crimson : 0xffd21f, true);
    WORLDS.forEach((_, wi) => {
      const levels = set.filter((l) => l.world === wi);
      const got = levels.reduce((a, l) => a + save.starsFor(l.id), 0);
      this.worldStars[wi].setText(`${got} / ${levels.length * 3}`);
    });
  }

  layout(w: number, h: number, top: number) {
    const width = Math.min(w - 32, 380);
    this.size = Math.min(60, (width - GAP * (COLS - 1)) / COLS);
    const s = this.size;
    const left = -width / 2;

    // Top bar: back on the left, title in the middle, stars on the right.
    let y = 0;
    this.back.setPosition(left + 20, y + 22);
    this.header.setPosition(0, y + 22);
    this.totalStars.setPosition(-left, y + 22);
    y += 64;
    // NORMAL / HARD tabs (HARD is a locked teaser until level 20 is cleared).
    this.normalTab.setPosition(-66, y + 4);
    this.hardTab.setPosition(66, y + 4);
    this.hardLocked.setPosition(66, y + 4);
    y += 50;
    const plateTop = y - 10;

    WORLDS.forEach((_, wi) => {
      this.worldLabels[wi].setPosition(left, y);
      this.worldStars[wi].setPosition(-left, y);
      y += 22;
      const row = this.tiles.filter((t) => t.level.world === wi && !t.level.hard);
      const hardRow = this.tiles.filter((t) => t.level.world === wi && t.level.hard);
      hardRow.forEach((t, i) => t.root.setPosition(left + s / 2 + i * (s + GAP), y + s / 2));
      row.forEach((t, i) => t.root.setPosition(left + s / 2 + i * (s + GAP), y + s / 2));
      y += s + 22;
    });

    const contentH = y;
    this.plate.clear();
    this.plate.fillStyle(0x0a0f18, 0.88).fillRoundedRect(left - 14, plateTop, width + 28, y - plateTop, 22);
    this.plate.lineStyle(1, 0x1c2a3a, 1).strokeRoundedRect(left - 14, plateTop, width + 28, y - plateTop, 22);

    // Shrink to fit short screens (small phones, landscape).
    const avail = h - top - 16;
    const scale = Math.min(1, avail / contentH);
    this.root.setScale(scale);
    this.root.setPosition(w / 2, top - 44);
    this.refresh();
  }

  private poke() {
    const now = this.scene.time.now;
    this.pokes = now - this.lastPoke < 1500 ? this.pokes + 1 : 1;
    this.lastPoke = now;
    this.scene.tweens.add({ targets: this.header, x: this.header.x + 3, duration: 35, yoyo: true, repeat: 1 });
    if (this.pokes === 5) {
      this.header.setText('STOP POKING ME');
      this.scene.time.delayedCall(1600, () => this.header.setText(this.hard ? 'HARD MODE' : 'LEVELS'));
    } else if (this.pokes === 10) {
      this.pokes = 0;
      this.header.setText(this.hard ? 'HARD MODE' : 'LEVELS');
      this.onSecret();
    }
  }

  update(time: number) {
    // Breathe the glow on the next level to play.
    const k = 0.55 + 0.45 * Math.sin(time / 300);
    for (const t of this.tiles) t.glow.setAlpha(k);
  }
}
