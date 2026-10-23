import Phaser from 'phaser';
import { palette } from '../game/palette';
import { SKINS, RARITIES, skinTexture } from '../game/skins';
import { TEX, DUCK_RES } from '../fx/textures';
import { drawIcon } from './icons';
import { hexColor, makeText } from './widgets';
import type { CardArt } from './Coach';
import type { LevelSet } from '../game/levels';

/** Pictures for the intro cards (see Coach). Drawn round (0, 0), about 300 x 120. */

const SET_COLOR: Record<LevelSet, number> = { easy: 0x7cff6b, normal: palette.cyan, hard: palette.crimson };

/**
 * A set just opened: the three tabs of the level map, the earlier ones done
 * (a tick), the new one glowing, the ones after still locked.
 */
export function setsArt(scene: Phaser.Scene, opened: LevelSet): CardArt {
  const sets: LevelSet[] = ['easy', 'normal', 'hard'];
  const at = sets.indexOf(opened);
  const g = scene.add.graphics();
  const glow = scene.add.graphics();
  const labels = sets.map((s, i) =>
    makeText(scene, (i - 1) * 104, 0, s.toUpperCase(), { size: 15, spacing: 2, color: i > at ? '#3a4756' : hexColor(SET_COLOR[s]) }).setOrigin(0.5),
  );
  const tag = makeText(scene, 0, 38, 'UNLOCKED!', { font: 'mono', size: 11, weight: '700', color: hexColor(SET_COLOR[opened]), spacing: 3 }).setOrigin(0.5);
  tag.setX((at - 1) * 104);
  const root = scene.add.container(0, 0, [glow, g, ...labels, tag]);
  const W = 94;
  const H = 40;
  const draw = () => {
    g.clear();
    sets.forEach((s, i) => {
      const x = (i - 1) * 104;
      const c = i > at ? 0x2a3644 : SET_COLOR[s];
      g.fillStyle(i === at ? c : 0x0a0f18, i === at ? 0.14 : 0.9).fillRoundedRect(x - W / 2, -H / 2, W, H, H / 2);
      g.lineStyle(2, c, i > at ? 1 : 0.9).strokeRoundedRect(x - W / 2, -H / 2, W, H, H / 2);
      if (i < at) g.lineStyle(3, c, 1).lineBetween(x - 6, -H / 2 - 14, x - 1, -H / 2 - 9).lineBetween(x - 1, -H / 2 - 9, x + 8, -H / 2 - 20);
      if (i > at) drawIcon(g, 'lock', x, -H / 2 - 14, 14, 0x3a4756);
    });
    // Arrows between the tabs.
    g.lineStyle(2, 0x3a4756, 1);
    for (const x of [-52, 52]) g.lineBetween(x - 4, -5, x + 1, 0).lineBetween(x - 4, 5, x + 1, 0);
  };
  draw();
  labels[at].setShadow(0, 0, hexColor(SET_COLOR[opened]), 14, false, true);
  return {
    root,
    update: (t) => {
      const x = (at - 1) * 104;
      const k = 0.5 + 0.5 * Math.sin(t * 4);
      glow.clear();
      for (let i = 3; i >= 1; i--) glow.fillStyle(SET_COLOR[opened], 0.05 + 0.05 * k).fillRoundedRect(x - W / 2 - i * 5, -H / 2 - i * 5, W + i * 10, H + i * 10, H / 2 + i * 5);
      labels[at].setScale(1 + 0.04 * k);
      tag.setY(38 + Math.sin(t * 3) * 2);
    },
  };
}

/**
 * The QUACK REACTOR: ducks hop in from the left, the core swirls, and a new
 * skin pops out on the right (rare, epic, legendary in turn).
 */
export function reactorArt(scene: Phaser.Scene): CardArt {
  const add = scene.add;
  const g = add.graphics();
  const core = add.image(0, 0, TEX.glow).setBlendMode(Phaser.BlendModes.ADD).setTint(palette.magenta);
  const ducks = [0, 1, 2, 3, 4].map(() => add.image(0, 0, TEX.duck).setScale(0.3 / DUCK_RES));
  // Rare and up: the card promises the first charge is rare or better.
  const shown = (['rare', 'epic', 'legendary'] as const).map((r) => SKINS.find((s) => s.rarity === r)!);
  const halo = add.image(110, -6, TEX.glow).setBlendMode(Phaser.BlendModes.ADD);
  const skin = add.image(110, -6, skinTexture(shown[0].id));
  const label = makeText(scene, 110, 44, '', { font: 'mono', size: 10, weight: '700', spacing: 2 }).setOrigin(0.5);
  const count = makeText(scene, -88, 44, '100 DUCKS', { font: 'mono', size: 10, weight: '700', color: '#ffd21f', spacing: 2 }).setOrigin(0.5);
  const root = add.container(0, 0, [g, core, ...ducks, halo, skin, label, count]);
  const PERIOD = 2.6;
  return {
    root,
    update: (t) => {
      const cycle = Math.floor(t / PERIOD);
      const u = (t % PERIOD) / PERIOD;
      const rarity = shown[cycle % shown.length].rarity;
      const rc = RARITIES[rarity].color;
      // The reactor: two rings turning against each other round a hot core.
      g.clear();
      const spin = t * (1.4 + 6 * Math.max(0, u - 0.4));
      g.fillStyle(0x0b121b, 1).fillCircle(0, -6, 44);
      g.lineStyle(3, 0x2a3644, 1).strokeCircle(0, -6, 44);
      for (let i = 0; i < 8; i++) {
        const a = spin + (i * Math.PI) / 4;
        g.lineStyle(4, i % 2 ? palette.magenta : 0xffd21f, 0.9).beginPath().arc(0, -6, 36, a, a + 0.42).strokePath();
      }
      for (let i = 0; i < 6; i++) {
        const a = -spin * 1.6 + (i * Math.PI) / 3;
        g.lineStyle(3, palette.cyan, 0.8).beginPath().arc(0, -6, 24, a, a + 0.5).strokePath();
      }
      core.setPosition(0, -6).setScale(0.55 + 0.35 * u + 0.05 * Math.sin(t * 20)).setAlpha(0.5 + 0.5 * u);
      // Ducks hop along to the reactor and drop in.
      ducks.forEach((d, i) => {
        const k = Phaser.Math.Clamp(u * 1.6 - i * 0.12, 0, 1);
        const x = -150 + k * 150;
        const hop = Math.abs(Math.sin(k * Math.PI * 3)) * 10;
        d.setPosition(x, -6 - hop).setVisible(k < 1).setScale((0.3 / DUCK_RES) * (k > 0.85 ? (1 - k) / 0.15 : 1));
      });
      // The skin pops out once the ducks are in.
      const p = Phaser.Math.Clamp((u - 0.62) / 0.12, 0, 1);
      if (skin.getData('cycle') !== cycle) {
        skin.setData('cycle', cycle).setTexture(skinTexture(shown[cycle % shown.length].id));
        label.setText(RARITIES[rarity].label).setColor(RARITIES[rarity].css);
        halo.setTint(rc);
      }
      const pop = p < 1 ? Phaser.Math.Easing.Back.Out(p) : 1;
      skin.setScale((60 / skin.width) * pop).setAlpha(p > 0 ? 1 : 0).setY(-6 + Math.sin(t * 3) * 3);
      halo.setScale(1.1 * pop + 0.08 * Math.sin(t * 5)).setAlpha(0.55 * pop);
      label.setAlpha(p);
    },
  };
}
