import { Game } from './Game.js';
import { mountMainMenu, unmountMainMenu } from './ui/MainMenu.js';
import type { CharacterClassId } from '@saab/shared';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const uiOverlay = document.getElementById('ui-overlay')!;

mountMainMenu(uiOverlay, async (name: string, classId: CharacterClassId) => {
  const game = new Game(canvas);
  await game.connect(name, classId);
  unmountMainMenu();
});
