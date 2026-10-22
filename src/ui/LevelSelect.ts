import Phaser from 'phaser';
import { ALL_LEVELS, LEVELS_OF, SETS, UNLOCK_AT, WORLDS, levelId, levelNumber, setOf, type LevelDef, type LevelSet } from '../game/levels';
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

/** The set before this one: clearing its level 10 opens this one. */
const PREV: Record<LevelSet, LevelSet | null> = { easy: null, normal: 'easy', hard: 'normal' };
const SET_COLOR: Record<LevelSet, number> = { easy: 0x7cff6b, normal: palette.cyan, hard: palette.crimson };
const SET_HEADER: Record<LevelSet, string> = { easy: 'EASY MODE', normal: 'LEVELS', hard: 'HARD MODE' };

/**
 * EASY is always open; EASY 10 opens NORMAL and NORMAL 10 opens HARD. A set
 * that already has stars stays open (saves from before EASY existed).
 */
export const setUnlocked = (set: LevelSet): boolean => {
  const prev = PREV[set];
  if (!prev) return true;
  return save.starsFor(levelId(prev, UNLOCK_AT)) > 0 || LEVELS_OF[set].some((l) => save.starsFor(l.id) > 0);
};

export const isUnlocked = (id: number) => setUnlocked(setOf(id)) && (levelNumber(id) === 1 || save.starsFor(id - 1) > 0);

/**
 * The next level to play: the first open level without stars in the hardest
 * open set (a newly opened set is where the game goes on), else in an easier
 * one; once everything open is cleared, the last open level of the hardest set.
 */
export function nextLevelToPlay(): number {
  const open = SETS.filter(setUnlocked).reverse();
  for (const set of open) {
    const fresh = LEVELS_OF[set].find((l) => isUnlocked(l.id) && save.starsFor(l.id) === 0);
    if (fresh) return fresh.id;
  }
  const top = LEVELS_OF[open[0]].filter((l) => isUnlocked(l.id));
  return top[top.length - 1].id;
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
  /** The set on show. */
  private set: LevelSet = 'easy';
  private tabs = {} as Record<LevelSet, Button>;
  /** A set's tab before it opens: greyed, with a lock. */
  private lockedTabs = {} as Record<LevelSet, Button>;
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

    // EASY / NORMAL / HARD tabs. Until a set opens its tab is a teaser:
    // greyed, with a lock, and tapping it says what opens it.
    for (const set of SETS) {
      const label = set.toUpperCase();
      this.tabs[set] = makeButton(scene, { label, width: 104, height: 34, style: 'ghost', color: SET_COLOR[set], onPress: () => this.setSet(set) });
      this.lockedTabs[set] = makeButton(scene, { label, icon: 'lock', width: 104, height: 34, style: 'ghost', color: 0x4a5866, onPress: () => this.lockedSet(set) });
    }

    for (const level of ALL_LEVELS) {
      const glow = scene.add.graphics();
      const bg = scene.add.graphics();
      const num = makeText(scene, 0, 0, String(levelNumber(level.id)), { size: 20 }).setOrigin(0.5);
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
      ...SETS.map((s) => this.tabs[s]),
      ...SETS.map((s) => this.lockedTabs[s]),
      this.back,
    ]);
    this.root.setVisible(false);
  }

  /** Tapped a locked tab: it shakes, and a toast says how to open it. */
  private lockedSet(set: LevelSet) {
    sfx.denied();
    const tab = this.lockedTabs[set];
    const x = tab.getData('x') as number;
    this.scene.tweens.killTweensOf(tab);
    tab.setX(x);
    this.scene.tweens.add({ targets: tab, x: x + 4, duration: 40, yoyo: true, repeat: 2, onComplete: () => tab.setX(x) });
    const prev = PREV[set]!;
    this.toast(`CLEAR ${prev.toUpperCase()} ${UNLOCK_AT} TO UNLOCK ${set.toUpperCase()}`);
  }

  /** Show one of the sets. */
  setSet(set: LevelSet) {
    if (!setUnlocked(set)) return;
    if (set !== this.set) sfx.click();
    this.set = set;
    this.refresh();
  }

  /** Open on the set this level is in. */
  showSetOf(id: number) {
    this.set = setUnlocked(setOf(id)) ? setOf(id) : 'easy';
    this.refresh();
  }

  /** Redraw every tile from saved progress. */
  refresh() {
    const s = this.size;
    const next = nextLevelToPlay();
    if (!setUnlocked(this.set)) this.set = 'easy';
    for (const set of SETS) {
      const open = setUnlocked(set);
      this.tabs[set].setVisible(open).setAlpha(set === this.set ? 1 : 0.45);
      this.lockedTabs[set].setVisible(!open);
    }
    this.header.setText(SET_HEADER[this.set]).setColor(this.set === 'normal' ? '#eaf6ff' : hexColor(SET_COLOR[this.set]));
    for (const t of this.tiles) {
      t.root.setVisible((t.level.set ?? 'normal') === this.set);
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

    const set = LEVELS_OF[this.set];
    const total = set.reduce((a, l) => a + save.starsFor(l.id), 0);
    this.totalStars.setText(`${total} / ${set.length * 3}`);
    this.totalIcon.clear();
    drawStar(this.totalIcon, this.totalStars.x - this.totalStars.width - 12, this.totalStars.y, 7.5, this.set === 'hard' ? palette.crimson : 0xffd21f, true);
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
    // EASY / NORMAL / HARD tabs (locked teasers until they open).
    SETS.forEach((set, i) => {
      const x = (i - 1) * 114;
      this.tabs[set].setPosition(x, y + 4);
      this.lockedTabs[set].setPosition(x, y + 4).setData('x', x);
    });
    y += 50;
    const plateTop = y - 10;

    WORLDS.forEach((_, wi) => {
      this.worldLabels[wi].setPosition(left, y);
      this.worldStars[wi].setPosition(-left, y);
      y += 22;
      for (const set of SETS) {
        const row = this.tiles.filter((t) => t.level.world === wi && (t.level.set ?? 'normal') === set);
        row.forEach((t, i) => t.root.setPosition(left + s / 2 + i * (s + GAP), y + s / 2));
      }
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
      this.scene.time.delayedCall(1600, () => this.header.setText(SET_HEADER[this.set]));
    } else if (this.pokes === 10) {
      this.pokes = 0;
      this.header.setText(SET_HEADER[this.set]);
      this.onSecret();
    }
  }

  update(time: number) {
    // Breathe the glow on the next level to play.
    const k = 0.55 + 0.45 * Math.sin(time / 300);
    for (const t of this.tiles) t.glow.setAlpha(k);
  }
}
