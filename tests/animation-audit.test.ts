// Writes the animation audit table (no assertions). Run with:
//   AUDIT=report.md npx vitest run tests/animation-audit.test.ts      (AUDIT_PLANT=0 for the raw animation)
import { writeFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { MOVES, type MoveId } from '../src/combat/moves';
import { PHYS } from '../src/config';
import { getAnimSet } from '../src/render/animations';
import { IDS, cycle, hover, jumpJolts, maxAngularStep, play, ropeJitter, samples, slip, standingSlide, strikeSync } from './animMetrics';

const PLANT = process.env.AUDIT_PLANT !== '0';
const f1 = (n: number) => n.toFixed(1);

describe.skipIf(!process.env.AUDIT)('animation audit report', () => {
  it('prints the report', () => {
    const lines: string[] = [];
    const log = (s: string) => lines.push(s);
    log(`\n# Animation audit (${PLANT ? 'with foot planting' : 'raw animation, no planting'})\n`);

    for (const id of IDS) {
      const A = getAnimSet(id);
      log(`\n## ${id}\n`);
      log('| Clip | Standing foot slide (px) | Floating foot (px) | Biggest joint jump (°/step) |');
      log('|---|---|---|---|');
      // [clip, steps, planted by the rig?] — blockstun slides back with the pushback on purpose.
      const standing: Array<[string, typeof A.idle, number, boolean]> = [
        ['idle', A.idle, 120, true],
        ['block', A.block, 20, true],
        ['blockstun', A.blockstun, 20, false],
        ['land', A.land, 8, true],
        ['prejump', A.prejump, 4, true],
        ['parry', A.parry, 14, true],
        ['intro', A.intro, 90, true],
        ['victory', A.victory, 90, true],
        ['lose', A.lose, 80, true],
      ];
      for (const [name, clip, steps, planted] of standing) {
        const poses = samples(clip, steps);
        const frames = play(poses, { plant: PLANT && planted, step: A.step });
        log(`| ${name} | ${f1(standingSlide(frames))} | ${f1(hover(frames))} | ${f1(maxAngularStep(poses))} |`);
      }

      log('\n| Locomotion | Foot slip while planted: max / mean (px/step) | Floating foot (px) |');
      log('|---|---|---|');
      const moving: Array<[string, typeof A.walk, number, number]> = [
        ['walk forward', A.walk, A.stride, PHYS.walkForward],
        ['walk back', A.walk, A.stride, -PHYS.walkBack],
        ['run', A.run, A.runStride, PHYS.runSpeed],
      ];
      for (const [name, clip, stride, speed] of moving) {
        const frames = play(cycle(clip, stride, speed), { dx: speed, plant: PLANT, modes: ['gait', 'gait'] });
        const s = slip(frames);
        log(`| ${name} | ${f1(s.max)} / ${f1(s.mean)} | ${f1(hover(frames))} |`);
      }
      const j = jumpJolts(id, PLANT);
      log(
        `\nJump jolts (biggest sudden change in body speed, px/step²; the jump physics alone gives ${f1(j.physics.takeoff)} / ${f1(j.physics.touchdown)}): take-off ${f1(j.takeoff)}, touch-down ${f1(j.touchdown)}`,
      );
      log(`Hair/cloth jitter: idle ${ropeJitter(id, samples(A.idle, 240)).toFixed(3)}, walking ${ropeJitter(id, cycle(A.walk, A.stride, PHYS.walkForward, 240), PHYS.walkForward).toFixed(3)} px/step²`);

      log('\n| Attack | Tip → hitbox, first active frame (px) | Worst over active frames (px) | Reaches hitbox early? | Biggest joint jump outside the strike (°/step) |');
      log('|---|---|---|---|---|');
      for (const moveId of Object.keys(MOVES) as MoveId[]) {
        const sync = strikeSync(id, moveId);
        const m = MOVES[moveId];
        // The strike itself is meant to snap; look for pops everywhere else.
        const jump = maxAngularStep(samples(A.attacks[moveId]), (t) => t === m.startup || t === m.startup - 1);
        log(
          `| ${moveId} | ${sync ? f1(sync.distAtActive) : 'n/a (body)'} | ${sync ? f1(sync.worstActive) : '–'} | ${sync?.earlyFrame != null ? `yes (frame ${sync.earlyFrame})` : 'no'} | ${f1(jump)} |`,
        );
      }
    }
    writeFileSync(process.env.AUDIT as string, lines.join('\n') + '\n');
  });
});
