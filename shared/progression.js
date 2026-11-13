// ZAIKORA progression rules — one source of truth shared by the game (guest saves kept in
// the browser) and the server (accounts stored in MongoDB, where the server is authoritative).
// Everything here is a pure function over plain JSON, so it is easy to test and to trust.

export const SAVE_VERSION = 1;
export const FIGHTER_IDS = ['kaen', 'yoru'];
export const DIFFICULTIES = ['easy', 'normal', 'hard'];
export const MODES = ['ladder', 'versus'];
export const OUTCOMES = ['win', 'lose', 'draw'];
export const MOVE_IDS = [
  'jab', 'cross', 'frontKick', 'roundhouse', 'airPunch', 'airKick',
  'flameStrike', 'shadowSlash', 'fireball', 'shadowDash',
];

/**
 * Arcade Ladder: ten fights of rising difficulty. Checkpoint stages are where you restart
 * after a loss; reaching some of them pays out an item. The CPU gets tougher via health and
 * damage multipliers on top of its difficulty profile.
 */
export const LADDER = [
  { name: 'First Bow', difficulty: 'easy', checkpoint: true, cpu: { hp: 1, damage: 1 } },
  { name: 'Sparring Partner', difficulty: 'easy', cpu: { hp: 1.05, damage: 1 } },
  { name: 'Temple Steps', difficulty: 'normal', cpu: { hp: 1, damage: 1 } },
  { name: 'Lantern Duel', difficulty: 'normal', checkpoint: true, cpu: { hp: 1.05, damage: 1.05 }, reach: { item: 'energyTonic', qty: 1 } },
  { name: 'Petal Storm', difficulty: 'normal', cpu: { hp: 1.1, damage: 1.05 } },
  { name: 'Iron Gate', difficulty: 'hard', cpu: { hp: 1, damage: 1 } },
  { name: 'Moonlit Rooftop', difficulty: 'hard', checkpoint: true, cpu: { hp: 1.1, damage: 1.05 }, reach: { item: 'luckyCharm', qty: 1 } },
  { name: 'Ember Trial', difficulty: 'hard', cpu: { hp: 1.15, damage: 1.1 } },
  { name: 'Shadow Trial', difficulty: 'hard', cpu: { hp: 1.2, damage: 1.1 } },
  { name: 'Master of the Arena', difficulty: 'hard', checkpoint: true, boss: true, cpu: { hp: 1.3, damage: 1.15 } },
];
export const LADDER_CLEAR_COINS = 300;

export const UPGRADES = {
  vitality: { name: 'Vitality', desc: '+6 max health per level', maxLevel: 5, baseCost: 60 },
  power: { name: 'Power', desc: '+4% damage per level', maxLevel: 5, baseCost: 80 },
  focus: { name: 'Focus', desc: '+12% energy gained per level', maxLevel: 5, baseCost: 70 },
  resolve: { name: 'Resolve', desc: 'Start every round with +8 energy per level', maxLevel: 5, baseCost: 70 },
};

export const SKILLS = {
  secondWind: { name: 'Second Wind', desc: 'Once per round, recover 15 health when it drops below 25%', level: 2, cost: 1 },
  ironGuard: { name: 'Iron Guard', desc: 'Blocking an attack gives +4 extra energy', level: 3, cost: 1 },
  parryMaster: { name: 'Parry Master', desc: 'Parries give +10 extra energy', level: 4, cost: 1 },
  finisher: { name: 'Finisher', desc: 'Your special deals 20% more damage', level: 5, cost: 2 },
  counterInstinct: { name: 'Counter Instinct', desc: 'Counter hits deal 15% more damage', level: 6, cost: 2 },
};

export const ITEMS = {
  energyTonic: { kind: 'consumable', name: 'Energy Tonic', desc: 'Start your next match with +50 energy', price: 90 },
  luckyCharm: { kind: 'consumable', name: 'Lucky Charm', desc: '+50% coins from your next match', price: 120 },
  kaenMidnight: { kind: 'outfit', fighter: 'kaen', name: 'Midnight Gi', desc: 'Kaen in midnight blue and silver', price: 400 },
  yoruCrimson: { kind: 'outfit', fighter: 'yoru', name: 'Crimson Shade', desc: 'Yoru in blood red and black', price: 400 },
};
/** Outfit earned by clearing the ladder with each fighter. */
export const CLEAR_OUTFIT = { kaen: 'kaenMidnight', yoru: 'yoruCrimson' };

const MAX_STACK = 99;

// ------------------------------------------------------------------ helpers

const clone = (o) => JSON.parse(JSON.stringify(o));
const isInt = (n) => Number.isInteger(n);
const clampInt = (n, lo, hi, fallback = lo) => (isInt(n) ? Math.min(hi, Math.max(lo, n)) : fallback);
const clampNum = (n, lo, hi, fallback = lo) => (typeof n === 'number' && Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback);
const fail = (error) => ({ ok: false, error });

/** Calendar day (UTC) used for play streaks. */
export const dayKey = (ms) => new Date(ms).toISOString().slice(0, 10);

/** XP needed to go from `level` to `level + 1`. */
export const xpToNext = (level) => 80 + 40 * level;

export const upgradeCost = (id, level) => Math.round(UPGRADES[id].baseCost * Math.pow(level + 1, 1.5));

const record = () => ({ matches: 0, wins: 0 });

function newStats() {
  return {
    matches: 0, wins: 0, losses: 0, draws: 0,
    roundsWon: 0, roundsLost: 0, perfectRounds: 0,
    byFighter: Object.fromEntries(FIGHTER_IDS.map((f) => [f, record()])),
    byDifficulty: Object.fromEntries(DIFFICULTIES.map((d) => [d, record()])),
    byMode: Object.fromEntries(MODES.map((m) => [m, record()])),
    damageDealt: 0, damageTaken: 0, maxCombo: 0,
    specials: 0, parries: 0, blocks: 0,
    moves: {},
    playTimeSec: 0,
    sessions: 0, sessionTimeSec: 0,
    streakDays: 0, bestStreak: 0, lastPlayedDay: null, lastPlayedAt: null,
    coinsEarned: 0, coinsSpent: 0,
  };
}

export function newSave(now = Date.now()) {
  return {
    version: SAVE_VERSION,
    level: 1,
    xp: 0,
    coins: 0,
    skillPoints: 0,
    ladder: { stage: 0, checkpoint: 0, best: 0, clears: 0 },
    upgrades: Object.fromEntries(Object.keys(UPGRADES).map((k) => [k, 0])),
    skills: [],
    inventory: { energyTonic: 1, luckyCharm: 0 },
    outfits: { owned: [], equipped: Object.fromEntries(FIGHTER_IDS.map((f) => [f, 'default'])) },
    queued: [],
    settings: { difficulty: 'normal', muted: false },
    stats: newStats(),
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Rebuilds a save from untrusted JSON (localStorage, database, older versions): every field is
 * type-checked and clamped, unknown ids are dropped, missing fields get defaults.
 */
export function sanitizeSave(raw, now = Date.now()) {
  const base = newSave(now);
  if (!raw || typeof raw !== 'object') return base;
  const s = base;
  s.level = clampInt(raw.level, 1, 999, 1);
  s.xp = clampInt(raw.xp, 0, 1e9, 0);
  s.coins = clampInt(raw.coins, 0, 1e9, 0);
  s.skillPoints = clampInt(raw.skillPoints, 0, 999, 0);

  const L = raw.ladder ?? {};
  const last = LADDER.length - 1;
  s.ladder.stage = clampInt(L.stage, 0, last, 0);
  s.ladder.checkpoint = clampInt(L.checkpoint, 0, last, 0);
  if (!LADDER[s.ladder.checkpoint].checkpoint || s.ladder.checkpoint > s.ladder.stage) s.ladder.checkpoint = 0;
  s.ladder.best = clampInt(L.best, 0, last, 0);
  s.ladder.clears = clampInt(L.clears, 0, 1e6, 0);

  for (const k of Object.keys(UPGRADES)) s.upgrades[k] = clampInt(raw.upgrades?.[k], 0, UPGRADES[k].maxLevel, 0);
  s.skills = Array.isArray(raw.skills) ? [...new Set(raw.skills.filter((k) => k in SKILLS))] : [];

  for (const [id, item] of Object.entries(ITEMS)) {
    if (item.kind === 'consumable') s.inventory[id] = clampInt(raw.inventory?.[id], 0, MAX_STACK, s.inventory[id] ?? 0);
  }
  const owned = Array.isArray(raw.outfits?.owned) ? raw.outfits.owned : [];
  s.outfits.owned = [...new Set(owned.filter((id) => ITEMS[id]?.kind === 'outfit'))];
  for (const f of FIGHTER_IDS) {
    const eq = raw.outfits?.equipped?.[f];
    s.outfits.equipped[f] = eq && s.outfits.owned.includes(eq) && ITEMS[eq].fighter === f ? eq : 'default';
  }
  s.queued = Array.isArray(raw.queued) ? [...new Set(raw.queued.filter((id) => ITEMS[id]?.kind === 'consumable'))] : [];

  if (DIFFICULTIES.includes(raw.settings?.difficulty)) s.settings.difficulty = raw.settings.difficulty;
  s.settings.muted = raw.settings?.muted === true;

  const st = raw.stats ?? {};
  const n = (v) => clampNum(v, 0, 1e12, 0);
  for (const k of ['matches', 'wins', 'losses', 'draws', 'roundsWon', 'roundsLost', 'perfectRounds', 'damageDealt', 'damageTaken', 'specials', 'parries', 'blocks', 'playTimeSec', 'sessions', 'sessionTimeSec', 'streakDays', 'bestStreak', 'coinsEarned', 'coinsSpent']) {
    s.stats[k] = n(st[k]);
  }
  s.stats.maxCombo = clampInt(st.maxCombo, 0, 99, 0);
  for (const [group, keys] of [['byFighter', FIGHTER_IDS], ['byDifficulty', DIFFICULTIES], ['byMode', MODES]]) {
    for (const k of keys) s.stats[group][k] = { matches: n(st[group]?.[k]?.matches), wins: n(st[group]?.[k]?.wins) };
  }
  for (const id of MOVE_IDS) if (st.moves?.[id]) s.stats.moves[id] = n(st.moves[id]);
  s.stats.lastPlayedDay = typeof st.lastPlayedDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(st.lastPlayedDay) ? st.lastPlayedDay : null;
  s.stats.lastPlayedAt = typeof st.lastPlayedAt === 'number' ? st.lastPlayedAt : null;

  s.createdAt = typeof raw.createdAt === 'number' ? raw.createdAt : now;
  s.updatedAt = typeof raw.updatedAt === 'number' ? raw.updatedAt : now;
  return s;
}

/** Combat modifiers for the player's fighter, from upgrades, skills and queued consumables. */
export function fighterMods(save) {
  const u = save.upgrades;
  const has = (k) => save.skills.includes(k);
  return {
    maxHp: 100 + 6 * u.vitality,
    damageMult: 1 + 0.04 * u.power,
    energyGainMult: 1 + 0.12 * u.focus,
    roundStartEnergy: 8 * u.resolve,
    matchStartEnergy: save.queued.includes('energyTonic') ? 50 : 0,
    guardEnergyBonus: has('ironGuard') ? 4 : 0,
    parryEnergyBonus: has('parryMaster') ? 10 : 0,
    specialDamageMult: has('finisher') ? 1.2 : 1,
    counterDamageMult: has('counterInstinct') ? 1.15 : 1,
    secondWind: has('secondWind'),
  };
}

/** Modifiers for the CPU on a ladder stage. */
export function ladderCpuMods(stage) {
  const cpu = LADDER[stage]?.cpu ?? { hp: 1, damage: 1 };
  return { ...BASE_MODS, maxHp: Math.round(100 * cpu.hp), damageMult: cpu.damage };
}

export const BASE_MODS = Object.freeze({
  maxHp: 100,
  damageMult: 1,
  energyGainMult: 1,
  roundStartEnergy: 0,
  matchStartEnergy: 0,
  guardEnergyBonus: 0,
  parryEnergyBonus: 0,
  specialDamageMult: 1,
  counterDamageMult: 1,
  secondWind: false,
});

// ------------------------------------------------------------------ match results

/**
 * Checks a match report sent by the game. Values outside plausible ranges are rejected,
 * unknown move ids are dropped. Returns { ok, report } or { ok: false, error }.
 */
export function validateReport(r) {
  if (!r || typeof r !== 'object') return fail('missing report');
  if (!MODES.includes(r.mode)) return fail('bad mode');
  if (!FIGHTER_IDS.includes(r.fighter) || !FIGHTER_IDS.includes(r.opponent)) return fail('bad fighter');
  if (!DIFFICULTIES.includes(r.difficulty)) return fail('bad difficulty');
  if (!OUTCOMES.includes(r.outcome)) return fail('bad outcome');
  if (!Array.isArray(r.rounds) || r.rounds.length !== 2 || !r.rounds.every((n) => isInt(n) && n >= 0 && n <= 3)) return fail('bad rounds');
  if (r.mode === 'ladder' && !(isInt(r.stage) && r.stage >= 0 && r.stage < LADDER.length)) return fail('bad stage');
  const num = (v, hi) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= hi;
  for (const [k, hi] of [['durationSec', 1800], ['damageDealt', 2000], ['damageTaken', 2000], ['maxCombo', 30], ['specials', 500], ['parries', 500], ['blocks', 2000], ['perfectRounds', 3]]) {
    if (!num(r[k], hi)) return fail(`bad ${k}`);
  }
  const moves = {};
  if (r.moves && typeof r.moves === 'object') {
    for (const id of MOVE_IDS) if (num(r.moves[id], 2000) && r.moves[id] > 0) moves[id] = Math.round(r.moves[id]);
  }
  return {
    ok: true,
    report: {
      mode: r.mode, fighter: r.fighter, opponent: r.opponent, difficulty: r.difficulty, outcome: r.outcome,
      stage: r.mode === 'ladder' ? r.stage : null,
      rounds: [r.rounds[0], r.rounds[1]],
      durationSec: Math.round(r.durationSec),
      damageDealt: Math.round(r.damageDealt), damageTaken: Math.round(r.damageTaken),
      maxCombo: Math.round(r.maxCombo), specials: Math.round(r.specials), parries: Math.round(r.parries),
      blocks: Math.round(r.blocks), perfectRounds: Math.round(r.perfectRounds), moves,
    },
  };
}

function touchDay(stats, now) {
  const today = dayKey(now);
  if (stats.lastPlayedDay !== today) {
    const yesterday = dayKey(now - 86400000);
    stats.streakDays = stats.lastPlayedDay === yesterday ? stats.streakDays + 1 : 1;
    stats.bestStreak = Math.max(stats.bestStreak, stats.streakDays);
    stats.lastPlayedDay = today;
  }
  stats.lastPlayedAt = now;
}

function grantXp(s, xp, rewards) {
  s.xp += xp;
  while (s.xp >= xpToNext(s.level)) {
    s.xp -= xpToNext(s.level);
    s.level++;
    s.skillPoints++;
    rewards.levelUps++;
    rewards.skillPoints++;
  }
}

/**
 * Applies a validated match report: rewards, level-ups, ladder progress and checkpoints,
 * consumed items, and habit statistics. Returns { save, rewards } without mutating input.
 * For a ladder match the report must be for the save's current stage.
 */
export function applyMatchReport(save, report, now = Date.now()) {
  const s = clone(save);
  const r = report;
  if (r.mode === 'ladder' && r.stage !== s.ladder.stage) return fail('stale ladder stage');

  const rewards = {
    coins: 0, xp: 0, levelUps: 0, skillPoints: 0,
    items: [], outfit: null, checkpoint: null, ladder: null, charm: false,
  };
  const win = r.outcome === 'win';
  const dIdx = DIFFICULTIES.indexOf(r.difficulty);

  // Coins and XP.
  let coins;
  let xp;
  if (r.mode === 'ladder') {
    coins = win ? 30 + 15 * r.stage : r.outcome === 'draw' ? 10 : 5;
    xp = win ? 50 + 10 * r.stage : r.outcome === 'draw' ? 20 : 15;
  } else {
    coins = win ? [20, 35, 55][dIdx] : r.outcome === 'draw' ? 10 : 5;
    xp = win ? 30 + 15 * dIdx : r.outcome === 'draw' ? 20 : 15;
  }
  coins += 10 * r.perfectRounds;
  xp += 5 * r.perfectRounds;

  // Ladder progress.
  if (r.mode === 'ladder') {
    const L = s.ladder;
    if (win && r.stage === LADDER.length - 1) {
      L.clears++;
      L.best = LADDER.length - 1;
      L.stage = 0;
      L.checkpoint = 0;
      rewards.ladder = 'clear';
      coins += LADDER_CLEAR_COINS;
      const outfit = CLEAR_OUTFIT[r.fighter];
      if (outfit && !s.outfits.owned.includes(outfit)) {
        s.outfits.owned.push(outfit);
        rewards.outfit = outfit;
      }
    } else if (win) {
      L.stage++;
      L.best = Math.max(L.best, L.stage);
      rewards.ladder = 'advance';
      const next = LADDER[L.stage];
      if (next.checkpoint) {
        L.checkpoint = L.stage;
        rewards.checkpoint = L.stage;
        if (next.reach) {
          s.inventory[next.reach.item] = Math.min(MAX_STACK, (s.inventory[next.reach.item] ?? 0) + next.reach.qty);
          rewards.items.push({ id: next.reach.item, qty: next.reach.qty });
        }
      }
    } else {
      L.stage = L.checkpoint;
      rewards.ladder = 'retreat';
    }
  }

  // Queued consumables are used up by playing the match.
  if (s.queued.includes('luckyCharm')) {
    coins = Math.round(coins * 1.5);
    rewards.charm = true;
  }
  s.queued = [];

  s.coins += coins;
  rewards.coins = coins;
  rewards.xp = xp;
  grantXp(s, xp, rewards);

  // Habits.
  const st = s.stats;
  st.matches++;
  if (win) st.wins++;
  else if (r.outcome === 'lose') st.losses++;
  else st.draws++;
  st.roundsWon += r.rounds[0];
  st.roundsLost += r.rounds[1];
  st.perfectRounds += r.perfectRounds;
  for (const [group, key] of [['byFighter', r.fighter], ['byDifficulty', r.difficulty], ['byMode', r.mode]]) {
    st[group][key].matches++;
    if (win) st[group][key].wins++;
  }
  st.damageDealt += r.damageDealt;
  st.damageTaken += r.damageTaken;
  st.maxCombo = Math.max(st.maxCombo, r.maxCombo);
  st.specials += r.specials;
  st.parries += r.parries;
  st.blocks += r.blocks;
  for (const [id, count] of Object.entries(r.moves)) st.moves[id] = (st.moves[id] ?? 0) + count;
  st.playTimeSec += r.durationSec;
  st.coinsEarned += coins;
  touchDay(st, now);

  s.updatedAt = now;
  return { ok: true, save: s, rewards };
}

// ------------------------------------------------------------------ spending

function spend(s, cost) {
  s.coins -= cost;
  s.stats.coinsSpent += cost;
}

export function buyUpgrade(save, id, now = Date.now()) {
  const def = UPGRADES[id];
  if (!def) return fail('unknown upgrade');
  const s = clone(save);
  const level = s.upgrades[id];
  if (level >= def.maxLevel) return fail('already at max level');
  const cost = upgradeCost(id, level);
  if (s.coins < cost) return fail(`needs ${cost} coins`);
  spend(s, cost);
  s.upgrades[id] = level + 1;
  s.updatedAt = now;
  return { ok: true, save: s };
}

export function unlockSkill(save, id, now = Date.now()) {
  const def = SKILLS[id];
  if (!def) return fail('unknown skill');
  const s = clone(save);
  if (s.skills.includes(id)) return fail('already learned');
  if (s.level < def.level) return fail(`requires level ${def.level}`);
  if (s.skillPoints < def.cost) return fail(`needs ${def.cost} skill point${def.cost > 1 ? 's' : ''}`);
  s.skillPoints -= def.cost;
  s.skills.push(id);
  s.updatedAt = now;
  return { ok: true, save: s };
}

export function buyItem(save, id, now = Date.now()) {
  const def = ITEMS[id];
  if (!def) return fail('unknown item');
  const s = clone(save);
  if (def.kind === 'outfit' && s.outfits.owned.includes(id)) return fail('already owned');
  if (def.kind === 'consumable' && (s.inventory[id] ?? 0) >= MAX_STACK) return fail('inventory full');
  if (s.coins < def.price) return fail(`needs ${def.price} coins`);
  spend(s, def.price);
  if (def.kind === 'outfit') s.outfits.owned.push(id);
  else s.inventory[id] = (s.inventory[id] ?? 0) + 1;
  s.updatedAt = now;
  return { ok: true, save: s };
}

export function equipOutfit(save, fighter, id, now = Date.now()) {
  if (!FIGHTER_IDS.includes(fighter)) return fail('unknown fighter');
  if (id !== 'default' && !(ITEMS[id]?.kind === 'outfit' && ITEMS[id].fighter === fighter)) return fail('not an outfit for this fighter');
  if (id !== 'default' && !save.outfits.owned.includes(id)) return fail('not owned');
  const s = clone(save);
  s.outfits.equipped[fighter] = id;
  s.updatedAt = now;
  return { ok: true, save: s };
}

/** Moves one consumable from the inventory into the next match. */
export function queueConsumable(save, id, now = Date.now()) {
  if (ITEMS[id]?.kind !== 'consumable') return fail('not a consumable');
  if (save.queued.includes(id)) return fail('already active for the next match');
  if ((save.inventory[id] ?? 0) < 1) return fail('none left');
  const s = clone(save);
  s.inventory[id]--;
  s.queued.push(id);
  s.updatedAt = now;
  return { ok: true, save: s };
}

export function updateSettings(save, settings, now = Date.now()) {
  const s = clone(save);
  if (settings?.difficulty !== undefined) {
    if (!DIFFICULTIES.includes(settings.difficulty)) return fail('bad difficulty');
    s.settings.difficulty = settings.difficulty;
  }
  if (settings?.muted !== undefined) s.settings.muted = settings.muted === true;
  s.updatedAt = now;
  return { ok: true, save: s };
}

// ------------------------------------------------------------------ sessions & habits

export function recordSessionStart(save, now = Date.now()) {
  const s = clone(save);
  s.stats.sessions++;
  touchDay(s.stats, now);
  s.updatedAt = now;
  return s;
}

export function recordSessionEnd(save, durationSec, now = Date.now()) {
  const s = clone(save);
  s.stats.sessionTimeSec += clampNum(durationSec, 0, 6 * 3600, 0);
  s.updatedAt = now;
  return s;
}

/** Readable habit summary for the profile screen. */
export function summarizeHabits(stats) {
  const best = (obj) => {
    const entries = Object.entries(obj).filter(([, v]) => (typeof v === 'number' ? v : v.matches) > 0);
    if (!entries.length) return null;
    entries.sort((a, b) => (typeof b[1] === 'number' ? b[1] - a[1] : b[1].matches - a[1].matches));
    return entries[0][0];
  };
  return {
    winRate: stats.matches ? Math.round((100 * stats.wins) / stats.matches) : 0,
    favoriteFighter: best(stats.byFighter),
    favoriteMove: best(stats.moves),
    favoriteDifficulty: best(stats.byDifficulty),
    avgMatchSec: stats.matches ? Math.round(stats.playTimeSec / stats.matches) : 0,
  };
}
