import Phaser from 'phaser';
import { createArenaTexture, createFxTextures } from '../arena/Arena';
import { allLooks } from '../entities/fighterDefs';
import { paintCharacter, paintFlameTexture } from '../render/CharacterArt';
import { profile } from '../services/profile';
import { audio } from '../systems/AudioManager';

/** Paints all art in code (no asset downloads yet), restores the last login, then opens the menu. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create(): void {
    createArenaTexture(this);
    createFxTextures(this);
    paintFlameTexture(this);
    for (const def of allLooks()) paintCharacter(this, def);
    void profile.restore().then((r) => {
      if (r.ok) {
        audio.setMuted(profile.save.settings.muted);
        this.scene.start('MenuScene');
      } else {
        this.scene.start('AccountScene', { message: r.error ?? '' });
      }
    });
  }
}
