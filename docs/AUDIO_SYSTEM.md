# ZAIKORA — Audio System

Branch `feature/audio-system`, from `main` at `20b081c`.

## 1. Audit: audio before this branch

Written before any audio code changed.

**Implementation.** `src/systems/AudioManager.ts` (199 lines) exports one `audio` object with its own
Web Audio context. Phaser's sound system is switched off (`audio: { noAudio: true }` in `src/main.ts`).
All 20 sounds are synthesized when played from an oscillator or a burst of filtered noise. There are
no audio files, and the `public/` folder is empty. There is no music.

**Call sites.** 52 `audio.*` calls across 9 scenes. The combat sounds already come from event paths,
not from per-frame checks:

| Source | Where | Sounds |
|---|---|---|
| `CombatManager.resolveAttacks()` returns `HitEvent`s | `FightScene.onHit` | parry, block, hitLight / hitHeavy, counter |
| `Fighter.events` (one-shot, drained once per step) | `FightScene.drainEvents` | whoosh / dash, powerup, fireball, denied, jump, step, land, thud |
| Round flow, on exact frame numbers | `FightScene.updatePhase`, `endRound` | powerup (intros), round, count, fight, ko, round (time) |
| Menus | Menu, CharacterSelect, Versus, Result, Dojo, Profile, Account | select, confirm, powerup, hitHeavy (VS slam), denied |

**Scene lifecycle.** One scene runs at a time; scenes hand over with `scene.start` after a camera fade.
`FightScene` is reused between matches (`init` resets it). Nothing stops sounds when a scene shuts
down. So far that didn't matter, because the longest sound (`ko`) lasts 1.1 s.

**Mute.** `M` works only in `FightScene`, and the pause screen shows it. It's stored in the save
(`settings.muted`): on the server for accounts, in `localStorage` for guests. `BootScene` and
`AccountScene` apply it. Mute sets the master gain to 0 and skips new sounds. There are no volume
levels.

**Autoplay.** The context is created in `audio.unlock()`, which every scene's key handler calls, so
it always starts from a user gesture, as Chrome requires. Before the first key press there is no
sound. Mouse clicks (used only on the sign-in form) unlock through that form's own handler.

**Overlap and duplicates.** Nothing limits them. Every `play()` builds new nodes, with no cap on
voices and no minimum gap between repeats of the same sound. There's no limiter on the output, so a
burst of hits can clip.

**Browser events.** Phaser pauses its loop when the tab is hidden, but the audio context keeps
running. That's harmless now, since nothing long is playing, but it matters once music exists.
