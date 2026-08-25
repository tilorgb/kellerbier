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
