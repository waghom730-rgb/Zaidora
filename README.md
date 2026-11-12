# ZAIKORA

A 2D anime martial arts fighting game built with **Phaser 3 + TypeScript + Vite**.

A playable 1v1 browser fighting game: two original, fully animated fighters, one arena,
movement, jumping (with flips), punches, kicks, blocking, chain combos, knockdowns,
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
`npm run preview` (serve the build), `npm run typecheck`.

## Controls

| Key       | Action                          |
| --------- | ------------------------------- |
| A / D     | Move left / right               |
| W         | Jump (hold A/D to jump forward or back) |
| J         | Punch                           |
| K         | Kick                            |
| S         | Block (hold)                    |
| ESC       | Pause (Q from pause = quit to menu) |
| M         | Mute / unmute                   |
| `         | Toggle hitbox debug view        |

**Combos** — press the next button as the previous hit connects:

- `J, J, K` — Jab → Straight → Roundhouse (knockdown)
- `K, K` — Front Kick → Roundhouse
- `J, K` — Jab → Roundhouse
- Jump in with `K`, land, then start a combo.

## How it works

- **Fixed 60 Hz simulation.** Game logic runs in fixed steps (`FightScene.update`), so frame data
  is identical on any display. Rendering happens every display frame.
- **Frame data.** Every attack in `src/combat/moves.ts` has startup / active / recovery frames,
  damage, hitstun, blockstun, knockback, hitstop and a hitbox. Tune the game feel there.
- **Hitboxes, hurtboxes, pushboxes.** Custom (not physics-engine) boxes, resolved in
  `CombatManager`. Press `` ` `` in a fight to see them: green = hurtbox, red = active hitbox,
  blue = pushbox.
- **Game feel.** Hitstop (freeze on impact), screen shake, hit sparks, white hit-flash,
  speed lines, input buffering (10 frames), slow-motion KO.
- **Controllers.** `Fighter` is pure simulation with no Phaser code. The keyboard (`InputManager`)
  and the CPU (`EnemyAI`) both produce the same `FighterInput`, so the CPU plays by the
  player's rules — and local 2-player is just a second `InputManager`.
- **Character art.** Every body part (head with 3 expressions, torso, arms, legs) is painted
  once at boot as cel-shaded vector art (`render/CharacterArt.ts`) at 2.5x resolution, then
  assembled as a cut-out skeleton (`render/FighterRig.ts`) — no image files needed.
- **Animation.** Keyframe clips with easing and cross-fades for every state
  (`render/animations.ts`): idle bounce, shuffle walk cycles, jump flips, squash & stretch,
  wind-up / strike / follow-through attacks, high and body hit reactions, knockdown, get-up,
  per-character intros and victories, exhausted time-over pose. Expressions change with
  the action (focused, shouting, hurt).
- **Secondary motion.** Headband tails, ponytail, scarf and belt tails are verlet ropes
  (`render/Rope.ts`) that trail and flutter with movement.
- **Effects.** Swoosh trails, afterimages on heavy kicks and flips, character-styled hit
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
│   ├── moves.ts             Frame data and chain routes for every attack
│   ├── CombatManager.ts     Hit detection, blocking, combos, body separation
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
```

## Roadmap

1. ~~Foundation~~ ✅ — Phaser setup, canvas, game loop, background, movement
2. ~~Combat engine~~ ✅ — attacks, hitboxes, damage, blocking, knockback, combos, AI opponent
3. **Anime abilities** — energy meter, special attack (`L`), projectiles, aura, particles
4. **Enemy intelligence** — smarter AI, spacing, reading the player
5. **Complete game** — ~~character select~~ ✅, ~~character art & animation~~ ✅, more fighters,
   more arenas, story mode, music, progression
