import Phaser from 'phaser';
import { DEPTH, GAME_WIDTH, ROUNDS_TO_WIN, type Difficulty } from '../config';
import type { FighterDef } from '../entities/fighterDefs';
import { ART_RES, headKey, type Expression } from '../render/CharacterArt';
import { EnergyBar } from './EnergyBar';
import { HealthBar } from './HealthBar';
import { textStyle } from './textStyles';

/** Portrait frame (square) in each top corner; the health bar starts just inside it. */
const PORTRAIT = 84;
const PORTRAIT_X = 16;
const PORTRAIT_Y = 14;
/** Left edge of the left-side HUD column (health bar, name, energy) — right side mirrors it. */
const COL_X = PORTRAIT_X + PORTRAIT + 10;
const BAR_W = 418;
const BAR_H = 28;
const BAR_Y = 34;
const CX = GAME_WIDTH / 2;

/** Per-channel scale of a 0xRRGGBB colour (k < 1 darkens). */
const shade = (c: number, k: number): number => {
  const ch = (s: number) => Math.min(255, Math.round(((c >> s) & 255) * k));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};

/**
 * A fighter's face in a HUD frame, using the head art painted at boot. It reacts to the fight:
 * flinches (hurt face, red flash, shake) when hit, keeps the hurt face at low health, shouts on
 * specials and round wins, and greys out when the round is lost.
 */
export class Portrait {
  expression: Expression = 'normal';
  defeated = false;
  private flinch = 0;
  private shout = 0;
  private low = false;
  private readonly parts: Array<Phaser.GameObjects.Graphics | Phaser.GameObjects.Image>;
  private readonly face: Phaser.GameObjects.Image;
  private readonly art: string;
  private readonly x0: number;

  constructor(scene: Phaser.Scene, layer: Phaser.GameObjects.Layer, def: FighterDef, side: 'left' | 'right') {
    this.art = def.artKey ?? def.id;
    const x0 = side === 'left' ? PORTRAIT_X : GAME_WIDTH - PORTRAIT_X - PORTRAIT;
    this.x0 = x0;
    const y0 = PORTRAIT_Y;
    const P = PORTRAIT;
    const accent = parseInt(def.uiColor.slice(1), 16);

    const back = scene.add.graphics();
    back.fillStyle(0x0c0a12, 0.92);
    back.fillRect(x0 - 4, y0 - 4, P + 8, P + 8);
    back.fillStyle(shade(def.ghostColor, 0.32), 1);
    back.fillRect(x0, y0, P, P);
    back.fillStyle(def.ghostColor, 0.35);
    back.fillTriangle(x0, y0 + P, x0 + P, y0 + P, side === 'left' ? x0 + P : x0, y0 + P * 0.35);

    // Head art is drawn at ART_RES; show it a little larger than life and crop it to the frame.
    const zoom = 1.18;
    const face = scene.add.image(x0 + P / 2, y0 + P / 2 + 10, headKey(this.art, 'normal'));
    face.setScale(zoom / ART_RES).setFlipX(side === 'right');
    this.face = face;
    this.crop();

    const rim = scene.add.graphics();
    rim.lineStyle(3, accent, 0.9);
    rim.strokeRect(x0 + 1.5, y0 + 1.5, P - 3, P - 3);
    rim.lineStyle(2, 0xffffff, 0.85);
    rim.strokeRect(x0 - 1, y0 - 1, P + 2, P + 2);

    this.parts = [back, face, rim];
    for (const o of this.parts) {
      o.setDepth(DEPTH.hud);
      layer.add(o);
    }
  }

  /** Clip the head texture to the frame window (texture pixels; symmetric, so flipping is safe). */
  private crop(): void {
    const f = this.face;
    const s = f.scaleX;
    const w = f.frame.width;
    const h = f.frame.height;
    // Measured from the resting position (the frame may be mid-shake).
    const left = this.x0 + PORTRAIT / 2 - (w * s) / 2;
    const top = f.y - (h * s) / 2;
    const x = Math.max(0, (this.x0 - left) / s);
    const y = Math.max(0, (PORTRAIT_Y - top) / s);
    f.setCrop(x, y, Math.min(w - 2 * x, PORTRAIT / s), Math.min(h - y, PORTRAIT / s));
  }

  hit(): void {
    if (this.defeated) return;
    this.flinch = 420;
  }

  special(): void {
    if (this.defeated) return;
    this.shout = 800;
  }

  setLow(low: boolean): void {
    this.low = low;
  }

  defeat(): void {
    this.defeated = true;
    this.flinch = 0;
    this.shout = 0;
  }

  reset(): void {
    this.defeated = false;
    this.flinch = 0;
    this.shout = 0;
    this.low = false;
  }

  update(dt: number): void {
    this.flinch = Math.max(0, this.flinch - dt);
    this.shout = Math.max(0, this.shout - dt);
    const e: Expression = this.defeated || this.flinch > 0 ? 'hurt' : this.shout > 0 ? 'shout' : this.low ? 'hurt' : 'normal';
    if (e !== this.expression) {
      this.expression = e;
      this.face.setTexture(headKey(this.art, e));
      this.crop();
    }
    if (this.defeated) this.face.setTint(0x6c6680);
    else if (this.flinch > 300) this.face.setTint(0xff7a6a);
    else this.face.clearTint();
    // Shake the whole frame while flinching.
    const dx = this.flinch > 200 ? (Math.random() - 0.5) * 6 : 0;
    for (const o of this.parts) o.x = dx;
    this.face.x = this.x0 + PORTRAIT / 2 + dx;
  }
}

/** Everything drawn over the fight: health, timer, round wins, combo counters, announcer. */
export class HUD {
  private readonly bars: [HealthBar, HealthBar];
  private readonly energyBars: [EnergyBar, EnergyBar];
  readonly portraits: [Portrait, Portrait];
  private readonly healthShown: [number, number] = [1, 1];
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
      new EnergyBar(scene, layer, COL_X + 4, 128, ENERGY_W, 10, 'left', `${p1.specialName.toUpperCase()} READY  ·  L`, p1.trailColor),
      new EnergyBar(scene, layer, GAME_WIDTH - COL_X - 4 - ENERGY_W, 128, ENERGY_W, 10, 'right', `${p2.specialName.toUpperCase()} READY`, p2.trailColor),
    ];
    this.bars = [
      new HealthBar(scene, COL_X, BAR_Y, BAR_W, BAR_H, 'left', layer),
      new HealthBar(scene, GAME_WIDTH - COL_X - BAR_W - 14, BAR_Y, BAR_W, BAR_H, 'right', layer),
    ];
    this.portraits = [new Portrait(scene, layer, p1, 'left'), new Portrait(scene, layer, p2, 'right')];

    // Names.
    text(COL_X + 4, 70, p1.name, textStyle(26, p1.uiColor)).setDepth(d);
    text(COL_X + 4, 104, `${p1.style.toUpperCase()} · YOU`, textStyle(12, '#ffffff', { strokeRatio: 0.25 })).setDepth(d);
    text(GAME_WIDTH - COL_X - 4, 70, p2.name, textStyle(26, p2.uiColor)).setOrigin(1, 0).setDepth(d);
    text(
      GAME_WIDTH - COL_X - 4,
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
    // Portraits flinch when health drops (not when it recovers, e.g. Second Wind).
    if (ratio < this.healthShown[index]) this.portraits[index].hit();
    this.healthShown[index] = ratio;
    this.portraits[index].setLow(ratio > 0 && ratio <= 0.25);
  }

  /** Portrait shouts: a special move or a round win. */
  portraitShout(index: 0 | 1): void {
    this.portraits[index].special();
  }

  /** Portrait greys out: this fighter lost the round. */
  portraitDefeat(index: 0 | 1): void {
    this.portraits[index].defeat();
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
    this.portraits.forEach((p) => p.reset());
    this.healthShown[0] = this.healthShown[1] = 1;
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
    this.portraits.forEach((p) => p.update(dt));
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
