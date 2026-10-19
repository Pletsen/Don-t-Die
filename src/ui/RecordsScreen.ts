import Phaser from 'phaser';
import { save } from '../game/storage';
import { css, palette } from '../game/palette';
import { sfx } from '../audio/Sfx';
import { LEVELS } from '../game/levels';
import { progress } from '../game/progress';
import { shortDate } from '../game/daily';
import { ACHIEVEMENTS } from '../game/achievements';
import { makeText } from './widgets';
import { BODY, CAPTION, GOLD, GOLD_CSS, TopBar, drawGlyph, drawPlate, setIfChanged } from './DailyScreen';

const COLS = 6;
const TILE_GAP = 8;
const LINE = 0x1c2a3a;

type Tab = 'stats' | 'achievements';

interface Cell {
  value: Phaser.GameObjects.Text;
  label: Phaser.GameObjects.Text;
}

/**
 * RECORDS: two tabs. STATS shows the survival record with the top-5 runs
 * and lifetime numbers; ACHIEVEMENTS shows every achievement as a tile
 * (gold = unlocked) with a detail panel for the selected one.
 */
export class RecordsScreen {
  readonly root: Phaser.GameObjects.Container;
  private content: Phaser.GameObjects.Container;
  private bar: TopBar;
  private width = 358;
  private tab: Tab = 'stats';

  private tabs: Phaser.GameObjects.Graphics;
  private tabStats: Phaser.GameObjects.Text;
  private tabAch: Phaser.GameObjects.Text;
  private tabHitStats: Phaser.GameObjects.Zone;
  private tabHitAch: Phaser.GameObjects.Zone;

  // Stats page
  private stats: Phaser.GameObjects.Container;
  private statsPlates: Phaser.GameObjects.Graphics;
  private survCaption: Phaser.GameObjects.Text;
  private survBest: Phaser.GameObjects.Text;
  private dailyBest: Phaser.GameObjects.Text;
  private topRows: Phaser.GameObjects.Text[] = [];
  private lifeCaption: Phaser.GameObjects.Text;
  private cells: Cell[] = [];

  // Achievements page
  private ach: Phaser.GameObjects.Container;
  private tiles: { root: Phaser.GameObjects.Container; g: Phaser.GameObjects.Graphics }[] = [];
  private detailPlate: Phaser.GameObjects.Graphics;
  private detailName: Phaser.GameObjects.Text;
  private detailDesc: Phaser.GameObjects.Text;
  private detailStatus: Phaser.GameObjects.Text;
  private detailReward: Phaser.GameObjects.Text;
  private selected = 0;
  private tile = 54;
  private detailY = 0;

  constructor(scene: Phaser.Scene, handlers: { back: () => void }) {
    const caption = (str = '') => makeText(scene, 0, 0, str, { font: 'mono', size: 11, color: CAPTION, spacing: 1.6 });
    this.bar = new TopBar(scene, 'RECORDS', handlers.back);

    this.tabs = scene.add.graphics();
    this.tabStats = makeText(scene, 0, 0, 'STATS', { size: 13, spacing: 1.5 }).setOrigin(0.5);
    this.tabAch = makeText(scene, 0, 0, 'ACHIEVEMENTS', { size: 13, spacing: 0.6 }).setOrigin(0.5);
    this.tabHitStats = scene.add.zone(0, 0, 10, 10).setInteractive({ useHandCursor: true });
    this.tabHitAch = scene.add.zone(0, 0, 10, 10).setInteractive({ useHandCursor: true });
    this.tabHitStats.on('pointerdown', () => this.setTab('stats'));
    this.tabHitAch.on('pointerdown', () => this.setTab('achievements'));

    // --- Stats
    this.statsPlates = scene.add.graphics();
    this.survCaption = caption('SURVIVAL RECORD');
    this.survBest = makeText(scene, 0, 0, '', { size: 34, spacing: 1 });
    this.dailyBest = caption().setOrigin(1, 0);
    for (let i = 0; i < 5; i++) this.topRows.push(makeText(scene, 0, 0, '', { font: 'mono', size: 13, color: BODY }));
    this.lifeCaption = caption('LIFETIME');
    for (let i = 0; i < 12; i++) {
      this.cells.push({
        value: makeText(scene, 0, 0, '', { size: 18, spacing: 0.5 }),
        label: caption(),
      });
    }
    this.stats = scene.add.container(0, 0, [
      this.statsPlates,
      this.survCaption,
      this.survBest,
      this.dailyBest,
      ...this.topRows,
      this.lifeCaption,
      ...this.cells.flatMap((c) => [c.value, c.label]),
    ]);

    // --- Achievements
    ACHIEVEMENTS.forEach((_, i) => {
      const g = scene.add.graphics();
      const hit = scene.add.zone(0, 0, 10, 10).setInteractive({ useHandCursor: true });
      hit.on('pointerdown', () => {
        sfx.click();
        this.selected = i;
        this.drawAchievements();
      });
      this.tiles.push({ root: scene.add.container(0, 0, [g, hit]), g });
    });
    this.detailPlate = scene.add.graphics();
    this.detailName = makeText(scene, 0, 0, '', { size: 18, spacing: 1 });
    this.detailDesc = makeText(scene, 0, 0, '', { size: 13, color: BODY, weight: '500' });
    this.detailStatus = caption();
    this.detailReward = makeText(scene, 0, 0, '', { font: 'mono', size: 14, weight: '700', color: GOLD_CSS }).setOrigin(1, 0);
    this.ach = scene.add.container(0, 0, [
      ...this.tiles.map((t) => t.root),
      this.detailPlate,
      this.detailName,
      this.detailDesc,
      this.detailStatus,
      this.detailReward,
    ]);

    this.content = scene.add.container(0, 0, [
      this.bar.root,
      this.tabs,
      this.tabStats,
      this.tabAch,
      this.tabHitStats,
      this.tabHitAch,
      this.stats,
      this.ach,
    ]);
    this.root = scene.add.container(0, 0, [this.content]).setVisible(false);
    progress.onChange(() => {
      if (this.root.visible) this.refresh();
    });
  }

  /** Open on a tab ('achievements' is handy right after an unlock banner). */
  setTab(tab: Tab) {
    if (tab !== this.tab) sfx.click();
    this.tab = tab;
    this.refresh();
  }

  layout(w: number, h: number, top: number) {
    const W = Math.min(w - 32, 380);
    this.width = W;
    const left = -W / 2;
    const pad = 18;
    this.bar.layout(W);

    // Tabs
    const tw = (W - 8) / 2;
    this.tabStats.setPosition(left + tw / 2, 67);
    this.tabAch.setPosition(-left - tw / 2, 67);
    this.tabHitStats.setPosition(left + tw / 2, 67).setSize(tw, 40);
    this.tabHitAch.setPosition(-left - tw / 2, 67).setSize(tw, 40);

    // Stats page: survival card, then the lifetime grid.
    let y = 100;
    this.survCaption.setPosition(left + pad, y + 16);
    this.dailyBest.setPosition(-left - pad, y + 16);
    this.survBest.setPosition(left + pad, y + 32);
    this.topRows.forEach((t, i) => t.setPosition(left + pad, y + 86 + i * 24));
    y += 214 + 12;
    this.lifeY = y;
    this.lifeCaption.setPosition(left + pad, y + 16);
    const colW = (W - pad * 2) / 2;
    this.cells.forEach((c, i) => {
      const cx = left + pad + (i % 2) * colW;
      const cy = y + 40 + Math.floor(i / 2) * 46;
      c.value.setPosition(cx, cy);
      c.label.setPosition(cx, cy + 24);
    });
    const statsH = y + 40 + 6 * 46 + 4;

    // Achievements page: the grid, then the detail panel.
    this.tile = Math.floor((W - TILE_GAP * (COLS - 1)) / COLS);
    const s = this.tile;
    this.tiles.forEach((t, i) => {
      const cx = left + s / 2 + (i % COLS) * (s + TILE_GAP);
      const cy = 100 + s / 2 + Math.floor(i / COLS) * (s + TILE_GAP);
      t.root.setPosition(cx, cy);
      (t.root.list[1] as Phaser.GameObjects.Zone).setSize(s + TILE_GAP, s + TILE_GAP);
    });
    const rows = Math.ceil(this.tiles.length / COLS);
    this.detailY = 100 + rows * (s + TILE_GAP) + 4;
    this.detailName.setPosition(left + 64, this.detailY + 14);
    this.detailDesc.setPosition(left + 64, this.detailY + 40);
    this.detailStatus.setPosition(left + 64, this.detailY + 66);
    this.detailReward.setPosition(-left - pad, this.detailY + 16);
    const achH = this.detailY + 96;

    const contentH = Math.max(statsH, achH);
    const avail = h - top - 12;
    const scale = Math.min(1, avail / contentH);
    this.content.setScale(scale);
    this.content.setPosition(w / 2, top);
    this.refresh();
  }

  private lifeY = 0;

  refresh() {
    progress.checkDay();
    this.bar.refresh();
    const W = this.width;
    const left = -W / 2;
    const tw = (W - 8) / 2;
    const g = this.tabs.clear();
    const drawTab = (x: number, on: boolean) => {
      g.fillStyle(on ? palette.cyan : 0x0a0f18, on ? 0.14 : 0.9).fillRoundedRect(x, 50, tw, 34, 17);
      g.lineStyle(1.5, on ? palette.cyan : 0x2a3644, 1).strokeRoundedRect(x, 50, tw, 34, 17);
    };
    drawTab(left, this.tab === 'stats');
    drawTab(left + tw + 8, this.tab === 'achievements');
    this.tabStats.setColor(this.tab === 'stats' ? css.cyan : CAPTION);
    this.tabAch.setColor(this.tab === 'achievements' ? css.cyan : CAPTION);
    setIfChanged(this.tabAch, `ACHIEVEMENTS ${progress.achievements.count}/${ACHIEVEMENTS.length}`);

    this.stats.setVisible(this.tab === 'stats');
    this.ach.setVisible(this.tab === 'achievements');
    if (this.tab === 'stats') this.drawStats();
    else this.drawAchievements();
  }

  private drawStats() {
    const W = this.width;
    const left = -W / 2;
    const g = this.statsPlates.clear();
    drawPlate(g, left, 100, W, 214, palette.cyan, 0.4);
    drawPlate(g, left, this.lifeY, W, 6 * 46 + 44);

    const best = progress.survivalBest();
    setIfChanged(this.survBest, best > 0 ? `${best.toFixed(1)} M` : '—');
    const daily = progress.daily.run().bestEver;
    setIfChanged(this.dailyBest, daily.m > 0 ? `DAILY BEST ${daily.m.toFixed(0)} M` : 'NO DAILY RUN YET');
    const top = progress.survivalTop();
    this.topRows.forEach((t, i) => {
      const r = top[i];
      const line = r
        ? `#${i + 1}  ${r.m.toFixed(1).padStart(7)} M   ${r.s > 0 ? clock(r.s) : '  —  '}   ${r.key ? shortDate(r.key) : ''}`
        : `#${i + 1}        —`;
      setIfChanged(t, line);
      t.setColor(r && i === 0 ? GOLD_CSS : r ? BODY : CAPTION);
    });
    // Divider above the list.
    g.fillStyle(LINE, 1).fillRect(left + 18, 100 + 78, W - 36, 1);

    const s = progress.stats();
    const cleared = progress.levelsCleared();
    const cells: [string, string][] = [
      [String(s.runs), 'RUNS'],
      [String(Math.max(s.deaths, save.deaths)), 'DEATHS'],
      [distance(s.meters), 'DISTANCE'],
      [duration(s.seconds), 'TIME PLAYED'],
      [String(s.perfects), 'PERFECT TURNS'],
      [`x${s.bestCombo}`, 'BEST COMBO'],
      [String(s.nearMisses), 'CLOSE CALLS'],
      [String(s.ducksEarned), 'DUCKS EARNED'],
      [`${cleared} / ${LEVELS.length}`, 'LEVELS CLEARED'],
      [`${progress.totalStars()} / ${LEVELS.length * 3}`, 'STARS'],
      [`${save.warps.size} / ${LEVELS.length}`, 'WARP STARS'],
      [`${progress.daily.streak().best} ${progress.daily.streak().best === 1 ? 'DAY' : 'DAYS'}`, 'BEST STREAK'],
    ];
    cells.forEach(([v, l], i) => {
      setIfChanged(this.cells[i].value, v);
      setIfChanged(this.cells[i].label, l);
    });
  }

  private drawAchievements() {
    const list = progress.achievements.list();
    const s = this.tile;
    list.forEach((a, i) => {
      const g = this.tiles[i].g.clear();
      const sel = i === this.selected;
      const r = 12;
      if (a.unlocked) {
        g.fillStyle(GOLD, 0.12).fillRoundedRect(-s / 2, -s / 2, s, s, r);
        g.lineStyle(a.def.big ? 2 : 1.5, GOLD, a.def.big ? 1 : 0.75).strokeRoundedRect(-s / 2, -s / 2, s, s, r);
        drawGlyph(g, a.def.glyph, 0, 0, s * 0.26, GOLD);
      } else {
        g.fillStyle(0x0a0f18, 0.9).fillRoundedRect(-s / 2, -s / 2, s, s, r);
        g.lineStyle(1, 0x1c2733, 1).strokeRoundedRect(-s / 2, -s / 2, s, s, r);
        drawGlyph(g, a.def.glyph, 0, 0, s * 0.24, 0x2a3644);
        drawGlyph(g, 'lock', s / 2 - 11, s / 2 - 12, 5, 0x4a5a6a);
        if (a.progress && a.progress[0] > 0) {
          // A thin progress line along the bottom edge.
          const k = a.progress[0] / a.progress[1];
          g.fillStyle(palette.cyan, 0.7).fillRect(-s / 2 + 8, s / 2 - 5, (s - 16) * k, 2);
        }
      }
      if (sel) g.lineStyle(2, 0xffffff, 0.9).strokeRoundedRect(-s / 2 - 3, -s / 2 - 3, s + 6, s + 6, r + 3);
    });

    const a = list[this.selected] ?? list[0];
    const W = this.width;
    const left = -W / 2;
    const g = this.detailPlate.clear();
    drawPlate(g, left, this.detailY, W, 92, a.unlocked ? GOLD : LINE, a.unlocked ? 0.6 : 1);
    g.fillStyle(a.unlocked ? GOLD : 0x2a3644, a.unlocked ? 0.16 : 0.5).fillCircle(left + 34, this.detailY + 46, 20);
    drawGlyph(g, a.def.glyph, left + 34, this.detailY + 46, 11, a.unlocked ? GOLD : 0x6f8496);
    setIfChanged(this.detailName, a.def.name);
    this.detailName.setColor(a.unlocked ? GOLD_CSS : css.ink);
    setIfChanged(this.detailDesc, a.def.desc);
    setIfChanged(
      this.detailStatus,
      a.unlocked
        ? `UNLOCKED ${shortDate(new Date(a.at).toISOString().slice(0, 10))}`
        : a.progress
          ? `${a.progress[0]} / ${a.progress[1]}`
          : 'LOCKED',
    );
    this.detailStatus.setColor(a.unlocked ? GOLD_CSS : CAPTION);
    setIfChanged(this.detailReward, `+${a.def.ducks}`);
    this.detailReward.setAlpha(a.unlocked ? 0.5 : 1);
    if (!a.unlocked && a.progress) {
      // Progress bar to the right of the "42 / 1000" readout.
      const bx = this.detailStatus.x + this.detailStatus.width + 12;
      const bw = -left - 18 - bx;
      const k = a.progress[0] / a.progress[1];
      g.fillStyle(LINE, 1).fillRoundedRect(bx, this.detailY + 70, bw, 6, 3);
      if (k > 0) g.fillStyle(palette.cyan, 1).fillRoundedRect(bx, this.detailY + 70, Math.max(6, bw * k), 6, 3);
    }
  }

  update(_time: number) {
    // Static screen: nothing animates per frame.
  }
}

function clock(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function distance(m: number) {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} KM` : `${Math.floor(m)} M`;
}

function duration(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}H ${m}M` : `${m}M ${Math.floor(sec % 60)}S`;
}
