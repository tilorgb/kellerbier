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

**Decided:** M1. **Issue:** #13. **Amended:** M6, see #23 — the stagger in the package is now
local per body (`GameSim.hitStun`), not a whole-simulation freeze.

Flash, a hit-stagger, knockback, screenshake and particles all fire on the same frame. None of
them is expensive or clever individually; what matters is that all of them happen together. The
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

## 11. A diagonal staircase room is a hand-placed set-piece, geometry is a union of overlapping steps

**Decided:** M2. **Issue:** #112, following on from #10's open questions.

#112's design pass answers the three questions #10 left open.

**Room kind:** a staircase is not a `RoomShape` the floor generator chooses and places. Every
part of `sim/room/floor-plan.ts` that a `RoomShape` touches —
`chooseShape`/`placeShape`/`computeAdjacency`, and `RoomDoor`'s `(cellIndex, direction)` pairs —
assumes axis-aligned floor-grid-cell adjacency between *every* pair of glued cells, not just the
two ends. A staircase has no such adjacency anywhere in its interior, so it sits entirely outside
that system: it is a hand-placed set-piece room, compiled by its own function
(`sim/room/staircase.ts`'s `compileStaircaseRoom`), never by `compileRoomTemplate`, never
reachable through `chooseShape`. Wiring a staircase into a specific floor's layout — the "which
two rooms sit past its two doors" question — is a level-authoring concern for whoever places one,
the same way `sim/room/playground.ts`'s dev room is hand-wired rather than generated; #112 does
not build that authoring path, only the geometry and compilation it would sit on top of.

**Geometry:** `RoomGeometry` gains `stepRects` (`sim/room/geometry.ts`), a list of per-step screen
rects read as a *union* instead of the single-rectangle `minX`/`minY`/`maxX`/`maxY` bound every
other room uses. Each step overlaps the previous one by half a screen on both axes
(`STAIR_STEP_OVERLAP` in `staircase.ts`) rather than gluing at a full floor-grid cell — that
overlap is real shared edge area for a nonzero-radius player to cross, not the corner-touch point
two diagonally-offset floor-grid cells would share. `isClear` accepts a circle when it fits
entirely inside *any one* step rect; this is sound (never lets a circle poke through where there
is no floor) even though it is conservative right at a seam, where a circle that straddles two
steps without fitting fully in either is rejected even though the union technically covers it —
a deliberate trade favouring "never clips through a wall" over "walkable right up to the union's
true edge." No `voidRects`/blocks are needed to carve an exclusion out of a bounding box the way
`L`/`T` do, so a staircase of any authored length never touches `MAX_ROOM_BLOCKS = 64` — the
budget problem #10 flagged for the bounding-box-minus-voids approach doesn't apply here because
there is no bounding-box-minus-voids at all, only the union itself. The outer `minX`/`maxX`/
`minY`/`maxY` bound is kept too, set to the bounding box of every step, purely for
`roomFrameSize`/the camera clamp (`render/view.ts`'s `GameView.followOffset`) and rendering frame
— unwalkable slack inside that box (the parts of the bounding box no step covers) reads as an
ordinary wall, the same precedent `voidRects` already established for `L`/`T`, so the camera
clamp needed no change at all.

**Doors:** only the first and last step get a door, each restricted to the two wall edges of that
step which the interior overlap never reaches (`staircase.ts`'s `START_FREE_DOORS`/
`END_FREE_DOORS`) — never the two edges the seam to the next step partially consumes, even where
a sliver of that edge is technically still free, because a door's fixed `DOOR_SPAN` gap centred on
the edge has no way to dodge a seam that only covers part of it. `compileStaircaseRoom` rejects
any other direction outright. Each door is placed against its own step's rect
(`stepDoorCentre`), not the room's overall bounding box the way `template.ts`'s `doorCentre` reads
it for every other room shape — a staircase's end steps are smaller than, and not flush with, that
bounding box the way a `1x1`/`L`/`T` cell always is.

**Constrains:** a staircase room cannot be dropped into `eligibleTemplates`/`generateFloor`
without new code — nothing in `floor-plan.ts` accepts a non-`RoomShape` room today. Any future
work that wants the floor generator to place staircases itself (rather than they being hand-wired
set-pieces) is a new, separate design, not a natural extension of this one.

**Superseded:** the "no `voidRects`/blocks... never touches `MAX_ROOM_BLOCKS`" claim above, and
the "hand-placed only" framing of Constrains, are both revised by #12 — generator placement
landed sooner than expected, and turned out to need real `voidRects`/blocks after all (a gap
`isClear`'s union check alone didn't cover, see #12's "What broke" section).

## 12. The floor generator places a staircase as a reserved bounding-box block, with real void blocks at every seam

**Decided:** M2. **Issue:** #112, folded into the same PR after review, at the user's request, to
land generator placement now rather than as a separate follow-up.

**Placement:** a staircase's floor-grid footprint is a **`span` × `span` block** of cells
(`floor-plan.ts`'s `placeStaircase`), not a single diagonal line of `stepCount` cells as first
tried — `span = ceil(1 + (stepCount - 1) * STAIR_STEP_OVERLAP)`, always rounded **up**, so the
reservation can only ever be equal to or larger than the real screen-space bounding box, never
smaller. The first step always sits at one corner of that block and the last step at the
diagonally opposite corner, whichever `span` is; every other cell in the block — corner or
interior — gets no door, ever (`doorCells`, consumed by `computeAdjacency`'s new
`buildDoorAllowance`, which is the first place a cell can touch a neighbour's cell without that
becoming a door: both sides have to allow the specific direction, not just have something on the
other side of it).

A single line of cells (one per step) was the first attempt, and was wrong: two real floor-plan
bugs came out of playtesting it — a secret room placed diagonally next to a staircase that its
real (wider) geometry already physically overlapped, and the minimap drawing a solid block of
full rooms in a line the staircase never actually is. Reserving only the true diagonal cells
under-claims the grid relative to the real screen-space footprint whenever `STAIR_STEP_OVERLAP <
1` (steps overlap by a fraction of a screen, not a whole one) — the fix is to reserve the whole
bounding box, rounded up, even though most of that block is not real floor either.

**What broke, and the second fix:** `RoomGeometry.isClear`'s `stepRects` union check (#11) is
queried by every *other* system — spawn safety, corner-nudge, enemy-shot range — but not by the
player/enemy wall resolver itself (`sim/systems/motion.ts`'s `resolveAxisX`/`resolveAxisY`, shared
by `moveBody`), which only ever reads `minX`/`maxX`/`minY`/`maxY` and `blocks`, and has no idea
`stepRects` exists. #11 built no blocks for a staircase at all (the whole point of the union
design), so nothing stopped a player from walking straight through the slack between two steps —
`isClear` correctly said "not clear" as a query, but nothing was ever asking it during ordinary
movement. Fixed by `staircase.ts`'s `seamVoidRects`: for every consecutive pair of steps, the
part of their combined bounding box outside *both* rects decomposes into exactly two axis-aligned
rectangles (real wall), registered as ordinary `voidRects`/`addBlock` entries — the same mechanism
`L`/`T` already use, just computed from step geometry instead of a dropped footprint cell. This
also fixed a second, cosmetic bug the same underlying gap caused: `render/room.ts` had grown a
staircase-specific per-step floor-fill (to avoid drawing the un-walkable slack as floor) that drew
a visible seam line at every step's border, from stroking each step rect individually where they
overlap. Reverted back to the ordinary single bounding-box fill plus `voidRects` painted over in
wall colour — once the voids are real rects instead of an implicit union-complement, that ordinary
path already draws a staircase correctly, seam-free, with no staircase-specific branch left in
`render/room.ts` at all. `RoomGeometry.stepRects`/`isClear`'s union check stays as belt-and-
suspenders on top: still exact for a direct "is this position legal" query, and unaffected by
whether `seamVoidRects`' decomposition is itself ever slightly off.

**Minimap:** `render/minimap-hud.ts` drew every reserved cell of a room as a full filled square
with a solid outline — correct for a `RoomShape`, misleading for a staircase's mostly-non-floor
block; a straight connecting line between its two doors was tried next and was truer but still
hid the real steps and corners a player can actually run into, which normal rooms' walls are
never hidden either. The real fix — and the reason this landed as its own pass rather than a
tweak to the line — was moving the geometry out of `render/` entirely: `render/minimap-hud.ts`
had grown an import of `compileStaircaseRoom` just to read four rects, coupling the render layer
to a full room compiler for what is, to it, a schematic. `sim/room/floor-plan.ts`'s
`staircaseMinimapRects` now does that compile-and-map **once, at placement time** (`placeStaircase`
calls it right before returning), converting the compiled `stepRects` into the same fractional
floor-grid space every room's integer cell coordinates already live in, and stores the result on
`FloorPlanRoom.minimapRects`. `render/minimap-hud.ts` now only ever reads that field — no
knowledge of what a staircase is, no `compileStaircaseRoom` import, no staircase-specific branch
beyond "draw these rects instead of these cells if present." The same shape a future non-
rectangular room (or a left-behind-drops marker) would need, without minimap code growing a new
branch per room kind.

**Doors, budget:** `computeAdjacency`'s `buildDoorAllowance` (see Placement above) makes "touching
but no door" a real, general state for the first time — previously every geometric cell touch
became a door unconditionally. Read as an ordinary solid wall, since `render/room.ts` only ever
draws a door where one is actually compiled. `seamVoidRects` adds `2 * (stepCount - 1)` blocks per
staircase, small enough that `MAX_ROOM_BLOCKS = 64` (#10) stays a non-issue for any realistic
`stepCount`; #11's claim that a staircase "never touches `MAX_ROOM_BLOCKS`" regardless of length
no longer holds unconditionally, just practically.

**Content, dev-only surface area added alongside this:** a small `StaircaseContentTemplate` type
and `validateStaircaseTemplate` (`staircase.ts`) — `floorTags`/`weight`, on top of everything
`StaircaseRoomTemplate` already had — let the generator pick a staircase for a floor's tag the
same way it picks a `RoomShape` template; two authored `up-right` variants
(`cellar-staircase.json`, `south`/`north` doors, and `cellar-staircase-west-east.json`,
`west`/`east`) prove it end to end and give the generator both legal door combinations for that
direction to actually place, rather than only ever showing one. `generateFloor`'s new
`staircasePool` parameter defaults to `[]`, so every existing caller —
every test in this repo included — is unaffected unless it opts in. Separately (not #112 itself,
but landed in the same pass at the user's request while iterating on this): `app/main.ts` no
longer boots a hardcoded dev seed — it randomises one per load, accepts `?seed=`/`#seed-input` to
pin one, and rebuilds the run in place (`startRun`) on the `R` key, Isaac-style, without a page
reload; the run's very first room now always loads with `suppressRoomContent` (no enemies, no
drops) so it reads as a tutorial beat. The debug overlay/tuning window/`__kellerbier` handle are
not restart-aware yet — full in-run restart including those is still #46.

**Found and fixed while playtesting the above:** (1) `sim/systems/motion.ts`'s primary wall
resolver only ever reads `blocks`, never `stepRects` — `seamVoidRects` (`staircase.ts`) now
registers the real gap at every seam as an ordinary block, the same mechanism `L`/`T` already use,
so a player can no longer walk through the "slack" `isClear`'s union check alone only rejected as
a query. (2) `computeAdjacency`'s `buildDoorAllowance` generalizes past staircases: an `L`/`T`
room's own void-adjacent directions are excluded from every room now, not just registered and
then silently dropped at compile time — the bug class `sim/room/void-cells.ts`'s own comment
already named (graph and compiled reality disagreeing) had a second, unfixed instance here,
found via a real seed where walking a staircase's door landed inside a wall with no door back.
(3) `validateStaircaseTemplate` requires an odd `stepCount` — the minimap gap this whole pass
kept fighting (and two failed attempts at fixing by distorting the drawn shape instead) turned
out to be `stepCount: 4`'s real screen-space span (`2.5` cells) never landing on a whole number of
floor-grid cells in the first place; odd `stepCount` makes it exact, so `staircaseMinimapRects`
needs no snapping or stretching at all. #118 tracks lifting this once sub-cell reservation exists.
(4) `placeStaircase` now guarantees a real room past the staircase's *far* door too, not just the
end it grew from (`StaircasePlacement.farNeighborCell`, a forced `1x1` placed right after the
staircase itself) — a staircase is the floor's single biggest room by walking time, and reaching
the far end to find nothing there read as wasted effort rather than an arrival.

## 13. Staircase reservation is exact, at `STAIR_STEP_OVERLAP` sub-cell granularity — `stepCount` must be even, not odd

**Decided:** M2. **Issue:** #118. **Supersedes:** #12's `span = ceil(...)` whole-cell rounding,
and its found-while-playtesting note (3) requiring an odd `stepCount`.

**Reservation:** `placeStaircase` (`floor-plan.ts`) no longer rounds a staircase's real
screen-space span up to the next whole cell. It reserves a `subcellCount` × `subcellCount` grid of
`STAIR_STEP_OVERLAP`-wide (half-cell) padding cells instead, where `subcellCount` is
`template.stepCount + 1` — this tiles the true span (`1 + (stepCount - 1) * STAIR_STEP_OVERLAP`
cells) exactly, with no slack on any edge, because that span is always a whole multiple of
`STAIR_STEP_OVERLAP` regardless of `stepCount`'s parity. Two cells of that grid are real rooms, not
padding — the start and end steps, always `cells[0]`/`cells[cells.length - 1]` — sitting at their
*true* screen-space positions (`0` and `(stepCount - 1) * STAIR_STEP_OVERLAP` cells from
`originCell`), not at the grid's own outer corners. Every other cell is `STAIR_STEP_OVERLAP`-wide
padding that exists purely to correctly claim the rest of the fractional footprint, exactly as #12's
whole-cell interior padding did, just at finer resolution.

**Why `stepCount` flips from odd to even:** a staircase's two doors are real rooms and have to land
back on the ordinary integer floor-grid every other room's cells live on. The *near* one always does
— it's `anchor`, a pre-existing room, never approximated. The *far* one's offset from the near one is
`(stepCount - 1) * STAIR_STEP_OVERLAP` cells — a whole number iff `stepCount` is even, given
`STAIR_STEP_OVERLAP` is `0.5`. #12's whole-cell-only reservation needed the *opposite* parity for an
unrelated reason (rounding `Math.ceil` of the span up to a whole cell only ever agreed with the real
geometry when that span was already whole, which took an odd `stepCount`); now that both real steps
sit at their true positions, the constraint moves from "make the rounded span exact" to "make the
far step land on the coarse grid", and those are opposite parities. `validateStaircaseTemplate` now
rejects odd instead of even; `placeStaircase` carries the same check itself, defensively, for a
template handed to it some other way. Both authored templates (`cellar-staircase.json`,
`cellar-staircase-west-east.json`) moved from `stepCount: 5` to `4`.

**The far step's own neighbour can land off the integer grid too, and that's fine:**
`farNeighborCell` is placed one whole cell past the far step's *true* position, not past the
reservation grid's outer corner — so it's flush with the far step's real edge on the minimap, no
gap, the actual point of this issue. But the far step's true position is only guaranteed integer on
the *anchor's own axis* — the offset along the diagonal, `(stepCount - 1) * STAIR_STEP_OVERLAP`, is
whole for `stepCount` even, but `farNeighborCell` is one *more* whole-cell step out from there, which
can land back on a half-integer coordinate depending on `template.direction`/door and the parity
arithmetic. That's not a bug: `buildSkeleton`'s frontier-push and `openCellTouchCounts` already skip
any non-integer source cell (the same guard that protects a staircase's own interior padding),
so a fractional `farNeighborCell` simply never grows further and never becomes a secret/supersecret
candidate — it stays a real, ordinary `1x1` room (same template pool, same role eligibility; a
degree-1 dead end is `assignRoles`' *preferred* boss/treasure/shop slot), just guaranteed to be a
leaf of the room graph rather than a branch point. Nothing elsewhere in the floor plan can ever be
adjacent to it without going through that one door, so this costs nothing a normal leaf room
wouldn't already cost.

**Mixed-resolution occupancy:** `occupied` (and `PlacedRoom.cells`) now holds two different sizes
of entry in the same map — an ordinary room's cells, and a staircase's two real steps, are whole
cells; a staircase's padding cells are `STAIR_STEP_OVERLAP` wide. `neighborCount`'s ±1 whole-cell
check (unchanged, still what every ordinary `RoomShape` uses) can no longer answer "does this cell
touch anything already placed" on its own for a staircase's own reservation, since a padding cell's
true neighbours can be half a cell away, not a whole one. `reservedCellTouchesOccupied` is the
general fix: a closed-interval rectangle-touch test, sized per entry from what actually placed it
(`occupiedCellSize`, which checks a staircase's own `doorCells` to tell its two real steps from its
padding) rather than assuming every `occupied` entry is the same size. `placeStaircase` uses this for
every cell it places, `farNeighborCell` included (an ordinary room, but possibly landing close to
another staircase's padding); every other room kind is still whole-cell-only and `neighborCount`
keeps working for it unchanged.

**Frontier growth and secret placement never anchor on a fractional cell:** `buildSkeleton`'s
frontier-push and `openCellTouchCounts` (feeding `placeSecretRoom`/`placeSupersecretRoom`) both
walk every placed room's own cells with the same ±1 whole-cell `OFFSET` ordinary rooms use — pushed
or scanned from a staircase's fractional interior sub-cells, that offset would produce fractional
candidates, and either function handing one to its caller would place an ordinary `1x1` room (ever
only real, whole cells) at a coordinate that isn't a real screen. Both now skip a non-integer source
cell before ever computing an offset from it. A staircase's two corners are integer and still
contribute frontier growth and touch-count candidates exactly as before; only its never-a-door
interior sub-cells stop — which cost nothing real, since nothing could ever open a door onto them
anyway.

**What #118 does not do:** this is still whole/half-cell reservation sized to what a diagonal
staircase's `STAIR_STEP_OVERLAP = 0.5` actually needs, not a general arbitrary-fraction floor-grid.
The issue's other two motivating cases (a quarter-cell diagonal shortcut, a quarter-cell wedge-in
threshold room) would need finer-than-half-cell resolution and their own design pass — nothing here
prevents that later, but nothing here builds it either.

Both real steps sit at their true screen-space position (not the padding grid's outer corners), so
both ends are flush on the minimap with zero gap — `tests/unit/floor-plan.test.ts`'s "draws a
staircase's minimap steps flush against its real neighbours" checks this directly, against real
generated floors, not just the mapping function in isolation. The trade for the far end being exact
is that `farNeighborCell` can itself land on a fractional coordinate (see above) and is therefore
always a graph leaf — nothing grows from it. That is a real, if narrow, constraint on what a
staircase's far side can be (never itself a branch point toward more of the floor), not merely
cosmetic; #118's other two motivating cases (a quarter-cell diagonal shortcut, a quarter-cell
wedge-in threshold room) remain their own design pass regardless, needing resolution finer than
`STAIR_STEP_OVERLAP` gives.

## 14. Stat modifiers are sourced and registered, never applied inline

**Decided:** M3. **Issue:** #25.

The six stats (`docs/GAME_DESIGN.md` §6) resolve through one pure function,
`resolveStats` (`src/sim/stats/pipeline.ts`): `base → flat additions → multipliers → caps →
final`, flat before multiply regardless of the order modifiers are given in, with a cap step
appended to the trace only when a cap actually changes the value. Every modifier carries a
`ModifierSource` — an item, a Promille tier, a curse, a character — and the trace records that
source against the step it produced, which is the entire mechanism behind the debug overlay's
stat panel answering "why is my damage 47.3" instead of just stating it.

Gameplay code never computes a stat inline (`shotDamage * someBonus`) and never mutates a
tuning field to represent a temporary bonus. It registers a `StatModifier[]` under a source key
through `GameSim.stats.setSourceModifiers(sourceKey, modifiers)`, and removes exactly that
source with `clearSource(sourceKey)` when the bonus ends. `StatPipeline` (`src/sim/stats/
cache.ts`) caches the resolved traces and only re-runs `resolveStats` when a source's modifiers
actually changed or a base stat did (tuning is live-editable, so a debug-window slider has to
take effect immediately) — comparison against the last-seen base is against a reused scratch
object, not a fresh allocation, because this runs on the firing path.

**Constrains:** the item system (#M3, not yet built), curses and character passives all plug in
the same way — a source key and a modifier list — rather than each inventing its own place to
apply a bonus. Promille's damage and fire-rate bonuses (`syncPromilleModifiers` in `sim.ts`) are
the pipeline's first real consumer, replacing the multiplier getters `stepShooting` used to read
directly; nothing else should reach around the pipeline to read `tuning.shooting.shotDamage` (or
any other stat's base tuning field) expecting it to be the final value.

## 15. An item's hooks are real functions, not an interpreted primitive set — and dispatch order is id order, never pickup order

**Decided:** M3. **Issue:** #26.

`docs/GAME_DESIGN.md` §8 calls an item "data plus hooks": `modifyStats`, `onShoot`,
`onProjectileSpawn`, `onHit`, `onKill`, `onDamageTaken`, `onRoomClear`, `onFloorStart`, `onTick`
(`sim/item/definition.ts`, plus `onPickup`/`onRemove`/`onActivate` for lifecycle). This is
deliberately **not** built the way an enemy is (#7/#14: named behaviour primitives an engine
interpreter runs) — a primitive per possible item effect is a primitive added every time #29
authors one, the exact scaling failure #7 built primitives to avoid for enemies, just moved one
layer over. Instead a hook is a real function, and the `content-is-data` lint rule still holds
for the *file*: a content item imports only types (`ItemDefinition`, `ItemHookContext` and
friends), never a value, so adding an item is still mechanically a data change even though the
data now contains function values. A hook's body is free to call anything on the `sim: GameSim`
it's handed (structurally typed — `sim/item/definition.ts` imports `GameSim` with `import type`
only, so there is no runtime circular import even though `GameSim` itself imports `ItemRegistry`/
`ItemInventory`), which is the same access every engine-owned system already has; an item hook is
effectively a tiny system an author writes once per item instead of once per feature.

`modifyStats` is the one hook kept pure — `(state: ItemRuntimeState) => ItemStatModifier[]`, no
`sim` — so it stays inspectable without a running simulation and resolves through #14's stat
pipeline under the source key `item:<id>` (`itemStatSourceKey`). `GameSim.pickUpItem`/
`removeItem` mark the item's contribution dirty and re-fold it immediately; a hook that changes
`state.count` mid-tick (stacking on kill, say) can also mark it dirty for `GameSim` to pick up at
the top of the next `step()`, the same two-writers pattern `syncPromilleModifiers` already used
for Promille's tier. Removing an item's last copy clears its stat source outright rather than
registering an empty modifier list, which combined with `modifyStats` being pure is what makes
losing an item **exactly** restore the prior value (#26 acceptance criteria) rather than
approximately.

**Deterministic hook ordering** — the issue's own flagged risk, and the reason a naive "dispatch
in pickup order" design was rejected outright: two items both modifying the same stat, or both
reacting to the same kill, must resolve the same way regardless of which one a run picked up
first, or a shared seed stops reproducing the run it recorded. `ItemRegistry` sorts every
definition by `id` at construction, once, never touched again — registry index is id order by
construction. `ItemInventory` keeps the ids a run actually holds (`heldOrder`) in ascending
registry-index order at all times, an insertion-sort/shift on pickup/removal rather than a
sort-on-read, so `forEachHeld` — what every broadcast hook (`onTick` and the seven event hooks in
`sim/systems/items.ts`) walks — is always id order, never acquisition order, with no per-dispatch
sort cost.

**Constrains:** #27 (projectile tags) is the composition layer above this — tags live on
projectiles, not as another item hook, and this issue does not touch them. #28 (pools, pedestals,
pickup UI) owns actually offering an item to a run and putting `GameSim.pickUpItem`/
`useActiveItem` behind a button; #26 only had to make the mechanism correct and cheap. #29
(authoring 25+ items) will be the first real pressure test of whether "a hook function" is
enough expressiveness without becoming "a hook function that reaches around `sim` into private
state" — if a pattern repeats often enough there, extracting a couple of shared helpers (not a
primitive interpreter) is the natural next step, the same way `addPush`/`applyDamageAt` already
are for systems code. `onTick`'s budget — under 0.5 ms for 40 held items — is proven directly
(`tests/unit/item-hooks.test.ts`) against `stepItemTick`, not folded into the whole-game
stress-scene benchmark (`docs/TECH_STACK.md` §3), since the stress scene carries no items yet.

## 16. Tag conflicts resolve through two fixed priority orders, not a synergy table

**Decided:** M3. **Issue:** #27.

A projectile carries a bitmask of behaviour tags (`sim/projectile/tags.ts`) rather than a
discriminated kind, because the whole point — per #27's own framing, and `docs/GAME_DESIGN.md`
§8 — is that a bouncing, splitting, homing shot has to simply work without either item that
granted those tags ever knowing about the other. Most tags never interact, but two decisions
are not free: what a shot does when it survives a hit (nothing, or `bouncing`, or `piercing`, or
`sticky`) and what owns its position each tick (velocity nudged by up to three tags, or
`orbiting` replacing position outright). An N×N table answering those for every pair does not
scale past a handful of tags — the acceptance criterion "adding a tag does not require touching
existing tags" rules it out directly. Each of the two questions instead resolves through one
fixed priority order, chosen once: `sticky` beats `piercing` beats `bouncing` beats nothing, and
`orbiting` beats `homing`/`returning`/`arcing`, which compose with each other in that order
rather than competing. `splitting` and the three status tags (`burning`, `freezing`, `poison`)
never entered either order — they are `sim/projectile/behavior.ts`'s `resolveProjectileHit`
firing an out-of-band effect (spawn children, set a duration) rather than deciding what happens
to the shot itself, so they compose with every other tag for free. The full reasoning for each
order, including why `piercing` beats `bouncing` specifically — the pair the issue names by
name — is written where it is used, in `sim/projectile/tags.ts`'s doc comment, rather than
duplicated here.

**Constrains:** a thirteenth tag joining one of the two families only has to say where in that
family's fixed order it slots in; a tag that does neither (fires on a hit, or ticks every frame,
like `splitting`/`burning`/`freezing`/`poison`) needs no order at all. #29 (authoring items) is
what will actually grant these — an item's `onProjectileSpawn` hook mutates the shot it is
handed exactly the way any other hook does (`addProjectileTag`, `sim/projectile/tags.ts`), so
this issue never had to grow `ItemHooks` a new member. Burning/freezing/poison read and write a
new `GameSim.statusEffect` field, indexed by slot the same way `flash`/`spawnBounce` already
are rather than gated behind the ECS component mask — the first status-effect state the engine
has, and the shape a later item that cleanses or reacts to one specifically would extend rather
than replace.

## 18. An item's Promille requirement is enforced once, at dispatch — never re-checked per item

**Decided:** M4. **Issue:** #32.

`ItemDefinition.promilleRequirement` (#26) existed before this issue as honest, checked data —
`ItemRegistry` validates it, `sim/item/pool.ts` filters offers by it — but nothing made a held
item's *hooks* actually turn off outside its tier. Before #32, exactly one item
(`ruhige-hand.ts`) implemented this itself, with a bespoke `onTick` toggling `state.charge`
against a hardcoded `0.5` constant; every other `sober`/`rausch` item (Maßkrugstemmen,
Fingerhakeln, Zwoa-drei-gsuffa) ran its full effect unconditionally regardless of tier. Fixing
that per item does not scale any better than #15's rejected per-effect primitive would have —
every future gated item's author would have to remember, and get right, its own copy of the same
tier check.

Instead `promilleRequirementMet(requirement, tier)` (`sim/game/promille.ts`, alongside the other
pure tier functions) is the one place the mapping lives — `'any'` always true, `'sober'` exactly
`tier === PromilleTier.Nuchtern`, `'rausch'` exactly `tier >= PromilleTier.Vollrausch` (never
`===`, so Trinkfest's Sturzbesoffen/Filmriss stages, #92, stay `rausch` too) — and every hook
`sim/systems/items.ts` broadcasts checks it before invoking the item's hook at all. An item that
never reads `ctx.sim.promille` still turns off correctly, because the engine never calls it
outside its tier in the first place. `onPickup`/`onRemove` are deliberately exempt — they are not
dispatched from `items.ts`, so they always run, which is what keeps "losing an item returns the
player to exactly the prior state" (#26) true regardless of the tier at the moment it is lost.
`onActivate` (a direct call from `GameSim.useActiveItem`, not a broadcast) gets the same check at
its one call site instead, for the same reason. `modifyStats` is the one hook this cannot gate at
call time alone, because #14/#15 already made it a cached, dirty-flagged source rather than
something re-read every tick — `GameSim.syncItemPromilleGate` is the "cheap check every tick,
rebuild only on the rare tick a boundary is crossed" companion (the same shape
`syncPromilleModifiers` already uses for Promille's own contribution) that marks a held gated
item's stat source dirty the tick its gate actually flips, so `syncItemStatModifiers`'s own
per-item check has something to act on even when no hook ever calls `refreshItemStats`.

**Constrains:** every `sober`/`rausch` item authored from here on is gated for free — the field
already existing (#26) was the data half of this; #32 is what makes that data mean something at
the engine level, so "add the next gated item" stays a pure content change, never an engine
change. A future hook added to `ItemHooks` that is broadcast from `items.ts` inherits this gate
automatically by living in that file's dispatch loop; one called directly from `GameSim` (the
`onPickup`/`onRemove`/`onActivate` pattern) needs its own call to `promilleRequirementMet` at
that call site, the same way `useActiveItem` does, if it is meant to be gated at all.

## 17. Accessibility settings are app-layer state, never `GameSim`/replay state — and the neutral reskin is a display-layer switch, not a sim one

**Decided:** M4. **Issue:** #33.

Camera-sway intensity, no-drift mode and the neutral reskin all needed somewhere to live, and
the tempting place — right next to `PromilleTuning`'s other knobs — is wrong: `tuning.promille`
is read inside `GameSim.step()`, and a value read there has to either be part of the seed/input
log contract (`docs/DECISIONS.md` #3) or be the one documented exception `PromilleTuning.current`
already carves out for itself (the debug slider). A player's sway preference is neither — it must
be free to change mid-run without being a desync risk, and two viewers of the same replay with
different accessibility settings must see the same simulation regardless. So `GameSim` grows
three plain instance fields instead — `swayScale` (already there, pre-#33), and this issue's own
`driftScale`/`wobbleScale` — the same shape `screenShakeScale`/`rumbleScale` already established
for exactly this reason. `app/settings.ts` owns the persisted source of truth (a versioned
`localStorage` blob) and pushes it onto whichever `GameSim` is live; a restart's fresh `sim`
gets it re-applied, same as `viewTextures`'s own note about what does and doesn't survive one.

No-drift zeroes `driftScale`/`wobbleScale` only — `promilleDamageMultiplier`/
`promilleFireRateMultiplier` never read either field, so the stat bonuses are provably untouched
(`tests/unit/promille.test.ts`), which is this project's concrete reading of the issue's
"does not change the difficulty balance enough to invalidate leaderboards" (no leaderboard exists
yet to invalidate; the standard applied instead is that no-drift changes movement/aim feel and
nothing else measurable). Screen distortion is deliberately excluded from `driftScale`'s scope:
the issue's own words are "keeps the Promille stat bonuses and the visual language, removes the
movement and aim penalties," and the distortion is the visual language, not a control penalty.

The neutral reskin is display-only in the stronger sense: nothing in `sim/` even has a
`neutralReskin` field. `sim/game/promille.ts` exports a parallel string table
(`promilleTierDisplayName`/`promilleKaterLabel`/`promilleMeterLabel`/`promilleUnitSuffix`) that
every player-visible call site — `PromilleHud`, the `O`-overlay debug text in `app/main.ts` —
reads through with `settings.neutralReskin` as a plain argument. One call site deliberately keeps
the classic name unconditionally: `GameSim.syncPromilleModifiers`'s stat-modifier source label,
which only ever reaches the dev-only stat inspector (`src/debug/panels/stats.ts`) and functions
as an internal identity string as much as a display one — threading a rendering setting into
`GameSim.step()` for a debug-only label was judged not worth the boundary risk it would set as
precedent. The death-word pool (`content/death-words.ts`) is out of scope for the same audit for
a different reason: `'Umgfalln'` there is one of five general Boarisch death exclamations shown
for *any* death, not a reference to the Promille tier of the same name — reskinning it would mean
touching an unrelated content system, not closing a leak in this one.

**Constrains:** the next accessibility toggle (#53's fuller suite) follows the same shape —
a plain `GameSim` field if it changes per-tick math, a `settings.ts` flag read directly at the
call site if it only changes a label, sprite key or colour. Neither kind is `tuning`, and neither
kind needs a determinism story.

## 19. A content gap degrades gracefully, logged, at runtime — and still fails loudly in CI

**Decided:** M5. **Issue:** #37's follow-up. **Generalises:** #4's pool overflow policy.

Floor 2 shipped with a room whose boss spawn group had exactly one choice, `grosse-kellerassel`
(Floor 1's boss), authored `maxFloor: 1` — correct the day it was written, since Floor 2 was not
yet reachable, and silently wrong the moment a later change made it reachable for real:
`compileRoomTemplate` threw from inside `app/main.ts`'s door-transition code, uncaught, which
stops the frame loop entirely. A player mid-run does not see an error message; they see the game
freeze. The schedule guarantees this keeps happening — #38-#43 are six more floors' worth of
bosses and rosters landing on their own timeline, each one a window where a floor's room content
exists before its full roster does.

The fix is not "author content faster." It is that a *content gap* — something not authored yet,
as opposed to something authored wrong — must never reach a player as a dead end, the same
standard #4 already holds resource exhaustion to: `SlotPool`'s overflow policy recycles the
oldest projectile rather than crash the frame, logging once via `warnOnce` so the gap stays
visible without spamming every tick it recurs. `sim/room/template.ts`'s `nearestFloorChoice` is
that policy applied to authored-content gaps: when a spawn group has no choice covering the
floor being built, it does not throw — it falls back to the choice whose floor range is closest
(Floor 2's boss room falls back to Floor 1's boss until #38 lands Der Stier), and logs once per
`(room, group, floor)` combination, dev-build only, naming exactly what to author to make the
warning go away.

**The boundary this does not cross:** a content gap earns a graceful fallback because the *shape*
of the data is still trustworthy — the choices that exist are real, registered enemies, just not
enough of them yet. An actual content bug — an enemy id that doesn't resolve
(`sim/enemy/registry.ts`), a transition to a state that doesn't exist, a room's `cells.length`
not matching its declared shape — stays exactly as loud as decision #7 already made it: thrown at
compile/construction time, failing the build, never silently absorbed. The test in the room-load
path this decision protects (`tests/content/rooms.test.ts`'s "rejects an unknown enemy in a spawn
group") is right next to the one proving the fallback (`"falls back to the nearest-floor
choice..."`) for exactly this reason — the two are meant to read side by side as where the line
sits. Runtime grace is not a substitute for CI catching the gap in the first place, either:
`tests/content/room-floor-eligibility.test.ts` compiles every room template against every floor
its `floorTags` claim it works on, so this exact class of gap still fails a pull request's tests
— the runtime fallback is what happens on the rare gap that reaches a player anyway (a floor
that was never test-covered, a future case the eligibility test's own coverage doesn't reach),
not a reason to stop treating a missing choice as a bug to fix.

**Constrains:** a future "is X ready for floor N" question in the engine — a boss encounter, a
hazard, a set piece with no per-floor authored version yet — reaches for this same shape before
inventing a new one: fall back to the nearest authored alternative, log once, dev-only, naming
what's missing. It does not apply to a system with no sane fallback to reach for (a shop with no
stock to sell is not "fall back to Floor 1's shop stock," it's a genuinely different bug) — this
decision is about *data* gaps in a *chosen-from-several* shape, the same shape `SlotPool` and
`spawnGroups` both already have, not a general license to swallow every runtime error.

## 20. Aim is eight-way on every device — no mouse, no free-angle stick

**Decided:** M6. **Supersedes:** #8's analog/digital split.

Playtesting the floors that exist so far kept turning up the same complaint about the two aiming
modes #8 built for: a mouse loses the twin-stick feel the arrow keys already have, and a free
stick angle is hard to land precisely under time pressure — the exact "aiming at a point" cost #8
already named as the reason analog aim needed its own, lower sway value in the first place. Isaac,
this project's own reference for "feels good to shoot" (`docs/GAME_DESIGN.md` pillar 1), never had
free-aim at all; adding it here bought a control scheme none of the roster or item design actually
needed, at the cost of the frame carrying a flag whose only job was to make one input source feel
less bad than it otherwise would.

So aim is eight-way, full stop, on every device: arrow keys as before, and the gamepad's right
stick now snaps to the nearest of the same eight directions (`app/input/sampler.ts`'s
`snapToOctant`) rather than reporting a free angle. Mouse aim is removed rather than kept as an
alternate input — a player who prefers the mouse undermines the exact contrast a future free-aim
item (see below) would need to read as a change, and every input-only branch it justified
(`KeyboardMouseSource`'s pointer tracking, `app/main.ts`'s pointer-to-room-coordinate mapping, the
mouse fire button) went with it.

This also retires #8's own reason for existing: with nothing left that produces a point-aimed
shot, `InputFrame.analogAim` and `ShootingTuning.analogVelocityInheritance` are dead branches, not
dormant ones, so both are gone rather than kept unused — `INPUT_FRAME_BYTES` drops from 6 to 5
accordingly, an internal recording format with no persisted save files depending on the old shape.

**Constrains:** a genuinely free-angle aim mode is still a legitimate thing for this game to have —
the sway-wobble problem #8 described for a mouse or a stick is exactly what would make a rare,
*bad* item ("your aim gets harder to control") land as a real downside rather than a strict
upgrade. That item, when it's built, re-derives its own analog-aim plumbing from what it actually
needs rather than resurrecting this decision's flag unchanged; nothing here is being kept dormant
on the bet that the shape will still fit.

## 21. Enemies push each other apart too, identified by `enemyMask`, not by collision layer

**Decided:** M6. **Enforced by:** `sim/systems/enemy-contact.ts`.

`sim/systems/contact.ts` already keeps the player from standing inside an enemy or obstacle;
nothing did the same between two enemies, which is exactly why a boss split
(`splitFromEvent`, `systems/enemy.ts`) spawns its children in a ring and then lets them drift
back on top of each other forever. `stepEnemyContacts` is the same mass-split position
correction, run as its own pass over every unordered pair of enemies rather than folded into
`stepContacts` — reusing the same tick's broadphase, immediately after it.

The one surprise: filtering candidates by `CollisionLayer.Enemy` — the obvious thing to try,
since `contact.ts`'s own `SOLID_LAYERS` already names it — silently resolves nothing, because
every body `spawnTarget` creates (a real, authored enemy included) is tagged
`CollisionLayer.Obstacle`. `CollisionLayer.Enemy` is declared and reserved but nothing has ever
set it. `stepEnemyContacts` instead identifies a real enemy the same way `stepEnemies` already
iterates them: `(sim.world.masks[index] & sim.enemyMask) === sim.enemyMask`, the `enemy` +
`enemyMotion` component pair. This sidesteps the layer gap rather than closing it — actually
setting `CollisionLayer.Enemy` on every enemy is a separate, wider change (everything that reads
`SOLID_LAYERS`/`DECLARED_PAIRS` would need auditing against a layer newly being real) that
nothing here needed to make correct.

**A second, pre-existing bug surfaced by building this**: `contact.ts`'s own separation math had
`owed = otherWanted + moveClear(...)` where the first half of the same function correctly used
`owed = wanted - moveClear(...)` — `moveClear` returns how far a body actually got, not how far
a wall refused it, so the second `owed` should subtract the same way the first one does. Added
instead of subtracted, `owed` came out strongly positive whenever the far side's move was
unblocked (the ordinary open-room case) rather than zero, and the player then got shoved an
extra, unwanted distance on top of their own already-correct share on every contact that wasn't
against a wall. Fixed in `contact.ts` — `tests/unit/contact.test.ts`'s "resolves the overlap
exactly, without overshooting" is the regression lock, added because the existing player-vs-enemy
tests only checked the loose "stopped overlapping" invariant, which the overshoot still satisfied.

**Deliberately not `moveClear`:** `stepEnemyContacts` does not share `contact.ts`'s own
wall-aware move-with-fallback — an early version did, calling it up to three times per resolved
pair (mirroring `resolveAgainstPlayer` exactly), and the frame-time benchmark's stress scene (200
enemies, all `walkTowardPlayer`, converging and staying overlapped indefinitely) caught it: the
extra cross-function-call arithmetic, paid per overlapping pair rather than once for the player,
inflated the simulation's per-tick heap-allocation floor (`tools/bench/select.mjs`'s "least noisy
of three runs" number — see `tests/bench/frame-time.test.ts`'s own doc comment on where that
residual cost comes from: a `number` boxed at a call boundary V8 did not inline).
`stepEnemyContacts` moves each body once, straight into the transform, gated on one inlined
`room.isClear` check apiece — no wall-slide fallback, no "what a wall refused, the other body
owes" redistribution. A body a wall blocks this tick just tries again next tick, against the same
still-overlapping neighbour, which converges in practice. That correctness gap is one this file
can afford and `contact.ts` cannot: nobody reads an enemy's exact pixel against a wall the way
they read the player's.

**Five attempts at the broadphase question**, on the frame-time benchmark's stress scene (200
enemies, all `walkTowardPlayer`, converging and staying clustered indefinitely — deliberately
adversarial for whatever this pass does). The first four went through CI, one theory at a time;
each theory turned out wrong, confirmed wrong by the next attempt changing exactly the variable it
named and getting either no change or a new failure back:

1. Reuse the tick's `sim.broadphase.query(x, y, radius, visit)`, called once per enemy to find
   its neighbours — the obvious move, since `stepContacts` already does this for the player. Left
   "Simulation heap" red: 54.4 KB/tick against a 37.5 KB baseline, well past the gate's 16 KB
   floor. Working theory: pixel doubles boxing at a call boundary V8 doesn't inline, the same
   residual cost the benchmark's own doc comments already name — paid once a tick for the player,
   paid 200 times here.
2. Drop the broadphase and walk `world.highWater`/`world.masks` directly, comparing every enemy
   pair with a plain O(enemies²) nested loop, fully inlined. This got "Simulation heap" green (51.7
   KB/tick, just under the floor) but pushed "Simulation tick" past its own tolerance band: at the
   clustered stress population, cells still meaningfully bound the broadphase's own candidate
   count even when everyone is nearby, so an unconditional ~20,000-pair sweep does measurably more
   comparisons than a grid ever would have.
3. Testing attempt 1's theory directly: `queryBox`'s cell-range walk was split out as its own
   method, `queryCells`, so a caller could compute the column/row bounds itself in local doubles
   and hand the grid only integers — a Smi, never boxed regardless of inlining. This did not move
   the number at all: 54.4 KB/tick again, to the same tenth of a kilobyte as attempt 1. **Theory 1
   refuted** — argument type crossing into `SpatialHash` was never the variable.
4. New theory: an *indirect* call through a stored reference — `query`'s `visit` parameter — costs
   something a *direct*, statically-named call doesn't, at a couple-hundred-per-tick frequency.
   `stepEnemyContacts` was rewritten to build its own grid over enemies only (a counting sort into
   `cellStart`/`bucketed`, `SpatialHash.build`'s technique, scoped down and never touching the
   shared instance), finding candidates via the standard self-plus-forward-four cell sweep, and
   resolving each pair by calling a `resolvePair` function directly, by name — never through a
   stored parameter. Still regressed heap (54.3 KB/tick). **Theory 2 refuted** — the call being
   indirect was never the variable either; a direct call at this frequency cost the same.
5. At this point CI round-trips (five pushes, each a two-to-three-minute cycle to learn one
   number) had stopped being a productive way to find the actual variable, so the search moved
   local: `sim.ts`'s call to `stepEnemyContacts` disabled, a harness built from
   `tests/bench/scene.ts`'s real stress scene and `tests/helpers/allocation.ts`'s `bytesPerPass` —
   the same instrument the real gate uses — measuring `stepEnemyContacts` added back in isolation,
   several variants side by side in one process. That surfaced two things a single CI number never
   could: first, run-to-run variance locally was large enough that a single measurement was as
   likely to mislead as a single CI round-trip had been — `select.mjs`'s "two stable V8 modes"
   comment, confirmed directly, meant every variant had to be measured several times and compared
   by its low mode, not its first reading. Second, once that noise was controlled for, the ordering
   was unambiguous and reproducible: a grid that only builds the counting sort and never resolves
   a single pair measured statistically indistinguishable from zero (-2.9 KB, i.e. noise); the same
   grid calling `resolvePair` per candidate measured +16.6 KB; the same grid with `resolvePair`'s
   body inlined directly into both sweep loops instead of called measured +13.6 KB — under the 16 KB
   floor, and close to the fully-inlined O(enemies²) loop's own +11.3 KB. **The actual variable was
   never argument type or direct-vs-indirect — it was whether a separate function got called from
   the pair-resolution path at all**, direct or indirect, doubles or integers. `stepEnemyContacts`'s
   final shape keeps attempt 4's grid (still bounds the candidate count, fixing what attempt 2 got
   wrong) but inlines `resolvePair`'s body into both loops instead of calling out to it — the two
   near-identical copies are the cost of that, paid once in the source rather than every tick.

The general lesson, not just this file's: **a plausible mechanism is not a measurement.** Four
attempts here were each built on a specific, well-reasoned theory about *why* — and three of those
four theories turned out to explain nothing, confirmed wrong only because the next attempt happened
to isolate the named variable. A synthetic reproduction of the suspected shape (a toy object, a toy
callback, called a few thousand times) also failed to reproduce the regression at all when tried in
isolation — whatever V8 was actually doing depended on something about the real `GameSim`/real
stress-scene scale that a small stand-in didn't carry, which is itself worth remembering next time
a synthetic microbenchmark is tempting as a shortcut around the real one. What finally worked was
building a same-process A/B harness against the real scene using the project's own measurement
primitives, isolating one variable at a time, and reading the *low* mode across repeated runs
rather than the first number that came back — the CI gate's own methodology (`select.mjs`), applied
locally once CI itself had stopped being a productive way to iterate.

**Constrains:** a future system that needs to tell a real enemy apart from an inert body
(a training target, a pickup, an obstacle prop) reaches for the `enemyMask` component check
first, not a collision layer — the layer only reliably distinguishes `Obstacle`-tagged bodies
from projectiles, the player and pickups today, not enemies from non-enemies. And a future
per-pair system called once per body in a population sized in the hundreds reaches for its own
scoped grid, with the pair-resolution math inlined directly into the sweep rather than factored
into a helper — direct or indirect, a separate function in that specific path measurably cost
something here, for a reason still not fully explained by any one mechanism tried above.
`sim.broadphase`'s `query`/`queryBox`/`queryCells` all stay right for a call made once or a
handful of times a tick (the player's own contact pass, a single explosion radius); called once
per body at a population in the hundreds, whatever that per-call cost is stopped being residual.
Before spending another round of CI pushes on a theory about *why* a regression like this exists,
reach for a local same-process A/B against the real scene first — it is faster, and, per every
attempt above but the last, more likely to be right.

---

## 22. Content stops at two floors until those two are finished — floors 3-7 are parked, not cancelled

**Decided:** end of M5. **Supersedes:** the M5→M6 sequencing in the original
[`ROADMAP.md`](ROADMAP.md). **Issues:** #39-#44 and #98 relabelled `M10`.

The original plan built all seven floors (M6) and polished afterwards (M8). It no longer does.
Content stops at Der Keller and Dorf & Acker, and M6 through M8 finish *those two* — look and
motion, meta-progression, sound and menus, balance — before a third floor exists.

The reason is a sentence the old roadmap already contained and then sequenced against:
*"whatever polish level floor 1 reaches becomes the standard every later floor must match."*
That standard is not knowable in advance and does not hold still. Every decision M6 makes — how
many frames a walk cycle has, what a hit flash costs, how much a room's props carry, what the
palette permits — is a decision every authored floor has to match, and each one that moves after
the fact is rework multiplied by the number of floors already built. Discovering the animation
budget on two floors costs two floors of rework. Discovering it on seven costs seven, and the
discovery is guaranteed, because M6 is the milestone that finds out.

The evidence that the bar had not in fact been set: at the point this was decided, M5 was 4/7
and its exit criterion claimed *"two finished chapters, art, audio, enemies and bosses."* The
build had no animation system at all, no player sprite (Sepp was drawn by
`render/placeholder-art.ts`, explicitly a stand-in "until #34"), no boss art, no projectile art,
no wall tiles, no audio behind `app/audio/`'s two deliberately-silent seams, no title screen, no
pause, and no way to win — `advanceFloor` wrapped floor 2 back to floor 1 forever. A milestone
whose exit criterion says "finished" over that gap is a milestone measuring the wrong thing, so
M5's criterion was narrowed to *content* complete and the finishing was given its own milestones.

**What this constrains:**

- **M6 sets the bar M10 inherits.** Frame counts, sprite sizes, palette discipline, effect
  density — write down the budget along with the decision, because five parked floors will be
  authored against it and "we'll see what floor 3 needs" is exactly the deferral this entry
  exists to stop.
- **Replayability has to come from systems, not scenery.** Two floors is roughly fifteen
  minutes. M7 stops being the milestone that adds nice-to-haves after the content and becomes
  load-bearing: unlocks, characters, curses, item sets and a run that can actually be won are
  now the entire answer to "why start a second run". If that answer turns out to be
  insufficient, the honest response is unparking M10 sooner, not adding more meta-progression.
- **Anything scoped "per floor" is scoped to two.** #51 writes two floor themes, #54 tunes a
  two-floor difficulty curve, #58 tells a story that opens in the cellar and lands on Der Stier
  rather than on Die Bavaria. Each of those is a rewrite rather than a trim, and each parked
  floor brings its own share back when it unparks.
- **Parked is a first-class state in the tooling, not a note.** `tools/roadmap/plan.json` marks
  a milestone `parked` with the reason; `update-roadmap.mjs` renders it with ⏸️ and excludes it
  from the headline bar, so deferring scope does not make the one number at the top of the
  roadmap go down. Deferred work is not work the project is failing to do.

**Settled in the same session, once the shape was agreed:**

- **The two-floor game ships.** M9 releases it on itch.io, free or name-your-price, honest on the
  store page about being two chapters of seven — before M10 exists. This is the load-bearing half
  of the refocus, not a consolation for it: parking five floors is only defensible if the two that
  remain get in front of strangers, because the whole argument above is that the bar is discovered
  rather than specified, and players are how it gets discovered. A refocus that deferred content
  *and* deferred release would defer the evidence too.
- **Steam and the desktop shell move with the floors.** #70-#72 and #57 want a paid store page, a
  wishlist runway, and enough game to justify both; #57's own "revisit if" clause already named
  this case. itch.io asks none of that and reaches strangers today.
- **The story ends on a cliffhanger rather than moving its reveal down.** Der Stier closes chapter
  two; "it was scale, not malice" stays on floor 6 where it was written to live. The alternative —
  relocating the evidence into the cellar and the village — buys a complete arc at the cost of
  the reveal M10 is built around, and spends writing that would then have to be undone. The risk
  taken instead is execution risk, and it is real: to a stranger with no roadmap, a bad
  cliffhanger and an unfinished game look identical. #58 carries an acceptance criterion that
  makes the difference testable rather than assumed — a playtester who has never seen the roadmap
  calls it a cliffhanger, unprompted, in a #159 session.
- **M7's bet gets called on a date, not a metric.** When M7 closes, play it and judge whether a
  second run is compelling; if not, unpark M10 rather than adding more meta-progression. A
  threshold would be gameable and would arrive late (telemetry only exists after M8); a scheduled
  judgement cannot slide quietly, which is the failure mode being guarded against.

The alternative considered and rejected: build floors 3-7 to the current (placeholder-tier) bar
and polish all seven together at the end. That is the plan that produces seven floors of art
needing rework the day the art direction lands, and it is the plan that makes M6's own
sequencing note — *"this is where the schedule goes wrong on projects like this"* — come true
rather than avoided.

## 23. A hit's stagger is local to the body struck, not a freeze of the whole simulation

**Decided:** M6, from a playtest report of "hard stuttering" when an item combo's burning shots
hit several enemies at once. **Amends:** #6.

`requestHitstop` (#6, #13) froze all of `GameSim.step` for a couple of ticks on every landed
hit — flat CPU cost, correctly measured as negligible by the benchmark (#16), because a frozen
tick returns immediately and does almost no work. What the benchmark could not see, and what it
says so explicitly in its own scene builder, is that this is a *stall*: "a scene with hundreds of
hits a tick would spend most of its ticks frozen." Measured directly (a scratch harness, not
checked in): an ordinary 8-enemy room at the base, unmodified fire rate already spends **12.5%**
of real ticks with the entire game halted; doubling the fire rate — one item's worth — pushes
that to 18.5%. A burn tick lands on every body it is ticking for on the same simulation tick
(duration is set once, per hit, and counted down in lockstep), so a shot that burns a handful of
enemies turns that baseline cost into a visible, rhythmic, whole-screen freeze several times a
second. None of this shows up as a CPU regression; it shows up as the game feeling like it
stutters, because for the player it *is* stuttering — the frame budget was never the problem.

Fighting games freeze both parties on a hit and it reads as weight, but that convention is built
for two participants and rare, discrete hits. A horde shooter's whole premise is many hits a
second against many bodies, and a hit rate high enough to matter will always find a way to
synchronise a freeze — burning several enemies at once is simply the fastest way to notice a cost
that was already there in ordinary fire.

The fix keeps the same felt package (flash, a stagger, knockback, shake, foam — #6 is otherwise
unchanged) but scopes the stagger to the body that was hit: `GameSim.hitStun`, a per-slot counter
next to `flash`, read by `stepEnemies` to skip one body's own decision-making for a few ticks
while everything else in the room keeps moving. The player is never staggered by anything —
being hit already has i-frames, knockback, flash and shake; freezing someone's own controls on
top of that is not juicier, it is dropped input — and a kill asks for no stagger at all, since the
body is leaving the world anyway and a kill already reads bigger through its own flash/shake/
particle numbers. `requestHitstop`/`hitstopTicks`/`sim.frozen` still exist and still mean a real
whole-simulation freeze — they are still exactly the right tool for the rare, deliberate,
single-actor case (the player's own death cinematic in `app/main.ts`, a pedestal/pickup reveal
pausing the game for a beat) — combat is simply the one thing that no longer goes through them.

**Constrains:** a system that wants "this body is momentarily out of action" reads `hitStun`
(`stepEnemies` is the only one that does today) rather than assuming a hit implies the whole tick
did nothing; a system that wants "the whole game paused for a beat" for a rare, singular reason
still reaches for `requestHitstop`, but combat is never that reason again.


## 24. The premise is a raisin in one family's beer, not a general adulteration — and the protagonist is Alois

**Decided:** M6, in a story review before #58 (story delivery) was written. **Amends:** #22.
**Supersedes** the premise as it stood in `GAME_DESIGN.md` §2 and `README.md` since M0.

The old premise: someone is cutting Bavaria's beer with cola, lemonade and syrup, the land goes
sour, **Sepp** taps a keg and goes to find the source. The reveal was *scale, not malice* — the
shortcut that fed six million Wiesn visitors ate the soul of the thing, and Die Bavaria is
poisoned by her own festival.

The new premise keeps the arc, the floor order, every boss and the final boss, and replaces what
sits under them. **Alois** is at his grandparents' in **Oberniederburg** for Sunday lunch, goes
down to fetch another **Pfeitinger**, and finds the next crate carries a new label and an
ingredient list reading *water, malt, hops and raisins*. The reveal moves from an economic
argument to a single withheld fact: **the raisins are not raisins**, delivered on floor 6 by
breaking open Die Abfüllanlage's dosing hopper, and never explained.

**Why the change is worth the rewrite, given #22 spent real argument on the old reveal:**

- **A specific grievance beats a general one.** "Someone is adulterating Bavaria's beer" is a
  state of the world; "there are raisins in Opa's beer" is a thing that happened to somebody at
  a table on a Sunday. The second one puts a reason to be in the first room *in* the first room,
  which is exactly what the tutorial floor was missing.
- **The raisin is a better costume than cola.** `GAME_DESIGN.md` §2's second layer needs a
  surface joke daft enough to laugh at and a subject too heavy to name. Cola-in-beer is only the
  first; a raisin is genuinely polarising, genuinely trivial, and carries "something people
  cannot stop" without the word ever being used. It is a *lighter* vehicle for the identical
  point, which is what makes the point sayable at all.
- **The reveal got smaller, on purpose.** #22 defended "it was scale, not malice" as worth
  waiting five parked floors for. It is replaced by less, not more: a fact withheld rather than
  a thesis argued. A chemical or economic explanation of the raisins would convert a joke into
  homework, and a boss fight is a bad place to read an argument. What survives from #22 is the
  part that mattered — the reveal stays on floor 6, in M10, rather than being relocated down
  into the shipping two floors.
- **The chapter-two cliffhanger got testable.** #22 and #58 accept a cliffhanger on the
  criterion that a playtester calls it one unprompted, and flagged that a bad cliffhanger and an
  unfinished game look identical to a stranger. Chapter two now ends on a loaded delivery lorry
  leaving the village square southbound — a direction rather than a fade, which is a far more
  legible promise to have made.

**What this constrains:**

- **The corrupted beer is never something the player drinks.** Every beer *pickup* during a run
  is the *old batch* — the same Pfeitinger Alois's grandparents always drank — so Promille stays
  ordinary drunkenness and never becomes a symptom of the plot. Alois's own shot is the one
  deliberate exception: he loads the Trink-Rucksack with the tainted crate in the prologue and it
  stays his weapon for the whole run (`GAME_DESIGN.md` §2) — he is shooting it back at whoever is
  responsible, never drinking it. This is the same rule the Böller already follows
  (`CONTENT_BIBLE.md` floor 2): beyond Alois's shot, the corruption reaches the player as an
  enemy, a hazard, a labelled crate, or a tainted *item*, never as a beer they drink. A beer
  pickup that also advanced the story would put every drink in the game in argument with
  `CONTENT_BIBLE.md` §0's tone rules.
- **The addiction is narrative only. There is no third meter.** It was considered and rejected:
  a Gier axis alongside health and Promille would be the third resource a player tracks, would
  need its own HUD, its own unlock gate and its own balance pass, and would say out loud —
  mechanically — the one thing §2 requires never be said out loud. It is carried instead by
  floor 6's signage, the Rosinenklauber, Der Überzeugte, and the shape of the tainted items.
- **Two corruption tags, three answers, and `impure` is untouched.** `impure` (soft-drink mixes:
  Radler, Spezi, Russ'n, Colaweizen) keeps its current meaning and its current members. The new
  `rosinen` tag marks tainted items. **Reinheitsgebot 1516 is retuned to strip `rosinen` rather
  than `impure`** — the run is named after that law, and the pact should answer the run's own
  question. Stripping soft drinks as well moves to **Sudordnung 1493**, the real, earlier,
  stricter Landshut ordinance, for players who want the maximal pact; **Der Rosinenklauber** is
  the third answer, keeping the tainted items and paying elsewhere. Retuning 1516 rather than
  widening it keeps each pact describable in one sentence, which is `GAME_DESIGN.md` §8's hard
  rule. `tests/unit/item-effects.test.ts` and `tests/content/items.test.ts` assert the old
  behaviour and move with it.
- **A `rosinen` item never lies and never delays.** Clean item, plus an upgrade, plus one
  legible cost, stated in the description. The temptation has to survive full information or it
  is not a decision, and an item that hides its cost teaches players not to read — in a game
  whose entire inciting incident is reading a label.
- **Pfeitinger and Oberniederburg join the invented-name list and go to #55.** Pfeitinger is
  load-bearing in a way `Kellerbräu` never was: it is on crates, lorries, awnings and delivery
  notes on all seven floors, and `-inger` is the commonest Bavarian brewery ending there is.
  Check both against the register before the art is authored, not after.
- **The rename is docs-only today, and will not stay that way.** `Sepp` appears in no code and
  no content — the player is still `render/placeholder-art.ts`'s generated shape — so the rename
  costs five markdown files now. #151 (the player character's art and animation) is where it
  starts costing sprites, and it is the last cheap moment to have done this.
## 25. Pixel art is authored in a custom in-browser tool, not an off-the-shelf editor plus a lint pass

**Decided:** M6, issue #108, weighed against #34's art pipeline and #24's "build the tool before
the content" precedent (room editor).

#108 posed this as a real build-vs-buy question: Aseprite or Piskel already draw pixels well, and
palette/size/legibility enforcement could instead be a lint pass run over files authored anywhere.
That would have been the right call if enforcement were the expensive part. It is not, because #34
already built it — `tools/art/spec.mjs`, `palette.mjs`, `validate.mjs` and `contrast.mjs` are pure
functions with no filesystem or Node dependency, written expressly so a build step and a test
suite could both call them without duplicating logic. A custom tool does not re-implement
palette/size/legibility checking; it imports those same four modules straight into the browser
bundle and calls them live, on every keystroke, instead of after a save. That turns #34's
after-the-fact build failure into something stronger: a canvas that is *fixed* at each category's
maximum size (`CATEGORY_SPECS`), so an out-of-spec sprite cannot be drawn in the first place rather
than merely rejected, and a palette swatch strip sourced from `allowedColorsFor(bucketId)` that is
the *only* colour a pen tool can lay down — there is no off-palette pixel to lint for after the
fact, because the picker never offers one. A lint pass over files from an arbitrary editor cannot
make either guarantee; it can only catch the mistake later, the same way #34 already does for
anything authored outside this tool.

The precedent from #24 (room editor) generalises directly: this project already treats "the tool
that authors the content" as its own build-before-content deliverable, with a working pattern for
it — a small Vite dev-server plugin exposing one save endpoint, a browser SPA next to it, dev-only
by construction because `configureServer` middleware never runs under a production build. The
pixel-art tool (`pixel-editor.html`, `src/pixel-editor/`, `tools/pixel-editor/server.mjs`) is a
second instance of exactly that shape, not a new one.

**Constrains:** the tool's client bundle may only import the dependency-free modules under
`tools/art/` (`spec.mjs`, `palette.mjs`, `validate.mjs`, `contrast.mjs`); `png.mjs`
(a `pngjs`/Node dependency) and file-writing stay server-side, in the dev-plugin's save endpoint,
the same split `build.mjs` already draws between decoding and validation. Adding a sprite category
or changing a floor's palette means editing `tools/art/spec.mjs`/`palette.mjs` once, and both the
build pipeline and the authoring tool pick it up — there is deliberately nowhere else those
numbers are allowed to live.

## 26. `character` and `boss` sprite ceilings are raised — 16-bit is a colour/shading era, not a pixel-dimension rule

**Decided:** M6, prompted by using the pixel editor (#108) for real and asking "how is 16×16
'16-bit style'?" against reference art from the actual game `docs/CONTENT_BIBLE.md` §5 names as
its touchstone.

The bible's "16-bit era, not 8-bit" line was read, when the original `tools/art/spec.mjs` ceilings
were set, as a pixel-dimension budget — `character` capped at 16 tall, `boss` at 48×48. It is not:
"16-bit" describes a console generation's colour depth and shading complexity, not a tile size.
That generation's actual character sprites are composited from several tiles and run well past
16px tall; a single-tile ceiling under-shoots the density the bible's own reference actually has.
`tile` staying exactly 16×16 was never the problem — a background tile is a repeating unit, not
where detail lives — the ceiling that mattered was on the sprites meant to carry it.

Raised via `tools/art/spec.mjs`'s `CATEGORY_SPECS`:

- `character`: `maxHeight` 16 → 32 (`minHeight` stays 16, `maxWidth`/`minWidth` unchanged at
  8/16). The floor, not the ceiling, moved to keep every already-committed floor-1/2 character
  sprite — authored at 16 tall — legal; only new content reaches for the extra height.
- `boss`: `maxWidth`/`maxHeight` 48 → 160 (`minWidth`/`minHeight` unchanged at 17). No boss art
  exists yet, so there was nothing to invalidate. 160 authored is 320 on screen
  (`WORLD_ZOOM` = 2) against a 180-tall playfield (`src/sim/room/playground.ts`'s
  `PLAYFIELD_HEIGHT`) — deliberately close to filling it, on the reasoning that a boss is the one
  sprite category meant to dominate the screen rather than share it.

`projectile` and `tile` are untouched: a tile's whole job is to repeat identically and unnoticed,
and a projectile's legibility rule (`docs/CONTENT_BIBLE.md` §5) already caps it at something
tile-scale or smaller on its own terms.

**Constrains:** `src/pixel-editor/size-presets.ts`'s curated tiers are the numbers actually used
day to day and must stay inside these ranges — checked by
`tests/unit/pixel-editor-size-presets.test.ts` against `CATEGORY_SPECS` directly rather than by
eye, so a future spec change here is caught rather than silently leaving a preset out of range in
either direction.

## 27. Sprite pixel density is decoupled from on-screen size, and `character` width is no longer capped shorter than height

**Decided:** M6, immediately after #26, while actually redrawing the player sprite (#108's
proof-of-concept) at the new 32-tall ceiling.

Two related mistakes surfaced from doing that redraw for real rather than just raising the spec
number:

- **The player sprite rendered twice as tall on screen the moment it was redrawn at 32px instead
  of 16.** `EntityView` (`src/render/entities.ts`) already scales every enemy body to its own
  collider radius (`sprite.scale.set(radius / (referenceHeight / 2))`), so a denser enemy texture
  was always going to render at the same on-screen size — more texture pixels per world unit, not
  a bigger sprite. `GameView`'s player sprite (`src/render/view.ts`) had no such scale at all: it
  drew `textures.player` at native size, one texture pixel per world unit. That coupling was
  invisible for as long as every character sprite happened to be 16 tall, and broke the instant
  one wasn't — exactly the failure mode #26 raised the ceiling to invite. Fixed by giving the
  player the same collider-relative scale enemies already get:
  `this.player.scale.set(PLAYER_RADIUS / (textures.player.height / 2))` (`PLAYER_RADIUS` from
  `sim/game/sim.ts`). Pixel density and on-screen size are different questions; #26 answered "how
  much detail can art carry," and this is what actually keeps that answer from also silently
  answering "how big is the player."
- **`character.maxWidth` stayed at 16 while `maxHeight` went to 32**, which bakes in an assumption
  the bible never actually makes: that a character silhouette is always taller than it is wide. A
  stout body, a wide-bellied enemy, anything that reads better wide than tall was left with a third
  of the canvas height had. Raised to 32, matching the height ceiling (`tools/art/spec.mjs`).

That second fix would have been cosmetic on its own — the pixel editor's "size" control
(`src/pixel-editor/size-presets.ts`) offered exactly five named tiers per category, each a fixed
`(width, height)` pair walking width and height up together, so even with a wider `CATEGORY_SPECS`
range there was still no way to actually pick a wide-and-short canvas. The named tiers stay, as a
one-click starting point (and the only thing `tests/unit/pixel-editor-size-presets.test.ts` checks
against `CATEGORY_SPECS`), but `PixelEditorState`'s canvas size is no longer tied to picking one of
them: "New" now takes an explicit width and height (`state.reset(bucketId, category, width,
height)`), editable as two independent number fields clamped live to `CATEGORY_SPECS`'
`isWithinCategorySpec`, so any legal combination — not just the five the tiers happen to name — is
reachable.

**Constrains:** any future per-category size ceiling change only has to stay internally consistent
in `tools/art/spec.mjs`; it no longer needs a matching hand-picked tier in `size-presets.ts` to
actually be reachable in the tool. Any new sprite category added later that scales art to a
gameplay quantity (a collider, a hitbox) the way the player and every enemy do must scale by that
quantity, not draw its texture at native size — this decision is the second time that assumption
broke silently, and the fix is the same both times.

## 28. The pixel editor gets a shading brush, backed by a derived shade ramp rather than a free colour picker

**Decided:** M6, immediately after #27, once the player redraw (#108) demonstrated that layered
shading (a foam highlight, a glass condensation glint, a darker base) is what actually makes the
higher-resolution art from #26 read as detailed rather than just bigger — and hand-authoring that
shading pixel by pixel from `tools/art/palette.mjs`'s five hand-picked hues per floor is slow and
easy to get wrong (see this session's own three attempts at the player sprite).

The palette (`FLOOR_PALETTES`) is five deliberately chosen hues per floor, not five ramps — there
is no recorded "lighter" or "darker" neighbour for `cellar`'s one amber, so a brush that wants to
paint "amber, but a bit brighter" has nothing to reach for. Two options: hand-author a ramp per
colour (more numbers to keep in sync with `FLOOR_PALETTES`, and another thing `docs/CONTENT_BIBLE.md`
§5's "~40 colours overall" cap would need to account for by hand), or derive one deterministically.
Derived won: `shadeOf(color, step)` shifts a colour's HSL lightness by a fixed amount per step and
converts back, `shadeRampOf(color)` is the five tones (two darker, the original, two lighter) that
produces, and both are pure functions of the existing palette — nothing to author, nothing to keep
in sync, and (unlike a free lightness slider) a *finite* set of outputs, which matters for the
reason below.

`docs/DECISIONS.md` #25 fixed the pen tool's palette to a finite, checked set specifically so there
is no off-palette pixel to catch after the fact — a shading brush that could nudge lightness by any
continuous amount would reopen exactly that hole. `legalPixelColorsFor(bucketId)` is
`allowedColorsFor(bucketId)` plus every one of those colours' derived ramps — still finite, still
fully determined by `FLOOR_PALETTES`, just five times bigger — and is what `tools/art/build.mjs`
and the pixel editor's own save endpoint (`tools/pixel-editor/server.mjs`) now check a saved sprite
against, in place of the narrower `allowedColorsFor`. `allowedColorsFor` itself is unchanged and
still what the palette panel's swatches and a fresh sprite's default colour draw from — the pen
still only ever hands `state.selectedColor` one of the five-per-floor hand-picked hues; only the
shading brush's *output* reaches into the derived tones.

The brush itself (`PixelEditorState.shadeArea`, wired from `canvas.ts`'s pointer handlers) reads
each already-opaque pixel under a circular brush, and for each one independently rolls whether it
moves at all (`SHADE_HIT_CHANCE`, so a drag does not instantly saturate the whole brush to one flat
tone) and, if so, which direction (`palette.mjs`'s `nudgeShade`, clamped at the ramp's ends).
Independent per-pixel randomness — not "the whole brushed area moves the same direction" — is the
actual shading effect: a mix of nudged-lighter and nudged-darker pixels reads as texture/shading,
a uniform shift just reads as a flat recolour. Transparent pixels are skipped outright: shading
works on art that is already there, it does not fill blank canvas the way the pen does.

**Constrains:** any new sprite category or floor palette change is automatically shade-able with no
extra work — `legalPixelColorsFor` derives from whatever `FLOOR_PALETTES`/`allowedColorsFor`
already says. A future change to how many steps a ramp has, or how big a lightness step is, only
needs to change `palette.mjs`'s `SHADE_STEPS`/`SHADE_LIGHTNESS_STEP` — `shadeRampOf`'s length and
`legalPixelColorsFor`'s size follow automatically, checked by `tests/art/palette.test.ts`.

## 29. The pixel canvas fits its actual host, not a fixed pixel target, and click-to-pick resolves through the same live-preview wiring rather than a second "apply" mechanism

**Decided:** M6, issue #108, once the docked editor (#108's split-view follow-up) was actually used
narrow rather than only measured in its own full-width tab.

`canvas.ts`'s zoom (#26's `zoomFor`) targeted a fixed 512 CSS px regardless of how much room was
actually available. That is exactly the docked panel's own footprint at its default width, so a
512px-wide canvas plus 12px of wrap padding on each side either forced the whole page to scroll
horizontally or sat mostly out of view — and either way pushed every panel below it (Save, Palette,
Frames, **Browse sprites**) far enough down the page that loading an existing sprite read as broken
rather than merely buried. Two independent fixes, not one:

- **The fit zoom is now measured, not assumed.** `fitZoom(width, height, availableWidth,
  availableHeight)` takes the smaller of `.kb-pixel-left`'s actual `clientWidth` (a `ResizeObserver`
  on it, recomputed on every resize — the split view's divider drag changes that width without ever
  firing a window `resize` event) and a fraction of `window.innerHeight`, so the whole sprite is
  visible without scrolling in a full tab and in a docked panel dragged down to `MIN_PANEL_WIDTH`
  alike. This only measures anything because `.kb-pixel-left` also had to change from `flex: 0 0
  auto` (sized to its own content — the canvas — which is circular) to `flex: 1 1 auto` (sized by
  the layout, the same way `.kb-pixel-right` already was).
- **Browse sprites moved to the top of the right column.** Even a correctly-fitted canvas is still
  the visually dominant element on the page; "load something that already exists" is at least as
  common a first action as "start drawing", and burying its panel last, below Palette/Background/
  Frames/Legibility, cost more scrolling than the load feature's own actual complexity justified.

Wheel zoom (`onWheel`) rides on top of the fit zoom as a separate multiplier (`zoomMultiplier`,
reset to 1 whenever the sprite's own width/height change) rather than replacing it — the fit zoom
is what answers "show me the whole sprite," the wheel is what answers "let me get in close on one
corner of a 160×160 boss," and conflating them would mean either losing the guaranteed-visible
default or losing the ability to zoom past it. Zooming re-centres on the cursor's own position
(tracked in `wrap.scroll{Left,Top}` terms before and after the zoom change) rather than the
canvas's top-left corner, since the point being zoomed in on is usually not the origin.

Separately, `app/main.ts`'s click-to-pick (the last piece of #108's "click a sprite in-game to edit
it" request) turned out to need no new synchronization mechanism at all. A click on the game canvas,
while the Sprites editor is docked, resolves to a `(bucketId, category, name)` via `app/sprite-pick.ts`
(checking `pickEnemyAt` before `pickTileNameAt`, since a visible enemy standing on a floor tile
should win) and posts it to the iframe as `kb-pixel-editor:pick`; the pixel editor loads it through
the exact same `loadSpriteInto` the browse panel's own Load buttons use. From there,
`live-preview-client.ts` (#108's original live-preview wiring) already posts every edit to the
parent on its own, and `attachLiveArtPreviewListener` already applies a matching name's texture
live — so a picked, then edited, sprite is visible in the running game with no explicit "Apply"
step, unlike the room editor's. The room editor needs one because a room template's *shape* can
diverge from the live room's compiled state in ways that have to be reconciled before pushing;
a sprite's pixels have no such draft/live split to reconcile — the picture the editor is drawing
*is* the picture, at every intermediate stroke, not a design to compile and check first.

**Constrains:** any future editor panel that reads "how much room do I actually have" should reach
for the same measured-`ResizeObserver`-plus-`window.innerHeight`-fraction shape rather than a fixed
pixel target, the same way `render/app.ts`'s `trackWindowSize` already does for the game canvas
itself — a fixed target is only ever right by accident, for whichever one screen size it was tuned
against. A future "pick this thing from the running game" entry point should default to routing
through whatever load path already exists (as this did) rather than inventing a parallel one, and
should only reach for an explicit apply/sync step if there is a genuine draft/live divergence to
reconcile — not merely because the room editor's version of "load something into an editor" happens
to have one.

## 30. Browsing and loading existing sprites is a build-time `import.meta.glob` scan, not a dev-server route

**Decided:** M6, issue #108, found by actually clicking Load on the CI-published preview build.

#29 fixed the pixel canvas's *layout* so a docked, narrow panel could actually reach the Browse
sprites panel — but Browse and Load themselves still failed outright on that preview: every entry
came back "Could not load", and the panel itself listed nothing. The cause predates #29 entirely.
`tools/pixel-editor/server.mjs`'s `GET /sprites` and `GET /sprites/:bucket/:category/:name` only
ever exist under `configureServer`, which Vite only runs for `vite dev` — a CI-published preview is
`vite build` output served as plain static files with no server behind it at all, so every browse/
load `fetch()` 404'd. `saveSprite` already had a production fallback (`dev-ui/file-export.ts`'s save
dialog) precisely because writing a file has no other way to happen without a server; browsing and
loading were never given the equivalent thought, because they were built and always exercised
against a running dev server, where the gap does not exist to see.

Loading has an option saving does not: reading files that already exist can be answered entirely at
*build* time rather than *request* time, since Vite already knows the full file list before either a
dev server or a static build exists. `import.meta.glob('../../assets/sprites/**/*.png', { eager:
true, query: '?url', import: 'default' })` (`src/pixel-editor/static-sprite-index.ts`) resolves
every sprite PNG's URL at bundle time, in dev and in a production build alike — small sprites end up
inlined as `data:` URLs by Vite's own default asset handling, larger ones as hashed files, and
either way `fetch(url)` on the result works the same, decoded into raw pixels via
`createImageBitmap` and a throwaway `<canvas>` (the mirror image of `api-client.ts`'s existing
`frameToPngBlob`, which already goes canvas-to-PNG for the same no-server reason). The path string
itself is parsed the same way `tools/art/scan.mjs`'s `scanSprites` already reads the directory
convention (`<bucket>/<category-folder>/<name>[.strip].png`, an animated strip's frame count/timing
from a matching `.anim.json` sidecar, also read via `import.meta.glob`) — a second reading of the
same convention, not a divergent one.

This replaces `listSprites`/`loadSprite` everywhere, not just outside dev: the server's `GET` routes
were doing nothing the static scan cannot also do inside `vite dev` (a full page reload already
follows every save, per `main.ts`'s `SNAPSHOT_KEY` comment, so a freshly-saved file is on the glob's
next scan the moment the reload it already causes lands), so keeping two implementations of the same
read path around would only be a second place for this exact gap to reopen. `tools/pixel-editor/
server.mjs` now serves only `POST` — the one operation a static build is structurally unable to do
for itself.

**Constrains:** any future "list/load something that's already a static asset" feature should reach
for the same `import.meta.glob`-at-build-time shape rather than a dev-server route guarded by an
`import.meta.env.DEV` fallback — the fallback pattern is correct for genuine writes (`saveSprite`
still needs one), and a trap for reads, which have no reason to depend on a server being there at
all. Adding a sprite category or bucket needs no change here: the glob pattern and the path-parsing
regex both key off `CATEGORY_FOLDERS`/the directory itself, not an enumerated list.

## 31. Click-to-pick pads its hit-test well past the physics collider, because the two are answering different questions

**Decided:** M6, issue #108, found by actually clicking on enemies rather than only on their exact
simulated centre.

`app/sprite-pick.ts`'s `pickEnemyAt` originally hit-tested against an enemy's real collider radius
(`sim/enemy/size.ts`'s `ENEMY_PROFILES` — 4 to 10 world units), on the reasoning that it was reading
the same data the sim's own hit-test reads. That reasoning does not transfer: a collider radius is
tuned for combat feel, not for a mouse, and `EntityView`'s uniform `radius / (referenceHeight / 2)`
scale means the *visible* sprite is a `2*radius` square around that circle — so even a pixel-perfect
click on a visible corner of the sprite already misses the inscribed circle, before accounting for a
real click never landing exactly on a collider's centre at all. In practice this made the feature
read as "always resolves to the floor tile," since `pickTileNameAt` is checked second and, on floor 1
(one tile variant today), returns the same name regardless of where the miss landed.

Padded the enemy pick radius by `PICK_RADIUS_MULTIPLIER` (2.5×) rather than reusing the raw collider
— a UI affordance for "click the thing you can see" is a different question from "did this hurt the
player," and answering it with the same number was the actual bug, not a rounding error to tune away.

**Constrains:** any future click-target hit-test built from gameplay collision data (not just this
one) should ask whether it is answering "what does this look like to click on" or "what does this
collide with" before reusing gameplay geometry directly — the two only coincidentally share a value
when a sprite happens to be drawn exactly at its collider's size, which nothing here guarantees.

## 32. The room editor's grid tools are dropdowns wherever the value is one of a small known set, and Erase clears every marker kind, not just rectangles

**Decided:** M6, issue #24's follow-up, found by actually using the enemy/hazard/prop tools rather
than only the wall/erase pair they were built and tested against first.

Three separate gaps, one root cause — a tool's toolbar option was built to store *whatever a author
already knew to type*, not to teach them what to type:

- **Enemy spawn** placed a marker bound to `cell.spawnGroups[0]`'s id with no way to choose an enemy
  at all, and `window.alert`ed "add a spawn group first" if none existed yet — which reads as "this
  tool does nothing" the first time anyone reaches for it, since nothing on the grid or its toolbar
  hints that a *different* panel (`panels/spawn-groups.ts`) is where the actual enemy gets chosen.
  Fixed with an enemy `<select>` right on the toolbar (mirroring `pickup`'s own already-correct
  pattern) and `findOrCreateSimpleSpawnGroup`, which reuses or creates a plain one-choice,
  every-floor group for whichever enemy is selected — the Spawn groups panel is still where a
  multi-choice, floor-varying group gets hand-authored, this is only the fast path for the ordinary
  "this enemy, here" case that a locked single enemy id could never express in the first place. The
  spawn marker's tooltip now shows the resolved enemy id (`enemyLabelFor`) instead of the group id, for
  the same "read what you actually placed" reason.
- **Hazard** had a bare text input with no suggestions wired in at all — `definitions.ts` already
  defined `HAZARD_TYPE_SUGGESTIONS`, just never imported here. **Prop** had a `<datalist>` combo box,
  which technically listed its own suggestions but reads, in practice, as an empty text field with no
  visible hint that typing shows a dropdown. Both became explicit `<select>` dropdowns via one shared
  `createTypePicker` helper, with a trailing "Custom…" option that reveals a plain text input —
  keeping the "still accepts free text" property `definitions.ts`'s own doc comment calls out
  (neither field has a real registry `sim/room/template.ts` enforces), just opt-in instead of hidden.
- **Erase** only ever filtered `obstacles`/`hazards` (the two rectangle-shaped lists) — an enemy
  spawn, pickup or decorative prop placed by mistake had no way to be removed at all, which read as
  "erase doesn't work" to anyone whose stray click happened to be one of those instead of a wall.
  Extended to filter `enemySpawns`/`pickupSpawns`/`decorativeProps` too, by the same point-inside-
  drag-rectangle test the marker-placement tools already use to place them.

**Constrains:** a new grid tool whose option is one of a small, known set (not truly free-form data)
should default to `createTypePicker`'s select-plus-custom-escape-hatch shape rather than a bare text
input — a text field with no visible list of legal values is, from a first-time author's side,
indistinguishable from a tool that silently does nothing. A new marker kind (a point placed on the
grid, the way enemy/pickup/prop are) needs its own branch in Erase's filter set the moment it exists,
not as a follow-up once someone reports the marker they placed by mistake is stuck there forever.
