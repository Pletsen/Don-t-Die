import Phaser from 'phaser';
import { LEVELS, WORLDS, ENDLESS_UNLOCK_LEVEL, type LevelDef } from '../game/levels';
import { save } from '../game/storage';
import { css, palette } from '../game/palette';
import { sfx } from '../audio/Sfx';
import { drawStar, hexColor, makeButton, makeText, type Button } from './widgets';

const COLS = 5;
const GAP = 10;

interface Tile {
  level: LevelDef;
  root: Phaser.GameObjects.Container;
  glow: Phaser.GameObjects.Graphics;
  bg: Phaser.GameObjects.Graphics;
  num: Phaser.GameObjects.Text;
  stars: Phaser.GameObjects.Graphics;
}

export const isUnlocked = (id: number) => id === 1 || save.starsFor(id - 1) > 0;
export const endlessUnlocked = () => save.starsFor(ENDLESS_UNLOCK_LEVEL) > 0 || save.best > 0;

/** The next level to play: the first unlocked one without stars, else the last. */
export function nextLevelToPlay(): number {
  const open = LEVELS.filter((l) => isUnlocked(l.id));
  return (open.find((l) => save.starsFor(l.id) === 0) ?? open[open.length - 1]).id;
}

/**
 * Level map: one row of five tiles per world. Levels unlock one at a time;
 * clearing level 5 also unlocks endless mode.
 */
export class LevelSelect {
  readonly root: Phaser.GameObjects.Container;
  private tiles: Tile[] = [];
  private header: Phaser.GameObjects.Text;
  private totalStars: Phaser.GameObjects.Text;
  private totalIcon: Phaser.GameObjects.Graphics;
  private worldLabels: Phaser.GameObjects.Text[] = [];
  private endless: Button;
  private endlessNote: Phaser.GameObjects.Text;
  private size = 58;

  constructor(
    scene: Phaser.Scene,
    private onPick: (level: number | null) => void,
  ) {
    this.header = makeText(scene, 0, 0, 'SELECT LEVEL', { size: 22, spacing: 1.5 });
    this.totalStars = makeText(scene, 0, 0, '', { font: 'mono', size: 13, color: css.inkDim }).setOrigin(1, 0.5);
    this.totalIcon = scene.add.graphics();

    WORLDS.forEach((w, i) => {
      this.worldLabels.push(
        makeText(scene, 0, 0, `WORLD ${i + 1} · ${w.name}`, { font: 'mono', size: 11, color: hexColor(w.color), spacing: 2 }),
      );
    });

    for (const level of LEVELS) {
      const glow = scene.add.graphics();
      const bg = scene.add.graphics();
      const num = makeText(scene, 0, 0, String(level.id), { size: 20 }).setOrigin(0.5);
      const stars = scene.add.graphics();
      const hit = scene.add.zone(0, 0, 10, 10).setInteractive({ useHandCursor: true });
      const root = scene.add.container(0, 0, [glow, bg, num, stars, hit]);
      hit.on('pointerdown', () => {
        sfx.unlock();
        if (!isUnlocked(level.id)) {
          scene.tweens.add({ targets: root, x: root.x + 4, duration: 40, yoyo: true, repeat: 2 });
          return;
        }
        sfx.click();
        this.onPick(level.id);
      });
      this.tiles.push({ level, root, glow, bg, num, stars });
    }

    this.endless = makeButton(scene, {
      label: 'ENDLESS',
      width: 300,
      style: 'ghost',
      color: palette.cyan,
      onPress: () => {
        if (endlessUnlocked()) this.onPick(null);
      },
    });
    this.endlessNote = makeText(scene, 0, 0, '', { font: 'mono', size: 10, color: css.inkDim, spacing: 1.2 }).setOrigin(0.5);

    this.root = scene.add.container(0, 0, [
      this.header,
      this.totalStars,
      this.totalIcon,
      ...this.worldLabels,
      ...this.tiles.map((t) => t.root),
      this.endless,
      this.endlessNote,
    ]);
    this.root.setVisible(false);
  }

  /** Redraw every tile from saved progress. */
  refresh() {
    const s = this.size;
    const next = nextLevelToPlay();
    for (const t of this.tiles) {
      const color = WORLDS[t.level.world].color;
      const open = isUnlocked(t.level.id);
      const stars = save.starsFor(t.level.id);
      const r = 12;
      t.bg.clear();
      t.stars.clear();
      t.glow.clear();
      (t.root.list[4] as Phaser.GameObjects.Zone).setSize(s, s);

      if (!open) {
        t.bg.fillStyle(0x0a0f16, 0.85).fillRoundedRect(-s / 2, -s / 2, s, s, r);
        t.bg.lineStyle(1, 0x1c2733, 1).strokeRoundedRect(-s / 2, -s / 2, s, s, r);
        t.num.setColor('#34414f').setY(0);
        continue;
      }
      t.bg.fillStyle(color, stars > 0 ? 0.16 : 0.08).fillRoundedRect(-s / 2, -s / 2, s, s, r);
      t.bg.lineStyle(1.5, color, stars > 0 ? 0.9 : 0.6).strokeRoundedRect(-s / 2, -s / 2, s, s, r);
      t.num.setColor(css.ink).setY(stars > 0 ? -6 : 0);
      if (stars > 0) {
        for (let i = 0; i < 3; i++) drawStar(t.stars, (i - 1) * 12, s * 0.26, 4.6, i < stars ? 0xffffff : 0x3a4756, i < stars);
      }
      if (t.level.id === next) {
        for (let i = 3; i >= 1; i--) {
          const grow = i * 4;
          t.glow.fillStyle(color, 0.08).fillRoundedRect(-s / 2 - grow, -s / 2 - grow, s + grow * 2, s + grow * 2, r + grow);
        }
      }
    }

    const total = save.totalStars();
    this.totalStars.setText(`${total} / ${LEVELS.length * 3}`);
    this.totalIcon.clear();
    drawStar(this.totalIcon, this.totalStars.x - this.totalStars.width - 12, this.totalStars.y, 7, 0xffffff, true);
    const open = endlessUnlocked();
    this.endless.setAlpha(open ? 1 : 0.35);
    this.endlessNote.setText(open ? `BEST ${save.best.toFixed(1)} M` : `CLEAR LEVEL ${ENDLESS_UNLOCK_LEVEL} TO UNLOCK`);
  }

  layout(w: number, h: number, top: number) {
    const width = Math.min(w - 32, 380);
    this.size = Math.min(60, (width - GAP * (COLS - 1)) / COLS);
    const s = this.size;
    const left = -width / 2;

    let y = 0;
    this.header.setPosition(left, y);
    this.totalStars.setPosition(-left, y + 15);
    y += 50;

    WORLDS.forEach((_, wi) => {
      this.worldLabels[wi].setPosition(left, y);
      y += 22;
      const row = this.tiles.filter((t) => t.level.world === wi);
      row.forEach((t, i) => t.root.setPosition(left + s / 2 + i * (s + GAP), y + s / 2));
      y += s + 22;
    });

    y += 8;
    this.endless.setPosition(0, y + 20);
    this.endlessNote.setPosition(0, y + 54);
    const contentH = y + 64;

    // Shrink to fit short screens (small phones, landscape).
    const avail = h - top - 16;
    const scale = Math.min(1, avail / contentH);
    this.root.setScale(scale);
    this.root.setPosition(w / 2, top + Math.max(0, (avail - contentH * scale) / 2));
    this.refresh();
  }

  update(time: number) {
    // Breathe the glow on the next level to play.
    const k = 0.55 + 0.45 * Math.sin(time / 300);
    for (const t of this.tiles) t.glow.setAlpha(k);
  }
}
