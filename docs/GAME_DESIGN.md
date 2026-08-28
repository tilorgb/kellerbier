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

Something is rustling behind the crates, and whatever it is, it is coming towards him. He takes
Opa's **Trink-Rucksack** down off its hook, fills it with everything left of the old batch,
switches it from *trinken* to *schießen*, and heads south to find out who is responsible.

**The Trink-Rucksack's mode selector is the joke, and it is a prologue joke.** No drinking
backpack has a `schießen` setting; that is precisely why the moment is worth showing, and why
Alois flipping it without comment is the last beat of the intro card. It is not an in-run
mechanic. Nothing in play ever toggles between drinking and shooting.

**What you drink is the good stuff.** The keg on Alois's back is the old batch — proper
Pfeitinger, brewed the way it always was — and so is every beer pickup in the game. That is why
drinking still works the way drinking works: Promille (§5) is ordinary drunkenness, not
corruption, and nothing about it is a symptom of the plot. **The adulterated beer is never
something the player picks up.** It is what is in everyone else, and it reaches the player only
as an enemy, a hazard or a labelled crate on the floor — the same rule
`CONTENT_BIBLE.md` already applies to the Böller. The one exception is deliberate and is the
whole temptation of the item pool: *tainted food and trinkets* can be picked up, and they are
good, and they cost you something. See §8.

Story is delivered lightly: a short illustrated card between chapters, boss intro plates, item
flavour text, and NPC one-liners at the Stammtisch hub. No cutscenes longer than a few
seconds; nothing that blocks a replay.

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
| **Alois** | start | Pfeitinger, straight stream | The baseline. Balanced, forgiving, 3 Maß of health. Opa's Trink-Rucksack, still set to *schießen*. |
| **Resi** | beat floor 3 | Brezn, arcing and returning | Fast, fragile, shots curve — rewards positioning over aim. |
| **Bruder Barnabas** | beat floor 5 | Doppelbock, slow and heavy | Monastery brewer. Cannot pick up food; grows stronger the longer he fasts. |
| **Der Wolpertinger** | secret | randomised each room | Chaos character. Stats reroll on floor entry. Unfair in both directions. |
| **König Ludwig II** | beat him | swans, homing | Flies over obstacles, drains coins constantly, absurd damage. Late unlock. |
| **D'Sennerin** | challenge | thrown Kuhglocken, ricochet | Alpine. Shots bounce off walls; small rooms become a threat to herself. |

## 4. Run structure

Isaac's skeleton, kept deliberately familiar:

- **Twin-stick controls, eight-way.** WASD/left stick to move, arrow keys/right stick to shoot
  — the right stick snaps to the same eight directions the keys produce, rather than free-aiming
  at a point. No mouse aim (`docs/DECISIONS.md` #20). Shooting and moving are fully independent.
  Full gamepad and full rebinding.
- **Floors** are a grid of rooms, procedurally arranged from hand-authored room templates.
- **Doors lock** on entering a room with live enemies and open on clear. Cleared rooms stay
  cleared.
- **Special rooms** per floor: Treasure (one item on a pedestal), Shop, Boss, Secret,
  Super-secret, and one of Devil/Angel after a boss.
- **Between floors** a short transition and, at chapter breaks, a story card.
- A run is 7 floors and should take a competent player **35–50 minutes**.

### Floor generation rules

- Start room is always empty and has the floor's exits.
- Boss room is placed at maximum walking distance from start.
- Treasure and Shop are dead-ends where possible.
- Room templates are data (`.json`), tagged by floor, shape, door configuration and
  difficulty tier; the generator picks templates that fit the slot it has carved out.
- Every generated floor is validated: fully connected, boss reachable, no template placed in
  a slot whose doors it does not match. Generation failures retry, then hard-fail in tests.

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

**Going up:** drinking beer pickups, certain items, boss rewards, some devil pacts.
**Coming down:** time (slow, continuous decay), eating (Brezn, Obazda, Radi), water fountains,
being hit.

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
element, no drift, no wobble, no sway, no tier bonuses, and the beer pickup does not drop at
all. Maß, Weißbier and Schwarzbier are health and are unaffected; the food items keep their
heal and simply have nothing to lower. The `sober` and `rausch` items are filtered out of the
pools, since a requirement that can never be evaluated is not a build decision.

The unlock is granted the first time the player beats **Der Stier**, and it is announced at the
Stammtisch: a new regular arrives, says what he brought, and the beer is on the table from the
next run on.

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
| Red heart | **Maß** | Full mug / half mug. |
| Soul heart | **Weißbier** | Blue-white, spent before red. |
| Eternal heart | **Schwarzbier** | |
| Coin | **Biermarke** | Festival beer token. |
| Bomb | **Bierfassl** | A small keg, set down or rolled: the hoops give way and it bursts. A firecracker is a nuisance, not a thing you are pleased to find — Böller belong to the enemies who throw them. |
| Key | **Kellerschlüssel** | |
| Food (lowers Promille) | **Brezn**, **Obazda**, **Radi** | Also small heals. |

Every beer pickup in that table is **the old batch** (§2) — Pfeitinger as it was brewed before
the new label. None of it is adulterated, none of it advances the plot, and none of it is where
the raisins get into the player. That is a deliberate separation: Promille is a mechanic the
player is choosing to play with, and the moment a beer pickup is also a story event, every drink
in the game starts arguing with the tone rules in `CONTENT_BIBLE.md` §0.

**Weißwurst** deserves its own line. Bavarian rule: *die Weißwurst darf das Mittagsläuten
nicht hören* — the white sausage must not hear the noon bells. So the pickup heals generously
on floors 1–3 and, from floor 4, is spoiled: it damages you and inflicts a short debuff. The
sprite does not change. Players learn this exactly once.

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

- A hub: the **Stammtisch**, the regulars' table in the village tavern. Every boss you defeat
  adds a regular, and each regular unlocks something — a character, an item into the pool, a
  challenge.
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
- Full input rebinding, gamepad and keyboard.
- Optional aim assist and a "no drift" mode that keeps Promille's stat effects but removes the
  movement penalty.
- Text scaling; no critical information conveyed by colour alone.

## 13. Out of scope for v1

Stated explicitly so it stops being relitigated: no multiplayer, no mobile build, no
procedural item generation, no 3D, no online leaderboards at launch, no mod API (though the
data-driven content format should not *prevent* one later).
