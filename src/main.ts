import Phaser from 'phaser';
// Fonts are bundled with the game (no Google Fonts request), so they also
// work offline. Only the Latin subset and the weights we actually use.
import '@fontsource/chakra-petch/latin-500.css';
import '@fontsource/chakra-petch/latin-600.css';
import '@fontsource/chakra-petch/latin-700.css';
import '@fontsource/jetbrains-mono/latin-500.css';
import '@fontsource/jetbrains-mono/latin-700.css';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { UIScene } from './scenes/UIScene';
import { display } from './game/display';

// Phaser has no built-in support for sharp rendering on high-density screens
// (phones, retina laptops). We make the canvas `devicePixelRatio` times larger
// than the window, then shrink it back down with CSS via the scale `zoom`.
// Every scene's camera then zooms by the same ratio, so game code can keep
// thinking in ordinary CSS pixels.
function viewportSize() {
  return { w: window.innerWidth, h: window.innerHeight };
}

async function start() {
  // Wait for the web fonts so Phaser's text is never drawn in a fallback font.
  try {
    await Promise.race([
      Promise.all([
        document.fonts.load('700 32px "Chakra Petch"'),
        document.fonts.load('600 32px "Chakra Petch"'),
        document.fonts.load('500 16px "JetBrains Mono"'),
      ]),
      new Promise((resolve) => setTimeout(resolve, 2500)),
    ]);
  } catch {
    // Offline or blocked: carry on with fallback fonts.
  }

  const { w, h } = viewportSize();
  const dpr = display.dpr;

  const game = new Phaser.Game({
    type: Phaser.WEBGL,
    parent: 'app',
    width: Math.round(w * dpr),
    height: Math.round(h * dpr),
    backgroundColor: '#05070a',
    scale: {
      mode: Phaser.Scale.NONE,
      zoom: 1 / dpr,
    },
    render: {
      antialias: true,
      powerPreference: 'high-performance',
    },
    input: { activePointers: 2 },
    scene: [BootScene, GameScene, UIScene],
  });

  // Handy for debugging in the browser console and for automated tests.
  (window as unknown as { game: Phaser.Game }).game = game;

  window.addEventListener('resize', () => {
    const { w, h } = viewportSize();
    game.scale.resize(Math.round(w * dpr), Math.round(h * dpr));
    game.scale.setZoom(1 / dpr);
  });
}

start();
