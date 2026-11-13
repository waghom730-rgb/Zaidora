import type { Fighter } from '../entities/Fighter';
import type { HitEvent } from './CombatManager';

/** All energy tuning in one place. Per-move gains live in moves.ts (energyGain). */
export const ENERGY_RULES = {
  max: 100,
  /** Share of a move's energyGain the attacker still earns when it is blocked. */
  blockedGainRatio: 0.4,
  /** Reward for successfully blocking an attack (well-timed defence). */
  guardGain: 4,
  /** Reward for a parry — the riskiest, best-timed defence. */
  parryGain: 12,
} as const;

/**
 * Owns every fighter's energy. Energy is earned only by landing attacks and by
 * blocking — never by waiting or whiffing — and is spent on specials.
 * Energy carries over between rounds of a match.
 */
export class EnergyManager {
  private readonly values = new Map<Fighter, number>();

  constructor(fighters: Fighter[]) {
    for (const f of fighters) {
      this.values.set(f, 0);
      f.spendEnergy = (cost: number) => this.trySpend(f, cost);
    }
  }

  get(f: Fighter): number {
    return this.values.get(f) ?? 0;
  }

  add(f: Fighter, amount: number): void {
    this.values.set(f, Math.min(ENERGY_RULES.max, Math.max(0, this.get(f) + amount)));
  }

  /** Pays `cost` if affordable. Returns false (and spends nothing) otherwise. */
  trySpend(f: Fighter, cost: number): boolean {
    if (this.get(f) < cost) return false;
    this.add(f, -cost);
    return true;
  }

  onHit(h: HitEvent): void {
    if (h.parried) {
      // A parried attack earns its thrower nothing.
      this.add(h.defender, ENERGY_RULES.parryGain);
    } else if (h.blocked) {
      this.add(h.attacker, h.move.energyGain * ENERGY_RULES.blockedGainRatio);
      this.add(h.defender, ENERGY_RULES.guardGain);
    } else {
      this.add(h.attacker, h.move.energyGain);
    }
  }
}
