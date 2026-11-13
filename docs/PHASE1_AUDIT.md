# Phase 1 — Stage 1 baseline audit (Kaen vs Yoru)

**Date:** 2026-11-12 · **Audited state:** commit `48002f0` plus the uncommitted energy/specials
work (README, `EnemyAI.ts`, `docs/`) that was on disk at 17:04. · **Method:** the code was read in
full and a snapshot was built and tested in Chrome on a separate port, so concurrent Phase 1
edits did not affect results.

> **Concurrent work:** session *project2-77* owns Phase 1 source changes from this point.
> Items it reported as being built are marked **🛠 in progress (project2-77)** — they are
> not gaps and should not be implemented a second time.

## 1. Summary

The prototype builds cleanly, runs without console errors, and passes every browser test
(28 pass/fail checks, the full-flow run and two probes — section 9). Much of the Phase 1 plan already exists — especially Stage 5 (energy + Fireball +
Shadow Dash) and most of Stages 6–7 (effects, CPU, match flow). The real gaps are in **combat
depth and character identity**: both fighters share the same normal attacks, there is no
dash/parry/heavy button yet (in progress), and a few animation-quality issues (idle foot
slide, single-planted-foot posing) block the Stage 4 acceptance tests.

**What the plan asks for vs. what exists**

| Plan stage | Status before Phase 1 work |
|---|---|
| 1. Audit & stabilise | ✅ This document. No regressions or crashes found. |
| 2. State machine & movement | Partial — explicit state machine exists (16 states). Dash, run, evade, parry: 🛠 in progress. No walk acceleration. |
| 3. Attacks & hit detection | Mostly done — data-driven frame data, one-hit-per-attack, hitbox debug view, chain combos, input buffer. Heavy attacks, parry, counter hits: 🛠 in progress. Per-character normals: **gap**. |
| 4. Animation overhaul | Base done (keyframe clips, cross-fades, secondary motion, expressions). Gaps: idle foot slide, taunt, defeat animation, per-character attack animations. |
| 5. Energy & specials | ✅ Done and tested (energy meter, Fireball, Shadow Dash, CPU use/defence). Parry energy gain: 🛠 in progress. |
| 6. Effects & audio | Effects ✅ mostly done. Audio: synthesized SFX + mute only — no music, voice or volume sliders. |
| 7. CPU & match flow | CPU ✅ three distinct profiles. Match flow ✅ best-of-3, draws, results, rematch. Gaps: VS screen, 3-2-1 countdown, HUD portraits, corner/health-aware CPU. |
| 8. QA & release | Browser tests exist but live outside the repo. Headless sim tests (vitest): 🛠 in progress. Real-hardware FPS not yet measured. |

## 2. Files and responsibilities

| File | Responsibility | Plan's equivalent | Stage 2–8 guidance |
|---|---|---|---|
| `src/main.ts` | Phaser config, scene list | `config/gameConfig` | Leave |
| `src/config.ts` | Stage size, physics, depths, difficulty storage | `config/combatConfig` | Modify (movement tuning) |
| `src/entities/Fighter.ts` | **State machine**, movement, hurt/hit/push boxes, buffer, receiving hits. No Phaser code. | `fighters/Fighter` + `FighterStateMachine` | Modify (🛠) |
| `src/entities/fighterDefs.ts` | Kaen/Yoru identity: names, colours, special, fx style | `characters/Kaen`, `Yoru` | Modify (per-character movesets) |
| `src/combat/moves.ts` | **All attack data**: frame data, damage, hitboxes, chains, energy gain, special data | `combat/AttackData` | Modify (🛠) |
| `src/combat/CombatManager.ts` | Hit detection (melee + projectiles), blocking, combo count, pushboxes, camera walls | `CombatManager`, `HitboxManager`, `BlockManager` | Modify (🛠 parry) |
| `src/combat/EnergyManager.ts` | Energy rules: gain, spend, refuse | `EnergyManager` | Modify (🛠 parry gain) |
| `src/combat/Projectile.ts` | Projectile entity (Fireball) | `abilities/Fireball` | Leave |
| `src/combat/types.ts` | `Box`, `FighterInput`, overlap helpers | `FighterTypes` | Modify (🛠 heavy/dash inputs) |
| `src/systems/InputManager.ts` | Keyboard → `FighterInput` per step (event-based presses) | `FighterController` | Modify (🛠) |
| `src/systems/EnemyAI.ts` | CPU: delayed perception, plans, combos, specials, fireball defence | `ai/FighterAI` + `DifficultyProfiles` | Modify (🛠) |
| `src/systems/AudioManager.ts` | Web Audio synthesized SFX, mute | `audio/AudioManager` | Modify (Stage 6: volumes) |
| `src/render/CharacterArt.ts` | Paints every body part + 3 expressions per character at boot | (renderer) | **Leave** unless redesigning art |
| `src/render/FighterRig.ts` | Cut-out skeleton, clip selection, blending, ropes, trails, afterimages, flash | `animation/AnimationController` | Modify (🛠) |
| `src/render/animations.ts` | **All animation clips** (keyframes + easing), per-character stances, intros, victories | `animation/AnimationRegistry` | Modify (🛠) |
| `src/render/poses.ts` | Pose type + blend helpers | — | Modify (🛠 `lift`) |
| `src/render/Rope.ts` | Verlet rope for hair/scarf/headband/belt | — | Leave |
| `src/effects/Effects.ts` | Hit sparks (fire/shadow), block flash, dust, auras | `effects/HitEffects`, `ParticleManager` | Modify (Stage 6: parry flash) |
| `src/effects/ProjectileView.ts` | Fireball visual | `abilities/Fireball` (view) | Leave |
| `src/scenes/FightScene.ts` | Fixed 60 Hz loop, hitstop, rounds, intros, camera, pause, debug, event → sound/fx | `scenes/FightScene` + `CameraEffects` | Modify (🛠) |
| `src/scenes/MenuScene.ts`, `CharacterSelectScene.ts`, `ResultScene.ts`, `showcase.ts`, `BootScene.ts` | Menus, select, results, animated characters on menus, texture painting | `scenes/*` | Modify only for Stage 7 (VS screen) |
| `src/ui/HUD.ts`, `HealthBar.ts`, `EnergyBar.ts`, `textStyles.ts` | HUD (bars, timer, round marks, combo, announcer), energy meter | `ui/*` | Modify HUD for portraits/countdown |
| `src/arena/Arena.ts` | Painted sunset-dojo stage, lanterns, petals | — | Leave |

**Architecture rule check:** ✅ rendering never decides combat. `Fighter`/`CombatManager` have no
Phaser code; `FighterRig` only reads fighter state. Sounds/effects are triggered from combat
events (`FighterEvent`, `HitEvent`), never from animation.

## 3. Controls (current)

| Key | Action | Notes |
|---|---|---|
| A / D | Walk back / forward | Instant speed, no acceleration. Forward 4.4 px/step, back 3.4. |
| W | Jump (with A/D: directional flip) | 4-frame takeoff, ~39 frames airborne, apex ~170 px |
| J / K | Punch / kick | 10-frame input buffer |
| L | Special (costs 50 energy) | Kaen Fireball, Yoru Shadow Dash |
| S | Block (hold) | Blocks everything (no high/low) |
| Esc / Q / M / \` | Pause / quit from pause / mute / hitbox view | |
| Menus | W/S/A/D or arrows, Enter/Space/J, Esc; C on results = change fighter | |
| 🛠 U / Space | Heavy / dash-evade | In progress (project2-77) |

## 4. Fighter states

Current: `intro, idle, walk, prejump, air, land, attack, block, blockstun, hitstun, knockdown,
down, getup, ko, victory, lose`. Specials use `attack` with startup/active/recovery phases.

| Plan state | Current mapping |
|---|---|
| JumpStart / Rise / Fall | `prejump` / `air` (rise vs fall chosen by velocity in the renderer) |
| Hit / Knockback | `hitstun` (knockback is velocity inside it) |
| SpecialStartup/Active/Recovery | `attack` + `movePhase` on a special move |
| Defeat | `ko` (knockout) or `lose` (time-over exhausted pose) |
| Dash, Parry (+ run, backdash, parried) | 🛠 in progress (project2-77) |

## 5. Animation clips

Selected per state in `FighterRig.selectClip`; lengths in logic steps (1/60 s).

| Clip | Length | Notes |
|---|---|---|
| `idle` | 36 (Kaen) / 60 (Yoru), looping | Kaen boxer bounce, Yoru slow breathing |
| `walk` | 32 / 36, driven by distance | Shuffle step; reversed when retreating |
| `prejump`, `land` | 1 / 5 | Squash on takeoff and landing |
| `airN`, `airF`, `airB` | 32 / 33 / 33 | Tuck; forward and back flips with afterimages |
| `block`, `blockstun` | hold / 7 | |
| `hit` (high / body) | 20 | Chosen by hit height |
| `knockdown`, `down`, `getup` | 14 / 5 / 18 | |
| `atk<move>` | = move's frame data | Wind-up → strike exactly on first active frame → follow-through |
| `intro` | 86 (Kaen) / 80 (Yoru) | Round 1 only |
| `victory` | loops from 24 / 30 | Kaen fist pump, Yoru arms folded |
| `lose` | loops from 20 | Time-over only |

Expressions: `normal`, `shout` (attacks/intro), `hurt`. Secondary motion: Kaen headband + belt
tails; Yoru scarf, ponytail, sash.

## 6. Attack data (current values)

Frames at 60 per second. *Advantage on block* is how many frames sooner the attacker can act than
the defender after a block (negative = punishable).

| Move | Start | Active | Recov. | Dmg | Hitstun | Blockstun | Energy | Chains to | Special cancel |
|---|---|---|---|---|---|---|---|---|---|
| jab (J) | 4 | 3 | 9 | 5 | 17 | 11 | 4 | J→cross, K→roundhouse | yes |
| cross (J,J) | 6 | 3 | 13 | 8 | 19 | 13 | 6 | K→roundhouse | yes |
| frontKick (K) | 8 | 4 | 15 | 9 | 19 | 13 | 6 | K→roundhouse | yes |
| roundhouse | 10 | 4 | 22 | 13 | knockdown | 16 | 9 | — | no |
| airPunch | 4 | 6 | 8 | 6 | 16 | 12 | 5 | — | no |
| airKick | 6 | 8 | 8 | 9 | 20 | 14 | 6 | — | no |
| fireball (Kaen, L) | 13 | 1 | 26 | 10 | 20 | 15 | — | — | — |
| shadowDash (Yoru, L) | 10 | 12 | 20 | 11 | 22 | 14 | — | — | — |

Energy: max 100, special cost 50, blocked attack gives attacker 40 % and defender +4, energy
**carries over fully between rounds**. Measured: point-blank blocked Fireball −11, blocked
Shadow Dash −8, Fireball jumpable when jumping ~150–210 px before impact.

**Both characters use identical normal moves and walk speeds** — only specials, stance,
animation and effects differ.

## 7. CPU profiles

| | Easy | Normal | Hard |
|---|---|---|---|
| Reaction delay (frames) | 24 | 15 | 9 |
| Block chance | 0.15 | 0.45 | 0.75 |
| Aggression | 0.35 | 0.6 | 0.85 |
| Combo continuation | 0.25 | 0.6 | 0.92 |
| Special use | 0.25 | 0.6 | 1.0 |

The CPU reads the opponent with a reaction delay (no input reading), holds block through
hitstun on harder levels, punishes recovery, uses specials for zoning, rushing and combo
finishers, and blocks or times jumps over fireballs. Measured vs 12 fireballs: Easy hit 12,
Normal 2, Hard 2.

## 8. Match flow and HUD

Title → character select (pick Kaen or Yoru; CPU takes the other) → fight (round-1 character
intros, ROUND/FIGHT announcer, 60 s timer, best of 3, KO slow-motion + camera push-in,
time-over, draws) → results (Rematch / Change fighter / Menu). HUD: slanted health bars with
damage trail, energy meters with READY/NEED ENERGY states, timer, round marks, combo counter,
control hints.

## 9. Build and test results

`tsc` ✅ 0 errors · `vite build` ✅ (1.29 MB JS, 350 KB gzipped — Phaser is most of it) ·
browser console: **0 errors** across all runs.

| Suite | Result |
|---|---|
| Full flow (menu → select → fight → time-over → 3 rounds → results → change fighter → menu) | ✅ pass |
| Specials & energy (15 checks: refusal, gains, single hit, block, jump, cleanup, cancel, punishability, travel) | ✅ 15/15 |
| Stability (13 checks: 7 consecutive matches, no duplicate listeners, no stale projectiles, energy reset, stable object/texture counts, pause/timer, quit, double KO, equal-health draw, 2–2 draw result) | ✅ 13/13 |
| Probes: corner jab loop | No loop — wall pushback prevents chained jabs |
| Probes: window loses focus while holding a key | Keys released (no stuck movement) |

Memory across 7 matches: 84 → 60 MB (settles; no growth). **FPS on real hardware not
measured** — headless runs use software rendering (~40–45 FPS) and are not representative;
measure on the target integrated-GPU laptop in Stage 8.

The browser tests currently live in a scratch folder, not in this repo — see recommendations.

## 10. Known bugs and gaps (prioritised)

**Combat / identity**
1. **Identical normals for both characters** — the plan's per-character lists (Flame Jab,
   Rising Uppercut… / Silent Palm, Low Shadow Sweep…) don't exist. Per-character heavies:
   🛠 in progress.
2. **Nothing beats block except chip-free pressure** — no throws, no high/low. Parry: 🛠 in
   progress. "Low Shadow Sweep" implies low attacks, which needs a decision on crouching.
3. **Energy carries over fully between rounds** — the plan recommends a partial reset.
4. Energy gains (4–9 per hit) differ from the plan's starting values (light +5, heavy +8,
   parry +10). Needs a balancing pass once heavies/parry land.

**Animation (blocks Stage 4 acceptance tests)**
5. **Kaen's idle bounce slides his feet ~2–3 px** (legs re-pose without foot locking). Yoru's
   idle is fine (<1 px). Fix with foot-locking IK or re-tuned idle keyframes.
6. Only the lowest foot is planted — the other foot can float 1–4 px in some poses (e.g. hit
   reaction). Same fix as 5.
7. Walk cycle feet slide slightly relative to the floor (phase follows distance, feet aren't
   locked).
8. Possible small vertical pop on landing (renderer switches from air to ground anchoring) —
   verify visually.
9. Missing clips: taunt, dedicated KO/defeat animation, per-character attack animations,
   dash/parry (🛠).

**CPU**
10. No corner awareness, health awareness or habit tracking (plan 7.1).
11. While waiting to jump a fireball the CPU stands still without blocking for a moment — a
    possible exploit (throw fireball, then rush in).

**Presentation / audio**
12. No VS screen, no 3-2-1 countdown, no HUD portraits; character intros only in round 1.
13. Audio is synthesized placeholder SFX; no music, voice, or separate volume controls (mute only).

**Tooling**
14. Browser tests are not in the repo; headless sim tests: 🛠 in progress.
15. No real-hardware performance measurement yet.

## 11. Recommendations

- **Don't re-implement** anything in the "done" rows of section 1 — extend it.
- Keep combat data in `moves.ts` and give each `FighterDef` its own moveset table, rather than
  adding new manager layers; the existing split already matches the plan's responsibilities.
- When changing any strike pose in `animations.ts`, re-check hitbox alignment with the \` debug view.
- Move the Playwright suites (flow, specials, stability) into the repo next to the vitest
  tests, and run them before every merge.
- Decisions needed from the user: energy carry-over rule; crouch/low attacks (yes/no);
  throws (yes/no); per-character normal lists to implement first.
