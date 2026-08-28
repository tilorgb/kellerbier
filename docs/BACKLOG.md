# Kellerbier — Backlog Index

> **Looking for live status?** The [roadmap issue](../../issues?q=is%3Aissue+label%3Aroadmap)
> is generated from the issue list and shows what is done and what is next. This file is the
> static index of the planning backlog; the roadmap issue is the thing to check daily.

GitHub milestones are not available through this repo's tooling, so milestones are **labels**
(`M0`–`M10`) plus a title prefix.

Filter by label: [`M0`](../../labels/M0) · [`M1`](../../labels/M1) · [`M2`](../../labels/M2) ·
[`M3`](../../labels/M3) · [`M4`](../../labels/M4) · [`M5`](../../labels/M5) ·
[`M6`](../../labels/M6) · [`M7`](../../labels/M7) · [`M8`](../../labels/M8) ·
[`M9`](../../labels/M9) · [`M10`](../../labels/M10)

---

## The refocus

The plan used to run M5 (floors 1 & 2) → M6 (floors 3–7) → polish. **It no longer does.** Content
stops at two floors and everything after M5 finishes *those two* — look and motion, meta-
progression, sound and menus, balance — before a third floor is built. Floors 3–7 are **M10,
parked**, and the reasoning is in [`ROADMAP.md`](ROADMAP.md).

What moved, concretely:

| Issue | Was | Now | Why |
|---|---|---|---|
| #39–#44, #98 | M6 | **M10 (parked)** | Floors 3–7 and their secret areas, deferred whole |
| #108, #109 | M5 | **M6** | Art tooling and the palette belong to the presentation milestone |
| #137 | *untriaged* | **M7** | Item sets are replayability, which M7 now carries |
| #51 | one epic | **#51 + #157** | Composition and mixer plumbing split; #51 now writes two floor themes, not seven |
| #53 | one epic | **#53 + #158** | Screen flow split from settings and accessibility |
| #52, #54, #58 | seven floors | rescoped | Two-floor curve, chapter-two cliffhanger, pixel font moved to #154 |
| #57, #70–#72 | M9 | **M10** | Steam and the desktop shell need more game than two floors to be worth doing |
| #55, #56 | seven-floor launch | rescoped | M9 is the itch.io release of a two-chapter game, priced and described as one |

---

## M0 — Foundations

| # | Issue |
|---|---|
| 1 | Scaffold project: TypeScript, Vite, PixiJS v8, strict config |
| 2 | Fixed-timestep simulation loop with render interpolation |
| 3 | Core ECS with Structure-of-Arrays component storage |
| 4 | Seeded deterministic PRNG, and ban `Math.random` from `sim/` |
| 5 | Input system: keyboard, mouse and gamepad with full rebinding |
| 6 | CI pipeline with a playable preview link on every PR |
| 7 | Architecture lint rules: `sim/` must not import `render/` |
| 8 | Debug overlay: frame graph, entity counts, hitbox display |
| 60 | Project conventions: CONTRIBUTING, definition of done, issue templates |

## M1 — Game feel

**The milestone that gated everything else.**

| # | Issue |
|---|---|
| 9 | Player movement: acceleration, friction and momentum |
| 10 | Twin-stick shooting and projectile spawning |
| 11 | Spatial-hash broadphase and circle collision |
| 12 | Object pooling for projectiles, particles and events |
| **13** | **Impact feel: knockback, hitstop, screenshake, flash, particles** |
| 14 | First enemy (Kellerassel) and the behaviour primitive library |
| 15 | Health, damage, i-frames and death |
| 16 | Performance stress scene and CI frame-time benchmark |
| 17 | Promille prototype — exit criterion is a verdict: keep, rework or cut |

## M2 — Rooms and floors

| # | Issue |
|---|---|
| 18 | Room template format and content schema |
| 19 | Room loading, door locking and transitions |
| 20 | Floor generation with layout validation |
| 21 | Minimap and run HUD |
| 22 | Pickups: Maß, Biermarken, Bierfassl, Schlüssel, food |
| 23 | Special rooms: Treasure, Shop, Boss, Secret |
| 24 | Room editor tool |
| 96 | Room transition camera slide and door visuals |
| 100 | Multi-cell rooms behave as bigger physical spaces |
| 107 | Bigger and diagonal room shapes: T, X and / layouts |
| 110 | Shared design tokens for the DOM-based dev tools |
| 112 | Diagonal staircase room: overlapping-screen geometry |
| 117 | Decouple presentation consumers from room-compile internals |
| 118 | Sub-cell floor-grid reservations |

## M3 — Items and synergy

| # | Issue |
|---|---|
| 25 | Stat pipeline with traceable modifier sources |
| 26 | Item definition format and hook system |
| **27** | **Projectile tag system and tag composition** — the engine of replayability |
| 28 | Item pools, pedestals and pickup UI |
| 29 | Author the first 25 items |
| 30 | Synergy fuzz harness: crash, NaN and outlier detection |
| 59 | Expand the item pool toward 120+ |

## M4 — Promille

| # | Issue |
|---|---|
| 31 | Full tiers, Kater debuff and food |
| 32 | Sober/Rausch item gating and the Promille-gated item set |
| 33 | Accessibility: sway toggle, no-drift mode, neutral reskin |
| 92 | Trinkfest tolerance and extended Vollrausch |

## M5 — Floors 1 & 2 content

*Exit: both chapters playable end to end. Content complete, not yet finished.*

| # | Issue |
|---|---|
| 34 | Art pipeline: atlas packing, palette discipline, legibility test |
| 35 | Floor 1 — Der Keller (also the tutorial) |
| 36 | Boss — Die Große Kellerassel |
| 37 | Floor 2 — Dorf & Acker |
| 38 | Boss — Der Stier and the Maibaum-Dieb |
| **156** | **Roster and encounter depth** — thirteen enemies now carry the whole game |

## M6 — Look and motion

*Exit: nothing on screen is a placeholder and everything alive is animated.*

The milestone the original plan never had. It sets the bar M10 inherits.

| # | Issue |
|---|---|
| 108 | Pixel-art authoring tool for sprite content |
| 109 | Semantic render palette and per-floor theming |
| **150** | **Sprite animation system** — there is no animation in the game at all |
| 151 | Alois: the player character's art and animation |
| 152 | Floor 1 & 2 art completion sweep: every remaining placeholder, gone |
| 153 | VFX quality pass: art-directed effects instead of generated ones |
| 154 | Pixel font and UI kit |

## M7 — Meta-progression

*Exit: losing a run makes you want to start another one immediately.* Carries more weight than it
used to — with five floors parked, the reason to replay cannot be "there is more to see".

| # | Issue |
|---|---|
| 45 | Save system with versioned migrations |
| 46 | Stammtisch hub and the unlock system |
| 47 | Additional playable characters |
| 48 | Seeded runs, daily run and replay recording |
| 49 | Curses, Teufelspakt and Klostersegen |
| 50 | Challenge runs and Wiesn-Orden achievements |
| 84 | Blutwurz: a second chance you have to walk back for |
| 85 | Gate Promille behind an unlock — the first runs are sober |
| 137 | Item sets: themed multi-item groups with a completion bonus |
| **155** | **The run has an ending** — a run currently cannot be won |

## M8 — Sound, menus and balance

*Exit: it looks and sounds like a finished commercial game.*

| # | Issue |
|---|---|
| 51 | Blaskapelle: floor 1 & 2 music and the full SFX pass |
| 52 | Localisation: English, German and Boarisch |
| 53 | Settings and the full accessibility suite |
| 54 | Balance pass with playtest telemetry |
| 58 | Story delivery: chapter cards, boss plates and the chapter-two cliffhanger |
| 157 | Audio engine: buses, mixing, ducking and Promille filtering |
| 158 | Title screen, pause and the run flow around the game |
| 159 | A structured playtest loop |

## M9 — Release

*itch.io only, free or name-your-price.* The two-floor game ships and strangers play it; Steam
waits for M10.

| # | Issue |
|---|---|
| 55 | Legal review of names, landmarks and trademarks |
| 56 | Web release build, itch.io page and trailer |

## M10 — Floors 3–7 *(parked)*

Not cancelled — deferred until the bar these five have to match has stopped moving, and until M9's
players have said something about what they should be. Epics; break each into sub-issues when they
unpark. Carries the Steam track, which needs more game than two floors to be worth doing.

| # | Issue |
|---|---|
| 39 | Floor 3 — Der Wald and Die Wilde Gjoad |
| 40 | Floor 4 — Die Alpen and Der Watzmann |
| 41 | Floor 5 — Schloss Neuschwanstein and König Ludwig II |
| 42 | Floor 6 — Die Brauerei and Die Abfüllanlage |
| 43 | Floor 7 — Die Wiesn and Die Bavaria |
| 44 | Secret areas: Walhalla and Der Teufelstritt |
| 57 | Desktop packaging with Electron |
| 70 | Steamworks: achievements, cloud saves, rich presence and Steam Input |
| 71 | Steam Deck: controller-first UI, performance and Verified |
| 72 | Steam release: store page, build pipeline and wishlist runway |
| 98 | Huepfburg: a side-scrolling jump'n'run special room |

---

## Labels

Milestone: `M0`–`M10`.
Type: `engine`, `gameplay`, `content`, `art`, `audio`, `tooling`, `perf`, `infra`, `design`,
`a11y`, `feel`, `epic`.

The `roadmap` label marks the generated tracking issue. It is excluded from its own counts,
and only one open issue should ever carry it.

## The roadmap issue

[`.github/workflows/roadmap.yml`](../.github/workflows/roadmap.yml) runs
[`tools/roadmap/update-roadmap.mjs`](../tools/roadmap/update-roadmap.mjs) on every issue
event and regenerates the roadmap issue body from the live issue list.

- **Closing** an issue ticks its box and advances its milestone bar.
- **Opening** an issue adds it automatically. Label it `M0`–`M10` to file it under a milestone;
  without one it appears under **Needs triage** until labelled.
- **Relabelling** moves an issue between milestones.
- Milestone names, exit criteria, the critical path and which milestones are **parked** live in
  [`tools/roadmap/plan.json`](../tools/roadmap/plan.json) — edit that to change the page's shape.
  A milestone with a `parked` string renders with a ⏸️ marker, an explanation of why, and is
  excluded from the headline progress bar: deferred scope should not make the one number at the
  top of the page go down.

Preview locally without writing anything:

```bash
node tools/roadmap/update-roadmap.mjs --dry-run          # needs GITHUB_TOKEN + GITHUB_REPOSITORY
node tools/roadmap/update-roadmap.mjs --render fix.json  # fully offline, from a fixture
```

The rendered body is deterministic — no timestamps — and the script only writes when the body
actually changed, so the issue cannot edit-loop on itself.
