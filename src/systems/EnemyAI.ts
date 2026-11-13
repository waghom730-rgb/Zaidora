import { STAGE_LEFT, STAGE_RIGHT, type Difficulty } from '../config';
import { MOVES, type AttackButton } from '../combat/moves';
import type { Projectile } from '../combat/Projectile';
import { EMPTY_INPUT, type FighterInput } from '../combat/types';
import type { Fighter } from '../entities/Fighter';

interface Profile {
  /** Frames between the player starting an attack and the AI "seeing" it. */
  reaction: number;
  /** Extra random reaction delay (0..jitter) per threat, so the CPU isn't frame-perfect. */
  jitter: number;
  blockChance: number;
  aggression: number;
  /** Chance of continuing each step of a combo after a hit/block connects. */
  comboChance: number;
  antiAir: number;
  jumpiness: number;
  /** How readily energy specials are used (0..1). */
  special: number;
  /** Chance of dashing in (instead of walking) when far away. */
  dash: number;
  /** Chance of evading (backstep) a seen attack instead of blocking it. */
  evade: number;
  /** Chance of deliberately timing a parry against a fireball. */
  parry: number;
  thinkMin: number;
  thinkMax: number;
}

const PROFILES: Record<Difficulty, Profile> = {
  easy: {
    reaction: 24,
    jitter: 10,
    blockChance: 0.15,
    aggression: 0.35,
    comboChance: 0.25,
    antiAir: 0.05,
    jumpiness: 0.05,
    special: 0.25,
    dash: 0.05,
    evade: 0.02,
    parry: 0,
    thinkMin: 30,
    thinkMax: 60,
  },
  normal: {
    reaction: 15,
    jitter: 8,
    blockChance: 0.45,
    aggression: 0.6,
    comboChance: 0.6,
    antiAir: 0.25,
    jumpiness: 0.1,
    special: 0.6,
    dash: 0.25,
    evade: 0.08,
    parry: 0.1,
    thinkMin: 20,
    thinkMax: 45,
  },
  hard: {
    reaction: 9,
    jitter: 8,
    blockChance: 0.75,
    aggression: 0.85,
    comboChance: 0.92,
    antiAir: 0.55,
    jumpiness: 0.12,
    special: 1,
    dash: 0.4,
    evade: 0.15,
    parry: 0.35,
    thinkMin: 12,
    thinkMax: 30,
  },
};

type Plan = 'approach' | 'retreat' | 'hold' | 'jumpIn' | 'dashIn';

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
  /** A fireball we've decided to jump over, once it gets close enough. */
  private jumpTarget: Projectile | null = null;
  /** A fireball we've decided to parry, once it is about to land. */
  private parryTarget: Projectile | null = null;
  /** Reaction delay for the current threat (reaction + random jitter). */
  private delay = 0;
  /** hitSerial of the parry we've already decided whether to counter. */
  private counterFor = -1;

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
    this.jumpTarget = null;
    this.parryTarget = null;
    this.delay = this.p.reaction;
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
    const seenThreat = this.seen[this.seen.length - 1 - this.delay] ?? false;
    if (this.cooldown > 0) this.cooldown--;

    // Just parried: counter-attack at once with the heavy (finishing with the special if affordable).
    if (me.state === 'parry') {
      if (this.counterFor === me.hitSerial) return input;
      this.counterFor = me.hitSerial; // decide once per parry
      if (opHittable && dist < 170 && roll(0.4 + p.aggression * 0.6)) {
        input.heavy = true;
        this.queue = this.canSpecial() && roll(p.special * 0.6) ? ['special'] : [];
      }
      return input;
    }

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

    // Mid-dash: keep holding forward to carry it into a run while still far away.
    if (me.state === 'dash') {
      if (this.plan === 'approach' && dist > 170) input[toward] = true;
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

    // If the thrower follows their fireball in, stop waiting to jump/parry it and defend normally
    // (otherwise the CPU stands unguarded while the opponent rushes in behind the projectile).
    const rushedIn = dist < 230 && (op.state === 'attack' || op.vx * Math.sign(me.x - op.x) > 1);
    if (rushedIn) {
      this.jumpTarget = null;
      this.parryTarget = null;
    }

    // Waiting to parry a fireball: a fresh block press just before it lands.
    if (this.parryTarget) {
      const pr = this.parryTarget;
      const eta = (Math.abs(me.x - pr.x) - pr.w / 2 - 31) / Math.abs(pr.vx);
      if (!pr.alive) {
        this.parryTarget = null;
      } else if (eta <= 3) {
        this.parryTarget = null;
        this.blockTimer = 12; // stays guarding if the timing was off
        input.block = true;
        return input;
      } else {
        return input;
      }
    }

    // Waiting to jump a fireball: go when it's ~190px out (too early or too late gets you hit).
    if (this.jumpTarget) {
      const pr = this.jumpTarget;
      const gap = Math.abs(me.x - pr.x);
      if (!pr.alive || gap < 130) {
        this.jumpTarget = null; // missed the moment — fall back to blocking below
      } else if (gap <= 190) {
        this.jumpTarget = null;
        input.up = true;
        input[toward] = true;
        return input;
      } else {
        return input;
      }
    }

    // Defense.
    if (this.blockTimer > 0) {
      this.blockTimer--;
      if (seenThreat) this.blockTimer = Math.max(this.blockTimer, 6);
      input.block = true;
      return input;
    }
    if (seenThreat && !this.threatHandled) {
      this.threatHandled = true;
      // Plan to jump over an incoming fireball (and come down on the thrower) if there's time.
      if (incoming && Math.abs(me.x - incoming.x) > 200 && roll(p.jumpiness * 3)) {
        this.jumpTarget = incoming;
        return input;
      }
      // Or plan to parry it.
      if (incoming && roll(p.parry)) {
        this.parryTarget = incoming;
        return input;
      }
      // Evade a melee attack with a backstep (not when cornered — there's nowhere to go).
      const cornered = me.x <= STAGE_LEFT + 80 || me.x >= STAGE_RIGHT - 80;
      if (!incoming && !cornered && roll(p.evade)) {
        input.dash = true;
        input[away] = true;
        return input;
      }
      if (roll(p.blockChance)) {
        this.blockTimer = 16;
        input.block = true;
        return input;
      }
    }
    if (!seenThreat) {
      this.threatHandled = false;
      this.delay = p.reaction + randInt(0, p.jitter);
    }

    // Punish a parried attacker or an evade's recovery — big openings, so use the heavy.
    const opOpen =
      op.state === 'parried' || (op.state === 'backdash' && !op.invulnerable && op.stateTime > p.reaction);
    if (opOpen && dist < 160 && this.cooldown === 0 && roll(p.aggression * 0.5)) {
      input.heavy = true;
      this.queue = this.canSpecial() && roll(p.special * 0.5) ? ['special'] : [];
      this.cooldown = 30;
      return input;
    }

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
      case 'dashIn':
        // Dash, then keep holding forward to run in.
        input.dash = true;
        input[toward] = true;
        this.plan = 'approach';
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
      this.plan = r < p.dash ? 'dashIn' : r < 0.8 ? 'approach' : 'hold';
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
        ? [['kick', 'kick'], ['kick', 'heavy']]
        : [
            ['punch', 'punch', 'kick'],
            ['punch', 'punch', 'heavy'],
            ['punch', 'kick'],
            ['punch', 'heavy'],
            ['kick', 'kick'],
            ['punch'],
          ];
    const pick = options[Math.floor(Math.random() * options.length)];
    input[pick[0]] = true;

    this.queue = [];
    for (const b of pick.slice(1)) {
      if (!roll(this.p.comboChance)) break;
      this.queue.push(b);
    }
    // With energy to spare, finish a confirmed combo with the special instead
    // (almost always when the meter is full — sitting on a full bar wastes it).
    const full = !!this.ctx && this.ctx.energy(this.me) >= 100;
    if (this.canSpecial() && roll(this.p.special * (full ? 0.9 : 0.55))) {
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
