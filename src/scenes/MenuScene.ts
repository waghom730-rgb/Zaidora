import Phaser from 'phaser';
import { DIFFICULTIES, LADDER, type Difficulty } from '../../shared/progression.js';
import { Arena } from '../arena/Arena';
import { DEPTH, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { KAEN, YORU, withOutfit } from '../entities/fighterDefs';
import { profile } from '../services/profile';
import { audio } from '../systems/AudioManager';
import { onKeyPress } from '../systems/InputManager';
import { textStyle } from '../ui/textStyles';
import { Showcase } from './showcase';

const CX = GAME_WIDTH / 2;

type ItemId = 'ladder' | 'versus' | 'dojo' | 'profile' | 'difficulty' | 'logout';
const ITEMS: ItemId[] = ['ladder', 'versus', 'dojo', 'profile', 'difficulty', 'logout'];

export class MenuScene extends Phaser.Scene {
  private selected = 0;
  private items: Phaser.GameObjects.Text[] = [];
  private cursor!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private showcase!: Showcase;
  private starting = false;

  constructor() {
    super('MenuScene');
  }

  private get difficulty(): Difficulty {
    return profile.save.settings.difficulty;
  }

  create(): void {
    this.selected = 0;
    this.starting = false;
    this.items = [];

    new Arena(this);
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x07040f, 0.5).setOrigin(0).setDepth(DEPTH.dim);
    this.showcase = new Showcase(this, this.add.graphics().setDepth(DEPTH.shadow));
    this.showcase.add(withOutfit(KAEN, profile.outfit('kaen')), 205, 1, 1.2, DEPTH.fighter);
    this.showcase.add(withOutfit(YORU, profile.outfit('yoru')), GAME_WIDTH - 205, -1, 1.2, DEPTH.fighter);

    const logo = this.add.text(CX, 92, 'ZAIKORA', textStyle(110, '#ffd23f')).setOrigin(0.5).setDepth(DEPTH.hud);
    const grad = logo.context.createLinearGradient(0, 0, 0, logo.height);
    grad.addColorStop(0.15, '#fff3b0');
    grad.addColorStop(0.55, '#ffb02e');
    grad.addColorStop(0.95, '#ff5a1f');
    logo.setFill(grad);
    this.add.text(CX, 168, 'ANIME MARTIAL ARTS', textStyle(20, '#ffffff', { strokeRatio: 0.25 })).setOrigin(0.5).setDepth(DEPTH.hud);

    // Account badge.
    const s = profile.save;
    const who = profile.online ? `${profile.username}` : 'Guest (this device only)';
    this.add
      .text(GAME_WIDTH - 24, 20, `${who}   ·   Lv ${s.level}   ·   ${s.coins} coins${s.skillPoints ? `   ·   ${s.skillPoints} skill pt` : ''}`, textStyle(15, '#ffffff', { italic: false, strokeRatio: 0.3 }))
      .setOrigin(1, 0)
      .setDepth(DEPTH.hud);

    this.items = ITEMS.map((_, i) => this.add.text(CX, 238 + i * 46, '', textStyle(28)).setOrigin(0.5).setDepth(DEPTH.hud));
    this.cursor = this.add.text(0, 0, '▶', textStyle(24, '#ffd23f')).setOrigin(0.5).setDepth(DEPTH.hud);
    this.tweens.add({ targets: this.cursor, alpha: 0.35, duration: 450, yoyo: true, repeat: -1 });
    this.hint = this.add.text(CX, 525, '', textStyle(15, '#ffcf9a', { italic: false, strokeRatio: 0.3 })).setOrigin(0.5).setDepth(DEPTH.hud);

    const controls = [
      'A / D move    W jump    J punch    K kick    U heavy    L special',
      'S block (tap as a hit lands = parry)    SPACE dash / evade    ESC pause    M mute',
    ];
    this.add
      .text(CX, 640, controls.join('\n'), textStyle(14, '#ffffff', { italic: false, strokeRatio: 0.3 }))
      .setOrigin(0.5)
      .setAlign('center')
      .setLineSpacing(6)
      .setAlpha(0.85)
      .setDepth(DEPTH.hud);

    this.refreshMenu();
    onKeyPress(this, (e) => this.onKey(e));
    this.cameras.main.fadeIn(400);
  }

  update(_time: number, delta: number): void {
    this.showcase.update(delta);
  }

  private label(id: ItemId): string {
    const L = profile.save.ladder;
    switch (id) {
      case 'ladder':
        return `ARCADE LADDER  ·  STAGE ${L.stage + 1}/${LADDER.length}`;
      case 'versus':
        return 'VERSUS CPU';
      case 'dojo':
        return 'DOJO';
      case 'profile':
        return 'PROFILE';
      case 'difficulty':
        return `DIFFICULTY   <  ${this.difficulty.toUpperCase()}  >`;
      case 'logout':
        return profile.online ? 'LOG OUT' : 'SIGN IN / SWITCH';
    }
  }

  private hintFor(id: ItemId): string {
    const L = profile.save.ladder;
    switch (id) {
      case 'ladder':
        return `10 fights, harder each stage. Lose and you restart from your checkpoint (stage ${L.checkpoint + 1}).${L.clears ? `  Cleared ${L.clears}×.` : ''}`;
      case 'versus':
        return 'Free fight against the CPU at the chosen difficulty — earns coins and XP.';
      case 'dojo':
        return 'Spend coins on upgrades and items, skill points on skills, and change outfits.';
      case 'profile':
        return 'Your level, records and fighting habits.';
      case 'difficulty':
        return 'CPU strength for Versus matches (the ladder sets its own).';
      case 'logout':
        return profile.online ? `Signed in as ${profile.username} — progress is saved online.` : 'Create an account to keep progress on any device.';
    }
  }

  private refreshMenu(): void {
    this.items.forEach((t, i) => {
      t.setText(this.label(ITEMS[i]));
      t.setColor(i === this.selected ? '#ffd23f' : '#ffffff');
      t.setScale(i === this.selected ? 1.06 : 1);
    });
    const sel = this.items[this.selected];
    this.cursor.setPosition(sel.x - sel.displayWidth / 2 - 24, sel.y);
    this.hint.setText(this.hintFor(ITEMS[this.selected]));
  }

  private onKey(e: KeyboardEvent): void {
    audio.unlock();
    if (this.starting) return;
    const id = ITEMS[this.selected];
    switch (e.code) {
      case 'KeyW':
      case 'ArrowUp':
        this.selected = (this.selected + ITEMS.length - 1) % ITEMS.length;
        audio.play('select');
        break;
      case 'KeyS':
      case 'ArrowDown':
        this.selected = (this.selected + 1) % ITEMS.length;
        audio.play('select');
        break;
      case 'KeyA':
      case 'ArrowLeft':
        if (id === 'difficulty') this.cycleDifficulty(-1);
        break;
      case 'KeyD':
      case 'ArrowRight':
        if (id === 'difficulty') this.cycleDifficulty(1);
        break;
      case 'Enter':
      case 'Space':
      case 'KeyJ':
        this.activate(id);
        break;
      default:
        return;
    }
    this.refreshMenu();
  }

  private activate(id: ItemId): void {
    switch (id) {
      case 'ladder':
        return this.go('CharacterSelectScene', { mode: 'ladder' });
      case 'versus':
        return this.go('CharacterSelectScene', { mode: 'versus', difficulty: this.difficulty });
      case 'dojo':
        return this.go('DojoScene', { back: 'MenuScene' });
      case 'profile':
        return this.go('ProfileScene', {});
      case 'difficulty':
        return this.cycleDifficulty(1);
      case 'logout':
        this.starting = true;
        void profile.logout().then(() => this.go('AccountScene', {}, true));
    }
  }

  private cycleDifficulty(step: number): void {
    const i = DIFFICULTIES.indexOf(this.difficulty);
    const next = DIFFICULTIES[(i + step + DIFFICULTIES.length) % DIFFICULTIES.length];
    profile.save.settings.difficulty = next; // instant feedback; saved below
    void profile.saveSettings({ difficulty: next });
    audio.play('select');
  }

  private go(scene: string, data: object, force = false): void {
    if (this.starting && !force) return;
    this.starting = true;
    audio.play('confirm');
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start(scene, data));
  }
}
