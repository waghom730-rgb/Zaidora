// The animation pipeline for one fighter, without any drawing: picks the clip for the fighter's
// state, cross-fades into it, applies foot planting / hip smoothing / turn-arounds, and solves
// the skeleton. FighterRig draws the result; the tests run the very same code headless.
import type { Fighter } from '../entities/Fighter';
import { idleLife, sampleClip, type AnimSet } from './animations';
import { adjustPose, plantModes, selectClip } from './clipSelect';
import { NEUTRAL, clonePose, copyPose, mixPose, type Pose } from './poses';
import { FootPlanter, HipSmoother, hipHeight, joints, turnScale, wrapTurn, type Joints, type Leg, type V } from './skeleton';

const wrap180 = (a: number): number => ((((a + 180) % 360) + 360) % 360) - 180;

export class PoseDriver {
  /** The blended pose this step. */
  readonly pose: Pose = clonePose(NEUTRAL);
  /** Hip centre in root space, root horizontal scale (facing × spin × squash), solved joints. */
  hip: V = { x: 0, y: 0 };
  scaleX = 1;
  joints: Joints;
  /** Leg angles actually drawn (after foot planting). */
  legs: { legF: Leg; legB: Leg };
  /** Steps since the current clip started. */
  clipTime = 0;

  private readonly from: Pose = clonePose(NEUTRAL);
  private readonly target: Pose = clonePose(NEUTRAL);
  private clipKey = '';
  private blendTime = 0;
  private blendLen = 1;
  private walkDist = 0;
  private runDist = 0;
  private readonly planter: FootPlanter;
  private readonly hipSmooth = new HipSmoother();
  /** Turn-around in progress: 1 = still showing the old facing, 0 = done. */
  private turnFx = 0;
  private lastFacing = 0;

  constructor(
    readonly f: Fighter,
    readonly anims: AnimSet,
    /** Display scale (menus draw the characters bigger). */
    private readonly scale = 1,
  ) {
    this.planter = new FootPlanter(anims.step);
    this.legs = { legF: this.pose.legF, legB: this.pose.legB };
    this.joints = joints(this.pose);
  }

  /** Jump straight to the current state's pose (round start, teleports). */
  snap(): void {
    this.clipKey = '';
    this.lastFacing = this.f.facing;
    this.turnFx = 0;
    this.advance();
    copyPose(this.pose, this.target);
    this.planter.reset();
    this.hipSmooth.reset();
    this.solve();
  }

  /** One logic step. */
  tick(): void {
    this.advance();
    this.solve();
  }

  private advance(): void {
    const f = this.f;
    if (f.state === 'walk') this.walkDist += f.vx * f.facing;
    if (f.state === 'run') this.runDist += Math.abs(f.vx);

    // Turning around: the body swings through edge-on instead of flipping in one frame.
    if (f.facing !== this.lastFacing) {
      this.turnFx = this.lastFacing === 0 ? 0 : 1;
      this.lastFacing = f.facing;
    } else if (this.turnFx > 0) {
      this.turnFx = Math.max(0, this.turnFx - 1 / this.anims.turnFrames);
    }

    const sel = selectClip(f, this.anims, { walk: this.walkDist, run: this.runDist });
    if (sel.key !== this.clipKey) {
      copyPose(this.from, this.pose);
      this.from.rootRot = wrap180(this.from.rootRot);
      this.from.turn = wrapTurn(this.from.turn);
      this.clipKey = sel.key;
      this.clipTime = 0;
      this.blendTime = 0;
      this.blendLen = sel.blend;
    } else {
      this.clipTime++;
    }
    this.blendTime++;
    sampleClip(sel.clip, sel.time ?? this.clipTime, this.target);
    const w = this.blendLen <= 0 ? 1 : Math.min(1, this.blendTime / this.blendLen);
    mixPose(this.pose, this.from, this.target, 1 - (1 - w) * (1 - w));
    // Clip time, not the fighter's state time: menus animate fighters that never update.
    if (this.clipKey === 'idle') idleLife(this.pose, this.anims, this.clipTime);
    adjustPose(f, this.pose);
  }

  private solve(): void {
    const f = this.f;
    const p = this.pose;
    // Grounded: the lower foot rests on the floor. Airborne: fixed hip height (see skeleton.ts).
    const grounded = f.grounded && f.state !== 'knockdown';
    this.hip = { x: p.bodyX, y: this.hipSmooth.apply(hipHeight(p, grounded), grounded) };
    this.scaleX = (f.facing * this.scale * turnScale(p.turn + this.turnFx)) / Math.sqrt(p.squash);
    this.legs = this.planter.solve({ pose: p, hip: this.hip, rootX: f.x, scaleX: this.scaleX, plant: plantModes(f, p, grounded) });
    this.joints = joints(p, this.legs);
  }
}
