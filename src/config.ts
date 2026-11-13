export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;

/** Y coordinate of the stage floor. A fighter's `y` is the position of their feet. */
export const GROUND_Y = 640;
export const STAGE_LEFT = 60;
export const STAGE_RIGHT = GAME_WIDTH - 60;

/** Game logic runs at a fixed 60 steps per second, so frame data is exact on any display. */
export const STEP_MS = 1000 / 60;

export const MAX_HP = 100;
export const ROUND_SECONDS = 60;
export const ROUNDS_TO_WIN = 2;

/** Movement tuning. All velocities are in pixels per logic step (1/60 s). */
export const PHYS = {
  gravity: 0.9,
  jumpVelocity: -17.5,
  jumpSpeedX: 5.2,
  walkForward: 4.4,
  walkBack: 3.4,
  friction: 0.82,
  prejumpFrames: 4,
  landFrames: 4,
  airAttackLandFrames: 7,
  downFrames: 42,
  getupFrames: 18,
  inputBufferFrames: 10,

  /** Forward dash: a burst that fades out over its length; attacks can cancel it from `dashAttackFrom`. */
  dashFrames: 16,
  dashSpeed: 11,
  dashAttackFrom: 6,
  /** Keep holding forward after a dash to run. */
  runSpeed: 7.2,
  runJumpSpeedX: 7,
  /** Evade (backstep): strike- and projectile-invulnerable for the first frames, then punishable. */
  backdashFrames: 24,
  backdashSpeed: 10.5,
  backdashInvulnFrames: 10,

  /** Parry: a fresh block press up to this many frames before a hit lands. */
  parryWindow: 6,
  /** After a block press, another press can't open a new window this soon (no mashing). */
  parryLockout: 24,
  /** Defender's deflect pose after a parry; can act out of it immediately with an attack. */
  parryFrames: 10,
  /** How long a parried attacker is staggered and open to a counter. */
  parriedFrames: 28,
  /** Counter hit (hitting startup, a stagger or an evade's recovery): bonus damage and hitstun. */
  counterDamage: 1.25,
  counterHitstun: 8,
  counterHitstop: 4,
} as const;

export const DEPTH = {
  bg: 0,
  petals: 5,
  dim: 7,
  shadow: 8,
  fighter: 10,
  fighterFront: 12,
  effects: 20,
  hud: 100,
  overlay: 200,
} as const;

export type Difficulty = 'easy' | 'normal' | 'hard';
export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'normal', 'hard'];

const DIFFICULTY_KEY = 'ama.difficulty';

export function loadDifficulty(): Difficulty {
  try {
    const saved = localStorage.getItem(DIFFICULTY_KEY);
    if (saved && (DIFFICULTIES as readonly string[]).includes(saved)) return saved as Difficulty;
  } catch {
    // Storage unavailable (private mode etc.) — fall back to default.
  }
  return 'normal';
}

export function saveDifficulty(d: Difficulty): void {
  try {
    localStorage.setItem(DIFFICULTY_KEY, d);
  } catch {
    // Non-critical.
  }
}
