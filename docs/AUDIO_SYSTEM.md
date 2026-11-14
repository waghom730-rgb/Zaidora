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

## 2. What was built

All sound still goes through one object, `audio` in `src/systems/AudioManager.ts`. Its public calls
(`play`, `unlock`, `setMuted`, `toggleMute`, `muted`) are unchanged, so existing call sites kept
working. Phaser's sound system stays off. Nothing else in the game makes sound.

```
effects (one buffer player each) ─┬─ pan ─► effects bus ─────────────────────┐
                                  │                                          ├─► master ─► limiter ─► speakers
music sequencer ─► instrument channels ─► music bus ─► pause dip ─► K.O. dip ┘
                          └─ reverb send ─► room reverb ─┘
```

| Part | File | What it does |
|---|---|---|
| Manager | `src/systems/AudioManager.ts` | Context and mix; volumes and mute, saved per device; duplicate and voice limits; effects pre-render; optional audio files with fallback; scene music; pause and K.O. dips; autoplay, hidden-tab and interruption handling; `debug()` for tests |
| Instruments | `src/systems/audio/synth.ts` | Oscillators and filtered noise for effects; small samples computed at start-up: koto (plucked string), bass, taiko, shime, kick, clap, hat, crash, gong; room reverb |
| Effects | `src/systems/audio/sfx.ts` | 34 effect recipes, each with its category, length, peak level, variants, minimum gap and copy limit; which swing and impact each move makes |
| Music | `src/systems/audio/music.ts` | Five pieces written as note data; a look-ahead sequencer (25 ms ticks, 0.2 s ahead, on the audio clock); crossfades |
| Settings panel | `src/ui/AudioPanel.ts` | Master, music and effects sliders and sound on/off, keyboard-driven; used by the main menu and the pause screen |

**Scene music.** `src/main.ts` hooks every scene's start and end, and `sceneMusic()` picks the track.
Effects that belong to a fight or the VS screen are cut within about 50 ms when that scene ends;
menu sounds finish.

| Where | Music |
|---|---|
| Sign-in, main menu, Dojo, profile | "Thirty Paths" |
| Character select | "Choose Your Path" |
| VS screen | none, so the slam lands; the previous track fades out |
| Fight | "Clash of Masters"; dips for 2.2 s on a K.O., to 35% while paused, and fades out over 1.8 s once the match is decided |
| Results | "Rise" after a win, "Fallen Leaves" after a loss, "Thirty Paths" after a draw |

**Duplicate protection.** Each effect has a minimum gap (repeats closer together are dropped) and a
limit on copies playing at once. Across all effects there's a cap of 24 voices. Ten identical
sounds in one instant play once. Hit reactions have a 260 ms gap, so combos don't chatter.

**Effects pre-render.** On the first key press every effect and its variants (55 buffers) is
rendered once into a buffer and scaled to its target peak. After that, playing an effect is a
single buffer player. Until the pre-render finishes (about 0.3 s), or in a browser without
offline rendering, the same recipe is synthesized live. Repeated sounds rotate through 2–3
slightly different variants.

**Audio files (optional).** `AUDIO_FILES.sfx` and `AUDIO_FILES.music` can point any effect or track
at a recorded file. Both are empty now. An effect file loads with the pre-render; a track file
loads the first time the track is wanted. A file that's missing or won't decode is logged as a
warning, and the generated version plays instead.

## 3. Music and effects

### Music: five original pieces

| Track | Tempo | Key and melody scale | Length | Instruments |
|---|---|---|---|---|
| Thirty Paths (menu) | 84 | D minor, hirajoshi melody | 45.7 s loop | koto, pad, bass, taiko, shime, gong; flute from bar 5 |
| Choose Your Path (select) | 104 | D minor, hirajoshi melody | 36.9 s loop | kick, clap, hat, shime, taiko, crash, bass, pad, koto (takes the hook second time round) |
| Clash of Masters (fight) | 144 | D minor, hirajoshi melody | 3.3 s taiko build-in, then a 40 s loop: A (koto riff), B (flute melody), A′ (both) | full kit, bass, pad, koto, flute |
| Rise (win) | 120 | D major, yo melody | 8 s fanfare, then a calm 16 s loop | taiko, gong, crash, flute, koto, pad, bass, shime |
| Fallen Leaves (loss) | 70 | D minor, in-scale melody | 10.3 s falling flute line, then a quiet 13.7 s loop | pad, bass, koto, flute, taiko, gong |

### Effects: 34 sounds

| Group | Sounds | When |
|---|---|---|
| Swings | punch, kick, heavy | an attack reaching its active frames (by limb and weight) |
| Impacts | punch light/heavy, kick light/heavy | a hit landing (heavy for heavy moves, counters and K.O.s) |
| Defence | block, parry, counter | from the existing hit events |
| Specials | fireball launch, fireball impact, Shadow Dash, power-up | special start, projectile spawn, projectile hit |
| Bodies | step, jump, land, knockdown, get-up, hit reaction (Kaen, Yoru) | fighter events; get-up is a new one-line event in `Fighter.ts` (sound only) |
| Match | VS slam, round call, 3-2-1, FIGHT!, round won, round lost, time up, K.O., READY | round flow, on exact frames |
| Menus | move, confirm, back, denied | menu cursor, confirm, Escape, not enough energy / can't buy |

Every combat sound is triggered by an existing one-shot event (a hit from `CombatManager`, a
`Fighter` event, or a frame in the round flow), never by checking state every frame. Combat sounds
are panned slightly toward where they happen on screen.

**The 20 placeholders.** Each was replaced only once its replacement rendered and passed the level
checks: whoosh → punch/kick/heavy swings; hitLight/hitHeavy → punch and kick impacts by weight;
the VS slam (it used hitHeavy) → its own sound; time-up (it used the round chime) → a temple bell.
The other 16 keep their names with new sounds. The unit test "replaces every placeholder sound"
checks the mapping.

## 4. Assets and licensing

There are no audio files. All music and effects are generated in code at runtime, from
oscillators, filtered noise and samples computed by the game itself. The compositions and sound
designs were written for ZAIKORA in this branch. Nothing is sampled from, transcribed from or
modelled on an existing anime or game soundtrack, and no third-party audio or audio library is
used. Licensing: the project's own work.

There is no announcer voice. READY, FIGHT! and K.O. are drum, bell and gong cues, and the words are
on screen. A voice needs a voice actor or a properly licensed voice, as the design bible
(section 13.1) requires.

## 5. Settings

- **Main menu → SOUND**, and the **pause screen**: master, music and effects volume in 10% steps,
  and sound on/off. Changes apply immediately: you hear a hit when changing effects, and the
  music when changing music.
- **M** turns sound on or off anywhere, mid-fight included. It doesn't fire while typing on the
  sign-in form.
- Defaults are master 90%, music 70% and effects 90%, sound on. Slider position maps to loudness
  on a squared curve.
- Saved on this device (`localStorage`, key `zaikora.audio`) and restored on the next visit. Sound
  on/off is also still saved with the account, as before, so it follows a signed-in player.
  Volumes are per device, so no change to the save data or server.

## 6. Browser behaviour

| Case | Behaviour |
|---|---|
| Autoplay | No audio context exists before the first key press, click or tap. Music asked for earlier (the menu theme at start-up) starts on that first gesture. |
| Hidden tab | The audio context is suspended (no sound, no audio CPU) and resumes when the tab is shown. |
| Muted | The context is suspended too. Unmuting resumes the music where it was, or starts the current scene's track if the scene changed meanwhile (nothing is queued while muted). |
| Interruptions | A context suspended or 'interrupted' by the browser or OS resumes on the next key press or click. A suspend or resume that crosses a later change (M twice quickly, a quick tab switch) settles to the right state. |
| Main thread stalls | The sequencer drops notes it missed instead of playing them all at once. |
| Scene changes | One track at a time; crossfades of 0.8 s; a fight's sounds are cut when it ends. |
| Repeated matches | Faded tracks are freed 1.5 s after their fade; no growth over repeated matches (tested). |
| Missing files | Warning in the console; the generated sound plays (tested). |

## 7. Tests

**Unit: `tests/audio.test.ts`, 34 tests, no browser needed.**

| Area | What's checked |
|---|---|
| Settings | Defaults when nothing or garbage is saved; clamping; wrong types ignored; the volume curve |
| Duplicate protection | Minimum gap; copy limit while playing and release when finished; the global voice cap |
| Scene music | Every scene → its track (win, loss and draw on the results screen) |
| Music data | For each track: every note is in its key and every melody in its scale; instruments stay in a playable range; events fit whole bars, in order; loops last 13–60 s; battle is the fastest tempo, defeat the slowest |
| Sequencer | Over 100 s of irregular 5–60 ms ticks it gives exactly the expected notes, with no gaps or repeats, the intro once, and the right loop count; after a 30 s stall it drops what it missed instead of bursting |
| Effects | All 34 have usable recipes; all 20 placeholders are replaced; each move gets the swing and impact for its limb and weight; each fighter gets their own hit reaction |

**Browser: `tests/browser/audio.mjs`, 37 checks in real Chrome.** The game is driven with real key
presses from menu → character select → VS → fight → results, plus:
- no audio context before the first key press;
- the menu, select and battle music audible at the master bus;
- effects make sounds when hits land, and nothing clips;
- ten identical sounds in an instant play once, and a flood stays under the voice cap;
- pause dips the music and its sliders work;
- quitting a fight cuts its sounds within 250 ms, and the battle music is freed after its fade;
- a hidden tab suspends audio and showing it resumes;
- the SOUND menu saves and restores settings across a reload;
- M, M twice quickly, and Cmd+M (ignored);
- changing scenes while muted, then unmuting, starts only the current track;
- four matches in a row with the right victory or defeat theme each time;
- a recorded file replacing an effect, missing effect and track files falling back;
- every track rendered offline with sound and no clipping;
- M on the sign-in screen leaves the guest save untouched.

**Independent review.** A separate reviewer read the whole change. It found four real problems,
all fixed and covered by the checks above:
1. M on the sign-in screen could overwrite a guest's save with a blank one.
2. Changing scenes while muted queued music that burst out on unmute.
3. Music fades didn't fade the reverb.
4. A quick double M or tab switch could leave the game silent until the next key press.

It also found smaller ones, also fixed:
- Cmd+M toggled sound.
- Touch devices weren't unlocked.
- Muting could click.
- The flute's breath cut out on long notes.
- The pre-render made about 20 MB of throwaway noise buffers.
- Older Safari had no stereo panner, which could have thrown inside the fight loop. All audio
  calls are now guarded, so an audio error can't stop the game.

**Full regression** (local test database for the account tests):

| Check | Result |
|---|---|
| Type check | clean |
| Unit tests | 167 passed, 1 skipped (was 133 + 34 new) |
| Production build | passed; JS 1,386 kB (383 kB gzipped), of which the audio system is about 33 kB minified |
| Browser checks | 106 passed, 0 failed (69 existing + 37 audio), no page errors |

## 8. Performance

Measured in headless Chrome on the development Mac. The Ryzen 3 laptop still needs measuring
(Stage 3).

| Measure | Result |
|---|---|
| Audio files downloaded | none |
| Effects pre-render, after the first key press | about 0.3 s, in the menu; 55 buffers, 4.8 MB |
| Music instrument samples (koto, bass, drums, reverb, noise) | about 3.5 MB, made once |
| Playing an effect | one buffer player, plus a panner when placed on screen |
| Music synthesis cost (time to render offline, used as a proxy for real-time cost) | battle 3.1 s of work per 43 s of music, about 7% of one core; select and menu about 3–4%; victory and defeat about 2–3% |
| Main thread | a 25 ms sequencer tick; the battle theme queues about 24 notes per second |
| Muted or hidden tab | audio context suspended: no audio CPU |
| Heap per match (stability suite) | 73–99 MB after the first match, against 64–80 MB on `main` in the same session; no growth across matches. The first match reads 113–207 MB on both branches (start-up garbage). |

While building, the battle theme cost 5.1 s of work per 43 s. Three changes brought it to 3.1 s:
- Bass notes became one looping sample each instead of five nodes with a swept filter. Sweeping a
  filter makes the browser recompute it every sample.
- Pads use one oscillator per note instead of two.
- The reverb tail is 1.7 s instead of 2.2 s.

## 9. Remaining issues

- **Nobody has listened to it yet.** I can't hear audio. The music and effects were checked by
  measurement: levels, clipping, silence, cut-off tails, scales, and timing. Whether they sound
  good is for you to judge. Listening previews of all five tracks and every effect in sequence
  were rendered from the final code; they are local files, not committed.
- **Synthesized sound.** Everything is synthesized (koto, flute, taiko). It's stylised, not
  orchestral. Any track or effect can later be replaced by a composer's recording through
  `AUDIO_FILES`, with no other code changes.
- **Hit reactions.** These are short synthesized grunts and may sound artificial. They're one line
  in `FightScene.onHit` to remove.
- **No announcer voice.** There are no voice lines; see section 4.
- **READY and TIME UP.** The READY sound exists but isn't heard yet, because the READY beat itself
  is Stage 4. The time-up bell plays now, but the banner still says "TIME" until Stage 4.
- **One battle theme.** Per-arena or per-character battle music would come with the Phase 2 arenas.
- **Browsers.** Tested only in Chrome (headless). Firefox and Safari aren't tested. Code paths for
  Safari's differences are in place but haven't been tested.
- **Real hardware.** CPU and frame rate on the Ryzen 3 / 8 GB laptop aren't measured yet (Stage 3).
- **Sign-in form.** Its HTML buttons have no hover sound. All in-game menus are keyboard-driven,
  and moving the cursor plays the selection sound.
- **Settings per device.** Volumes are saved per device. Sound on/off also follows the account, as
  before.

## 10. Recommended next task

Stage 2, the smart CPU (`feature/smart-cpu`), as the roadmap says, once this branch is reviewed
and merged. Before then, play a few matches with sound on and listen; tell me any sound or track
you don't like.
