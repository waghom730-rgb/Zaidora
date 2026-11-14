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
import { audio, sceneMusic } from './systems/AudioManager';
import { saveMuteSetting } from './ui/AudioPanel';

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
  // All sound goes through our own AudioManager; Phaser's audio system isn't used.
  audio: { noAudio: true },
  scene: [BootScene, AccountScene, MenuScene, CharacterSelectScene, VersusScene, FightScene, ResultScene, DojoScene, ProfileScene],
});

// Audio: unlock on the first key/click, M mutes anywhere (saved with the account), quiet when hidden.
audio.install(saveMuteSetting);
// Each scene's music starts when the scene does; its fight sounds stop when it ends.
game.events.once(Phaser.Core.Events.READY, () => {
  for (const scene of game.scene.scenes) {
    scene.events.on(Phaser.Scenes.Events.CREATE, () => {
      const track = sceneMusic(scene.scene.key, scene.sys.settings.data);
      if (track !== undefined) audio.music(track);
    });
    scene.events.on(Phaser.Scenes.Events.SHUTDOWN, () => audio.sceneEnded());
  }
});

if (import.meta.env.DEV) {
  // Handy for poking at state from the browser console during development.
  Object.assign(window, { game, zaikora: { profile, audio } });
}
