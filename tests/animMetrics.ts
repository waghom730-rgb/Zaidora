// Measurements of animation quality, computed with the same skeleton maths the renderer uses.
// Used by tests/animation.test.ts (thresholds) and the audit report (AUDIT=1).
import { MOVES, type MoveId } from '../src/combat/moves';
import { PHYS } from '../src/config';
import type { FighterId } from '../src/entities/fighterDefs';
import { FIGHTERS } from '../src/entities/fighterDefs';
import { clipLength, getAnimSet, sampleClip, type Clip } from '../src/render/animations';
import { NEUTRAL, clonePose, type Pose } from '../src/render/poses';
import { Rope } from '../src/render/Rope';
import { ropeSpecs } from '../src/render/ropeSpecs';
import {
  FOOT_CLEARANCE,
  FootPlanter,
  HipSmoother,
  add,
  hipHeight,
  joints,
  poseScaleX,
  rot,
  toRoot,
  type Leg,
  type PlantMode,
  type StepStyle,
  type V,
} from '../src/render/skeleton';

export const IDS: FighterId[] = ['kaen', 'yoru'];
const DEG = Math.PI / 180;

/** Samples a clip once per logic step. */
export function samples(clip: Clip, steps = clipLength(clip) + 1, timeOf: (t: number) => number = (t) => t): Pose[] {
  const out: Pose[] = [];
  for (let t = 0; t < steps; t++) {
    const p = clonePose(NEUTRAL);
    sampleClip(clip, timeOf(t), p);
    out.push(p);
  }
  return out;
}

/** Ankle positions in root space (feet at y = 0). */
export function feet(p: Pose, grounded = true, legs?: { legF: Leg; legB: Leg }): [V, V] {
  const hip = { x: p.bodyX, y: hipHeight(p, grounded) };
  const j = joints(p, legs);
  return [toRoot(j.ankF, hip, p.rootRot), toRoot(j.ankB, hip, p.rootRot)];
}

const BOTH: [PlantMode, PlantMode] = ['step', 'step'];

export const footHeight = (a: V): number => -FOOT_CLEARANCE - a.y;

interface FootFrame {
  x: [number, number];
  h: [number, number];
}

interface PlayOptions {
  /** Body travel per step (px). */
  dx?: number;
  /** Run the FootPlanter like the rig does (false = raw animation). */
  plant?: boolean;
  /** Plant mode per foot (constant, or per step). */
  modes?: [PlantMode, PlantMode] | ((t: number) => [PlantMode, PlantMode]);
  step?: StepStyle;
}

/**
 * Plays poses like the rig: the body moves `dx` per step and (optionally) the FootPlanter
 * keeps planted feet still. Returns each foot's world x and height per step.
 */
export function play(poses: Pose[], { dx = 0, plant = true, modes = BOTH, step }: PlayOptions = {}): FootFrame[] {
  const planter = new FootPlanter(step);
  let rootX = 0;
  // Settle the planter on the first pose (in game a clip always follows another one).
  if (plant && poses.length) {
    const p = poses[0];
    const m = typeof modes === 'function' ? modes(0) : modes;
    for (let i = 0; i < 4; i++) planter.solve({ pose: p, hip: { x: p.bodyX, y: hipHeight(p, true) }, rootX, scaleX: poseScaleX(p), plant: m });
  }
  return poses.map((p, t) => {
    const hip = { x: p.bodyX, y: hipHeight(p, true) };
    const m = typeof modes === 'function' ? modes(t) : modes;
    const legs = plant ? planter.solve({ pose: p, hip, rootX, scaleX: poseScaleX(p), plant: m }) : undefined;
    const [aF, aB] = feet(p, true, legs);
    const sx = poseScaleX(p);
    const frame: FootFrame = { x: [rootX + aF.x * sx, rootX + aB.x * sx], h: [footHeight(aF), footHeight(aB)] };
    rootX += dx;
    return frame;
  });
}

/** On the floor: within this height counts as touching it. */
const CONTACT = 1.5;

/**
 * Foot sliding in a stationary clip: total distance (px) a foot travels while it stays on the
 * floor (summed over consecutive steps in contact). A real step lifts the foot, so it isn't counted.
 */
export function standingSlide(frames: FootFrame[]): number {
  let worst = 0;
  for (const k of [0, 1]) {
    let total = 0;
    for (let i = 1; i < frames.length; i++) {
      if (frames[i].h[k] < CONTACT && frames[i - 1].h[k] < CONTACT) total += Math.abs(frames[i].x[k] - frames[i - 1].x[k]);
    }
    worst = Math.max(worst, total);
  }
  return worst;
}

/**
 * Floating feet: the highest a foot lingers 1.5–6 px above the floor for 4+ steps in a row
 * (a foot that should be down but isn't). A step passes through that band quickly and is ignored.
 */
export function hover(frames: FootFrame[]): number {
  let worst = 0;
  for (const k of [0, 1]) {
    let run: number[] = [];
    const flush = () => {
      if (run.length >= 4) worst = Math.max(worst, Math.min(...run));
      run = [];
    };
    for (const f of frames) {
      if (f.h[k] > CONTACT && f.h[k] < 6) run.push(f.h[k]);
      else flush();
    }
    flush();
  }
  return worst;
}

/** Foot slip while moving: world-x change per step of a foot that is on the floor on consecutive steps. */
export function slip(frames: FootFrame[]): { max: number; mean: number } {
  const d: number[] = [];
  for (let i = 1; i < frames.length; i++) {
    for (const k of [0, 1]) if (frames[i].h[k] < CONTACT && frames[i - 1].h[k] < CONTACT) d.push(Math.abs(frames[i].x[k] - frames[i - 1].x[k]));
  }
  return { max: d.length ? Math.max(...d) : 0, mean: d.length ? d.reduce((a, b) => a + b, 0) / d.length : 0 };
}

/** Walk or run cycle sampled by distance the way the rig does, moving at `speed` px/step. */
export function cycle(clip: Clip, stride: number, speed: number, steps = 120): Pose[] {
  const len = clipLength(clip);
  return samples(clip, steps, (t) => ((((t * speed) / stride) * len) % len + len) % len);
}

/**
 * Largest single-step rotation (degrees) of any body segment, in absolute (on-screen) angles,
 * within a pose sequence. `skip` excludes steps (e.g. an attack's deliberate strike snap).
 */
export function maxAngularStep(poses: Pose[], skip: (step: number) => boolean = () => false): number {
  let worst = 0;
  const segs = (p: Pose): number[] => {
    const out = [p.lean, p.lean + p.head, p.rootRot];
    for (const k of ['armF', 'armB'] as const) out.push(p[k][0], p[k][0] + p[k][1]);
    for (const k of ['legF', 'legB'] as const) out.push(p[k][0], p[k][0] + p[k][1]);
    return out;
  };
  for (let i = 1; i < poses.length; i++) {
    if (skip(i)) continue;
    const a = segs(poses[i - 1]);
    const b = segs(poses[i]);
    for (let j = 0; j < a.length; j++) worst = Math.max(worst, Math.abs(b[j] - a[j]));
  }
  return worst;
}

export type StrikeLimb = 'handF' | 'handB' | 'toeF';
export const STRIKE_LIMB: Record<MoveId, StrikeLimb | null> = {
  jab: 'handF',
  cross: 'handB',
  frontKick: 'toeF',
  roundhouse: 'toeF',
  airPunch: 'handF',
  airKick: 'toeF',
  flameStrike: 'handB',
  shadowSlash: 'handF',
  fireball: 'handF',
  shadowDash: null,
};

/** Root-space position of the striking fist/foot for a pose (facing right), as drawn. */
export function strikeTip(p: Pose, limb: StrikeLimb, grounded: boolean): V {
  const hip = { x: p.bodyX, y: hipHeight(p, grounded) };
  const q = toRoot(joints(p)[limb], hip, p.rootRot);
  return { x: q.x * poseScaleX(p), y: q.y * p.squash };
}

/** Distance from a point to a box (0 if inside). */
export function distToBox(pt: V, b: { x: number; y: number; w: number; h: number }): number {
  const dx = Math.max(b.x - pt.x, 0, pt.x - (b.x + b.w));
  const dy = Math.max(b.y - pt.y, 0, pt.y - (b.y + b.h));
  return Math.hypot(dx, dy);
}

export interface StrikeSync {
  /** Tip → hitbox distance on the first active frame (0 = touching it). */
  distAtActive: number;
  /** Worst tip → hitbox distance over all active frames. */
  worstActive: number;
  /** First startup frame on which the tip is already inside the hitbox (null = none). */
  earlyFrame: number | null;
}

/** For one attack: does the striking limb meet the hitbox exactly when the hitbox appears? */
export function strikeSync(id: FighterId, moveId: MoveId): StrikeSync | null {
  const limb = STRIKE_LIMB[moveId];
  if (!limb) return null;
  const m = MOVES[moveId];
  const poses = samples(getAnimSet(id).attacks[moveId], m.startup + m.active);
  const tip = (t: number) => strikeTip(poses[t], limb, !m.air);
  let earlyFrame: number | null = null;
  for (let t = 0; t < m.startup; t++) {
    if (distToBox(tip(t), m.hitbox) === 0) {
      earlyFrame = t;
      break;
    }
  }
  let worstActive = 0;
  for (let t = m.startup; t < m.startup + m.active; t++) worstActive = Math.max(worstActive, distToBox(tip(t), m.hitbox));
  return { distAtActive: distToBox(tip(m.startup), m.hitbox), worstActive, earlyFrame };
}

/**
 * Jump jolts: the biggest sudden change in the body's vertical speed (px/step per step) at take-off
 * and at touch-down, through a neutral jump with the root following the game's jump physics.
 * The physics alone gives `physics` (the launch impulse / the stop on landing); anything above it
 * is the animation snapping the hip.
 */
export function jumpJolts(id: FighterId, smooth: boolean): { takeoff: number; touchdown: number; physics: { takeoff: number; touchdown: number } } {
  const A = getAnimSet(id);
  const s = new HipSmoother();
  const world: number[] = [];
  const push = (rootY: number, p: Pose, grounded: boolean) => {
    const h = hipHeight(p, grounded);
    world.push(rootY + (smooth ? s.apply(h, grounded) : h));
  };
  const roots: number[] = [];
  const at = (rootY: number, p: Pose, grounded: boolean) => {
    roots.push(rootY);
    push(rootY, p, grounded);
  };
  for (const p of samples(A.idle, 6)) at(0, p, true);
  for (const p of samples(A.prejump, PHYS.prejumpFrames)) at(0, p, true);
  const launch = world.length;
  let y = 0;
  let vy: number = PHYS.jumpVelocity;
  let t = 0;
  const air = (time: number) => samples(A.airNeutral, time + 1)[time];
  for (;;) {
    vy += PHYS.gravity;
    y += vy;
    if (y >= 0) break;
    at(y, air(t++), false);
  }
  const touch = world.length;
  for (const p of samples(A.land, PHYS.landFrames + 1)) at(0, p, true);
  for (const p of samples(A.idle, 8)) at(0, p, true);
  const jolt = (series: number[], from: number, to: number) => {
    let worst = 0;
    for (let i = Math.max(2, from); i < Math.min(series.length, to); i++) {
      worst = Math.max(worst, Math.abs(series[i] - 2 * series[i - 1] + series[i - 2]));
    }
    return worst;
  };
  return {
    takeoff: jolt(world, launch - 2, launch + 6),
    touchdown: jolt(world, touch - 2, touch + 8),
    physics: { takeoff: jolt(roots, launch - 2, launch + 6), touchdown: jolt(roots, touch - 2, touch + 8) },
  };
}

/** Jitter of hair/cloth tips during a clip: mean |second difference| after the ropes settle. */
export function ropeJitter(id: FighterId, poses: Pose[], dx = 0): number {
  const specs = ropeSpecs(FIGHTERS[id]);
  const ropes = specs.map((s) => new Rope(s.opts));
  const tips: V[][] = specs.map(() => []);
  let rootX = 400;
  poses.forEach((p, i) => {
    const hip = { x: p.bodyX, y: hipHeight(p, true) };
    const j = joints(p);
    specs.forEach((s, k) => {
      const local = s.space === 'head' ? add(j.chest, rot(s.anchor, (p.lean + p.head) * DEG)) : rot(s.anchor, p.lean * DEG);
      const w = toRoot(local, hip, p.rootRot);
      const ax = rootX + w.x;
      const ay = 640 + w.y;
      if (i === 0) ropes[k].reset(ax, ay, 1);
      ropes[k].step(ax, ay, 1, i);
      const tip = ropes[k].pts[ropes[k].pts.length - 1];
      tips[k].push({ x: tip.x - rootX, y: tip.y });
    });
    rootX += dx;
  });
  let total = 0;
  let n = 0;
  for (const series of tips) {
    for (let i = 61; i < series.length - 1; i++) {
      total += Math.hypot(series[i + 1].x - 2 * series[i].x + series[i - 1].x, series[i + 1].y - 2 * series[i].y + series[i - 1].y);
      n++;
    }
  }
  return n ? total / n : 0;
}
