# Kellerbier — Performance Audit (M6 renderer)

**Question asked:** the game stutters when switching rooms, and the worry is that it gets worse as
content lands. Audit the chosen tech; a full stack switch is an allowed outcome.

**Verdict: keep the stack.** Nothing measured here is a limit of TypeScript, three.js or WebGL2.
The simulation has roughly 2× headroom against its own budget. The room-transition stutter is a
handful of specific three.js *usage* problems inside `src/render/world/`, every one of them with a
local fix. A switch to Godot, Rust/WASM or WebGPU would re-solve the same problems at the cost of
this project's whole verification story (headless bench, playable PR preview, three in-repo
editors) and would not make the transition frame cheaper, because the transition frame is not
GPU-bound — it is spent creating and destroying objects.

The rest of this document is the evidence, then the ranked findings, then a plan.

---

## 1. How this was measured

Two harnesses, both reproducible:

- **Node/Vitest**, driving `Scenery` and `compileRoomTemplate` directly against the real room
  templates and the real floor tilesets, counting the meshes, materials, geometries and textures a
  room load constructs.
- **Headless Chromium via Playwright** against `npm run dev`, with `WebGL2RenderingContext`
  instrumented (`compileShader`, `linkProgram`, `deleteProgram`, `createTexture`, `deleteTexture`,
  `createBuffer`, `bufferData`, `drawElements`), plus `renderer.info`, `renderer.info.programs`
  (including each program's `cacheKey`), and `WebGLShadowMap.render` wrapped to attribute draws to
  the shadow pass. Rooms were switched both by playing (`n`) and by calling `sim.loadRoom` for
  every authored template on both floors, twice, so first-visit and revisit costs separate.

**Caveat on milliseconds.** The browser ran on SwiftShader (software WebGL, ~9–12 fps), and the
Node numbers came off a server CPU. Absolute times here are *not* what a player's machine does.
What is machine-independent — and what every finding below is actually built on — is the **work**:
draw calls, shader compiles and links, GL objects created and destroyed, bytes re-uploaded,
`info.memory` growth. Shader *link* cost in particular is a real-driver cost this environment
cannot measure, which is why finding **F1** is ranked first on mechanism rather than on a stopwatch.

`docs/DECISIONS.md` #74 already says GPU cost is unverified in CI and the draw-call budget row has
never been re-baselined. This audit is that gap, filled.

---

## 2. What the simulation costs (the part that is fine)

From `bench/history.jsonl`, latest run on `main` (`c489452`), 5,000 projectiles + 200 enemies +
1,000 particles:

| Metric | Measured | Budget (`TECH_STACK.md` §3) |
|---|---|---|
| Simulation tick, median | **1.93 ms** | ≤ 4 ms |
| Sim + render sync, median | **3.07 ms** | ≤ 12 ms |
| Heap per tick | 43.7 KB | ≤ 512 KB (and it is V8 boxing doubles, not game garbage) |

The Structure-of-Arrays / pooling / spatial-hash discipline worked. **No part of the game logic is
asking to be rewritten, moved to WASM, or moved to another language.** Every finding below is on
the render side.

---

## 3. What a room transition actually does

Measured per `sim.loadRoom`, touring every authored template on floors 1 and 2, twice
(so rows in the second pass are rooms whose shaders and textures were already built once):

| Per room load | Measured |
|---|---|
| Meshes constructed | 37–50 |
| **Materials constructed** | **69–98** |
| Geometries constructed | 37–50 |
| Distinct `THREE.Texture` objects on those materials | 49–70 |
| GL buffers created / destroyed | ~130–200 / ~130–180 |
| Geometry re-uploaded (`bufferData`) | 41–142 KB |
| GL textures destroyed / re-created | 3–6 / 3–11 |
| **Shader programs deleted** | **2–6** |
| **`compileShader` calls** | **4–8** |
| **`linkProgram` calls** | **2–4** |
| `GameView.sync` cost, transition frame | **1.3–4.7 ms** (steady frame: **0.2 ms**) |

Those shader numbers are the important ones, and they are the *steady* numbers: relinking still
happens on the fourth visit to the same room, forever. It is not a warm-up cost.

During the transition slide the scene holds both rooms: **95 → 136 meshes and 15 → 19 point
lights** for the ~1 s slide, dropping back to 94 meshes / 16 point lights when the outgoing room
is disposed. So the point-light count changes **twice per crossing**.

---

## 3a. Re-measured after #291: the hitch moved, it did not go

#291 ("prewarm the next room") built the incoming room's `Scenery` during #289's crossing dwell
and warmed the whole floor's scenery programs behind the floor title card. **It works for the
frame it targeted** — and it does not fix F1, because it treats where the compile *lands* rather
than why there is a compile at all.

Re-measured on `cea8b31`, replaying the real sequence `app/main.ts` performs
(`prewarmRoom` → dwell → `confirmPrewarmedEntry` → `sim.loadRoom`) for every authored template on
both floors, twice. The numbers below are the **second** pass — every room already visited once,
the boot warm queue long since drained — so nothing here is a warm-up cost:

| Phase of a crossing | `compileShader` | `linkProgram` | `deleteProgram` | `GameView.sync` |
|---|---|---|---|---|
| **Dwell** (player pressing into the door) | 182 total, **median 4** | 91 total, **median 2** | 36 | — |
| **Switch frame** | 48 total, **median 0** | 24 total, **median 0** | 36 | 0.4–3.1 ms |
| **Slide end** (~1 s later, outgoing room disposed) | 224 total, **median 8** | 112 total, **median 4** | 154 | — |

*(30 crossings. Steady-state `sync` for comparison: 0.1 ms.)*

Read that as three statements:

1. **The switch frame is genuinely fixed** — median zero compiles. Credit where it is due. Six of
   the thirty crossings still paid 4–8 compiles and up to 14 program deletions there, with `sync`
   spikes of 2.5–3.1 ms, but the common case is clean.
2. **Some of it moved onto the dwell frame** — median 4 compiles / 2 links on *every* approach,
   plus 41–149 KB of buffer uploads. #291's own commit message predicts this ("onto the dwell
   frame, where a driver without `KHR_parallel_shader_compile` still blocks ~100–400 ms while the
   player presses the door"). To a player that is not a freeze on the switch; it is a door that
   feels sticky, or input that feels dropped, in the moment before it opens.
3. **Most of it moved to about a second later.** When the transition slide ends and
   `outgoingScenery.dispose()` runs, the last user of those materials' programs goes with it
   (`deleteProgram`) and the point-light count drops back — and the whole lit program set relinks:
   **median 8 compiles / 4 links, on every crossing, forever.** That lands just as the camera
   settles into the new room, which is a very plausible fit for "it still does not feel right".

The point-light oscillation is visible in the same run: **15–17 point lights in a settled room,
19–21 during the slide** while both rooms are in the scene. Twice per crossing, every crossing.

Two things also got slightly worse, both consequences of F5 now running more often:

- The leak (**F4**) is untouched and now fires on the dwell as well, because `prewarmRoom` builds
  and disposes a `Scenery` of its own: `info.memory.geometries` **100 → 269** and `.textures`
  **39 → 69** over 60 crossings.
- The program cache grew **26 → 93** across the run rather than plateauing — each light-count
  variant × material shape is another key.

**Conclusion: the prewarm is worth keeping, and it is not a substitute for F1/F2/F4/F5.** Fix the
point-light count and stop disposing materials, and the prewarm stops having anything to prewarm.

---

## 3b. Re-measured after #292/#293/#294: it still relinked, and the count still moved

The user's report after all of tier 1-3 had landed: "the game often stutters or gets stuck for
almost multiple seconds" on a room switch. Re-measured the same way as §3a — headless Chromium on
SwiftShader, a real walk into each door (teleport to the threshold, hold the direction key through
#289's dwell), every crossing after the first pass through a room — with one addition: every frame
that linked a program also recorded `renderer.info.programs`' cache keys before and after, so the
*parameter* that changed could be read off the key rather than guessed.

| Per crossing, before this fix | Measured |
|---|---|
| `compileShader` / `linkProgram` on the dwell or switch frame | **4–40 / 2–20**, on almost every crossing |
| Time inside `getProgramInfoLog`/`getShaderInfoLog` (the blocking link) | **0.6–2.4 s** per crossing (SwiftShader; a real driver is faster, but it is the same synchronous link, and D3D's HLSL compiler under ANGLE is the slow case players hit) |
| Programs held by the renderer | **80 → 150 over 14 crossings**, never plateauing |
| `numPointLights` in the linked programs' cache keys | **16, 17, 20, 21, 22, 23, 24, 26** — eight distinct values |

Three causes, each of which #292's "constant point-light count" and #291's "warm at boot" were
meant to have removed, and each of which they missed by one step:

1. **The door glows were pooled but parented.** `DoorPiece` claimed a `PointLight` from
   `Lighting`'s fixed pool — and then added it as a child of its own group so it would ride the
   transition slide. #293's `SceneryCache` keeps a visited room *detached* rather than disposed,
   and detaching the group took its doors' glows out of the scene graph with it. three.js only
   counts the lights it can traverse to, so `numPointLights` was "the pool, minus every glow held by
   a cached room, plus the outgoing room's during the slide": a different number after almost every
   crossing, and every lit program relinked for each new value. `tests/unit/lighting-pool.test.ts`
   counted with `traverse` over a scene the rooms were never removed from, so it kept passing.
2. **The pedestal and machine lights were never pooled.** `PedestalView` made a `PointLight` per
   slot under a group it hides when the room has no pedestal there; hidden subtrees are skipped by
   the light traversal too. Treasure room, shop, machine room — each a different count.
3. **The warm compiled the wrong program set.** `warmSceneryGroup` rendered the incoming room into
   a 1×1 `WebGLRenderTarget`. A render target's `outputColorSpace` is linear; the canvas is sRGB;
   the colour space is part of the program cache key. So #291's dwell-frame warm paid to link a
   `srgb-linear` variant of every material and the switch frame then linked the `srgb` one it
   actually draws with. The boot-time floor warm did the same, for every room on the floor.

And underneath all three, the mechanism F1 named: three.js reference-counts programs per material,
so with the count finally constant, any room whose disposal took a program's count to zero (a
billboard's tinted material, a door leaf's, a floor sprite's — the per-instance ones
`MaterialCache` does not hold) would still relink it on the next room that needed it.

**Fix, in `src/render/world/`** (`docs/DECISIONS.md` #80):

- Glows stay at the scene root for good; `DoorPiece.placeGlow` positions them in world space and
  `Scenery.attach`/`detach`/`setOffset` carry a room's glows with its slide shift and darken them
  while the room is cached off screen. `Lighting` grows a second pool, `MAX_PROP_LIGHTS`, for the
  pedestal and machine beams, driven the same way.
- `ProgramPins` (`world/program-pins.ts`) bumps every linked program's `usedTimes` once, so no
  material disposal can ever delete one.
- The warm renders into the canvas under a 1×1 scissor instead of a render target; the first
  `render` runs `renderer.compile` over the persistent layers (bodies, pickups, particles, decals,
  telegraphs, pedestal slots — each now seeded with one hidden instance so there is something to
  compile), and `ProgramPins.settle` forces those deferred links to complete a couple per frame
  behind the floor card, so their first draw is not a first link either.
- `tests/unit/lighting-pool.test.ts` now counts with `traverseVisible` — what three counts — across
  detached rooms, hidden pedestal slots, a slide and a cached revisit, through the real `GameView`.

| Per crossing, after | Measured |
|---|---|
| `compileShader` / `linkProgram`, every crossing after the run's first | **0 / 0** (24 crossings, both floors' room types) |
| Programs held by the renderer | **19–22**, flat |
| `numPointLights` | **25**, always (1 lantern + 8 shot + 10 door glows + 3 bulbs + 3 prop; 35 before the pools were sized to measurement) |
| `GameView` JS time on the switch frame | **12–24 ms** under SwiftShader, from 600–2,400 ms |

The first cut fixed the count at 35 — the pools sized for the worst room plus four cached ones —
because a constant 35 costs a fixed per-fragment loop where a varying 16–26 cost a relink of every
shader. The follow-up then sized the pools to the measurement: a door claims its glow only while
its room is on screen, so the glow pool covers the worst *adjacent pair* of rooms (9 doors across
300 generated floors) rather than the cache; bulbs and prop lights dropped to the authored maximum
plus one. 25 lights, and a settled room under SwiftShader went from 4.2 to 5.5 fps — directional,
not a player's number, but the per-fragment cost moved by about the light count.

## 4. Findings, ranked

### F1 — Shader programs are destroyed and relinked on every room transition

**Evidence:** 2–6 `deleteProgram`, 4–8 `compileShader`, 2–4 `linkProgram` on *every* room load,
including repeat visits. 46 distinct program cache keys accumulated over a 60-room tour, oscillating
±4 as rooms swapped.

**Mechanism, two parts.** First, the room is rebuilt from brand-new `Material` instances each load
(`Scenery`'s constructor) and the old ones disposed; three.js reference-counts programs per material,
so disposing the last user of a program calls `gl.deleteProgram`, and the next room — needing the
identical program — compiles and links it from source again. Second, `numPointLights` is part of
three.js's program cache key (`getProgramCacheKeyParameters`, and `NUM_POINT_LIGHTS` is a `#define`
in the generated GLSL), and the point-light count changes twice per crossing as the outgoing room's
door glows enter and then leave the scene. Every change invalidates every lit material's program.

**Why this is the stutter.** `gl.linkProgram` + the first `getProgramParameter(LINK_STATUS)` is the
most expensive synchronous call a GL driver offers. A `MeshStandardMaterial` program with shadow
mapping and ~20 point lights is a large shader; tens of milliseconds per link on real drivers is
ordinary. Two to four of those on the frame the room swaps is a visible hitch, and Chrome's on-disk
program cache does not help — the link still happens in-frame.

**Fix:** (a) make the point-light count constant — pool the per-door glows and the bulbs to a fixed
maximum and drive `intensity`, never add/remove lights; (b) reuse materials across rooms via a
per-floor cache keyed by tileset + material shape, so nothing gets disposed and relinked;
(c) warm the program set once at boot rather than per room.

**Status after #291:** (c) is done, thoroughly — see §3a. The switch frame is clean. (a) and (b)
are untouched, which is why the compile still happens: it just happens on the dwell frame and, at
median 8 compiles per crossing, when the slide ends and the outgoing room is disposed.

**Status after #80 (`docs/DECISIONS.md`):** closed — see §3b. (a) holds for real now that glows and
prop lights stay at the scene root; (b) is done not by caching materials but by pinning programs
(`world/program-pins.ts`), which covers the per-instance materials a cache never would; (c)'s warm
now compiles the variants the canvas actually draws. Zero links per crossing after the first.

### F2 — The room is rebuilt from scratch instead of re-dressed

**Evidence:** the whole table in §3. ~150 GL buffer objects churned, up to 142 KB of geometry
re-uploaded, and a `GameView.sync` that costs 1.3–4.7 ms against a 0.2 ms steady frame — a 10–25×
spike in pure JavaScript, on a fast CPU, before any GL work. That is also a GC spike arriving at
exactly the wrong moment.

**Fix:** a persistent `Scenery` that re-dresses rather than reconstructs — a pool of wall boxes
whose transforms and UVs are rewritten, one floor geometry whose attribute buffers are rewritten in
place, pooled billboards for blocks and props. This is the same pooling discipline `sim/` already
lives by, applied to `render/world/`.

### F3 — Every wall run costs six materials and six draw calls

`tiledBox` (`world/scenery.ts`) builds a six-material `BoxGeometry` per wall run and per void rect,
each face carrying its own `tilingTexture(...)` clone. This is why a 38-mesh room reports **86
materials**, and why the room pass costs 87–153 draw calls. Four of the six faces are never visible
from a fixed 65° camera.

**Fix:** one merged wall geometry per room with baked UVs and a single material. Walls go from ~60
draw calls to 1, and the per-room texture clones — and most of F1's program churn — disappear with
them.

### F4 — Confirmed resource leak, ~2.3 geometries and ~0.5 textures per transition

**Evidence:** over 60 room loads that revisited the same 15 rooms twice,
`renderer.info.memory.geometries` climbed **129 → 306** and `.textures` **37 → 87**, monotonically.

**Cause:** `Lighting.onRoomChanged` calls `this.roomLights.clear()`. `Object3D.clear()` detaches
children; it disposes nothing. Every bulb leaks a `SphereGeometry`, a `CylinderGeometry` and two
materials; every daylight room additionally leaks a `PlaneGeometry`, a `MeshBasicMaterial`, a
`MeshDepthMaterial` and a freshly-built **256×256 `CanvasTexture`** (`cloudTexture()` runs per
room load).

**Fix:** pool the bulb rig and the cloud; build the cloud texture once at module scope.

### F5 — `Scenery.dispose` destroys textures it does not own

`disposeMeshes` calls `material.map?.dispose()` on every mesh under the group. The floor-variant
meshes and the flat props point their `map` at the **shared** tile textures owned by `FloorArt`. So
every room transition deletes the floor's tile textures from the GPU and the next room re-uploads
them — the measured 3–6 `deleteTexture` / 3–11 `createTexture` per load.

**Fix:** dispose only what the scenery created (the `tilingTexture` clones), or — once F3 lands —
create none.

### F6 — The shadow map is 2048², redrawn every frame, and contains nothing that moves

**Evidence:** the shadow pass costs **~60 draw calls per frame**. Adding 100 bodies to the room
changed that from 60.3 to 56 — i.e. **standing sprites are not in the shadow map at all.**

**Cause:** `GameView.render` moves every actor onto `ACTOR_LAYER` before pass one, and three.js's
shadow pass filters casters by the *viewing* camera's layers (`renderObject` tests
`object.layers.test(camera.layers)` against the view camera, not the shadow camera). Pass one's
camera is on layer 0, so actors are excluded; passes two and three have `shadowMap.autoUpdate` off,
so no shadow render happens there either. `DECISIONS.md` #74 states that sprites still cast — they
do not.

Separately, the map is 2048×2048 = **4.19 Mpx, 18× the game's own 640×360 frame**, re-rendered
every frame for content that is static within a room.

**Fix:** two decisions. (1) Whether sprites should cast — a visual call; if yes it needs a
restructure, since naively re-enabling it puts one shadow draw per body back on the frame. (2)
Regardless: drop the map to 512–1024 (a 640×360 frame cannot show more), set
`shadowMap.autoUpdate = false` globally, and set `needsUpdate = true` on room change and while a
door swings or the cloud drifts. A/B in the harness: 2048 → 512 → shadows off measured 8.7 → 10.7
→ 12.0 fps under SwiftShader (direction real, magnitude not).

### F7 — 19–21 point lights in the shader for every lit pixel

1 lantern + `SHOT_LIGHT_COUNT` (8) + the room's bulbs + one `PointLight` per door, most of them at
intensity 0 or far out of range. `MeshStandardMaterial` loops over all of them per fragment
regardless.

**Fix:** cut `SHOT_LIGHT_COUNT`, replace the per-door glow with an emissive quad, and keep the
total fixed — which F1 needs anyway.

**Status after §3b:** the total is fixed, and then cut to 25 by claiming door glows per attach
instead of per lifetime and sizing every pool to its measured ceiling plus one
(`tests/unit/lighting-pool.test.ts` pins the ceilings). The emissive-quad replacement for the
glows is the remaining lever, and it is a visual change that needs its own sign-off.

### F8 — One draw call per standing body, and 113 separate sprite textures

**Evidence:** spawning bodies into a room grew the actor pass from **12 to 212 draw calls** as 200
enemies were added — exactly linear, one draw per body. Total frame cost went 195 → 377 draw calls
for under 3,000 triangles.

**Cause:** each body is its own `Mesh` with its own material bound to its own texture, because the
runtime loads **113 individual PNGs**. `assets/atlases/` already packs all 110 sprites into three
sheets (110 KB total) and the runtime never reads them — `DECISIONS.md` #74 deliberately keeps the
atlas a packing artefact.

**Fix:** load the atlas at runtime, then make bodies one `InstancedMesh` per sheet with per-instance
UV offsets — the trick `ProjectileView` already uses. The budget scene's actor pass goes from ~212
draw calls to ~2, and boot goes from 113 requests to 3.

### F9 — Minor: the destination template is compiled on every tick the player touches a door

`GameSim.transitionTo` calls `compileRoomTemplate` *before* its `pressingToward` and dwell checks,
and `loadRoom` compiles the same template again on success. Measured at **0.008–0.068 ms** per
compile, so this is not the stutter — but it is two compiles per crossing and one per tick of
standing in a doorway, and it will matter as templates grow.

---

## 5. The scaling question

The concern in the prompt is the right one, and it has a precise shape.

| What grows | What it costs today |
|---|---|
| More bodies on screen (elite variants #156, bigger rosters) | **+1 draw call per body**, linear and uncapped (F8) |
| More floors, each with its own tileset and light rig | more material shapes → more program cache keys → more first-encounter links (F1) |
| More authored bulbs / doors per room | another point-light count → another full program-set relink (F1/F7) |
| More rooms per floor | more transitions, each leaking ~2.3 geometries (F4) and relinking shaders (F1) |
| Bigger / multi-cell rooms | more wall runs, at 6 draw calls each (F3) |
| A longer run | the leak (F4) is unbounded in run length |

At 640×360 the GPU has almost nothing to rasterise — under 3,000 triangles a frame. **The game is
draw-call- and state-churn-bound, not fill- or geometry-bound.** That is exactly the class of
problem that a faster language or a different engine does not fix and that fewer draw calls and
fewer per-room objects fix completely.

---

## 6. Why not switch the stack

| Option | Assessment |
|---|---|
| **Stay on three.js** *(recommended)* | Every finding above has a local fix in `src/render/world/`. `renderer.info` and `renderer.info.programs` are what made this audit possible in an afternoon; they are also what will gate it in CI. |
| **Godot 4** | Would re-solve these same problems (its own version of F8 is a node per entity) and costs headless determinism tests, the CI frame-time bench, the playable PR preview, and the room/pixel/audio editors. `TECH_STACK.md` §2 already argued this; nothing measured here weakens it. |
| **Rust/WASM for the hot loop** | Raises a ceiling the game is nowhere near. The only part it would help — the simulation — has 2× headroom (§2). The typed-array seam is already designed in; keep it as the escape hatch it was meant to be. |
| **Back to PixiJS / 2D** | Deletes the real lighting that decision #74 was made *for*. If the 3D room is ever judged not worth its cost, that is an art decision, not a performance one. |
| **WebGPU (`three/webgpu`)** | Genuinely cheaper draw submission and state changes — but it makes wasteful submission cheap rather than removing it, and costs browser support plus a renderer port. Revisit only if ~200 draw calls still hurt *after* the work below. |

---

## 7. Plan

### Tier 1 — the stutter (days, low risk, no visual change)

1. **F4** — pool the bulb rig and the cloud; build the cloud texture once. Stops the leak.
2. **F5** — stop disposing shared tile textures.
3. **F1a/F7** — fix the point-light count so it never changes: pool door glows and bulbs to a
   constant maximum, drive intensity. This alone should remove most per-transition relinking.
4. **F6** — shadow map to 512–1024, `autoUpdate = false` with explicit `needsUpdate`. Decide the
   sprite-casting question first, since it is a visual regression either way.
5. **F1c** — `renderer.compileAsync` at boot, so no program's first link lands on a transition.

### Tier 2 — the transition frame (about a week, medium risk)

6. **F3** — merge walls and voids into one geometry and one material; delete `tilingTexture`.
7. **F1b/F2** — per-floor material cache, and a persistent `Scenery` that re-dresses.
8. Reconsider the slide holding a second live `Scenery` — a static snapshot of the outgoing room
   would do the same job at a fraction of the cost.
9. **F9** — hoist the pre-check compile behind the dwell gate, and reuse the compiled result.

### Tier 3 — the content ceiling (decides how M9/M10 scale)

10. **F8** — load the atlas at runtime; instance the bodies.
11. Re-baseline `TECH_STACK.md` §3's draw-call row, "pending" since #74, against the result.

### CI, so none of this comes back

The bench is headless and honestly reports `drawCalls: null`. Everything in this audit came from
Playwright against the preinstalled Chromium with a SwiftShader context, and the **counts** it
yields are hardware-independent and make excellent gates. Suggested `tests/perf/room-transition`:

- zero net growth in `info.memory.geometries` / `.textures` across 20 transitions (F4/F5);
- zero `linkProgram` calls after a warm-up tour (F1);
- draw calls per frame under a ceiling for a reference room and a reference body count (F3/F8).

Do **not** gate on SwiftShader timings — they are not representative. Gate on the work.

**Status:** landed with §3b's follow-up as the "room-crossing gate" CI job — `npm run
perf:crossings` runs `tools/perf/room-crossings.mjs walk 12 --gate` against the dev server in
headless Chromium and fails on any `linkProgram` after the run's first crossing or more than 40
programs held. The geometry/texture-growth and draw-call ceilings above are still open; the
harness already records the numbers, so they are a threshold each, not new plumbing.
