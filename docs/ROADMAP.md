# Kellerbier — Roadmap

Eleven milestones. Each has an exit criterion that is a *demonstration*, not a checklist.
GitHub issues carry a milestone label `M0`–`M10` and a title prefix.

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

---

## M0 — Foundations
*Exit: `npm run dev` opens a window with a fixed-timestep loop running, and CI is green.*

Repo scaffolding, TypeScript strict, Vite, Pixi v8, the ECS core, the fixed-timestep loop,
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
there is no animation system at all, and Sepp himself is a procedurally generated shape. Sprite
animation, the player's own art, the remaining floor 1 & 2 sprites, a VFX quality pass, the
semantic palette, the pixel font and UI kit, and the art tooling that makes authoring the rest
of it cheap.

## M7 — Meta-progression
*Exit: losing a run makes you want to start another one immediately.*

Save system, the Stammtisch hub, unlocks, additional characters, achievements, seeded runs,
the daily run, challenge runs, curses, devil and angel rooms — and the run's actual ending,
now that floor 2's boss is the last one. The first unlock is Promille itself, granted for
beating Der Stier, which makes the hub load-bearing earlier than the rest of this milestone
implies.

**This milestone carries more weight than it used to.** With five floors deferred, the reason
to start a second run cannot be "there is more to see" — it has to be a different character, a
different unlock, a different curse, a run you are trying to beat.

## M8 — Sound, menus and balance
*Exit: it looks and sounds like a finished commercial game.*

The Blaskapelle soundtrack for two floors, the audio engine and full SFX pass, the title
screen, pause and settings, localisation into English, German and Boarisch, full accessibility
features, gamepad support, the story cards, and a serious balance pass against real playtest
telemetry.

## M9 — Release
*Exit: strangers are playing it.*

Web build on itch.io, a trailer, store copy, a legal review of every name and landmark, the
Steam and desktop tracks, and a post-launch plan.

## M10 — Floors 3–7 *(parked)*
*Exit: a complete run from cellar to Die Bavaria.*

Der Wald, Die Alpen, Schloss Neuschwanstein, Die Brauerei, Die Wiesn. Every enemy roster,
every boss, every floor hazard. Parked until floors 1 & 2 are finished, so that these five are
built once, against a bar that has stopped moving, with the art and audio pipelines that M6–M8
will have proved out.

---

## Sequencing notes

- **M1 gates everything.** Do not start content work before the game feels good. Content built
  on bad feel is content that has to be rebuilt.
- **M3 and M4 overlap heavily** — items and Promille are two halves of one system and should
  be balanced together.
- **M6 sets the bar that M10 inherits.** This is the same warning M5 used to carry, moved to
  the milestone that actually decides the answer. Every decision here — sprite size, frame
  count, palette, how much a hit flashes — is a decision five parked floors will have to match.
- **M6 before M8, deliberately.** Art and animation change what the game needs from its sound
  and its menus; the reverse is much less true. Doing sound against placeholder art means
  scoring a game that does not exist yet.
- **M7's scope is a bet.** Two floors is roughly fifteen minutes. If meta-progression does not
  make a second run compelling, the honest response is not more meta-progression — it is
  unparking M10 sooner.
- **M8's balance pass is cheap now and expensive later.** Balancing two floors against real
  telemetry, with the simulator from #54, is a tractable problem. The same work across seven
  floors is the thing that eats a schedule.
- **Performance is checked continuously**, not in M8. The CI benchmark exists from M0.
