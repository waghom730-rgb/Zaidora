import { afterEach, describe, expect, it, vi } from 'vitest';
import { STAGE_LEFT, STAGE_RIGHT, type Difficulty } from '../src/config';
import type { FighterId } from '../src/entities/fighterDefs';
import { EnemyAI } from '../src/systems/EnemyAI';
import { Sim, seededRandom } from './sim';

interface RoundResult {
  winner: 'a' | 'b' | 'draw';
  /** Fighter states seen, per side. */
  statesA: Set<string>;
  statesB: Set<string>;
  movesA: Set<string>;
  movesB: Set<string>;
}

/** One CPU-vs-CPU round (60 s max), deterministic for a given seed. */
function cpuRound(seed: number, da: Difficulty, db: Difficulty, ia: FighterId, ib: FighterId): RoundResult {
  vi.spyOn(Math, 'random').mockImplementation(seededRandom(seed));
  const sim = new Sim(ia, ib, 440, 840);
  const ctx = { energy: (f: Parameters<typeof sim.energy.get>[0]) => sim.energy.get(f), projectiles: () => sim.combat.projectiles };
  const aiA = new EnemyAI(sim.a, sim.b, da, ctx);
  const aiB = new EnemyAI(sim.b, sim.a, db, ctx);
  const res: RoundResult = { winner: 'draw', statesA: new Set(), statesB: new Set(), movesA: new Set(), movesB: new Set() };
  for (let t = 0; t < 60 * 60; t++) {
    sim.step(aiA.getInput(), aiB.getInput());
    for (const f of [sim.a, sim.b]) {
      expect(Number.isFinite(f.x) && Number.isFinite(f.y) && Number.isFinite(f.hp)).toBe(true);
      expect(f.x).toBeGreaterThanOrEqual(STAGE_LEFT);
      expect(f.x).toBeLessThanOrEqual(STAGE_RIGHT);
    }
    res.statesA.add(sim.a.state);
    res.statesB.add(sim.b.state);
    if (sim.a.move) res.movesA.add(sim.a.move.id);
    if (sim.b.move) res.movesB.add(sim.b.move.id);
    if (sim.a.hp <= 0 || sim.b.hp <= 0) break;
  }
  res.winner = sim.a.hp === sim.b.hp ? 'draw' : sim.a.hp > sim.b.hp ? 'a' : 'b';
  vi.restoreAllMocks();
  return res;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('CPU opponent', () => {
  it('plays full rounds on every difficulty without breaking the simulation', () => {
    for (const d of ['easy', 'normal', 'hard'] as const) {
      for (const seed of [1, 2]) cpuRound(seed, d, d, 'kaen', 'yoru');
    }
  });

  it('difficulty matters: Hard beats Easy in most rounds (both characters)', () => {
    let hardWins = 0;
    let rounds = 0;
    for (let seed = 1; seed <= 10; seed++) {
      for (const [ia, ib] of [
        ['kaen', 'yoru'],
        ['yoru', 'kaen'],
      ] as const) {
        if (cpuRound(seed, 'hard', 'easy', ia, ib).winner === 'a') hardWins++;
        rounds++;
      }
    }
    expect(hardWins / rounds).toBeGreaterThanOrEqual(0.75);
  });

  it('Normal beats Easy more often than not', () => {
    let wins = 0;
    for (let seed = 1; seed <= 10; seed++) if (cpuRound(seed, 'normal', 'easy', 'kaen', 'yoru').winner === 'a') wins++;
    expect(wins).toBeGreaterThanOrEqual(6);
  });

  it('Hard uses the new tools: heavies, dashes, and its special', () => {
    const states = new Set<string>();
    const moves = new Set<string>();
    for (let seed = 1; seed <= 6; seed++) {
      for (const [ia, ib] of [
        ['kaen', 'yoru'],
        ['yoru', 'kaen'],
      ] as const) {
        const r = cpuRound(seed, 'hard', 'hard', ia, ib);
        r.statesA.forEach((s) => states.add(s));
        r.movesA.forEach((m) => moves.add(m));
      }
    }
    expect(moves).toContain('flameStrike');
    expect(moves).toContain('shadowSlash');
    expect(moves).toContain('fireball');
    expect(moves).toContain('shadowDash');
    expect(states).toContain('dash');
    expect(states).toContain('run');
  });
});
