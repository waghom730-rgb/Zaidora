/**
 * A skeletal pose, authored facing right. Angles are in degrees:
 *   limbs: 0 = pointing straight down, 90 = forward, 180 = straight up, negative = backward.
 *   [first, second] = [upper segment absolute angle, lower segment angle relative to the upper].
 *   lean: torso tilt (positive = forward). head: extra head tilt on top of lean.
 *   lying: 0 = standing on the feet, 1 = lying flat on the floor.
 *   rootRot: whole-body rotation around the hips (flips, spins). squash: vertical scale.
 */
export interface Pose {
  bodyX: number;
  lean: number;
  head: number;
  lying: number;
  rootRot: number;
  squash: number;
  armF: [number, number];
  armB: [number, number];
  legF: [number, number];
  legB: [number, number];
}

export const NEUTRAL: Pose = {
  bodyX: 0,
  lean: 6,
  head: 0,
  lying: 0,
  rootRot: 0,
  squash: 1,
  armF: [40, 105],
  armB: [20, 128],
  legF: [35, -38],
  legB: [-25, 0],
};

const SCALARS = ['bodyX', 'lean', 'head', 'lying', 'rootRot', 'squash'] as const;
const LIMBS = ['armF', 'armB', 'legF', 'legB'] as const;

export function clonePose(p: Pose): Pose {
  return {
    bodyX: p.bodyX,
    lean: p.lean,
    head: p.head,
    lying: p.lying,
    rootRot: p.rootRot,
    squash: p.squash,
    armF: [p.armF[0], p.armF[1]],
    armB: [p.armB[0], p.armB[1]],
    legF: [p.legF[0], p.legF[1]],
    legB: [p.legB[0], p.legB[1]],
  };
}

export function copyPose(out: Pose, src: Pose): void {
  for (const s of SCALARS) out[s] = src[s];
  for (const l of LIMBS) {
    out[l][0] = src[l][0];
    out[l][1] = src[l][1];
  }
}

/** out = a + (b - a) * u */
export function mixPose(out: Pose, a: Pose, b: Pose, u: number): void {
  for (const s of SCALARS) out[s] = a[s] + (b[s] - a[s]) * u;
  for (const l of LIMBS) {
    out[l][0] = a[l][0] + (b[l][0] - a[l][0]) * u;
    out[l][1] = a[l][1] + (b[l][1] - a[l][1]) * u;
  }
}

/** A new pose: `base` with the given fields overridden. */
export function withPose(base: Pose, p: Partial<Pose>): Pose {
  const out = clonePose(base);
  for (const s of SCALARS) if (p[s] !== undefined) out[s] = p[s];
  for (const l of LIMBS) {
    const v = p[l];
    if (v) out[l] = [v[0], v[1]];
  }
  return out;
}
