import { MOVES, type MoveData, type MoveId } from '../combat/moves';
import type { FighterId } from '../entities/fighterDefs';
import { NEUTRAL, copyPose, mixPose, withPose, type Pose } from './poses';

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
}

const K = (t: number, p: Pose, e?: Ease): Key => ({ t, p, e });

// ------------------------------------------------------------------ shared clips

interface AttackKeys {
  windup: Partial<Pose>;
  strike: Partial<Pose>;
  follow: Partial<Pose>;
}

const TUCK: Partial<Pose> = { legF: [75, -105], legB: [15, -110] };

/** Strike poses are shared by both characters so hitboxes always match the visuals. */
const ATTACK_KEYS: Record<MoveId, AttackKeys> = {
  jab: {
    windup: { lean: 8, armF: [35, 118], armB: [25, 128] },
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
    strike: { lean: 15, armF: [70, 8], armB: [20, 130], legF: [70, -100], legB: [15, -110] },
    follow: { lean: 16, armF: [72, 6], armB: [20, 130], legF: [70, -100], legB: [15, -110] },
  },
  airKick: {
    windup: { lean: -4, armF: [55, 95], armB: [25, 120], legF: [80, -110], legB: [15, -110] },
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

function attackClip(stance: Pose, airRest: Pose, m: MoveData): Clip {
  const k = ATTACK_KEYS[m.id];
  const base = m.air ? airRest : stance;
  const windup = withPose(base, k.windup);
  const strike = withPose(base, k.strike);
  const follow = withPose(base, k.follow);
  const s = m.startup;
  const a = m.active;
  const end = s + a + m.recovery;
  const hold = Math.max(1, s - (s >= 6 ? 2 : 1));
  return {
    keys: [
      K(0, windup),
      K(hold, windup, 'out'),
      K(s, strike, 'snap'),
      K(s + a, follow, 'lin'),
      K(s + a + Math.round(m.recovery * 0.35), follow, 'lin'),
      K(end, base, 'io'),
    ],
  };
}

type PerCharacterClips = 'stance' | 'idle' | 'walk' | 'stride' | 'run' | 'runStride' | 'dash' | 'intro' | 'victory';

/**
 * Run cycle: the two legs swap every half cycle (reach → pass → reach → pass).
 * `upper` sets the torso and arms; `armsA`/`armsB` alternate them for an arm pump.
 */
function runCycle(stance: Pose, upper: Partial<Pose>, armsA: Partial<Pose>, armsB: Partial<Pose>): Clip {
  const P = (p: Partial<Pose>) => withPose(stance, { ...upper, ...p });
  const reachF = P({ ...armsA, legF: [65, -55], legB: [-35, -35] });
  const passF = P({ ...armsA, lift: 4, legF: [10, -25], legB: [45, -120] });
  const reachB = P({ ...armsB, legF: [-35, -35], legB: [65, -55] });
  const passB = P({ ...armsB, lift: 4, legF: [45, -120], legB: [10, -25] });
  return {
    keys: [K(0, reachF), K(8, passF, 'io'), K(16, reachB, 'io'), K(24, passB, 'io'), K(32, reachF, 'io')],
    loopFrom: 0,
  };
}

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

function sharedClips(stance: Pose): Omit<AnimSet, PerCharacterClips> {
  const P = (p: Partial<Pose>) => withPose(stance, p);

  const crouch = P({ lean: 16, head: 0, armF: [45, 100], armB: [25, 125], legF: [62, -85], legB: [12, -75] });
  const airLaunch = P({ lean: 4, squash: 1.08, armF: [60, 90], armB: [30, 120], legF: [15, -10], legB: [-12, -6] });
  const airTuck = P({ lean: 8, armF: [55, 95], armB: [30, 120], legF: [80, -120], legB: [30, -120] });
  const airFall = P({ lean: 4, armF: [50, 100], armB: [25, 125], legF: [25, -28], legB: [-12, -16] });
  const flipTuck = (rot: number) =>
    P({ lean: 30, head: 10, rootRot: rot, armF: [80, -25], armB: [70, -10], legF: [100, -145], legB: [70, -140] });

  const block = P({ lean: -2, head: 8, armF: [52, 118], armB: [38, 132], legF: [42, -50], legB: [-16, -18] });
  const blockRecoil = withPose(block, { lean: -12, bodyX: -8, head: 12, armF: [48, 124], armB: [34, 138] });

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

  const exhausted = P({
    lean: 32,
    head: 26,
    bodyX: 0,
    armF: [25, -30],
    armB: [15, -25],
    legF: [48, -58],
    legB: [-20, -30],
  });

  // Evade: drop, hop back with the guard up, land and reset.
  const evadeCrouch = P({ lean: -16, head: 8, squash: 0.9, armF: [50, 110], armB: [30, 120], legF: [55, -80], legB: [-5, -70] });
  const evadeHop = P({ lean: -20, head: 10, squash: 1.05, lift: 24, armF: [40, 100], armB: [10, 110], legF: [50, -100], legB: [10, -110] });
  const evadeFall = P({ lean: -10, head: 4, lift: 10, armF: [45, 105], armB: [20, 120], legF: [45, -70], legB: [-10, -50] });
  const evadeLand = P({ lean: -6, squash: 0.9, armF: [50, 105], armB: [25, 125], legF: [50, -70], legB: [-20, -30] });

  // Parry: the lead arm sweeps the attack up and away.
  const deflect = P({ lean: -8, head: -4, bodyX: -4, armF: [150, -30], armB: [40, 100], legF: [40, -46], legB: [-22, -10] });

  // Parried: thrown off balance, arms flung back, wide open.
  const reel = P({ lean: -30, head: -26, bodyX: -14, armF: [-50, 40], armB: [-80, 30], legF: [42, -50], legB: [-30, 0] });
  const reelSway = withPose(reel, { lean: -22, head: -16, bodyX: -10, armF: [-35, 50], armB: [-65, 40] });

  // Heavy hit: the whole body is knocked back and up for a moment.
  const heavyRecoil = P({ lean: -36, head: -34, bodyX: -16, lift: 4, armF: [-30, 40], armB: [-60, 30], legF: [50, -40], legB: [-20, -10] });

  const airRest = airFall;
  const attacks = {} as Record<MoveId, Clip>;
  for (const id of Object.keys(MOVES) as MoveId[]) attacks[id] = attackClip(stance, airRest, MOVES[id]);

  return {
    prejump: { keys: [K(0, withPose(crouch, { squash: 0.92 }))] },
    land: { keys: [K(0, withPose(crouch, { squash: 0.84 })), K(5, crouch, 'out')] },
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
      keys: [K(0, stance), K(20, exhausted, 'io'), K(40, withPose(exhausted, { lean: 28, head: 22 }), 'io'), K(60, exhausted, 'io')],
      loopFrom: 20,
    },
    attacks,
  };
}

// ------------------------------------------------------------------ per-character

function buildKaen(): AnimSet {
  // Aggressive, forward-leaning boxer stance with a bouncy idle.
  const stance = withPose(NEUTRAL, {
    lean: 10,
    head: -4,
    armF: [55, 100],
    armB: [25, 125],
    legF: [35, -40],
    legB: [-25, -2],
  });
  const P = (p: Partial<Pose>) => withPose(stance, p);
  const low = P({ lean: 12, armF: [58, 96], armB: [27, 122], legF: [46, -62], legB: [-14, -30] });
  const high = P({ lean: 9, armF: [53, 103], armB: [24, 127], legF: [33, -36], legB: [-26, 0] });

  const intro0 = P({ lean: 0, head: 0, armF: [60, 100], armB: [70, 95], legF: [12, -4], legB: [-10, 0] });
  const introPull = P({ lean: 4, head: -4, armF: [80, 80], armB: [-30, 120], legF: [30, -30], legB: [-20, -4] });
  const introPunch = P({ lean: 14, head: -2, armF: [80, 80], armB: [88, 5], legF: [36, -36], legB: [-26, 0] });

  const pumpWind = P({ lean: 20, head: 6, squash: 0.94, armF: [40, 110], armB: [20, 120], legF: [50, -66], legB: [-12, -34] });
  const pump = P({ lean: -6, head: -14, squash: 1.04, armF: [150, 35], armB: [-30, 70], legF: [22, -8], legB: [-18, 0] });

  return {
    stance,
    idle: { keys: [K(0, low), K(18, high, 'io'), K(36, low, 'io')], loopFrom: 0 },
    walk: {
      keys: [
        K(0, stance),
        K(8, P({ lean: 12, legF: [55, -55], legB: [-22, -4] }), 'io'),
        K(16, P({ lean: 12, legF: [44, -36], legB: [-34, 2] }), 'io'),
        K(24, P({ lean: 11, legF: [40, -40], legB: [-6, -50] }), 'io'),
        K(32, stance, 'io'),
      ],
      loopFrom: 0,
    },
    stride: 64,
    // Boxer's run: upright-ish, fists pumping.
    run: runCycle(
      stance,
      { lean: 20, head: -4 },
      { armF: [-20, 100], armB: [60, 80] },
      { armF: [60, 80], armB: [-20, 100] },
    ),
    runStride: 190,
    dash: dashClip(stance, { lean: 26, head: -6, armF: [80, 60], armB: [-45, 85] }),
    intro: {
      keys: [
        K(0, intro0),
        K(26, withPose(intro0, { head: -6 }), 'io'),
        K(38, introPull, 'out'),
        K(46, introPunch, 'snap'),
        K(70, withPose(introPunch, { lean: 12 }), 'lin'),
        K(86, stance, 'io'),
      ],
    },
    victory: {
      keys: [K(0, stance), K(10, pumpWind, 'io'), K(18, pump, 'snap'), K(24, withPose(pump, { squash: 1, armF: [146, 40] }), 'out'), K(44, withPose(pump, { squash: 1, armF: [152, 30], lean: -4 }), 'io'), K(64, withPose(pump, { squash: 1, armF: [146, 40] }), 'io')],
      loopFrom: 24,
    },
    ...sharedClips(stance),
  };
}

function buildYoru(): AnimSet {
  // Low, wide, composed stance: lead hand forward like a blade.
  const stance = withPose(NEUTRAL, {
    lean: 2,
    head: 2,
    armF: [70, 70],
    armB: [15, 135],
    legF: [45, -52],
    legB: [-35, 6],
  });
  const P = (p: Partial<Pose>) => withPose(stance, p);
  const breathe = P({ lean: 5, armF: [72, 66], legF: [48, -58], legB: [-32, 0] });

  // Arms folded across the chest: elbows at the ribs, forearms level.
  const crossed = P({ lean: -2, head: 18, armF: [10, 82], armB: [16, 76], legF: [10, -2], legB: [-8, 0] });
  const lookUp = withPose(crossed, { head: -6, lean: 0 });

  const cool = P({ lean: -4, head: 10, armF: [10, 82], armB: [16, 76], legF: [14, -4], legB: [-12, 0] });

  return {
    stance,
    idle: { keys: [K(0, stance), K(30, breathe, 'io'), K(60, stance, 'io')], loopFrom: 0 },
    walk: {
      keys: [
        K(0, stance),
        K(9, P({ legF: [62, -62], legB: [-30, 4] }), 'io'),
        K(18, P({ legF: [50, -44], legB: [-38, 10] }), 'io'),
        K(27, P({ legF: [46, -48], legB: [-12, -48] }), 'io'),
        K(36, stance, 'io'),
      ],
      loopFrom: 0,
    },
    stride: 70,
    // Shadow sprint: bent low, arms trailing straight back.
    run: runCycle(
      stance,
      { lean: 38, head: -14 },
      { armF: [-60, 20], armB: [-75, 15] },
      { armF: [-55, 18], armB: [-70, 12] },
    ),
    runStride: 200,
    dash: dashClip(stance, { lean: 40, head: -14, armF: [-60, 20], armB: [-75, 15] }),
    intro: {
      keys: [
        K(0, crossed),
        K(40, withPose(crossed, { head: 16 }), 'lin'),
        K(52, lookUp, 'io'),
        K(64, withPose(stance, { squash: 0.94 }), 'snap'),
        K(80, stance, 'out'),
      ],
    },
    victory: {
      keys: [K(0, stance), K(16, cool, 'io'), K(30, cool), K(60, withPose(cool, { head: 6, lean: -3 }), 'io'), K(90, cool, 'io')],
      loopFrom: 30,
    },
    ...sharedClips(stance),
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
