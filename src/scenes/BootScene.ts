import Phaser from 'phaser';
import { createArenaTexture, createFxTextures } from '../arena/Arena';
import { FIGHTERS, FIGHTER_IDS } from '../entities/fighterDefs';
import { paintCharacter, paintFlameTexture } from '../render/CharacterArt';

/** Paints all art in code (no asset downloads yet), then opens the menu. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create(): void {
    createArenaTexture(this);
    createFxTextures(this);
    paintFlameTexture(this);
    for (const id of FIGHTER_IDS) paintCharacter(this, FIGHTERS[id]);
    this.scene.start('MenuScene');
  }
}
