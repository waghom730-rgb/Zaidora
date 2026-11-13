// Pure skeleton maths shared by FighterRig (drawing) and the animation tests (measuring):
// forward kinematics, hip placement, two-bone leg IK and foot planting. No Phaser code.
import type { Pose } from './poses';

/** Bone lengths — attack hitboxes in moves.ts are tuned to these. */
export const SEG = { thigh: 46, shin: 46, torso: 58, upper: 34, fore: 32 } as const;
/** Hip height above the feet while airborne. */
export const AIR_HIP = 92;
/** Ankle height above the floor when the foot is flat on it. */
export const FOOT_CLEARANCE = 6;
/** Hip height when lying on the floor. */
export const LYING_HIP = 18;

const DEG = Math.PI / 180;
const LEG = SEG.thigh + SEG.shin;

export type V = { x: number; y: number };
export const add = (a: V, b: V): V => ({ x: a.x + b.x, y: a.y + b.y });
export const mul = (a: V, s: number): V => ({ x: a.x * s, y: a.y * s });
export const rot = (v: V, r: number): V => ({ x: v.x * Math.cos(r) - v.y * Math.sin(r), y: v.x * Math.sin(r) + v.y * Math.cos(r) });
/** Unit vector for a limb angle: 0 = down, 90 = forward (facing right), 180 = up. */
export const dir = (deg: number): V => ({ x: Math.sin(deg * DEG), y: Math.cos(deg * DEG) });

export type Leg = readonly [number, number];

/** Knee and ankle relative to the hip socket. */
export function legFK(leg: Leg): { knee: V; ankle: V } {
  const knee = mul(dir(leg[0]), SEG.thigh);
  return { knee, ankle: add(knee, mul(dir(leg[0] + leg[1]), SEG.shin)) };
}

/** Hip sockets relative to the hip centre: front leg slightly forward, back leg slightly back. */
export function hipSockets(leanDeg: number): { F: V; B: V } {
  const fwd = { x: Math.cos(leanDeg * DEG), y: Math.sin(leanDeg * DEG) };
  return { F: mul(fwd, 3), B: mul(fwd, -4) };
}

/**
 * Hip height in root space (root = the fighter's feet position; y grows downward).
 * On the ground the lower foot rests on the floor; in the air the hip sits at a fixed
 * height; `lying` blends toward the floor and `lift` raises the whole body.
 */
export function hipHeight(p: Pose, grounded: boolean): number {
  const auto = grounded ? -(Math.max(legFK(p.legF).ankle.y, legFK(p.legB).ankle.y) + FOOT_CLEARANCE) : -AIR_HIP;
  return auto + (-LYING_HIP - auto) * p.lying - p.lift;
}

/** Joint positions in body space (relative to the hip, before whole-body rotation). */
export interface Joints {
  hipF: V;
  hipB: V;
  kneeF: V;
  ankF: V;
  toeF: V;
  kneeB: V;
  ankB: V;
  toeB: V;
  chest: V;
  shF: V;
  shB: V;
  elbF: V;
  elbB: V;
  handF: V;
  handB: V;
  legF: Leg;
  legB: Leg;
}

/** Forward kinematics for a pose. `legs` overrides the leg angles (after foot planting). */
export function joints(p: Pose, legs?: { legF: Leg; legB: Leg }): Joints {
  const legF = legs?.legF ?? p.legF;
  const legB = legs?.legB ?? p.legB;
  const s = hipSockets(p.lean);
  const lf = legFK(legF);
  const lb = legFK(legB);
  const up = { x: Math.sin(p.lean * DEG), y: -Math.cos(p.lean * DEG) };
  const fwd = { x: Math.cos(p.lean * DEG), y: Math.sin(p.lean * DEG) };
  const shF = mul(up, SEG.torso - 6);
  const shB = add(shF, mul(fwd, -6));
  const elbF = add(shF, mul(dir(p.armF[0]), SEG.upper));
  const elbB = add(shB, mul(dir(p.armB[0]), SEG.upper));
  const ankF = add(s.F, lf.ankle);
  const ankB = add(s.B, lb.ankle);
  return {
    hipF: s.F,
    hipB: s.B,
    kneeF: add(s.F, lf.knee),
    ankF,
    toeF: add(ankF, mul(dir(legF[0] + legF[1] + 90), 8)),
    kneeB: add(s.B, lb.knee),
    ankB,
    toeB: add(ankB, mul(dir(legB[0] + legB[1] + 90), 8)),
    chest: mul(up, SEG.torso),
    shF,
    shB,
    elbF,
    elbB,
    handF: add(elbF, mul(dir(p.armF[0] + p.armF[1]), 33)),
    handB: add(elbB, mul(dir(p.armB[0] + p.armB[1]), 33)),
    legF,
    legB,
  };
}

/** Body-space point → root space (hip at `hip`, whole body rotated by rootRot degrees). */
export function toRoot(q: V, hip: V, rootRotDeg: number): V {
  return add(hip, rot(q, rootRotDeg * DEG));
}

/** Horizontal scale of the drawn body for a spin of `turn` half-turns (1 = mirrored). */
export const turnScale = (turn: number): number => Math.cos(turn * Math.PI);

/** Wraps a spin into [-1, 1) half-turns: 2 (all the way round) is the same picture as 0. */
export const wrapTurn = (turn: number): number => ((((turn + 1) % 2) + 2) % 2) - 1;

/** Root-space x scale of a pose (spin × squash's volume-keeping stretch), before facing. */
export const poseScaleX = (p: Pose): number => turnScale(p.turn) / Math.sqrt(p.squash);

/**
 * Two-bone leg IK: angles [thigh, knee] putting the ankle at `target` (relative to the hip
 * socket), knee bending forward like a real leg. Slightly out-of-reach targets get a straight
 * leg; returns null when the target is clearly unreachable.
 */
export function legIK(target: V): [number, number] | null {
  const d = Math.hypot(target.x, target.y);
  if (d < 1 || d > LEG + 6) return null;
  const base = Math.atan2(target.x, target.y) / DEG;
  if (d >= LEG * 0.999) return [base, 0];
  const cosA = (SEG.thigh ** 2 + d * d - SEG.shin ** 2) / (2 * SEG.thigh * d);
  const thigh = base + Math.acos(Math.min(1, Math.max(-1, cosA))) / DEG;
  const knee = mul(dir(thigh), SEG.thigh);
  const shinAbs = Math.atan2(target.x - knee.x, target.y - knee.y) / DEG;
  return [thigh, shinAbs - thigh];
}

/** A foot within this height of the floor can be planted (gait cycles touch down exactly). */
const PLANT_HEIGHT = 8;
const GAIT_CONTACT = 2.5;
/** A planted foot this far from where the animation wants it is released. */
const MAX_DRIFT = 45;
/** In step mode, a planted foot this far from the pose's foot takes a step. */
const STEP_TRIGGER = 16;
/** Longest a planted leg may stretch (a hair short of straight, so the knee never locks). */
const MAX_REACH = LEG - 0.5;
/** Fastest a dragged foot slides (px/step): a toe dragging behind a lunge, never a skid. */
const MAX_DRAG = 3.5;
const LOCK_IN = 0.34;
const LOCK_OUT = 0.25;

/**
 * How a foot is treated this step:
 *   free — the animation moves it.
 *   hold — plant it where it lands; if the body moves too far away, the foot drags after it.
 *   step — plant it; when the pose's foot moves away (a stance change, a lunge) or the leg would
 *          over-stretch, it takes a small step to the new spot.
 *   gait — walk/run cycles: plant only on exact contact (the cycle lifts it again itself); a foot
 *          far out of the cycle's place (starting from a wide guard) steps into it.
 */
export type PlantMode = 'free' | 'hold' | 'step' | 'gait';

export interface PlantInput {
  pose: Pose;
  /** Hip centre in root space. */
  hip: V;
  /** World x of the root (the fighter's feet) and its horizontal scale (sign = facing). */
  rootX: number;
  scaleX: number;
  /** Plant mode for each foot this step: [front, back]. */
  plant: readonly [PlantMode, PlantMode];
}

export interface StepStyle {
  /** Steps a re-step takes, and how high the foot lifts (px). */
  frames: number;
  height: number;
}

interface Lock {
  /** World x of the planted foot. */
  x: number;
  /** Blend weight: 0 = pure animation, 1 = fully planted. */
  w: number;
  on: boolean;
  /** Re-step progress (0 = not stepping) and where it started. */
  step: number;
  from: number;
  /** The animation's foot height last step (to tell a lift-off from a foot resting off the floor). */
  lastH: number;
}

const smoothstep = (u: number): number => u * u * (3 - 2 * u);

/**
 * Keeps planted feet fixed on the floor while the body moves above them (no foot sliding),
 * using leg IK. A foot locks where it touches down and releases — blending smoothly back to
 * the animation — when it lifts. In step mode a foot left behind by the pose steps to its new
 * spot on a low arc, one foot at a time, like a fighter resetting their stance.
 */
export class FootPlanter {
  readonly locks: [Lock, Lock] = [
    { x: 0, w: 0, on: false, step: 0, from: 0, lastH: 0 },
    { x: 0, w: 0, on: false, step: 0, from: 0, lastH: 0 },
  ];
  private sign = 0;

  constructor(private readonly style: StepStyle = { frames: 6, height: 11 }) {}

  reset(): void {
    for (const l of this.locks) {
      l.w = 0;
      l.on = false;
      l.step = 0;
    }
  }

  solve(i: PlantInput): { legF: Leg; legB: Leg } {
    const sign = Math.sign(i.scaleX);
    const usable = Math.abs(i.scaleX) >= 0.25;
    // Turning around or an edge-on body: world positions no longer map back cleanly.
    if (sign !== this.sign || !usable) this.reset();
    this.sign = sign;
    const sockets = hipSockets(i.pose.lean);
    const legs = [i.pose.legF, i.pose.legB] as const;
    const out: [Leg, Leg] = [legs[0], legs[1]];
    const floorY = -FOOT_CLEARANCE;
    for (const k of [0, 1] as const) {
      const L = this.locks[k];
      const other = this.locks[1 - k];
      const mode: PlantMode = usable ? i.plant[k] : 'free';
      const socket = add(i.hip, k === 0 ? sockets.F : sockets.B);
      const fk = add(socket, legFK(legs[k]).ankle);
      const height = floorY - fk.y;
      const worldX = i.rootX + fk.x * i.scaleX;
      const toLocal = (x: number) => (x - i.rootX) / i.scaleX;
      const toWorld = (x: number) => i.rootX + x * i.scaleX;
      const release = () => {
        L.on = false;
        L.w = 0;
        L.step = 0;
      };
      const solveTo = (x: number, y: number): boolean => {
        const ik = legIK({ x: x - socket.x, y: y - socket.y });
        if (ik) out[k] = ik;
        return !!ik;
      };
      const stepTo = (u: number) => {
        const x = L.from + (worldX - L.from) * smoothstep(u);
        const lift = Math.max(height, this.style.height * Math.sin(Math.PI * u));
        if (!solveTo(toLocal(x), floorY - lift)) release();
      };

      if (L.step > 0) {
        L.lastH = height;
        if (mode === 'free') {
          release();
          continue;
        }
        // Mid-step: travel toward where the pose wants the foot, lifted on a low arc.
        L.step++;
        const u = Math.min(1, L.step / this.style.frames);
        stepTo(u);
        if (u >= 1 && L.step > 0) {
          L.step = 0;
          L.x = worldX;
        }
        continue;
      }

      // Touching: a foot resting near the floor is pulled onto it, but one the animation is lifting
      // or setting down (an authored step) only counts once it is really down.
      const moving = height > 1.5 && Math.abs(height - L.lastH) > 0.5;
      L.lastH = height;
      const contact = mode === 'gait' || moving ? GAIT_CONTACT : PLANT_HEIGHT;
      if (mode !== 'free' && height < contact) {
        if (!L.on) {
          L.on = true;
          L.x = worldX;
        }
        L.w = Math.min(1, L.w + LOCK_IN);
      } else {
        L.on = false;
        L.w = Math.max(0, L.w - LOCK_OUT);
      }
      if (L.w <= 0) continue;

      // How far is the planted spot from the pose's foot, and can the leg still reach it? (A pose
      // that already has this leg straight may keep it straight.)
      const drift = Math.abs(toLocal(L.x) - fk.x);
      const ownReach = Math.hypot(fk.x - socket.x, fk.y - socket.y);
      const R = Math.max(MAX_REACH, Math.min(ownReach, LEG * 0.999));
      const dy = floorY - socket.y;
      const reachX = dy < R ? Math.sqrt(R * R - dy * dy) : -1;
      const overStretched = L.on && (reachX < 0 || Math.abs(toLocal(L.x) - socket.x) > reachX + 0.01);

      // Step mode re-steps; a gait re-steps only to fall into the cycle (e.g. the first step out of
      // a wide guard), since its own steps keep the drift near zero.
      const canStep = mode === 'step' || mode === 'gait';
      if (canStep && L.on && L.w >= 1 && other.step === 0 && (drift > STEP_TRIGGER || (overStretched && drift >= 6))) {
        L.step = 1;
        L.from = L.x;
        stepTo(1 / this.style.frames);
        continue;
      }
      if (overStretched) {
        if (reachX < 0) {
          release();
          continue;
        }
        // Drag: the foot slides (no faster than a toe drags) toward where a straight leg reaches.
        const cur = toLocal(L.x);
        const want = socket.x + Math.sign(cur - socket.x) * reachX;
        const lim = MAX_DRAG / Math.abs(i.scaleX);
        L.x = toWorld(cur + Math.max(-lim, Math.min(lim, want - cur)));
      }
      if (drift > MAX_DRIFT) {
        release();
        continue;
      }
      const lockX = toLocal(L.x);
      if (!solveTo(fk.x + (lockX - fk.x) * L.w, fk.y + (floorY - fk.y) * L.w)) release();
    }
    return { legF: out[0], legB: out[1] };
  }
}

/**
 * Smooths the hip when its anchoring rule switches (air ↔ ground, e.g. on landing), so the
 * body settles over a few steps instead of jumping in one frame.
 */
export class HipSmoother {
  private offset = 0;
  private last: number | null = null;
  private lastGrounded: boolean | null = null;

  reset(): void {
    this.offset = 0;
    this.last = null;
    this.lastGrounded = null;
  }

  apply(rawHipY: number, grounded: boolean): number {
    if (this.last !== null && this.lastGrounded !== null && grounded !== this.lastGrounded) this.offset += this.last - rawHipY;
    const out = rawHipY + this.offset;
    this.offset *= 0.55;
    if (Math.abs(this.offset) < 0.3) this.offset = 0;
    this.last = out;
    this.lastGrounded = grounded;
    return out;
  }
}
