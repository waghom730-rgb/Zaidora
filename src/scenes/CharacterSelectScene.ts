import Phaser from 'phaser';
import { Arena } from '../arena/Arena';
import { DEPTH, GAME_HEIGHT, GAME_WIDTH, GROUND_Y, type Difficulty } from '../config';
import { Effects } from '../effects/Effects';
import type { Fighter } from '../entities/Fighter';
import { LADDER, type Mode } from '../../shared/progression.js';
import { FIGHTERS, FIGHTER_IDS, withOutfit, type FighterId } from '../entities/fighterDefs';
import { profile } from '../services/profile';
import { INTRO_CUE, clipLength, getAnimSet } from '../render/animations';
import type { FighterRig } from '../render/FighterRig';
import { audio } from '../systems/AudioManager';
import { onKeyPress } from '../systems/InputManager';
import { textStyle } from '../ui/textStyles';
import { Showcase } from './showcase';

const SLOT_X = [400, GAME_WIDTH - 400];
const SCALE = 1.55;

interface Slot {
  id: FighterId;
  fighter: Fighter;
  rig: FighterRig;
  texts: Phaser.GameObjects.Text[];
}

export class CharacterSelectScene extends Phaser.Scene {
  private difficulty: Difficulty = 'normal';
  private selected = 0;
  private slots: Slot[] = [];
  private showcase!: Showcase;
  private spotlight!: Phaser.GameObjects.Graphics;
  private fx!: Effects;
  private introTimer = 0;
  private confirmed = false;
  private elapsed = 0;
  private mode: Mode = 'versus';

  private subtitle(): string {
    if (this.mode !== 'ladder') return `CPU takes the other fighter  ·  ${this.difficulty.toUpperCase()}`;
    const st = profile.save.ladder.stage;
    return `ARCADE LADDER  ·  STAGE ${st + 1}/${LADDER.length}: ${LADDER[st].name.toUpperCase()}  ·  ${LADDER[st].difficulty.toUpperCase()}`;
  }

  constructor() {
    super('CharacterSelectScene');
  }

  init(data: { difficulty?: Difficulty; player?: FighterId; mode?: Mode }): void {
    this.mode = data.mode ?? 'versus';
    this.difficulty = data.difficulty ?? 'normal';
    this.selected = Math.max(0, FIGHTER_IDS.indexOf(data.player ?? 'kaen'));
    this.confirmed = false;
    this.slots = [];
    this.elapsed = 0;
  }

  create(): void {
    new Arena(this);
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x07040f, 0.55).setOrigin(0).setDepth(DEPTH.dim);
    this.spotlight = this.add.graphics().setDepth(DEPTH.shadow - 0.5);
    this.showcase = new Showcase(this, this.add.graphics().setDepth(DEPTH.shadow));
    this.fx = new Effects(this);

    this.add.text(GAME_WIDTH / 2, 62, 'CHOOSE YOUR FIGHTER', textStyle(54, '#ffffff')).setOrigin(0.5).setDepth(DEPTH.hud);
    this.add
      .text(GAME_WIDTH / 2, 118, this.subtitle(), textStyle(16, '#ffcf9a', { italic: false }))
      .setOrigin(0.5)
      .setDepth(DEPTH.hud);

    FIGHTER_IDS.forEach((id, i) => {
      const def = withOutfit(FIGHTERS[id], profile.outfit(id));
      const { fighter, rig } = this.showcase.add(def, SLOT_X[i], i === 0 ? 1 : -1, SCALE, DEPTH.fighter);
      const x = SLOT_X[i];
      const texts = [
        this.add.text(x, 168, def.name, textStyle(58, def.uiColor)).setOrigin(0.5).setDepth(DEPTH.hud),
        this.add.text(x, 210, def.style.toUpperCase(), textStyle(18, '#ffffff')).setOrigin(0.5).setDepth(DEPTH.hud),
        this.add
          .text(x, 236, `SPECIAL  ·  ${def.specialName.toUpperCase()}  (L)`, textStyle(14, '#ffd23f', { italic: false, strokeRatio: 0.3 }))
          .setOrigin(0.5)
          .setDepth(DEPTH.hud),
        this.add
          .text(x, 254, def.blurb.join('\n'), textStyle(13, '#d9d2ea', { italic: false, strokeRatio: 0.3 }))
          .setOrigin(0.5, 0)
          .setAlign('center')
          .setLineSpacing(4)
          .setDepth(DEPTH.hud),
      ];
      this.slots.push({ id, fighter, rig, texts });
    });

    this.add
      .text(GAME_WIDTH / 2, 700, 'A / D  choose      J / ENTER  confirm      ESC  back', textStyle(16, '#ffffff', { italic: false }))
      .setOrigin(0.5, 1)
      .setAlpha(0.8)
      .setDepth(DEPTH.hud);
    this.add.text(GAME_WIDTH / 2, 470, 'VS', textStyle(64, '#ffd23f')).setOrigin(0.5).setDepth(DEPTH.hud).setAlpha(0.85);

    onKeyPress(this, (e) => this.onKey(e));
    this.highlight(true);
    this.cameras.main.fadeIn(350);
  }

  update(_time: number, delta: number): void {
    this.elapsed += delta;
    const before = this.introTimer;
    this.introTimer += delta;
    // Selected fighter returns to idle once their intro has played.
    const sel = this.slots[this.selected];
    const introMs = (clipLength(getAnimSet(sel.id).intro) + 6) * (1000 / 60);
    if (!this.confirmed && before < introMs && this.introTimer >= introMs && sel.fighter.state === 'intro') {
      sel.fighter.setState('idle');
    }
    this.showcase.update(delta);

    const g = this.spotlight;
    g.clear();
    const x = SLOT_X[this.selected];
    const pulse = 0.5 + Math.sin(this.elapsed / 260) * 0.15;
    const color = this.selected === 0 ? 0xff7a2a : 0x8a5cff;
    // Soft spotlight cone + glowing floor disc.
    for (const [top, bottom, a] of [
      [70, 190, 0.05],
      [45, 140, 0.06],
      [25, 95, 0.07],
    ] as const) {
      g.fillStyle(color, a);
      g.fillPoints(
        [
          { x: x - top, y: 140 },
          { x: x + top, y: 140 },
          { x: x + bottom, y: GROUND_Y + 10 },
          { x: x - bottom, y: GROUND_Y + 10 },
        ],
        true,
      );
    }
    g.fillStyle(color, 0.22 * pulse + 0.08);
    g.fillEllipse(x, GROUND_Y + 4, 320, 64);
  }

  private highlight(first = false): void {
    this.slots.forEach((s, i) => {
      const on = i === this.selected;
      s.rig.setDimmed(!on);
      s.texts.forEach((t) => t.setAlpha(on ? 1 : 0.4));
      if (on) {
        s.fighter.setState('intro');
        this.introTimer = 0;
        if (!first) {
          const def = FIGHTERS[s.id];
          this.time.delayedCall((INTRO_CUE[s.id] * 1000) / 60, () => {
            if (this.slots[this.selected] === s && !this.confirmed) this.fx.aura(s.fighter.x, GROUND_Y, def.fx, 20);
          });
        }
      } else {
        s.fighter.setState('idle');
      }
    });
  }

  private onKey(e: KeyboardEvent): void {
    audio.unlock();
    if (this.confirmed) return;
    switch (e.code) {
      case 'KeyA':
      case 'ArrowLeft':
      case 'KeyD':
      case 'ArrowRight':
        this.selected = 1 - this.selected;
        audio.play('select');
        this.highlight();
        break;
      case 'Enter':
      case 'Space':
      case 'KeyJ':
        this.confirm();
        break;
      case 'Escape':
        this.confirmed = true;
        this.cameras.main.fadeOut(250, 0, 0, 0);
        this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('MenuScene'));
        break;
    }
  }

  private confirm(): void {
    this.confirmed = true;
    const s = this.slots[this.selected];
    const def = FIGHTERS[s.id];
    s.fighter.celebrate();
    audio.play('confirm');
    audio.play('powerup');
    this.time.delayedCall(260, () => this.fx.aura(s.fighter.x, GROUND_Y, def.fx, 34));
    this.cameras.main.flash(200, 255, 255, 255);
    this.time.delayedCall(1300, () => {
      this.cameras.main.fadeOut(350, 0, 0, 0);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
        this.scene.start('FightScene', { difficulty: this.difficulty, player: s.id, mode: this.mode });
      });
    });
  }
}
