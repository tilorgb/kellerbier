# Kellerbier — Tech Stack & Architecture

## 1. Decision

**TypeScript · Vite · PixiJS v8 · custom fixed-timestep ECS · Vitest · static web build.**

Desktop packaging via Tauri later if it is ever warranted. No engine editor, no scene format
we do not control, no runtime we cannot unit-test headlessly.

## 2. Performance: the actual question

The concern that drove this decision is legitimate — a bullet hell fills the screen, and JS
has a reputation. The reputation is mostly earned by *badly written* JS. Here is the honest
breakdown of where the frames actually go.

### Rendering is not the bottleneck

PixiJS v8 batches sprites into a small number of GPU draw calls on WebGL2 (WebGPU where
available). Tens of thousands of batched sprites at 60 fps is routine on a mid-range GPU from
the last decade. Isaac peaks somewhere around 300–800 simultaneous projectiles; even a
Touhou-grade 3,000 is not close to the rendering ceiling. As long as every sprite shares a
texture atlas and nothing forces a batch break (filters, blend-mode changes, z-order churn),
the renderer is nearly free.

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
| Draw calls | One texture atlas per floor; sprites sorted into stable layers; no per-sprite filters. | Draw-call assertion in benchmark |

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
| Steady-state heap growth | **0 bytes/frame** in the stress scene (allowing GC noise tolerance) |
| Draw calls | **≤ 20** in a typical combat room |
| Cold load to playable | **≤ 3 s** on a mid-range laptop over broadband |
| Input-to-photon latency | **≤ 2 frames** |

A dedicated stress scene reproduces the budget scenario. `npm run bench` runs it headless and
**fails the build on regression** past a tolerance. Every PR reports its frame-time delta.

## 4. Architecture

### Layers, strictly one-directional

```
content/     data — items, enemies, rooms, floors, loot tables (JSON + typed schemas)
    ↑
sim/         pure deterministic game simulation. No Pixi import. No DOM. No Date.now().
    ↑
render/      Pixi scene graph, sprites, particles, camera, interpolation
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
  render/       pixi setup, sprite layers, particles, camera, hud
  app/          input, audio, save, screens, settings, localisation
  content/      items/  enemies/  rooms/  floors/  loot/   (+ schemas)
  debug/        overlay, stat inspector, room warp, item spawner, replay tools
assets/
  atlases/  audio/  fonts/
tests/
  unit/  determinism/  content/  bench/
tools/
  room-editor/  atlas-packer/  balance-sim/
```

## 6. Tooling

- **Vite** — dev server, HMR, production build.
- **Vitest** — unit, determinism and content tests. Headless, fast, runs on every commit.
- **ESLint + Prettier**, with project-specific rules: no `Math.random` in `sim/`, no `render/`
  imports from `sim/`, no allocation patterns in files marked `@hot`.
- **TypeScript strict mode**, `noUncheckedIndexedAccess` on. Non-negotiable.
- **GitHub Actions**: typecheck → lint → test → content-validate → bench → build → deploy
  preview to GitHub Pages. Every PR gets a **playable link**.
- **Debug overlay** (F1): entity counts, frame graph, hitbox display, the stat inspector that
  explains every modifier's contribution, room warp, item spawner, Promille slider.

## 7. Non-goals

No general-purpose engine. No editor. No plugin architecture. No abstraction that exists for a
second game we are not making. When in doubt, write the specific thing.
