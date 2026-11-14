import Phaser from 'phaser';
import { ITEMS, LADDER, type MatchReport, type Mode, type Rewards } from '../../shared/progression.js';
import { Arena } from '../arena/Arena';
import { DEPTH, GAME_HEIGHT, GAME_WIDTH, GROUND_Y, type Difficulty } from '../config';
import { Effects } from '../effects/Effects';
import { FIGHTERS, opponentOf, withOutfit, type FighterId } from '../entities/fighterDefs';
import { profile } from '../services/profile';
import { audio } from '../systems/AudioManager';
import { onKeyPress } from '../systems/InputManager';
import { textStyle } from '../ui/textStyles';
import { Showcase } from './showcase';

export interface ResultData {
  outcome: 'win' | 'lose' | 'draw';
  mode: Mode;
  difficulty: Difficulty;
  player: FighterId;
  wins: [number, number];
  maxCombo: number;
  damageDealt: number;
  report: MatchReport;
}

const CX = GAME_WIDTH / 2;

export class ResultScene extends Phaser.Scene {
  private result!: ResultData;
  private showcase!: Showcase;
  private leaving = false;
  private saved = false;
  private rewardText!: Phaser.GameObjects.Text;
  private prompt!: Phaser.GameObjects.Text;
  private ladderLine!: Phaser.GameObjects.Text;

  constructor() {
    super('ResultScene');
  }

  init(data: ResultData): void {
    this.result = data;
    this.leaving = false;
    this.saved = false;
  }

  create(): void {
    const r = this.result;
    const playerDef = withOutfit(FIGHTERS[r.player], profile.outfit(r.player));
    const cpuDef = FIGHTERS[opponentOf(r.player)];
    new Arena(this);
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x07040f, 0.6).setOrigin(0).setDepth(DEPTH.dim);
    this.showcase = new Showcase(this, this.add.graphics().setDepth(DEPTH.shadow));
    const fx = new Effects(this);

    const you = this.showcase.add(playerDef, 250, 1, 1.2, DEPTH.fighter).fighter;
    const cpu = this.showcase.add(cpuDef, GAME_WIDTH - 250, -1, 1.2, DEPTH.fighter).fighter;
    const winner = r.outcome === 'win' ? you : r.outcome === 'lose' ? cpu : null;
    if (winner) {
      winner.celebrate();
      (winner === you ? cpu : you).setState('ko');
      this.time.delayedCall(300, () => fx.aura(winner.x, GROUND_Y, winner.def.fx, 30));
    }

    const title = { win: 'VICTORY', lose: 'DEFEAT', draw: 'DRAW' }[r.outcome];
    const color = { win: '#ffd23f', lose: '#ff4d6d', draw: '#ffffff' }[r.outcome];
    const titleText = this.add.text(CX, 110, title, textStyle(110, color)).setOrigin(0.5).setDepth(DEPTH.hud);
    titleText.setScale(2).setAlpha(0);
    this.tweens.add({ targets: titleText, scale: 1, alpha: 1, duration: 350, ease: 'Back.easeOut' });

    const sub =
      r.mode === 'ladder'
        ? `ARCADE LADDER · STAGE ${(r.report.stage ?? 0) + 1} · ${LADDER[r.report.stage ?? 0].name.toUpperCase()}`
        : winner
          ? `${winner.def.name} WINS THE MATCH`
          : 'NO WINNER THIS TIME';
    this.add.text(CX, 190, sub, textStyle(24, winner?.def.uiColor ?? '#ffffff')).setOrigin(0.5).setDepth(DEPTH.hud);
    this.add
      .text(
        CX,
        228,
        `Rounds ${r.wins[0]} – ${r.wins[1]}    Max combo ${r.maxCombo}    Damage ${r.damageDealt}    CPU ${r.difficulty.toUpperCase()}`,
        textStyle(16, '#ffcf9a', { italic: false }),
      )
      .setOrigin(0.5)
      .setDepth(DEPTH.hud);

    this.ladderLine = this.add.text(CX, 270, '', textStyle(22, '#7dffb0')).setOrigin(0.5).setDepth(DEPTH.hud);
    this.rewardText = this.add
      .text(CX, 300, 'Saving…', textStyle(19, '#ffffff', { italic: false, strokeRatio: 0.25 }))
      .setOrigin(0.5, 0)
      .setAlign('center')
      .setLineSpacing(6)
      .setDepth(DEPTH.hud);
    this.prompt = this.add.text(CX, 470, '', textStyle(19, '#ffffff', { italic: false })).setOrigin(0.5).setDepth(DEPTH.hud);

    onKeyPress(this, (e) => this.onKey(e));
    this.cameras.main.fadeIn(400);
    void this.saveMatch();
  }

  private async saveMatch(): Promise<void> {
    const res = await profile.reportMatch(this.result.report);
    if (!this.scene.isActive()) return;
    this.saved = true;
    const lines: string[] = [];
    if (res.rewards) lines.push(...describeRewards(res.rewards));
    if (!res.ok) lines.push(`⚠ ${res.error}`);
    this.rewardText.setText(lines.join('\n'));
    if (!res.ok) this.rewardText.setColor('#ffb0b0');
    else if (res.rewards.levelUps) audio.play('powerup');

    if (this.result.mode === 'ladder' && res.rewards) {
      const l = res.rewards.ladder;
      const ladder = profile.save.ladder;
      if (l === 'clear') this.ladderLine.setText('ARCADE LADDER CLEARED!').setColor('#ffd23f');
      else if (l === 'advance') this.ladderLine.setText(`NEXT: STAGE ${ladder.stage + 1} · ${LADDER[ladder.stage].name.toUpperCase()}`);
      else this.ladderLine.setText(`BACK TO CHECKPOINT · STAGE ${ladder.checkpoint + 1}`).setColor('#ffb27a');
    }
    this.prompt.setText(this.promptText(res.rewards?.ladder ?? null));
    this.tweens.add({ targets: this.prompt, alpha: 0.45, duration: 600, yoyo: true, repeat: -1 });
  }

  private promptText(ladder: Rewards['ladder']): string {
    if (this.result.mode !== 'ladder') return 'ENTER  Rematch     C  Change fighter     D  Dojo     ESC  Menu';
    const next = ladder === 'advance' ? 'Next stage' : ladder === 'clear' ? 'New ladder run' : 'Retry';
    return `ENTER  ${next}     C  Change fighter     D  Dojo     ESC  Menu`;
  }

  update(_time: number, delta: number): void {
    this.showcase.update(delta);
  }

  private onKey(e: KeyboardEvent): void {
    audio.unlock();
    if (this.leaving || !this.saved) return;
    const { difficulty, player, mode } = this.result;
    // A versus rematch goes straight back in; every ladder fight is a new stage, so it gets its VS screen.
    if (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyJ') this.leave(mode === 'ladder' ? 'VersusScene' : 'FightScene', { difficulty, player, mode });
    else if (e.code === 'KeyC') this.leave('CharacterSelectScene', { difficulty, player, mode });
    else if (e.code === 'KeyD') this.leave('DojoScene', { back: 'MenuScene' });
    else if (e.code === 'Escape') this.leave('MenuScene', {}, 'back');
  }

  private leave(scene: string, data: object, sound: 'confirm' | 'back' = 'confirm'): void {
    this.leaving = true;
    audio.play(sound);
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start(scene, data));
  }
}

function describeRewards(r: Rewards): string[] {
  const lines = [`+${r.coins} coins${r.charm ? ' (Lucky Charm ×1.5)' : ''}    +${r.xp} XP`];
  if (r.levelUps) lines.push(`LEVEL UP! → Level ${profile.save.level}  (+${r.skillPoints} skill point${r.skillPoints > 1 ? 's' : ''})`);
  if (r.checkpoint !== null) lines.push(`Checkpoint saved: stage ${r.checkpoint + 1}`);
  for (const it of r.items) lines.push(`Got ${it.qty} × ${ITEMS[it.id].name}`);
  if (r.outfit) lines.push(`New outfit unlocked: ${ITEMS[r.outfit].name}!`);
  return lines;
}
