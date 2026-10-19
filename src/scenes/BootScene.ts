import Phaser from 'phaser';
import { createTextures } from '../fx/textures';
import { createSkinTextures } from '../fx/skinTextures';
import { makeGlowFont } from '../ui/glowFont';
import { css } from '../game/palette';

// First scene to run. It prepares shared resources, then starts the scenes
// that make up the game. Scenes are stacked like transparent layers: Game
// (the world and its backdrop) at the bottom and UI (HUD and menus) on top.
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create() {
    createTextures(this);
    createSkinTextures(this);
    // Bitmap fonts for numbers that change all the time (see glowFont.ts).
    makeGlowFont(this, 'hud', { size: 28, weight: '600', color: css.ink, glow: css.cyan });
    makeGlowFont(this, 'hudSmall', { size: 11, family: 'mono', color: css.inkDim });
    makeGlowFont(this, 'big', { size: 84, color: '#ffffff', glow: '#ffffff', glowBlur: 20, chars: ' 0123456789.,+-x%M!' });
    this.scene.launch('Game');
    this.scene.launch('UI');
    this.scene.stop();
  }
}
