# Session 2 — Match presentation (VS screen, countdown, HUD)

**Date:** 2026-11-13 · **Branch:** `feature/match-presentation` (from `main` at `498d532`) ·
**Scope:** only what the player sees between choosing a fighter and the first punch, plus the
fight HUD. Combat rules, frame data, the AI, animation clips and the save server are unchanged.

## 1. Audit (before any change)

| Area | What existed | Gap |
|---|---|---|
| Select → fight | Confirm plays the fighter's celebrate pose, then fades straight into `FightScene` after 1.3 s. A static "VS" label sits between the two fighters on the select screen. | No VS screen. Nothing introduces the matchup, the CPU's difficulty or the Arcade Ladder stage before the fight. |
| Round start | Round 1: 96-frame character intros. Every round: `ROUND N` (or `FINAL ROUND`) banner, then `FIGHT!` at +80 frames; controls go live at +92. Inputs pressed during the intro are polled and thrown away. | No 3-2-1 countdown, so the moment control starts is hard to anticipate. |
| HUD | Slanted health bars with a damage trail and a low-health pulse, energy meters with READY/NEED ENERGY, a timer that turns red under 10 s, round marks, combo counter, PARRY/COUNTER callouts, ladder subtitle, controls hint. | No portraits: fighters are identified only by coloured name text, and nothing on the HUD reacts to being hurt, using a special or being knocked out. |
| Rematch | Results → `FightScene` directly. | Fine as is: rematches should stay fast. |
| Pause | Esc pauses in every phase except match over; the phase timer only advances in the fixed step, so intros freeze correctly. | None. |

Baseline (before changes): `tsc` 0 errors · `vitest` 73/73 · `vite build` OK · browser suites: every
check that ran passed (40). The progression suite then hit a 30 s timeout while another session was
running its own headless-Chrome suite (load average ~16) — a load problem, not a game failure.

## 2. Plan

1. **VS screen** — a new `VersusScene` between character select and the fight (not on rematch).
   Both fighters in their colours playing their intro, names and styles, each fighter's intro line
   from the design bible, a slammed-in VS, the match line (CPU difficulty or ladder stage). It is skippable.
2. **Countdown** — `ROUND N` → 3 → 2 → 1 → `FIGHT!`, each beat with a sound; control starts on FIGHT.
3. **HUD portraits** — each fighter's existing painted head (no new art) in a frame at the outer end
   of the health bar. It flinches with a red flash when hit, shows the hurt face at low health, shouts on
   specials and round wins, and greys out when knocked out.

## 3. What was built

| Change | Where | Details |
|---|---|---|
| VS screen | `src/scenes/VersusScene.ts` (new scene), `main.ts`, `CharacterSelectScene.ts`, `ResultScene.ts`, `fighterDefs.ts` (`vsLine`) | Colour panels slide in (0–320 ms); VS slams down at 380 ms with a shake, a flash and a hit sound; names, style + YOU/CPU tag and intro line slide in (430/560/900 ms); each fighter's intro aura fires on its existing `INTRO_CUE`; auto-advances at 2.8 s. Enter/J/Space skip it after 450 ms (so the select-screen press can't skip it); Esc returns to select. Shown after character select and for every Arcade Ladder stage; a versus rematch skips it. Creates no textures (the stability suite's texture count is unchanged). |
| Countdown | `FightScene.ts` (`COUNT_AT`, `FIGHT_AT`, `LIVE_AT`), `AudioManager.ts` (`count` tick) | `ROUND N` → 3 → 2 → 1 → `FIGHT!` on a 0.5 s beat. Control starts 10 frames after FIGHT! appears: 156 frames after the intros (was 92), i.e. about 1.1 s longer per round. Inputs during the countdown are still discarded. |
| HUD portraits | `HUD.ts` (`Portrait`, layout), `FightScene.ts` (3 one-line hooks) | 84 px frame in each top corner, using the head art painted at boot (outfits included), mirrored for P2 and cropped to the frame. Health bars now start beside the portrait (418 px wide, was 470); names and energy meters line up with them. Driven by `setHealth` (flinch on any drop, hurt face at ≤25 %), `specialStart` and round wins (shout), and round loss (grey). It resets every round and freezes while paused. |

Not changed: combat, frame data, the AI, animation clips/renderer, accounts and saves.

## 4. Tests and build

Run on the merged tree (this branch + `origin/main` at `258263f`, which brought in the Phase 1
animation polish):

| Check | Result |
|---|---|
| `tsc` | ✅ 0 errors |
| `vitest` (server tests against a throwaway local `mongod`) | ✅ 128 passed, 1 skipped (the opt-in animation audit writer) |
| Browser suites (`npm run test:browser`, with `TEST_MONGODB_URI`) | ✅ 69 passed, 0 failed, no page errors (60 existing + 9 new) |
| `vite build` | ✅ |

New browser checks:

- **flow** — VS screen introduces Yoru vs Kaen; the round counts down ROUND 1 → 3 → 2 → 1 → FIGHT!;
  D held through the whole countdown doesn't move the player before FIGHT!; the round loser's portrait
  greys out (time-over), portraits reset the next round, and a real KO hit leaves the CPU portrait
  hurt and greyed; Esc on the VS screen returns to select with the fighter still chosen.
- **stability** — over 6 consecutive matches, change fighter goes through the VS screen and rematch skips it
  (listener, object and texture counts unchanged as before).
- **progression** — the next Arcade Ladder stage is introduced on the VS screen (`STAGE 2/10`).

Visual check in headless Chrome at 1280×720: the VS screen for both picks at 250 / 700 / 1500 ms,
every countdown beat, and each portrait state (normal, flinch, low health, shout, defeated).

## 5. Remaining issues and notes

- **Pre-fight length (round 1):** VS screen up to 2.8 s (skippable), then the intros (1.6 s), then
  the countdown (2.6 s). Rounds 2–3 have only the countdown. If it feels slow on real hardware,
  shorten `COUNT_AT`/`FIGHT_AT` in `FightScene.ts`.
- Countdown, VS and portrait reactions use the synthesized placeholder sounds — audio is Session 3.
- Headless Chrome runs at ~40 FPS with software rendering. FPS on the target laptop is not measured
  yet (Session 5).
- With another session's headless-Chrome suite running at the same time, browser tests can hit
  30 s timeouts. Run browser suites one at a time.
