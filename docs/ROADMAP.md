# Kellerbier — Roadmap

Ten milestones. Each has an exit criterion that is a *demonstration*, not a checklist.
GitHub issues carry a milestone label `M0`–`M9` and a title prefix.

There is no milestone API available to this repo's tooling, so milestones are labels.

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

## M5 — Floors 1 & 2 complete
*Exit: two finished chapters, art, audio, enemies and bosses — a coherent 15-minute game.*

Der Keller and Dorf & Acker end to end. This is the first build worth showing to strangers.

## M6 — Floors 3–7 and bosses
*Exit: a complete run from cellar to Die Bavaria.*

Der Wald, Die Alpen, Schloss Neuschwanstein, Die Brauerei, Die Wiesn. Every enemy roster,
every boss, every floor hazard. The bulk of the content work.

## M7 — Meta-progression
*Exit: losing a run makes you want to start another one immediately.*

Save system, the Stammtisch hub, unlocks, additional characters, achievements, seeded runs,
the daily run, challenge runs, curses, devil and angel rooms. The first unlock is Promille
itself, granted for beating Der Stier — which makes the hub load-bearing earlier than the rest
of this milestone implies.

## M8 — Polish
*Exit: it looks and sounds like a finished commercial game.*

The full Blaskapelle soundtrack, complete SFX, settings menus, localisation into English,
German and Boarisch, full accessibility features, gamepad support, the story cards, and a
serious balance pass against real playtest telemetry.

## M9 — Release
*Exit: strangers are playing it.*

Web build on itch.io, a trailer, store copy, a legal review of every name and landmark,
optional Tauri desktop packaging, and a post-launch plan.

---

## Sequencing notes

- **M1 gates everything.** Do not start content work before the game feels good. Content built
  on bad feel is content that has to be rebuilt.
- **M3 and M4 overlap heavily** — items and Promille are two halves of one system and should
  be balanced together.
- **M5 is the first real quality bar.** Whatever polish level floor 1 reaches becomes the
  standard every later floor must match. Set it deliberately.
- **M6 is where the schedule goes wrong** on projects like this. Five floors of content is
  more work than everything before it combined. Build the tooling (room editor, balance
  simulator) in M2/M3 so M6 is authoring rather than engineering.
- **Performance is checked continuously**, not in M8. The CI benchmark exists from M0.
