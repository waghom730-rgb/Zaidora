// Animation quality and combat sync, measured with the same skeleton maths the renderer uses.
// Run `AUDIT=report.md npx vitest run tests/animation-audit.test.ts` for the full numbers.
import { describe, expect, it } from 'vitest';
import { MOVES, type MoveId } from '../src/combat/moves';
import { EMPTY_INPUT, type FighterInput } from '../src/combat/types';
import { PHYS } from '../src/config';
import type { Fighter, FighterState } from '../src/entities/Fighter';
import { clipLength, getAnimSet, sampleClip } from '../src/render/animations';
import { plantModes, selectClip } from '../src/render/clipSelect';
import { NEUTRAL, clonePose } from '../src/render/poses';
import { PoseDriver } from '../src/render/PoseDriver';
import { FOOT_CLEARANCE, FootPlanter, hipHeight, legFK, legIK, toRoot, wrapTurn } from '../src/render/skeleton';
import { IDS, STRIKE_LIMB, cycle, hover, jumpJolts, play, samples, slip, standingSlide, strikeSync, strikeTip } from './animMetrics';
import { Sim, input } from './sim';

const MOVE_IDS = Object.keys(MOVES) as MoveId[];

describe('strikes meet their hitboxes exactly when the hitbox appears', () => {
  for (const id of IDS) {
    for (const moveId of MOVE_IDS) {
      if (!STRIKE_LIMB[moveId]) continue;
      it(`${id} ${moveId}`, () => {
        const s = strikeSync(id, moveId)!;
        expect(s.earlyFrame, 'limb already in the hitbox during startup').toBeNull();
        expect(s.distAtActive, 'limb reaches the hitbox on the first active frame').toBe(0);
        expect(s.worstActive, 'limb stays on the hitbox through the active frames').toBeLessThanOrEqual(1);
      });
    }
  }
});

describe('attack clips', () => {
  for (const id of IDS) {
    const A = getAnimSet(id);
    it(`${id}: every attack lasts exactly its frame data and ends back in the base pose`, () => {
      for (const moveId of MOVE_IDS) {
        const m = MOVES[moveId];
        const clip = A.attacks[moveId];
        expect(clipLength(clip), moveId).toBe(m.startup + m.active + m.recovery);
        const end = clonePose(NEUTRAL);
        sampleClip(clip, clipLength(clip), end);
        const base = m.air ? A.airNeutral.keys[A.airNeutral.keys.length - 1].p : A.stance;
        expect(end.lean, moveId).toBeCloseTo(base.lean, 5);
        expect(end.legF[0], moveId).toBeCloseTo(base.legF[0], 5);
        expect(end.armF[1], moveId).toBeCloseTo(base.armF[1], 5);
        expect(wrapTurn(end.turn), moveId).toBeCloseTo(0, 5);
      }
    });
  }

  it("yoru's roundhouse is a spin: back to the opponent mid-startup, facing them on contact", () => {
    const m = MOVES.roundhouse;
    const poses = samples(getAnimSet('yoru').attacks.roundhouse);
    expect(Math.max(...poses.slice(0, m.startup).map((p) => p.turn))).toBeGreaterThan(1);
    expect(poses[m.startup].turn).toBe(2);
    expect(wrapTurn(poses[poses.length - 1].turn)).toBe(0);
  });

  it("kaen's flame strike is a rising uppercut: the fist climbs from the hip, through the hitbox, skyward", () => {
    const m = MOVES.flameStrike;
    const poses = samples(getAnimSet('kaen').attacks.flameStrike);
    const fistY = (t: number) => strikeTip(poses[t], 'handB', true).y;
    const coiled = fistY(m.startup - 2);
    const contact = fistY(m.startup);
    const after = Math.min(...poses.slice(m.startup + m.active, m.startup + m.active + 10).map((_, i) => fistY(m.startup + m.active + i)));
    expect(coiled).toBeGreaterThan(contact + 30); // rises at least 30 px into the hit
    expect(after).toBeLessThan(contact - 20); // and keeps going up after it
  });
});

describe('feet stay planted', () => {
  for (const id of IDS) {
    const A = getAnimSet(id);
    const standing: Array<[string, typeof A.idle, number]> = [
      ['idle', A.idle, 120],
      ['block', A.block, 20],
      ['land', A.land, 8],
      ['prejump', A.prejump, 4],
      ['parry', A.parry, 14],
      ['intro', A.intro, 90],
      ['victory', A.victory, 90],
      ['lose', A.lose, 80],
    ];
    for (const [name, clip, steps] of standing) {
      it(`${id} ${name}: no foot sliding or floating`, () => {
        const frames = play(samples(clip, steps), { step: A.step });
        expect(standingSlide(frames), 'total slide (px)').toBeLessThanOrEqual(5);
        expect(hover(frames), 'floating foot (px)').toBe(0);
      });
    }
    const gaits: Array<[string, typeof A.walk, number, number]> = [
      ['walk forward', A.walk, A.stride, PHYS.walkForward],
      ['walk back', A.walk, A.stride, -PHYS.walkBack],
      ['run', A.run, A.runStride, PHYS.runSpeed],
    ];
    for (const [name, clip, stride, speed] of gaits) {
      it(`${id} ${name}: planted feet move with the floor, not over it`, () => {
        // Raw cycle (no planting): the gait itself must already be right.
        const raw = slip(play(cycle(clip, stride, speed), { dx: speed, plant: false }));
        expect(raw.mean, 'raw cycle mean slip (px/step)').toBeLessThan(0.6);
        const planted = slip(play(cycle(clip, stride, speed), { dx: speed, modes: ['gait', 'gait'] }));
        expect(planted.max, 'planted max slip (px/step)').toBeLessThan(4);
        expect(planted.mean).toBeLessThan(0.4);
      });
    }
    it(`${id}: take-off and landing add little to the jump's own jolt`, () => {
      const j = jumpJolts(id, true);
      expect(j.takeoff).toBeLessThan(j.physics.takeoff + 4);
      expect(j.touchdown).toBeLessThan(j.physics.touchdown + 3);
    });
  }
});

describe('skeleton maths', () => {
  it('leg IK reproduces forward kinematics', () => {
    for (let thigh = -60; thigh <= 120; thigh += 15) {
      for (let knee = -140; knee <= -12; knee += 16) {
        const { ankle } = legFK([thigh, knee]);
        const ik = legIK(ankle)!;
        expect(ik).not.toBeNull();
        const back = legFK(ik).ankle;
        expect(back.x).toBeCloseTo(ankle.x, 3);
        expect(back.y).toBeCloseTo(ankle.y, 3);
      }
    }
    expect(legIK({ x: 0, y: 120 })).toBeNull();
  });

  it('a planted foot stays put while the body moves over it', () => {
    const planter = new FootPlanter();
    const pose = clonePose(getAnimSet('kaen').stance);
    const hip = { x: 0, y: hipHeight(pose, true) };
    const world: number[] = [];
    for (let t = 0; t < 12; t++) {
      const rootX = 400 + t * 1.5; // body creeps forward 18 px
      const legs = planter.solve({ pose, hip, rootX, scaleX: 1, plant: ['hold', 'hold'] });
      const sockets = { x: 3, y: 0 };
      world.push(rootX + hip.x + sockets.x + legFK(legs.legF).ankle.x);
    }
    expect(Math.max(...world.slice(3)) - Math.min(...world.slice(3))).toBeLessThan(1.5);
  });

  it('a foot left behind by the pose takes a step instead of sliding', () => {
    const planter = new FootPlanter({ frames: 6, height: 12 });
    const pose = clonePose(getAnimSet('kaen').stance);
    const hip = { x: 0, y: hipHeight(pose, true) };
    const heights: number[] = [];
    for (let t = 0; t < 30; t++) {
      const rootX = t < 4 ? 400 : 383; // shoved 17 px back: both feet must re-step
      const legs = planter.solve({ pose, hip, rootX, scaleX: 1, plant: ['step', 'step'] });
      heights.push(-FOOT_CLEARANCE - (hip.y + legFK(legs.legB).ankle.y));
    }
    expect(Math.max(...heights), 'the back foot lifts into a step').toBeGreaterThan(5);
    expect(heights[heights.length - 1]).toBeLessThan(0.5);
  });
});

// ---------------------------------------------------------------- in play

const STATES: FighterState[] = [
  'intro', 'idle', 'walk', 'run', 'dash', 'backdash', 'prejump', 'air', 'land', 'attack', 'block', 'blockstun',
  'parry', 'parried', 'hitstun', 'knockdown', 'down', 'getup', 'ko', 'victory', 'lose',
];

describe('clip selection', () => {
  it('every fighter state has a clip, and attacks follow the move frame', () => {
    const sim = new Sim();
    const f = sim.a;
    const A = getAnimSet('kaen');
    for (const st of STATES) {
      f.state = st;
      if (st === 'attack') {
        f.state = 'idle';
        f.setInput(input({ punch: true }));
        f.update();
        f.update();
      }
      const sel = selectClip(f, A, { walk: 0, run: 0 });
      expect(sel.clip.keys.length, st).toBeGreaterThan(0);
      if (st === 'attack') expect(sel.time).toBe(f.moveFrame);
    }
  });

  it('pushback, air and lying states never plant the feet; walking uses the gait', () => {
    const f = new Sim().a;
    const pose = clonePose(getAnimSet('kaen').stance);
    for (const st of ['hitstun', 'blockstun', 'parried', 'dash', 'backdash', 'knockdown'] as FighterState[]) {
      f.state = st;
      expect(plantModes(f, pose, true), st).toEqual(['free', 'free']);
    }
    f.state = 'idle';
    expect(plantModes(f, pose, false)).toEqual(['free', 'free']);
    expect(plantModes(f, { ...pose, lying: 1 }, true)).toEqual(['free', 'free']);
    f.state = 'walk';
    expect(plantModes(f, pose, true)).toEqual(['gait', 'gait']);
  });
});

/** Drives both fighters of a Sim and a PoseDriver each, recording foot world positions. */
class Watched {
  readonly drivers: [PoseDriver, PoseDriver];
  /** Per fighter, per step: [front, back] world x and height. */
  readonly feet: Array<Array<{ x: [number, number]; h: [number, number]; planted: [boolean, boolean] }>> = [[], []];

  constructor(readonly sim: Sim) {
    this.drivers = [new PoseDriver(sim.a, getAnimSet(sim.a.def.id)), new PoseDriver(sim.b, getAnimSet(sim.b.def.id))];
    for (const d of this.drivers) d.snap();
  }

  step(ia: FighterInput = EMPTY_INPUT, ib: FighterInput = EMPTY_INPUT): void {
    this.sim.step(ia, ib);
    this.drivers.forEach((d, i) => {
      d.tick();
      const f: Fighter = d.f;
      const q = [d.joints.ankF, d.joints.ankB].map((a) => toRoot(a, d.hip, d.pose.rootRot));
      const grounded = f.grounded && f.state !== 'knockdown';
      const modes = plantModes(f, d.pose, grounded);
      this.feet[i].push({
        x: [f.x + q[0].x * d.scaleX, f.x + q[1].x * d.scaleX],
        h: [-FOOT_CLEARANCE - q[0].y, -FOOT_CLEARANCE - q[1].y],
        planted: [modes[0] !== 'free', modes[1] !== 'free'],
      });
      this.states[i].push(`${f.state}${f.move ? ` ${f.move.id} (${f.movePhase})` : ''}, feet ${modes.join('/')}`);
      for (const v of [d.hip.x, d.hip.y, d.scaleX, d.joints.handF.x, d.joints.toeF.y]) expect(Number.isFinite(v)).toBe(true);
    });
  }

  /** What each fighter was doing on each step (for failure messages). */
  readonly states: string[][] = [[], []];

  /** Worst single-step slide of a foot that is planted and on the floor on both steps, and where. */
  worstSlide(i: 0 | 1): { px: number; where: string } {
    let px = 0;
    let where = 'nowhere';
    const fr = this.feet[i];
    for (let t = 1; t < fr.length; t++) {
      for (const k of [0, 1] as const) {
        const a = fr[t - 1];
        const b = fr[t];
        const d = Math.abs(b.x[k] - a.x[k]);
        if (a.planted[k] && b.planted[k] && a.h[k] < 1 && b.h[k] < 1 && d > px) {
          px = d;
          where = `step ${t}, ${k ? 'back' : 'front'} foot: ${this.states[i][t - 1]} → ${this.states[i][t]}`;
        }
      }
    }
    return { px, where };
  }
}

describe('in play', () => {
  for (const [me, them] of [['kaen', 'yoru'], ['yoru', 'kaen']] as const) {
    it(`${me}: footwork through walking, guarding, strikes, jumps, dashes and a run stays planted`, () => {
      const w = new Watched(new Sim(me, them, 360, 760));
      const script: Array<[number, Partial<FighterInput>]> = [
        [40, {}],
        [50, { right: true }],
        [30, { left: true }],
        [20, { block: true }],
        [30, { punch: true }],
        [30, { kick: true }],
        [40, { heavy: true }],
        [50, { up: true }],
        [30, {}],
        [6, { dash: true, right: true }],
        [40, { right: true }],
        [30, {}],
        [20, { dash: true, left: true }],
        [30, {}],
      ];
      for (const [steps, press] of script) for (let t = 0; t < steps; t++) w.step(input(press));
      const slide = w.worstSlide(0);
      expect(slide.px, `largest planted-foot slide in one step (px), at ${slide.where}`).toBeLessThan(4);
    });
  }

  it('animation never changes the fight: a match plays out identically with or without the rigs', () => {
    const script = (t: number): FighterInput => {
      const r = Math.sin(t * 12.9898) * 43758.5453;
      const u = r - Math.floor(r);
      return input({ right: u < 0.3, left: u > 0.85, punch: t % 17 === 0, kick: t % 23 === 0, heavy: t % 41 === 0, up: t % 97 === 0, block: u > 0.6 && u < 0.7 });
    };
    const mirror = (t: number) => script(t + 1000);
    const plain = new Sim('kaen', 'yoru');
    for (let t = 0; t < 1500; t++) plain.step(script(t), mirror(t));
    const watched = new Watched(new Sim('kaen', 'yoru'));
    for (let t = 0; t < 1500; t++) watched.step(script(t), mirror(t));
    const sum = (s: Sim) => [s.a.hp, s.b.hp, s.a.x, s.b.x, s.a.state, s.b.state, s.hits.length];
    expect(sum(watched.sim)).toEqual(sum(plain));
  });

  it('survives long random play and rematches: no NaN poses, no runaway state', () => {
    for (let round = 0; round < 3; round++) {
      const w = new Watched(new Sim(round % 2 ? 'yoru' : 'kaen', round % 2 ? 'kaen' : 'yoru'));
      let seed = 1234 + round;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      const pick = (): FighterInput =>
        input({ left: rnd() < 0.3, right: rnd() < 0.4, up: rnd() < 0.03, punch: rnd() < 0.08, kick: rnd() < 0.06, heavy: rnd() < 0.03, special: rnd() < 0.02, block: rnd() < 0.15, dash: rnd() < 0.03 });
      for (let t = 0; t < 1200; t++) w.step(pick(), pick());
      for (const d of w.drivers) d.snap();
      expect(w.drivers.every((d) => Number.isFinite(d.hip.y))).toBe(true);
    }
  });
});
