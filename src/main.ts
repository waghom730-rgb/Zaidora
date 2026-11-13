import Phaser from 'phaser';
import './styles/main.css';
import { GAME_HEIGHT, GAME_WIDTH } from './config';
import { AccountScene } from './scenes/AccountScene';
import { BootScene } from './scenes/BootScene';
import { CharacterSelectScene } from './scenes/CharacterSelectScene';
import { DojoScene } from './scenes/DojoScene';
import { FightScene } from './scenes/FightScene';
import { MenuScene } from './scenes/MenuScene';
import { ProfileScene } from './scenes/ProfileScene';
import { ResultScene } from './scenes/ResultScene';
import { VersusScene } from './scenes/VersusScene';
import { profile } from './services/profile';

const game = new Phaser.Game({
  type: Phaser.AUTO, // WebGL, with Canvas fallback
  parent: 'game',
  // HTML overlay for the login form (Phaser has no text input of its own).
  dom: { createContainer: true },
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
  scene: [BootScene, AccountScene, MenuScene, CharacterSelectScene, VersusScene, FightScene, ResultScene, DojoScene, ProfileScene],
});

if (import.meta.env.DEV) {
  // Handy for poking at state from the browser console during development.
  Object.assign(window, { game, zaikora: { profile } });
}
