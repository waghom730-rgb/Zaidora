import { STAGE_LEFT, STAGE_RIGHT, type Difficulty } from '../config';
import { MOVES, type AttackButton } from '../combat/moves';
import type { Projectile } from '../combat/Projectile';
import { EMPTY_INPUT, type FighterInput } from '../combat/types';
import type { Fighter } from '../entities/Fighter';

interface Profile {
  /** Frames between the player starting an attack and the AI "seeing" it. */
  reaction: number;
  blockChance: number;
  aggression: number;
  /** Chance of continuing each step of a combo after a hit/block connects. */
  comboChance: number;
  antiAir: number;
  jumpiness: number;
  /** How readily energy specials are used (0..1). */
  special: number;
  thinkMin: number;
  thinkMax: number;
}

const PROFILES: Record<Difficulty, Profile> = {
  easy: {
    reaction: 24,
    blockChance: 0.15,
    aggression: 0.35,
    comboChance: 0.25,
    antiAir: 0.05,
    jumpiness: 0.05,
    special: 0.25,
    thinkMin: 30,
    thinkMax: 60,
  },
  normal: {
    reaction: 15,
    blockChance: 0.45,
    aggression: 0.6,
    comboChance: 0.6,
    antiAir: 0.25,
    jumpiness: 0.1,
    special: 0.6,
    thinkMin: 20,
    thinkMax: 45,
  },
  hard: {
    reaction: 9,
    blockChance: 0.75,
    aggression: 0.85,
    comboChance: 0.92,
    antiAir: 0.55,
    jumpiness: 0.12,
    special: 1,
    thinkMin: 12,
    thinkMax: 30,
  },
};

type Plan = 'approach' | 'retreat' | 'hold' | 'jumpIn';

/** What the AI may look at beyond the two fighters: its energy and flying projectiles. */
export interface AIContext {
  energy(f: Fighter): number;
  projectiles(): readonly Projectile[];
}

const roll = (p: number): boolean => Math.random() < p;
const randInt = (min: number, max: number): number => min + Math.floor(Math.random() * (max - min + 1));

/**
 * CPU opponent. Produces the same FighterInput a keyboard would, so it plays by
 * exactly the same rules as the player. Reacts to threats with a human-like delay.
 */
export class EnemyAI {
  private readonly p: Profile;
  private plan: Plan = 'hold';
  private planTimer = 0;
  private readonly seen: boolean[] = [];
  private threatHandled = false;
  private blockTimer = 0;
  private cooldown = 0;
  private queue: AttackButton[] = [];
  private pressedForSerial = -1;
  private recoveryBlock: boolean | null = null;

  constructor(
    private readonly me: Fighter,
    private readonly op: Fighter,
    difficulty: Difficulty,
    private readonly ctx?: AIContext,
  ) {
    this.p = PROFILES[difficulty];
    this.reset();
  }

  reset(): void {
    this.plan = 'hold';
    this.planTimer = randInt(10, 30);
    this.seen.length = 0;
    this.threatHandled = false;
    this.blockTimer = 0;
    this.cooldown = 20;
    this.queue = [];
    this.pressedForSerial = -1;
    this.recoveryBlock = null;
  }

  getInput(): FighterInput {
    const { me, op, p } = this;
    const input: FighterInput = { ...EMPTY_INPUT };
    const dist = Math.abs(op.x - me.x);
    const toward: 'left' | 'right' = op.x > me.x ? 'right' : 'left';
    const away: 'left' | 'right' = toward === 'right' ? 'left' : 'right';
    const opHittable = !op.invulnerable;

    // Perception with reaction delay.
    const incoming = this.incomingProjectile();
    const opDashing = op.move?.special?.kind === 'dash' && op.movePhase !== 'recovery' && dist < 460;
    const threat = (op.state === 'attack' && op.movePhase !== 'recovery' && dist < 200) || !!incoming || opDashing;
    this.seen.push(threat);
    if (this.seen.length > 60) this.seen.shift();
    const seenThreat = this.seen[this.seen.length - 1 - p.reaction] ?? false;
    if (this.cooldown > 0) this.cooldown--;

    // Mid-attack: hit-confirm into the next part of the planned combo.
    if (me.state === 'attack') {
      if (me.moveConnected && this.queue.length > 0 && this.pressedForSerial !== me.moveSerial) {
        this.pressedForSerial = me.moveSerial;
        const next = this.queue.shift();
        if (next) input[next] = true;
      }
      return input;
    }
    this.queue = [];

    if (me.state === 'blockstun') {
      input.block = true;
      return input;
    }

    // Jump-in: kick on the way down.
    if (me.state === 'air') {
      if (me.vy > -3 && dist < 160 && opHittable) input.kick = true;
      return input;
    }

    if (!me.isActionable()) {
      // Hold block while stunned so we're guarding on the very first free frame, like a
      // real player. Without this, fast attacks (jab = 4 frames) could never be blocked.
      if (me.state === 'hitstun' || me.state === 'getup' || me.state === 'land') {
        if (this.recoveryBlock === null) this.recoveryBlock = roll(p.blockChance);
        input.block = this.recoveryBlock;
      }
      return input;
    }
    if (this.recoveryBlock) this.blockTimer = Math.max(this.blockTimer, 10);
    this.recoveryBlock = null;

    // Defense.
    if (this.blockTimer > 0) {
      this.blockTimer--;
      if (seenThreat) this.blockTimer = Math.max(this.blockTimer, 6);
      input.block = true;
      return input;
    }
    if (seenThreat && !this.threatHandled) {
      this.threatHandled = true;
      // Jump over an incoming fireball (and come down on the thrower) if there's time.
      const gap = incoming ? Math.abs(me.x - incoming.x) : 0;
      if (incoming && gap > 140 && gap < 330 && roll(p.jumpiness * 3)) {
        input.up = true;
        input[toward] = true;
        return input;
      }
      if (roll(p.blockChance)) {
        this.blockTimer = 16;
        input.block = true;
        return input;
      }
    }
    if (!seenThreat) this.threatHandled = false;

    // Anti-air a jumping opponent.
    if (!op.grounded && op.collides && dist < 170 && op.vy > -6 && this.cooldown === 0 && roll(p.antiAir * 0.15)) {
      input.punch = true;
      this.cooldown = 30;
      return input;
    }

    // Energy specials.
    if (this.canSpecial() && opHittable && this.cooldown === 0) {
      const kind = MOVES[me.def.special].special?.kind;
      const zoning = kind === 'projectile' && dist > 260 && dist < 950 && roll(p.special * 0.035);
      const rush = kind === 'dash' && dist > 150 && dist < 270 && roll(p.special * 0.04);
      const dashPunish = kind === 'dash' && op.state === 'attack' && op.movePhase === 'recovery' && dist < 270 && roll(p.special * 0.5);
      if (zoning || rush || dashPunish) {
        input.special = true;
        this.cooldown = 50;
        return input;
      }
    }

    // Punish an attack that is recovering in range.
    if (
      op.state === 'attack' &&
      op.movePhase === 'recovery' &&
      dist < 140 &&
      this.cooldown === 0 &&
      roll(p.aggression * 0.35)
    ) {
      this.startCombo(input, dist);
      return input;
    }

    // Movement plan.
    if (--this.planTimer <= 0) this.choosePlan(dist);
    switch (this.plan) {
      case 'approach':
        if (dist > 105) input[toward] = true;
        break;
      case 'retreat':
        input[away] = true;
        if (me.x <= STAGE_LEFT + 30 || me.x >= STAGE_RIGHT - 30) this.plan = 'approach';
        break;
      case 'jumpIn':
        input.up = true;
        input[toward] = true;
        this.plan = 'hold';
        this.planTimer = 40;
        break;
      case 'hold':
        break;
    }

    // Attack when in range.
    if (opHittable && dist < 138 && this.cooldown === 0 && roll(p.aggression * 0.07)) {
      input.left = false;
      input.right = false;
      input.up = false;
      this.startCombo(input, dist);
    }

    return input;
  }

  private choosePlan(dist: number): void {
    const { p } = this;
    const r = Math.random();
    if (dist > 320) {
      this.plan = r < 0.8 ? 'approach' : 'hold';
    } else if (dist > 170) {
      if (r < p.jumpiness) this.plan = 'jumpIn';
      else if (r < 0.6 + p.aggression * 0.2) this.plan = 'approach';
      else if (r < 0.85) this.plan = 'hold';
      else this.plan = 'retreat';
    } else {
      if (r < 0.35 + p.aggression * 0.3) this.plan = 'approach';
      else if (r < 0.8) this.plan = 'hold';
      else this.plan = 'retreat';
    }
    this.planTimer = randInt(p.thinkMin, p.thinkMax);
  }

  private startCombo(input: FighterInput, dist: number): void {
    const options: AttackButton[][] =
      dist > 128
        ? [['kick', 'kick']]
        : [['punch', 'punch', 'kick'], ['punch', 'kick'], ['kick', 'kick'], ['punch']];
    const pick = options[Math.floor(Math.random() * options.length)];
    input[pick[0]] = true;

    this.queue = [];
    for (const b of pick.slice(1)) {
      if (!roll(this.p.comboChance)) break;
      this.queue.push(b);
    }
    // With energy to spare, finish a confirmed combo with the special instead.
    if (this.canSpecial() && roll(this.p.special * 0.35)) {
      this.queue = pick[0] === 'punch' ? ['punch', 'special'] : ['special'];
    }
    this.cooldown = Math.round(40 - this.p.aggression * 20);
  }

  private canSpecial(): boolean {
    const cost = MOVES[this.me.def.special].special?.energyCost ?? Infinity;
    return !!this.ctx && this.ctx.energy(this.me) >= cost;
  }

  /** The opponent's projectile flying toward us and getting close, if any. */
  private incomingProjectile(): Projectile | undefined {
    const me = this.me;
    return this.ctx
      ?.projectiles()
      .find((pr) => pr.alive && pr.owner === this.op && Math.sign(me.x - pr.x) === Math.sign(pr.vx) && Math.abs(me.x - pr.x) < 380);
  }
}
