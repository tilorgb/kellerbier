# Decision log

Architectural decisions and the reasoning behind them, newest last.

A decision belongs here when it **constrains something else** — when a future change has to
work around it, or when the obvious alternative was rejected for a reason that is not visible
in the code. Local choices belong in a comment next to the code they affect.

Entries are not edited once written. A decision that turns out to be wrong gets a new entry
that supersedes it, because the reasoning that led to the wrong answer is usually the most
useful thing on the page.

---

## 1. TypeScript, Vite, PixiJS and a custom ECS

**Decided:** M0, before the first commit. **Full reasoning:** [`TECH_STACK.md`](TECH_STACK.md).

A bullet hell in JavaScript is a legitimate concern, and the reputation is mostly earned by
badly written JavaScript. The two things that actually kill these games are garbage collection
inside the frame loop and a naive collision broadphase. Both are avoidable, and avoiding them
is a discipline rather than a language feature — so the stack was chosen for headless
testability, cheap CI and a playable link on every pull request, and the discipline was made
mechanical instead.

Rejected: Godot (its per-entity node model is the canonical bullet-hell performance trap, and
it costs headless testing), Phaser (built around exactly the per-entity object pattern to be
avoided), native (a ceiling this game will not reach, paid for on every change).

**Constrains:** everything. The escape hatch is deliberate: the simulation is flat typed
arrays, so the hot loop can move to WASM without touching game content.

## 2. The simulation may not import the renderer

**Decided:** M0. **Enforced by:** `tools/eslint/architecture.js`, with fixtures in
`tests/lint/`.

This is the load-bearing structural decision. `sim/` never importing `render/`, `app/` or Pixi
is what buys headless testing, determinism, replays, shareable seeds, reproducible bug reports
and the WASM seam. Every one of those disappears the moment one system reaches into a sprite.

It is enforced mechanically rather than by convention because the erosion is invisible in code
review — the diff always looks like a small convenience.

**Constrains:** systems report through the event queue rather than calling the thing that
should react. Presentation state that must survive a replay identically (the hit flash,
screenshake) lives in the simulation, drawn from the seeded cosmetic random stream.

## 3. A run is its seed plus its input log

**Decided:** M0. **Enforced by:** `tests/determinism/`.

There is no wall clock in `sim/` and no unseeded randomness. Time is an integer tick counter;
randomness comes from split streams so that a system can draw as much as it likes without
moving anything else — a cosmetic particle rolled from a shared generator would rewrite every
floor layout in the game.

**Constrains:** anything that wants to know "how long since" counts ticks. Anything random
draws from its own stream. Hitstop freezes *inside* a tick rather than stopping the loop,
because stopping the loop would make a run depend on how long a frame took.

## 4. Nothing transient is allocated mid-frame

**Decided:** M1. **Enforced by:** the `@hot` lint rule and the allocation-delta tests.

Projectiles, particles, damage numbers, decals and events come from fixed-capacity pools over
flat typed arrays. Pools never grow — growing mid-frame is the allocation the design exists to
avoid, and it would happen exactly when the screen is busiest.

Overflow policy is per pool and is a design decision, not a default: projectiles recycle the
oldest, so a player holding fire in a full room keeps seeing their own shots; the event queue
refuses instead, because a dropped event is a hit that produced no flash.

**Constrains:** systems are written with hoisted callbacks and module-level scratch rather than
closures and object literals. It reads worse; the frame graph reads better.

## 5. Projectiles are not ECS entities

**Decided:** M1.

There are up to five thousand of them, they last well under a second, and nothing ever refers
to a bullet after it is gone — so a generational handle buys nothing. They live in a dedicated
Structure-of-Arrays store instead, which keeps them dense and keeps the world's capacity sized
for the things that genuinely need safe handles.

**Constrains:** the collision system indexes entities in the broadphase and walks projectiles
directly, rather than treating both alike.

## 6. Impact feel is a package, not a feature

**Decided:** M1. **Issue:** #13.

Flash, hitstop, knockback, screenshake and particles all fire on the same frame. None of them
is expensive or clever individually; what matters is that all of them happen together. The
numbers live in `src/sim/tuning.ts` and are expected to keep moving — they are tuned by feel,
which means they are never finished.

**Constrains:** anything that can be hit needs a mass, a collider and health, and anything that
reacts to a hit reads the event queue rather than being called by collision.

## 7. An enemy is data, not code

**Decided:** M1. **Issue:** #14. **Enforced by:** the `content-is-data` lint rule, and
`tests/content/enemies.test.ts`.

An enemy is a size, four numbers and a small state machine built out of twelve named behaviour
primitives, living in `src/content/enemies/`. The system that runs them is an interpreter: it
knows how to walk, charge, orbit, flee, fire, telegraph, split and become invulnerable, and it
knows nothing about any particular enemy.

The alternative — a class per enemy — is fine for one enemy and fatal at thirty-five. Floors 2
to 7 are roughly thirty-five more, and every one that needs engine work is a week M6 does not
have. The format is the schedule.

Content may import types and nothing else, so an enemy cannot quietly become code. Validation
happens once at construction and fails loudly: a transition pointing at a state that does not
exist has to break the build rather than produce a body that stands still in one room out of
forty.

**Constrains:** a new behaviour is a new primitive, deliberately — adding one is a decision
about the whole roster rather than a special case for one enemy. Everything an enemy does is
derived from one per-body counter, the ticks it has spent in its current state, so there is no
second clock to keep in step and a replay reproduces exactly.

## 8. The input frame says how aim was produced

**Decided:** M1.

A shot inherits a fraction of the player's velocity, which bends the stream as they strafe.
That sway is the feature, and how much of it works depends on the device: with aim keys the
angle between running and aiming holds still, so the bend is a constant slant a player learns
in seconds; with a mouse or a stick, aim is a *point*, that angle rotates continuously as they
circle it, and the same sway slides through zero under their hands and reads as wobble.

So the frame carries one flag saying whether aim was analog, and the two cases have their own
tuning value. The flag lives in the frame rather than in the sampler because the simulation
acts on it — a replay has to reproduce the shots it recorded, not the shots the machine
replaying it would have fired.

**Constrains:** any future feel that depends on the input device goes through the frame the
same way. Nothing in `sim/` may ask what hardware is attached.

## 9. Promille is unlocked, not on from the first run

**Decided:** M1, for M7. **Issue:** #85.

The signature mechanic is gated behind an unlock granted for beating Der Stier, and announced
at the Stammtisch. Before that a run is sober: no meter, no drift, no tier bonuses, no beer
pickup, and no Promille-gated items in the pools.

The opening should read as a familiar twin-stick roguelite so that the game teaches one
mechanic at a time. It also makes the unlock worth having — the player has already played the
version without it, so they can feel exactly what arrived.

**Constrains:** every system Promille touches needs a working "not unlocked" path: the system
not running, rather than the system running with its numbers set to zero. Drop tables and item
pools are selectable per run state, which is a reason for both to be data. The state is part of
a run's parameters, so a shared seed reproduces the run it recorded rather than the run the
player receiving it happens to have unlocked.

## 10. A diagonal room is not a `RoomShape` — it needs its own geometry, tracked separately

**Decided:** M2. **Issue:** #107, follow-up tracked as #112.

#107 asked whether the room system should also support a diagonal shape — an `X` or a `/` —
alongside the axis-aligned `1x1`/`1x2`/`2x2`/`L`/`T` family that shipped with it. It is **not**
built as a `RoomShape` the way `T` was: every part of the room and floor system a `RoomShape`
touches assumes axis-aligned floor-grid adjacency. `RoomDoor` (`sim/room/floor-plan.ts`) is a
`(cell, direction)` pair where `direction` is one of north/east/south/west; a diagonal neighbour
has no `DoorDirection` to be. Two floor-grid cells offset diagonally (`(+1, -1)`) share a single
*point* in `RoomGeometry`'s rectangle-per-cell layout, not an edge the way every glued shape
today does — zero area for a nonzero-radius player to walk through. And the natural fix (the
same bounding-box-minus-voids approach `T` uses) blows the fixed `MAX_ROOM_BLOCKS = 64` for a
staircase of any real length, since an *N*-step diagonal needs roughly an *N×N* box of voids.

The idea is not dead, though: overlapping consecutive screens by *less than* a full
screen-width/height per step (rather than a full floor-grid cell) gives real shared edge area
instead of a corner touch, and sidesteps the void-block explosion entirely — but that is a
purpose-built stair polyline, not a shape carved out of a grid rectangle, and has no
floor-grid-cell adjacency for doors to derive from the way `L`/`T`/`2x2` do. That is different
enough from the `RoomShape` model to need its own geometry representation and its own decision
on whether it is even a `RoomShape` at all (procedurally placed) versus a hand-placed set-piece
room — see #112 for the full design questions.

**Constrains:** nothing in #107 is built toward this — no new `RoomShape`, no `RoomGeometry`
change beyond the rectangle-list `voidRects` generalization `T` needed. #112 owns the actual
geometry/door design before any of it is implemented.
