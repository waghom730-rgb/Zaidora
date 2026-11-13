import Phaser from 'phaser';
import { Arena } from '../arena/Arena';
import { CombatManager, type HitEvent } from '../combat/CombatManager';
import { ENERGY_RULES, EnergyManager } from '../combat/EnergyManager';
import { MOVES } from '../combat/moves';
import type { Projectile } from '../combat/Projectile';
import { EMPTY_INPUT } from '../combat/types';
import {
  DEPTH,
  GAME_HEIGHT,
  GAME_WIDTH,
  GROUND_Y,
  PHYS,
  ROUND_SECONDS,
  ROUNDS_TO_WIN,
  STEP_MS,
  type Difficulty,
} from '../config';
import { Effects } from '../effects/Effects';
import { FireballView } from '../effects/ProjectileView';
import { BASE_MODS, LADDER, ladderCpuMods, type MatchReport, type Mode } from '../../shared/progression.js';
import { Fighter } from '../entities/Fighter';
import { FIGHTERS, opponentOf, withOutfit, type FighterId } from '../entities/fighterDefs';
import { INTRO_CUE } from '../render/animations';
import { FighterRig } from '../render/FighterRig';
import { audio } from '../systems/AudioManager';
import { EnemyAI } from '../systems/EnemyAI';
import { InputManager, onKeyPress } from '../systems/InputManager';
import { profile } from '../services/profile';
import { HUD } from '../ui/HUD';
import { textStyle } from '../ui/textStyles';
import type { ResultData } from './ResultScene';

export interface FightData {
  difficulty?: Difficulty;
  player?: FighterId;
  /** 'ladder' fights the player's current Arcade Ladder stage; 'versus' is free play. */
  mode?: Mode;
}

/** What the player did this match — saved as habits and used for rewards. */
interface Telemetry {
  moves: Record<string, number>;
  specials: number;
  parries: number;
  blocks: number;
  damageDealt: number;
  damageTaken: number;
  maxCombo: number;
  perfectRounds: number;
  fightSteps: number;
}

const newTelemetry = (): Telemetry => ({
  moves: {},
  specials: 0,
  parries: 0,
  blocks: 0,
  damageDealt: 0,
  damageTaken: 0,
  maxCombo: 0,
  perfectRounds: 0,
  fightSteps: 0,
});

type Phase = 'intro' | 'fight' | 'roundEnd' | 'matchOver';

const START_X: [number, number] = [440, GAME_WIDTH - 440];
/** Fight camera zoom; the HUD is drawn by a separate, unzoomed camera. */
const ZOOM = 1.2;
const MAX_SEPARATION = GAME_WIDTH / ZOOM - 150;
/** Length of the round-1 character intros before "ROUND 1" is called. */
const INTRO_FRAMES = 96;
/**
 * Round start, in frames after the intros: ROUND N, then 3-2-1 on a steady half-second beat,
 * then FIGHT! — control is handed over a few frames later, as the banner lands.
 */
const COUNT_AT = [56, 86, 116] as const;
const FIGHT_AT = 146;
const LIVE_AT = FIGHT_AT + 10;

const specialCost = (f: Fighter): number => MOVES[f.def.special].special?.energyCost ?? Infinity;

export class FightScene extends Phaser.Scene {
  private difficulty: Difficulty = 'normal';
  private playerId: FighterId = 'kaen';
  private world!: Phaser.GameObjects.Layer;
  private ui!: Phaser.GameObjects.Layer;
  private p1!: Fighter;
  private p2!: Fighter;
  private r1!: FighterRig;
  private r2!: FighterRig;
  private shadows!: Phaser.GameObjects.Graphics;
  private debug!: Phaser.GameObjects.Graphics;
  private debugText!: Phaser.GameObjects.Text;
  private controls!: InputManager;
  private ai!: EnemyAI;
  private combat!: CombatManager;
  private energy!: EnergyManager;
  private readonly projectileViews = new Map<Projectile, FireballView>();
  private hud!: HUD;
  private fx!: Effects;
  private pauseLayer!: Phaser.GameObjects.Container;
  private pauseSound!: Phaser.GameObjects.Text;

  private accumulator = 0;
  private hitstop = 0;
  private slowMo = 0;
  private lastDefender: Fighter | null = null;
  private phase: Phase = 'intro';
  private phaseTimer = 0;
  private round = 1;
  private wins: [number, number] = [0, 0];
  private timeLeft = ROUND_SECONDS;
  private secondFrames = 0;
  private roundWinner: Fighter | null = null;
  private roundLoser: Fighter | null = null;
  private roundEndReason: 'ko' | 'time' = 'ko';
  private winnerPosedAt = -1;
  private paused = false;
  private showBoxes = false;
  private mode: Mode = 'versus';
  private stage = 0;
  private stats: Telemetry = newTelemetry();
  private lastMoveSerial = -1;
  private secondWindUsed: [boolean, boolean] = [false, false];
  private camX = GAME_WIDTH / 2;
  private readonly koFocus = { t: 0, x: GAME_WIDTH / 2 };

  constructor() {
    super('FightScene');
  }

  init(data: FightData): void {
    // Scene instances are reused between matches — reset all match state here.
    this.mode = data.mode ?? 'versus';
    this.stage = this.mode === 'ladder' ? profile.save.ladder.stage : 0;
    this.difficulty = this.mode === 'ladder' ? LADDER[this.stage].difficulty : (data.difficulty ?? 'normal');
    this.playerId = data.player ?? 'kaen';
    this.lastMoveSerial = -1;
    this.accumulator = 0;
    this.hitstop = 0;
    this.slowMo = 0;
    this.lastDefender = null;
    this.round = 1;
    this.wins = [0, 0];
    this.paused = false;
    this.stats = newTelemetry();
    this.koFocus.t = 0;
  }

  create(): void {
    this.world = this.add.layer();
    this.ui = this.add.layer();
    const cam = this.cameras.main;
    cam.setBounds(0, 0, GAME_WIDTH, GAME_HEIGHT).setZoom(ZOOM);
    const uiCam = this.cameras.add(0, 0, GAME_WIDTH, GAME_HEIGHT);
    cam.ignore(this.ui);
    uiCam.ignore(this.world);

    new Arena(this, this.world);
    this.shadows = this.addWorld(this.add.graphics().setDepth(DEPTH.shadow));

    const p1Def = withOutfit(FIGHTERS[this.playerId], profile.outfit(this.playerId));
    const p2Def = FIGHTERS[opponentOf(this.playerId)];
    this.p1 = new Fighter(p1Def, START_X[0], 1);
    this.p2 = new Fighter(p2Def, START_X[1], -1);
    // Upgrades, skills and queued items for the player; tougher CPUs further up the ladder.
    this.p1.mods = profile.mods();
    this.p2.mods = this.mode === 'ladder' ? ladderCpuMods(this.stage) : { ...BASE_MODS };
    this.p1.opponent = this.p2;
    this.p2.opponent = this.p1;
    this.r1 = new FighterRig(this, this.p1, { layer: this.world });
    this.r2 = new FighterRig(this, this.p2, { layer: this.world });

    this.controls = new InputManager(this);
    this.combat = new CombatManager(this.p1, this.p2);
    this.energy = new EnergyManager([this.p1, this.p2]);
    this.projectileViews.clear();
    this.ai = new EnemyAI(this.p2, this.p1, this.difficulty, {
      energy: (f) => this.energy.get(f),
      projectiles: () => this.combat.projectiles,
    });
    this.fx = new Effects(this, this.world);
    this.hud = new HUD(this, this.ui, p1Def, p2Def, this.difficulty);
    if (this.mode === 'ladder') {
      const s = LADDER[this.stage];
      this.hud.setSubtitle(`${s.boss ? 'FINAL BOSS' : `STAGE ${this.stage + 1}/${LADDER.length}`} · ${s.name.toUpperCase()}`);
    }
    // Energy Tonic: a head start for this match only.
    this.energy.add(this.p1, this.p1.mods.matchStartEnergy);

    this.debug = this.addWorld(this.add.graphics().setDepth(DEPTH.overlay - 1));
    this.debugText = this.addUi(
      this.add
        .text(12, 128, '', { fontFamily: 'monospace', fontSize: '13px', color: '#9fffa0', backgroundColor: '#000000aa' })
        .setDepth(DEPTH.overlay - 1)
        .setVisible(false),
    );
    this.buildPauseLayer();

    onKeyPress(this, (e) => this.onKey(e));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.controls.destroy());

    this.cameras.cameras.forEach((c) => c.fadeIn(350));
    this.startRound();
  }

  private addWorld<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.world.add(o);
    return o;
  }

  private addUi<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.ui.add(o);
    return o;
  }

  // ------------------------------------------------------------------ loop

  update(_time: number, delta: number): void {
    if (this.paused) return;

    // Fixed-step simulation: identical frame data at 30, 60 or 144 Hz.
    this.accumulator += Math.min(delta, 100) * (this.slowMo > 0 ? 0.35 : 1);
    let steps = 0;
    while (this.accumulator >= STEP_MS && steps < 5) {
      this.accumulator -= STEP_MS;
      this.step();
      steps++;
    }
    if (steps === 5) this.accumulator = 0;

    this.render(delta);
  }

  private step(): void {
    const live = this.phase === 'fight';
    // Always poll so presses during the intro don't fire later; feed during hitstop so
    // players can buffer their next combo input while the game is frozen on impact.
    const playerInput = this.controls.poll();
    this.p1.setInput(live ? playerInput : EMPTY_INPUT);

    if (this.hitstop > 0) {
      this.hitstop--;
      return;
    }
    if (this.slowMo > 0) this.slowMo--;

    this.p2.setInput(live ? this.ai.getInput() : EMPTY_INPUT);
    this.p1.update();
    this.p2.update();
    this.trackPlayerMoves();
    this.combat.stepProjectiles();
    this.combat.separate();
    this.combat.constrainSeparation(MAX_SEPARATION);
    for (const hit of this.combat.resolveAttacks()) this.onHit(hit);
    this.checkSecondWind();
    this.drainEvents(this.p1);
    this.drainEvents(this.p2);

    if (this.phase === 'fight') this.stats.fightSteps++;
    if (this.phase === 'fight' && (this.p1.hp <= 0 || this.p2.hp <= 0)) this.endRound('ko');

    this.r1.tick();
    this.r2.tick();
    // Whoever is attacking draws in front.
    const p1Front = this.p1.state === 'attack' || this.p2.state !== 'attack';
    this.r1.setDepth(p1Front ? DEPTH.fighterFront : DEPTH.fighter);
    this.r2.setDepth(p1Front ? DEPTH.fighter : DEPTH.fighterFront);

    this.updatePhase();
  }

  private render(delta: number): void {
    const jitter = (f: Fighter) => (this.hitstop > 0 && this.lastDefender === f ? (Math.random() - 0.5) * 7 : 0);
    this.r1.shakeX = jitter(this.p1);
    this.r2.shakeX = jitter(this.p2);

    this.shadows.clear();
    this.r1.drawShadow(this.shadows, GROUND_Y);
    this.r2.drawShadow(this.shadows, GROUND_Y);
    this.r1.draw();
    this.r2.draw();
    this.syncProjectiles(delta);
    this.updateCamera();
    this.hud.setEnergy(0, this.energy.get(this.p1), ENERGY_RULES.max, specialCost(this.p1));
    this.hud.setEnergy(1, this.energy.get(this.p2), ENERGY_RULES.max, specialCost(this.p2));
    this.hud.update(delta);
    if (this.showBoxes) this.drawDebug();
  }

  /** Keeps one fireball visual per live projectile; removes visuals of finished ones. */
  private syncProjectiles(delta: number): void {
    for (const p of this.combat.projectiles) {
      let view = this.projectileViews.get(p);
      if (p.alive) {
        if (!view) {
          view = new FireballView(this, this.world, p.x, p.y, Math.sign(p.vx));
          this.projectileViews.set(p, view);
        }
        view.update(p.x, p.y, delta);
      } else if (view) {
        view.finish();
        this.projectileViews.delete(p);
      }
    }
    this.combat.pruneProjectiles();
  }

  private updateCamera(): void {
    const cam = this.cameras.main;
    const mid = (this.p1.x + this.p2.x) / 2;
    const k = this.koFocus.t;
    const target = mid + (this.koFocus.x - mid) * k * 0.6;
    this.camX += (target - this.camX) * 0.2;
    const zoom = ZOOM + 0.22 * k;
    cam.setZoom(zoom);
    cam.centerOn(this.camX, GAME_HEIGHT - GAME_HEIGHT / (2 * zoom));
  }

  // ------------------------------------------------------------------ combat feedback

  private onHit(h: HitEvent): void {
    const attackerIndex = h.attacker === this.p1 ? 0 : 1;
    const defenderIndex = attackerIndex === 0 ? 1 : 0;
    this.lastDefender = h.defender;
    this.energy.onHit(h);
    if (h.defender === this.p1 && h.parried) this.stats.parries++;
    else if (h.defender === this.p1 && h.blocked) this.stats.blocks++;
    else if (h.defender === this.p1) this.stats.damageTaken += h.damage;

    if (h.parried) {
      // A longer freeze than any hit: the moment the attack is turned aside should register.
      this.hitstop = Math.max(this.hitstop, 14);
      this.lastDefender = h.projectile ? h.defender : h.attacker;
      this.fx.parry(h.x, h.y);
      audio.play('parry');
      this.cameras.main.flash(90, 255, 236, 160);
      this.hud.callout(defenderIndex, 'PARRY!', '#ffe066');
      return;
    }

    if (h.blocked) {
      this.hitstop = Math.max(this.hitstop, h.move.hitstop - 2);
      this.fx.block(h.x, h.y);
      audio.play('block');
      return;
    }

    const heavy = h.move.heavy || h.ko || h.counter;
    this.hitstop = Math.max(this.hitstop, h.move.hitstop + (h.ko ? 16 : 0) + (h.counter ? PHYS.counterHitstop : 0));
    this.fx.hit(h.x, h.y, heavy, h.attacker.def.fx);
    audio.play(heavy ? 'hitHeavy' : 'hitLight');
    this.cameras.main.shake(heavy ? 200 : 70, heavy ? 0.009 : 0.003);
    if (h.counter) {
      audio.play('counter');
      this.hud.callout(attackerIndex, 'COUNTER', '#ff6a4d');
    }

    this.hud.setHealth(defenderIndex, h.defender.hp / h.defender.mods.maxHp);
    if (h.combo >= 2) this.hud.showCombo(attackerIndex, h.combo);

    if (h.attacker === this.p1) {
      this.stats.damageDealt += h.damage;
      this.stats.maxCombo = Math.max(this.stats.maxCombo, h.combo);
    }
  }

  private drainEvents(f: Fighter): void {
    for (const e of f.events) {
      switch (e) {
        case 'whoosh':
          audio.play(f.move?.special?.kind === 'dash' ? 'dash' : 'whoosh');
          break;
        case 'specialStart':
          // Readable tell: a short aura flare and power-up sound during startup.
          audio.play('powerup');
          this.fx.aura(f.x, GROUND_Y, f.def.fx, 10);
          this.hud.portraitShout(f === this.p1 ? 0 : 1);
          break;
        case 'projectile':
          this.combat.spawnProjectile(f);
          audio.play('fireball');
          break;
        case 'noEnergy':
          if (f === this.p1) {
            this.hud.denyEnergy(0);
            audio.play('denied');
          }
          break;
        case 'jump':
          audio.play('jump');
          this.fx.dust(f.x, GROUND_Y, 4);
          break;
        case 'dash':
          audio.play('step');
          this.fx.dust(f.x - f.facing * 30, GROUND_Y, 6);
          break;
        case 'evade':
          audio.play('step');
          this.fx.dust(f.x + f.facing * 20, GROUND_Y, 5);
          break;
        case 'land':
          audio.play('land');
          this.fx.dust(f.x, GROUND_Y, 5);
          break;
        case 'groundImpact':
          audio.play('thud');
          this.fx.dust(f.x - f.facing * 40, GROUND_Y, 14);
          this.cameras.main.shake(140, 0.005);
          break;
      }
    }
    f.events.length = 0;
  }

  // ------------------------------------------------------------------ rounds

  private startRound(): void {
    this.p1.resetForRound(START_X[0], 1);
    this.p2.resetForRound(START_X[1], -1);
    if (this.round === 1) {
      this.p1.setState('intro');
      this.p2.setState('intro');
    }
    this.r1.snap();
    this.r2.snap();
    this.combat.clearProjectiles();
    this.ai.reset();
    this.controls.clear();
    this.camX = (this.p1.x + this.p2.x) / 2;

    this.timeLeft = ROUND_SECONDS;
    this.secondFrames = 0;
    this.hitstop = 0;
    this.slowMo = 0;
    this.phase = 'intro';
    this.phaseTimer = 0;
    this.roundWinner = null;
    this.roundLoser = null;
    this.winnerPosedAt = -1;

    this.secondWindUsed = [false, false];
    // Resolve upgrade: a little energy at the start of every round.
    for (const f of [this.p1, this.p2]) this.energy.add(f, f.mods.roundStartEnergy);

    this.hud.resetHealth();
    this.hud.setTime(this.timeLeft);
    this.hud.setRound(this.round);
    this.hud.setWins(this.wins[0], this.wins[1]);
  }

  private updatePhase(): void {
    this.phaseTimer++;
    const t = this.phaseTimer;
    switch (this.phase) {
      case 'intro': {
        const offset = this.round === 1 ? INTRO_FRAMES : 0;
        if (this.round === 1) {
          for (const f of [this.p1, this.p2]) {
            if (t === INTRO_CUE[f.def.id]) {
              this.fx.aura(f.x, GROUND_Y, f.def.fx);
              audio.play('powerup');
            }
          }
        }
        const c = t - offset;
        if (c === 1) {
          const final = this.wins[0] === ROUNDS_TO_WIN - 1 && this.wins[1] === ROUNDS_TO_WIN - 1;
          this.hud.announce(final ? 'FINAL ROUND' : `ROUND ${this.round}`, { size: final ? 96 : 110, hold: 450 });
          audio.play('round');
        }
        const beat = COUNT_AT.indexOf(c as (typeof COUNT_AT)[number]);
        if (beat >= 0) {
          this.hud.announce(String(COUNT_AT.length - beat), { size: 150, hold: 180 });
          audio.play('count');
        }
        if (c === FIGHT_AT) {
          this.hud.announce('FIGHT!', { color: '#ffd23f', size: 140, hold: 350 });
          audio.play('fight');
        }
        if (c >= LIVE_AT) {
          this.phase = 'fight';
          this.phaseTimer = 0;
          for (const f of [this.p1, this.p2]) if (f.state === 'intro') f.setState('idle');
        }
        break;
      }
      case 'fight':
        if (++this.secondFrames >= 60) {
          this.secondFrames = 0;
          this.timeLeft--;
          this.hud.setTime(this.timeLeft);
          if (this.timeLeft <= 0) this.endRound('time');
        }
        break;
      case 'roundEnd': {
        const w = this.roundWinner;
        if (w && this.winnerPosedAt < 0 && t > 50 && w.isActionable()) {
          w.celebrate();
          this.winnerPosedAt = t;
          this.hud.portraitShout(w === this.p1 ? 0 : 1);
        }
        if (w && this.winnerPosedAt > 0 && t === this.winnerPosedAt + 16) {
          this.fx.aura(w.x, GROUND_Y, w.def.fx, 22);
          audio.play('powerup');
        }
        const l = this.roundLoser;
        if (this.roundEndReason === 'time' && l && l.state !== 'lose' && t > 50 && l.isActionable()) l.slump();
        if (t === 100) {
          if (!w) this.hud.announce('DRAW', { hold: 900 });
          else if (w.hp === w.mods.maxHp) this.hud.announce('PERFECT', { color: '#ffd23f', hold: 900 });
          else this.hud.announce(w === this.p1 ? 'YOU WIN' : 'YOU LOSE', { color: w === this.p1 ? '#ffd23f' : '#c8b6ff', hold: 900 });
        }
        if (t >= 230) this.nextRound();
        break;
      }
      case 'matchOver':
        break;
    }
  }

  private endRound(reason: 'ko' | 'time'): void {
    this.phase = 'roundEnd';
    this.phaseTimer = 0;
    this.combat.clearProjectiles();
    this.roundEndReason = reason;
    const { p1, p2 } = this;

    let winner: Fighter | null;
    if (reason === 'ko') winner = p1.hp <= 0 && p2.hp <= 0 ? null : p1.hp > 0 ? p1 : p2;
    else winner = p1.hp === p2.hp ? null : p1.hp > p2.hp ? p1 : p2;
    this.roundWinner = winner;
    this.roundLoser = winner === p1 ? p2 : winner === p2 ? p1 : null;

    if (winner === p1 && p1.hp === p1.mods.maxHp) this.stats.perfectRounds++;
    if (winner === p1) this.wins[0]++;
    else if (winner === p2) this.wins[1]++;
    else {
      this.wins[0]++;
      this.wins[1]++;
    }
    this.hud.setWins(this.wins[0], this.wins[1]);
    if (this.roundLoser) this.hud.portraitDefeat(this.roundLoser === p1 ? 0 : 1);
    else if (reason === 'ko') [0, 1].forEach((i) => this.hud.portraitDefeat(i as 0 | 1));

    if (reason === 'ko') {
      this.slowMo = 45;
      this.cameras.main.flash(250, 255, 255, 255);
      audio.play('ko');
      const double = p1.hp <= 0 && p2.hp <= 0;
      this.hud.announce(double ? 'DOUBLE K.O.' : 'K.O.', { color: '#ff4d3d', size: 160, hold: 1100 });
      // Cinematic push-in on the knocked-out fighter.
      this.koFocus.x = this.roundLoser?.x ?? (p1.x + p2.x) / 2;
      this.tweens.killTweensOf(this.koFocus);
      this.tweens.add({ targets: this.koFocus, t: 1, duration: 260, ease: 'Quad.easeOut', yoyo: true, hold: 1300 });
    } else {
      audio.play('round');
      this.hud.announce('TIME', { hold: 900 });
    }
  }

  private nextRound(): void {
    if (this.wins[0] >= ROUNDS_TO_WIN || this.wins[1] >= ROUNDS_TO_WIN) {
      this.finishMatch();
      return;
    }
    this.round++;
    this.startRound();
  }

  private finishMatch(): void {
    this.phase = 'matchOver';
    const [w1, w2] = this.wins;
    const outcome = w1 === w2 ? 'draw' : w1 > w2 ? 'win' : 'lose';
    const st = this.stats;
    const report: MatchReport = {
      mode: this.mode,
      stage: this.mode === 'ladder' ? this.stage : null,
      fighter: this.playerId,
      opponent: opponentOf(this.playerId),
      difficulty: this.difficulty,
      outcome,
      rounds: [Math.min(3, w1), Math.min(3, w2)],
      durationSec: Math.round(st.fightSteps / 60),
      damageDealt: st.damageDealt,
      damageTaken: st.damageTaken,
      maxCombo: st.maxCombo,
      specials: st.specials,
      parries: st.parries,
      blocks: st.blocks,
      perfectRounds: Math.min(3, st.perfectRounds),
      moves: st.moves,
    };
    const data: ResultData = {
      outcome,
      mode: this.mode,
      difficulty: this.difficulty,
      player: this.playerId,
      wins: [w1, w2],
      maxCombo: st.maxCombo,
      damageDealt: st.damageDealt,
      report,
    };
    this.cameras.cameras.forEach((c) => c.fadeOut(500, 0, 0, 0));
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start('ResultScene', data);
    });
  }

  // ------------------------------------------------------------------ progression helpers

  /** Counts every move the player starts (habits: favourite moves, special usage). */
  private trackPlayerMoves(): void {
    const p = this.p1;
    if (p.state !== 'attack' || !p.move || p.moveSerial === this.lastMoveSerial) return;
    this.lastMoveSerial = p.moveSerial;
    this.stats.moves[p.move.id] = (this.stats.moves[p.move.id] ?? 0) + 1;
    if (p.move.special) this.stats.specials++;
  }

  /** Second Wind skill: once per round, a fighter dropping under 25% health recovers 15. */
  private checkSecondWind(): void {
    ([this.p1, this.p2] as const).forEach((f, i) => {
      if (!f.mods.secondWind || this.secondWindUsed[i] || f.hp <= 0 || f.hp >= f.mods.maxHp * 0.25) return;
      this.secondWindUsed[i] = true;
      f.hp = Math.min(f.mods.maxHp, f.hp + 15);
      this.hud.setHealth(i as 0 | 1, f.hp / f.mods.maxHp);
      this.hud.callout(i as 0 | 1, 'SECOND WIND', '#7dffb0');
      this.fx.aura(f.x, GROUND_Y, f.def.fx, 14);
      audio.play('powerup');
    });
  }

  // ------------------------------------------------------------------ pause & debug

  private onKey(e: KeyboardEvent): void {
    audio.unlock();
    switch (e.code) {
      case 'Escape':
        if (this.phase !== 'matchOver') this.setPaused(!this.paused);
        break;
      case 'KeyQ':
        if (this.paused) this.scene.start('MenuScene');
        break;
      case 'KeyM':
        audio.toggleMute();
        this.pauseSound.setText(`M   Sound: ${audio.muted ? 'OFF' : 'ON'}`);
        void profile.saveSettings({ muted: audio.muted });
        break;
      case 'Backquote':
        this.showBoxes = !this.showBoxes;
        this.debug.clear();
        this.debugText.setVisible(this.showBoxes);
        break;
    }
  }

  private setPaused(paused: boolean): void {
    this.paused = paused;
    this.pauseLayer.setVisible(paused);
    this.controls.clear();
    if (paused) this.tweens.pauseAll();
    else this.tweens.resumeAll();
  }

  private buildPauseLayer(): void {
    const cx = GAME_WIDTH / 2;
    const bg = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x07040f, 0.72).setOrigin(0);
    const title = this.add.text(cx, 250, 'PAUSED', textStyle(90, '#ffd23f')).setOrigin(0.5);
    const lines = this.add
      .text(cx, 380, 'ESC   Resume\nQ   Quit to menu', textStyle(26, '#ffffff', { italic: false }))
      .setOrigin(0.5)
      .setAlign('center')
      .setLineSpacing(10);
    this.pauseSound = this.add
      .text(cx, 460, `M   Sound: ${audio.muted ? 'OFF' : 'ON'}`, textStyle(22, '#c8b6ff', { italic: false }))
      .setOrigin(0.5);
    const hint = this.add
      .text(cx, 520, '`   toggle hitbox view', textStyle(16, '#9a90b0', { italic: false }))
      .setOrigin(0.5);
    this.pauseLayer = this.addUi(
      this.add
        .container(0, 0, [bg, title, lines, this.pauseSound, hint])
        .setDepth(DEPTH.overlay)
        .setVisible(false),
    );
  }

  private drawDebug(): void {
    const g = this.debug;
    g.clear();
    for (const f of [this.p1, this.p2]) {
      const push = f.getPushbox();
      g.lineStyle(1, 0x4da3ff, 0.9);
      g.strokeRect(push.x, push.y, push.w, push.h);
      for (const b of f.getHurtboxes()) {
        g.lineStyle(2, 0x3dff7a, 0.9);
        g.strokeRect(b.x, b.y, b.w, b.h);
      }
      const hit = f.getHitbox();
      if (hit) {
        g.fillStyle(0xff2d55, 0.45);
        g.fillRect(hit.x, hit.y, hit.w, hit.h);
        g.lineStyle(2, 0xff2d55, 1);
        g.strokeRect(hit.x, hit.y, hit.w, hit.h);
      }
      g.fillStyle(0xffffff, 1);
      g.fillCircle(f.x, f.y, 3);
    }
    for (const p of this.combat.projectiles) {
      if (!p.alive) continue;
      const b = p.box;
      g.fillStyle(0xff8a2a, 0.4);
      g.fillRect(b.x, b.y, b.w, b.h);
      g.lineStyle(2, 0xff8a2a, 1);
      g.strokeRect(b.x, b.y, b.w, b.h);
    }
    const fmt = (f: Fighter) =>
      `${f.def.name.padEnd(5)} ${f.state.padEnd(9)} hp ${String(f.hp).padStart(3)} ${f.move ? `${f.move.id}:${f.moveFrame} ${f.movePhase}` : ''}`;
    this.debugText.setText(
      [`FPS ${this.game.loop.actualFps.toFixed(0)}  phase ${this.phase}`, fmt(this.p1), fmt(this.p2)].join('\n'),
    );
  }
}
