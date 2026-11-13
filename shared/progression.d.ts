// Types for shared/progression.js (plain JS so the Node server can use it without a build step).

export type FighterId = 'kaen' | 'yoru';
export type Difficulty = 'easy' | 'normal' | 'hard';
export type Mode = 'ladder' | 'versus';
export type Outcome = 'win' | 'lose' | 'draw';
export type UpgradeId = 'vitality' | 'power' | 'focus' | 'resolve';
export type SkillId = 'secondWind' | 'ironGuard' | 'parryMaster' | 'finisher' | 'counterInstinct';
export type ItemId = 'energyTonic' | 'luckyCharm' | 'kaenMidnight' | 'yoruCrimson';
export type ConsumableId = 'energyTonic' | 'luckyCharm';
export type OutfitId = 'kaenMidnight' | 'yoruCrimson';

export interface LadderStage {
  name: string;
  difficulty: Difficulty;
  checkpoint?: boolean;
  boss?: boolean;
  cpu: { hp: number; damage: number };
  reach?: { item: ConsumableId; qty: number };
}

export interface UpgradeDef { name: string; desc: string; maxLevel: number; baseCost: number }
export interface SkillDef { name: string; desc: string; level: number; cost: number }
export interface ItemDef { kind: 'consumable' | 'outfit'; name: string; desc: string; price: number; fighter?: FighterId }

export interface WinRecord { matches: number; wins: number }

export interface Stats {
  matches: number; wins: number; losses: number; draws: number;
  roundsWon: number; roundsLost: number; perfectRounds: number;
  byFighter: Record<FighterId, WinRecord>;
  byDifficulty: Record<Difficulty, WinRecord>;
  byMode: Record<Mode, WinRecord>;
  damageDealt: number; damageTaken: number; maxCombo: number;
  specials: number; parries: number; blocks: number;
  moves: Partial<Record<string, number>>;
  playTimeSec: number;
  sessions: number; sessionTimeSec: number;
  streakDays: number; bestStreak: number; lastPlayedDay: string | null; lastPlayedAt: number | null;
  coinsEarned: number; coinsSpent: number;
}

export interface SaveData {
  version: number;
  level: number;
  xp: number;
  coins: number;
  skillPoints: number;
  ladder: { stage: number; checkpoint: number; best: number; clears: number };
  upgrades: Record<UpgradeId, number>;
  skills: SkillId[];
  inventory: Record<ConsumableId, number>;
  outfits: { owned: OutfitId[]; equipped: Record<FighterId, OutfitId | 'default'> };
  queued: ConsumableId[];
  settings: { difficulty: Difficulty; muted: boolean };
  stats: Stats;
  createdAt: number;
  updatedAt: number;
}

export interface FighterMods {
  maxHp: number;
  damageMult: number;
  energyGainMult: number;
  roundStartEnergy: number;
  matchStartEnergy: number;
  guardEnergyBonus: number;
  parryEnergyBonus: number;
  specialDamageMult: number;
  counterDamageMult: number;
  secondWind: boolean;
}

export interface MatchReport {
  mode: Mode;
  fighter: FighterId;
  opponent: FighterId;
  difficulty: Difficulty;
  outcome: Outcome;
  stage: number | null;
  rounds: [number, number];
  durationSec: number;
  damageDealt: number;
  damageTaken: number;
  maxCombo: number;
  specials: number;
  parries: number;
  blocks: number;
  perfectRounds: number;
  moves: Partial<Record<string, number>>;
}

export interface Rewards {
  coins: number;
  xp: number;
  levelUps: number;
  skillPoints: number;
  items: Array<{ id: ConsumableId; qty: number }>;
  outfit: OutfitId | null;
  checkpoint: number | null;
  ladder: 'advance' | 'retreat' | 'clear' | null;
  charm: boolean;
}

export type Result<T> = ({ ok: true } & T) | { ok: false; error: string };

export const SAVE_VERSION: number;
export const FIGHTER_IDS: FighterId[];
export const DIFFICULTIES: Difficulty[];
export const MODES: Mode[];
export const OUTCOMES: Outcome[];
export const MOVE_IDS: string[];
export const LADDER: LadderStage[];
export const LADDER_CLEAR_COINS: number;
export const UPGRADES: Record<UpgradeId, UpgradeDef>;
export const SKILLS: Record<SkillId, SkillDef>;
export const ITEMS: Record<ItemId, ItemDef>;
export const CLEAR_OUTFIT: Record<FighterId, OutfitId>;
export const BASE_MODS: Readonly<FighterMods>;

export function dayKey(ms: number): string;
export function xpToNext(level: number): number;
export function upgradeCost(id: UpgradeId, level: number): number;
export function newSave(now?: number): SaveData;
export function sanitizeSave(raw: unknown, now?: number): SaveData;
export function fighterMods(save: SaveData): FighterMods;
export function ladderCpuMods(stage: number): FighterMods;
export function validateReport(r: unknown): Result<{ report: MatchReport }>;
export function applyMatchReport(save: SaveData, report: MatchReport, now?: number): Result<{ save: SaveData; rewards: Rewards }>;
export function buyUpgrade(save: SaveData, id: string, now?: number): Result<{ save: SaveData }>;
export function unlockSkill(save: SaveData, id: string, now?: number): Result<{ save: SaveData }>;
export function buyItem(save: SaveData, id: string, now?: number): Result<{ save: SaveData }>;
export function equipOutfit(save: SaveData, fighter: string, id: string, now?: number): Result<{ save: SaveData }>;
export function queueConsumable(save: SaveData, id: string, now?: number): Result<{ save: SaveData }>;
export function updateSettings(save: SaveData, settings: Partial<SaveData['settings']>, now?: number): Result<{ save: SaveData }>;
export function recordSessionStart(save: SaveData, now?: number): SaveData;
export function recordSessionEnd(save: SaveData, durationSec: number, now?: number): SaveData;
export function summarizeHabits(stats: Stats): {
  winRate: number;
  favoriteFighter: string | null;
  favoriteMove: string | null;
  favoriteDifficulty: string | null;
  avgMatchSec: number;
};
