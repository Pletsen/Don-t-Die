import { Game } from './game/Game';

const game = new Game(document.getElementById('app')!, document.getElementById('ui')!);
if (import.meta.env.DEV) (window as unknown as { __game: Game }).__game = game;
