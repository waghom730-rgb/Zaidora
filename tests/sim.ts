/**
 * Headless match simulation for tests: the same step order as FightScene.step,
 * minus rendering, hitstop and the round/timer flow.
 */
import { CombatManager, type HitEvent } from '../src/combat/CombatManager';
import { EnergyManager } from '../src/combat/EnergyManager';
import { EMPTY_INPUT, type FighterInput } from '../src/combat/types';
import { Fighter } from '../src/entities/Fighter';
import { FIGHTERS, type FighterId } from '../src/entities/fighterDefs';

export type Press = Partial<FighterInput>;

export const input = (p: Press = {}): FighterInput => ({ ...EMPTY_INPUT, ...p });

export class Sim {
  readonly a: Fighter;
  readonly b: Fighter;
  readonly combat: CombatManager;
  readonly energy: EnergyManager;
  readonly hits: HitEvent[] = [];
  time = 0;

  constructor(aId: FighterId = 'kaen', bId: FighterId = 'yoru', ax = 500, bx = 590) {
    this.a = new Fighter(FIGHTERS[aId], ax, 1);
    this.b = new Fighter(FIGHTERS[bId], bx, -1);
    this.a.opponent = this.b;
    this.b.opponent = this.a;
    this.combat = new CombatManager(this.a, this.b);
    this.energy = new EnergyManager([this.a, this.b]);
  }

  /** Advances one logic step. Returns the hits resolved on this step. */
  step(ia: FighterInput = EMPTY_INPUT, ib: FighterInput = EMPTY_INPUT): HitEvent[] {
    this.a.setInput(ia);
    this.b.setInput(ib);
    this.a.update();
    this.b.update();
    this.combat.stepProjectiles();
    this.combat.separate();
    const hits = this.combat.resolveAttacks();
    for (const h of hits) this.energy.onHit(h);
    for (const f of [this.a, this.b]) {
      for (const e of f.events) if (e === 'projectile') this.combat.spawnProjectile(f);
      f.events.length = 0;
    }
    this.combat.pruneProjectiles();
    this.hits.push(...hits);
    this.time++;
    return hits;
  }

  run(steps: number, ia: (t: number) => FighterInput = () => EMPTY_INPUT, ib: (t: number) => FighterInput = () => EMPTY_INPUT): void {
    for (let i = 0; i < steps; i++) this.step(ia(this.time), ib(this.time));
  }
}

/**
 * Attacker presses `buttons` in order, each one as soon as the previous move connects
 * (the way a player hit-confirms a chain). Returns the longest combo reached.
 */
export function playChain(
  sim: Sim,
  attacker: Fighter,
  buttons: Array<keyof FighterInput>,
  defend: (t: number) => FighterInput = () => EMPTY_INPUT,
  steps = 180,
): number {
  let next = 0;
  let pressedSerial = -1;
  let best = 0;
  for (let t = 0; t < steps; t++) {
    const press: Press = {};
    if (next < buttons.length) {
      const ready =
        next === 0
          ? attacker.isActionable()
          : attacker.state === 'attack' && attacker.moveConnected && attacker.moveSerial !== pressedSerial;
      if (ready) {
        press[buttons[next]] = true;
        pressedSerial = attacker.moveSerial;
        next++;
      }
    }
    const atk = input(press);
    if (attacker === sim.a) sim.step(atk, defend(sim.time));
    else sim.step(defend(sim.time), atk);
    best = Math.max(best, attacker.combo);
  }
  return best;
}

/** Deterministic Math.random replacement (mulberry32). */
export function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
