// Procedural walk/run cycles: feet follow planned paths on the floor and the legs are solved
// with IK, so a planted foot moves backward under the body at exactly the travel speed (no foot
// sliding by construction). The output is an ordinary keyframe clip, sampled by distance.
import type { Clip, Key } from './animations';
import { withPose, type Pose } from './poses';
import { FOOT_CLEARANCE, hipSockets, legIK, type Leg } from './skeleton';

export interface GaitSpec {
  /** Body travel per cycle (px) — the clip is sampled by distance with this stride. */
  stride: number;
  /** Fraction of the cycle each foot is on the floor (> 0.5 walks, < 0.5 runs with a flight). */
  duty: number;
  /** Cycle phase at which each foot lifts off: [front, back]. */
  liftOff: [number, number];
  /** Centre of each foot's planted span, relative to the hip (px): [front, back]. */
  footX: [number, number];
  /** Hip height above the floor at the low and high point of the bob. */
  hipLow: number;
  hipHigh: number;
  /** Cycle phases where the hip is lowest (bob = cos wave through these). */
  bobPhase: number;
  bobsPerCycle: number;
  /** Peak swing-foot height above the floor. */
  stepHeight: number;
  /** Swing shaping: how far the foot kicks back (heel to seat) before reaching forward. */
  heelKick?: number;
  /** Keys per cycle. */
  keys?: number;
  /** Upper body: the pose's arms/lean/head over the cycle (u in 0..1). */
  upper: (u: number) => Partial<Pose>;
}

const LEN = 32;
const mod1 = (u: number): number => ((u % 1) + 1) % 1;
const smooth = (u: number): number => u * u * (3 - 2 * u);

/** One foot's position (relative to the hip's x; y = height above the floor) at cycle phase u. */
function footAt(g: GaitSpec, k: 0 | 1, u: number): { x: number; h: number } {
  const span = g.stride * g.duty;
  const ph = mod1(u - g.liftOff[k]);
  const swing = 1 - g.duty;
  const front = g.footX[k] + span / 2;
  const back = g.footX[k] - span / 2;
  if (ph >= swing) {
    // Planted: the foot stays still in the world while the body travels over it.
    const s = (ph - swing) / g.duty;
    return { x: front + (back - front) * s, h: 0 };
  }
  // Swing: lift off behind, recover forward, reach and touch down in front.
  const s = ph / swing;
  const kick = (g.heelKick ?? 0) * Math.sin(Math.PI * Math.min(1, s * 1.6)) * (1 - s);
  return { x: back + (front - back) * smooth(s) - kick, h: g.stepHeight * Math.pow(Math.sin(Math.PI * s), 0.85) };
}

/** IK for one leg so its ankle lands at the planned spot; falls back to a straight reach. */
function solveLeg(socketX: number, socketY: number, footX: number, ankleY: number): Leg {
  const t = { x: footX - socketX, y: ankleY - socketY };
  const ik = legIK(t);
  if (ik) return ik;
  const a = (Math.atan2(t.x, t.y) * 180) / Math.PI;
  return [a, 0];
}

/**
 * Builds a locomotion clip from a gait spec. Lift (the body's height when both feet are off the
 * floor) is written into the pose so the rig's "lowest foot on the floor" rule keeps the flight.
 */
export function gaitClip(stance: Pose, g: GaitSpec): Clip {
  const n = g.keys ?? 32;
  const keys: Clip['keys'] = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const bob = 0.5 - 0.5 * Math.cos(2 * Math.PI * g.bobsPerCycle * (u - g.bobPhase));
    const hip = g.hipLow + (g.hipHigh - g.hipLow) * bob;
    const p = withPose(stance, g.upper(u));
    const sockets = hipSockets(p.lean);
    const feet = [footAt(g, 0, u), footAt(g, 1, u)];
    const lift = Math.min(feet[0].h, feet[1].h);
    const hipY = -hip;
    const leg = (k: 0 | 1): Leg => {
      const s = k === 0 ? sockets.F : sockets.B;
      return solveLeg(s.x, hipY + s.y, feet[k].x, -FOOT_CLEARANCE - feet[k].h);
    };
    const legF = leg(0);
    const legB = leg(1);
    p.legF = [legF[0], legF[1]];
    p.legB = [legB[0], legB[1]];
    p.lift = lift;
    keys.push({ t: (u * LEN), p, e: 'lin' });
  }
  return { keys, loopFrom: 0 };
}

const LEG_REACH = 91.5;

/** Root-space ankle positions of a standing pose (lowest foot on the floor). */
function standingFeet(p: Pose): { x: [number, number]; hip: number } {
  const s = hipSockets(p.lean);
  const a = (leg: Leg, sx: number, sy: number) => {
    const DEG = Math.PI / 180;
    const kx = Math.sin(leg[0] * DEG) * 46;
    const ky = Math.cos(leg[0] * DEG) * 46;
    return { x: sx + kx + Math.sin((leg[0] + leg[1]) * DEG) * 46, y: sy + ky + Math.cos((leg[0] + leg[1]) * DEG) * 46 };
  };
  const f = a(p.legF, s.F.x, s.F.y);
  const b = a(p.legB, s.B.x, s.B.y);
  const hip = Math.max(f.y, b.y) + FOOT_CLEARANCE;
  return { x: [p.bodyX + f.x, p.bodyX + b.x], hip };
}

/**
 * Keys for a stance change done with real footwork: the feet step one at a time (in `order`)
 * on low arcs from where `from` stands to where `to` stands, while the upper body eases across.
 * The hip never rises higher than the planted feet allow, so nothing slides or floats.
 * Returns keys at t = 0..frames (append the rest of the clip after them).
 */
export function stanceShift(from: Pose, to: Pose, frames: number, order: Array<'F' | 'B'> = ['B', 'F'], lift = 10): Key[] {
  const A = standingFeet(from);
  const B = standingFeet(to);
  const keys: Key[] = [];
  const win = frames / order.length;
  for (let t = 0; t <= frames; t++) {
    const u = t / frames;
    const ease = 0.5 - Math.cos(Math.PI * u) / 2;
    const p = withPose(from, {});
    for (const f of ['bodyX', 'lean', 'head', 'squash', 'lift'] as const) p[f] = from[f] + (to[f] - from[f]) * ease;
    p.armF = [from.armF[0] + (to.armF[0] - from.armF[0]) * ease, from.armF[1] + (to.armF[1] - from.armF[1]) * ease];
    p.armB = [from.armB[0] + (to.armB[0] - from.armB[0]) * ease, from.armB[1] + (to.armB[1] - from.armB[1]) * ease];
    // Foot paths: each foot moves only inside its own step window.
    const foot = (k: 0 | 1) => {
      const i = order.indexOf(k === 0 ? 'F' : 'B');
      const s = Math.min(1, Math.max(0, (t - i * win) / win));
      return { x: A.x[k] + (B.x[k] - A.x[k]) * smooth(s), h: s > 0 && s < 1 ? lift * Math.sin(Math.PI * s) : 0 };
    };
    const feet = [foot(0), foot(1)];
    const sockets = hipSockets(p.lean);
    // Hip: eases toward the new height but stays within reach of every foot on the floor.
    let hip = A.hip + (B.hip - A.hip) * ease;
    for (const k of [0, 1] as const) {
      const sock = k === 0 ? sockets.F : sockets.B;
      const dx = feet[k].x - (p.bodyX + sock.x);
      const maxDrop = Math.sqrt(Math.max(0, LEG_REACH * LEG_REACH - dx * dx));
      hip = Math.min(hip, maxDrop + FOOT_CLEARANCE + feet[k].h + sock.y);
    }
    const legs = ([0, 1] as const).map((k) => {
      const sock = k === 0 ? sockets.F : sockets.B;
      return solveLeg(p.bodyX + sock.x, -hip + sock.y, feet[k].x, -FOOT_CLEARANCE - feet[k].h);
    });
    p.legF = [legs[0][0], legs[0][1]];
    p.legB = [legs[1][0], legs[1][1]];
    keys.push({ t, p: t === 0 ? withPose(from, {}) : t === frames ? withPose(to, {}) : p, e: 'lin' });
  }
  return keys;
}

/** `p` with its legs re-solved so the feet stand at `feetX` (root space) with the hip at `hip`. */
export function standAt(p: Pose, feetX: [number, number], hip: number): Pose {
  const out = withPose(p, {});
  const s = hipSockets(p.lean);
  const f = solveLeg(p.bodyX + s.F.x, -hip + s.F.y, feetX[0], -FOOT_CLEARANCE);
  const b = solveLeg(p.bodyX + s.B.x, -hip + s.B.y, feetX[1], -FOOT_CLEARANCE);
  out.legF = [f[0], f[1]];
  out.legB = [b[0], b[1]];
  return out;
}
