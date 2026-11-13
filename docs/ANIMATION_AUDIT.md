# Phase 1 — Animation polish audit (Kaen vs Yoru)

**Date:** 2026-11-13 · **Scope:** animation only. No frame data, damage, hitboxes, combo routes,
AI or menus changed. · **Status:** done and regression-tested (unit tests, browser suites and
build all pass, see section 6).

## 1. Summary

Every clip was measured before and after the work, using the same skeleton maths the renderer
uses, and every move was inspected frame by frame in real gameplay in Chrome.

The main changes:

- **Feet stay on the floor.** A foot-planting system with leg IK holds a standing foot still while
  the body moves over it. When the stance changes, the foot takes a small, real step instead of
  sliding. The walk and run cycles are now generated from planned foot paths, so the planted foot
  moves with the floor by construction.
- **Strikes are locked to the frame data.** Every attack's striking limb reaches its hitbox
  exactly on the first active frame. Before, it already touched the hitbox one frame early on
  7 of 9 moves. It also now stays on the hitbox through every active frame.
- **Each character has their own feel.** Kaen drives forward, rotates his torso, throws a rising
  uppercut and bounces back into his stance. Yoru stays low and compact, has a crescent kick and
  a spinning heel kick, and resets to guard precisely.
- **Transitions are smoother.**
  - Landings absorb through the knees.
  - Jump take-off no longer snaps the hip.
  - Turning around swings through edge-on instead of flipping in one frame.
  - Stopping out of a run skids.

## 2. How it was measured

- `tests/animMetrics.ts` holds the measurements. `tests/animation-audit.test.ts` prints the full
  tables:
  `AUDIT=report.md npx vitest run tests/animation-audit.test.ts` (add `AUDIT_PLANT=0` for the raw
  clips).
- **Before** is the original `animations.ts` (commit `3bb0460`), measured raw. That is exactly how
  the old rig drew it, because there was no planting or smoothing.
- **After** is the current pipeline: clips, then foot planting, then hip smoothing.
- Definitions:
  - *Standing foot slide* is the total distance (px) a foot moves while touching the floor,
    summed over the whole clip.
  - *Floating* is a foot hovering 1.5–6 px above the floor for 4 or more steps.
  - *Slip* is how far a planted foot moves per step (px) while walking or running at game
    speed.
  - *Jolt* is the biggest one-step change in body speed (px/step²) through a real jump. The
    jump physics alone produces 16.6 at take-off and 14.8 at touch-down.
- **Browser inspection:** the game loop was stepped one logic frame at a time in Chrome (WebGL,
  hitbox overlay on), and frames were captured for the following, for both characters:
  - idle, walk, run, skid, jump and landing;
  - each attack at coil, last startup frame, contact, follow-through and recovery;
  - turn-arounds and victory.

## 3. Before → after

### Footwork

| | Kaen before | Kaen after | Yoru before | Yoru after |
|---|---|---|---|---|
| Idle: foot slide / floating (px) | 15.2 / 1.5 | **3.0 / 0** | 2.6 / 1.5 | **0.4 / 0** |
| Block: floating (px) | 2.7 | **0** | 2.7 | **0** |
| Parry: foot slide (px) | 7.2 | **0** | 7.2 | **0** |
| Intro: foot slide (px) | 24.3 | **1.7** | 39.2 | **3.5** |
| Victory: foot slide (px) | 20.2 | **3.0** | 29.6 | **1.1** |
| Lose: foot slide / floating (px) | 3.7 / 1.5 | 3.7 / **0** | 1.5 / 1.7 | 4.0 / **0** |
| Walk forward: slip max / mean (px/step) | 8.3 / 3.1 | **2.6 / 0.1** | 6.6 / 3.7 | **3.6 / 0.2** |
| Walk back: slip max / mean | 6.7 / 2.3 | **2.9 / 0.2** | 5.2 / 2.8 | **3.2 / 0.2** |
| Run: slip max / mean | 19.9 / 6.9 | **0.5 / 0.0** | 20.7 / 7.0 | **1.7 / 0.1** |
| Jump take-off jolt (physics alone: 16.6) | 36.7 | **19.0** | 36.7 | **19.0** |
| Landing jolt (physics alone: 14.8) | 34.9 | **16.0** | 34.9 | **11.8** |

In real play, a scripted sequence (walk, guard, strikes, jump, dash, run, stop and evade) keeps
every planted foot within 4 px per step. This is checked in `tests/animation.test.ts`.

### Combat sync

| Move | Before: limb in hitbox early? | After |
|---|---|---|
| jab | no | no |
| cross | yes (frame 5 of 6) | no |
| frontKick | yes (frame 7 of 8) | no |
| roundhouse | yes (frame 9 of 10) | no |
| airPunch | no | no |
| airKick | yes (frame 5 of 6) | no |
| flameStrike | yes (frame 12 of 13) | no |
| shadowSlash | yes (frame 10 of 11) | no |
| fireball | yes (frame 12 of 13) | no |

For both characters, every move now shows the limb on the hitbox on the first active frame
(distance 0 px) and on every active frame after it.

### Hair and cloth

| Rope-tip jitter (px/step²) | Kaen before | Kaen after | Yoru before | Yoru after |
|---|---|---|---|---|
| Idle | 0.154 | 0.131 | 0.246 | 0.244 |
| Walking | 0.509 | 0.567 | 0.384 | 0.332 |

The rope physics was not retuned. Kaen's walking number is slightly higher because the new
shuffle bounces more, and the headband follows the head. No jitter was visible in the browser
frames.

## 4. What changed, by task

**Task 2 — footwork**
- Standing states plant both feet: idle, guard, parry, intro, victory, lose, pre-jump, landing
  and get-up. A foot left behind by the pose (after a lunge, or a stance change) takes a small
  arc step, one foot at a time. Kaen's steps are springy (6 frames, 13 px); Yoru's are low
  (5 frames, 8 px).
- The walk and run are IK-generated:
  - Kaen: a 92 px boxer's shuffle with a bounce on each landing, and a high-knee run with fists
    pumping against the legs.
  - Yoru: a low, level 100 px glide, and a long low sprint.
- The first step out of the wide guard steps into the cycle instead of dragging.
- Run acceleration: extra forward drive on the first strides. Stopping a run skids on the front
  foot.
- Jump:
  - Anticipation dip with the arms swinging back.
  - The hip eases into take-off.
  - Landing touches down on long legs and the knees absorb (contact → absorb → settle). The feet
    land exactly where the crouch keeps them.
- Turn-arounds sweep through edge-on: 7 frames for Kaen, 5 for the quicker Yoru.

**Task 3 — Kaen, aggressive**
- Punches drive off the back foot. The cross has a big torso rotation and a lean of up to 30°.
- The flame strike is a rising uppercut. It sinks low with the fist loaded at the hip, meets the
  hitbox at chin height, then carries on skyward with a small hop.
- Kicks follow through. The front kick's leg keeps rising after contact; the roundhouse whips
  through over the top.
- His support leg stays planted where the guard put it.
- Recovery: a bounce at the knees before rising into the stance.
- New peek-a-boo guard.

**Task 4 — Yoru, controlled**
- Lower stance, about 5 px lower at the hip.
- Compact jab and cross: the jab retracts first, and the rear hand stays at the chin.
- Front kick is a crescent: it chambers high and arcs up and over after contact.
- Roundhouse is a spinning heel kick: her back turns to the opponent during startup, and she is
  facing them again on contact, so hitbox alignment is unchanged.
- Recovery: back to guard early, chin down, then holds still.
- New forearm-shield guard.
- Her intro now hops from the folded-arms pose into the wide stance, instead of the feet
  teleporting apart.

**Task 5 — combat sync**
- Attack timing follows the move's own frame data:
  - wind-up (anticipation);
  - coil;
  - an accelerating strike that lands exactly on the first active frame. The fastest moves (jab,
    air punch, air kick) use a single smear frame, because any half-way pose would already
    touch their hitbox;
  - follow-through into early recovery;
  - the character's own settle;
  - back to the base pose by the last recovery frame.
- Hit reactions still start on the hit frame (no blend).
- Knockdown, ground impact and get-up work as before; the body drops onto the floor over a few
  frames instead of in one frame.
- Animation is display-only. A test plays a 1,500-step match with and without the rigs and gets
  an identical result: same health, positions, states and hit count.

## 5. Files

New:
- `src/render/skeleton.ts`: forward kinematics, leg IK, `FootPlanter` (plant, step and drag
  modes) and `HipSmoother`.
- `src/render/gait.ts`: IK-generated walk and run cycles; `stanceShift` / `standAt` for stance
  changes with real footwork.
- `src/render/PoseDriver.ts`: the per-fighter animation pipeline. It is pure, so the tests run
  the exact code the game draws.
- `src/render/clipSelect.ts`: chooses the clip for each state and the plant mode for each foot.
- `src/render/ropeSpecs.ts`: hair and cloth rope definitions, moved out of the rig unchanged.
- `tests/animMetrics.ts`, `tests/animation.test.ts` (55 tests), `tests/animation-audit.test.ts`.

Changed:
- `src/render/animations.ts`: attack timing, character styles, gaits, landing, skid, intro,
  victory and lose footwork.
- `src/render/FighterRig.ts`: now only draws what `PoseDriver` solves.
- `src/render/poses.ts`: new `turn` (spin) channel.

Not touched: `src/combat/*` (frame data, damage, hitboxes), `Fighter.ts`, the scenes, the AI and
the server.

## 6. Tests and build

- `npx tsc`: clean.
- `npm test`: **128 passed**, plus the audit report, which is skipped unless asked for. That is
  the original 73 plus 55 new animation tests, with the server tests run against a throwaway
  local MongoDB (`TEST_MONGODB_URI`).
- `npm run test:browser`: **60 passed, 0 failed** (flow 11, specials and stability 29, progression
  20, including account and save checks against MongoDB). The stability suite's 7 back-to-back
  rematches kept the heap flat at 64–75 MB.
- `npm run build`: passes.

The new animation tests cover:
- strike sync for every move and both characters (no early contact; on the hitbox for the
  whole active window);
- every clip lasting exactly its frame data and ending in the base pose;
- the spin kick and the uppercut;
- planted and floating limits for every standing clip;
- gait slip;
- jump jolts;
- IK matching forward kinematics;
- planting and re-stepping;
- clip and plant-mode selection for every state;
- in-play footwork;
- combat staying identical with or without animation;
- 3 × 1,200 steps of random play without a NaN pose.

## 7. Remaining issues and limits

- **Pushback states slide on purpose.** Block-stun, hit-stun and parried slide with the knockback
  (a fighting-game convention), so they are not planted.
- **Shadow Slash glides on purpose.** It lunges 4 px/step, so its feet slide with the body,
  suri-ashi style.
- **Lunge drags.** On other lunges the back foot drags at up to 3.5 px/step, then re-steps in
  recovery.
- **Spins are drawn as a horizontal flip.** The cut-out art has no back view, so the spin heel
  kick and turn-arounds are drawn by flipping the art horizontally. Mid-turn the character is
  briefly edge-on and thin.
- **Some fast rotations are deliberate.** The parry deflect snaps about 100° in one frame, and
  Yoru's crescent kick drops its leg at about 41° per frame. These were reviewed and kept.
- **Hair and cloth were not retuned** (see section 3).
- **Performance not yet tested on the target laptop.** It has not been checked on the Ryzen 3 /
  8 GB laptop. The added per-frame work is two small IK solves per fighter. No particles or new
  textures were added.
