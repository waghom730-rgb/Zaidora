import { describe, expect, it } from 'vitest';
import { MOVES, type MoveId } from '../src/combat/moves';
import { EMPTY_INPUT, type FighterInput } from '../src/combat/types';
import { PHYS, STAGE_RIGHT } from '../src/config';
import { FIGHTER_IDS, FIGHTERS, type FighterId } from '../src/entities/fighterDefs';
import { Sim, input, playChain } from './sim';

const pairs: Array<[FighterId, FighterId]> = [
  ['kaen', 'yoru'],
  ['yoru', 'kaen'],
];

describe('chain combos', () => {
  const routes: Array<[string, Array<keyof FighterInput>, number]> = [
    ['J, J, K', ['punch', 'punch', 'kick'], 3],
    ['J, J, U', ['punch', 'punch', 'heavy'], 3],
    ['J, U', ['punch', 'heavy'], 2],
    ['K, U', ['kick', 'heavy'], 2],
    ['K, K', ['kick', 'kick'], 2],
  ];
  for (const [me, them] of pairs) {
    for (const [name, buttons, hits] of routes) {
      it(`${me}: ${name} lands all ${hits} hits`, () => {
        const sim = new Sim(me, them);
        expect(playChain(sim, sim.a, buttons)).toBe(hits);
      });
    }
    it(`${me}: J, J, U, L (special finisher) lands 4 hits with energy`, () => {
      const sim = new Sim(me, them);
      sim.energy.add(sim.a, 100);
      expect(playChain(sim, sim.a, ['punch', 'punch', 'heavy', 'special'])).toBe(4);
    });
  }
});

describe('no infinites', () => {
  // After any single hit, a jab pressed on the attacker's first free frame must not
  // combo if the defender holds block as soon as it can: nothing links into itself.
  const grounded = (id: FighterId): MoveId[] => ['jab', 'cross', 'frontKick', 'roundhouse', FIGHTERS[id].heavy];
  for (const [me, them] of pairs) {
    for (const id of grounded(me)) {
      it(`${me}: nothing links after ${id}`, () => {
        const sim = new Sim(me, them);
        const a = sim.a;
        const b = sim.b;
        let hitOnce = false;
        let followUps = 0;
        // Start the move directly, as if pressed (cross / roundhouse are chain-only).
        (a as unknown as { startMove(m: unknown): void }).startMove(MOVES[id]);
        for (let t = 0; t < 240; t++) {
          const jab = a.isActionable() && hitOnce && followUps < 6;
          if (jab) followUps++;
          const hits = sim.step(input({ punch: jab }), input({ block: hitOnce }));
          for (const h of hits) {
            if (h.attacker !== a) continue;
            if (!hitOnce) hitOnce = !h.blocked;
            else expect(h.blocked, `follow-up hit after ${id} at t=${t}`).toBe(true);
          }
        }
        expect(hitOnce).toBe(true);
        expect(b.hp).toBe(100 - MOVES[id].damage);
      });
    }
  }

  it('the longest possible chain is short (brute force, full energy)', () => {
    const buttons: Array<keyof FighterInput> = ['punch', 'kick', 'heavy', 'special'];
    let longest = 0;
    const seqs: Array<Array<keyof FighterInput>> = [[]];
    for (let len = 0; len < 5; len++) {
      for (const s of seqs.filter((q) => q.length === len)) for (const b of buttons) seqs.push([...s, b]);
    }
    for (const id of FIGHTER_IDS) {
      for (const seq of seqs.filter((q) => q.length > 0)) {
        const sim = new Sim(id, id === 'kaen' ? 'yoru' : 'kaen');
        sim.energy.add(sim.a, 100);
        longest = Math.max(longest, playChain(sim, sim.a, seq));
      }
    }
    expect(longest).toBeLessThanOrEqual(4);
  });
});

describe('heavy attacks (U)', () => {
  for (const id of FIGHTER_IDS) {
    const heavy = MOVES[FIGHTERS[id].heavy];
    it(`${id}: ${heavy.name} is a big hit with a heavy reaction`, () => {
      const sim = new Sim(id, id === 'kaen' ? 'yoru' : 'kaen');
      sim.run(40, (t) => input({ heavy: t === 0 }));
      expect(sim.b.hp).toBe(100 - heavy.damage);
      expect(sim.b.lastHitHeavy).toBe(true);
    });

    it(`${id}: ${heavy.name} is punishable on block`, () => {
      const sim = new Sim(id, id === 'kaen' ? 'yoru' : 'kaen');
      let blockedAt = -1;
      let defenderFree = -1;
      let attackerFree = -1;
      for (let t = 0; t < 80; t++) {
        const hits = sim.step(input({ heavy: t === 0 }), input({ block: true }));
        if (hits.some((h) => h.blocked)) blockedAt = t;
        if (blockedAt >= 0 && defenderFree < 0 && sim.b.state !== 'blockstun') defenderFree = t;
        if (blockedAt >= 0 && attackerFree < 0 && sim.a.isActionable()) attackerFree = t;
      }
      expect(blockedAt).toBeGreaterThan(0);
      // Defender recovers well before the attacker: at least a jab's startup of advantage.
      expect(attackerFree - defenderFree).toBeGreaterThanOrEqual(MOVES.jab.startup + 4);
    });
  }
});

describe('parry', () => {
  const heavyAt = (t: number) => input({ heavy: t === 0 });

  it('a fresh block press just before impact parries: no damage, attacker staggered', () => {
    const sim = new Sim('kaen', 'yoru');
    // Flame Strike becomes active on step 13; Yoru taps block on step 10.
    sim.run(20, heavyAt, (t) => input({ block: t >= 10 }));
    const parry = sim.hits.find((h) => h.parried);
    expect(parry).toBeDefined();
    expect(sim.b.hp).toBe(100);
    expect(sim.a.state).toBe('parried');
    expect(sim.energy.get(sim.b)).toBeGreaterThan(0);
    expect(sim.energy.get(sim.a)).toBe(0);
  });

  it('the parried attacker eats a counter hit with bonus damage', () => {
    const sim = new Sim('kaen', 'yoru');
    sim.run(20, heavyAt, (t) => input({ block: t >= 10 && t < 16, heavy: t === 16 }));
    sim.run(40);
    const counter = sim.hits.find((h) => h.attacker === sim.b && !h.blocked);
    expect(counter?.counter).toBe(true);
    const slash = MOVES.shadowSlash;
    expect(sim.a.hp).toBe(100 - Math.round(slash.damage * PHYS.counterDamage));
  });

  it('holding block early is a normal block, not a parry', () => {
    const sim = new Sim('kaen', 'yoru');
    sim.run(20, heavyAt, () => input({ block: true }));
    expect(sim.hits.some((h) => h.parried)).toBe(false);
    expect(sim.hits.some((h) => h.blocked)).toBe(true);
    expect(sim.a.state).not.toBe('parried');
  });

  it('mashing block does not keep the parry window open', () => {
    const sim = new Sim('kaen', 'yoru');
    // Presses on steps 0, 3, 6, 9, 12 — only the first can open a window, and it expires before step 13.
    sim.run(20, heavyAt, (t) => input({ block: t % 3 === 0 || t >= 12 }));
    expect(sim.hits.some((h) => h.parried)).toBe(false);
  });

  it('a fireball can be parried and is destroyed', () => {
    const sim = new Sim('kaen', 'yoru', 400, 700);
    sim.energy.add(sim.a, 100);
    let parried = false;
    for (let t = 0; t < 90 && !parried; t++) {
      const pr = sim.combat.projectiles.find((p) => p.alive);
      // Tap block when the fireball is ~2 steps from Yoru's body.
      const tap = !!pr && Math.abs(sim.b.x - pr.x) - pr.w / 2 - 31 < 2 * Math.abs(pr.vx);
      const hits = sim.step(input({ special: t === 0 }), input({ block: tap }));
      parried = hits.some((h) => h.parried && h.projectile);
    }
    expect(parried).toBe(true);
    expect(sim.b.hp).toBe(100);
    expect(sim.combat.projectiles.filter((p) => p.alive)).toHaveLength(0);
  });
});

describe('movement', () => {
  it('forward dash covers ground and stops when forward is released', () => {
    const sim = new Sim('kaen', 'yoru', 300, 1000);
    const x0 = sim.a.x;
    sim.run(30, (t) => input({ dash: t === 0, right: t === 0 }));
    expect(sim.a.x - x0).toBeGreaterThan(80);
    expect(sim.a.x - x0).toBeLessThan(140);
    expect(sim.a.state).toBe('idle');
  });

  it('holding forward after a dash turns into a run', () => {
    const sim = new Sim('kaen', 'yoru', 200, 1100);
    sim.run(PHYS.dashFrames + 4, (t) => input({ dash: t === 0, right: true }));
    expect(sim.a.state).toBe('run');
    const x = sim.a.x;
    sim.run(10, () => input({ right: true }));
    expect(sim.a.x - x).toBeCloseTo(PHYS.runSpeed * 10, 0);
  });

  it('a running jump goes further than a standing jump', () => {
    const dist = (run: boolean): number => {
      const sim = new Sim('yoru', 'kaen', 150, 1150);
      if (run) sim.run(PHYS.dashFrames + 2, (t) => input({ dash: t === 0, right: true }));
      const x0 = sim.a.x;
      sim.run(4, () => input({ up: true, right: true }));
      while (sim.a.state !== 'land' && sim.time < 300) sim.step(input({ right: true }));
      return sim.a.x - x0;
    };
    expect(dist(true)).toBeGreaterThan(dist(false) + 40);
  });

  it('evade (Space, no direction) backs off and is invulnerable at first', () => {
    const sim = new Sim('kaen', 'yoru');
    const x0 = sim.b.x;
    // Yoru evades on step 0; Kaen's jab would connect on step 4.
    sim.run(30, (t) => input({ punch: t === 1 }), (t) => input({ dash: t === 0 }));
    expect(sim.hits).toHaveLength(0);
    expect(sim.b.hp).toBe(100);
    expect(sim.b.x - x0).toBeGreaterThan(70);
  });

  it('evade is invulnerable even with no room to move (back to the wall)', () => {
    const sim = new Sim('kaen', 'yoru', STAGE_RIGHT - 90, STAGE_RIGHT);
    sim.run(12, (t) => input({ punch: t === 1 }), (t) => input({ dash: t === 0 }));
    expect(sim.b.x).toBe(STAGE_RIGHT);
    expect(sim.hits).toHaveLength(0);
    // Without the evade, the same jab connects.
    const control = new Sim('kaen', 'yoru', STAGE_RIGHT - 90, STAGE_RIGHT);
    control.run(12, (t) => input({ punch: t === 1 }));
    expect(control.hits).toHaveLength(1);
  });

  it("hitting an evade's recovery is a counter hit", () => {
    const sim = new Sim('kaen', 'yoru');
    sim.b.setState('backdash');
    sim.b.stateTime = PHYS.backdashInvulnFrames + 2;
    const out = sim.b.receiveHit(MOVES.jab, sim.a);
    expect(out).toEqual({ kind: 'hit', counter: true });
  });

  it('attacks out of a run keep some momentum', () => {
    const travel = (run: boolean): number => {
      const sim = new Sim('kaen', 'yoru', 150, 1150);
      if (run) sim.run(PHYS.dashFrames + 6, (t) => input({ dash: t === 0, right: true }));
      const x0 = sim.a.x;
      sim.run(12, (t) => input({ punch: t === sim.time && t === (run ? PHYS.dashFrames + 6 : 0) }));
      return sim.a.x - x0;
    };
    expect(travel(true)).toBeGreaterThan(travel(false) + 15);
  });
});

describe('inputs', () => {
  it('EMPTY_INPUT has every action released', () => {
    expect(Object.values(EMPTY_INPUT).every((v) => v === false)).toBe(true);
    expect(Object.keys(EMPTY_INPUT).sort()).toEqual(
      ['block', 'dash', 'heavy', 'kick', 'left', 'punch', 'right', 'special', 'up'].sort(),
    );
  });
});
