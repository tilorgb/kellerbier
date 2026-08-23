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
