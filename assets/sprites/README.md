# Sprite assets

Source art for the atlas build (#34). Nothing under here is loaded by the game directly — the
build step in `tools/art/` packs it into `assets/atlases/` (generated, gitignored), which is
what the renderer will eventually load. Adding a sprite is dropping a file in the right folder;
the atlas rebuilds automatically, in `npm run dev` and in `npm run build` alike.

## Layout

```
assets/sprites/
  common/                 # shared across every floor — UI-adjacent icons, generic pickups
  floor-1-cellar/         # Der Keller
  floor-2-rural/          # Dorf & Acker
  floor-3-wald/           # Der Wald
  floor-4-alpen/          # Die Alpen
  floor-5-schloss/        # Schloss Neuschwanstein
  floor-6-brauerei/       # Die Brauerei
  floor-7-wiesn/          # Die Wiesn
```

Each of those has four subfolders, one per sprite category:

| Folder | Category | File size (simulation units, not screen pixels) |
|---|---|---|
| `tiles/` | `tile` | exactly 16×16 |
| `characters/` | `character` | 8-32 wide, 16-32 tall (`~12×16` as authored, see `docs/DECISIONS.md` #26) |
| `bosses/` | `boss` | up to 160×160 (see `docs/DECISIONS.md` #26) |
| `projectiles/` | `projectile` | up to 16×16 |

Sizes are **file** pixels. The room is drawn at `WORLD_ZOOM` (`src/render/resolution.ts`), so a
16×16 tile lands on screen at 32×32 — see issue #34's comment thread and
`docs/CONTENT_BIBLE.md` §5 for the history of that distinction.

## Palette

`docs/CONTENT_BIBLE.md` §5 caps the whole game at roughly 40 colours: a small neutral set (black,
near-black, mid grey, white) available everywhere, plus five colours per floor that are *only*
legal on that floor's own bucket. `common/` may use the full master palette. The exact values live
in `tools/art/palette.mjs`, next to the floor moods they were drawn from.

Any opaque pixel outside the allowed set for its bucket fails the build, naming the file and the
offending pixel's coordinates and colour.

## Animation

A static sprite is a plain `name.png`. An animated one is a horizontal frame strip,
`name.strip.png`, plus a sidecar `name.anim.json` next to it:

```json
{ "frames": 4, "frameDurationMs": [120, 120, 120, 120], "loop": true }
```

`frameDurationMs` may also be a single number shared by every frame. The strip's width must
divide evenly by `frames`, and each resulting frame is checked against its category's size spec
exactly like a static sprite would be. A name authored *both* ways — `name.png` and
`name.strip.png` side by side — fails the build: the two would pack under the same atlas key and
nothing could say which one the game meant.

### Clips

Those three fields describe the strip. What the game *plays* is a **clip**, and clips are the
optional `clips` map in the same sidecar — one per animation state, each a frame list over the
strip with its own timing:

```json
{
  "frames": 8,
  "frameDurationMs": 120,
  "loop": true,
  "clips": {
    "idle": { "frames": [0, 1], "frameDurationMs": 420, "mode": "pingPong" },
    "move": { "frames": [0, 1, 2, 3], "frameDurationMs": 110, "mode": "loop" },
    "hurt": { "frames": [4], "frameDurationMs": 90, "mode": "once", "onEnd": "idle" },
    "death": { "frames": [5, 6, 7], "frameDurationMs": 110, "mode": "once", "onEnd": "hold" }
  }
}
```

| Field | Meaning |
|---|---|
| `frames` | frame indices into the strip, in play order. Any order, repeats allowed |
| `frameDurationMs` | one number for the clip, or one per entry in `frames` |
| `mode` | `loop`, `once`, or `pingPong` (plays back down through the middle frames) |
| `onEnd` | `once` clips only: `hold` the last frame, or hand back to `idle` |

The states are fixed — `idle`, `move`, `telegraph`, `hurt`, `death` — because each one is derived
from simulation state the renderer already computes (`src/render/animation/state.ts`). A clip
named anything else, or one pointing at a frame index the strip does not have, fails the build.

**`idle` is required** whenever `clips` is present: a state with no clip authored yet falls back
to `idle` and warns once in a dev build (`docs/DECISIONS.md` #19), so it is the one clip that
cannot itself be missing. A sidecar with no `clips` at all is still legal and still animates —
the whole strip becomes one looping `idle` clip at the strip's own timing.

### Directions, and the player's strips

The state list is also what decides how a character facing more than one way is filed. "The same
walk, facing the other way" is not a clip — the state names are fixed so that a clip nothing
plays is a typo — so it is another **strip**. Alois (`docs/DECISIONS.md` #38) is the worked
example, and everything in `common/characters/` is his:

| File | What it is |
|---|---|
| `alois-south.strip.png` | walking toward the camera |
| `alois-north.strip.png` | walking away |
| `alois-side.strip.png` | side-on, authored facing left and mirrored for the other way |
| `alois-drunk-*.strip.png` | the same three, leaning, from Beduselt up |
| `alois-schlauch.strip.png` | the Trink-Rucksack's hose, in its eight aim directions |

Two things about that last one. It is a frame **table**, not a timeline: the game indexes it by
aim octant (0-7 resting, 8-15 with a shot just fired) and never plays it, so its sidecar authors
no `clips` at all — which is legal, and honest. And it is why the body only needs four
directions: where Alois is *aiming* is carried by the hose, so where he is *walking* is all the
body has to say.

The drunk strips author `idle` and `move` only, on purpose — a flinch is a flinch — and
`render/player-view.ts` asks the sober strip for `hurt` and `death` rather than letting the
fallback below turn a drunk death into a drunk idle.

Four frames of walk cycle is the house budget (`docs/DECISIONS.md` #37); `WALK_CYCLE_FRAMES` in
`tools/art/spec.mjs` is where that number lives and why.

## What each folder is for, beyond the size spec

A category is a size contract, not a taxonomy, so a few things live somewhere that needs saying
out loud. `render/floor-art.ts` discovers all of it by glob — adding a sprite is dropping a file
in a folder, at runtime as well as in the atlas build — and looks each one up by **name**:

| Where | Named | Looked up by |
|---|---|---|
| `<floor>/characters/<enemy id>` | `kellerassel`, `bauer`, … | `EnemyDefinition.id` |
| `<floor>/bosses/<enemy id>` | `grosse-kellerassel`, `der-stier` | `EnemyDefinition.id` — a boss is a roster entry like any other, so its strip lands in the same map |
| `common/characters/pickup-<pickup id>` | `pickup-mass-full`, … | `PickupDefinition.id` |
| `common/characters/<enemy id>` | `shopkeeper` | an enemy that appears on every floor |
| `common/characters/alois-*` | the player's seven strips | `render/player-art.ts` (#151) |
| `<floor>/tiles/*` | `cellar-wall`, `rural-hedge-block`, … | `FLOOR_TILESETS` (the wall/lip/block/floor roles) and `PROP_TILE_NAMES` (a room's `decorativeProps`) |
| `common/tiles/*` | `door-open`, `pedestal`, `minimap-boss`, `crate-opa`, … | shared world objects and HUD icons |
| `<floor>/projectiles/*` | `tap-drip`, `boeller`, … | `FiringBehaviourBase.art`, or the floor's default shot |
| `common/projectiles/*` | `beer`, `beer-burning`, … | the player's shot and its per-tag variants |

Two rules follow from that table rather than from the size spec:

- **A prop shared by templates that span floors must be `common`.** Every generic Der Keller
  template is tagged `cellar, rural` alike, so a cellar-palette prop placed in one appears on
  floor 2 off that floor's palette. The two set-piece crates are `common` for exactly this reason
  (`docs/DECISIONS.md` #40).
- **A sprite nobody looks up costs one atlas entry and no code**, so an unused name is harmless —
  but `tests/content/sprite-coverage.test.ts` fails on the reverse: content that names art nobody
  has drawn.

## Projectile legibility

Every sprite dropped under a `projectiles/` folder has both its brightest ("rim") and darkest
("outline") opaque pixel checked against every large-area background colour legal on every floor
it can appear on, scoring each background against whichever end reads better against it. The build
fails if any pairing reads below a 3:1 contrast ratio.

**Author every projectile with a dark outline and a bright core.** That is not a style note, it is
what passes: nothing bright reads on Die Alpen's snow and nothing dark reads on Der Wald's black,
so a shot that appears on more than one floor needs both ends. `docs/DECISIONS.md` #39 has the
palette search showing there is no single colour that clears all seven, and
`tools/art/contrast.mjs` has the reasoning for why checking the palette stands in for "every floor
tileset" rather than one sampled screenshot. The same check runs live in the pixel editor's
legibility panel while you draw.

## Building

- `npm run build:atlas` — builds once and prints a report (atlas count, sprite count, texture
  memory) without starting anything.
- `npm run dev` — builds once at startup, then rebuilds and reloads the page on every change
  under this folder. `npm run build` fails the same way on a palette, spec, or legibility problem.
