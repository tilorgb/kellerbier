# Kellerbier — Content Bible

Floors, enemies, bosses, items, and the rules that keep the tone and the legal position sane.

---

## 0. Naming, tone and legal rules

Read this before authoring any content.

**Trademarks — hard rules.**
- No real brewery names, logos, marks or bottle shapes. Not Hofbräu, not Augustiner, not
  Paulaner, not Franziskaner, not anyone. Invented parody brands only: **Pfeitinger**,
  **Kellerbräu**, **Löwenbrunn**, **Sankt Anzelm**, **Alpenkrone**.
- **Pfeitinger** is the brand the whole story turns on and appears on crates, lorries, awnings
  and delivery notes on every floor, so it is the invented name with the most surface area in
  the game. It goes through #55 with every other name that ships; there is no known collision.
  **Oberniederburg**, the grandparents' village, is invented on the same terms — and funny
  because *Ober-* and *Nieder-* cancel out.
- "Oktoberfest" is a protected mark. The floor is called **Die Wiesn** everywhere, in every
  language, in store copy and in code identifiers.
- Landmarks (Neuschwanstein, the Bavaria statue, Walhalla, the Frauenkirche) are buildings and
  are fine to depict — but they are drawn in our own style, never traced from photography.
- Bavarian state symbols: the white-and-blue lozenge pattern is fine as a folk motif; the
  official state coat of arms is not. Use the lozenges, invent our own eagle.

**Tone rules.**
- Affectionate, never sneering. Every stereotype is played by someone who clearly likes the
  place. The joke is warmth turned up too high, not contempt.
- Ludwig II is a beloved folk figure. Play him as tragic, extravagant and a bit mad — not as
  a punchline about his private life.
- Religion appears as monastery brewing and folk devils, both of which are Bavarian folk
  culture. No sacraments, no real liturgy, nothing that reads as mockery of belief.
- The Wild Hunt, Perchten and Krampus are winter-folklore figures. They can be genuinely
  frightening; that is period-accurate.
- **Raisins are the running joke and they are played completely straight.** Nobody in the game
  is wrong about raisins. The half of Bavaria that picks them out of the Apfelkuchen and the
  half that cannot see the problem both get their say, and NPCs who genuinely prefer the new
  Pfeitinger are not written as fools or as victims — they just like it, which is funnier and
  worse than either. The raisin is never explained, never analysed and never called a drug: see
  `GAME_DESIGN.md` §2's reveal, which deliberately withholds a mechanism because a mechanism
  would turn a joke into homework.
- Drinking is funny; consequences exist. The Kater debuff is not moralising, it is a punchline
  with mechanics attached. Nobody in-game ever delivers a message about drinking — no NPC
  line, no item text, no boss quote says anything a PSA would say. What's allowed, and worth
  doing well: a detail that is simply *accurate* about what a Volksfest actually is once
  you're standing in the middle of one, played completely straight and never called out. See
  `GAME_DESIGN.md` §2 ("The second layer") and Floor 7's entry below for the standard this
  sets — the fun stays the fun, the honesty sits under it for whoever looks.

**Language.**
- Content is authored in Bavarian/German names with English descriptions.
- Ship English, German, and **Boarisch** (Bavarian dialect) as a joke locale that is
  nonetheless a real, complete translation. Item *names* stay Bavarian in all locales.
- Every string goes through the localisation layer from day one. No hardcoded UI text, ever.

---

## 1. Floors

Each floor is a chapter with its own tileset, palette, enemy roster, music track, hazard, and
boss. Two rooms of any floor should be instantly distinguishable from two rooms of any other.

### Floor 1 — Der Keller
**Alois's grandparents' cellar, under their house in Oberniederburg.** Damp bare concrete,
wooden racks, puddles, a single bare bulb. A German Keller is poured or
block concrete, not timber — so the palette leans on cold concrete greys as the base material,
with brown reserved for the wooden racks as a detail sitting in the room rather than the room
itself, plus one warm amber light source.
- **Hazard:** slick puddles that carry your momentum.
- **Set piece:** the two crates. Opa's, empty but for the bottle Alois has just put back, and
  the full one beside it with the new label. This is the inciting incident (`GAME_DESIGN.md`
  §2) and it belongs in the start room, before a single enemy — the player should get to read
  the label before anything asks them to shoot.
- **Teaching job:** this floor is the tutorial. Movement, shooting, doors, the first item. It
  must be beatable by someone who has never played the genre — and on an early run it is
  sober, since Promille is unlocked rather than on from the start (see
  [GAME_DESIGN.md §5](GAME_DESIGN.md)). Once it is unlocked, this is also where the first sip
  happens.

### Floor 2 — Dorf & Acker
**Oberniederburg itself**, the village the cellar is under. Village square, hop fields, a
maypole, tractors, cow pasture. Palette: green, sky blue,
white-and-blue bunting.
- **Hazard:** hop trellises block line of sight; wandering livestock.
- **Set piece:** the **Maibaum** stands in one room per floor. It can be climbed for a reward,
  and stolen by the boss (maypole theft is a real regional tradition).
- **The corruption is visible here at scale for the first time, and only as scenery.** New-label
  Pfeitinger crates stacked outside the Wirtshaus, on trailers, behind the Marktstand. Nobody
  comments on them. The floor is otherwise the sunniest in the game, which is the entire effect.
- **Chapter-two cliffhanger.** Beating Der Stier does not reveal what is upstream. What the
  player gets is a direction: the delivery lorry pulling out of the square, southbound, loaded.
  See `ROADMAP.md`'s sequencing notes and #58 — the acceptance criterion is a playtester calling
  it a cliffhanger unprompted, and a lorry leaving is a far more legible promise than a fade.

### Floor 3 — Der Wald
Bavarian Forest. Dense, dark, wrong. Palette: deep green, black, sickly luminous fungus.
- **Hazard:** spore clouds, thorn walls, and lantern-radius darkness in some rooms.
- **Tone shift:** this is where the game stops being cute for a floor. Folklore horror.

### Floor 4 — Die Alpen
High rock, snow, a Berghütte, cable car pylons. Palette: white, granite, alpenglow pink.
- **Hazard:** avalanches sweep whole rooms on a telegraph; ice floors remove friction;
  wind gusts push everything sideways.

### Floor 5 — Schloss Neuschwanstein
Absurd fairytale opulence. Throne rooms, murals, an unfinished wing full of scaffolding.
Palette: royal blue, gold, candlelight.
- **Hazard:** chandeliers that drop, mirrored rooms, an opera performance that damages on beat.
- **Set piece:** the unfinished wing — Ludwig died bankrupt and the castle was never completed.

### Floor 6 — Die Brauerei
Industrial. Stainless steel, conveyor belts, pipes, floodlights. Palette: steel, hazard
yellow, cola brown. Deliberately the ugliest floor.
- **Hazard:** conveyor belts move you, pipes vent scalding steam, the bottling line fires
  on a fixed rhythm.
- **This is the reveal floor.** Environmental storytelling only, no dialogue: production quotas
  on the walls, a shipping manifest addressed to the Wiesn, the crate line running new-label
  Pfeitinger and nothing else — and the dosing hopper, which is not fed from the ingredient
  store along with the malt and the hops but from somewhere further in, through a pipe that
  does not appear on the wall diagram. **The raisins are not raisins, and the floor never says
  what they are instead** (`GAME_DESIGN.md` §2). What it shows is the consequence: year-on-year
  Wiesn attendance posted on the wall as a production target, going up.

### Floor 7 — Die Wiesn
Beer tents, rides, gingerbread hearts, crowds, night, neon. Palette: everything at once,
gaudy, over-lit. Every tap on this floor runs new-label Pfeitinger, and the crowd is floor 6's
consequence standing up and enjoying itself.
- **Hazard:** the crowd — a moving mass you cannot shoot through; carousel arms; the
  Schießbude gallery.
- **Environmental detail, played completely straight:** a rise behind the tents where NPC
  bodies lie scattered in the grass, sleeping it off or worse for wear, families walking past
  without a second look because everyone here knows what this hill is for. No name on the map,
  no NPC comment, no prompt — the real one at the real Theresienwiese doesn't get a plaque
  either. It's an environmental prop, not a joke and not a lecture: the one moment on this
  floor where "over-lit and gaudy" briefly isn't the whole truth of the place, and nothing in
  the game points a finger at it. Position it somewhere a player has to walk past, not somewhere
  they have to visit.

### Secret areas
- **Walhalla** — the real neoclassical hall of heroes above the Danube. Superboss arena: the
  busts of the Bavarian ancestors step down off their plinths.
- **Der Teufelstritt** — devil-pact room, the footprint in the Frauenkirche.
- **Die Almhütte** — a peaceful shortcut/rest room. No enemies. Somebody is yodelling.

---

## 2. Enemy rosters

Design rule: every enemy must be readable at a glance by **silhouette alone**, and must have
exactly one idea. Complexity comes from combinations of enemies, not from complex enemies.

**Floor 1 — Der Keller**
- **Kellerassel** — woodlouse, crawls at you, curls into an invulnerable ball when shot. Basic.
- **Bierratte** — fast, erratic, low HP. Teaches leading your shots.
- **Schimmelfleck** — stationary mold blob, splits into two smaller ones when killed.
- **Rollfass** — barrel that rolls along one axis, bounces off walls, breaks into splinters.
- **Zapfhahn** — wall-mounted tap, sprays a cone of foam on a timer. Immobile turret.

**Floor 2 — Dorf & Acker**
- **Bauer** — farmer with a pitchfork, walks and lunges. Telegraph before the lunge.
- **Kuh** — charges in a straight line, needs a wall to stop, stunned briefly afterwards.
- **Gockel** — rooster, aggressive, dashes in short hops, wakes the room when it crows.
- **Gartenzwerg** — garden gnome, plays dead until you turn your back. Throws his own hat.
- **Blaskapellist** — tuba player, fires expanding sound rings on the beat of the floor music.
- **Traktor** — slow, tanky, leaves an exhaust cloud that blocks vision.
- **Rosinenkasten** — a crate of new-label Pfeitinger that walks. It does not shoot; it only
  arrives. Killed, the bottles it was carrying burst outward in a ring, so the one idea is
  *kill it before it is next to you* — the long-range rhyme to Rollfass's splinters.
- **Böllerschmeißer** — lobs a lit Böller in a telegraphed arc. The fuse is the whole enemy:
  the throw is readable, the landing spot is marked, and the player has about a second to not
  be standing there. This is the only place a Böller appears — it is something thrown at you,
  never something you pick up.

**Floor 3 — Der Wald**
- **Wolpertinger** — the mythical hybrid. Erratic, teleports short distances, drops rare loot.
- **Waldschrat** — forest ogre, slow, huge, throws logs.
- **Percht** — masked winter spirit, charges with a bell-ring telegraph, immune to freezing.
- **Hirsch** — stag, charges in an arc rather than a line.
- **Pilz** — mushroom, immobile, puffs a spore cloud that inflicts blurred vision.
- **Zwetschgenmandl** — the little dried-fruit figure off a Nuremberg market stall, walking.
  Comes apart into its individual fruits when hurt and reassembles unless you have moved the
  fight away from the pieces. Real folk craft, and the game's first hint that dried fruit is
  doing something it should not.
- **Drud** — nightmare spirit, only spawns when the player is on their last half-Maß. Invisible
  until close. Genuinely unpleasant, deliberately.

**Floor 4 — Die Alpen**
- **Steinbock** — ibex, charges and can climb over obstacles.
- **Murmeltier** — marmot, burrows, resurfaces under the player, whistles a warning first.
- **Bergwacht** — mountain rescue, fires a flare that illuminates and marks you for others.
- **Kuhglocke** — floating swarm enemy, moves in a shoal, damages by contact.
- **Sennerin** — throws cheese wheels that roll and ricochet.

**Floor 5 — Schloss Neuschwanstein**
- **Ritter** — knight with a directional shield; must be hit from behind or flanked.
- **Schwan** — swan. Fast, aggressive, hisses, genuinely terrifying, entirely realistic.
- **Opernsängerin** — sustained note creates an expanding damage ring; interruptible by damage.
- **Kerzenleuchter** — floating candelabra, drops wax pools that burn.
- **Bauarbeiter** — scaffold worker in the unfinished wing, drops bricks from off-screen.

**Floor 6 — Die Brauerei**
- **Braumeister** — fires precise, aimed shots. The first genuinely "competent" enemy.
- **Abfüllroboter** — bottling arm, fires in a fixed rhythmic pattern, never aims.
- **Colaklecks** — cola blob, splits, leaves sticky ground that slows.
- **Kastenschieber** — pushes crates as cover, blocks line of fire.
- **Zuckerrohr-Tank** — immobile syrup tank, floods the room floor slowly. Kill it or drown.
- **Rosinenklauber** — quality control. His job is picking foreign matter off the line, and he
  is picking the raisins out, and he is eating them. One idea: he gets faster and hits harder
  the longer the fight lasts, because he does not stop. The soft DPS check on the reveal floor,
  and the reveal's thesis delivered as a mob rather than as a sentence.

**Floor 7 — Die Wiesn**
- **Bedienung** — waitress carrying twelve Maß. Throws them one at a time, faster as she empties.
- **Ordner** — bouncer, grabs and throws the player, cannot be knocked back.
- **Betrunkener** — drunk, wanders unpredictably, vomits a damaging pool. Cannot be aimed at
  reliably because *he* does not know where he is going.
- **Schießbudenfigur** — shooting-gallery target, pops up and fires on a track.
- **Lebkuchenherz** — gingerbread heart with a slogan on it. The slogan is the attack.
- **Der Überzeugte** — a Wiesn guest, not visibly corrupted, extremely pleased. Cannot be
  killed, only shoved. Follows you across the room holding out a bottle of the new one, and
  connecting briefly slows you. He is not an obstacle the floor puts in your way; he genuinely
  thinks you would like it. `GAME_DESIGN.md` §2's "commits both ways", as an enemy.
- **Karussell** — room-scale rotating hazard rather than an enemy.

---

## 3. Bosses

Every boss: two phases minimum, a readable telegraph on every attack, and one attack that
teaches something the floor's enemies were rehearsing.

| Floor | Boss | Shape |
|---|---|---|
| 1 | **Die Große Kellerassel** | Segmented crawler. Phase 2: splits into the segments. Gentle — it is the tutorial boss. |
| 2 | **Der Stier** | Bull in the village square. Charge-and-stun loop; phase 2 adds the Maibaum-Dieb riding him. |
| 3 | **Die Wilde Gjoad** | The Wild Hunt. Not one entity — a procession that sweeps the arena on a fixed path while you fight the huntsman in the gaps. |
| 4 | **Der Watzmann** | The mountain itself. Static, enormous, fills one side of the arena. Avalanches, falling rock, a summit you must climb mid-fight. |
| 5 | **König Ludwig II** | Phase 1: swan boat on the lake, elegant, waltzing bullet patterns on 3/4 time. Phase 2: the drowning — he pulls the arena underwater. Tragic, not cruel. |
| 6 | **Die Abfüllanlage** | The bottling line. A machine, not a creature. Perfectly rhythmic, entirely fair, utterly relentless. Destroy four subsystems — the capper, the labeller, the conveyor head and **the dosing hopper**, which is where the reveal actually lands: breaking it open is how the player sees what has been going into the beer, with no plate and no line of dialogue. |
| 7 | **Die Bavaria** | The bronze statue: the one thing on the Theresienwiese that grows with the crowd. Phase 1: **Der Löwe**, her lion, fought at ground level. Phase 2: she steps off the plinth. Phase 3: she raises the wreath and the whole Wiesn fights for her — and they are not conscripted, they are *pleased to*, which is the fight's whole argument and is never stated anywhere else. |
| Secret | **Der Radler** | The heretic who first cut beer with lemonade. Optional superboss, mirrors the player's own build back at them. |
| Secret | **Die Ahnen von Walhalla** | The ancestors, in sequence, as an endurance gauntlet. |

---

## 4. Item seeds

Roughly 30 to start; target **120+ by v1**. Every one changes how you play.

### Shot-transforming
| Item | Effect |
|---|---|
| **Reinheitsgebot 1516** | Strips every `rosinen` item you hold, permanently locks the tag out of your pools, and gives +50% Stammwürze. The purist's pact, and the one the run is named after. |
| **Radler** | Half damage, double fire rate. |
| **Spezi** | Split shot: cola and orange, slightly divergent. |
| **Russ'n** | Weißbier and lemonade. Shots gain `homing`. |
| **Maß** | One enormous slow projectile instead of a stream. Massive damage, terrible coverage. |
| **Steinkrug** | Shots become thrown stone mugs: they arc over obstacles and shatter into splash damage. |
| **Bierdeckel** | Coaster boomerang — returns to you and damages on the way back. |
| **Colaweizen** | Shots gain `sticky` and slow enemies. You take a permanent damage penalty. Impure and everyone knows it. |
| **Radi** | Spiral-cut radish: shots travel in a helix. Awful at close range, superb at long. |
| **Enzian** | Schnapps. Ten seconds of enormous fire rate on a cooldown, then +1.0 Promille. |

### Orbitals, familiars and friends
| Item | Effect |
|---|---|
| **Brezn** | Orbiting pretzel, blocks enemy shots and damages on contact. |
| **Wadlbeißer** | A Dackel familiar. Bites ankles. Refuses to leave the room until it has bitten something. |
| **Ludwigs Schwan** | Swan familiar, elegant, fires homing feathers, costs you coins every floor. |
| **Der Ordner** | Bouncer familiar. Does no damage; shoves enemies away from you. |
| **Wolpertinger im Rucksack** | Familiar with a different random behaviour every room. |

### Passives and stat shapers
| Item | Effect |
|---|---|
| **Lederhosn** | Absorbs one hit per room. Never washed, never fails. |
| **Haferlschuh** | +speed, +traction on ice and slick floors. |
| **Gamsbart** | +Dusel. The bigger the beard, the luckier the man. |
| **Kraftbier** | Big damage up, big speed down. |
| **Neuschwanstein-Bauplan** | Large permanent stat buff; you lose a growing sum of Biermarken on every floor transition. Ludwig went bankrupt too. |
| **Weiß-blaue Rauten** | Every eighth shot fires in the lozenge pattern of the Bavarian flag. |

### Tainted — the `rosinen` tag

The corruption, as a build decision. Every one of these is **a clean item plus an upgrade plus
one legible cost** (`GAME_DESIGN.md` §8): good enough that taking it is tempting and refusing it
is a real sacrifice, honest enough that the description never hides the cost. They are the
reason the two pacts below are a choice rather than a free stat bump, and they are the only
route the adulterated stuff ever takes into the player *as a pickup* — Alois's own shot is the
one other exception, and it is a weapon, never a beer he drinks (`GAME_DESIGN.md` §2).

Oma's cake is the pattern, and it should be the first pair a player ever sees:

| Item | Tag | Effect |
|---|---|---|
| **Apfelkuchen** | — | Oma's. Heals generously on pickup, small permanent Stammwürze bump. Uncomplicated and quite boring. |
| **Apfelkuchen (mit Rosinen)** | `rosinen` | The same cake. Heals more, bumps Stammwürze considerably more, and permanently costs you Reichweite. Strictly the better pickup and slightly the worse cake. |

Both sprites are legible as *different cakes at a glance* — deliberately unlike **Weißwurst**
(`GAME_DESIGN.md` §7), whose whole joke is an unchanged sprite. Reading the label is the thing
the game opened on; an item pool that punishes reading it would be arguing with its own premise.

### The three answers to the raisin

The pacts, and the reason there are three of them: purity, appetite, and the man who has found
a third way and is not proud of it. Each closes the others off, so a run picks one.

| Item | Effect |
|---|---|
| **Reinheitsgebot 1516** | *(above)* Strips and locks out `rosinen`. +50% Stammwürze. Says nothing about lemonade, which is the joke it has always been making. |
| **Sudordnung 1493** | The Landshut ordinance, twenty-three years earlier and stricter, which nobody remembers. Strips and locks out **both** `rosinen` and `impure` — Radler, Spezi, Russ'n and Colaweizen go too. +65% Stammwürze. The deep-cut purist's pact: 1516 was already the compromise. |
| **Der Rosinenklauber** | Every `rosinen` item you hold loses its drawback and keeps its upgrade. In exchange both pacts above are removed from your pools for the rest of the run. He is not defending the raisins. He is just eating them. |

### Promille-gated

None of these appear in a run where Promille has not been unlocked yet — an item whose
requirement cannot be evaluated is a stat stick rather than a build decision.

| Item | Requirement | Effect |
|---|---|---|
| **Maßkrugstemmen** | `rausch` | Hold fire to charge; damage scales with hold time. Your arms shake — accuracy falls as damage rises. |
| **Schuhplattler** | `any` | Stand still for a moment to release a damaging shockwave. |
| **Fingerhakeln** | `rausch` | Contact damage, and enemies are dragged toward you. |
| **Zwoa, drei, gsuffa** | `rausch` | Every third kill within a few seconds grants a stacking damage buff. |
| **Ruhige Hand** | `sober` | Perfect accuracy and +40% damage while under 0.5 Promille. Actively fights every beer pickup in the game. |
| **Konterbier** | `any` | Drinking while hungover instantly clears the Kater. Obviously. |

### Chaotic / synergy engines
| Item | Effect |
|---|---|
| **Föhn** | The alpine headache wind blows across every room, pushing *all* projectiles — yours and theirs — in a slowly rotating direction. Interacts with homing, bouncing and arcing in ways we cannot fully predict. That is the point. |
| **Obazda** | Leaves a cheese puddle wherever you walk. Slows enemies. Some enemies refuse to enter it at all. |
| **Fassldauben** | The keg's staves fly out in four directions when it bursts. |
| **Alpenglühen** | Shots gain `burning`. At high Promille, so do you. |
| **Bierzelt-Garnitur** | Deploy a beer-tent bench as destructible cover. |
| **Lebkuchenherz** | Displays a slogan over your head. The slogan is randomly chosen and has a randomly chosen mechanical effect. |

---

## 5. Art direction

- **16-bit era**, not 8-bit. Readability with a screen full of projectiles requires more
  colours and more silhouette detail than an NES palette allows.
- **16×16 tiles**, characters roughly 12×16 up to 16×32, bosses up to 160×160 — as authored (see
  `docs/DECISIONS.md` #26 for the character/boss ceilings — "16-bit" is a colour/shading budget,
  not a pixel-dimension one). Sprites live in simulation units and the room is drawn at
  `WORLD_ZOOM`, so on screen those are 32×32, ~24×32 up to 32×64, and up to 320×320 — a boss at
  its ceiling is deliberately close to filling the 360-tall internal resolution.
- **Internal resolution 640×360** for the game layer, scaled by a whole number of device
  pixels. Never non-integer: a sprite drawn at 1.5× has some pixels one screen pixel wide and
  some two. Menus, HUD text and anything else made of words are drawn outside that layer, at
  the display's own resolution — so a HUD on a 4K monitor is not stuck with eight device pixels
  of glyph height. Since #154 they are nonetheless laid out on the **frame's own grid**, at a
  whole-number scale of it: the UI is drawn in a pixel font the project owns, and a pixel font
  at a fractional size resamples exactly the way a tile does. See `docs/DECISIONS.md` #43.
- **Two type faces, and the rule between them is legibility, not taste.** A 10-row text face for
  everything read while something is shooting at you, and a 16-row pixel Fraktur for the few
  things said in a raised voice — the game's name, a floor's title card, a boss plate, the word
  a run ends on. `docs/DECISIONS.md` #44 has the line, and why the long ſ and the genuinely
  confusable Fraktur capitals did not survive it.
- **Umlauts and ß are letters, not decorated vowels.** German is a first-class language here, so
  a diacritic's vertical room is reserved in the cell rather than borrowed from the cap height,
  and accented letters are composed from a base plus a mark rather than drawn one at a time
  (`docs/DECISIONS.md` #42). German also runs roughly a third longer than English for the same
  UI string: lay a screen out with that as the default case, and let
  `tests/unit/ui-strings.test.ts` — which measures the real strings — say whether it fits.
- **Palette capped at ~40 colours** overall, with a per-floor sub-palette so each chapter has
  its own mood while staying visually one game.
- **Projectile legibility is a hard constraint that overrides beauty.** Player shots and enemy
  shots must differ in shape *and* brightness, not only hue. Enemy shots always get a bright
  rim so they read against any background. Test every floor palette with the projectile set
  on top before signing it off.
- Animation: 4–6 frames for walk cycles, 2 frames for idle, generous squash and stretch on
  impacts. Hit flashes are white, one frame, always.

## 6. Audio direction

- **Chiptune Blaskapelle.** Tuba bassline, brass stabs, accordion, clarinet. Instantly
  identifiable and nobody else in the genre sounds like this.
- Each floor gets a track that is recognisably the same band playing a different room:
  the cellar is a lone accordion, the Wiesn is the full brass band at maximum volume, the
  brewery is the same melody rendered as industrial machine rhythm.
- Ludwig's fight is a waltz in 3/4 that his bullet patterns are synchronised to.
- Bavarian voice barks, heavily compressed and short: "*Sauber!*", "*Geh weida!*", "*Passt scho.*"
- Every impact needs a sound. Silence on a hit is the single fastest way to make a game feel
  cheap.

## 7. Death screen wording

The game-over screen does not use one fixed word. It draws a Boarisch word for "collapsed /
finished" from a pool, so that a run's ending has a small amount of variety and the screen
stays worth reading after fifty deaths.

**The pool.**

| Word | Sense |
|---|---|
| **Umgfalln** | Fell over. The plain one, and the same word as the top Promille tier. |
| **Hi** | Done for, gone. Short and blunt. |
| **Z'legt** | Laid out flat. |
| **f'reckt** | Croaked. Coarser; kept lowercase, see below. |
| **dakerbelt** | Snuffed it. |

**Rules for drawing one.**

- Draw from the **cosmetic RNG stream** (`RngStream.Cosmetic`, `sim.random.cosmetic` — see
  [`src/sim/rng/streams.ts`](../blob/main/src/sim/rng/streams.ts)), never from the shared or
  gameplay streams. A draw taken from the enemy or floor stream would advance it and change
  every later gameplay roll, which silently breaks seeded runs and replays. On the cosmetic
  stream the pool can be extended later without invalidating any seed.
- Reject the previous run's word before rolling, so the same word never appears twice in a
  row. A five-word pool rolled freely repeats back to back roughly one run in five, and a
  repeat reads as a bug rather than as randomness.
- The pool is data, not code. Adding a word must not require touching the death screen.

**Two open questions, to settle when the death screen is built.**

- *Capitalisation.* **f'reckt** and **dakerbelt** are lowercase against **Hi**, **Z'legt** and
  **Umgfalln**. Either that is a deliberate typographic joke and the screen must not
  upper-case the pool, or the whole pool normalises to one case. Decide before these words
  are drawn as a headline.
- *Locale behaviour.* Either these words stay Boarisch in every locale as flavour — the same
  argument that keeps item names Bavarian everywhere — or English and German get their own
  parallel pools. See [§0 Language](#0-naming-tone-and-legal-rules) and the localisation work.
