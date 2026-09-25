import Phaser from 'phaser';
import { createTextures } from '../fx/textures';

// First scene to run. It prepares shared resources, then starts the scenes
// that make up the game. Scenes are stacked like transparent layers: Game
// (the world and its backdrop) at the bottom and UI (HUD and menus) on top.
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create() {
    createTextures(this);
    this.scene.launch('Game');
    this.scene.launch('UI');
    this.scene.stop();
  }
}
