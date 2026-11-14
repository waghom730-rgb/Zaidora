# ZAIKORA --- Rise of the 30 Masters

## Complete Game Design, Story, Combat, Animation & Audio Bible

**Document type:** Game Design Document (GDD) + implementation
specification\
**Genre:** 2D anime-inspired martial-arts action/fighting game\
**Target:** Browser-first; desktop keyboard first, mobile controls
later\
**Engine:** Phaser 3 + TypeScript + Vite\
**Status:** Living design document --- update as systems are implemented
and tested

------------------------------------------------------------------------

# 1. Project vision

ZAIKORA is a 2D anime-inspired martial-arts adventure/fighting game
built around thirty martial arts and combat traditions from thirty
countries. The player travels between regions, meets masters, learns
disciplines, uncovers a conspiracy, and fights an organisation trying to
gather thirty ancient combat seals.

The central fantasy is not simply collecting stronger attacks. The
player learns how different combat philosophies work, combines them
intelligently, and chooses the right discipline for each opponent.

### Design pillars

1.  **Martial arts have identity.** Each discipline should have a
    recognisable movement language, range, rhythm, defensive approach
    and signature technique.
2.  **Respect cultural origins.** Every master wears clothing inspired
    by the traditional attire of their country. The Indian master wears
    sage-inspired saffron clothing. Designs must be researched and
    respectful, not costume stereotypes.
3.  **Skill over inflated stats.** Bosses test timing, spacing, defence,
    reads and style switching---not just larger health bars.
4.  **Progression through learning.** Defeating a master unlocks the
    basics; training challenges unlock deeper mastery.
5.  **Fusion adds options, not unlimited power.** A fusion creates
    tactical versatility and trade-offs rather than making earlier
    disciplines obsolete.
6.  **Readable combat.** Attacks need clear anticipation, active frames,
    recovery, hit feedback and counterplay.
7.  **Expandable production.** Character art, animation, audio and
    combat data should be replaceable or extended without rewriting the
    entire game.

### Important status distinction

The existing prototype described in the development transcript is an
early **Anime Martial Arts Arena** build. It has two working prototype
fighters, Kaen and Yoru, with procedural vector artwork and animation.
That does **not** mean the full ZAIKORA story, three protagonists,
thirty masters, ten bosses, fusion system or all voice performances are
already implemented.

-   **Existing prototype content:** Kaen, Yoru, their current procedural
    artwork/animation, arena, basic attacks, blocking, CPU opponents,
    rounds and results flow, plus (added 2026-11-12) the energy meter,
    Kaen's Fireball and Yoru's Shadow Dash. The title screen now reads
    ZAIKORA.
-   **ZAIKORA design content:** the wider story, Kai/Mira/Ren, thirty
    masters, ten chapter bosses, discipline mastery, fusions, weapons,
    story cutscenes and full voice system.
-   **Proposed content in this document:** detailed designs that still
    need implementation and playtesting.

------------------------------------------------------------------------

# 2. Game structure and player journey

## 2.1 Main game loop

1.  Choose a protagonist.
2.  Choose a starting country and base discipline.
3.  Enter a chapter region.
4.  Explore the location and meet its master, locals and possible
    rivals.
5.  Complete a story encounter, trial or challenge.
6.  Defeat or earn the trust of the master.
7.  Unlock the discipline's basic techniques and signature power.
8.  Complete training challenges to improve mastery.
9.  Collect clues, seals and fusion knowledge.
10. Defeat the chapter boss after clearing that chapter's three master
    routes.
11. Continue to the next chapter and uncover more of the Order of
    Shadows.
12. Reach the final confrontation and decide the fate of the seals.

## 2.2 Ten-chapter structure

There are 30 masters: three countries/masters per chapter. Each chapter
has one major boss. The player must clear the three master routes before
the boss becomes available.

  -----------------------------------------------------------------------
  Chapter           Region / focus    Masters           Chapter boss
                                                        concept
  ----------------- ----------------- ----------------- -----------------
  1                 East Asia ---     Japan, China,     The Gatekeeper
                    foundations       South Korea       

  2                 Southeast Asia    Thailand,         The Twin Fang
                    --- rhythm and    Philippines,      
                    weapons           Indonesia         

  3                 South Asia &      India, France,    The Iron Judge
                    Europe ---        Russia            
                    discipline                          

  4                 Middle East &     Israel, Greece,   The Oathbreaker
                    Mediterranean --- Turkey            
                    counters                            

  5                 Central & West    Mongolia,         The War Drummer
                    Asia --- strength Senegal, Myanmar  

  6                 Mainland          Cambodia,         The Masked Regent
                    Southeast Asia    Vietnam, Malaysia 
                    --- heritage                        

  7                 Europe & the      Switzerland,      The Colossus
                    Americas ---      Iceland, Mexico   
                    movement                            

  8                 North America &   USA, United       The Chain Master
                    Caucasus ---      Kingdom, Georgia  
                    control                             

  9                 Central Asia &    Uzbekistan, Iran, The Ashen Marshal
                    Persia ---        Portugal          
                    endurance                           

  10                Africa --- final  Ethiopia,         The Sovereign of
                    seals             Nigeria, plus     Shadows
                                      final master      
                                      route             
  -----------------------------------------------------------------------

**Roster correction required before production lock:** The current draft
roster contains 30 disciplines, but the chapter grouping above is only a
thematic draft and Chapter 10 must contain three distinct country/master
routes. The final chapter map should preserve the exact 30-country
roster below and avoid duplicating or omitting a country. The boss names
are working concepts, not final canon.

## 2.3 Chapter progression rules

-   Each chapter has three master routes and one boss encounter.
-   The boss unlocks only after the three chapter masters are cleared.
-   Master routes can contain optional training, side quests, lore
    scenes and fusion clues.
-   A master may refuse to teach initially. The player must learn why,
    complete a task or demonstrate respect before the challenge becomes
    available.
-   Some masters are not enemies. Some help the player, test the player,
    or conceal a connection to the Order.
-   A master defeat should not automatically mean that the master is
    evil or humiliated. The result can be mutual respect, a lesson, an
    alliance or a reluctant handover of a seal.

------------------------------------------------------------------------

# 3. Story and lore

## 3.1 Premise

Long before the present age, thirty martial traditions protected thirty
ancient combat seals. The seals were not created to grant unlimited
power. Together, they maintained a balance between physical discipline,
intent and an ancient force known as the **First Pulse**.

A secret organisation called the **Order of Shadows** believes the seals
can awaken an ancient warrior---the **Eclipse Sovereign**---and reshape
the world under one absolute fighting doctrine.

The Order has begun hunting the seals. Masters around the world are
being pressured, deceived, challenged or attacked. The player must
travel between them, learn their disciplines and uncover what the Order
is actually trying to awaken.

## 3.2 The deeper truth

The First Pulse responds to discipline and intent. It cannot be
controlled by raw aggression alone. The Eclipse Sovereign was once a
guardian who tried to end conflict by forcing every fighter to follow
one perfect style. That attempt erased choice, individuality and the
value of different traditions.

The Order's leader believes that conflict can be ended by making every
fighter obey one system. The protagonists discover that the seals are
not merely keys: each represents a different way of understanding
combat---balance, patience, courage, adaptability, restraint, protection
and responsibility.

The final conflict is philosophical as well as physical: **does strength
mean controlling everyone, or having the discipline to choose how
strength is used?**

## 3.3 The Order of Shadows

The Order is structured in layers:

-   **Scouts:** locate masters, seals and old records.
-   **Collectors:** challenge or ambush masters to obtain seal
    fragments.
-   **Enforcers:** elite fighters assigned to chapter regions.
-   **The Inner Circle:** senior commanders who each embody a distorted
    combat philosophy.
-   **The Sovereign:** the final antagonist, whose connection to the
    First Pulse is revealed late in the story.

The Order should not be a collection of interchangeable evil ninjas.
Each major member needs a motive, fighting identity, visual silhouette
and relationship to the story.

## 3.4 Main narrative themes

-   Tradition versus rigid control.
-   Strength versus responsibility.
-   Respect between different fighting philosophies.
-   Learning from defeat.
-   Protecting knowledge without treating it as property.
-   The difference between winning a fight and understanding an
    opponent.

------------------------------------------------------------------------

# 4. Protagonists

The three ZAIKORA protagonists are **Kai, Mira and Ren**. Their final
visual designs are not yet locked. Kaen and Yoru are separate prototype
fighters and should not automatically be renamed as Kai or Ren.

All three protagonists can learn all thirty disciplines. Their
differences come from starting attributes, personal techniques,
dialogue, story reactions and combat feel---not exclusive access to
entire martial arts.

## 4.1 Kai --- The Challenger

**Combat identity:** aggressive offence and pressure.\
**Personality:** ambitious, direct, competitive; wants to become the
strongest.\
**Strengths:** combo pressure, close-range follow-ups, damage
conversion.\
**Weaknesses:** can overcommit; recovery and stamina management punish
careless aggression.\
**Story arc:** learns that strength without restraint becomes another
form of domination.

Suggested personal ability: **Rising Resolve** --- a short, earned
offensive momentum state. It should reward clean play and not provide
unlimited damage or armour.

Voice direction: - Medium-low youthful masculine voice. - Confident and
energetic, but not constantly shouting. - Clear attack calls; emotional
restraint in serious story scenes. - Avoid generic exaggerated "anime
hero" delivery.

Sample lines: - Intro: "Show me what your discipline can do." - Round
start: "Let's make this count." - Light hit: "Not bad!" - Heavy hit:
"Break through!" - Low health: "I'm not finished." - Victory: "Strength
means nothing if you can't control it." - Defeat: "I rushed in... I see
it now."

## 4.2 Mira --- The Guardian

**Combat identity:** defence, counters and protecting space.\
**Personality:** thoughtful, disciplined, empathetic; protects
traditions and people.\
**Strengths:** guard, parry windows, counterattacks, defensive
positioning.\
**Weaknesses:** lower immediate pressure; needs patience and accurate
reads.\
**Story arc:** learns that preserving tradition also means allowing it
to evolve.

Suggested personal ability: **Stillwater Guard** --- a limited defensive
focus that improves a correctly timed guard or counter. It must not make
Mira invulnerable.

Voice direction: - Clear, calm feminine voice. - Firm rather than soft;
warmth in conversations, precision in combat. - Short, composed combat
calls. - Avoid making her personality only "the healer" or "the cautious
one."

Sample lines: - Intro: "Power without balance is a danger." - Round
start: "I am ready." - Parry: "Your turn." - Counter: "I saw that
coming." - Low health: "I have more to protect." - Victory: "A strong
guard protects more than the body." - Defeat: "I need to understand what
I missed."

## 4.3 Ren --- The Wanderer

**Combat identity:** speed, evasion, aerial movement and discovery.\
**Personality:** curious, observant, playful under pressure;
investigates the Order's secrets.\
**Strengths:** mobility, spacing, cross-ups, evasive movement.\
**Weaknesses:** lower stability and punishment if trapped or caught
during recovery.\
**Story arc:** learns that knowing the truth is not enough; he must
decide what to do with it.

Suggested personal ability: **Afterimage Step** --- a short
repositioning move with a readable tell and a punishable recovery if
predicted.

Voice direction: - Youthful, quick and expressive. - Slightly playful in
exploration, focused in battle. - Fast delivery must remain
intelligible. - Emotional scenes reveal the seriousness beneath the
humour.

Sample lines: - Intro: "Try keeping up." - Round start: "Let's move." -
Dodge: "Too slow." - Hit: "Okay... felt that." - Low health: "Still one
step ahead." - Victory: "There is always another path." - Defeat: "I
misread you."

## 4.4 Shared protagonist rules

-   Every protagonist can learn every discipline.
-   The chosen base discipline is permanent and cannot be replaced or
    lost.
-   Each protagonist has a distinct personal ability, not a completely
    separate progression tree.
-   Story dialogue may change based on protagonist choice, mastered
    disciplines and discovered clues.
-   Do not lock a player out of content because they chose a particular
    protagonist.

------------------------------------------------------------------------

# 5. Prototype fighters: Kaen and Yoru

These are the two existing fighters in the early Anime Martial Arts
Arena prototype. Their art is procedural vector/cel-shaded artwork
painted in code, not commercial hand-illustrated sprite sheets.

## 5.1 Kaen --- Blazing Fist

**Visual identity** - Crimson flame-spiked hair. - White headband with
flowing tails. - Open red gi with flame detail at the hem. - Taped fists
and ankles. - Bare feet. - Bouncy, forward-leaning boxer stance. -
Fire-themed hit effects.

**Personality direction:** bold, competitive, expressive.\
**Visual animation details:** headband tails and hair have secondary
motion; facial expressions include normal, shouting and hurt.

**Existing prototype animations:** stance/idle, movement, intro, victory
and combat reactions, as described in the development session. Confirm
the exact animation clip names in the code before changing them.

**Special (implemented in prototype, browser-tested 2026-11-12):**
Fireball --- Kaen chambers a flaming fist (13-frame startup), then a
straight punch launches a projectile (10 damage, costs 50 energy). It
hits once, can be blocked or jumped over, disappears off-stage, and a
point-blank blocked Fireball leaves Kaen at −11 frames (punishable).

Sample prototype voice lines: - Intro: "Feel the heat!" - Jab: "Hah!" -
Kick: "Take this!" - Heavy hit: "Burn!" - Hurt: "Ghh!" - Victory:
"That's the heat of battle!" - Defeat: "I let my guard down..."

## 5.2 Yoru --- Silent Shadow

**Visual identity** - Silver ponytail. - Ninja-style face mask. - Long
purple scarf. - Indigo gi with crescent emblem. - Shoulder guard and
bracers. - Split-toe boots. - Low, composed stance. - Shadow-slash hit
effects.

**Personality direction:** quiet, observant, controlled.\
**Visual animation details:** scarf and hair have secondary motion;
facial expressions include normal, shouting and hurt.

**Special (implemented in prototype, browser-tested 2026-11-12):**
Shadow Dash --- 10-frame readable startup, then a 12-frame low rush
(about 180 px including the skid) ending in a blade-hand strike (11
damage, costs 50 energy). Not invulnerable; −8 frames on block
(punishable).

Sample prototype voice lines: - Intro: "You won't see the strike." -
Jab: "Hmph." - Kick: "Disappear." - Heavy hit: "Silence." - Hurt:
"Tch!" - Victory: "The opening was always there." - Defeat: "I misjudged
the distance..."

## 5.3 Prototype versus final-game character status

  -----------------------------------------------------------------------
  Character/content                   Status
  ----------------------------------- -----------------------------------
  Kaen procedural visual design       Existing prototype

  Yoru procedural visual design       Existing prototype

  Kaen/Yoru animation states          Phase 1 polish done (see
                                      ANIMATION_AUDIT.md)

  Kai final design                    Not locked

  Mira final design                   Not locked

  Ren final design                    Not locked

  Thirty master designs               Not completed

  Ten boss designs                    Not completed

  Full recorded voice cast            Not completed

  Kaen Fireball / Yoru Shadow Dash    Implemented in prototype;
                                      browser-tested 2026-11-12
  -----------------------------------------------------------------------

------------------------------------------------------------------------

# 6. Thirty disciplines, masters and signature powers

The following roster is the current design draft. Martial arts, combat
sports, wrestling traditions and weapon practices are not all the same
category. Before production lock, research each tradition's name,
history, attire, equipment and regional variations. The supernatural
powers below are fictional anime abilities inspired by the discipline's
movement or philosophy; they are not claims about real martial arts.

    \# Country          Discipline            Fictional signature power
  ---- ---------------- --------------------- ---------------------------
     1 Japan            Karate                Dragon Fist
     2 China            Sanda                 Lightning Strike
     3 South Korea      Taekwondo             Sky Breaker
     4 Thailand         Muay Thai             Thunder Elbow
     5 India            Kalaripayattu         Serpent Flow
     6 Philippines      Arnis                 Phantom Blades
     7 Indonesia        Pencak Silat          Shadow Dance
     8 Brazil           Capoeira              Whirlwind
     9 France           Savate                Flash Kick
    10 Russia           Sambo                 Iron Grip
    11 Israel           Krav Maga             Counter Force
    12 Greece           Pankration            Titan's Wrath
    13 Turkey           Yağlı Güreş           Iron Fortress
    14 Mongolia         Bökh                  Earthquake
    15 Senegal          Laamb                 Lion's Charge
    16 Myanmar          Lethwei               Berserker
    17 Cambodia         Bokator               Tiger Spirit
    18 Vietnam          Vovinam               Sky Dragon
    19 Malaysia         Silat Melayu          Ghost Step
    20 Switzerland      Schwingen             Mountain Force
    21 Iceland          Glíma                 Frost Lock
    22 Mexico           Lucha Libre           Meteor Drop
    23 USA              American Kickboxing   Shockwave
    24 United Kingdom   Catch Wrestling       Breaker Lock
    25 Georgia          Chidaoba              Mountain Crusher
    26 Uzbekistan       Kurash                Ground Control
    27 Iran             Varzesh-e Bastani     Lion Heart
    28 Portugal         Jogo do Pau           Storm Staff
    29 Ethiopia         Donga                 Thunder Staff
    30 Nigeria          Dambe                 Iron Hammer

## 6.1 Master design template

Every master must have: - Name, age range, pronouns and role in the
story. - Country and region, with researched cultural references. -
Traditional-attire-inspired clothing; explain the source and avoid
generic costume shorthand. - Distinct silhouette, colour palette and
animation rhythm. - Discipline stance and movement profile. - Three to
five normal attacks, one defensive mechanic and one signature
technique. - A weakness or tactical opening. - Intro, victory, defeat
and teaching scenes. - Voice direction and a small set of
battle/dialogue lines. - A reason for guarding, teaching, refusing or
hiding the seal. - Basic, intermediate, advanced and master training
challenges.

## 6.2 Indian master visual direction

The Indian Kalaripayattu master should wear **sage-inspired saffron
clothing**. The design should feel grounded and dignified rather than
like a generic fantasy monk. Research Kalaripayattu practice clothing,
regional context and movement traditions. Avoid inventing religious
symbols or presenting fictional supernatural effects as authentic
cultural practices.

## 6.3 Weapons must be discipline-appropriate

Do not give every master a weapon just to make the roster look varied.
Many disciplines are primarily unarmed. Where historically or culturally
appropriate, weapon practices may include: - Arnis: sticks and selected
blade traditions. - Kalaripayattu: staff, sword and shield traditions. -
Pencak Silat: weapon practices vary by school and region; selected
keris/staff concepts require research. - Bokator: selected traditional
weapon practices, researched carefully. - Vovinam: selected sword/staff
curriculum. - Silat Melayu: keris and other weapon traditions, with
context. - Jogo do Pau: long staff. - Donga: fighting stick.

Varzesh-e Bastani clubs are traditional training equipment; do not
automatically turn them into battlefield weapons. Krav Maga includes
weapon-defence contexts, but that does not mean the master should be
designed as a weapon fighter.

------------------------------------------------------------------------

# 7. Combat system

## 7.1 Core controls --- current prototype baseline

The prototype's described keyboard controls are:

  Input   Action
  ------- ---------------------------------
  A / D   Move left / right
  W       Jump
  J       Punch
  K       Kick
  S       Block
  Esc     Pause
  M       Mute
  C       Change fighter, where available

Combos described in the prototype: - J, J, K - K, K - J, K

The special input is `L` (implemented for Kaen and Yoru). The final control map must avoid
conflicts with menu navigation and future style switching.

## 7.2 Combat state machine

Recommended fighter states:

-   `idle`
-   `walk`
-   `run` (optional)
-   `jumpStart`
-   `jumpRise`
-   `jumpFall`
-   `land`
-   `lightAttack`
-   `heavyAttack`
-   `comboAttack`
-   `blockStart`
-   `block`
-   `parry`
-   `hitLight`
-   `hitHeavy`
-   `knockback`
-   `knockdown`
-   `getUp`
-   `specialStartup`
-   `specialActive`
-   `specialRecovery`
-   `victory`
-   `defeat`
-   `intro`
-   `stun`
-   `airHit` (if aerial combat is enabled)

State changes must be explicit. An attack should not be cancelled by
arbitrary input unless the move's cancel rules allow it.

## 7.3 Attack frame data

Each attack should define: - Input and move ID. - Startup frames/time. -
Active frames/time. - Recovery frames/time. - Damage. - Hitstun and
blockstun. - Pushback and knockback. - Hitbox shape/offset. - Energy
gain/cost. - Allowed cancel windows. - Whether it can be blocked,
parried or interrupted. - Animation clip and sound/effect IDs.

Do not tune damage values only by feel. Record the values in central
data and test the same moves against all fighter types.

## 7.4 Hit detection

-   Use attack hitboxes separate from visual artwork.
-   Use hurtboxes for each fighter.
-   Use a projectile hitbox for ranged attacks.
-   Prevent one hitbox from applying damage every frame to the same
    target unless the move is explicitly multi-hit.
-   Track hit targets per attack instance.
-   Define facing direction and hitbox mirroring.
-   Use swept collision or sufficiently frequent checks for fast
    dashes/projectiles to avoid tunnelling.
-   Keep hitstop, knockback and screen shake as separate feedback
    systems.

## 7.5 Defence

-   Block reduces or prevents damage according to attack type.
-   Throws/grabs may beat ordinary block if the game includes them.
-   Parry requires accurate timing and gives a limited reward.
-   Guard pressure can build, but avoid making block useless.
-   Recovery after a failed parry must be punishable.
-   Bosses need readable tells; never use unavoidable damage as the main
    difficulty mechanic.

## 7.6 Energy meter

Proposed energy system: - Energy is earned through successful attacks,
well-timed defence, parries and objective-specific actions. - Energy is
not granted simply by standing still or repeatedly pressing attack. -
Each special move has an energy cost and optional cooldown. - The HUD
shows current energy, maximum energy and whether the move is
available. - A special cannot activate if energy is insufficient. -
Energy values and move costs are centralised in data. - The system
should be tuned so a player can use specials strategically, not
continuously.

## 7.7 Proposed special attacks

  --------------------------------------------------------------------------
  Character /       Special           Role                 Counterplay
  discipline                                               
  ----------------- ----------------- -------------------- -----------------
  Kaen              Fireball          Mid-range projectile Block, jump,
                                                           evade or punish
                                                           recovery

  Yoru              Shadow Dash       Fast gap closer      Read startup,
                                                           block/evade,
                                                           punish recovery

  Kai               Rising Resolve    Offensive momentum   Wait out duration
                                                           and punish
                                                           overcommitment

  Mira              Stillwater Guard  Defensive counter    Use throws/feints
                                      focus                or delay pressure

  Ren               Afterimage Step   Reposition/evasion   Track destination
                                                           and punish
                                                           recovery
  --------------------------------------------------------------------------

Specials must have startup, active and recovery phases. Avoid permanent
invulnerability, screen-wide unavoidable attacks or infinite combo
loops.

## 7.8 Combo and cancel rules

-   Light attacks should be quick and low commitment.
-   Heavy attacks should have more impact but greater recovery.
-   Combo routes should be authored, not accidental.
-   A move may cancel into another move only during a defined window.
-   Hit-confirm routes can be more generous than unsafe raw cancels.
-   Air combos should be introduced only if the camera, collision and
    juggle rules are stable.
-   Bosses can have armour or phase transitions, but these should be
    telegraphed and limited.

## 7.9 Match rules

Existing prototype features described: - 60-second timer. -
Best-of-three rounds. - CPU difficulty: Easy, Normal and Hard. - Health
bars and round/result flow. - Rematch and change-fighter options.

Keep those as the prototype baseline unless the current source code says
otherwise. ZAIKORA's adventure mode can use different rules: story
encounters may be one-round duels, training trials, survival challenges
or multi-phase boss fights.

------------------------------------------------------------------------

# 8. Martial art mastery and training

Defeating a master unlocks basic moves and the discipline's signature
power. It does not instantly grant perfect mastery.

## 8.1 Mastery tiers

1.  **Initiate** --- basic stance, movement and core attacks.
2.  **Apprentice** --- reliable basic combos and defence.
3.  **Adept** --- intermediate routes, counters and matchup knowledge.
4.  **Expert** --- advanced techniques, situational tools and improved
    execution.
5.  **Master** --- complete discipline challenges and demonstrate
    tactical understanding.

## 8.2 Training challenge types

-   Stance and movement test.
-   Timing and precision test.
-   Combo execution.
-   Guard and parry test.
-   Range and spacing challenge.
-   Discipline-specific signature challenge.
-   Fight against a specialist opponent.
-   Final mastery trial.

Training should measure actual performance (timing, correct move, damage
avoided, target hit, resource management), not only completion time.

------------------------------------------------------------------------

# 9. Fusion and weapon system

Fusion is a major progression system. It combines two mastered
disciplines into a new fictional weapon, hybrid form or power.

## 9.1 Requirements and discovery

1.  Defeat two masters and unlock both disciplines.
2.  Reach the required mastery level in both.
3.  Discover a compatible recipe through experimentation or an NPC clue.
4.  Complete the fusion challenge.
5.  Unlock the fusion.
6.  Train it through mastery ranks.

Both discovery methods are supported: - **Experimentation:** try
compatible disciplines in the Fusion Lab. - **NPC clues:** masters,
travellers, scrolls, side quests and exploration reveal hints.

## 9.2 Three fusion outcomes

-   **Weapon Fusion:** creates a fictional weapon or weapon
    configuration.
-   **Combat Style Fusion:** creates a hybrid armed/unarmed stance or
    move set.
-   **Power Fusion:** combines two supernatural effects into a new
    ability.

## 9.3 Balanced fusion rules

-   Fusion adds versatility, not raw damage inflation.
-   Original disciplines remain useful.
-   Base discipline is permanent.
-   Fusion weapons are optional, not mandatory upgrades.
-   Weapons have trade-offs in speed, range, defence, mobility and
    recovery.
-   Armed and unarmed stances have deliberate transitions.
-   Switching during combat has a short transition/recovery window.
-   Fusion attacks do not cancel every enemy attack.
-   Bosses reward intelligent switching rather than requiring one
    overpowered fusion.

## 9.4 Fusion mastery

`Unlocked → Apprentice → Adept → Expert → Master`

Mastery can improve reliability, reduce a small amount of recovery or
unlock a situational follow-up. It should not create runaway damage
scaling.

## 9.5 Example fictional recipes

These are fictional game recipes, not historical combinations:

  Disciplines                    Fusion name           Outcome
  ------------------------------ --------------------- --------------------------
  Karate + Sanda                 Dragon Thunder Form   Hybrid striking form
  Karate + Arnis                 Dragon Twin Blades    Dual-weapon form
  Kalaripayattu + Taekwondo      Sky Serpent Spear     Fictional spear form
  Pencak Silat + Arnis           Phantom Twin Blades   Dual-weapon form
  Muay Thai + Jogo do Pau        Thunderstorm Staff    Staff form
  Sambo + Catch Wrestling        Iron Lock Form        Grappling form
  Capoeira + Taekwondo           Whirlwind Sky Form    Aerial mobility form
  Bökh + Pankration              Titan Fortress Form   Defensive grappling form
  Savate + American Kickboxing   Flash Shock Form      Fast striking form
  Lethwei + Muay Thai            Berserker Form        High-risk pressure form

There are 435 unique pairs among 30 disciplines. Do not hand-author all
435 at the start. Use curated recipes and compatibility tags.

## 9.6 Compatibility tags

Suggested tags: `STRIKE`, `KICK`, `GRAPPLE`, `COUNTER`, `MOBILITY`,
`DEFENCE`, `AERIAL`, `WEAPON_STICK`, `WEAPON_BLADE`, `WEAPON_STAFF`,
`ENERGY`.

## 9.7 Fusion Lab

Sections: - Discipline Library - Fusion Discovery - Weapon Forge -
Training Arena - Fusion Journal - Legendary Fusion

Discovery states: `Unknown`, `ClueDiscovered`, `RecipeDiscovered`,
`ChallengeAvailable`, `FusionUnlocked`, `FusionMastered`.

------------------------------------------------------------------------

# 10. Weapon system

## 10.1 Weapon families

-   Single sword.
-   Dual weapons.
-   Staff.
-   Polearm/spear.
-   Sword and shield.
-   Gauntlets.
-   Other culturally grounded equipment only after research.

## 10.2 Weapon attributes

Each weapon defines: - Damage. - Range. - Startup/speed. - Recovery. -
Defence. - Mobility modifier. - Combo potential. - Stability/interrupt
resistance. - Energy interaction. - Weapon-specific moveset. - Animation
and audio set.

## 10.3 Weapon stance rules

-   A weapon changes attack reach and move options.
-   It may reduce mobility or increase recovery.
-   Disarming should only be used if the game has a clear, fair recovery
    mechanic.
-   Weapon switching must be readable to the opponent.
-   Weapon hitboxes must be separate from the visual blade/staff
    artwork.
-   Do not make every weapon a simple damage upgrade.

------------------------------------------------------------------------

# 11. Story cutscenes and scene list

Cutscenes should be short, purposeful and skippable after first viewing.
Use a mixture of character close-ups, animated poses, camera movement,
environmental shots and dialogue. Do not attempt full anime episodes
before the core game is playable.

## 11.1 Opening cinematic --- "The First Pulse"

**Length target:** 60--90 seconds.

1.  Black screen. A low pulse is heard.
2.  Close-up of thirty seals arranged in a circular pattern.
3.  A historical guardian explains that each seal represents a different
    discipline and philosophy.
4.  A shadow crosses the circle; one seal cracks.
5.  The Order of Shadows enters an old sanctuary.
6.  A master attempts to protect the seal but is overwhelmed by an
    unknown technique.
7.  Cut to the three protagonists in different locations, each reacting
    to the same distant pulse.
8.  Title reveal: **ZAIKORA --- Rise of the 30 Masters**.

Voice-over direction: restrained, mythic, clear. Avoid overexplaining
the lore in the opening.

## 11.2 Protagonist selection scene

-   Show Kai, Mira and Ren in separate short vignettes.
-   Each demonstrates a movement signature.
-   The player chooses one.
-   Their first dialogue line changes the tone of the journey.
-   Do not imply the unselected protagonists vanish from the world; they
    can appear as allies/rivals later if story scope permits.

## 11.3 Starting discipline scene

-   Show a map of the available starting routes.
-   The player chooses a country and discipline.
-   The master explains the discipline's core principle.
-   The player performs a short trial.
-   The base discipline is permanently recorded in the save file.
-   Clearly warn the player before confirming the permanent choice.

## 11.4 Master encounter cutscene template

1.  Establishing shot of the location.
2.  Master performs a recognisable stance or movement.
3.  Short dialogue exchange.
4.  Master explains why the seal is protected.
5.  Player is challenged.
6.  Transition into battle.

## 11.5 Master defeat / teaching scene

1.  Battle ends.
2.  Master acknowledges the player's skill or identifies a flaw.
3.  The master explains one principle of the discipline.
4.  The player receives the basic moves and signature power.
5.  Training challenge is introduced.
6.  The seal clue or next story lead is revealed.

A defeat should not automatically mean the master is defeated morally.
The scene can represent a test completed.

## 11.6 Refusal scene

Some masters refuse to teach: - They may distrust outsiders. - They may
be protecting students. - They may believe the player is fighting for
the wrong reason. - They may have been threatened by the Order. - They
may secretly be connected to the Order.

The player must resolve the reason through a quest, dialogue choice or
non-lethal trial. Avoid making every refusal a simple fetch quest.

## 11.7 Chapter boss introduction

-   Show the three chapter seals or symbols reacting.
-   The Order commander enters.
-   The boss reveals what they believe about strength and control.
-   The player recognises a technique or clue from earlier masters.
-   Boss fight begins.

## 11.8 Boss phase transitions

A boss phase change should: - Have a clear animation and audio cue. -
Change one or two mechanics at a time. - Introduce a counterable
pattern. - Give the player a short moment to read the new behaviour. -
Avoid simply restoring a full health bar without narrative reason.

## 11.9 Fusion discovery cutscene

-   Two disciplines' symbols appear.
-   The NPC explains the historical or philosophical clue as fictional
    game lore, not a real-world historical claim.
-   The Fusion Lab shows the recipe silhouette.
-   The player completes a challenge that tests both source disciplines.
-   The fusion unlock animation reveals the weapon/form/power.

## 11.10 Final cinematic --- "Many Paths, One Choice"

The final antagonist attempts to unite all seals under one will. The
protagonists demonstrate that the seals respond to different disciplines
working together without becoming identical.

The player wins through tactical use of learned disciplines and fusions.
The ending choice should be about the future of the seals: -
**Preserve:** return them to their guardians. - **Share:** establish a
network where knowledge can be taught responsibly. - **Release:**
dismantle the seal system so no single group can control it.

These endings are proposed and require narrative review before
production.

------------------------------------------------------------------------

# 12. Animation bible

## 12.1 Animation principles

-   Strong silhouette and readable anticipation.
-   Clear contact pose on attacks.
-   Distinct follow-through and recovery.
-   Secondary motion for hair, cloth, scarves, headbands and
    accessories.
-   Animation should communicate weight and discipline.
-   Use hitstop and effects to reinforce contact; do not rely on screen
    shake alone.
-   Keep gameplay hurtboxes fair even when the visual pose stretches.
-   Avoid excessive motion blur that hides hitboxes or attack direction.

## 12.2 Required animation states for every fighter

  -----------------------------------------------------------------------
  Category                            Animation clips
  ----------------------------------- -----------------------------------
  Core                                idle, idleVariant, walkForward,
                                      walkBackward, turn

  Movement                            jumpStart, jumpRise, jumpFall,
                                      land, dash, evade

  Combat                              light1, light2, heavy, kick,
                                      comboFinisher, specialStartup,
                                      specialActive, specialRecovery

  Defence                             blockStart, blockLoop, blockHit,
                                      parry, parrySuccess

  Damage                              hitLight, hitHeavy, knockback,
                                      knockdown, getUp, stun

  Story                               intro, taunt, victory, defeat,
                                      teachingPose

  Optional                            airHit, wallHit, weaponDraw,
                                      weaponSheathe, stanceSwitch
  -----------------------------------------------------------------------

Not every discipline needs every optional clip in the first MVP.

## 12.3 Facial expressions

Minimum expressions: - Neutral. - Focused. - Shouting/effort. - Hurt. -
Victory/confident. - Concern/sadness for story scenes.

The prototype Kaen and Yoru designs were described as having normal,
shouting and hurt expressions. More expressions are proposed polish.

## 12.4 Animation implementation

For the current procedural/vector prototype: - Keep visual drawing code
isolated from combat logic. - Use animation clips/keyframes with easing
and cross-fades. - Use secondary-motion values for hair, scarf and
headband. - Keep hitboxes and hurtboxes in combat data, not embedded in
visual drawing. - Expose a renderer interface so procedural art can
later be replaced by sprite sheets or a rigged animation runtime. - Keep
animation events (footstep, impact, weapon swing) data-driven.

For future sprite/rig assets: - Use consistent pivots and scale. -
Export transparent backgrounds. - Define frame rate and clip names
centrally. - Keep a shared skeleton only where it does not compromise
each character's silhouette. - Verify licenses for all third-party
assets.

## 12.5 Camera and impact

-   Camera follows the fight with limits.
-   Keep both fighters visible.
-   Small screen shake for heavy impact only.
-   Hitstop duration scales with move weight.
-   Avoid long hitstop on every light attack.
-   Add subtle camera emphasis for boss phase changes and cinematic
    specials.
-   Never let camera shake obscure player position.

------------------------------------------------------------------------

# 13. Voice, dialogue and sound design

## 13.1 Voice production approach

Use original voice performances or properly licensed synthetic voices.
Do not clone a real person's voice without explicit permission. Keep a
voice asset manifest with performer/license, language, character, line
ID, file path and usage rights.

Recommended language plan: - English as the initial production
language. - Add Hindi and other languages only after dialogue and
subtitle pipelines are stable. - Keep subtitle text separate from audio
files. - Avoid recording one long file per scene; use short line-level
files for reuse and localisation.

## 13.2 Voice categories

Each speaking character should have: - Intro line. - Round start. -
Light attack effort sounds. - Heavy attack effort sounds. - Special
attack call. - Hit reaction. - Low-health reaction. - Guard/parry
reaction. - Victory. - Defeat. - Taunt. - Story dialogue. - Teaching
dialogue.

Do not voice every animation frame. Reuse a controlled pool of short
effort sounds with variation and cooldowns to avoid repetitive playback.

## 13.3 Audio layers

-   Voice.
-   Music.
-   Ambience.
-   Footsteps.
-   Attack whooshes.
-   Impact sounds.
-   Guard/parry sounds.
-   Weapon sounds.
-   Special ability effects.
-   UI sounds.
-   Cutscene stingers.

## 13.4 Sound design by discipline

Sound should be inspired by the movement and material, not by
stereotypes: - Unarmed strike: varied cloth, body impact and air
movement. - Staff: controlled wood/air movement. - Blade: restrained
metallic movement and impact. - Grappling: footwork, cloth movement,
body impact and mat/ground contact. - Energy power: original tonal
effects with a consistent visual/audio identity.

## 13.5 Audio implementation rules

-   Centralise sound IDs.
-   Preload only required scene assets.
-   Use audio pools for repeated short effects.
-   Add volume controls for music, SFX and voice separately.
-   Respect browser autoplay restrictions; start audio after user
    interaction.
-   Mute must silence all relevant buses.
-   Avoid overlapping the same voice line excessively.
-   Add subtitles and a dialogue log for story scenes.

------------------------------------------------------------------------

# 14. CPU opponent AI

## 14.1 Difficulty profiles

**Easy** - Slower reaction. - More idle time. - Lower block and punish
frequency. - Occasional predictable attacks. - Still teaches the player
basic mechanics.

**Normal** - Mixes attacks and defence. - Uses spacing and basic
combos. - Punishes obvious unsafe moves sometimes. - Uses specials when
a clear opportunity appears.

**Hard** - Reads repeated habits with limits. - Uses defence, movement
and punish windows. - Can bait attacks but should not read every
input. - Has reaction delay and occasional mistakes. - Must remain fair
and learnable.

The prototype session described CPU tests with different blocking rates
on one jab-mash test. Those figures are test observations, not final
balance targets.

## 14.2 AI decision inputs

-   Distance to opponent.
-   Relative facing.
-   Current state and recovery.
-   Health and energy.
-   Opponent attack startup.
-   Recent player action frequency.
-   Arena position.
-   Difficulty profile.
-   Boss phase and move pattern.

AI must not access hidden player inputs or use impossible reaction
times.

------------------------------------------------------------------------

# 15. HUD, menus and accessibility

## 15.1 HUD

-   Player health.
-   Opponent health.
-   Timer.
-   Round indicator.
-   Energy meter.
-   Equipped discipline/style indicator.
-   Fusion/weapon state where relevant.
-   Boss phase indicator.
-   Clear special-ready feedback.

## 15.2 Menus

-   Title screen.
-   Story mode.
-   Fighter selection.
-   Starting discipline selection.
-   Chapter map.
-   Master encounter.
-   Training.
-   Fusion Lab.
-   Weapon/loadout.
-   Settings.
-   Pause.
-   Results.
-   Rematch.

## 15.3 Accessibility

-   Remappable keyboard controls.
-   Adjustable screen shake.
-   Subtitle size and background.
-   Separate music/SFX/voice volume.
-   Colour-safe health/energy indicators with icons or labels.
-   Difficulty selection.
-   Hold/toggle options for block where appropriate.
-   Clear visual distinction between unblockable, high and low attacks
    if those mechanics exist.
-   Do not rely on colour alone to communicate danger.

------------------------------------------------------------------------

# 16. Save data and progression

Suggested save structure:

``` ts
type SaveData = {
  version: number;
  protagonistId: "kai" | "mira" | "ren";
  baseDisciplineId: string;
  chapterProgress: Record<string, "locked" | "active" | "cleared">;
  defeatedMasters: string[];
  masteredDisciplines: Record<string, number>;
  discoveredClues: string[];
  discoveredFusions: string[];
  unlockedFusions: string[];
  fusionMastery: Record<string, number>;
  unlockedWeapons: string[];
  equippedLoadout: {
    slot1: string;
    slot2: string;
    slot3: string;
  };
  settings: {
    musicVolume: number;
    sfxVolume: number;
    voiceVolume: number;
    screenShake: boolean;
    subtitles: boolean;
  };
};
```

Rules: - Version the save schema. - Add migrations when fields change. -
Validate loaded IDs against registries. - Never trust corrupted save
values. - Store base discipline separately and never overwrite it
through loadout changes. - Canonicalise fusion pairs so A+B and B+A do
not create duplicate recipes. - If online competitive play is added,
validate progression and match outcomes server-side.

------------------------------------------------------------------------

# 17. Technical architecture --- Phaser 3 + TypeScript

Suggested project structure:

``` text
src/
  app/
    Game.ts
    config.ts
  scenes/
    BootScene.ts
    PreloadScene.ts
    MainMenuScene.ts
    CharacterSelectScene.ts
    DisciplineSelectScene.ts
    WorldMapScene.ts
    StoryScene.ts
    TrainingScene.ts
    FightScene.ts
    ResultsScene.ts
    FusionLabScene.ts
  characters/
    CharacterTypes.ts
    CharacterRegistry.ts
    CharacterController.ts
    CharacterStateMachine.ts
    CharacterStats.ts
  martialArts/
    MartialArtTypes.ts
    MartialArtRegistry.ts
    DisciplineManager.ts
    MasteryManager.ts
  combat/
    CombatManager.ts
    AttackData.ts
    HitboxManager.ts
    HurtboxManager.ts
    ComboManager.ts
    BlockManager.ts
    ParryManager.ts
    EnergyManager.ts
    StanceManager.ts
    CombatEvents.ts
  weapons/
    WeaponTypes.ts
    WeaponRegistry.ts
    WeaponManager.ts
    WeaponStats.ts
    WeaponHitbox.ts
    WeaponAnimationManager.ts
  fusion/
    FusionTypes.ts
    FusionRegistry.ts
    FusionManager.ts
    FusionCompatibility.ts
    FusionDiscovery.ts
    FusionChallengeManager.ts
    FusionMasteryManager.ts
    recipes/
      starterRecipes.ts
      legendaryRecipes.ts
  ai/
    FighterAI.ts
    DifficultyProfiles.ts
    BossAI.ts
  animation/
    AnimationRegistry.ts
    AnimationController.ts
    AnimationEvents.ts
    ProceduralRenderer.ts
    SpriteRenderer.ts
  audio/
    AudioManager.ts
    VoiceManager.ts
    AudioRegistry.ts
    SubtitleManager.ts
  story/
    StoryRegistry.ts
    DialogueManager.ts
    CutsceneManager.ts
    QuestManager.ts
  ui/
    HUD.ts
    MenuManager.ts
    LoadoutUI.ts
  save/
    SaveData.ts
    SaveManager.ts
    SaveMigrations.ts
  data/
    characters.ts
    martialArts.ts
    masters.ts
    bosses.ts
    attacks.ts
    weapons.ts
    fusionRecipes.ts
    dialogue.ts
    cutscenes.ts
```

## 17.1 Separation of concerns

-   Combat code must not depend on a specific character drawing
    implementation.
-   Animation asks the fighter state what to play; it does not decide
    damage.
-   Combat emits events such as `attackStarted`, `hitConfirmed`,
    `blocked`, `parried`, `specialUsed`, `fighterDefeated`.
-   Audio and VFX listen to combat events.
-   Story progression listens to encounter completion events.
-   Registries hold data; managers execute rules.
-   Scenes coordinate systems but should not contain every gameplay
    rule.

## 17.2 Performance

Target 60 FPS where hardware allows, but profile on the actual laptop
and browser. Keep the first build lightweight: - Avoid large texture
atlases until needed. - Pool repeated particles and hit effects. - Avoid
excessive per-frame object creation. - Use simple collision shapes. -
Keep the number of simultaneous particles controlled. - Load chapter
assets on demand. - Test with browser dev tools and a low-end integrated
GPU.

------------------------------------------------------------------------

# 18. Testing and acceptance criteria

## 18.1 Combat tests

-   Movement and facing.
-   Jump and landing.
-   Light/heavy attacks.
-   Combo sequence and reset.
-   Blocking and guard damage.
-   Parry timing.
-   Hitstop and knockback.
-   Knockdown/get-up.
-   Projectile collision.
-   Dash collision.
-   Special energy cost and insufficient-energy rejection.
-   No repeated hit damage from one hitbox unless intended.
-   No attacks through the wrong side of the fighter.
-   No infinite combo or permanent stun.

## 18.2 Story/progression tests

-   Starting discipline is permanently retained.
-   Master defeat unlocks the correct discipline.
-   Training challenges update mastery correctly.
-   Chapter boss remains locked until three masters are cleared.
-   Refusal quests can be completed and resumed.
-   Fusion clue and recipe states save correctly.
-   Fusion challenge unlocks only after requirements.
-   Save migration works across versions.
-   Ending choice is recorded.

## 18.3 Animation/audio tests

-   Every state has a valid animation fallback.
-   Cross-fades do not leave a fighter frozen.
-   Secondary motion resets safely after scene changes.
-   Hitboxes remain aligned with gameplay intent.
-   Voice lines do not overlap uncontrollably.
-   Mute and volume settings work.
-   Subtitles match the selected language.
-   Audio begins only after browser user interaction where required.

## 18.4 Browser regression

Run production build and browser tests after every major combat change.
Test menu → selection → fight → result → rematch → menu. Check console
errors, missing assets, performance and input focus.

------------------------------------------------------------------------

# 19. Production roadmap

## Phase 0 --- Stabilise the current prototype

-   Confirm the current code and build.
-   Preserve working Kaen/Yoru designs and animation.
-   Document existing controls and combat values.
-   Add automated regression tests.
-   Keep visual rendering isolated.

## Phase 1 --- Finish the prototype combat loop

-   Energy meter.
-   Kaen Fireball.
-   Yoru Shadow Dash.
-   Special hitboxes and counterplay.
-   Audio/VFX feedback.
-   CPU special logic.
-   Balance and regression.

## Phase 2 --- Lock ZAIKORA protagonists

-   Design Kai, Mira and Ren.
-   Define silhouettes, palettes and attire.
-   Approve turnarounds and animation poses.
-   Decide whether prototype Kaen/Yoru remain a separate mode or are
    retired from the main story.

## Phase 3 --- Build one vertical slice

-   One protagonist.
-   One master.
-   One location.
-   One story encounter.
-   One training progression path.
-   One chapter boss.
-   One fusion recipe.
-   One complete save/load loop.

## Phase 4 --- Build the reusable content pipeline

-   Master data schema.
-   Animation pipeline.
-   Voice/subtitle pipeline.
-   Cutscene templates.
-   Chapter and quest data.
-   Weapon and fusion registries.

## Phase 5 --- Expand the roster

-   Add remaining masters in researched batches.
-   Add chapter bosses.
-   Add discipline mastery.
-   Add curated fusions and weapons.
-   Add regional environments and story scenes.

## Phase 6 --- Polish and release preparation

-   Balance all matchups.
-   Accessibility.
-   Browser and mobile performance.
-   Save migration.
-   Asset licensing audit.
-   QA and playtesting.
-   Store/hosting requirements if distribution expands beyond browser.

**Scope warning:** Thirty fully animated masters, three protagonists,
ten bosses, multiple weapons, fusions, story cutscenes and voice acting
is a large production. Do not attempt all content at once. A polished
vertical slice is the correct next milestone.

------------------------------------------------------------------------

# 20. Immediate next implementation milestone

The next concrete task for the existing prototype should be:

1.  Inspect the current `src/` files and confirm actual animation/state
    names.
2.  Add a central `EnergyManager`.
3.  Add energy display to the HUD.
4.  Add `specialStartup`, `specialActive` and `specialRecovery` states.
5.  Implement Kaen's Fireball.
6.  Implement Yoru's Shadow Dash.
7.  Add projectile/dash hit detection and one-hit-per-target protection.
8.  Add blocking, hitstop, knockback and recovery behaviour.
9.  Add sound/VFX events.
10. Test Easy, Normal and Hard CPU behaviour.
11. Run `npm run build` and browser regression tests.
12. Update this document with what is genuinely implemented.

**Status (2026-11-12):** steps 1--11 are implemented in the prototype and
pass browser tests: special refused without energy (with HUD feedback),
energy gained from landed and blocked attacks, Fireball hits once / can
be blocked / can be jumped / is removed off-stage, normal-to-special
cancel on hit, Shadow Dash hits once / whiffs out of range / is
punishable on block, CPU special use and fireball defence scale with
difficulty, and the full menu → select → fight → results flow. Energy
values: maximum 100, each special costs 50 (two meter segments),
per-move gains in `src/combat/moves.ts`, blocked attacks give the
attacker 40% and the defender 4. Energy carries over between rounds.

Do not claim a feature is complete until it exists in the code and
passes a test.

------------------------------------------------------------------------

# Appendix A --- Content status checklist

  Feature                                      Current status
  -------------------------------------------- --------------------------
  Phaser 3 + TypeScript + Vite prototype       Existing prototype
  Kaen procedural art and animation            Existing prototype
  Yoru procedural art and animation            Existing prototype
  Basic movement, attacks and block            Existing prototype
  Combos, hit reactions and rounds             Existing prototype
  CPU Easy/Normal/Hard                         Existing prototype
  Main menu, fighter select and results flow   Existing prototype
  Energy meter                                 Implemented (prototype)
  Kaen Fireball                                Implemented (prototype)
  Yoru Shadow Dash                             Implemented (prototype)
  Original music (5 tracks) and sound effects  Implemented (prototype)
  Master/music/SFX volume and mute settings    Implemented (prototype)
  Kai/Mira/Ren final designs                   Not locked
  Thirty master designs                        Not completed
  Ten chapter bosses                           Not completed
  Full story cutscenes                         Design outline only
  Full voice cast                              Not recorded/implemented
  Thirty discipline mastery trees              Design outline only
  Fusion Lab and recipes                       Design outline only
  Weapon system                                Design outline only
  Complete ZAIKORA campaign                    Not implemented

# Appendix B --- Production rule

This document is the design baseline, not proof of implementation. When
code and document disagree, inspect the running project and tests.
Update the document to match verified behaviour, or explicitly mark the
design as changed. Never silently present a proposal as a completed
feature.
