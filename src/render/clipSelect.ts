// Which animation clip a fighter plays in each state, and which feet stay planted
// (pure, so tests can check every state).
import type { MoveId } from '../combat/moves';
import type { Fighter } from '../entities/Fighter';
import { clipLength, type AnimSet, type Clip } from './animations';
import type { Pose } from './poses';
import type { PlantMode } from './skeleton';

export interface ClipChoice {
  key: string;
  clip: Clip;
  /** Explicit clip time (attacks follow the move's frame counter; walk/run follow distance). */
  time?: number;
  /** Cross-fade length in steps. */
  blend: number;
}

/** Distance travelled while walking/running — drives the walk and run cycles. */
export interface Travel {
  walk: number;
  run: number;
}

const mod = (a: number, n: number): number => ((a % n) + n) % n;

export function selectClip(f: Fighter, A: AnimSet, travel: Travel): ClipChoice {
  switch (f.state) {
    case 'intro':
      return { key: 'intro', clip: A.intro, blend: 0 };
    case 'idle':
      return { key: 'idle', clip: A.idle, blend: 6 };
    case 'walk': {
      const len = clipLength(A.walk);
      return { key: 'walk', clip: A.walk, time: mod((travel.walk / A.stride) * len, len), blend: 5 };
    }
    case 'run': {
      const len = clipLength(A.run);
      return { key: 'run', clip: A.run, time: mod((travel.run / A.runStride) * len, len), blend: 4 };
    }
    case 'dash':
      return { key: 'dash', clip: A.dash, blend: 2 };
    case 'backdash':
      return { key: 'backdash', clip: A.backdash, blend: 1 };
    case 'parry':
      return { key: `parry${f.hitSerial}`, clip: A.parry, blend: 1 };
    case 'parried':
      return { key: 'parried', clip: A.parried, blend: 1 };
    case 'prejump':
      return { key: 'prejump', clip: A.prejump, blend: 2 };
    case 'air':
      if (f.jumpDir === 0) return { key: 'airN', clip: A.airNeutral, blend: 3 };
      return { key: f.jumpDir > 0 ? 'airF' : 'airB', clip: f.jumpDir > 0 ? A.airFlipF : A.airFlipB, blend: 3 };
    case 'land':
      // Still sliding = stopping out of a run (a jump landing zeroes the speed).
      if (f.vx !== 0) return { key: 'skid', clip: A.skid, blend: 3 };
      return { key: 'land', clip: A.land, blend: 1 };
    case 'block':
      return { key: 'block', clip: A.block, blend: 3 };
    case 'blockstun':
      return { key: `blockstun${f.hitSerial}`, clip: A.blockstun, blend: 1 };
    case 'hitstun':
      return {
        key: `hit${f.hitSerial}`,
        clip: f.lastHitHeavy ? A.hitHeavy : f.lastHitHigh ? A.hitHigh : A.hitBody,
        blend: 0,
      };
    case 'knockdown':
      return { key: 'knockdown', clip: A.knockdown, blend: 1 };
    case 'down':
    case 'ko':
      return { key: 'down', clip: A.down, blend: 1 };
    case 'getup':
      return { key: 'getup', clip: A.getup, blend: 2 };
    case 'victory':
      return { key: 'victory', clip: A.victory, blend: 6 };
    case 'lose':
      return { key: 'lose', clip: A.lose, blend: 6 };
    case 'attack': {
      const m = f.move;
      if (!m) return { key: 'idle', clip: A.idle, blend: 4 };
      return { key: `atk${f.moveSerial}`, clip: A.attacks[m.id], time: f.moveFrame, blend: 2 };
    }
  }
}


/** Moves that strike with the front leg (it must be free to leave the floor). */
const FRONT_LEG: ReadonlySet<MoveId> = new Set<MoveId>(['frontKick', 'roundhouse']);
/** A lunge longer than this is a step-in: the feet re-step instead of dragging. */
const STEP_IN = 24;
/** Lunging this fast (px/step) is a glide (suri-ashi): the feet slide with the body by design. */
const GLIDE = 3.5;
const FREE: [PlantMode, PlantMode] = ['free', 'free'];
const STEP: [PlantMode, PlantMode] = ['step', 'step'];
const GAIT: [PlantMode, PlantMode] = ['gait', 'gait'];

/**
 * Foot planting per state: [front, back] (see PlantMode). Pushback states (hitstun, blockstun,
 * parried), dashes, skids, the air and lying on the floor leave the feet to the animation.
 */
export function plantModes(f: Fighter, pose: Pose, grounded: boolean): [PlantMode, PlantMode] {
  if (!grounded || pose.lying > 0.05 || Math.abs(pose.rootRot % 360) > 1) return FREE;
  switch (f.state) {
    case 'idle':
    case 'block':
    case 'intro':
    case 'victory':
    case 'lose':
    case 'parry':
    case 'prejump':
    case 'getup':
      return STEP;
    case 'land':
      return f.vx !== 0 ? FREE : STEP;
    case 'walk':
    case 'run':
      // The gait cycles plant their feet by construction; just hold them while they touch.
      return GAIT;
    case 'attack': {
      const m = f.move;
      if (!m || m.air || m.special?.kind === 'dash' || (m.lunge >= GLIDE && f.movePhase !== 'recovery')) return FREE;
      if (f.movePhase === 'recovery' || m.lunge * m.startup > STEP_IN) return STEP;
      // Drive off the back foot; a kicking front leg is free.
      return [FRONT_LEG.has(m.id) ? 'free' : 'hold', 'hold'];
    }
    default:
      return FREE;
  }
}

/** Additive touches on top of the clip: the forward drive of a run's first strides. */
export function adjustPose(f: Fighter, pose: Pose): void {
  if (f.state === 'run' && f.stateTime < 12) pose.lean += (12 - f.stateTime) * 0.9;
}
