# ZAIKORA

A 2D anime martial arts fighting game built with **Phaser 3 + TypeScript + Vite**.
Full design: [docs/ZAIKORA_Game_Design_Bible.md](docs/ZAIKORA_Game_Design_Bible.md) — this
repository is the early prototype of that game.

A playable 1v1 browser fighting game: two original, fully animated fighters, one arena,
movement (walk, dash, run, evade), jumping (with flips), punches, kicks, heavy attacks,
blocking, parries and counter hits, chain combos, knockdowns,
health bars, a round timer, best-of-3 rounds, character select, a CPU opponent with three
difficulty levels, and victory/defeat screens.

| Fighter | Look | Style |
| ------- | ---- | ----- |
| **Kaen** — Blazing Fist | Crimson flame-spiked hair, white headband, open red gi with flame hem, taped fists | Bouncy boxer stance, fire hit effects |
| **Yoru** — Silent Shadow | Silver ponytail, face mask, long purple scarf, indigo gi with crescent crest | Low composed stance, shadow-slash hit effects |

## Run it

Requires Node.js 20.19+ or 22.12+.

```bash
npm install
npm run dev        # open the URL Vite prints (http://localhost:5173)
```

Other scripts: `npm run build` (type-check + production build into `dist/`),
`npm run preview` (serve the build), `npm run typecheck`, `npm test` (headless combat and
CPU tests, see [Tests](#tests)).

## Controls

| Key       | Action                          |
| --------- | ------------------------------- |
| A / D     | Move left / right               |
| W         | Jump (hold A/D to jump forward or back) |
| J         | Punch                           |
| K         | Kick                            |
| U         | Heavy attack (character-specific) |
| L         | Special (costs energy)          |
| S         | Block (hold) · **tap just before a hit lands = parry** |
| Space     | Dash (holding forward; keep holding to run) · Evade (holding back or no direction) |
| ESC       | Pause (Q from pause = quit to menu) |
| M         | Mute / unmute                   |
| `         | Toggle hitbox debug view        |

**Combos** — press the next button as the previous hit connects:

- `J, J, K` — Jab → Straight → Roundhouse (knockdown)
- `J, J, U` — Jab → Straight → Heavy (big stagger)
- `J, U` · `K, U` — Jab or Front Kick → Heavy
- `K, K` — Front Kick → Roundhouse
- `J, K` — Jab → Roundhouse
- Jump in with `K`, land, then start a combo.
- End a combo with `L`: jab, straight, front kick or heavy can cancel into the special on hit
  (`J, J, U, L` is the longest route — 4 hits).

**Heavies (U)** — slow, high-damage strikes, unsafe if blocked (about −10, punishable), so
use them to finish a confirmed combo or to punish:

| Fighter | Heavy | Frames (startup / active / recovery) | Damage |
| ------- | ----- | ------------------------------------ | ------ |
| Kaen | **Flame Strike** — lunging rear-hand haymaker | 13 / 4 / 22 | 14 |
| Yoru | **Shadow Slash** — gliding high-to-low blade-hand cut, longer reach | 11 / 5 / 21 | 12 |

**Movement** — `Space` + forward dashes (~100 px, attacks can cancel it from frame 6); keep
holding forward to run. Attacks out of a dash or run keep some momentum, and a running jump
goes further. `Space` + back (or no direction) evades: a backstep that is invulnerable for its
first 10 frames, then punishable.

**Defence** — hold `S` to block. Tap `S` within 6 frames of a hit landing to **parry**: no
damage, +12 energy, and the attacker is staggered for 28 frames — free time for a counter.
Fireballs can be parried too. Mashing doesn't work: a new parry window can only open 24 frames
after the last one. **Counter hits** — hitting an opponent during their attack startup, a parry
stagger or an evade's recovery deals 25% more damage with extra hitstun (shown as COUNTER).

**Energy & specials** — the meter under your health bar fills when your attacks land
(a little when you block, and more when you parry). Each segment pays for one special (50 of 100):

| Fighter | Special | What it does | Counterplay |
| ------- | ------- | ------------ | ----------- |
| Kaen | **Fireball** | Flaming punch launches a projectile (10 damage) | Block it, or jump it with good timing; punish up close |
| Yoru | **Shadow Dash** | Low rush of ~180 px ending in a strike (11 damage) | Block it — he's left wide open (−8) |

## How it works

- **Fixed 60 Hz simulation.** Game logic runs in fixed steps (`FightScene.update`), so frame data
  is identical on any display. Rendering happens every display frame.
- **Frame data.** Every attack in `src/combat/moves.ts` has startup / active / recovery frames,
  damage, hitstun, blockstun, knockback, hitstop and a hitbox. Tune the game feel there.
- **Hitboxes, hurtboxes, pushboxes.** Custom (not physics-engine) boxes, resolved in
  `CombatManager`. Press `` ` `` in a fight to see them: green = hurtbox, red = active hitbox,
  blue = pushbox.
- **Game feel.** Hitstop (freeze on impact, longest on parries), screen shake, hit sparks,
  golden parry flash, white hit-flash, PARRY! / COUNTER callouts, speed lines, input
  buffering (10 frames), slow-motion KO.
- **Controllers.** `Fighter` is pure simulation with no Phaser code. The keyboard (`InputManager`)
  and the CPU (`EnemyAI`) both produce the same `FighterInput`, so the CPU plays by the
  player's rules — and local 2-player is just a second `InputManager`.
- **Character art.** Every body part (head with 3 expressions, torso, arms, legs) is painted
  once at boot as cel-shaded vector art (`render/CharacterArt.ts`) at 2.5x resolution, then
  assembled as a cut-out skeleton (`render/FighterRig.ts`) — no image files needed.
- **Animation.** Keyframe clips with easing and cross-fades for every state
  (`render/animations.ts`): idle bounce, shuffle walk cycles, jump flips, squash & stretch,
  wind-up / strike / follow-through attacks, per-character dash and run cycles (Kaen pumps
  his fists, Yoru sprints low with his arms trailing), evade hop, parry deflect, parried
  stagger, high / body / heavy hit reactions, knockdown, get-up,
  per-character intros and victories, exhausted time-over pose. Expressions change with
  the action (focused, shouting, hurt).
- **Secondary motion.** Headband tails, ponytail, scarf and belt tails are verlet ropes
  (`render/Rope.ts`) that trail and flutter with movement.
- **Effects.** Swoosh trails, afterimages on heavy attacks, flips, dashes and evades, character-styled hit
  sparks (fire / shadow slash), intro and victory auras, cinematic KO zoom.
- **Camera.** The fight camera zooms in and tracks the fighters; the HUD is drawn by a
  separate unzoomed camera. Sound effects are synthesized with Web Audio.
- Swapping in hand-drawn sprite sheets later only touches `render/` — combat code and
  hitboxes are independent of the visuals.

## Project structure

```
src/
├── main.ts                  Phaser game config
├── config.ts                Constants: stage size, physics tuning, rounds, difficulty storage
├── scenes/
│   ├── BootScene.ts         Generates textures, then opens the menu
│   ├── MenuScene.ts         Title, difficulty select, controls
│   ├── CharacterSelectScene.ts  Pick Kaen or Yoru (CPU takes the other)
│   ├── FightScene.ts        Fixed-step loop, rounds, intros, hitstop, KO camera, pause, debug
│   ├── ResultScene.ts       Victory / defeat, stats, rematch / change fighter
│   └── showcase.ts          Animated characters on menu screens
├── entities/
│   ├── Fighter.ts           State machine, movement, hurt/hit/push boxes
│   └── fighterDefs.ts       Kaen & Yoru: names, colors, effect styles
├── combat/
│   ├── moves.ts             Frame data, chain routes, energy gains, specials
│   ├── CombatManager.ts     Hit detection, blocking, combos, projectiles, body separation
│   ├── EnergyManager.ts     Energy rules: earning, spending, refusing specials
│   ├── Projectile.ts        Flying attacks (Fireball)
│   └── types.ts             Box, FighterInput, overlap helpers
├── systems/
│   ├── InputManager.ts      Keyboard → FighterInput
│   ├── EnemyAI.ts           CPU opponent (easy / normal / hard profiles)
│   └── AudioManager.ts      Synthesized sound effects
├── render/
│   ├── CharacterArt.ts      Paints each character's body parts and expressions
│   ├── FighterRig.ts        Cut-out skeleton, animation playback, ropes, trails, afterimages
│   ├── animations.ts        Keyframe clips: stances, walks, attacks, reactions, intros, victories
│   ├── poses.ts             Pose type and blending helpers
│   └── Rope.ts              Verlet rope for hair and cloth
├── arena/Arena.ts           Sunset dojo background, lantern glow, cherry petals
├── effects/Effects.ts       Hit sparks, fire / shadow styles, block flashes, dust, auras
└── ui/                      HUD, health bars, text styles
tests/
├── sim.ts                   Headless match simulation (same step order as FightScene)
├── combat.test.ts           Chains, no-infinite checks, heavies, parry, dash / run / evade
└── ai.test.ts               Seeded CPU-vs-CPU rounds: stability, difficulty ordering, move usage
```

## Tests

`npm test` runs the combat simulation headlessly (no browser) — `Fighter`, `CombatManager`,
`EnergyManager` and `EnemyAI` contain no Phaser code. It checks every listed combo route for
both characters, that nothing links into itself after any grounded hit (no infinites), that
the longest possible chain is 4 hits, that heavies are punishable on block, parry timing /
anti-mash / fireball parries / counter damage, dash, run, running jumps and evade
invulnerability (including with a wall behind), and seeded CPU-vs-CPU rounds (Hard must beat
Easy in at least 75% of rounds).

`npm run test:browser` plays the real game in headless Chrome (needs Google Chrome installed;
set `CHROME_PATH` to use another Chromium). It starts its own dev server and checks:

- **flow** — real key presses through menu → character select → fight (combo, heavy, dash,
  evade, time-over, KO rounds) → results → change fighter → menu.
- **specials** — energy costs and refusal, energy gains, Fireball (single hit, block, jump,
  cleanup, special cancel, punishable) and Shadow Dash (hit, block, travel distance).
- **stability** — seven matches in a row without leaking listeners, projectiles, objects or
  textures; pause and timer; focus loss; double-KO and equal-health draws.

Run one suite with e.g. `npm run test:browser -- specials`, or point at a running server with
`BASE_URL=http://localhost:5173 npm run test:browser`.

## Roadmap

1. ~~Foundation~~ ✅ — Phaser setup, canvas, game loop, background, movement
2. ~~Combat engine~~ ✅ — attacks, hitboxes, damage, blocking, knockback, combos, AI opponent
3. **Anime abilities** — ~~energy meter~~ ✅, ~~special attack (`L`): Fireball, Shadow Dash~~ ✅,
   more specials per discipline
4. **Enemy intelligence** — ~~reaction jitter, evades, dash-ins, heavy punishes, fireball
   parries~~ ✅, spacing, reading the player's patterns
5. **Complete game** — ~~character select~~ ✅, ~~character art & animation~~ ✅, more fighters,
   more arenas, story mode, music, progression
