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
| `characters/` | `character` | 8-16 wide, exactly 16 tall (`~12×16` as authored) |
| `bosses/` | `boss` | up to 48×48 |
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
exactly like a static sprite would be.

## Projectile legibility

Every sprite dropped under a `projectiles/` folder has its brightest ("rim") pixel checked
against every colour legal on every floor, and the build fails if any pairing reads below a 3:1
contrast ratio — see `tools/art/contrast.mjs` for why checking the full palette stands in for
"every floor tileset" rather than one sampled screenshot.

## Building

- `npm run build:atlas` — builds once and prints a report (atlas count, sprite count, texture
  memory) without starting anything.
- `npm run dev` — builds once at startup, then rebuilds and reloads the page on every change
  under this folder. `npm run build` fails the same way on a palette, spec, or legibility problem.
