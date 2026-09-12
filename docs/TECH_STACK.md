# Kellerbier — Tech Stack & Architecture

## 1. Decision

**TypeScript · Vite · three.js · custom fixed-timestep ECS · Vitest · static web build.**

three.js draws the room as a lit 3D scene under a fixed 65° camera and the HUD as a 2D pass over
it; the sprites themselves stay 2D pixel art, standing up in the room (`DECISIONS.md` #74).
PixiJS v8 was the renderer from M0 until M6.

Desktop packaging via Tauri later if it is ever warranted. No engine editor, no scene format
we do not control, no runtime we cannot unit-test headlessly.

## 2. Performance: the actual question

The concern that drove this decision is legitimate — a bullet hell fills the screen, and JS
has a reputation. The reputation is mostly earned by *badly written* JS. Here is the honest
breakdown of where the frames actually go.

### Rendering is not the bottleneck

The world is a three.js scene on WebGL2: a few merged floor meshes, a box per wall run, one
billboard mesh per standing body, and one `InstancedMesh` per projectile texture and per particle
kind — so five thousand shots are a handful of draws however many are in flight, and a room's
draw count grows with the number of *bodies* in it, not the number of bullets. Isaac peaks
somewhere around 300–800 simultaneous projectiles; even a Touhou-grade 3,000 is instanced away.
What does cost is the lighting: a shadow-mapped key light means every caster is drawn twice, and
each bulb and each live player shot is a point light in the shader. That cost is bounded by
content (bulbs per room, `SHOT_LIGHT_COUNT`), not by the fight, and it is the one line item that
is unverified in CI — the bench is headless and has no GPU (`DECISIONS.md` #74).

### The two things that actually kill JS games

**1. Garbage collection.** Allocating objects inside the frame loop — a `{x, y}` here, a
temporary array there — creates GC pressure that shows up as periodic frame spikes. In a
bullet hell those spikes land exactly when the screen is busiest. This is *the* JS game-dev
failure mode, and it is entirely avoidable.

**2. Naive broadphase collision.** 3,000 projectiles against 200 enemies checked pairwise is
600,000 checks per tick; projectile-against-projectile would be 9,000,000. Unacceptable, and
unnecessary.

### What we do about it

| Problem | Solution | Enforced by |
|---|---|---|
| GC spikes | **Structure-of-Arrays** storage: `Float32Array` for position, velocity, radius, lifetime; `Uint8Array`/`Uint32Array` for flags, tags and type ids. No per-entity objects in the hot path. | Architecture; benchmark |
| GC spikes | **Object pooling** for everything transient — projectiles, particles, damage numbers, events. Nothing is `new`-ed mid-frame. | Lint rule + allocation test |
| GC spikes | **Zero-allocation frame loop.** No closures, no array literals, no destructuring, no `.map`/`.filter` in `update()`. Preallocated scratch vectors. | Allocation-delta test in CI |
| Broadphase | **Uniform spatial hash** sized to the largest common collider. Rebuilt each tick from typed arrays. | Benchmark |
| Broadphase | **We never test projectile↔projectile.** Only projectile↔enemy, projectile↔player, projectile↔wall. All circle-vs-circle and circle-vs-AABB — no rotation, no polygon clipping. | Design constraint |
| Frame pacing | **Fixed 60 Hz simulation** decoupled from render, with an accumulator, a max-steps-per-frame clamp (spiral-of-death guard) and render-side interpolation. | Determinism test |
| Draw calls | Instanced projectiles and particles; one mesh per body, not per sprite pixel; the HUD is one 2D mesh per element. Counted from `renderer.info` in the debug overlay. | Debug overlay (`O`); not asserted by the bench, which is headless |

### The escape hatch

Because simulation is fully decoupled from rendering and operates on flat typed arrays, the
hot loop (integration, spatial hash, collision resolution) can be lifted into Rust compiled to
WebAssembly *without touching any game content* — typed arrays are exactly what you hand
across the WASM boundary. We design that seam in from the first commit so it stays a genuine
option rather than a rewrite. We do not build it now: we build the budget and the benchmark,
and only reach for WASM if the benchmark says to.

### Why not Godot

Godot 4 is an excellent 2D engine and would be a defensible choice — but it does not solve
this problem for free. GDScript is slower per-entity than typed-array TypeScript, and giving
each bullet an `Area2D` node is the canonical Godot bullet-hell performance trap. Godot bullet
hells end up on `MultiMeshInstance2D` with hand-rolled collision — the exact same discipline
described above — while costing us headless testability, cheap CI, and a playable link on
every pull request. C++ or Rust-native would raise the ceiling further, at an iteration cost
we would pay on every single change for a ceiling this game will not reach.

### Why not Phaser

Phaser gets you a moving sprite faster and then fights you. Its scene/GameObject model and
Arcade Physics are built around per-entity objects, which is precisely the pattern we need to
avoid, and its opinions collide with the deep stat/modifier pipeline that is the actual game.

## 3. Performance budget

These are commitments, not aspirations. They are checked in CI.

| Metric | Budget |
|---|---|
| Simulation tick | **≤ 4 ms** at 5,000 projectiles + 200 enemies + 1,000 particles |
| Full frame (sim + render) | **≤ 12 ms** in the same scene — a 40% headroom margin on 60 fps |
| Steady-state heap growth | **0 bytes/frame** in the stress scene — gated at 512 KB/tick, see below |
| Draw calls | *per-pass re-baseline still pending; not asserted.* The ≤ 20 figure was written for a sprite batcher and does not apply to the three.js scene (`DECISIONS.md` #74). #294 landed atlas loading (below) but deliberately deferred body instancing (`DECISIONS.md` #79) — the actor pass is still one draw call per standing body, so the per-pass table this row wants is not honest to write down until that lands. |
| Boot sprite requests | **4**, measured by hand in a browser, *not yet asserted in CI* (that is #294 item 4, deferred with the rest of the browser perf harness, `DECISIONS.md` #79) — the three packed atlas sheets (`assets/atlases/*.png`, `render/floor-art.ts`'s `loadAtlasSheets`) every authored sprite loads from instead of the 113 individual files it used to be, plus one standalone `loadTexture` for the title screen's illustrated backdrop (`DECISIONS.md` #94) |
| Cold load to playable | **≤ 3 s** on a mid-range laptop over broadband |
| Input-to-photon latency | **≤ 2 frames** |

A dedicated stress scene reproduces the budget scenario. `npm run bench` runs it headless and
asserts the absolute numbers above. Every PR also gets its **frame-time delta**: CI runs the
benchmark twice on one runner, once on the pull request and once on its merge base, compares
the two, fails on a regression past a tolerance band, and posts the table as a comment. Both
numbers coming off the same machine minutes apart is what makes the band narrow enough to
be worth having. Runs on `main` are appended to `bench/history.jsonl`, which is the long trend
no single comparison can show.

### On the heap row

Zero is the design, and the design holds: nothing in a system allocates an object, storage is
pooled, components are Structure-of-Arrays. What is measured on a full field is about 54 KB a
tick, and every byte of it is V8 boxing a double rather than the game producing garbage.

Two shapes cause it, neither visible in the source:

- **A double stored into a module-level `let`.** A module binding is a tagged slot and cannot
  hold a raw double, so every store allocates a 16-byte `HeapNumber`. The collision system kept
  six such bindings and wrote all six per projectile: 490 KB a tick. Banned by the
  `no-hot-allocation` lint rule; the fix is a module-level typed array with named indices.
- **A double returned across a call boundary V8 declines to inline.** The particle spray drew
  four random floats per particle through `Rng.nextFloat`: 83 KB a tick. The fix is a bulk form
  that fills a `Float64Array`, so the values are never tagged.

What remains is `sweptCircleHit` handing a hit time back to the collision system. It is written
down rather than fixed, because turning a pure function into an out-parameter one costs a reader
more than the bytes cost the collector.

**The byte count is bimodal, and the two modes are six times apart.** The same commit, the same
scene and the same runner image measured 47.9 KB a tick on one CI run and 350.8 KB on the next,
minutes later; a desk reads the low mode almost always. Nothing about the simulation differs
between them — it is TurboFan reaching a different inlining decision on a machine with different
neighbours, and which doubles get boxed follows from that.

So the absolute gate is a ceiling and not a target: 512 KB, set to catch the simulation starting
to allocate in earnest in either mode. Set snugly around the low mode it would fail one CI run
in a few, and a gate that does that is a gate that gets muted.

What does hold is the *delta*. The benchmark proves it can still see the bug it exists to see: a
companion test adds one small object per projectile per tick and requires the measurement to
resolve at least 128 KB of it. Across the two modes that same sabotage resolved 253.0 KB and
229.4 KB — stable where the baseline is not, which is why the criterion is written as a delta.
The sharp instrument for a change is still the pull-request comparison, where both runs come off
one runner minutes apart and are far more likely to land in the same mode.

### Audio

Nothing under `app/audio/` decodes an asset. Every voice — music, SFX, barks — is synthesised at
schedule time from `content/audio/*` data (`synth.ts`'s oscillators and filtered noise), so there
is no decode step to budget and nothing to move off the main thread: the "asset loading" line
item other subsystems have doesn't apply here the way it would to sampled audio.

The one thing that *does* cost real time is filling the shared noise buffer
(`synth.ts#getNoiseBuffer`, one second of samples at the context's sample rate) the first time
anything needs it. Before #157 that fill happened lazily, on whichever SFX played first — which
in practice meant the first hit of a room, mid-combat. `context.ts#getAudioContext()` now warms
it once, right after constructing the `AudioContext` (boot, or the first user-gesture unlock),
which is the fix for the "no frame-time spike on a room transition" budget row above: the one
allocation-and-fill audio ever does no longer has a chance to land on a frame anyone is measuring.

Every other audio-side cost — a note's oscillators, an SFX's filtered-noise envelope, the mixer's
bus graph and ducking ramps — is `AudioContext`-scheduled ahead of playback time and runs on the
browser's own audio rendering thread, not this project's frame loop, so it never appears in the
simulation-tick or full-frame budget rows at all.

## 4. Architecture

### Layers, strictly one-directional

```
content/     data — items, enemies, rooms, floors, loot tables (JSON + typed schemas)
    ↑
sim/         pure deterministic game simulation. No renderer import. No DOM. No Date.now().
    ↑
render/      three.js: the lit 3D room, sprite billboards, the 2D HUD pass, camera, interpolation
    ↑
app/         bootstrapping, input, audio, save, menus, screens
```

**`sim/` never imports from `render/`.** This is enforced by a lint rule, and it is the single
most important structural decision in the project: it is what makes the game headlessly
testable, deterministic, replayable, seed-shareable, and WASM-portable.

### ECS

A small, purpose-built ECS — not a library. Archetype-free, Structure-of-Arrays component
storage, dense entity ids with a generation counter for safe handles, systems as plain
functions over component arrays. It needs to do exactly what this game needs and nothing else;
a general-purpose ECS would cost more in indirection than it returns.

### Determinism

- A **seeded PRNG** (PCG32 or xoshiro128\*\*) is the *only* source of randomness in `sim/`.
  `Math.random` is banned by lint rule.
- Fixed timestep, integer tick counter, no wall-clock reads inside the simulation.
- Same seed + same input sequence ⇒ same run, byte for byte. This gives us shareable seeds,
  daily runs, replay files, and — most valuable of all — **reproducible bug reports**.
- A determinism test replays a recorded input log and asserts an identical end-state hash.

### Content as data

Items, enemies, rooms and floors are JSON validated against typed schemas at build time.
Adding an enemy should not require touching engine code. Behaviour is composed from a library
of named behaviour primitives (`chargeAtPlayer`, `orbitPoint`, `fireBurst`, `splitOnDeath`)
that content references by name.

A **content validation test suite** runs on every commit: every referenced sprite exists,
every loot table sums correctly, every room template's doors match its declared shape, every
item id is unique, every localisation key resolves in every locale.

## 5. Project layout

```
src/
  sim/          ecs/  systems/  collision/  rng/  stats/  items/  rooms/  gen/
  render/       three.js setup (app.ts), the scene (view.ts), views per thing, hud components
    world/      camera, lighting, billboards, floor shapes, scenery, world-anchored labels
    gfx/        the 2D scene graph the HUD is written in, drawn as an orthographic pass
    ui/         the pixel fonts, the UI kit, icons, display type (#154)
  app/          input, audio, save, screens, settings, localisation
  content/      items/  enemies/  rooms/  floors/  loot/   (+ schemas)
  debug/        overlay, stat inspector, room warp, item spawner, replay tools
assets/
  atlases/  audio/
tests/
  unit/  determinism/  content/  bench/
tools/
  room-editor/  atlas-packer/  balance-sim/
```

`assets/` has no `fonts/` directory, and that is deliberate: the two pixel faces (#154) are
*source*, not assets — bitmaps in `src/render/ui/`, rasterised into a `DataTexture` at boot by a
pure function. So is the rest of the UI kit, for the reason in `docs/DECISIONS.md` #43.

`assets/atlases/` is a pipeline artefact: the packer validates and packs the floor's sprites, and
the content tests read the result, but the runtime loads the PNGs — it never loaded the atlas,
under either renderer.


## 6. Tooling

- **Vite** — dev server, HMR, production build.
- **Vitest** — unit, determinism and content tests. Headless, fast, runs on every commit.
- **ESLint + Prettier**, with project-specific rules: no `Math.random` in `sim/`, no `render/`
  imports from `sim/`, no allocation patterns in files marked `@hot`.
- **TypeScript strict mode**, `noUncheckedIndexedAccess` on. Non-negotiable.
- **GitHub Actions**: typecheck → lint → test → content-validate → bench → build → deploy
  preview to GitHub Pages. Every PR gets a **playable link**.
- **Debug overlay** (O): entity counts, frame graph, draw calls read from three.js's
  `renderer.info` (`src/debug/draw-calls.ts`), hitboxes and the broadphase grid as lines on the
  room floor, the stat inspector that explains every modifier's contribution, room warp, item
  spawner.
- **Tuning window** (T): every number in `sim/tuning.ts` on a slider bound to the live object,
  with a per-field reset and a copy that writes back only what moved. Tuning by feel through an
  edit-and-reload cycle finds the first value that is not obviously wrong, and stops there.
  (Not F-keys, and not punctuation keys — a hosted preview's browser chrome claims F-keys as
  its own shortcuts, and a punctuation key can land on a dead accent key on a non-US keyboard
  layout. See `src/debug/overlay.ts`'s doc comment.)
- **Room editor** (#24, `npm run dev` → `/editor.html`): authors `src/content/rooms/*.json`
  directly — tile/obstacle/spawn/pickup/hazard/prop placement, room metadata, inline schema
  validation, and a live in-engine playtest of the room being edited, no rebuild. A second Vite
  HTML entry plus a `configureServer` dev-only save endpoint (`tools/room-editor/`); neither
  reaches a production build. M6 needs several hundred authored rooms — this is the tool built
  ahead of that content, per `docs/ROADMAP.md`.

## 7. Non-goals

No general-purpose engine. No editor. No plugin architecture. No abstraction that exists for a
second game we are not making. When in doubt, write the specific thing.
