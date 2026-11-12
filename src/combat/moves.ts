import type { Box } from './types';

export type AttackButton = 'punch' | 'kick' | 'special';
export type MoveId = 'jab' | 'cross' | 'frontKick' | 'roundhouse' | 'airPunch' | 'airKick' | 'fireball' | 'shadowDash';

/** Extra rules for energy-powered special moves. */
export interface SpecialData {
  kind: 'projectile' | 'dash';
  energyCost: number;
  /** Dash: forward speed during the active frames (px/step). */
  dashSpeed?: number;
  /** Projectile: launched on the first active frame. Offsets are from the feet, facing right. */
  projectile?: { speed: number; spawnX: number; spawnY: number; w: number; h: number };
}

/**
 * Frame data for one attack. All timings are in logic steps (1/60 s).
 *
 *   startup  -> frames before the hitbox appears
 *   active   -> frames the hitbox can connect
 *   recovery -> frames after, where the attacker is vulnerable
 */
export interface MoveData {
  readonly id: MoveId;
  readonly name: string;
  readonly startup: number;
  readonly active: number;
  readonly recovery: number;
  readonly damage: number;
  /** Frames the defender is stunned on hit (ignored for knockdown moves). */
  readonly hitstun: number;
  readonly blockstun: number;
  /** Horizontal push applied to the defender on hit (px/step, decays with friction). */
  readonly knockback: number;
  readonly blockPush: number;
  /** Global freeze frames on contact — the "impact" feel. */
  readonly hitstop: number;
  readonly knockdown: boolean;
  readonly heavy: boolean;
  readonly air: boolean;
  /** Forward velocity during startup (steps into the attack). */
  readonly lunge: number;
  /** Hitbox relative to the fighter's feet, authored facing right (+x forward, -y up). */
  readonly hitbox: Box;
  /** Which move this one cancels into when it connects and the button is pressed. */
  readonly chain: Partial<Record<AttackButton, MoveId>>;
  /** Energy the attacker earns when this connects (a share of it when blocked). */
  readonly energyGain: number;
  /** Whether this move can cancel into the character's special when it connects. */
  readonly specialCancel: boolean;
  readonly special?: SpecialData;
}

const base = {
  knockdown: false,
  heavy: false,
  air: false,
  lunge: 0,
  chain: {},
  specialCancel: false,
} as const;

export const MOVES: Record<MoveId, MoveData> = {
  jab: {
    ...base,
    id: 'jab',
    name: 'Jab',
    startup: 4,
    active: 3,
    recovery: 9,
    damage: 5,
    hitstun: 17,
    blockstun: 11,
    knockback: 3.5,
    blockPush: 3.5,
    hitstop: 6,
    hitbox: { x: 50, y: -150, w: 50, h: 34 },
    chain: { punch: 'cross', kick: 'roundhouse' },
    energyGain: 4,
    specialCancel: true,
  },
  cross: {
    ...base,
    id: 'cross',
    name: 'Straight',
    startup: 6,
    active: 3,
    recovery: 13,
    damage: 8,
    hitstun: 19,
    blockstun: 13,
    knockback: 4.5,
    blockPush: 4.5,
    hitstop: 8,
    lunge: 2.5,
    hitbox: { x: 55, y: -150, w: 56, h: 36 },
    chain: { kick: 'roundhouse' },
    energyGain: 6,
    specialCancel: true,
  },
  frontKick: {
    ...base,
    id: 'frontKick',
    name: 'Front Kick',
    startup: 8,
    active: 4,
    recovery: 15,
    damage: 9,
    hitstun: 19,
    blockstun: 13,
    knockback: 5,
    blockPush: 5,
    hitstop: 8,
    lunge: 1.5,
    hitbox: { x: 55, y: -114, w: 60, h: 40 },
    chain: { kick: 'roundhouse' },
    energyGain: 6,
    specialCancel: true,
  },
  roundhouse: {
    ...base,
    id: 'roundhouse',
    name: 'Roundhouse',
    startup: 10,
    active: 4,
    recovery: 22,
    damage: 13,
    hitstun: 0,
    blockstun: 16,
    knockback: 8,
    blockPush: 7,
    hitstop: 12,
    knockdown: true,
    heavy: true,
    lunge: 2,
    hitbox: { x: 48, y: -154, w: 66, h: 50 },
    energyGain: 9,
  },
  airPunch: {
    ...base,
    id: 'airPunch',
    name: 'Air Punch',
    startup: 4,
    active: 6,
    recovery: 8,
    damage: 6,
    hitstun: 16,
    blockstun: 12,
    knockback: 3,
    blockPush: 3,
    hitstop: 6,
    air: true,
    hitbox: { x: 42, y: -145, w: 48, h: 42 },
    energyGain: 5,
  },
  airKick: {
    ...base,
    id: 'airKick',
    name: 'Air Kick',
    startup: 6,
    active: 8,
    recovery: 8,
    damage: 9,
    hitstun: 20,
    blockstun: 14,
    knockback: 4,
    blockPush: 4,
    hitstop: 8,
    air: true,
    hitbox: { x: 45, y: -80, w: 58, h: 48 },
    energyGain: 6,
  },

  // ---------------------------------------------------------------- specials (L)
  // Long startup and recovery so they can be read, blocked or jumped, and punished.

  /** Kaen: a flaming straight punch that launches a fireball. */
  fireball: {
    ...base,
    id: 'fireball',
    name: 'Fireball',
    startup: 13,
    active: 1,
    recovery: 26,
    damage: 10,
    hitstun: 20,
    blockstun: 15,
    knockback: 5,
    blockPush: 5,
    hitstop: 9,
    heavy: true,
    // Melee hitbox unused (the projectile hits); still marks the extended arm as hittable.
    hitbox: { x: 50, y: -150, w: 50, h: 34 },
    energyGain: 0,
    special: {
      kind: 'projectile',
      energyCost: 50,
      // Flies at chest height: hits anyone standing, can be jumped over with good timing.
      projectile: { speed: 8, spawnX: 92, spawnY: -124, w: 46, h: 38 },
    },
  },
  /** Yoru: a low, fast rush that ends in a blade-hand strike. Not invulnerable. */
  shadowDash: {
    ...base,
    id: 'shadowDash',
    name: 'Shadow Dash',
    startup: 10,
    active: 12,
    recovery: 20,
    damage: 11,
    hitstun: 22,
    blockstun: 14,
    knockback: 7,
    blockPush: 8,
    hitstop: 10,
    hitbox: { x: -5, y: -165, w: 75, h: 135 },
    energyGain: 0,
    special: { kind: 'dash', energyCost: 50, dashSpeed: 13 },
  },
};
