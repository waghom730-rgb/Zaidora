import Phaser from 'phaser';
import { DEPTH, GAME_HEIGHT, GAME_WIDTH, GROUND_Y } from '../config';
import { Effects } from '../effects/Effects';
import { LADDER } from '../../shared/progression.js';
import { FIGHTERS, opponentOf, withOutfit, type FighterDef } from '../entities/fighterDefs';
import type { Fighter } from '../entities/Fighter';
import { INTRO_CUE, clipLength, getAnimSet } from '../render/animations';
import { profile } from '../services/profile';
import { audio } from '../systems/AudioManager';
import { onKeyPress } from '../systems/InputManager';
import { textStyle } from '../ui/textStyles';
import type { FightData } from './FightScene';
import { Showcase } from './showcase';

/** How long the screen holds before the fight starts on its own. */
const HOLD_MS = 2800;
/** Ignore skip presses this early (the confirm press on the select screen must not skip it). */
const SKIP_AFTER_MS = 450;
const VS_AT_MS = 380;
const CX = GAME_WIDTH / 2;
/** The diagonal split leans this far: top edge at CX + SLANT/2, bottom at CX - SLANT/2. */
const SLANT = 120;
const BAR = 34;
const SLOT_X = [330, GAME_WIDTH - 330];
const SCALE = 1.7;
const STEP = 1000 / 60;

/** Per-channel scale of a 0xRRGGBB colour (k < 1 darkens). */
const shade = (c: number, k: number): number => {
  const ch = (s: number) => Math.min(255, Math.round(((c >> s) & 255) * k));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};

/** x of the dividing line at height y. */
const divideX = (y: number): number => CX + SLANT / 2 - (SLANT * y) / GAME_HEIGHT;

interface Streak {
  x: number;
  y: number;
  len: number;
  speed: number;
}

/**
 * Pre-fight VS screen (character select → here → fight; rematches skip it). Both fighters play
 * their intro on their own colour panel; names, styles and intro lines slide in and the VS slams
 * down. Enter / J / Space skip it, Esc goes back to character select.
 */
export class VersusScene extends Phaser.Scene {
  private fight: FightData = {};
  private elapsed = 0;
  private leaving = false;
  private showcase!: Showcase;
  private fx!: Effects;
  private streaks!: Phaser.GameObjects.Graphics;
  private readonly lanes: [Streak[], Streak[]] = [[], []];
  private defs!: [FighterDef, FighterDef];
  private fighters: Fighter[] = [];
  /** Name labels and how many times the screen has been shown — read by the browser tests. */
  names: string[] = [];
  line = '';
  shown = 0;

  constructor() {
    super('VersusScene');
  }

  init(data: FightData): void {
    this.fight = { ...data };
    this.elapsed = 0;
    this.leaving = false;
    this.fighters = [];
  }

  create(): void {
    const player = this.fight.player ?? 'kaen';
    this.defs = [withOutfit(FIGHTERS[player], profile.outfit(player)), FIGHTERS[opponentOf(player)]];
    this.names = this.defs.map((d) => d.name);
    this.shown++;

    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x07040f).setOrigin(0).setDepth(DEPTH.bg);
    this.defs.forEach((def, i) => this.buildPanel(i as 0 | 1, def));
    this.streaks = this.add.graphics().setDepth(DEPTH.bg + 2);
    for (const side of [0, 1] as const) {
      for (let i = 0; i < 16; i++) this.lanes[side].push(this.newStreak(side, true));
    }

    this.showcase = new Showcase(this, this.add.graphics().setDepth(DEPTH.shadow));
    this.fx = new Effects(this);
    this.defs.forEach((def, i) => {
      const { fighter } = this.showcase.add(def, SLOT_X[i], i === 0 ? 1 : -1, SCALE, DEPTH.fighter);
      fighter.setState('intro');
      this.fighters.push(fighter);
    });

    this.defs.forEach((def, i) => this.buildLabels(i as 0 | 1, def));
    this.buildVs();
    this.buildBars();

    onKeyPress(this, (e) => this.onKey(e));
    this.cameras.main.fadeIn(250);
  }

  update(_time: number, delta: number): void {
    const before = this.elapsed;
    this.elapsed += delta;
    const frame = this.elapsed / STEP;
    const prevFrame = before / STEP;

    this.fighters.forEach((f, i) => {
      const def = this.defs[i];
      const cue = INTRO_CUE[def.id];
      if (prevFrame < cue && frame >= cue) {
        this.fx.aura(f.x, GROUND_Y, def.fx, 24);
        audio.play('powerup');
      }
      // Back to a fighting stance once the intro has played (it would otherwise hold its last pose).
      if (f.state === 'intro' && frame >= clipLength(getAnimSet(def.id).intro) + 6) f.setState('idle');
    });
    this.showcase.update(delta);
    this.drawStreaks(delta);

    if (!this.leaving && this.elapsed >= HOLD_MS) this.leave('FightScene');
  }

  // ------------------------------------------------------------------ layout

  private buildPanel(side: 0 | 1, def: FighterDef): void {
    const color = def.ghostColor;
    const g = this.add.graphics().setDepth(DEPTH.bg + 1);
    const edge = side === 0 ? -1 : 1;
    const outer = side === 0 ? -20 : GAME_WIDTH + 20;
    const poly = (inset: number) => [
      { x: outer, y: 0 },
      { x: divideX(0) + edge * inset, y: 0 },
      { x: divideX(GAME_HEIGHT) + edge * inset, y: GAME_HEIGHT },
      { x: outer, y: GAME_HEIGHT },
    ];
    g.fillStyle(shade(color, 0.2), 1);
    g.fillPoints(poly(4), true);
    // Soft light behind the fighter, then a bright band along the split.
    for (const k of [1, 0.85, 0.7, 0.55]) {
      g.fillStyle(color, 0.05);
      g.fillEllipse(SLOT_X[side], GROUND_Y - 190, 560 * k, 640 * k, 64);
    }
    g.fillStyle(color, 0.24);
    g.fillEllipse(SLOT_X[side], GROUND_Y + 6, 380, 70);
    g.fillStyle(def.trailColor, 0.85);
    g.fillPoints(
      [
        { x: divideX(0) + edge * 4, y: 0 },
        { x: divideX(0) + edge * 12, y: 0 },
        { x: divideX(GAME_HEIGHT) + edge * 12, y: GAME_HEIGHT },
        { x: divideX(GAME_HEIGHT) + edge * 4, y: GAME_HEIGHT },
      ],
      true,
    );
    // Slide in from the side.
    g.x = side === 0 ? -GAME_WIDTH / 2 : GAME_WIDTH / 2;
    this.tweens.add({ targets: g, x: 0, duration: 320, ease: 'Cubic.easeOut' });
  }

  private buildLabels(side: 0 | 1, def: FighterDef): void {
    const left = side === 0;
    const x = left ? 64 : GAME_WIDTH - 64;
    const ox = left ? 0 : 1;
    const tag = left ? 'YOU' : this.cpuTag();
    const items: Array<[Phaser.GameObjects.Text, number]> = [
      [this.add.text(x, 52, def.name, textStyle(84, def.uiColor)).setOrigin(ox, 0), 430],
      [this.add.text(x, 150, `${def.style.toUpperCase()}  ·  ${tag}`, textStyle(20, '#ffffff', { strokeRatio: 0.25 })).setOrigin(ox, 0), 560],
      [this.add.text(x, 186, `“${def.vsLine}”`, textStyle(22, '#f3e9ff', { strokeRatio: 0.25 })).setOrigin(ox, 0), 900],
    ];
    for (const [t, delay] of items) {
      t.setDepth(DEPTH.hud).setAlpha(0);
      const to = t.x;
      t.x += left ? -90 : 90;
      this.tweens.add({ targets: t, x: to, alpha: 1, delay, duration: 260, ease: 'Cubic.easeOut' });
    }
  }

  private buildVs(): void {
    const vs = this.add
      .text(CX, 395, 'VS', textStyle(170, '#ffd23f', { strokeRatio: 0.1 }))
      .setOrigin(0.5)
      .setDepth(DEPTH.hud + 1)
      .setAlpha(0)
      .setScale(3.2);
    this.tweens.add({
      targets: vs,
      scale: 1,
      alpha: 1,
      delay: VS_AT_MS,
      duration: 240,
      ease: 'Back.easeOut',
      onComplete: () => {
        if (this.leaving) return;
        this.cameras.main.shake(180, 0.008);
        this.cameras.main.flash(120, 255, 240, 200);
        audio.play('hitHeavy');
        this.tweens.add({ targets: vs, scale: 1.06, duration: 520, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      },
    });
  }

  private buildBars(): void {
    this.add.rectangle(0, 0, GAME_WIDTH, BAR, 0x000000, 0.85).setOrigin(0).setDepth(DEPTH.hud);
    this.add.rectangle(0, GAME_HEIGHT - BAR, GAME_WIDTH, BAR, 0x000000, 0.85).setOrigin(0).setDepth(DEPTH.hud);
    this.line = this.matchLine();
    this.add
      .text(CX, GAME_HEIGHT - BAR / 2, this.line, textStyle(16, '#ffcf9a', { italic: false, strokeRatio: 0.2 }))
      .setOrigin(0.5)
      .setDepth(DEPTH.hud + 1);
    this.add
      .text(GAME_WIDTH - 24, GAME_HEIGHT - BAR / 2, 'ENTER  fight     ESC  back', textStyle(12, '#ffffff', { italic: false, strokeRatio: 0.2 }))
      .setOrigin(1, 0.5)
      .setAlpha(0.6)
      .setDepth(DEPTH.hud + 1);
  }

  private cpuTag(): string {
    if (this.fight.mode === 'ladder') return LADDER[profile.save.ladder.stage].boss ? 'BOSS' : 'CPU';
    return `CPU ${(this.fight.difficulty ?? 'normal').toUpperCase()}`;
  }

  private matchLine(): string {
    if (this.fight.mode !== 'ladder') return `VERSUS  ·  CPU ${(this.fight.difficulty ?? 'normal').toUpperCase()}  ·  BEST OF 3`;
    const st = profile.save.ladder.stage;
    const s = LADDER[st];
    const where = s.boss ? 'FINAL BOSS' : `STAGE ${st + 1}/${LADDER.length}`;
    return `ARCADE LADDER  ·  ${where}: ${s.name.toUpperCase()}  ·  ${s.difficulty.toUpperCase()}`;
  }

  // ------------------------------------------------------------------ motion

  /** Speed lines rushing toward the split on each panel. */
  private newStreak(side: 0 | 1, anywhere = false): Streak {
    const y = Phaser.Math.Between(BAR + 6, GAME_HEIGHT - BAR - 6);
    const len = Phaser.Math.Between(40, 160);
    const span = side === 0 ? divideX(y) : GAME_WIDTH - divideX(y);
    const start = anywhere ? Math.random() * span : -len;
    return { x: start, y, len, speed: Phaser.Math.FloatBetween(0.5, 1.3) };
  }

  private drawStreaks(delta: number): void {
    const g = this.streaks;
    g.clear();
    for (const side of [0, 1] as const) {
      const color = this.defs[side].trailColor;
      const lane = this.lanes[side];
      for (let i = 0; i < lane.length; i++) {
        const s = lane[i];
        s.x += s.speed * delta;
        const limit = (side === 0 ? divideX(s.y) : GAME_WIDTH - divideX(s.y)) - 16;
        if (s.x > limit) {
          lane[i] = this.newStreak(side);
          continue;
        }
        // x is measured from the panel's outer edge toward the split.
        const head = Math.min(s.x + s.len, limit);
        const a = side === 0 ? s.x : GAME_WIDTH - head;
        const b = side === 0 ? head : GAME_WIDTH - s.x;
        g.fillStyle(color, 0.18);
        g.fillRect(Math.max(0, a), s.y, Math.max(0, b - Math.max(0, a)), 2);
      }
    }
  }

  // ------------------------------------------------------------------ input

  private onKey(e: KeyboardEvent): void {
    audio.unlock();
    if (e.repeat || this.leaving || this.elapsed < SKIP_AFTER_MS) return;
    switch (e.code) {
      case 'Enter':
      case 'Space':
      case 'KeyJ':
        this.leave('FightScene');
        break;
      case 'Escape':
        audio.play('select');
        this.leave('CharacterSelectScene');
        break;
    }
  }

  private leave(scene: 'FightScene' | 'CharacterSelectScene'): void {
    this.leaving = true;
    const cam = this.cameras.main;
    cam.fadeOut(scene === 'FightScene' ? 300 : 220, 0, 0, 0);
    cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start(scene, this.fight));
  }
}
