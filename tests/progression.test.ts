import { describe, expect, it } from 'vitest';
import {
  LADDER,
  LADDER_CLEAR_COINS,
  applyMatchReport,
  buyItem,
  buyUpgrade,
  equipOutfit,
  fighterMods,
  newSave,
  queueConsumable,
  recordSessionStart,
  sanitizeSave,
  unlockSkill,
  upgradeCost,
  validateReport,
  xpToNext,
  type MatchReport,
  type SaveData,
} from '../shared/progression.js';

const DAY = 86400000;
const T0 = Date.UTC(2026, 10, 13, 12);

function report(p: Partial<MatchReport> = {}): MatchReport {
  return {
    mode: 'versus',
    fighter: 'kaen',
    opponent: 'yoru',
    difficulty: 'normal',
    outcome: 'win',
    stage: null,
    rounds: [2, 1],
    durationSec: 90,
    damageDealt: 180,
    damageTaken: 120,
    maxCombo: 3,
    specials: 2,
    parries: 1,
    blocks: 4,
    perfectRounds: 0,
    moves: { jab: 10, cross: 4 },
    ...p,
  };
}

function apply(save: SaveData, p: Partial<MatchReport>, now = T0) {
  const v = validateReport(report(p));
  if (!v.ok) throw new Error(v.error);
  const r = applyMatchReport(save, v.report, now);
  if (!r.ok) throw new Error(r.error);
  return r;
}

describe('match rewards', () => {
  it('a versus win pays coins and XP by difficulty and records habits', () => {
    const { save, rewards } = apply(newSave(T0), { difficulty: 'hard' });
    expect(rewards.coins).toBe(55);
    expect(rewards.xp).toBe(60);
    expect(save.coins).toBe(55);
    expect(save.stats.matches).toBe(1);
    expect(save.stats.wins).toBe(1);
    expect(save.stats.byFighter.kaen).toEqual({ matches: 1, wins: 1 });
    expect(save.stats.moves.jab).toBe(10);
    expect(save.stats.streakDays).toBe(1);
  });

  it('does not mutate the input save', () => {
    const s = newSave(T0);
    apply(s, {});
    expect(s.coins).toBe(0);
    expect(s.stats.matches).toBe(0);
  });

  it('XP carries over into level-ups that grant skill points', () => {
    let s = newSave(T0);
    let levelUps = 0;
    for (let i = 0; i < 10; i++) {
      const r = apply(s, { difficulty: 'hard' });
      s = r.save;
      levelUps += r.rewards.levelUps;
    }
    expect(levelUps).toBeGreaterThan(0);
    expect(s.level).toBe(1 + levelUps);
    expect(s.skillPoints).toBe(levelUps);
    expect(s.xp).toBeLessThan(xpToNext(s.level));
  });

  it('a Lucky Charm adds 50% coins and is used up', () => {
    let s = { ...newSave(T0), inventory: { energyTonic: 0, luckyCharm: 1 } };
    const q = queueConsumable(s, 'luckyCharm');
    if (!q.ok) throw new Error(q.error);
    s = q.save;
    const { save, rewards } = apply(s, { difficulty: 'easy' });
    expect(rewards.charm).toBe(true);
    expect(rewards.coins).toBe(30); // 20 × 1.5
    expect(save.queued).toEqual([]);
    expect(save.inventory.luckyCharm).toBe(0);
  });
});

describe('arcade ladder and checkpoints', () => {
  const ladder = (s: SaveData, outcome: MatchReport['outcome']) =>
    apply(s, { mode: 'ladder', stage: s.ladder.stage, difficulty: LADDER[s.ladder.stage].difficulty, outcome });

  it('wins advance the stage; reaching a checkpoint saves it and pays its item', () => {
    let s = newSave(T0);
    for (let i = 0; i < 3; i++) s = ladder(s, 'win').save;
    expect(s.ladder.stage).toBe(3);
    expect(s.ladder.checkpoint).toBe(3);
    expect(s.inventory.energyTonic).toBe(2); // 1 starting + 1 for reaching the checkpoint
  });

  it('a loss sends you back to the last checkpoint, not the start', () => {
    let s = newSave(T0);
    for (let i = 0; i < 5; i++) s = ladder(s, 'win').save;
    expect(s.ladder.stage).toBe(5);
    const r = ladder(s, 'lose');
    expect(r.rewards.ladder).toBe('retreat');
    expect(r.save.ladder.stage).toBe(3);
  });

  it('clearing the final stage pays the clear bonus and the fighter outfit, then resets', () => {
    let s = newSave(T0);
    for (let i = 0; i < LADDER.length - 1; i++) s = ladder(s, 'win').save;
    const r = ladder(s, 'win');
    expect(r.rewards.ladder).toBe('clear');
    expect(r.rewards.outfit).toBe('kaenMidnight');
    expect(r.rewards.coins).toBeGreaterThanOrEqual(LADDER_CLEAR_COINS);
    expect(r.save.ladder).toMatchObject({ stage: 0, checkpoint: 0, clears: 1, best: LADDER.length - 1 });
  });

  it('rejects a report for a stage other than the current one (no replaying)', () => {
    const s = newSave(T0);
    const v = validateReport(report({ mode: 'ladder', stage: 4 }));
    if (!v.ok) throw new Error(v.error);
    expect(applyMatchReport(s, v.report).ok).toBe(false);
  });
});

describe('spending', () => {
  it('upgrades cost coins, level up, and cap at max level', () => {
    let s = { ...newSave(T0), coins: 10000 };
    for (let lv = 0; lv < 5; lv++) {
      const r = buyUpgrade(s, 'vitality');
      if (!r.ok) throw new Error(r.error);
      expect(r.save.coins).toBe(s.coins - upgradeCost('vitality', lv));
      s = r.save;
    }
    expect(s.upgrades.vitality).toBe(5);
    expect(buyUpgrade(s, 'vitality').ok).toBe(false);
    expect(fighterMods(s).maxHp).toBe(130);
  });

  it('cannot buy without enough coins', () => {
    const r = buyUpgrade(newSave(T0), 'power');
    expect(r).toEqual({ ok: false, error: `needs ${upgradeCost('power', 0)} coins` });
  });

  it('skills need the level and skill points', () => {
    const s = { ...newSave(T0), skillPoints: 3 };
    expect(unlockSkill(s, 'ironGuard').ok).toBe(false); // needs level 3
    const r = unlockSkill({ ...s, level: 3 }, 'ironGuard');
    if (!r.ok) throw new Error(r.error);
    expect(r.save.skills).toEqual(['ironGuard']);
    expect(r.save.skillPoints).toBe(2);
    expect(unlockSkill(r.save, 'ironGuard').ok).toBe(false);
    expect(fighterMods(r.save).guardEnergyBonus).toBe(4);
  });

  it('outfits are bought once and only equip on their own fighter', () => {
    const s = { ...newSave(T0), coins: 1000 };
    expect(equipOutfit(s, 'kaen', 'kaenMidnight').ok).toBe(false); // not owned
    const b = buyItem(s, 'kaenMidnight');
    if (!b.ok) throw new Error(b.error);
    expect(buyItem(b.save, 'kaenMidnight').ok).toBe(false);
    expect(equipOutfit(b.save, 'yoru', 'kaenMidnight').ok).toBe(false);
    const e = equipOutfit(b.save, 'kaen', 'kaenMidnight');
    if (!e.ok) throw new Error(e.error);
    expect(e.save.outfits.equipped.kaen).toBe('kaenMidnight');
  });

  it('an Energy Tonic gives the next match +50 starting energy', () => {
    const q = queueConsumable(newSave(T0), 'energyTonic');
    if (!q.ok) throw new Error(q.error);
    expect(fighterMods(q.save).matchStartEnergy).toBe(50);
    expect(q.save.inventory.energyTonic).toBe(0);
    expect(queueConsumable(q.save, 'energyTonic').ok).toBe(false);
  });
});

describe('habits and safety', () => {
  it('play streaks count consecutive days and reset after a gap', () => {
    let s = recordSessionStart(newSave(T0), T0);
    s = recordSessionStart(s, T0 + DAY);
    s = recordSessionStart(s, T0 + 2 * DAY);
    expect(s.stats.streakDays).toBe(3);
    s = recordSessionStart(s, T0 + 5 * DAY);
    expect(s.stats.streakDays).toBe(1);
    expect(s.stats.bestStreak).toBe(3);
    expect(s.stats.sessions).toBe(4);
  });

  it('rejects implausible reports', () => {
    expect(validateReport(report({ damageDealt: 1e9 })).ok).toBe(false);
    expect(validateReport(report({ outcome: 'win', rounds: [5, 0] })).ok).toBe(false);
    expect(validateReport({ ...report(), fighter: 'hacker' }).ok).toBe(false);
  });

  it('sanitizes tampered or corrupted saves', () => {
    const bad = {
      coins: -50,
      level: 'nine',
      upgrades: { vitality: 99, power: 2 },
      skills: ['finisher', 'godMode'],
      outfits: { owned: ['kaenMidnight', 'goldSuit'], equipped: { kaen: 'goldSuit', yoru: 'kaenMidnight' } },
      ladder: { stage: 4, checkpoint: 2 },
    };
    const s = sanitizeSave(bad, T0);
    expect(s.coins).toBe(0);
    expect(s.level).toBe(1);
    expect(s.upgrades).toEqual({ vitality: 5, power: 2, focus: 0, resolve: 0 });
    expect(s.skills).toEqual(['finisher']);
    expect(s.outfits.owned).toEqual(['kaenMidnight']);
    expect(s.outfits.equipped).toEqual({ kaen: 'default', yoru: 'default' });
    expect(s.ladder.checkpoint).toBe(0); // stage 2 is not a checkpoint
  });
});
