# Kellerbier — Backlog Index

> **Looking for live status?** The [roadmap issue](../../issues?q=is%3Aissue+label%3Aroadmap)
> is generated from the issue list and shows what is done and what is next. This file is the
> static index of the original planning backlog; the roadmap issue is the thing to check daily.

60 issues across ten milestones. GitHub milestones are not available through this repo's
tooling, so milestones are **labels** (`M0`–`M9`) plus a title prefix.

Filter by label: [`M0`](../../labels/M0) · [`M1`](../../labels/M1) · [`M2`](../../labels/M2) ·
[`M3`](../../labels/M3) · [`M4`](../../labels/M4) · [`M5`](../../labels/M5) ·
[`M6`](../../labels/M6) · [`M7`](../../labels/M7) · [`M8`](../../labels/M8) ·
[`M9`](../../labels/M9)

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
| 8 | Debug overlay (F1): frame graph, entity counts, hitbox display |
| 60 | Project conventions: CONTRIBUTING, definition of done, issue templates |

## M1 — Game feel

**The milestone that gates everything else.** Do not start M2 until #13 is right.

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
| 22 | Pickups: Maß, Biermarken, Böller, Schlüssel, food |
| 23 | Special rooms: Treasure, Shop, Boss, Secret |
| 24 | Room editor tool |

## M3 — Items and synergy

| # | Issue |
|---|---|
| 25 | Stat pipeline with traceable modifier sources |
| 26 | Item definition format and hook system |
| **27** | **Projectile tag system and tag composition** — the engine of replayability |
| 28 | Item pools, pedestals and pickup UI |
| 29 | Author the first 25 items |
| 30 | Synergy fuzz harness: crash, NaN and outlier detection |
| 59 | Expand the item pool toward 120+ (ongoing, runs parallel to M5–M6) |

## M4 — Promille

| # | Issue |
|---|---|
| 31 | Full tiers, Kater debuff and food |
| 32 | Sober/Rausch item gating and the Promille-gated item set |
| 33 | Accessibility: sway toggle, no-drift mode, neutral reskin |

## M5 — Floors 1 & 2

Sets the quality bar every later floor must match.

| # | Issue |
|---|---|
| 34 | Art pipeline: atlas packing, palette discipline, legibility test |
| 35 | Floor 1 — Der Keller (also the tutorial) |
| 36 | Boss — Die Große Kellerassel |
| 37 | Floor 2 — Dorf & Acker |
| 38 | Boss — Der Stier and the Maibaum-Dieb |

## M6 — Floors 3–7

Epics. Break each into sub-issues when scheduled. **This is where the schedule goes wrong** —
build the tooling in M2/M3 so this becomes authoring rather than engineering.

| # | Issue |
|---|---|
| 39 | Floor 3 — Der Wald and Die Wilde Gjoad |
| 40 | Floor 4 — Die Alpen and Der Watzmann |
| 41 | Floor 5 — Schloss Neuschwanstein and König Ludwig II |
| 42 | Floor 6 — Die Brauerei and Die Abfüllanlage |
| 43 | Floor 7 — Die Wiesn and Die Bavaria |
| 44 | Secret areas: Walhalla and Der Teufelstritt |

## M7 — Meta-progression

| # | Issue |
|---|---|
| 45 | Save system with versioned migrations |
| 46 | Stammtisch hub and the unlock system |
| 47 | Additional playable characters |
| 48 | Seeded runs, daily run and replay recording |
| 49 | Curses, Teufelspakt and Klostersegen |
| 50 | Challenge runs and Wiesn-Orden achievements |

## M8 — Polish

| # | Issue |
|---|---|
| 51 | Blaskapelle soundtrack and full SFX pass |
| 52 | Localisation: English, German and Boarisch |
| 53 | Settings, menus and the full accessibility suite |
| 54 | Balance pass with playtest telemetry |
| 58 | Story delivery: chapter cards, boss plates and flavour text |

## M9 — Release

| # | Issue |
|---|---|
| 55 | Legal review of names, landmarks and trademarks |
| 56 | Web release build, itch.io page and trailer |
| 57 | Optional: Tauri desktop packaging |

---

## Suggested first sprint

Everything in M0 is unblocked and can proceed in parallel after #1. The critical path to
something playable is:

**#1 → #2 → #3 → #9 → #10 → #11 → #13**

At that point there is a lad in a room shooting beer, and the most important question in the
project — *is this fun?* — becomes answerable.

## Labels

Milestone: `M0`–`M9`.
Type: `engine`, `gameplay`, `content`, `art`, `audio`, `tooling`, `perf`, `infra`, `design`,
`a11y`, `feel`, `epic`.

Labels were auto-created by the API without colours; assigning colours and descriptions is
part of #60.

The `roadmap` label marks the generated tracking issue. It is excluded from its own counts,
and only one open issue should ever carry it.

## The roadmap issue

[`.github/workflows/roadmap.yml`](../.github/workflows/roadmap.yml) runs
[`tools/roadmap/update-roadmap.mjs`](../tools/roadmap/update-roadmap.mjs) on every issue
event and regenerates the roadmap issue body from the live issue list.

- **Closing** an issue ticks its box and advances its milestone bar.
- **Opening** an issue adds it automatically. Label it `M0`–`M9` to file it under a milestone;
  without one it appears under **Needs triage** until labelled.
- **Relabelling** moves an issue between milestones.
- Milestone names, exit criteria and the critical path live in
  [`tools/roadmap/plan.json`](../tools/roadmap/plan.json) — edit that to change the page's shape.

Preview locally without writing anything:

```bash
node tools/roadmap/update-roadmap.mjs --dry-run          # needs GITHUB_TOKEN + GITHUB_REPOSITORY
node tools/roadmap/update-roadmap.mjs --render fix.json  # fully offline, from a fixture
```

The rendered body is deterministic — no timestamps — and the script only writes when the body
actually changed, so the issue cannot edit-loop on itself.
