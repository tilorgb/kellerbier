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

In 1516 the *Reinheitsgebot* fixed what beer may contain: water, barley, hops. Someone has
broken it. Beer across Bavaria is being cut with cola, lemonade and syrup, and where the
adulterated stuff is drunk the land goes wrong — animals turn strange, folklore creatures
wake up, and the old spirits get *annoyed*.

**Sepp** finds the family cellar full of something that is no longer beer. He taps a keg,
straps it on, and goes to find the source.

Story is delivered lightly: a short illustrated card between chapters, boss intro plates,
item flavour text, and NPC one-liners at the Stammtisch hub. No cutscenes longer than a few
seconds; nothing that blocks a replay.

**Arc:** rural cellar → village → forest → mountains → castle → industrial brewery → Wiesn.
The corruption gets less folkloric and more *industrial* as you climb, which is the joke:
the monster at the end is not a demon, it is a bottling plant with a marketing department.

**The reveal (draft):** the adulteration is not sabotage, it is *scale*. Someone had to make
enough beer for six million Wiesn visitors, and the shortcut ate the soul of the thing. The
final boss, **Die Bavaria**, is the bronze statue over the Theresienwiese animated by all of
it — the personification of Bavaria herself, poisoned by her own festival.

**The second layer, and how far to push it.** Isaac's trick is the model: the surface is fun
and gross and lets you laugh at the costume, and the thing underneath is only there for
whoever keeps looking. Ours is sitting in plain sight already — a festival marketed as
family-friendly Kultur that is, structurally, six million people getting very drunk together,
and a culture with enough affection for beer that the line between tradition and a drinking
problem gets genuinely hard to see. Die Bavaria being poisoned by her own festival already
carries that if it's played straight at the right beat; the job is not to add a moral, it's to
not flinch away from the one the premise already has. Concretely: a boss intro plate, an item
description, an environmental detail can sit right up against the real thing (see
`CONTENT_BIBLE.md`'s Floor 7 entry for one) without a single line of dialogue ever saying it
out loud. The moment anything *says* "drinking is bad," we've lost the joke and the point
both — see `CONTENT_BIBLE.md` §0's tone rule on this exact line.

## 3. Characters

Sepp is available from the start; the rest unlock through play. Each is a different *verb*,
not a stat spread.

| Character | Unlock | Shot | Identity |
|---|---|---|---|
| **Sepp** | start | Helles, straight stream | The baseline. Balanced, forgiving, 3 Maß of health. |
| **Resi** | beat floor 3 | Brezn, arcing and returning | Fast, fragile, shots curve — rewards positioning over aim. |
| **Bruder Barnabas** | beat floor 5 | Doppelbock, slow and heavy | Monastery brewer. Cannot pick up food; grows stronger the longer he fasts. |
| **Der Wolpertinger** | secret | randomised each room | Chaos character. Stats reroll on floor entry. Unfair in both directions. |
| **König Ludwig II** | beat him | swans, homing | Flies over obstacles, drains coins constantly, absurd damage. Late unlock. |
| **D'Sennerin** | challenge | thrown Kuhglocken, ricochet | Alpine. Shots bounce off walls; small rooms become a threat to herself. |

## 4. Run structure

Isaac's skeleton, kept deliberately familiar:

- **Twin-stick controls.** WASD/left stick to move, arrow keys/mouse/right stick to shoot.
  Shooting and moving are fully independent. Full gamepad and full rebinding.
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
