import type { MoveId } from '../combat/moves';

export type FighterId = 'kaen' | 'yoru';
export type FxStyle = 'fire' | 'shadow';

/** Colors used to paint a character's body parts (CSS colors for the canvas painter). */
export interface FighterLook {
  skin: string;
  skinShade: string;
  gi: string;
  giShade: string;
  pants: string;
  pantsShade: string;
  trim: string;
  belt: string;
  beltShade: string;
  /** Hair gradient: roots, mid, tips. */
  hair: [string, string, string];
  iris: string;
  /** Headband (Kaen) or scarf (Yoru). */
  accent: string;
  accentShade: string;
  /** Hand / ankle wraps (Kaen) or gloves (Yoru). */
  hands: string;
  handsShade: string;
  /** Face mask (Yoru only). */
  mask?: string;
}

export interface FighterDef {
  id: FighterId;
  name: string;
  style: string;
  /** Short lines shown on the character select screen. */
  blurb: string[];
  /** CSS color for names in the UI. */
  uiColor: string;
  fx: FxStyle;
  /** Heavy attack on the U key. */
  heavy: MoveId;
  /** Energy special on the L key. */
  special: MoveId;
  specialName: string;
  /** Swoosh trail and afterimage tints. */
  trailColor: number;
  ghostColor: number;
  look: FighterLook;
}

export const KAEN: FighterDef = {
  id: 'kaen',
  name: 'KAEN',
  style: 'Blazing Fist',
  blurb: ['Hot-blooded street brawler', 'Relentless pressure, crimson flames', 'Fists wrapped, never backs down'],
  uiColor: '#ffb27a',
  fx: 'fire',
  heavy: 'flameStrike',
  special: 'fireball',
  specialName: 'Fireball',
  trailColor: 0xff8a2a,
  ghostColor: 0xff5a1f,
  look: {
    skin: '#f2c29a',
    skinShade: '#c98a62',
    gi: '#d83b27',
    giShade: '#8c2115',
    pants: '#b8301f',
    pantsShade: '#721a10',
    trim: '#f6dcae',
    belt: '#211a25',
    beltShade: '#0d0910',
    hair: ['#4a0b0d', '#cf2a1c', '#ff9a3a'],
    iris: '#f0a020',
    accent: '#f7f3ea',
    accentShade: '#c6bfb1',
    hands: '#f7f3ea',
    handsShade: '#c6bfb1',
  },
};

export const YORU: FighterDef = {
  id: 'yoru',
  name: 'YORU',
  style: 'Silent Shadow',
  blurb: ['Masked shadow-arts master', 'Calm, precise, punishes mistakes', 'Strikes from the dark'],
  uiColor: '#c3b0ff',
  fx: 'shadow',
  heavy: 'shadowSlash',
  special: 'shadowDash',
  specialName: 'Shadow Dash',
  trailColor: 0x9a7bff,
  ghostColor: 0x6b3fd4,
  look: {
    skin: '#e6b08c',
    skinShade: '#b07a58',
    gi: '#3c418f',
    giShade: '#23265a',
    pants: '#2f3376',
    pantsShade: '#1b1d48',
    trim: '#8fe8ff',
    belt: '#6fd8f5',
    beltShade: '#3a95b4',
    hair: ['#7c81ad', '#d6dbf0', '#ffffff'],
    iris: '#b084ff',
    accent: '#6d40d8',
    accentShade: '#43248f',
    hands: '#241e3c',
    handsShade: '#141022',
    mask: '#1c1931',
  },
};

export const FIGHTERS: Record<FighterId, FighterDef> = { kaen: KAEN, yoru: YORU };
export const FIGHTER_IDS: readonly FighterId[] = ['kaen', 'yoru'];

export function opponentOf(id: FighterId): FighterId {
  return id === 'kaen' ? 'yoru' : 'kaen';
}
