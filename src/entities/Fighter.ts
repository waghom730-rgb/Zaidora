import { GROUND_Y, MAX_HP, PHYS, STAGE_LEFT, STAGE_RIGHT } from '../config';
import { MOVES, type AttackButton, type MoveData, type MoveId } from '../combat/moves';
import { EMPTY_INPUT, type Box, type FighterInput } from '../combat/types';
import type { FighterDef } from './fighterDefs';

export type FighterState =
  | 'intro'
  | 'idle'
  | 'walk'
  | 'prejump'
  | 'air'
  | 'land'
  | 'attack'
  | 'block'
  | 'blockstun'
  | 'hitstun'
  | 'knockdown'
  | 'down'
  | 'getup'
  | 'ko'
  | 'victory'
  | 'lose';

export type MovePhase = 'startup' | 'active' | 'recovery';

/** One-shot things that happened this step, drained by the scene for sound / effects. */
export type FighterEvent = 'jump' | 'land' | 'whoosh' | 'groundImpact' | 'specialStart' | 'projectile' | 'noEnergy';

const BODY_W = 62;
const STAND_H = 186;
const PUSH_W = 56;

/**
 * A fighter's simulation: state machine, movement and combat boxes.
 * Contains no rendering or Phaser code — a controller (keyboard or AI) feeds it
 * a FighterInput every step and FighterRenderer draws it.
 */
export class Fighter {
  x: number;
  y = GROUND_Y;
  vx = 0;
  vy = 0;
  facing: 1 | -1;
  hp = MAX_HP;
  state: FighterState = 'idle';
  stateTime = 0;
  grounded = true;

  move: MoveData | null = null;
  moveFrame = 0;
  /** Increments every time a new move starts — lets controllers tell moves apart. */
  moveSerial = 0;
  /** True once the current move has hit or been blocked (enables chain cancels). */
  moveConnected = false;

  /** Hits landed in the current combo. */
  combo = 0;
  /** Increments on every hit or block received — lets the renderer restart reactions. */
  hitSerial = 0;
  /** Whether the last hit taken was aimed at the head (vs. the body). */
  lastHitHigh = true;
  /** -1 back, 0 straight up, 1 forward — for the current/last jump. */
  jumpDir = 0;
  hitFlash = 0;
  opponent: Fighter | null = null;
  readonly events: FighterEvent[] = [];
  /**
   * Pays for a special. Wired to the match's EnergyManager; without one (menus),
   * specials are unavailable.
   */
  spendEnergy: (cost: number) => boolean = () => false;

  private moveHitDone = false;
  private stun = 0;
  private airAttackUsed = false;
  private landLag = 0;
  private held: FighterInput = { ...EMPTY_INPUT };
  private buffer: { button: AttackButton; frames: number } | null = null;

  constructor(
    readonly def: FighterDef,
    x: number,
    facing: 1 | -1,
  ) {
    this.x = x;
    this.facing = facing;
  }

  resetForRound(x: number, facing: 1 | -1): void {
    this.x = x;
    this.y = GROUND_Y;
    this.vx = 0;
    this.vy = 0;
    this.facing = facing;
    this.hp = MAX_HP;
    this.grounded = true;
    this.combo = 0;
    this.hitFlash = 0;
    this.stun = 0;
    this.buffer = null;
    this.held = { ...EMPTY_INPUT };
    this.events.length = 0;
    this.setState('idle');
  }

  // ---------------------------------------------------------------- queries

  get movePhase(): MovePhase | null {
    const m = this.move;
    if (this.state !== 'attack' || !m) return null;
    if (this.moveFrame < m.startup) return 'startup';
    if (this.moveFrame < m.startup + m.active) return 'active';
    return 'recovery';
  }

  get invulnerable(): boolean {
    return (
      this.state === 'knockdown' || this.state === 'down' || this.state === 'getup' || this.state === 'ko'
    );
  }

  /** Whether the fighter can start a new action right now. */
  isActionable(): boolean {
    return this.state === 'idle' || this.state === 'walk' || this.state === 'block';
  }

  get isBeingComboed(): boolean {
    return this.state === 'hitstun' || this.state === 'knockdown';
  }

  /** Bodies collide (push each other) unless one is on the floor or flying from a knockdown. */
  get collides(): boolean {
    return this.state !== 'knockdown' && this.state !== 'down' && this.state !== 'ko';
  }

  // ---------------------------------------------------------------- input

  setInput(input: FighterInput): void {
    this.held = input;
    // Presses are buffered for a few frames so combos don't need frame-perfect timing.
    if (input.special) this.buffer = { button: 'special', frames: PHYS.inputBufferFrames };
    else if (input.punch) this.buffer = { button: 'punch', frames: PHYS.inputBufferFrames };
    else if (input.kick) this.buffer = { button: 'kick', frames: PHYS.inputBufferFrames };
  }

  // ---------------------------------------------------------------- simulation

  update(): void {
    this.stateTime++;
    if (this.hitFlash > 0) this.hitFlash--;
    if (this.buffer && --this.buffer.frames <= 0) this.buffer = null;

    const inp = this.held;
    const fwd = this.facing === 1 ? inp.right : inp.left;
    const back = this.facing === 1 ? inp.left : inp.right;

    switch (this.state) {
      case 'idle':
      case 'walk':
      case 'block':
        this.faceOpponent();
        if (this.tryStartAttack()) break;
        if (inp.up) {
          this.jumpDir = fwd && !back ? 1 : back && !fwd ? -1 : 0;
          this.vx = 0;
          this.setState('prejump');
          break;
        }
        if (inp.block) {
          if (this.state !== 'block') this.setState('block');
          this.vx = 0;
          break;
        }
        if (fwd !== back) {
          if (this.state !== 'walk') this.setState('walk');
          this.vx = (fwd ? PHYS.walkForward : -PHYS.walkBack) * this.facing;
        } else {
          if (this.state !== 'idle') this.setState('idle');
          this.vx = 0;
        }
        break;

      case 'prejump':
        if (this.stateTime >= PHYS.prejumpFrames) {
          this.grounded = false;
          this.vy = PHYS.jumpVelocity;
          this.vx = this.jumpDir * PHYS.jumpSpeedX * this.facing;
          this.airAttackUsed = false;
          this.setState('air');
          this.events.push('jump');
        }
        break;

      case 'air':
        this.tryStartAttack();
        break;

      case 'attack':
        this.updateAttack();
        break;

      case 'land':
        if (this.stateTime >= this.landLag) this.setState('idle');
        break;

      case 'hitstun':
        if (--this.stun <= 0) this.setState('idle');
        break;

      case 'blockstun':
        if (--this.stun <= 0) this.setState(inp.block ? 'block' : 'idle');
        break;

      case 'down':
        if (this.stateTime >= PHYS.downFrames) this.setState('getup');
        break;

      case 'getup':
        if (this.stateTime >= PHYS.getupFrames) {
          this.setState('idle');
          this.faceOpponent();
        }
        break;

      case 'intro':
      case 'knockdown':
      case 'ko':
      case 'victory':
      case 'lose':
        break;
    }

    this.integrate();
  }

  setState(state: FighterState): void {
    this.state = state;
    this.stateTime = 0;
    if (state !== 'attack') this.move = null;
  }

  celebrate(): void {
    if (this.state === 'ko') return;
    this.vx = 0;
    this.setState('victory');
  }

  /** Time-over loser: stands exhausted. */
  slump(): void {
    if (this.state === 'ko') return;
    this.vx = 0;
    this.setState('lose');
  }

  private faceOpponent(): void {
    if (!this.opponent) return;
    const dx = this.opponent.x - this.x;
    if (Math.abs(dx) > 2) this.facing = dx > 0 ? 1 : -1;
  }

  private tryStartAttack(): boolean {
    if (!this.buffer) return false;
    const button = this.buffer.button;
    if (button === 'special') {
      this.buffer = null;
      return this.trySpecial();
    }
    let id: MoveId;
    if (this.grounded) {
      id = button === 'punch' ? 'jab' : 'frontKick';
    } else {
      if (this.airAttackUsed) return false;
      id = button === 'punch' ? 'airPunch' : 'airKick';
      this.airAttackUsed = true;
    }
    this.buffer = null;
    this.startMove(MOVES[id]);
    return true;
  }

  /** Starts this character's special if grounded and the energy can be paid. */
  private trySpecial(): boolean {
    const m = MOVES[this.def.special];
    if (!this.grounded || !m.special) return false;
    if (!this.spendEnergy(m.special.energyCost)) {
      this.events.push('noEnergy');
      return false;
    }
    this.startMove(m);
    this.events.push('specialStart');
    return true;
  }

  private startMove(m: MoveData): void {
    this.setState('attack');
    this.move = m;
    this.moveFrame = 0;
    this.moveSerial++;
    this.moveConnected = false;
    this.moveHitDone = false;
    if (!m.air) this.vx = 0;
  }

  private updateAttack(): void {
    const m = this.move;
    if (!m) {
      this.setState(this.grounded ? 'idle' : 'air');
      return;
    }
    this.moveFrame++;
    if (!m.air && m.lunge && this.moveFrame < m.startup) this.vx = m.lunge * this.facing;
    if (this.moveFrame === m.startup) this.events.push(m.special?.kind === 'projectile' ? 'projectile' : 'whoosh');

    const sp = m.special;
    if (sp?.kind === 'dash') {
      const phase = this.movePhase;
      if (phase === 'startup') this.vx = 0;
      // Rush forward; stop short once the strike connects.
      else if (phase === 'active') this.vx = this.moveHitDone ? this.vx * 0.5 : (sp.dashSpeed ?? 12) * this.facing;
      // Short skid into a clear, punishable stop.
      else if (this.moveFrame === m.startup + m.active) this.vx = Math.max(-5, Math.min(5, this.vx));
    }

    // Special cancel: a connecting normal can flow into the special (if energy allows).
    if (this.moveConnected && this.buffer?.button === 'special' && m.specialCancel) {
      this.buffer = null;
      if (this.trySpecial()) return;
    }

    // Chain cancel: once the move connects, a buffered button flows into the next move.
    if (this.moveConnected && this.buffer) {
      const next = m.chain[this.buffer.button];
      if (next) {
        this.buffer = null;
        this.startMove(MOVES[next]);
        return;
      }
    }

    if (this.moveFrame >= m.startup + m.active + m.recovery) {
      this.setState(this.grounded ? 'idle' : 'air');
    }
  }

  private integrate(): void {
    if (!this.grounded) {
      this.vy += PHYS.gravity;
      this.x += this.vx;
      this.y += this.vy;
      if (this.y >= GROUND_Y && this.vy > 0) {
        this.y = GROUND_Y;
        this.vy = 0;
        this.grounded = true;
        this.onLand();
      }
    } else {
      this.x += this.vx;
      const lunging = this.state === 'attack' && this.movePhase === 'startup' && !!this.move?.lunge;
      if (this.state !== 'walk' && !lunging) {
        this.vx *= PHYS.friction;
        if (Math.abs(this.vx) < 0.05) this.vx = 0;
      }
    }
    this.x = Math.min(STAGE_RIGHT, Math.max(STAGE_LEFT, this.x));
  }

  private onLand(): void {
    switch (this.state) {
      case 'air':
        this.vx = 0;
        this.landLag = PHYS.landFrames;
        this.setState('land');
        this.events.push('land');
        break;
      case 'attack':
        this.vx = 0;
        this.landLag = PHYS.airAttackLandFrames;
        this.setState('land');
        this.events.push('land');
        break;
      case 'knockdown':
        this.vx *= 0.3;
        this.setState(this.hp <= 0 ? 'ko' : 'down');
        this.events.push('groundImpact');
        break;
      default:
        break;
    }
  }

  // ---------------------------------------------------------------- combat

  /** Converts a facing-right box relative to the feet into world space. */
  private toWorld(b: Box): Box {
    const x = this.facing === 1 ? this.x + b.x : this.x - b.x - b.w;
    return { x, y: this.y + b.y, w: b.w, h: b.h };
  }

  getHitbox(): Box | null {
    if (!this.move || this.moveHitDone || this.movePhase !== 'active') return null;
    if (this.move.special?.kind === 'projectile') return null; // the projectile does the hitting
    return this.toWorld(this.move.hitbox);
  }

  getHurtboxes(): Box[] {
    if (this.invulnerable) return [];
    const boxes: Box[] = [];
    if (this.grounded) {
      const low = this.state === 'prejump' || this.state === 'land';
      const h = low ? STAND_H - 26 : STAND_H;
      boxes.push({ x: this.x - BODY_W / 2, y: this.y - h, w: BODY_W, h });
    } else {
      boxes.push({ x: this.x - BODY_W / 2, y: this.y - 196, w: BODY_W, h: 160 });
    }
    // The attacking limb is hittable too, so whiffed attacks can be punished.
    const phase = this.movePhase;
    if (this.move && (phase === 'active' || phase === 'recovery')) {
      const hb = this.toWorld(this.move.hitbox);
      boxes.push({ x: hb.x + 6, y: hb.y + 4, w: hb.w - 12, h: hb.h - 8 });
    }
    return boxes;
  }

  getPushbox(): Box {
    return this.grounded
      ? { x: this.x - PUSH_W / 2, y: this.y - 150, w: PUSH_W, h: 150 }
      : { x: this.x - PUSH_W / 2, y: this.y - 175, w: PUSH_W, h: 130 };
  }

  /** Called by the CombatManager when this fighter's hitbox connects. */
  registerContact(): void {
    this.moveHitDone = true;
    this.moveConnected = true;
  }

  /**
   * Applies an incoming attack. Returns true if it was blocked.
   * `pushDir` overrides the knockback direction (projectiles push along their flight).
   */
  receiveHit(move: MoveData, from: Fighter, pushDir?: number): boolean {
    const awayDir = pushDir ?? (Math.sign(this.x - from.x) || from.facing);
    this.hitSerial++;
    this.lastHitHigh = move.hitbox.y + move.hitbox.h / 2 < -125;

    const canBlock =
      this.grounded &&
      (this.state === 'block' || this.state === 'blockstun' || (this.held.block && this.isActionable()));
    if (canBlock) {
      this.setState('blockstun');
      this.stun = move.blockstun;
      this.vx = move.blockPush * awayDir;
      this.facing = awayDir === 1 ? -1 : 1;
      return true;
    }

    this.hp = Math.max(0, this.hp - move.damage);
    this.hitFlash = 5;
    this.buffer = null;
    const ko = this.hp <= 0;

    if (ko || move.knockdown || !this.grounded) {
      this.setState('knockdown');
      this.grounded = false;
      this.vy = ko ? -13 : -9.5;
      this.vx = (move.knockback * 0.7 + (ko ? 4 : 1)) * awayDir;
    } else {
      this.setState('hitstun');
      this.stun = move.hitstun;
      this.vx = move.knockback * awayDir;
    }
    return false;
  }
}
