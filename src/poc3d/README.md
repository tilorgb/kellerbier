# 3D dungeon proof of concept

`npm run dev` → <http://localhost:5173/poc-3d.html> (`?seed=N` picks the start room).

The question this answers: can Kellerbier's 2D characters move through a **3D dungeon** — real
walls, real lights, real shadows, a thrown Maß that arcs — while the game still *plays* as the
same fixed-camera, one-room-per-screen bullet hell? The answer is yes, and it took no changes to
the simulation at all.

## What it is

| Layer                          | 2D game (`app/main.ts`)              | This POC (`poc3d/main.ts`)                                           |
| ------------------------------ | ------------------------------------ | -------------------------------------------------------------------- |
| Simulation                     | `sim/` — `GameSim`, 60 Hz            | **identical**, same class, same `step()`                             |
| Input                          | `app/input/` `InputSampler`          | **identical**                                                        |
| Frame loop                     | `app/loop.ts` `FixedTimestepLoop`    | **identical**                                                        |
| Content                        | `content/rooms/*.json`, enemy roster | **identical** (floor 1's `1x1` combat rooms, walked door to door)    |
| Presentation                   | PixiJS v8 sprites (`render/`)        | three.js scene (`poc3d/dungeon.ts`): meshes, lights, shadow map      |
| Sprites                        | Pixi textures cut from the atlas     | the same PNGs as three.js textures, frames selected by UV (`art.ts`) |
| Animation clips, facing, state | `render/animation/*`                 | **reused** — `resolveAnimationState`, `resolvePlayerHeading`, …      |

`sim/` never knew Pixi existed and still doesn't know three.js exists. That is `docs/TECH_STACK.md`
§4's layer rule paying off in the most literal way possible: the whole renderer was swappable.

## How the 2D game becomes a 3D room

- A sim position `(x, y)` in room units is a three.js `(x, 0, y)` on a floor plane at height 0.
  Every collider, door, spawn and block is where it always was. Nothing about movement, shooting,
  collision or doors changed, because none of it lives in the renderer.
- **Walls have height.** The back and side walls are 26 units tall, textured with the floor's own
  `cellar-wall` art; the wall facing the camera is a 5-unit kerb so it never hides the near rows.
  Door gaps are cut where `sim.doors` says they are; a locked door stands in the gap as a
  `door-closed` leaf, an open one is a dark passage with a warm glow from the next room.
- **Rocks are sprites.** A boulder drawn as a textured box read as a black crate, so
  `RoomGeometry.blocks` are one bottom-anchored `cellar-boulder-*` billboard per cell instead (the
  8 px overhang #283 authored is its height), mixed by the same per-cell hash as the 2D renderer.
  The illusion is enough to say "this blocks you"; collision is the sim's rectangle either way.
  `L`/`T` void cells stay wall-height boxes, because they *are* wall. Crate props are still boxes.
- **Characters are billboards.** Every authored sprite — Alois's facing strips and Schlauch, the
  Kellerassel strip, the static Bierratte, pickups, barrels — is a quad standing on the floor at the
  body's feet, leaning back to face the camera square-on so its projected size is exactly its
  authored pixel size (`docs/DECISIONS.md` #45). Frames come from the same `*.anim.json` clips the
  Pixi renderer plays, and a sprite casts a sprite-shaped shadow (alpha-tested depth material).
- **Lights are real.** A `bulb` decorative prop is now a point light on a cord (rooms without one get
  two by default), Alois carries a soft lantern, every live player shot carries its own point light,
  the hit flash is emissive, and a slick puddle is the one low-roughness surface in the room so the
  lights glint off it.
- **Shots arc.** The sim's projectiles are flat; the POC lifts a player shot on a parabola over its
  first ~50 ticks. Presentation only — where it *hits* is unchanged.
- **Fixed camera, same frame.** `V` cycles three presets: a 56° perspective that frames the room the
  way the 2D game does, a straight-down orthographic view that *is* the 2D game (a useful sanity
  check — it looks the same because it is the same data), and a lower 38° view for drama. The camera
  is fitted per room so a `1x1` fills the screen; a multi-cell room would follow the player the same
  way `render/view.ts` does today.
- **Pixel look preserved.** It renders at the internal 640×360 and upscales by an integer factor with
  nearest-neighbour, so texels stay ~1:1 with screen pixels. `R` toggles native resolution to see
  what smooth lighting at full res looks like.

## Findings

- **Zero simulation changes.** The POC is ~1,000 lines, all of it renderer. Nothing under `sim/`,
  `content/` or `app/` (other than a Vite entry) was touched. That is the strongest possible
  evidence that a full switch would be a `render/` rewrite, not a game rewrite.
- **The sprites work as-is.** No re-authoring: the same PNGs and the same `*.anim.json` sidecars, cut
  by UV instead of by Pixi. The "how big does this read" rule from #45 carries over exactly, because
  a billboard's world size is derived from the frame's pixel size the same way.
- **What got easier**, as hoped: lighting (a bulb prop is a light — one line), shadows (free from the
  shadow map, correct shape from the alpha-tested depth pass), height/arcs on thrown objects, glossy
  surfaces. Things the Pixi renderer does by hand today (`ambient-light.ts`, `ground-shadow.ts`,
  `bomb-flight-view.ts`) fall out of the scene for free.
- **What is not free**: everything HUD and screen-flow. `render/ui/` (pixel fonts, kit, title cards),
  the minimap, damage numbers, the vignette and Blaue Stunde overlay, the machine picker, the
  game-over/victory screens are all Pixi. They would either stay Pixi in a second canvas layered
  over the three.js one (cheap, and the HUD *should* be flat), or be redone as DOM/three.js.
- **Performance is the open question**, and this environment cannot answer it (headless Chromium
  runs SwiftShader at ~10 fps; a real GPU is needed). The budget in `docs/TECH_STACK.md` §3 is
  ≤ 12 ms a frame; a shadow-mapped scene with a handful of point lights and a few hundred
  alpha-tested billboards is well within a mid-range GPU's reach, but the draw-call row (≤ 20) would
  need to be re-baselined: one draw per billboard is the naive shape here, and would want
  instancing (one `InstancedMesh` per sheet) before a bullet hell's worth of sprites.
- **Sorting/transparency**: alpha-test (cutout) billboards need no sorting and cast shadows; anything
  that needs soft alpha (particles, the vignette) would be additive or unlit and drawn last.

## What is deliberately missing

No floor plan, minimap, HUD, items, audio, pause, game-over, or multi-cell rooms — all of that is
`app/main.ts`'s and would come across unchanged if this direction were taken. The door loop simply
cycles floor 1's three single-screen combat rooms.

## Controls

`WASD` move · arrows aim · `Space` fire · `E` bomb · `V` camera preset · `R` hi-res · `P` pause ·
`H` hide help. `window.__poc3d` exposes `{ sim, dungeon, loop, rooms }` for scripting.
