// ZAIKORA's sound effects: original recipes built from synth.ts. AudioManager renders each one
// (and its variants) into a buffer once, after the first key press, and plays the buffers; until
// then, or if rendering isn't available, it plays the recipe live. Same sound either way.

import type { MoveData } from '../../combat/moves';
import { bell, grunt, noise, pluck, tone, type Ctx } from './synth';

export type Sfx =
  // Combat
  | 'punchSwing'
  | 'kickSwing'
  | 'heavySwing'
  | 'punchLight'
  | 'punchHeavy'
  | 'kickLight'
  | 'kickHeavy'
  | 'block'
  | 'parry'
  | 'counter'
  | 'fireball'
  | 'fireballImpact'
  | 'dash'
  | 'step'
  | 'jump'
  | 'land'
  | 'thud'
  | 'getUp'
  | 'hurtKaen'
  | 'hurtYoru'
  | 'powerup'
  | 'denied'
  | 'ko'
  // Match flow
  | 'vs'
  | 'ready'
  | 'round'
  | 'count'
  | 'fight'
  | 'roundWin'
  | 'roundLose'
  | 'timeUp'
  // Menus
  | 'select'
  | 'confirm'
  | 'back';

type Recipe = (c: Ctx, out: AudioNode, t: number, v: number) => void;

export interface SfxSpec {
  /** 'game' sounds belong to a fight or the VS screen and are cut when that scene ends; 'ui' sounds aren't. */
  cat: 'game' | 'ui';
  /** Seconds to render; the recipe must be silent by then. */
  dur: number;
  /** Peak level the rendered buffer is normalised to (0–1). */
  level: number;
  /** Slightly different renders, rotated so repeated hits don't sound machine-gunned. */
  variants: number;
  /** Repeats of the same sound closer together than this are dropped as duplicates. */
  gapMs: number;
  /** Most copies of this sound allowed to play at once. */
  max: number;
  render: Recipe;
}

/** Variant v (0, 1, 2…) → a small pitch factor around 1. */
const vary = (v: number, spread = 0.045): number => 1 + (v - 1) * spread;

const D4 = 62;
const A4 = 69;
const D5 = 74;
const E5 = 76;
const A5 = 81;
const D6 = 86;

function spec(cat: SfxSpec['cat'], dur: number, level: number, render: Recipe, o: Partial<Pick<SfxSpec, 'variants' | 'gapMs' | 'max'>> = {}): SfxSpec {
  return { cat, dur, level, render, variants: o.variants ?? 1, gapMs: o.gapMs ?? 30, max: o.max ?? 3 };
}

export const SFX: Record<Sfx, SfxSpec> = {
  // ---------------------------------------------------------------- swings (attack startup → active)
  punchSwing: spec(
    'game',
    0.18,
    0.42,
    (c, o, t, v) => {
      noise(c, o, t, { filter: 'bandpass', f0: 700 * vary(v), f1: 2600 * vary(v), q: 1.1, dur: 0.13, vol: 0.5, attack: 0.025, offset: v * 0.31 });
      tone(c, o, t, { f0: 200, f1: 110, dur: 0.08, vol: 0.12 });
    },
    { variants: 3, max: 4 },
  ),
  kickSwing: spec(
    'game',
    0.24,
    0.48,
    (c, o, t, v) => {
      noise(c, o, t, { filter: 'bandpass', f0: 450 * vary(v), f1: 1700 * vary(v), q: 0.9, dur: 0.18, vol: 0.55, attack: 0.04, offset: v * 0.37 });
      tone(c, o, t, { f0: 150, f1: 80, dur: 0.12, vol: 0.14 });
    },
    { variants: 3, max: 4 },
  ),
  heavySwing: spec(
    'game',
    0.34,
    0.55,
    (c, o, t, v) => {
      noise(c, o, t, { filter: 'bandpass', f0: 300 * vary(v), f1: 2200 * vary(v), q: 0.8, dur: 0.26, vol: 0.6, attack: 0.07, offset: v * 0.29 });
      noise(c, o, t, { filter: 'lowpass', f0: 600, f1: 200, dur: 0.25, vol: 0.3, attack: 0.05, offset: 0.5 + v * 0.1 });
      tone(c, o, t, { f0: 110, f1: 55, dur: 0.22, vol: 0.2, attack: 0.03 });
    },
    { variants: 2, max: 3 },
  ),

  // ---------------------------------------------------------------- impacts
  punchLight: spec(
    'game',
    0.16,
    0.78,
    (c, o, t, v) => {
      noise(c, o, t, { filter: 'highpass', f0: 2600, dur: 0.025, vol: 0.5, offset: v * 0.23 });
      tone(c, o, t, { f0: 215 * vary(v, 0.06), f1: 85, dur: 0.09, vol: 0.75 });
      noise(c, o, t, { filter: 'bandpass', f0: 1400 * vary(v), f1: 700, q: 1.4, dur: 0.07, vol: 0.65, offset: 0.4 + v * 0.17 });
    },
    { variants: 3, max: 4 },
  ),
  punchHeavy: spec(
    'game',
    0.36,
    1,
    (c, o, t, v) => {
      noise(c, o, t, { filter: 'highpass', f0: 2000, dur: 0.035, vol: 0.55, offset: v * 0.19 });
      tone(c, o, t, { f0: 150 * vary(v), f1: 42, dur: 0.26, vol: 0.95 });
      noise(c, o, t, { filter: 'lowpass', f0: 3000, f1: 250, q: 0.7, dur: 0.22, vol: 0.75, offset: 0.6 + v * 0.13 });
      tone(c, o, t, { type: 'square', f0: 95, f1: 40, dur: 0.12, vol: 0.1 });
    },
    { variants: 2, max: 3 },
  ),
  kickLight: spec(
    'game',
    0.18,
    0.8,
    (c, o, t, v) => {
      noise(c, o, t, { filter: 'bandpass', f0: 1000 * vary(v), f1: 600, q: 1.2, dur: 0.08, vol: 0.7, offset: v * 0.27 });
      tone(c, o, t, { f0: 170 * vary(v, 0.06), f1: 70, dur: 0.11, vol: 0.8 });
      noise(c, o, t, { filter: 'highpass', f0: 3000, dur: 0.02, vol: 0.35, offset: 0.8 + v * 0.11 });
    },
    { variants: 3, max: 4 },
  ),
  kickHeavy: spec(
    'game',
    0.4,
    1,
    (c, o, t, v) => {
      noise(c, o, t, { filter: 'bandpass', f0: 900 * vary(v), f1: 300, q: 0.9, dur: 0.2, vol: 0.8, offset: v * 0.21 });
      tone(c, o, t, { f0: 120 * vary(v), f1: 36, dur: 0.32, vol: 1 });
      noise(c, o, t, { filter: 'highpass', f0: 2200, dur: 0.04, vol: 0.5, offset: 0.3 + v * 0.07 });
      noise(c, o, t, { filter: 'lowpass', f0: 1200, f1: 120, dur: 0.3, vol: 0.45, offset: 1.1 });
    },
    { variants: 2, max: 3 },
  ),
  block: spec(
    'game',
    0.14,
    0.68,
    (c, o, t, v) => {
      tone(c, o, t, { type: 'triangle', f0: 380 * vary(v), f1: 260, dur: 0.07, vol: 0.55 });
      noise(c, o, t, { filter: 'bandpass', f0: 1600 * vary(v), q: 3, dur: 0.05, vol: 0.6, offset: v * 0.33 });
      noise(c, o, t, { filter: 'lowpass', f0: 700, f1: 200, dur: 0.09, vol: 0.55, offset: 0.9 });
    },
    { variants: 3, max: 3 },
  ),
  parry: spec(
    'game',
    0.6,
    0.82,
    (c, o, t) => {
      bell(c, o, t, 2100, [1, 1.503, 2.49, 3.76], 0.55, 0.45);
      noise(c, o, t, { filter: 'highpass', f0: 5000, f1: 3000, dur: 0.09, vol: 0.35 });
      noise(c, o, t, { filter: 'bandpass', f0: 1200, f1: 3500, q: 1, dur: 0.12, vol: 0.25, offset: 0.4 });
    },
    { max: 2 },
  ),
  counter: spec(
    'game',
    0.4,
    0.72,
    (c, o, t) => {
      noise(c, o, t, { filter: 'highpass', f0: 1800, dur: 0.05, vol: 0.6 });
      tone(c, o, t, { type: 'sawtooth', f0: 500, f1: 1400, dur: 0.12, vol: 0.12 });
      bell(c, o, t + 0.03, 1500, [1, 2.01, 2.97], 0.35, 0.3);
    },
    { max: 2 },
  ),

  // ---------------------------------------------------------------- specials
  fireball: spec(
    'game',
    0.62,
    0.8,
    (c, o, t) => {
      noise(c, o, t, { filter: 'lowpass', f0: 300, f1: 2600, dur: 0.18, vol: 0.55, attack: 0.08 });
      noise(c, o, t + 0.12, { filter: 'lowpass', f0: 2600, f1: 400, dur: 0.42, vol: 0.5, offset: 0.7 });
      tone(c, o, t, { f0: 90, f1: 55, dur: 0.4, vol: 0.5, attack: 0.03 });
      tone(c, o, t, { type: 'sawtooth', f0: 160, f1: 70, dur: 0.3, vol: 0.08 });
    },
    { max: 3 },
  ),
  fireballImpact: spec(
    'game',
    0.62,
    0.95,
    (c, o, t) => {
      noise(c, o, t, { filter: 'lowpass', f0: 3500, f1: 150, dur: 0.55, vol: 0.9 });
      tone(c, o, t, { f0: 110, f1: 32, dur: 0.45, vol: 1 });
      noise(c, o, t, { filter: 'highpass', f0: 2500, dur: 0.06, vol: 0.5, offset: 0.5 });
      noise(c, o, t, { filter: 'bandpass', f0: 600, q: 0.8, dur: 0.35, vol: 0.3, offset: 1.2 });
    },
    { max: 2 },
  ),
  dash: spec(
    'game',
    0.4,
    0.62,
    (c, o, t) => {
      noise(c, o, t, { filter: 'bandpass', f0: 3200, f1: 400, q: 1.4, dur: 0.32, vol: 0.55, attack: 0.03 });
      tone(c, o, t, { f0: 75, f1: 40, dur: 0.3, vol: 0.35 });
      tone(c, o, t, { type: 'triangle', f0: 700, f1: 180, dur: 0.22, vol: 0.1 });
    },
    { max: 2 },
  ),
  powerup: spec(
    'game',
    0.75,
    0.55,
    (c, o, t) => {
      noise(c, o, t, { filter: 'bandpass', f0: 300, f1: 2400, q: 1.2, dur: 0.5, vol: 0.35, attack: 0.25 });
      tone(c, o, t, { type: 'sawtooth', f0: 110, f1: 440, dur: 0.42, vol: 0.08, attack: 0.2 });
      tone(c, o, t, { f0: 70, f1: 140, dur: 0.38, vol: 0.5, attack: 0.1 });
      bell(c, o, t + 0.3, 1760, [1, 2, 3], 0.4, 0.12);
    },
    { gapMs: 60, max: 2 },
  ),

  // ---------------------------------------------------------------- movement and bodies
  step: spec(
    'game',
    0.14,
    0.36,
    (c, o, t, v) => {
      noise(c, o, t, { filter: 'bandpass', f0: 1800 * vary(v), f1: 700, q: 1.2, dur: 0.1, vol: 0.5, offset: v * 0.41 });
      noise(c, o, t, { filter: 'lowpass', f0: 400, dur: 0.04, vol: 0.25, offset: 1 });
    },
    { variants: 3, gapMs: 60, max: 2 },
  ),
  jump: spec(
    'game',
    0.16,
    0.3,
    (c, o, t, v) => {
      noise(c, o, t, { filter: 'bandpass', f0: 700 * vary(v), f1: 1500, q: 1, dur: 0.11, vol: 0.3, attack: 0.02, offset: v * 0.2 });
      noise(c, o, t, { filter: 'lowpass', f0: 350, dur: 0.04, vol: 0.35, offset: 0.6 });
    },
    { variants: 2, gapMs: 60, max: 2 },
  ),
  land: spec(
    'game',
    0.14,
    0.42,
    (c, o, t, v) => {
      noise(c, o, t, { filter: 'lowpass', f0: 600 * vary(v), f1: 150, dur: 0.09, vol: 0.55, offset: v * 0.3 });
      tone(c, o, t, { f0: 120, f1: 55, dur: 0.07, vol: 0.4 });
    },
    { variants: 2, gapMs: 60, max: 2 },
  ),
  thud: spec(
    'game',
    0.45,
    0.88,
    (c, o, t) => {
      tone(c, o, t, { f0: 95, f1: 32, dur: 0.38, vol: 1 });
      noise(c, o, t, { filter: 'lowpass', f0: 1100, f1: 90, dur: 0.32, vol: 0.7 });
      noise(c, o, t, { filter: 'bandpass', f0: 260, q: 1.5, dur: 0.25, vol: 0.35, offset: 0.8 });
    },
    { max: 2 },
  ),
  getUp: spec(
    'game',
    0.34,
    0.34,
    (c, o, t) => {
      noise(c, o, t, { filter: 'bandpass', f0: 2200, q: 0.9, dur: 0.12, vol: 0.3, attack: 0.03 });
      noise(c, o, t + 0.14, { filter: 'bandpass', f0: 1800, q: 0.9, dur: 0.1, vol: 0.25, attack: 0.02, offset: 0.5 });
      noise(c, o, t + 0.22, { filter: 'lowpass', f0: 450, dur: 0.06, vol: 0.35, offset: 1 });
      tone(c, o, t + 0.22, { f0: 110, f1: 60, dur: 0.06, vol: 0.25 });
    },
    { max: 2 },
  ),
  // A short breathy grunt per fighter: Kaen higher and brighter, Yoru lower and darker.
  hurtKaen: spec('game', 0.24, 0.42, (c, o, t, v) => grunt(c, o, t, 205 * vary(v, 0.06), 560, 1250, 0.17, 0.5), {
    variants: 3,
    gapMs: 260,
    max: 1,
  }),
  hurtYoru: spec('game', 0.24, 0.42, (c, o, t, v) => grunt(c, o, t, 150 * vary(v, 0.06), 450, 980, 0.18, 0.5), {
    variants: 3,
    gapMs: 260,
    max: 1,
  }),
  ko: spec(
    'game',
    2.3,
    1,
    (c, o, t) => {
      tone(c, o, t, { f0: 75, f1: 26, dur: 1.3, vol: 1 });
      noise(c, o, t, { filter: 'lowpass', f0: 1600, f1: 60, dur: 1, vol: 0.7 });
      bell(c, o, t, 110, [1, 1.47, 2.09, 2.56], 2.2, 0.35);
      noise(c, o, t, { filter: 'highpass', f0: 2500, dur: 0.06, vol: 0.5, offset: 0.9 });
    },
    { max: 1, gapMs: 200 },
  ),
  denied: spec(
    'ui',
    0.26,
    0.45,
    (c, o, t) => {
      tone(c, o, t, { type: 'square', f0: 140, f1: 110, dur: 0.12, vol: 0.12 });
      tone(c, o, t + 0.13, { type: 'square', f0: 140, f1: 110, dur: 0.1, vol: 0.1 });
    },
    { gapMs: 120, max: 1 },
  ),

  // ---------------------------------------------------------------- match flow
  vs: spec(
    'game',
    1.1,
    0.9,
    (c, o, t) => {
      tone(c, o, t, { f0: 100, f1: 30, dur: 0.7, vol: 1 });
      noise(c, o, t, { filter: 'lowpass', f0: 2500, f1: 100, dur: 0.5, vol: 0.7 });
      noise(c, o, t, { filter: 'highpass', f0: 5000, dur: 1, vol: 0.25, offset: 0.7 });
      bell(c, o, t, 220, [1, 1.5, 2], 0.8, 0.15);
    },
    { max: 1, gapMs: 300 },
  ),
  ready: spec(
    'game',
    1.05,
    0.7,
    (c, o, t) => {
      noise(c, o, t, { filter: 'bandpass', f0: 300, f1: 3000, q: 1, dur: 0.5, vol: 0.35, attack: 0.45 });
      tone(c, o, t, { f0: 200, f1: 600, dur: 0.5, vol: 0.15, attack: 0.4 });
      bell(c, o, t + 0.45, 1320, [1, 2, 3], 0.5, 0.3);
    },
    { max: 1, gapMs: 300 },
  ),
  // Two taiko strokes and a bright bell: the call before the countdown.
  round: spec(
    'game',
    1.15,
    0.8,
    (c, o, t) => {
      tone(c, o, t, { f0: 120, f1: 55, dur: 0.5, vol: 1 });
      noise(c, o, t, { filter: 'lowpass', f0: 400, dur: 0.06, vol: 0.5 });
      tone(c, o, t + 0.18, { f0: 120, f1: 55, dur: 0.5, vol: 0.8 });
      noise(c, o, t + 0.18, { filter: 'lowpass', f0: 400, dur: 0.06, vol: 0.4, offset: 0.5 });
      bell(c, o, t + 0.18, 880, [1, 2, 3.01], 0.9, 0.2);
    },
    { max: 1, gapMs: 300 },
  ),
  // Wood block "tock" with a low thump, for 3-2-1.
  count: spec(
    'game',
    0.16,
    0.65,
    (c, o, t) => {
      tone(c, o, t, { type: 'triangle', f0: 820, f1: 760, dur: 0.09, vol: 0.7 });
      noise(c, o, t, { filter: 'bandpass', f0: 2400, q: 6, dur: 0.03, vol: 0.4 });
      tone(c, o, t, { f0: 120, f1: 60, dur: 0.12, vol: 0.5 });
    },
    { max: 1, gapMs: 200 },
  ),
  fight: spec(
    'game',
    1.3,
    0.95,
    (c, o, t) => {
      tone(c, o, t, { f0: 110, f1: 38, dur: 0.7, vol: 1 });
      noise(c, o, t, { filter: 'lowpass', f0: 3000, f1: 150, dur: 0.4, vol: 0.6 });
      noise(c, o, t, { filter: 'highpass', f0: 4500, dur: 1.2, vol: 0.35, offset: 0.6 });
      noise(c, o, t, { filter: 'bandpass', f0: 400, f1: 3000, dur: 0.2, vol: 0.3, offset: 1.1 });
      tone(c, o, t, { type: 'sawtooth', f0: 220, f1: 440, dur: 0.25, vol: 0.06 });
    },
    { max: 1, gapMs: 300 },
  ),
  // Rising koto run (D, E, A, D) for a round you won; a falling one in the In scale for a loss.
  roundWin: spec(
    'game',
    1.6,
    0.7,
    (c, o, t) => {
      [D5, E5, A5, D6].forEach((m, i) => pluck(c, o, t + i * 0.09, m, 0.7, 1.2));
      bell(c, o, t + 0.3, 1760, [1, 2, 3], 0.6, 0.15);
    },
    { max: 1, gapMs: 300 },
  ),
  roundLose: spec(
    'game',
    1.7,
    0.6,
    (c, o, t) => {
      [A4, 67, 63, D4].forEach((m, i) => pluck(c, o, t + i * 0.12, m, 0.7, 1.2));
      tone(c, o, t + 0.36, { f0: 90, f1: 45, dur: 0.5, vol: 0.5 });
    },
    { max: 1, gapMs: 300 },
  ),
  // A temple bell rung twice.
  timeUp: spec(
    'game',
    1.8,
    0.8,
    (c, o, t) => {
      bell(c, o, t, 660, [1, 2, 2.76, 5.4], 1.4, 0.5);
      bell(c, o, t + 0.28, 660, [1, 2, 2.76, 5.4], 1.4, 0.4);
      tone(c, o, t, { f0: 90, f1: 45, dur: 0.4, vol: 0.6 });
    },
    { max: 1, gapMs: 300 },
  ),

  // ---------------------------------------------------------------- menus
  select: spec(
    'ui',
    0.07,
    0.32,
    (c, o, t) => {
      tone(c, o, t, { type: 'triangle', f0: 1250, f1: 1180, dur: 0.045, vol: 0.5 });
      noise(c, o, t, { filter: 'bandpass', f0: 3000, q: 3, dur: 0.02, vol: 0.2 });
    },
    { gapMs: 25, max: 2 },
  ),
  confirm: spec(
    'ui',
    0.5,
    0.5,
    (c, o, t) => {
      pluck(c, o, t, D5, 0.7, 0.35);
      pluck(c, o, t + 0.07, A5, 0.7, 0.4);
      bell(c, o, t + 0.07, 1760, [1, 2], 0.25, 0.1);
    },
    { gapMs: 80, max: 1 },
  ),
  back: spec(
    'ui',
    0.65,
    0.42,
    (c, o, t) => {
      pluck(c, o, t, A4, 0.7, 0.3);
      pluck(c, o, t + 0.07, D4, 0.7, 0.35);
    },
    { gapMs: 80, max: 1 },
  ),
};

export const SFX_NAMES = Object.keys(SFX) as Sfx[];

// ------------------------------------------------------------------ which sound a move makes

const KICKS = new Set<string>(['frontKick', 'roundhouse', 'airKick']);

/** The swing heard as an attack reaches its active frames. */
export function swingSfx(move: MoveData): Sfx {
  if (move.special?.kind === 'dash') return 'dash';
  if (move.heavy) return 'heavySwing';
  return KICKS.has(move.id) ? 'kickSwing' : 'punchSwing';
}

/** The impact for a hit that wasn't blocked. */
export function impactSfx(move: MoveData, heavy: boolean, projectile: boolean): Sfx {
  if (projectile) return 'fireballImpact';
  if (KICKS.has(move.id)) return heavy ? 'kickHeavy' : 'kickLight';
  return heavy ? 'punchHeavy' : 'punchLight';
}

/** Each fighter's hit reaction. */
export function hurtSfx(fighter: string): Sfx {
  return fighter === 'yoru' ? 'hurtYoru' : 'hurtKaen';
}
