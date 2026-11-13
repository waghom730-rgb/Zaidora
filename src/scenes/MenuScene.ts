import Phaser from 'phaser';
import { Arena } from '../arena/Arena';
import {
  DEPTH,
  DIFFICULTIES,
  GAME_HEIGHT,
  GAME_WIDTH,
  loadDifficulty,
  saveDifficulty,
  type Difficulty,
} from '../config';
import { KAEN, YORU } from '../entities/fighterDefs';
import { audio } from '../systems/AudioManager';
import { onKeyPress } from '../systems/InputManager';
import { textStyle } from '../ui/textStyles';
import { Showcase } from './showcase';

const CX = GAME_WIDTH / 2;

export class MenuScene extends Phaser.Scene {
  private selected = 0;
  private difficulty: Difficulty = 'normal';
  private items: Phaser.GameObjects.Text[] = [];
  private cursor!: Phaser.GameObjects.Text;
  private showcase!: Showcase;
  private starting = false;

  constructor() {
    super('MenuScene');
  }

  create(): void {
    this.selected = 0;
    this.starting = false;
    this.items = [];
    this.difficulty = loadDifficulty();

    new Arena(this);
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x07040f, 0.45).setOrigin(0).setDepth(DEPTH.dim);
    this.showcase = new Showcase(this, this.add.graphics().setDepth(DEPTH.shadow));
    this.showcase.add(KAEN, 235, 1, 1.25, DEPTH.fighter);
    this.showcase.add(YORU, GAME_WIDTH - 235, -1, 1.25, DEPTH.fighter);

    this.add.text(235, 676, `${KAEN.name} · ${KAEN.style}`, textStyle(16, KAEN.uiColor)).setOrigin(0.5).setDepth(DEPTH.hud);
    this.add
      .text(GAME_WIDTH - 235, 676, `${YORU.name} · ${YORU.style}`, textStyle(16, YORU.uiColor))
      .setOrigin(0.5)
      .setDepth(DEPTH.hud);

    // Title.
    const logo = this.add.text(CX, 132, 'ZAIKORA', textStyle(132, '#ffd23f')).setOrigin(0.5).setDepth(DEPTH.hud);
    const grad = logo.context.createLinearGradient(0, 0, 0, logo.height);
    grad.addColorStop(0.15, '#fff3b0');
    grad.addColorStop(0.55, '#ffb02e');
    grad.addColorStop(0.95, '#ff5a1f');
    logo.setFill(grad);
    this.add
      .text(CX, 222, 'ANIME MARTIAL ARTS', textStyle(24, '#ffffff', { strokeRatio: 0.25 }))
      .setOrigin(0.5)
      .setDepth(DEPTH.hud);

    // Menu.
    this.items = [
      this.add.text(CX, 330, 'FIGHT VS CPU', textStyle(34)).setOrigin(0.5).setDepth(DEPTH.hud),
      this.add.text(CX, 390, '', textStyle(26)).setOrigin(0.5).setDepth(DEPTH.hud),
    ];
    this.cursor = this.add.text(0, 0, '▶', textStyle(26, '#ffd23f')).setOrigin(0.5).setDepth(DEPTH.hud);
    this.tweens.add({ targets: this.cursor, alpha: 0.35, duration: 450, yoyo: true, repeat: -1 });
    this.refreshMenu();

    // Controls card.
    const card = this.add.graphics().setDepth(DEPTH.hud - 1);
    card.fillStyle(0x0c0a12, 0.7);
    card.fillRoundedRect(CX - 250, 440, 500, 172, 14);
    card.lineStyle(2, 0xffd23f, 0.5);
    card.strokeRoundedRect(CX - 250, 440, 500, 172, 14);
    const rows: Array<[string, string]> = [
      ['A / D', 'Move'],
      ['W', 'Jump'],
      ['J', 'Punch'],
      ['K', 'Kick'],
      ['U', 'Heavy'],
      ['L', 'Special'],
      ['S', 'Block / parry'],
      ['SPACE', 'Dash / evade'],
      ['ESC', 'Pause'],
      ['M', 'Mute'],
    ];
    rows.forEach(([key, action], i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = CX - 200 + col * 230;
      const y = 452 + row * 31;
      this.add.text(x, y, key, textStyle(18, '#ffd23f', { italic: false })).setDepth(DEPTH.hud);
      this.add.text(x + 90, y, action, textStyle(18, '#ffffff', { italic: false })).setDepth(DEPTH.hud);
    });
    this.add
      .text(CX, 632, 'Combos: J, J, K  ·  J, J, U  ·  K, U  ·  end with L   |   Tap S as a hit lands to parry', textStyle(14, '#ffcf9a', { italic: false }))
      .setOrigin(0.5)
      .setDepth(DEPTH.hud);

    onKeyPress(this, (e) => this.onKey(e));
    this.cameras.main.fadeIn(400);
  }

  update(_time: number, delta: number): void {
    this.showcase.update(delta);
  }

  private refreshMenu(): void {
    this.items[1].setText(`DIFFICULTY   <  ${this.difficulty.toUpperCase()}  >`);
    this.items.forEach((t, i) => {
      t.setColor(i === this.selected ? '#ffd23f' : '#ffffff');
      t.setScale(i === this.selected ? 1.08 : 1);
    });
    const sel = this.items[this.selected];
    this.cursor.setPosition(sel.x - sel.displayWidth / 2 - 24, sel.y);
  }

  private onKey(e: KeyboardEvent): void {
    audio.unlock();
    if (this.starting) return;
    switch (e.code) {
      case 'KeyW':
      case 'ArrowUp':
        this.selected = (this.selected + this.items.length - 1) % this.items.length;
        audio.play('select');
        break;
      case 'KeyS':
      case 'ArrowDown':
        this.selected = (this.selected + 1) % this.items.length;
        audio.play('select');
        break;
      case 'KeyA':
      case 'ArrowLeft':
        if (this.selected === 1) this.cycleDifficulty(-1);
        break;
      case 'KeyD':
      case 'ArrowRight':
        if (this.selected === 1) this.cycleDifficulty(1);
        break;
      case 'Enter':
      case 'Space':
      case 'KeyJ':
        if (this.selected === 0) this.start();
        else this.cycleDifficulty(1);
        break;
      default:
        return;
    }
    this.refreshMenu();
  }

  private cycleDifficulty(step: number): void {
    const i = DIFFICULTIES.indexOf(this.difficulty);
    this.difficulty = DIFFICULTIES[(i + step + DIFFICULTIES.length) % DIFFICULTIES.length];
    saveDifficulty(this.difficulty);
    audio.play('select');
  }

  private start(): void {
    this.starting = true;
    audio.play('confirm');
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start('CharacterSelectScene', { difficulty: this.difficulty });
    });
  }
}
