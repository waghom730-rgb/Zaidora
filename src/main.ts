import Phaser from 'phaser';
import './styles/main.css';
import { GAME_HEIGHT, GAME_WIDTH } from './config';
import { BootScene } from './scenes/BootScene';
import { CharacterSelectScene } from './scenes/CharacterSelectScene';
import { FightScene } from './scenes/FightScene';
import { MenuScene } from './scenes/MenuScene';
import { ResultScene } from './scenes/ResultScene';

const game = new Phaser.Game({
  type: Phaser.AUTO, // WebGL, with Canvas fallback
  parent: 'game',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#07060c',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  render: {
    antialias: true,
    powerPreference: 'high-performance',
  },
  fps: { target: 60 },
  // Sound is synthesized by our own AudioManager; Phaser's audio system isn't needed yet.
  audio: { noAudio: true },
  scene: [BootScene, MenuScene, CharacterSelectScene, FightScene, ResultScene],
});

if (import.meta.env.DEV) {
  // Handy for poking at state from the browser console during development.
  (window as unknown as { game: Phaser.Game }).game = game;
}
