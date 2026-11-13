import { MOVES, type MoveData, type MoveId } from '../combat/moves';
import type { FighterId } from '../entities/fighterDefs';
import { gaitClip, stanceShift, standAt } from './gait';
import { NEUTRAL, copyPose, mixPose, withPose, type Pose } from './poses';
import type { StepStyle } from './skeleton';

export type Ease = 'lin' | 'io' | 'out' | 'in' | 'snap';

const EASE: Record<Ease, (u: number) => number> = {
  lin: (u) => u,
  io: (u) => 0.5 - Math.cos(u * Math.PI) / 2,
  out: (u) => 1 - (1 - u) * (1 - u),
  in: (u) => u * u,
  snap: (u) => 1 - Math.pow(1 - u, 4),
};

/** A keyframe. `e` is the easing used when arriving at this key from the previous one. */
export interface Key {
  t: number;
  p: Pose;
  e?: Ease;
}

/** Keyframes in logic steps. With `loopFrom`, time past the last key wraps back to it. */
export interface Clip {
  keys: Key[];
  loopFrom?: number;
}

export function clipLength(clip: Clip): number {
  return clip.keys[clip.keys.length - 1].t;
}

export function sampleClip(clip: Clip, time: number, out: Pose): void {
  const k = clip.keys;
  const end = k[k.length - 1].t;
  let t = time;
  if (clip.loopFrom !== undefined && t > end) {
    const span = end - clip.loopFrom;
    t = span > 0 ? clip.loopFrom + ((t - clip.loopFrom) % span) : end;
  }
  if (t <= k[0].t) {
    copyPose(out, k[0].p);
    return;
  }
  for (let i = 0; i < k.length - 1; i++) {
    const a = k[i];
    const b = k[i + 1];
    if (t < b.t) {
      const u = (t - a.t) / (b.t - a.t);
      mixPose(out, a.p, b.p, EASE[b.e ?? 'io'](u));
      return;
    }
  }
  copyPose(out, k[k.length - 1].p);
}

export interface AnimSet {
  stance: Pose;
  idle: Clip;
  /** Walk cycle, sampled by distance travelled (played backwards when retreating). */
  walk: Clip;
  stride: number;
  /** Run cycle, sampled by distance like the walk. */
  run: Clip;
  runStride: number;
  dash: Clip;
  /** Evade: a quick backward hop. */
  backdash: Clip;
  prejump: Clip;
  land: Clip;
  /** Braking out of a run: weight back, front foot skidding. */
  skid: Clip;
  airNeutral: Clip;
  airFlipF: Clip;
  airFlipB: Clip;
  block: Clip;
  blockstun: Clip;
  /** Successful parry: the guard sweeps the attack aside. */
  parry: Clip;
  /** Attacker after being parried: staggered, arms thrown wide. */
  parried: Clip;
  hitHigh: Clip;
  hitBody: Clip;
  /** Heavy hit: a big stagger. */
  hitHeavy: Clip;
  knockdown: Clip;
  down: Clip;
  getup: Clip;
  lose: Clip;
  intro: Clip;
  victory: Clip;
  attacks: Record<MoveId, Clip>;
  /** How this character's feet re-step when the stance shifts. */
  step: StepStyle;
  /** Steps a turn-around takes (the body swings through edge-on). */
  turnFrames: number;
}

const K = (t: number, p: Pose, e?: Ease): Key => ({ t, p, e });

// ------------------------------------------------------------------ shared clips

interface AttackKeys {
  /** Anticipation: reached quickly at the start of the move. */
  windup: Partial<Pose>;
  /** Deepest point of the anticipation, held into the last frames before the strike. */
  coil?: Partial<Pose>;
  /** Contact pose on the first active frame — the hitbox in moves.ts sits on this limb. */
  strike: Partial<Pose>;
  /** End of the active frames (the strike pushing a little further through). */
  follow: Partial<Pose>;
  /** Follow-through carried into early recovery. */
  after?: Partial<Pose>;
  /**
   * Frames the strike takes to reach the target from the coil: 2 (accelerating) or 1 (a single
   * smear frame — for fast moves whose hitbox starts so close to the body that any half-way
   * pose would already be touching it).
   */
  approach?: 1 | 2;
}

/** Per-character changes to the shared attack keys (merged field by field). */
type AttackOverrides = Partial<Record<MoveId, Partial<AttackKeys>>>;

/** How a character comes out of an attack. */
interface Recovery {
  /** Fraction of recovery spent carrying the follow-through. */
  carry: number;
  /** Fraction of recovery at which the settle pose is reached. */
  settleAt: number;
  /** Settle pose relative to the base pose (Kaen bounces, Yoru resets precisely). */
  settle: (base: Pose) => Partial<Pose>;
}

interface Style {
  attacks: AttackOverrides;
  recovery: Recovery;
  block: Partial<Pose>;
}

const TUCK: Partial<Pose> = { legF: [75, -105], legB: [15, -110] };

/** Strike poses are shared by both characters so hitboxes always match the visuals. */
const ATTACK_KEYS: Record<MoveId, AttackKeys> = {
  jab: {
    windup: { lean: 8, armF: [35, 118], armB: [25, 128] },
    coil: { lean: 6, armF: [22, 138] },
    approach: 1,
    strike: { lean: 14, bodyX: 6, head: 0, armF: [93, -3], armB: [20, 135] },
    follow: { lean: 16, bodyX: 7, head: 0, armF: [95, -5], armB: [20, 135] },
  },
  cross: {
    windup: { lean: 2, bodyX: -4, head: 0, armF: [60, 95], armB: [5, 130] },
    strike: { lean: 24, bodyX: 14, head: 6, armF: [25, 120], armB: [95, -5], legF: [42, -46], legB: [-30, 8] },
    follow: { lean: 26, bodyX: 15, head: 6, armF: [25, 120], armB: [97, -6], legF: [42, -46], legB: [-30, 8] },
  },
  frontKick: {
    windup: { lean: -4, head: 0, armF: [50, 100], armB: [30, 120], legF: [105, -130], legB: [-6, 0] },
    strike: { lean: -14, head: 0, armF: [35, 110], armB: [10, 125], legF: [92, -4], legB: [-6, 0] },
    follow: { lean: -16, head: 0, armF: [35, 110], armB: [10, 125], legF: [94, -2], legB: [-6, 0] },
  },
  roundhouse: {
    windup: { lean: -8, bodyX: -6, head: 0, armF: [60, 90], armB: [-25, 55], legF: [85, -115], legB: [-12, 2] },
    strike: { lean: -28, bodyX: 4, head: -6, armF: [-25, 30], armB: [70, 40], legF: [116, -4], legB: [-14, 2] },
    follow: { lean: -30, bodyX: 4, head: -6, armF: [-30, 30], armB: [75, 40], legF: [120, -2], legB: [-14, 2] },
  },
  airPunch: {
    windup: { lean: 6, armF: [30, 115], armB: [25, 125], ...TUCK },
    approach: 1,
    strike: { lean: 15, armF: [70, 8], armB: [20, 130], legF: [70, -100], legB: [15, -110] },
    follow: { lean: 16, armF: [72, 6], armB: [20, 130], legF: [70, -100], legB: [15, -110] },
  },
  airKick: {
    windup: { lean: -4, armF: [55, 95], armB: [25, 120], legF: [80, -110], legB: [15, -110] },
    approach: 1,
    strike: { lean: -12, armF: [60, 90], armB: [-20, 70], legF: [60, 8], legB: [10, -115] },
    follow: { lean: -13, armF: [60, 90], armB: [-20, 70], legF: [62, 6], legB: [10, -115] },
  },
  // Kaen: twists away with the rear fist cocked behind the head, then a lunging haymaker.
  flameStrike: {
    windup: { lean: -10, bodyX: -8, head: 4, squash: 0.95, armF: [70, 80], armB: [-70, 110], legF: [48, -58], legB: [-30, 2] },
    strike: { lean: 30, bodyX: 18, head: 6, squash: 1, armF: [20, 120], armB: [100, -6], legF: [55, -45], legB: [-40, 5] },
    follow: { lean: 32, bodyX: 19, head: 6, squash: 1, armF: [20, 120], armB: [102, -8], legF: [55, -45], legB: [-40, 5] },
  },
  // Yoru: blade hand raised high, glides in and cuts down through the target.
  shadowSlash: {
    windup: { lean: -8, bodyX: -6, head: 6, armF: [160, 60], armB: [-30, 60], legF: [44, -52], legB: [-34, 4] },
    strike: { lean: 18, bodyX: 14, head: -4, armF: [135, -10], armB: [-50, 40], legF: [58, -50], legB: [-42, 6] },
    follow: { lean: 30, bodyX: 16, head: -8, armF: [95, -5], armB: [-55, 40], legF: [58, -50], legB: [-42, 6] },
  },
  // Kaen: fist chambered at the hip while flame gathers, then a deep straight punch launches it.
  fireball: {
    windup: { lean: -6, bodyX: -6, head: 2, squash: 0.95, armF: [-20, 120], armB: [70, 80], legF: [48, -58], legB: [-32, 4] },
    strike: { lean: 22, bodyX: 12, head: 4, squash: 1, armF: [92, -2], armB: [10, 120], legF: [46, -50], legB: [-36, 8] },
    follow: { lean: 24, bodyX: 13, head: 4, squash: 1, armF: [93, -3], armB: [10, 120], legF: [46, -50], legB: [-36, 8] },
  },
  // Yoru: drops low with arms swept back, sprints, and finishes with a blade-hand strike.
  shadowDash: {
    windup: { lean: 28, head: -10, bodyX: -4, squash: 0.92, armF: [-40, 30], armB: [-60, 20], legF: [62, -86], legB: [8, -72] },
    strike: { lean: 42, head: -16, bodyX: 8, squash: 1, armF: [-50, 20], armB: [-70, 10], legF: [70, -40], legB: [-40, -30] },
    follow: { lean: 18, head: -4, bodyX: 10, squash: 1, armF: [88, 10], armB: [-40, 30], legF: [55, -70], legB: [-22, -20] },
  },
};

function mergeKeys(shared: AttackKeys, over: Partial<AttackKeys> | undefined): AttackKeys {
  if (!over) return shared;
  const merge = (a?: Partial<Pose>, b?: Partial<Pose>) => (a || b ? { ...a, ...b } : undefined);
  return {
    windup: { ...shared.windup, ...over.windup },
    coil: merge(shared.coil, over.coil),
    strike: { ...shared.strike, ...over.strike },
    follow: { ...shared.follow, ...over.follow },
    after: merge(shared.after, over.after),
    approach: over.approach ?? shared.approach,
  };
}

/**
 * Attack timing, locked to the move's frame data:
 *   0 → ready         windup (anticipation), eased out
 *   ready → s-2       coil: the anticipation deepens and holds
 *   s-2 → s           the strike accelerates in (ease-in): the limb reaches the hitbox exactly on
 *                     the first active frame, never before
 *   s → s+a           active: pushes a little further through the target
 *   recovery          follow-through carries on, the character settles (in their own style)
 *                     and returns to the base pose by the move's last frame
 * A spin (strike.turn = 2) keeps its full turn to the end; the rig wraps it when the next clip starts.
 */
function attackClip(stance: Pose, airRest: Pose, m: MoveData, k: AttackKeys, rec: Recovery): Clip {
  const base = m.air ? airRest : stance;
  const strike = withPose(base, k.strike);
  const spin = strike.turn;
  const at = (p: Partial<Pose>) => withPose(base, { ...p, turn: p.turn ?? (spin ? spin : 0) });
  const windup = withPose(base, k.windup);
  const coil = withPose(base, { ...k.windup, ...k.coil });
  const follow = at(k.follow);
  const after = at({ ...k.follow, ...k.after });
  const settle = withPose(base, { ...rec.settle(base), turn: spin });
  const rest = withPose(base, { turn: spin });
  const s = m.startup;
  const a = m.active;
  const r = m.recovery;
  const approach = k.approach ?? 2;
  const ready = Math.max(1, Math.min(s - approach, Math.round(s * 0.45)));
  const keys: Key[] = [K(0, windup)];
  if (s - approach > ready) keys.push(K(ready, windup, 'out'));
  keys.push(K(Math.max(ready, s - approach), coil, 'io'), K(s, strike, 'in'), K(s + a, follow, 'out'));
  const carry = s + a + Math.max(1, Math.round(r * rec.carry));
  const settleT = Math.max(carry + 1, s + a + Math.round(r * rec.settleAt));
  keys.push(K(carry, after, 'out'));
  // Short recoveries (air moves, the jab) just return; long ones show the character's settle.
  if (r >= 12 && settleT < s + a + r) keys.push(K(settleT, settle, 'io'));
  keys.push(K(s + a + r, rest, 'io'));
  return { keys };
}

type PerCharacterClips =
  | 'stance'
  | 'idle'
  | 'walk'
  | 'stride'
  | 'run'
  | 'runStride'
  | 'dash'
  | 'intro'
  | 'victory'
  | 'step'
  | 'turnFrames';

/** Forward dash: crouched launch, one long extended stride, settle. */
function dashClip(stance: Pose, upper: Partial<Pose>): Clip {
  const P = (p: Partial<Pose>) => withPose(stance, { ...upper, ...p });
  const launch = P({ squash: 0.92, legF: [70, -80], legB: [-35, -10] });
  const stride = P({ lift: 8, squash: 1.04, legF: [55, -20], legB: [-55, -45] });
  const gather = P({ lift: 3, legF: [30, -70], legB: [-20, -60] });
  return {
    keys: [K(0, launch), K(4, stride, 'out'), K(11, gather, 'io'), K(16, withPose(stance, { lean: stance.lean + 8 }), 'io')],
  };
}

function sharedClips(stance: Pose, style: Style): Omit<AnimSet, PerCharacterClips> {
  const P = (p: Partial<Pose>) => withPose(stance, p);

  const crouch = P({ lean: 16, head: 0, armF: [45, 100], armB: [25, 125], legF: [62, -85], legB: [12, -75] });
  const airLaunch = P({ lean: 4, squash: 1.08, armF: [60, 90], armB: [30, 120], legF: [15, -10], legB: [-12, -6] });
  const airTuck = P({ lean: 8, armF: [55, 95], armB: [30, 120], legF: [80, -120], legB: [30, -120] });
  const airFall = P({ lean: 4, armF: [50, 100], armB: [25, 125], legF: [25, -28], legB: [-12, -16] });
  const flipTuck = (rot: number) =>
    P({ lean: 30, head: 10, rootRot: rot, armF: [80, -25], armB: [70, -10], legF: [100, -145], legB: [70, -140] });

  const block = P({ lean: -2, head: 8, armF: [52, 118], armB: [38, 132], legF: [42, -50], legB: [-16, -18], ...style.block });
  const blockRecoil = withPose(block, { lean: block.lean - 10, bodyX: -8, head: block.head + 4 });

  const hitHigh = P({
    lean: -26,
    head: -30,
    bodyX: -10,
    armF: [-15, 50],
    armB: [-40, 40],
    legF: [42, -52],
    legB: [-28, 4],
  });
  const hitBody = P({
    lean: 32,
    head: 22,
    bodyX: -10,
    armF: [25, 60],
    armB: [10, 70],
    legF: [50, -64],
    legB: [-12, -40],
  });
  const guardBack = P({ lean: -6, head: -4, armF: [30, 100], armB: [10, 120] });

  const knock1 = P({
    lean: -60,
    head: -25,
    rootRot: -15,
    lying: 0.3,
    armF: [-120, 30],
    armB: [-150, 20],
    legF: [70, -25],
    legB: [40, -45],
  });
  const knock2 = withPose(knock1, { lean: -80, rootRot: -28, lying: 0.6, legF: [82, -12], legB: [60, -30] });

  const downImpact = P({
    lying: 1,
    lean: -90,
    head: -8,
    rootRot: 0,
    squash: 0.88,
    armF: [-95, 8],
    armB: [-100, -8],
    legF: [70, 10],
    legB: [76, -4],
  });
  const downRest = withPose(downImpact, { squash: 1, legF: [88, 2], legB: [92, -6], head: -6 });
  const sitUp = P({
    lying: 0.55,
    lean: -40,
    head: 0,
    armF: [-70, 20],
    armB: [-90, 10],
    legF: [80, -120],
    legB: [60, -110],
  });

  // Both feet flat: the slumped body sits low over a wide, tired stance.
  const exhausted = standAt(P({ lean: 32, head: 26, bodyX: 0, armF: [25, -30], armB: [15, -25] }), [29, -54], 80);

  // Evade: drop, hop back with the guard up, land and reset.
  const evadeCrouch = P({ lean: -16, head: 8, squash: 0.9, armF: [50, 110], armB: [30, 120], legF: [55, -80], legB: [-5, -70] });
  const evadeHop = P({ lean: -20, head: 10, squash: 1.05, lift: 24, armF: [40, 100], armB: [10, 110], legF: [50, -100], legB: [10, -110] });
  const evadeFall = P({ lean: -10, head: 4, lift: 10, armF: [45, 105], armB: [20, 120], legF: [45, -70], legB: [-10, -50] });
  const evadeLand = P({ lean: -6, squash: 0.9, armF: [50, 105], armB: [25, 125], legF: [50, -70], legB: [-20, -30] });

  // Parry: the lead arm sweeps the attack up and away; the feet stay in the guard stance.
  const deflect = withPose(block, { lean: -8, head: -4, bodyX: -4, armF: [150, -30], armB: [40, 100] });

  // Parried: thrown off balance, arms flung back, wide open.
  const reel = P({ lean: -30, head: -26, bodyX: -14, armF: [-50, 40], armB: [-80, 30], legF: [42, -50], legB: [-30, 0] });
  const reelSway = withPose(reel, { lean: -22, head: -16, bodyX: -10, armF: [-35, 50], armB: [-65, 40] });

  // Heavy hit: the whole body is knocked back and up for a moment.
  const heavyRecoil = P({ lean: -36, head: -34, bodyX: -16, lift: 4, armF: [-30, 40], armB: [-60, 30], legF: [50, -40], legB: [-20, -10] });

  const airRest = airFall;
  const attacks = {} as Record<MoveId, Clip>;
  for (const id of Object.keys(MOVES) as MoveId[]) {
    attacks[id] = attackClip(stance, airRest, MOVES[id], mergeKeys(ATTACK_KEYS[id], style.attacks[id]), style.recovery);
  }

  // Landing: feet touch down with the legs still long, then the knees absorb the fall — the feet
  // stay exactly where they landed (the crouch's own foot spots).
  const crouchFeet: [number, number] = [25, -35];
  const touchDown = standAt(P({ lean: 6, squash: 0.97, armF: [60, 90], armB: [35, 110] }), crouchFeet, 90);
  const absorb = standAt(withPose(crouch, { squash: 0.86, armF: [50, 100], armB: [30, 118] }), crouchFeet, 66);
  const settled = standAt(crouch, crouchFeet, 72);
  // Jump anticipation: dip, arms swing back.
  const dip = P({ lean: 12, squash: 0.97, armF: [40, 105], armB: [15, 120], legF: [50, -62], legB: [-6, -42] });
  const load = withPose(crouch, { squash: 0.9, lean: 20, armF: [-10, 80], armB: [-30, 70] });
  // Braking out of a run: weight thrown back over a skidding front foot.
  const brake = P({ lean: -8, head: 8, squash: 0.95, armF: [80, 50], armB: [40, 90], legF: [66, -40], legB: [-4, -70] });

  return {
    prejump: { keys: [K(0, dip), K(4, load, 'out')] },
    land: { keys: [K(0, touchDown), K(3, absorb, 'out'), K(8, settled, 'io')] },
    skid: { keys: [K(0, brake), K(5, withPose(brake, { lean: -2, squash: 0.92 }), 'out'), K(12, crouch, 'io')] },
    airNeutral: {
      keys: [K(0, airLaunch), K(8, airTuck, 'out'), K(22, airTuck), K(32, airFall, 'io')],
    },
    airFlipF: {
      keys: [K(0, airLaunch), K(5, flipTuck(0), 'out'), K(27, flipTuck(360), 'io'), K(33, withPose(airFall, { rootRot: 360 }), 'out')],
    },
    airFlipB: {
      keys: [K(0, airLaunch), K(5, flipTuck(0), 'out'), K(27, flipTuck(-360), 'io'), K(33, withPose(airFall, { rootRot: -360 }), 'out')],
    },
    backdash: {
      keys: [K(0, evadeCrouch), K(4, evadeHop, 'out'), K(12, evadeFall, 'io'), K(16, evadeLand, 'in'), K(24, stance, 'io')],
    },
    block: { keys: [K(0, block)] },
    blockstun: { keys: [K(0, blockRecoil), K(7, block, 'out')] },
    parry: {
      keys: [K(0, block), K(2, deflect, 'snap'), K(10, withPose(deflect, { lean: -4, armF: [135, -20] }), 'out')],
    },
    parried: {
      keys: [
        K(0, reel),
        K(5, withPose(reel, { lean: -36, head: -32, bodyX: -18 }), 'out'),
        K(14, reelSway, 'io'),
        K(22, withPose(reel, { lean: -32, head: -28 }), 'io'),
        K(30, reelSway, 'io'),
      ],
      loopFrom: 14,
    },
    hitHeavy: {
      keys: [
        K(0, heavyRecoil),
        K(5, withPose(heavyRecoil, { lean: -42, head: -40, bodyX: -20, lift: 6 }), 'out'),
        K(14, withPose(heavyRecoil, { lean: -24, head: -18, bodyX: -12, lift: 0, legF: [46, -60], legB: [-30, 0] }), 'io'),
        K(22, withPose(guardBack, { lean: -10 }), 'io'),
        K(30, stance, 'io'),
      ],
    },
    hitHigh: {
      keys: [
        K(0, hitHigh),
        K(4, withPose(hitHigh, { lean: -32, head: -36, bodyX: -12 }), 'out'),
        K(12, withPose(guardBack, { lean: -14, head: -12 }), 'io'),
        K(20, stance, 'io'),
      ],
    },
    hitBody: {
      keys: [
        K(0, hitBody),
        K(4, withPose(hitBody, { lean: 38, head: 26 }), 'out'),
        K(12, withPose(hitBody, { lean: 16, head: 8, bodyX: -4 }), 'io'),
        K(20, stance, 'io'),
      ],
    },
    knockdown: { keys: [K(0, hitHigh), K(6, knock1, 'out'), K(14, knock2, 'io')] },
    down: { keys: [K(0, downImpact), K(5, downRest, 'out')] },
    getup: { keys: [K(0, downRest), K(7, sitUp, 'out'), K(13, crouch, 'io'), K(18, stance, 'out')] },
    lose: {
      keys: [...stanceShift(stance, exhausted, 20, ['B'], 10), K(40, withPose(exhausted, { lean: 28, head: 22 }), 'io'), K(60, exhausted, 'io')],
      loopFrom: 20,
    },
    attacks,
  };
}

// ------------------------------------------------------------------ per-character

const wave = (u: number, phase = 0): number => Math.sin(2 * Math.PI * (u - phase));

// Kaen — aggressive. Punches drive forward off the back foot with big torso turn; kicks explode
// through the target; the flame strike is a rising uppercut; he bounces back into his stance.
const KAEN: Style = {
  attacks: {
    jab: {
      strike: { lean: 18, bodyX: 9, armF: [93, -3], armB: [22, 132], legB: [-30, 2] },
      follow: { lean: 19, bodyX: 10, armF: [95, -5], armB: [22, 132], legB: [-30, 2] },
    },
    cross: {
      windup: { lean: 0, bodyX: -6, armF: [62, 92], armB: [0, 130], legB: [-22, -6] },
      coil: { lean: -3, bodyX: -8, head: 2 },
      strike: { lean: 28, bodyX: 16, head: 8, armF: [22, 128], armB: [95, -5], legF: [44, -48], legB: [-38, 10] },
      follow: { lean: 30, bodyX: 17, head: 8, armF: [22, 128], armB: [97, -6], legF: [44, -48], legB: [-38, 10] },
      after: { lean: 26, bodyX: 15, armB: [80, 20] },
    },
    // Support leg angled back to where the guard planted the back foot (no slide onto one leg).
    frontKick: {
      windup: { lean: -2, armF: [50, 100], armB: [30, 120], legF: [108, -135], legB: [-24, -8] },
      coil: { lean: -6, legF: [112, -138], armB: [40, 110], legB: [-25, -8] },
      strike: { lean: -16, armF: [30, 110], armB: [0, 120], legF: [92, -4], legB: [-28, -6] },
      follow: { lean: -18, armF: [30, 110], armB: [0, 120], legF: [95, -2], legB: [-28, -6] },
      after: { lean: -20, armB: [-10, 110], legF: [104, -30], legB: [-28, -6] },
    },
    roundhouse: {
      windup: { legB: [-24, -8] },
      coil: { lean: -11, bodyX: -8, legF: [92, -125], armB: [-30, 50], legB: [-22, -8] },
      strike: { legB: [-26, -6] },
      follow: { legB: [-26, -6] },
      after: { lean: -34, bodyX: 6, head: -8, armF: [-40, 30], armB: [80, 40], legF: [134, -10], legB: [-28, -6] },
    },
    // Rising uppercut: sinks low with the rear fist loaded at the hip, then drives up through the
    // legs; the fist meets the hitbox at chin height and carries on skyward with a little hop.
    flameStrike: {
      windup: { lean: 16, bodyX: -4, head: 8, squash: 0.95, armF: [60, 95], armB: [-35, 100], legF: [58, -86], legB: [-8, -58] },
      coil: { lean: 22, bodyX: -6, head: 10, squash: 0.92, armB: [-48, 110], legF: [64, -96], legB: [-2, -66] },
      strike: { lean: 8, bodyX: 18, head: -2, squash: 1.03, armF: [30, 120], armB: [80, 40], legF: [42, -36], legB: [-38, 4] },
      follow: { lean: 6, bodyX: 19, head: -4, squash: 1.04, armF: [30, 120], armB: [84, 42], legF: [40, -32], legB: [-38, 4] },
      after: { lean: -6, bodyX: 20, head: -12, squash: 1.04, lift: 7, armF: [20, 110], armB: [150, 20], legF: [30, -40], legB: [-30, -10] },
    },
    fireball: {
      coil: { lean: -9, bodyX: -8, armF: [-28, 125] },
    },
  },
  recovery: {
    carry: 0.3,
    settleAt: 0.72,
    // Bounces back: a quick dip at the knees before rising into the stance.
    settle: (b) => ({
      lean: b.lean + 5,
      head: b.head + 3,
      squash: 0.96,
      legF: [b.legF[0] + 8, b.legF[1] - 16],
      legB: [b.legB[0] + 8, b.legB[1] - 16],
    }),
  },
  // Peek-a-boo: fists up by the face, chin tucked, leaning into it.
  block: { lean: 6, head: 12, armF: [42, 124], armB: [30, 142], legF: [44, -56], legB: [-18, -24] },
};

// Yoru — controlled. Low stance, compact strikes that return along the same line, a crescent
// front kick, a spinning heel kick, and a precise reset to guard.
const YORU: Style = {
  attacks: {
    jab: {
      windup: { lean: 2, armF: [46, 104], armB: [15, 135] },
      coil: { lean: 1, armF: [42, 110] },
      strike: { lean: 8, bodyX: 5, head: 2, armF: [92, -2], armB: [15, 135] },
      follow: { lean: 8, bodyX: 5, head: 2, armF: [93, -3], armB: [15, 135] },
    },
    cross: {
      windup: { lean: 0, bodyX: -3, armF: [66, 74], armB: [8, 132] },
      strike: { lean: 18, bodyX: 11, head: 4, armF: [40, 112], armB: [94, -4], legF: [48, -54], legB: [-38, 8] },
      follow: { lean: 19, bodyX: 11, head: 4, armF: [40, 112], armB: [95, -5], legF: [48, -54], legB: [-38, 8] },
    },
    // Crescent kick: chambers high and the leg arcs up and over after it lands.
    frontKick: {
      windup: { lean: 0, armF: [70, 70], armB: [20, 130], legF: [112, -140], legB: [-34, -8] },
      coil: { lean: -2, legF: [116, -142], legB: [-34, -8] },
      strike: { lean: -10, armF: [70, 70], armB: [5, 125], legF: [92, -6], legB: [-36, -6] },
      follow: { lean: -11, armF: [70, 70], armB: [5, 125], legF: [95, -4], legB: [-36, -6] },
      after: { lean: -14, legF: [128, -6], legB: [-36, -6] },
    },
    // Spinning heel kick: turns her back to the opponent, whips round and lands it facing them.
    roundhouse: {
      windup: { turn: 0.35, lean: -4, bodyX: -4, head: 0, armF: [40, 100], armB: [20, 110], legF: [60, -90], legB: [-10, 0] },
      coil: { turn: 1.6, lean: -16, bodyX: -2, head: -4, armF: [5, 70], armB: [50, 60], legF: [84, -70], legB: [-12, 2] },
      strike: { turn: 2 },
      follow: { turn: 2 },
      after: { lean: -32, legF: [126, -6] },
    },
  },
  recovery: {
    carry: 0.22,
    settleAt: 0.5,
    // Resets precisely: back to guard early, chin down, and holds still.
    settle: (b) => ({ lean: b.lean - 1, head: b.head + 3 }),
  },
  // Forearm shield: lead forearm upright in front of the face, low and braced.
  block: { lean: -4, head: 6, armF: [62, 100], armB: [22, 132], legF: [52, -66], legB: [-30, -8] },
};

function buildKaen(): AnimSet {
  // Aggressive, forward-leaning boxer stance with a bouncy idle.
  const stance = withPose(NEUTRAL, {
    lean: 10,
    head: -4,
    armF: [55, 100],
    armB: [25, 125],
    legF: [37, -44],
    legB: [-23, -8],
  });
  const P = (p: Partial<Pose>) => withPose(stance, p);
  const low = P({ lean: 12, armF: [58, 96], armB: [27, 122], legF: [46, -62], legB: [-14, -30] });
  const high = P({ lean: 9, armF: [53, 103], armB: [24, 127], legF: [38, -46], legB: [-22, -10] });

  const intro0 = P({ lean: 0, head: 0, armF: [60, 100], armB: [70, 95], legF: [12, -4], legB: [-10, 0] });
  const introPull = P({ lean: 4, head: -4, armF: [80, 80], armB: [-30, 120], legF: [30, -30], legB: [-20, -4] });
  const introPunch = P({ lean: 14, head: -2, armF: [80, 80], armB: [88, 5], legF: [36, -36], legB: [-26, 0] });

  const pumpWind = P({ lean: 20, head: 6, squash: 0.94, armF: [40, 110], armB: [20, 120], legF: [50, -66], legB: [-12, -34] });
  const pump = P({ lean: -6, head: -14, squash: 1.04, armF: [150, 35], armB: [-30, 70], legF: [26, -16], legB: [-16, -8] });

  return {
    stance,
    idle: { keys: [K(0, low), K(18, high, 'io'), K(36, low, 'io')], loopFrom: 0 },
    // Boxer's shuffle: quick, springy steps with a bounce on each landing; guard stays up.
    walk: gaitClip(stance, {
      stride: 92,
      duty: 0.54,
      liftOff: [0, 0.5],
      footX: [22, -30],
      hipLow: 80,
      hipHigh: 84,
      bobPhase: 0.5,
      bobsPerCycle: 2,
      stepHeight: 12,
      upper: (u) => ({
        lean: 12 + wave(u * 2, 0.1) * 1.2,
        head: -4,
        armF: [55 + wave(u) * 4, 100],
        armB: [25 - wave(u) * 4, 125],
      }),
    }),
    stride: 92,
    // Boxer's run: chest up, fists pumping against the legs, high knees.
    run: gaitClip(stance, {
      stride: 184,
      duty: 0.36,
      liftOff: [0, 0.5],
      footX: [8, 4],
      hipLow: 80,
      hipHigh: 87,
      bobPhase: 0.32,
      bobsPerCycle: 2,
      stepHeight: 40,
      heelKick: 24,
      upper: (u) => {
        const a = 0.5 + 0.5 * Math.cos(2 * Math.PI * (u - 0.64));
        return {
          lean: 20 + wave(u * 2, 0.07) * 2,
          head: -4,
          armF: [60 - 80 * a, 80 + 20 * a],
          armB: [-20 + 80 * a, 100 - 20 * a],
        };
      },
    }),
    runStride: 184,
    dash: dashClip(stance, { lean: 26, head: -6, armF: [80, 60], armB: [-45, 85] }),
    intro: {
      keys: [
        K(0, intro0),
        ...stanceShift(intro0, withPose(introPull, { lean: 2 }), 26, ['B', 'F'], 10).map((k) => ({ ...k, t: k.t + 12 })),
        K(46, introPunch, 'snap'),
        K(70, withPose(introPunch, { lean: 12 }), 'lin'),
        K(86, stance, 'io'),
      ],
    },
    victory: {
      keys: [
        ...stanceShift(stance, standAt(pumpWind, [27, -36], 78), 10, ['B'], 12),
        K(18, pump, 'snap'),
        K(24, withPose(pump, { squash: 1, armF: [146, 40] }), 'out'),
        K(44, withPose(pump, { squash: 1, armF: [152, 30], lean: -4 }), 'io'),
        K(64, withPose(pump, { squash: 1, armF: [146, 40] }), 'io'),
      ],
      loopFrom: 24,
    },
    step: { frames: 6, height: 13 },
    turnFrames: 7,
    ...sharedClips(stance, KAEN),
  };
}

function buildYoru(): AnimSet {
  // Low, wide, composed stance: lead hand forward like a blade.
  const stance = withPose(NEUTRAL, {
    lean: 2,
    head: 2,
    armF: [70, 70],
    armB: [15, 135],
    legF: [52, -64],
    legB: [-36, -2],
  });
  const P = (p: Partial<Pose>) => withPose(stance, p);
  const breathe = P({ lean: 5, armF: [72, 66], legF: [55, -70], legB: [-33, -8] });

  // Arms folded across the chest: elbows at the ribs, forearms level.
  const crossed = P({ lean: -2, head: 18, armF: [10, 82], armB: [16, 76], legF: [10, -2], legB: [-8, 0] });
  const lookUp = withPose(crossed, { head: -6, lean: 0 });

  const cool = P({ lean: -4, head: 10, armF: [10, 82], armB: [16, 76], legF: [14, -4], legB: [-12, 0] });

  return {
    stance,
    idle: { keys: [K(0, stance), K(30, breathe, 'io'), K(60, stance, 'io')], loopFrom: 0 },
    // Glide: low and level, feet skimming the floor, the lead hand never moves.
    walk: gaitClip(stance, {
      stride: 100,
      duty: 0.56,
      liftOff: [0, 0.5],
      footX: [26, -34],
      hipLow: 74,
      hipHigh: 76,
      bobPhase: 0.5,
      bobsPerCycle: 2,
      stepHeight: 8,
      upper: (u) => ({ lean: 4 + wave(u * 2) * 0.6, head: 2, armF: [70, 70], armB: [15 + wave(u) * 3, 135] }),
    }),
    stride: 100,
    // Shadow sprint: bent low, arms trailing straight back, long low strides.
    run: gaitClip(stance, {
      stride: 200,
      duty: 0.34,
      liftOff: [0, 0.5],
      footX: [10, 6],
      hipLow: 72,
      hipHigh: 78,
      bobPhase: 0.32,
      bobsPerCycle: 2,
      stepHeight: 30,
      heelKick: 18,
      upper: (u) => ({
        lean: 38 + wave(u * 2, 0.07) * 1.5,
        head: -14,
        armF: [-60 + wave(u) * 4, 20],
        armB: [-75 - wave(u) * 4, 15],
      }),
    }),
    runStride: 200,
    dash: dashClip(stance, { lean: 40, head: -14, armF: [-60, 20], armB: [-75, 15] }),
    intro: {
      keys: [
        K(0, crossed),
        K(40, withPose(crossed, { head: 16 }), 'lin'),
        K(52, lookUp, 'io'),
        K(58, withPose(stance, { lean: 6, head: -4, lift: 48, squash: 1.03, armF: [60, 80], armB: [10, 120], legF: [70, -100], legB: [-10, -90] }), 'out'),
        K(64, withPose(stance, { squash: 0.92 }), 'in'),
        K(80, stance, 'out'),
      ],
    },
    victory: {
      keys: [...stanceShift(stance, cool, 16, ['B', 'F'], 8), K(30, cool), K(60, withPose(cool, { head: 6, lean: -3 }), 'io'), K(90, cool, 'io')],
      loopFrom: 30,
    },
    step: { frames: 5, height: 8 },
    turnFrames: 5,
    ...sharedClips(stance, YORU),
  };
}

const cache = new Map<FighterId, AnimSet>();

export function getAnimSet(id: FighterId): AnimSet {
  let set = cache.get(id);
  if (!set) {
    set = id === 'kaen' ? buildKaen() : buildYoru();
    cache.set(id, set);
  }
  return set;
}

/** Frame in each character's intro where their power-up effect fires. */
export const INTRO_CUE: Record<FighterId, number> = { kaen: 46, yoru: 64 };
