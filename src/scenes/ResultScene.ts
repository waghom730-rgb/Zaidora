import Phaser from 'phaser';
import { Arena } from '../arena/Arena';
import { DEPTH, GAME_HEIGHT, GAME_WIDTH, GROUND_Y, type Difficulty } from '../config';
import { Effects } from '../effects/Effects';
import { FIGHTERS, opponentOf, type FighterId } from '../entities/fighterDefs';
import { audio } from '../systems/AudioManager';
import { textStyle } from '../ui/textStyles';
import { Showcase } from './showcase';

export interface ResultData {
  outcome: 'win' | 'lose' | 'draw';
  difficulty: Difficulty;
  player: FighterId;
  wins: [number, number];
  maxCombo: number;
  damageDealt: number;
}

const CX = GAME_WIDTH / 2;

export class ResultScene extends Phaser.Scene {
  private result!: ResultData;
  private showcase!: Showcase;
  private leaving = false;

  constructor() {
    super('ResultScene');
  }

  init(data: ResultData): void {
    this.result = data;
    this.leaving = false;
  }

  create(): void {
    const r = this.result;
    const playerDef = FIGHTERS[r.player];
    const cpuDef = FIGHTERS[opponentOf(r.player)];
    new Arena(this);
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x07040f, 0.55).setOrigin(0).setDepth(DEPTH.dim);
    this.showcase = new Showcase(this, this.add.graphics().setDepth(DEPTH.shadow));
    const fx = new Effects(this);

    const you = this.showcase.add(playerDef, 330, 1, 1.25, DEPTH.fighter).fighter;
    const cpu = this.showcase.add(cpuDef, GAME_WIDTH - 330, -1, 1.25, DEPTH.fighter).fighter;
    const winner = r.outcome === 'win' ? you : r.outcome === 'lose' ? cpu : null;
    if (winner) {
      winner.celebrate();
      (winner === you ? cpu : you).setState('ko');
      this.time.delayedCall(300, () => fx.aura(winner.x, GROUND_Y, winner.def.fx, 30));
    }

    const title = { win: 'VICTORY', lose: 'DEFEAT', draw: 'DRAW' }[r.outcome];
    const color = { win: '#ffd23f', lose: '#ff4d6d', draw: '#ffffff' }[r.outcome];
    const sub = winner ? `${winner.def.name} WINS THE MATCH` : 'NO WINNER THIS TIME';

    const titleText = this.add.text(CX, 150, title, textStyle(120, color)).setOrigin(0.5).setDepth(DEPTH.hud);
    titleText.setScale(2).setAlpha(0);
    this.tweens.add({ targets: titleText, scale: 1, alpha: 1, duration: 350, ease: 'Back.easeOut' });

    this.add.text(CX, 245, sub, textStyle(28, winner?.def.uiColor ?? '#ffffff')).setOrigin(0.5).setDepth(DEPTH.hud);
    this.add
      .text(
        CX,
        300,
        `Rounds ${r.wins[0]} – ${r.wins[1]}     Max combo ${r.maxCombo}     Damage dealt ${r.damageDealt}     CPU ${r.difficulty.toUpperCase()}`,
        textStyle(18, '#ffcf9a', { italic: false }),
      )
      .setOrigin(0.5)
      .setDepth(DEPTH.hud);

    const prompt = this.add
      .text(CX, 380, 'ENTER  Rematch     C  Change fighter     ESC  Main menu', textStyle(22, '#ffffff', { italic: false }))
      .setOrigin(0.5)
      .setDepth(DEPTH.hud);
    this.tweens.add({ targets: prompt, alpha: 0.4, duration: 600, yoyo: true, repeat: -1 });

    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => {
      audio.unlock();
      if (this.leaving) return;
      if (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyJ') this.leave('FightScene');
      else if (e.code === 'KeyC') this.leave('CharacterSelectScene');
      else if (e.code === 'Escape') this.leave('MenuScene');
    });

    this.cameras.main.fadeIn(400);
  }

  update(_time: number, delta: number): void {
    this.showcase.update(delta);
  }

  private leave(scene: 'FightScene' | 'CharacterSelectScene' | 'MenuScene'): void {
    this.leaving = true;
    audio.play('confirm');
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start(scene, { difficulty: this.result.difficulty, player: this.result.player });
    });
  }
}
