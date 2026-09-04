# Kellerbier — Game Design

## 1. Pillars

Four things this game must be. Every feature is judged against them; anything that serves
none of them is cut.

1. **It feels good to move and shoot.** Before content, before items, before floors. Isaac's
   real achievement is that firing a tear and watching an enemy flinch is satisfying on the
   thousandth repetition. Knockback, hitstop, screenshake, particles, audio punch — this is
   milestone M1 and it gates everything after it.
2. **Combinations, not lists.** Items are modifiers with hooks; projectiles carry composable
   tags. The interesting outcomes are ones we did not hand-author and cannot fully predict.
   A build should occasionally make the player laugh out loud.
3. **Risk you choose.** Promille, devil pacts, cursed floors, spending health for power.
   The player should be able to talk themselves into a bad decision.
4. **Tongue firmly in cheek.** Bavarian folklore played straight enough to be charming and
   crooked enough to be funny. Never a tourist brochure, never mean-spirited.

## 2. Premise and story

In 1516 the *Reinheitsgebot* fixed what beer may contain: water, barley, hops. Somebody has
issued a new one.

**Alois** is at his grandparents' in Oberniederburg for Sunday lunch, the way he is every
Sunday. Schweinsbraten, Knödl, Bier — was braucht's mehr. Opa's glass is getting low, so Alois
takes the empty bottle down to the cellar to fetch another **Pfeitinger**, the good stuff,
the one everybody drinks. It was the last bottle in the crate. The full crate standing next to
it is Pfeitinger too, and the label is *wrong*. He turns the bottle round. On the back:

> *Gebraut nach dem neuen bayerischen Reinheitsgebot.*

A new one? Nobody told him about a new one. He reads the ingredients, and the ingredients say
water, malt, hops — and **raisins**.

Raisins. Here as well. In Opa's beer.

> *Alles was zu gut schmeckt muss mit dem Zeug versaut werden. Erst Omas Apfelkuchen, jetzt
> auch noch Opas Bier.*

Something is rustling behind the crates, and whatever it is, it is coming towards him. Fine.

> *Trinkt diesen Mist doch selber.*

He takes Opa's **Trink-Rucksack** down off its hook, fills it with everything left of the
tainted crate, switches it from *trinken* to *schießen*, and heads south to find out who is
responsible.

**The Trink-Rucksack's mode selector is the joke, and it is a prologue joke.** No drinking
backpack has a `schießen` setting; that is precisely why the moment is worth showing, and why
Alois flipping it without comment is the last beat of the intro card. Once it is switched, it
stays switched: the Trink-Rucksack is a killing machine for the rest of the run, whatever ends
up in it. Nothing in play ever toggles it back to *trinken*.

**What Alois shoots is the tainted batch. What he drinks is the good stuff, and the two never
mix.** His shot, for the whole run, is what he loaded the rucksack with in the cellar — the
corrupted Pfeitinger, fired right back at whoever is responsible. Every beer *pickup* in the
run, by contrast, is the old batch — proper Pfeitinger, brewed the way it always was — so
drinking still works the way drinking works: Promille (§5) is ordinary drunkenness, real buffs
and real debuffs from a beer Alois chooses to drink, not a symptom of the plot. **The
adulterated beer is never something the player drinks, and never a pickup on the floor.** Beyond
Alois's own shot, it is what is in everyone else, and it reaches the player only as an enemy, a
hazard or a labelled crate on the floor — the same rule `CONTENT_BIBLE.md` already applies to the
Böller. The one exception is deliberate and is the whole temptation of the item pool: *tainted
food and trinkets* can be picked up, and they are good, and they cost you something. See §8.

Story is delivered lightly: a short illustrated card between chapters, boss intro plates, and item
flavour text. No cutscenes longer than a few seconds; nothing that blocks a replay.

**Arc:** the grandparents' cellar → their village → forest → mountains → castle → industrial
brewery → Wiesn. The corruption gets less folkloric and more *industrial* as you climb, which is
the joke: the monster at the end is not a demon, it is a bottling plant with a marketing
department. The arc now opens inside one family's Sunday rather than on a general state of
affairs, which costs nothing and buys a first floor the player has a personal reason to be
standing in.

**Pfeitinger is the same brand, reformulated.** The crate next to Opa's is not a counterfeit and
not a rival; it is Pfeitinger, bought out and re-recipe'd, with a new label nobody at the table
noticed arriving. That keeps the betrayal domestic — Opa has been drinking it for weeks and
saying nothing is wrong — and it means the brand name stays useful the whole run: every crate,
lorry, awning and delivery note Alois passes is the same word he grew up with.

**The reveal.** It lands late, on floor 6, in the brewery, once the arc has already stopped
being folkloric: **the raisins are not raisins.** The game never says what they are instead.
A chemical explanation is a worse joke than no explanation, and inventing one converts a funny
premise into homework. What the floor shows is only the consequence — people who drink the new
Pfeitinger cannot leave it alone. That is why the crates keep going out, why the village square
is stacked with them, and why the Wiesn takes more people every year than the year before.
Somebody put them in on purpose, and somebody has made a great deal of money.

The final boss, **Die Bavaria**, is the bronze statue over the Theresienwiese: the one thing on
that field that grows with the crowd. Six million becomes seven becomes eight, and she is what
all of it adds up to.

**Raisins polarise, and the game commits both ways.** Half of Bavaria picks them out of the
Apfelkuchen and the other half thinks that is madness — and the new Pfeitinger inherits the
argument intact. Not everyone Alois meets is a victim. Some of them will tell him, cheerfully
and at length, that the new one is actually quite good, and some of them are not fighting him
because they are corrupted but because he is being rude about their beer. This is the cheapest
content in the design — a handful of NPC barks and an enemy or two — and it does more work than
anything else on this page: it is the funniest available reading of the premise and the bleakest
one, simultaneously, which is exactly the register the next paragraph is aiming for.

**The second layer, and how far to push it.** Isaac's trick is the model: the surface is fun
and gross and lets you laugh at the costume, and the thing underneath is only there for
whoever keeps looking. The raisin *is* the costume — a daft, harmless, faintly annoying thing
that half the room loves and half the room picks out of the cake — and the joke lands long
before anyone notices what it is standing in for: something people cannot stop drinking, and a
festival that gets bigger every year on exactly that. Underneath it sits the real thing, which
was always sitting there anyway — a festival marketed as family-friendly Kultur that is,
structurally, six million people getting very drunk together, and a culture with enough
affection for beer that the line between tradition and a drinking problem gets genuinely hard to
see. Die Bavaria growing with her own crowd already carries that if it is played straight at the
right beat; the job is not to add a moral, it is to not flinch away from the one the premise
already has. Putting it on the raisins rather than on the beer directly is what makes it
sayable — it is a lighter vehicle for the identical point, and it keeps every line of dialogue
free of the subject. Concretely: a boss intro plate, an item description, an environmental
detail can sit right up against the real thing (see `CONTENT_BIBLE.md`'s Floor 7 entry for one)
without a single line ever saying it out loud. The moment anything *says* "drinking is bad,"
we've lost the joke and the point both — see `CONTENT_BIBLE.md` §0's tone rule on this exact
line.

## 3. Characters

Alois is available from the start; the rest unlock through play. Each is a different *verb*,
not a stat spread.

| Character | Unlock | Shot | Identity |
|---|---|---|---|
| **Alois** | start | tainted Pfeitinger, straight stream | The baseline. Balanced, forgiving, 3 Maß of health. Opa's Trink-Rucksack, loaded with the corrupted batch and locked to *schießen*. |
| **Resi** | beat floor 3 | Brezn, arcing and returning | Fast, fragile, shots curve — rewards positioning over aim. |
| **Der Wolpertinger** | secret | randomised each room | Chaos character. Stats reroll on floor entry. Unfair in both directions. |
| **König Ludwig II** | beat him | swans, homing | Flies over obstacles, drains coins constantly, absurd damage. Late unlock. |
| **D'Sennerin** | challenge | thrown Kuhglocken, ricochet | Alpine. Shots bounce off walls; small rooms become a threat to herself. |

## 4. Run structure

Isaac's skeleton, kept deliberately familiar:

- **Twin-stick controls, eight-way.** WASD/left stick to move, arrow keys/right stick to shoot
  — the right stick snaps to the same eight directions the keys produce, rather than free-aiming
  at a point. No mouse aim (`docs/DECISIONS.md` #20). Shooting and moving are fully independent.
  Full gamepad and full rebinding.
- **Floors** are a grid of rooms. The graph (which slots, which are special, where the doors
  are) is procedural; an ordinary room's *interior* — any shape — is generated too
  (`docs/DECISIONS.md` #59). Hand-authored templates fill the start room and the special rooms;
  any other authored room is "sprinkled" into ordinary slots at a tunable rate.
- **Doors lock** on entering a room with live enemies and open on clear. Cleared rooms stay
  cleared.
- **Special rooms** per floor: Treasure (one item on a pedestal), Shop, Boss, Secret,
  Super-secret, and one of Devil/Angel after a boss.
- **Between floors** a short transition and, at chapter breaks, a story card.
- A run is 7 floors and should take a competent player **35–50 minutes**.

### Floor generation rules

- Start room is always empty, hand-authored, and has the floor's exits.
- Boss room is placed at maximum walking distance from start.
- Treasure and Shop are dead-ends where possible.
- An ordinary room of any shape (`1x1` through `T`) is **procedurally generated**
  (`sim/room/generate-room.ts`): obstacle cover aimed at a tuned band, a per-floor enemy roster
  spent against a distance-scaled threat budget, scenery and the odd hazard patch — all seeded
  off the run seed so it stays reproducible. The room centre is not special-cased; the player
  only ever enters through a door and every door is proven reachable from every other. A
  multi-cell room is generated as one continuous space and the seams between its glued
  sub-rooms carry no wall.
- Hand-authored templates are data (`.json`), tagged by floor, shape, door configuration and
  difficulty tier. They fill the start room and the special rooms; every *other* authored room
  (no `specialRole`) is a "sprinkle" — the generator rolls `roomGen.authoredRoomChance` per
  ordinary slot and drops one in instead of generating, weighted by `metadata.weight`. That is
  the whole of "author a room and it shows up on a floor".
- Every generated floor is validated: fully connected, boss reachable, no authored template
  placed in a slot whose doors it does not match. Generation failures retry, then hard-fail in
  tests.

### Room shape and the camera

A room's shape (`1x1`/`1x2`/`2x2`/`L`/`T`) is a real physical play-space size, not just a
floor-grid packing and minimap concept. A `1x2`/`2x2`/`L`/`T` room is several single-screen
sub-rooms glued together with no wall or door between them — genuinely one bigger continuous
space, not a bigger minimap footprint that still plays like a `1x1` once you walk in — and a
camera follows the player around inside it.

- **Glued, not one big authored grid.** A multi-cell template is `MULTI_CELL_COUNT[shape]`
  ordinary single-screen sub-layouts (`content/rooms/definition.ts`'s `RoomSubLayout` —
  exactly what a `1x1` template already authors, minus doors) rather than one large hand-drawn
  grid. At load time (`sim/room/template.ts`'s `compileRoomTemplate`) they're placed into the
  room's *actual* floor-grid layout for that run — whichever cells the generator really grew
  into — so a sub-layout carries no orientation or position of its own and is free to land in
  any corner.
- **Doors are derived, never authored, and there can be up to eight.** A `1x1` template still
  authors its own `doors` (unchanged from before #100). A multi-cell room instead gets one
  door per `(cell, wall)` pair that genuinely borders a different room on the floor grid
  (`sim/room/floor-plan.ts`'s `RoomDoor`) — a `2x2` room can have two doors on a side (one per
  sub-cell touching it), eight in total, each leading to whichever real neighbour is actually
  there. Nothing is authored or guessed; the floor plan is the only source of truth.
- **A shape's dropped cells are permanent solid wall** in the compiled room — `L`'s one
  (`2x2` minus a corner, #20's footprint) or `T`'s four (a 3x3 box minus its corners, #107;
  `sim/room/geometry.ts`'s `RoomGeometry.voidRects` — a list, generalized past `L`'s original
  singular `voidRect` when `T` landed) — regardless of whether another room later ends up
  occupying that same floor-grid cell — a true door into an *interior* edge would need room
  geometry shaped as a real polygon, which this engine's rectangle-plus-blocks `RoomGeometry`
  doesn't support. That neighbour, on the rare floor where this comes up, is still reachable
  through its other doors (floor generation guarantees full connectivity); it just isn't
  reachable directly from this one edge. Drawn in the wall's own colour, not as an obstacle —
  they read as part of the room's boundary, not as pillars the size of a sub-room.
- **The camera** keeps the player centred on screen, clamped so the room's own edges are never
  pulled into view with nothing behind them — a plain per-axis bounding-box clamp. A `1x1`
  room is exactly one screen, so the clamp collapses to "never moves" there — the original,
  pre-camera feel is what a `1x1` room still plays like. It composes additively with
  screenshake and Promille's camera sway (`render/vignette.ts` §5) rather than replacing them —
  it only moves the baseline those jitter around, so a hit shake or a sway drift reads exactly
  the same inside a big room as a `1x1` one. It does not additionally clamp around a shape's
  dropped cells: a screen is wider and taller than half of a `2x2`/`L`/`T` room, so the
  viewport can never fully avoid them anyway, and an earlier attempt at forcing it to tried to
  pick which axis to push clear and flipped between them on tiny player movements — the camera
  would suddenly snap to the middle of the next glued sub-room. Since the dropped cells are
  drawn as ordinary wall, showing a slice of one reads exactly like standing near any other
  wall.

## 5. The Promille system

**This is the mechanic that makes Kellerbier its own game rather than a reskin.** It is also
the riskiest one, so it gets prototyped inside the first playable slice and cut without
sentiment if it does not feel good.

A second meter beside health, measured in **Promille** (0.0 – 5.0) — and one a new player
does not meet on their first run. See *When it turns on*, below.

**Going up:** drinking Maß pickups, certain items, boss rewards, some devil pacts.
**Coming down:** time (slow, continuous decay), eating Wurst, water fountains, being hit.

### Tiers

| Tier | Promille | Effect |
|---|---|---|
| **Nüchtern** (sober) | 0.0 – 0.4 | Baseline. A few items *require* this — precision builds live here. |
| **Angeheitert** (tipsy) | 0.5 – 1.4 | +15% damage, +10% fire rate. Very slight camera sway. The sweet spot. |
| **Beduselt** (drunk) | 1.5 – 2.9 | +35% damage, +25% fire rate. Movement has drift and momentum; aim wobbles. |
| **Vollrausch** | 3.0 – 4.4 | +70% damage, +50% fire rate. Heavy drift, screen sway, aim wander. Rausch-tier item effects activate. |
| **Umgfalln** | 4.5+ | You fall over. Brief invulnerable knockdown, then you wake at 1.5 with a **Kater**. |

**Kater (hangover)** is the punish: a timed debuff that drops damage and speed until you eat
something. It is survivable and it is your own fault, which is the correct emotional note.

### When it turns on

Promille is **unlocked, not on from the start**. The first runs are sober: no meter, no HUD
element, no drift, no wobble, no sway, no tier bonuses, and the Maß pickup does not drop at
all. Wurst is health and is unaffected; it keeps its heal and simply has nothing to lower — and
says so, since a toast reading "lowers Promille" is the mechanic's name in the most-read text in
the game. Items are filtered out of the pools wherever the meter is what they are *for*: the
`sober` and `rausch` sets, since a requirement that can never be evaluated is not a build
decision, and equally the ones that spend, refund, cap or tolerate it at no particular tier —
Konterbier clears a hangover that cannot happen.

The unlock is granted the first time the player beats **Der Stier**, and it is announced on the
results screen the run ends into: the Maß is on the table from the next run on.

The reason is pacing. The opening should read as a familiar twin-stick roguelite — shoot,
dodge, pick things up — so that the game teaches one mechanic at a time rather than all of them
at once. It also makes the unlock worth having: a player who has already played the sober game
understands exactly what the beer is changing, which is not true of a mechanic that was
switched on before they knew what the baseline was.

The failure mode to watch for is a sober run that feels like the real game with a feature
missing. It has to be complete on its own terms, which is mostly a drop-table question.

### Why this works

- It is a *second* resource axis competing with health, so build decisions get harder.
- It splits the item pool into sober / drunk / agnostic, which multiplies synergy space at
  almost no authoring cost.
- The control degradation is a real skill tax, so the damage bonus is earned rather than free.
- It is funny.

### Non-negotiable guardrails

- Drift and sway must never make the game feel *broken* — the player must always believe a
  death was theirs. Tune conservatively; the visual exaggeration should outrun the mechanical
  penalty.
- Camera sway needs an accessibility toggle that reduces it to near-zero without touching the
  stat bonuses (motion sickness is a real accessibility issue, not an optional nicety).
- An option to relabel the meter as a generic "Rausch/Power" with non-alcoholic art, for
  streamers and storefronts that need it.

## 6. Stats

Six standard stats plus Promille. Bavarian names throughout, with plain-language tooltips.

| Stat | Name | Notes |
|---|---|---|
| Damage | **Stammwürze** | Original gravity. Multiplicative and additive modifiers, resolved in a defined order. |
| Fire rate | **Schluckfrequenz** | Stored as a delay in ticks, not a rate, to avoid the classic divide-by-zero blowups. |
| Range | **Reichweite** | Projectile lifetime. |
| Shot speed | **Wurfkraft** | Projectile launch velocity. |
| Move speed | **Gschwindigkeit** | |
| Luck | **Dusel** | Gates random proc chances. |

The **stat pipeline** is a pure function: `base → flat adds → multipliers → caps → final`.
It is deterministic, unit-tested, and every modifier records its source so the debug overlay
can explain exactly why the player's damage is 47.3.

## 7. Economy and pickups

| Thing | Bavarian | Notes |
|---|---|---|
| Red heart | **Bratwurst** | Full / half. Heals and lowers Promille. |
| Soul heart | **Weißwurst** | Spent before red. Heals and lowers Promille. |
| Eternal heart | **Blutwurst** | Heals and lowers Promille. |
| Promille | **Maß** | Full mug / half mug. The only Promille pickup; no longer heals. |
| Coin | **Biermarke** | Festival beer token. |
| Bomb | **Bierfassl** | A small keg, set down or rolled: the hoops give way and it bursts. A firecracker is a nuisance, not a thing you are pleased to find — Böller belong to the enemies who throw them. |
| Key | **Kellerschlüssel** | |

Health is Wurst, not beer: every tier of every pool — full and half — both heals its own pool
and lowers Promille by a moderate, size-based amount (full vs. half, not pool-based, so a rare
Blutwurst is not a stealth-stronger sobering tool than a common Bratwurst). A pool refuses its
Wurst outright when it is already at its cap, the same all-or-nothing shape as any other refused
pickup.

Every beer pickup in that table is **the old batch** (§2) — Pfeitinger as it was brewed before
the new label. None of it is adulterated, none of it advances the plot, and none of it is where
the raisins get into the player. That is a deliberate separation: Promille is a mechanic the
player is choosing to play with, and the moment a beer pickup is also a story event, every drink
in the game starts arguing with the tone rules in `CONTENT_BIBLE.md` §0.

## 8. Items and synergy

Detailed item seeds live in [CONTENT_BIBLE.md](CONTENT_BIBLE.md). The *system*:

- An item is **data plus hooks**: `modifyStats`, `onShoot`, `onProjectileSpawn`, `onHit`,
  `onKill`, `onDamageTaken`, `onRoomClear`, `onFloorStart`, `onTick`.
- Projectiles carry a **tag set** — `homing`, `piercing`, `bouncing`, `splitting`, `poison`,
  `burning`, `freezing`, `sticky`, `arcing`, plus scalar tags for size and count.
- **Synergies emerge from tag composition**, not from an authored N×N table. Homing + bouncing
  + splitting composes automatically. Only genuinely special pairs get hand-written overrides.
- Every item declares a **Promille requirement**: `any`, `sober`, or `rausch`.
- Two **corruption tags** mark items the purists object to, and they are separate on purpose.
  `impure` is the old objection — beer cut with a soft drink (Radler, Spezi, Russ'n,
  Colaweizen), which is a matter of taste and has been for a century. `rosinen` is the new one:
  items carrying the adulteration the run is about. An item is tainted iff a raisin got into it,
  which is a fact about the item, not a judgement about it — several `rosinen` items are among
  the strongest in the game, and that is the point of them.
- A `rosinen` item follows one shape: **it is a clean item plus an upgrade plus one legible
  cost.** Tempting on the pedestal, regretted specifically rather than generally. It never
  inflicts a hidden or delayed penalty and it never lies in its description, because the
  interesting decision is the one made with full information.
- Items live in **pools** (treasure, shop, boss, devil, angel, secret, curse) and are removed
  from the pool once taken in a run.

The hard rule: **an item must be recognisable in one sentence and change how you play.** No
"+1 damage" filler. If a player cannot describe what an item did, it is a bad item.

## 9. Devil and angel rooms

- **Teufelspakt** — after a boss, a door may open onto the **Teufelstritt**, the devil's
  footprint in Munich's Frauenkirche. Real Munich legend, free lore. Pay health for power.
- **Klostersegen** — the monastery alternative. Free items, weaker on average, and taking
  pacts locks you out of it.

## 10. Curses (floor modifiers)

Occasional, announced on floor entry, mostly negative and always thematic.

- **Nebel** — no minimap.
- **Kater** — start the floor hungover.
- **Sperrstunde** (last call) — a floor timer; when it runs out, the Ordner come for you.
- **Föhn** — the alpine headache wind blows across every room, pushing all projectiles.
- **Blaue Stunde** — heavy darkness, limited vision radius.

## 11. Meta-progression

- Between runs: a plain, stylized results screen — the last run's stats, what has been unlocked
  and what is still locked (with its goal), and the run board once it is earned. Every boss you
  defeat unlocks something — a character, an item into the pool, a challenge. No hub, no NPCs: a
  real main menu (character select, seed entry, the daily run, replays) is its own, separate
  piece of work, not built yet.
- **Wiesn-Orden** — achievements as festival medals.
- **Seeded runs** — every run has a shareable seed; identical seed means identical run.
- **Daily run** — one seed per day, one attempt, a leaderboard if we ever host one.
- **Challenge runs** — fixed characters, fixed items, fixed handicaps.

Persistent save is a single versioned JSON blob in `localStorage`, with a migration path from
day one so early testers do not lose progress.

## 12. Accessibility

Not a polish-phase afterthought; several of these are structural and must land early.

- Camera sway / screenshake intensity sliders, including "off".
- Colourblind-safe projectile palette: enemy shots and player shots must be distinguishable
  by shape *and* brightness, not only hue.
- Full input rebinding, gamepad and keyboard. Touch (`docs/DECISIONS.md` #46) has a fixed layout
  and is not yet rebindable.
- Optional aim assist and a "no drift" mode that keeps Promille's stat effects but removes the
  movement penalty.
- Text scaling; no critical information conveyed by colour alone.

## 13. Out of scope for v1

Stated explicitly so it stops being relitigated: no multiplayer, no procedural item generation,
no 3D, no online leaderboards at launch, no mod API (though the data-driven content format should
not *prevent* one later).

Touch is now a supported input device (`docs/DECISIONS.md` #46) — a dual-stick on-screen overlay
that plays like the gamepad, shown automatically on a touch-capable browser. That is narrower than
"a mobile build": no native app, no phone-specific layout, no orientation handling. A portrait
phone narrower than the 640px internal resolution still doesn't fit at whole-number scale
(`render/resolution.ts`); landscape does, on most phones, but nothing enforces it.
