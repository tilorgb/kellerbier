# Kellerbier — Roadmap

Twelve milestones. Each has an exit criterion that is a *demonstration*, not a checklist.
GitHub issues carry a milestone label `M0`–`M11` and a title prefix.

There is no milestone API available to this repo's tooling, so milestones are labels.

---

## The shape of the plan

The original plan built all seven floors and then polished them. **It no longer does.** The
content stops at floors 1 & 2, and everything after M5 is finishing *those two floors* to a
commercial standard — art, animation, sound, menus, meta-progression, balance — before a third
floor is built.

The reason is the one M5's own sequencing note already made and the plan then ignored:
*whatever polish level floor 1 reaches becomes the standard every later floor must match.*
Setting that standard on two floors costs two floors of rework when it moves, which it will,
repeatedly. Setting it on seven costs seven. Floors 3–7 are not cancelled — they are
**M10, parked**, and they get built once the bar they have to match has stopped moving.

The trade this makes: a 15-minute game has to earn its replays from systems rather than from
new scenery. That is what M7 is for, and it is why meta-progression stays in scope rather than
deferring alongside the floors.

And it ships. **M9 releases the two-floor game on itch.io before M10 exists** — free or
name-your-price, honest on the store page about being two chapters of seven. That is not a
compromise forced by the refocus; it is the point of it. Every hour of stranger playtime is
evidence about what the remaining five floors should be, collected before they are built rather
than after.

**Floor 3 is the exception, taken deliberately (2026-10-05).** With M6 and M7 closed, the bar
floor 3 has to match is the one those milestones set, and it has stopped moving enough to build
against. Der Wald was redesigned down to issues (#39, split into #401–#414) and is now **M10,
active**, and it ships *in* M9's release: the itch.io game is three chapters of seven, not two.
Floors 4–7 and the Steam track stay parked, now as **M11**. The alpha page (#367) still goes up
with two floors — it exists to feed #54 data now, not to be the release. `docs/DECISIONS.md` #117
has the reasoning and what it re-opens.

---

## M0 — Foundations
*Exit: `npm run dev` opens a window with a fixed-timestep loop running, and CI is green.*

Repo scaffolding, TypeScript strict, Vite, Pixi v8 (replaced by three.js in M6, `DECISIONS.md`
#74), the ECS core, the fixed-timestep loop,
seeded RNG, input handling, the debug overlay, CI, and the GitHub Pages preview deploy.
Boring, and everything else stands on it.

## M1 — Game feel (the vertical slice)
*Exit: one room, one enemy type, and it is **fun to shoot things** — verified by someone else
playing it without being told what to do.*

This is the most important milestone in the project. Movement, twin-stick shooting, knockback,
hitstop, screenshake, hit flash, particles, damage numbers, death and respawn. If this
milestone does not produce something you want to keep playing after the bug is fixed, the
project has a problem that no amount of content will solve.

Also: the first **Promille prototype**, so we learn early whether the core mechanic works.

## M2 — Rooms, doors and floors
*Exit: a full procedurally generated floor, walkable start to boss room, with a minimap.*

Room template format, the room loader, door and transition system, floor generation, layout
validation, the minimap, pickups, and the special room types.

## M3 — Items, stats and synergy
*Exit: 25+ items in pools, and two randomly chosen items produce a combination nobody
explicitly authored.*

The stat pipeline, the item hook system, projectile tags and their composition, item pools,
pedestals, pickup UI, and the debug stat inspector. The engine of replayability.

## M4 — The Promille system, properly
*Exit: Promille is a decision the player thinks about, not a bar they ignore.*

Full tiers, drift and sway, the Kater debuff, sober/rausch item gating, food, the
accessibility toggles, and a genuine balance pass. Or the honest alternative: the evidence
that it does not work, and its removal.

Promille is finished here but not *met* here: it is unlocked rather than on from the first run,
and the gate itself ships with the hub and the save system in M7.

## M5 — Floors 1 & 2 content
*Exit: both chapters playable end to end — tilesets, rooms, both enemy rosters and both bosses.
Content complete, not yet finished.*

Der Keller and Dorf & Acker, walkable start to boss. This milestone deliberately no longer
claims "art and audio" in its exit criterion — that claim is what let a floor look finished
while its player character was still a generated blob. M5 ends when the *content* is there;
M6–M8 are what make it good.

## M6 — Look and motion
*Exit: nothing on screen is a placeholder and everything alive is animated — a stranger
watching a clip cannot tell which parts are unfinished.*

The milestone the original plan never had, and the gap it left is visible in the build today:
there is no animation system at all, and Alois himself is a procedurally generated shape. Sprite
animation, the player's own art, the remaining floor 1 & 2 sprites, a VFX quality pass, the
semantic palette, the pixel font and UI kit, and the art tooling that makes authoring the rest
of it cheap. The renderer switch landed here too: the room became a lit 3D scene under a fixed
camera, with the same 2D sprites standing in it (`DECISIONS.md` #74).

## M7 — Meta-progression
*Exit: losing a run makes you want to start another one immediately.*

Save system, a results screen between runs, unlocks, additional characters, achievements, seeded
runs, the daily run, challenge runs, curses, devil and angel rooms — and the run's actual ending,
now that floor 2's boss is the last one. The first unlock is Promille itself, granted for beating
Der Stier, which makes the results screen load-bearing earlier than the rest of this milestone
implies. Character select, seed entry, the daily run and replays move to M8's title screen and
menus rather than living on the results screen — see `docs/DECISIONS.md`'s follow-up to #51.

**This milestone carries more weight than it used to.** With five floors deferred, the reason
to start a second run cannot be "there is more to see" — it has to be a different character, a
different unlock, a different curse, a run you are trying to beat.

## M8 — Sound, menus and balance
*Exit: it looks and sounds like a finished commercial game.*

The Blaskapelle soundtrack for two floors, the audio engine and full SFX pass, the title
screen, pause and settings, localisation into English, German and Boarisch, full accessibility
features, gamepad support, the story cards, and a serious balance pass against real playtest
telemetry.

**It also carries the two epics that decide whether there is a game under all of that**, and both
sit upstream of the balance pass. #228, *the pressure pass*: nothing on either floor could hurt a
player who kept walking, so no room ever asked for a decision. #270, *bigger floors and the
mini-boss gate*: the boss sits under four doors from the start room, measured, so a floor is over
before a run has a shape — and an encounter pass has nowhere to land in a floor that short.

#270 is the one place this plan has knowingly **added** scope to the shipping game rather than
deferring it, and it is the reason M9 moves. That is a trade worth naming rather than absorbing:
two floors that are each roughly a third longer to the boss door (measured, not the "twice as
long" this section first guessed — `docs/GAME_DESIGN.md` §4 has the real numbers), with a
mandatory fight between the player and each of those doors, is a different demo from the one the
refocus originally scoped, and it costs a mini-boss roster and its art on top of the systems. The
alternative — shipping a fifteen-minute game whose floors end four rooms in — is what the
measurement argued against.

## M9 — Release
*Exit: strangers are playing it — the three-floor game is out on itch.io and feedback is coming
back.*

Web build on itch.io, a trailer, store copy honest about the game being two chapters of seven,
a legal review of every name that actually ships, and a post-launch plan. **Free or
name-your-price**, which removes the "is fifteen minutes worth money" question rather than
answering it.

The Steam track (#70–#72) and the desktop shell (#57) are **not** here. Steam wants a paid store
page, a wishlist runway and enough game to justify both, and three floors is not that. They move
to M11, where #57's own "revisit if" clause points them anyway.

**M9 now waits on M10.** The release ships floor 3, so #56 cannot close before #414 does — the
milestone numbers no longer read in shipping order, and this is the one place they don't.

## M10 — Floor 3: Der Wald
*Exit: floor 3 is reached through the real progression — clear Der Stier, take the stairs — and
Der Waldradler is beaten, in the same build that ships on itch.io.*

The first parked floor to be unparked. #39 carries the design — poison is the floor's lesson and
the boss tests it; axes are its grammar; the room changes under you; satire, not horror — and is
split into #401–#414: poison on the player, the `wald` foundation, the Waldbach and the
lantern-darkness rooms, seven enemies, the two-phase Waldradler, and the integration that bumps
`HIGHEST_PLAYABLE_FLOOR` to 3. #39's dependency graph sets the order: poison and the foundation
first, integration last.

It is built against the bar M6–M8 set, not a new one: animated sprites through the sign-off gate
in `CLAUDE.md`, sound through #157's buses, rooms that hold up under #228's pressure and #270's
floor length. Music is out of scope — floor 3 reuses an existing track until a dedicated one is
written.

## M11 — Floors 4–7 *(parked)*
*Exit: a complete run from cellar to Die Bavaria, on Steam, worth charging for.*

Die Alpen, Schloss Neuschwanstein, Die Brauerei, Die Wiesn. Every enemy roster, every boss, every
floor hazard — plus the Steam release and the desktop build that need them to exist first. Parked
until the three-floor game is finished and released, so these four are built against a bar that
has stopped moving and against real evidence from M9's players about what they should be.

---

## Sequencing notes

- **M1 gates everything.** Do not start content work before the game feels good. Content built
  on bad feel is content that has to be rebuilt.
- **M3 and M4 overlap heavily** — items and Promille are two halves of one system and should
  be balanced together.
- **M6 sets the bar that M10 and M11 inherit.** This is the same warning M5 used to carry, moved to
  the milestone that actually decides the answer. Every decision here — sprite size, frame
  count, palette, how much a hit flashes — is a decision every later floor will have to match.
- **M6 before M8, deliberately.** Art and animation change what the game needs from its sound
  and its menus; the reverse is much less true. Doing sound against placeholder art means
  scoring a game that does not exist yet.
- **M7's scope is a bet, and it gets called at the end of M7.** Two floors is roughly fifteen
  minutes. The decision point is fixed rather than metric-triggered: when M7 closes, play it and
  judge whether a second run is genuinely compelling. If it is not, the honest response is not
  more meta-progression — it is unparking floors sooner, which is what M10 now is. Being a
  *scheduled* decision is the whole point; a bet with no date attached quietly becomes an
  assumption.
- **The story ends on a cliffhanger, deliberately.** Der Stier closes chapter two rather than
  revealing what is upstream — the "the raisins are just raisins" reveal stays in M11 with floor
  6, where it was written to live; chapter two ends on the loaded delivery lorry pulling out of
  the village square, southbound. That puts real weight on execution (#58): a cliffhanger done well
  is a promise, done badly it is indistinguishable from running out of content, and M9 puts it in
  front of strangers who have no roadmap. The acceptance criterion is a playtester describing it
  as a cliffhanger unprompted.
- **Pressure and length before balance.** #228 and #270 both land before #54, deliberately. A
  balance pass tunes a curve; those two decide what shape the curve is and how long it runs. Doing
  #54 first would tune the game we have into a better version of the game we have — the same
  argument #228 made against itself being scheduled late, applied once more when #270 turned out to
  be its sequel.
- **Floor 3 lands before the balance pass closes.** #54 tunes the curve of the game that ships,
  and that game now has three floors: the two-floor alpha (#367) collects the telemetry, but the
  curve isn't final until #414 has put floor 3 on the end of it.
- **Where the chapter ends is open again.** The cliffhanger above, the run's ending (#155) and
  the Promille unlock (#236) were all placed on Der Stier as *the last boss of the shipping game*.
  Floor 3 moves that boss to Der Waldradler; each needs a decision, not a silent carry-over —
  `docs/DECISIONS.md` #117 lists them.
- **M8's balance pass is cheap now and expensive later.** Balancing three floors against real
  telemetry, with the simulator from #54, is a tractable problem. The same work across seven
  floors is the thing that eats a schedule.
- **Performance is checked continuously**, not in M8. The CI benchmark exists from M0.
