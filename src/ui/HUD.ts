import Phaser from 'phaser';
import { DEPTH, GAME_WIDTH, ROUNDS_TO_WIN, type Difficulty } from '../config';
import type { FighterDef } from '../entities/fighterDefs';
import { EnergyBar } from './EnergyBar';
import { HealthBar } from './HealthBar';
import { textStyle } from './textStyles';

const BAR_W = 470;
const BAR_H = 28;
const BAR_Y = 34;
const CX = GAME_WIDTH / 2;

/** Everything drawn over the fight: health, timer, round wins, combo counters, announcer. */
export class HUD {
  private readonly bars: [HealthBar, HealthBar];
  private readonly energyBars: [EnergyBar, EnergyBar];
  private readonly timerText: Phaser.GameObjects.Text;
  private readonly roundText: Phaser.GameObjects.Text;
  private readonly subtitle: Phaser.GameObjects.Text;
  private readonly winMarks: Phaser.GameObjects.Graphics;
  private readonly comboTexts: [Phaser.GameObjects.Text, Phaser.GameObjects.Text];
  private readonly comboTimers: [number, number] = [0, 0];
  /** Small per-side callouts under the combo counter: PARRY!, COUNTER. */
  private readonly callouts: [Phaser.GameObjects.Text, Phaser.GameObjects.Text];
  private readonly banner: Phaser.GameObjects.Text;
  private bannerTween: Phaser.Tweens.Tween | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    layer: Phaser.GameObjects.Layer,
    p1: FighterDef,
    p2: FighterDef,
    difficulty: Difficulty,
  ) {
    const d = DEPTH.hud;
    // Every HUD object goes on the UI layer (drawn by the unzoomed UI camera).
    const add = scene.add;
    const track = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      layer.add(o);
      return o;
    };
    const text = (x: number, y: number, t: string, style: Phaser.Types.GameObjects.Text.TextStyle) =>
      track(add.text(x, y, t, style));
    const graphics = () => track(add.graphics());
    const ENERGY_W = 210;
    this.energyBars = [
      new EnergyBar(scene, layer, 60, 128, ENERGY_W, 10, 'left', `${p1.specialName.toUpperCase()} READY  ·  L`, p1.trailColor),
      new EnergyBar(scene, layer, GAME_WIDTH - 60 - ENERGY_W, 128, ENERGY_W, 10, 'right', `${p2.specialName.toUpperCase()} READY`, p2.trailColor),
    ];
    this.bars = [
      new HealthBar(scene, 56, BAR_Y, BAR_W, BAR_H, 'left', layer),
      new HealthBar(scene, GAME_WIDTH - 56 - BAR_W - 14, BAR_Y, BAR_W, BAR_H, 'right', layer),
    ];

    // Names.
    text(60, 70, p1.name, textStyle(26, p1.uiColor)).setDepth(d);
    text(60, 104, `${p1.style.toUpperCase()} · YOU`, textStyle(12, '#ffffff', { strokeRatio: 0.25 })).setDepth(d);
    text(GAME_WIDTH - 60, 70, p2.name, textStyle(26, p2.uiColor)).setOrigin(1, 0).setDepth(d);
    text(
      GAME_WIDTH - 60,
      104,
      `${p2.style.toUpperCase()} · CPU ${difficulty.toUpperCase()}`,
      textStyle(12, '#ffffff', { strokeRatio: 0.25 }),
    )
      .setOrigin(1, 0)
      .setDepth(d);

    // Timer plate.
    const plate = graphics().setDepth(d);
    const hex = [
      { x: CX - 44, y: 22 },
      { x: CX + 44, y: 22 },
      { x: CX + 56, y: 52 },
      { x: CX + 44, y: 82 },
      { x: CX - 44, y: 82 },
      { x: CX - 56, y: 52 },
    ];
    plate.fillStyle(0x0c0a12, 0.92);
    plate.fillPoints(hex, true);
    plate.lineStyle(2, 0xffd23f, 0.9);
    plate.strokePoints(hex, true, true);
    this.timerText = text(CX, 52, '60', textStyle(40, '#ffffff', { italic: false }))
      .setOrigin(0.5)
      .setDepth(d);
    this.roundText = text(CX, 98, 'ROUND 1', textStyle(14, '#ffd23f', { strokeRatio: 0.25 }))
      .setOrigin(0.5)
      .setDepth(d);
    this.subtitle = text(CX, 118, '', textStyle(12, '#ffffff', { italic: false, strokeRatio: 0.3 }))
      .setOrigin(0.5)
      .setDepth(d);

    this.winMarks = graphics().setDepth(d);
    this.setWins(0, 0);

    this.comboTexts = [
      text(56, 230, '', textStyle(46, '#ffe066')).setOrigin(0, 0.5).setDepth(d).setAlpha(0),
      text(GAME_WIDTH - 56, 230, '', textStyle(46, '#ffe066')).setOrigin(1, 0.5).setDepth(d).setAlpha(0),
    ];
    this.callouts = [
      text(58, 280, '', textStyle(30, '#ffffff')).setOrigin(0, 0.5).setDepth(d).setAlpha(0),
      text(GAME_WIDTH - 58, 280, '', textStyle(30, '#ffffff')).setOrigin(1, 0.5).setDepth(d).setAlpha(0),
    ];

    this.banner = text(CX, 300, '', textStyle(120, '#ffffff'))
      .setOrigin(0.5)
      .setDepth(DEPTH.hud + 1)
      .setAlpha(0);

    text(
      CX,
      706,
      'A / D  move   W  jump   J  punch   K  kick   U  heavy   L  special   S  block (tap = parry)   SPACE  dash / evade   ESC  pause',
      textStyle(13, '#ffffff', { italic: false, strokeRatio: 0.3 }),
    )
      .setOrigin(0.5, 1)
      .setAlpha(0.7)
      .setDepth(d);
  }

  setHealth(index: 0 | 1, ratio: number): void {
    this.bars[index].set(ratio);
  }

  setEnergy(index: 0 | 1, value: number, max: number, cost: number): void {
    this.energyBars[index].set(value, max, cost);
  }

  /** Feedback when a special is attempted without enough energy. */
  denyEnergy(index: 0 | 1): void {
    this.energyBars[index].deny();
  }

  resetHealth(): void {
    this.bars.forEach((b) => b.reset());
  }

  setTime(seconds: number): void {
    this.timerText.setText(String(Math.max(0, seconds)).padStart(2, '0'));
    this.timerText.setColor(seconds <= 10 ? '#ff5a4a' : '#ffffff');
    if (seconds <= 10 && seconds > 0) {
      this.timerText.setScale(1.25);
      this.scene.tweens.add({ targets: this.timerText, scale: 1, duration: 250, ease: 'Quad.easeOut' });
    }
  }

  /** Small line under the round label, e.g. the Arcade Ladder stage. */
  setSubtitle(label: string): void {
    this.subtitle.setText(label);
  }

  setRound(round: number): void {
    this.roundText.setText(`ROUND ${round}`);
  }

  setWins(p1: number, p2: number): void {
    const g = this.winMarks;
    g.clear();
    for (let i = 0; i < ROUNDS_TO_WIN; i++) {
      const marks: Array<[number, boolean]> = [
        [CX - 80 - i * 24, i < p1],
        [CX + 80 + i * 24, i < p2],
      ];
      for (const [x, won] of marks) {
        const pts = [
          { x, y: 72 },
          { x: x + 8, y: 80 },
          { x, y: 88 },
          { x: x - 8, y: 80 },
        ];
        g.fillStyle(won ? 0xffd23f : 0x2a2235, 1);
        g.fillPoints(pts, true);
        g.lineStyle(2, 0xffffff, 0.8);
        g.strokePoints(pts, true, true);
      }
    }
  }

  showCombo(index: 0 | 1, count: number): void {
    const t = this.comboTexts[index];
    this.scene.tweens.killTweensOf(t);
    t.setText(`${count} HITS`).setAlpha(1).setScale(1.5);
    this.scene.tweens.add({ targets: t, scale: 1, duration: 160, ease: 'Back.easeOut' });
    this.comboTimers[index] = 1100;
  }

  /** Short side callout (PARRY!, COUNTER) for player `index`'s side of the screen. */
  callout(index: 0 | 1, label: string, color: string): void {
    const t = this.callouts[index];
    this.scene.tweens.killTweensOf(t);
    t.setText(label).setColor(color).setAlpha(1).setScale(1.6);
    this.scene.tweens.add({ targets: t, scale: 1, duration: 180, ease: 'Back.easeOut' });
    this.scene.tweens.add({ targets: t, alpha: 0, delay: 700, duration: 300 });
  }

  announce(text: string, opts: { color?: string; size?: number; hold?: number } = {}): void {
    const { color = '#ffffff', size = 120, hold = 700 } = opts;
    this.bannerTween?.stop();
    this.banner.setStyle(textStyle(size, color));
    this.banner.setText(text).setAlpha(0).setScale(2.2);
    this.bannerTween = this.scene.tweens.add({
      targets: this.banner,
      scale: 1,
      alpha: 1,
      duration: 200,
      ease: 'Back.easeOut',
      onComplete: () => {
        this.bannerTween = this.scene.tweens.add({
          targets: this.banner,
          alpha: 0,
          scale: 1.08,
          delay: hold,
          duration: 260,
        });
      },
    });
  }

  update(dt: number): void {
    this.bars.forEach((b) => b.update(dt));
    this.energyBars.forEach((b) => b.update(dt));
    for (const i of [0, 1] as const) {
      if (this.comboTimers[i] > 0) {
        this.comboTimers[i] -= dt;
        if (this.comboTimers[i] <= 0) {
          this.scene.tweens.add({ targets: this.comboTexts[i], alpha: 0, duration: 250 });
        }
      }
    }
  }
}
