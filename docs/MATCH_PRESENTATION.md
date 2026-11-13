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
