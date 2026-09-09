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

*Renderer superseded by #74: PixiJS was replaced by three.js in M6. The rest of the stack argument stands.*

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

*Note from #74: "Pixi" here reads as "the renderer" — the rule is unchanged and now covers three.js.*

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

## 33. A `<canvas>`'s bitmap is only ever resized when the sprite's own dimensions actually change, never on every zoom/host resize

**Decided:** M6, issue #108's follow-up, found by actually zooming a sprite that already had pixels
drawn on it.

`canvas.ts`'s `sizeCanvases` set `canvas.width`/`canvas.height` unconditionally on every call,
including from the +/- zoom buttons and the host `ResizeObserver` — both of which only ever need to
change the canvas's *CSS display size*, not its bitmap. Setting a `<canvas>` element's `width` or
`height` property clears its drawn content immediately, per spec, even when set to the value it
already had. The zoom buttons called `sizeCanvases` directly rather than `render()`, so every zoom
click wiped the visible drawing until the next paint stroke's own `render()` call redrew it from
`state.activeFrame` — which reads, to anyone zooming a sprite they were partway through drawing, as
"the sprite disappeared." Fixed by only touching `.width`/`.height` when `state.width`/`state.height`
themselves changed (a resize, a load, a reset), and leaving the CSS `style.width`/`style.height` (set
every call regardless) as the only thing a pure zoom or host-resize ever touches.

Two related fixes landed alongside it, once the canvas was actually being zoomed and dragged rather
than only measured:

- **A max-height on `.kb-pixel-canvas-wrap`** (`55vh`, matching `canvas.ts`'s own
  `FIT_HEIGHT_FRACTION`) — without one, the wrap simply grew to fit a zoomed-in canvas instead of
  ever overflowing vertically, so `overflow: auto` only ever produced a horizontal scrollbar no
  matter how tall the zoomed content got.
- **Right-button drag pans the wrap** rather than requiring the scrollbars themselves, which become
  a thin, fiddly target the moment a sprite is zoomed in past the visible area. The pen/eraser/shade
  tools have no use for a right click or a context menu (already suppressed), so the button was free
  to repurpose; left-button painting is now explicitly gated to `event.button === 0` so a right-click
  drag can never also paint.

**Constrains:** any future code that resizes this canvas (or a similar one) must not assign
`.width`/`.height` unless the pixel dimensions genuinely changed — reaching for the "just resize it,
it's idempotent" instinct silently reintroduces this bug, because the browser does not treat a
same-value assignment as a no-op the way it would for almost any other DOM property.

## 34. The pixel editor's canvas size is an in-place, content-preserving operation, distinct from starting a fresh sprite

**Decided:** M6, issue #108's follow-up — a direct request to be able to change a sprite's size
*while editing it*, not only when starting one.

"New" already read `widthInput`/`heightInput` to start a blank canvas at a chosen size, but there was
no way to change an *already-drawn* sprite's dimensions without discarding it first — loading an
existing sprite for a resize meant redrawing from scratch at the new size by hand. Added
`PixelEditorState.resizeCanvas(width, height)`: top-left anchored, so every existing pixel keeps
its exact position; growing brings in blank (transparent) area on the new right/bottom edge, and
shrinking silently crops whatever pixels no longer fit — a deliberate, not incidental, choice: a
canvas that is a strict superset or subset of its old bounds at (0, 0) is the one resize semantics
that never has to guess where old content should move to. A separate "Resize" button next to "New"
reads the same width/height fields "New" does — the two answer different questions ("start over at
this size" vs. "this sprite is the wrong size") and needed two different one-click actions rather
than folding resize into New behind a confirm dialog, or silently changing what New's own confirm
already means.

Fixing this also surfaced a real, independent bug in the browse panel's Load: `categorySelect`
changed to the loaded sprite's real category, but nothing repopulated `presetSelect` (or
`widthInput`/`heightInput`) to match — a "tile" sprite loaded first left the preset dropdown frozen
on tile's one 16×16 entry even after loading a "character", with no way to pick another size at all.
`loadSpriteInto` now repopulates the preset list and bounds for the loaded category and sets the
width/height fields to the sprite's own real size (not a preset guess) — what "Resize" and a
would-be re-save both actually read afterward.

**Constrains:** any future control that shows "the current sprite's size" (or feeds one back into an
editable field) must be refreshed by every code path that can change `state.category`/`state.width`/
`state.height` — `New`, `Resize`, and loading a sprite all need to agree, and a preset list or bound
left over from a previous category is exactly the kind of bug that only shows up once a real sprite
of a different category is actually loaded, not from reading the code in isolation.

## 35. The size-preset dropdown reflects the sprite's actual current size honestly, including "none of these"

**Decided:** M6, issue #108's follow-up, found by actually resizing a loaded sprite twice in a row.

#34 fixed the preset dropdown showing a category's *previous* selection after loading a sprite of a
different category, but left a subtler version of the same class of bug: after loading, the dropdown
was always forced to `DEFAULT_SIZE_PRESET_ID` ("Normal"), regardless of whether the loaded sprite's
actual size matched it. Most authored art predates the named tiers entirely — every floor-1/2
character sprite is a legacy 16×16, which is not `character`'s "Normal" (12×24) or any of its other
four. Loading one and seeing "Normal" selected reads as "this is what my sprite currently is," which
is simply false — and the concrete failure it causes: pick "Big," resize, then pick "Normal" again
expecting to *revert* to the sprite's original size, and get 12×24 instead of the 16×16 it actually
started at, with no warning that "Normal" was never that in the first place.

Added `presetIdForSize(category, width, height)` (`size-presets.ts`) — the preset whose dimensions
exactly match, or `null` — and a `CUSTOM_SIZE_OPTION` sentinel in the dropdown's own option list that
`syncPresetToSize` selects whenever nothing matches. Called after every operation that can change the
sprite's actual size (load, New, Resize) rather than only at load time, so the dropdown's claim is
never stale relative to whatever the width/height fields and the canvas itself currently say.

**Constrains:** a derived/summary UI control (this dropdown, or anything like it — a "this matches
preset X" indicator, a status computed from other state) must be resynced by *every* code path that
can change the state it summarizes, not only the one path that happened to be modified first —
`syncPresetToSize` needed three call sites, not one, precisely because three different actions can
each independently make the previous "matches this preset" answer wrong.

## 36. The whole floor-1/2 enemy roster is redrawn off the 16×16 floor, not kept there as grandfathered content

**Decided:** M6, issue #108's follow-up. **Supersedes** #25/#26's framing of the pre-existing 16×16
roster as legal-and-untouched — for this specific content, not the general principle.

#25/#26 raised `character`'s size ceiling but deliberately left the floor at 16 tall specifically so
the entire already-authored floor-1/2 roster (13 sprites) stayed legal without being touched — "only
new content reaches for the extra height." That framing did not survive contact with the pixel
editor's own size-preset dropdown (#35): every one of those 13 sprites is a legacy 16×16 that matches
none of the five named tiers, so loading any of them showed "Custom," and this project does not want
to ship its first version with its own entire enemy roster in that state. The decision this session
made once that was seen clearly: redraw the roster now rather than defer it, and given that choice,
size each sprite to its own actual shape (`presetIdForSize`'s tiers are convenience defaults, not a
mandate that every character be tall-and-narrow) rather than force all 13 into one uniform tier a
woodlouse and a tractor have no business sharing.

Thirteen redraws, evolved from the original silhouette rather than invented fresh — each keeps the
original's recognizable shape (Kellerassel's segmented dome, Rollfass's stave-and-hoop barrel,
Bauer's overalls-and-pitchfork) at meaningfully more resolution, with real shading via
`palette.mjs`'s `shadeOf` (the same derivation #28's shading brush uses) rather than the originals'
flat 2-3-colour fills. Sizes, chosen per creature rather than uniformly: Kellerassel 24×16, Bierratte
20×16, Schimmelfleck 22×18, Schimmelspore 18×16, Zapfhahn 16×28, Rollfass 22×26, Fasssplitter 14×20,
Bauer 16×28, Kuh 32×20, Gockel 18×22, Gartenzwerg 16×22, Blaskapellist 26×24, Traktor 32×22 — every
one checked against `tools/art/validate.mjs`'s size and palette rules before being committed, the
same gate a save through the pixel editor itself would have to pass.

Two designs (Zapfhahn, a wall-mounted tap; Blaskapellist, a tuba player) took three drafting passes
each before they read as the thing they are supposed to be rather than, respectively, a robot arm and
an abstract ring — kept as a live example of the same lesson #108's player-sprite redraw already
recorded: a first procedural pass is a sketch, not a result, and the fix is redrawing it properly
rather than shipping the sketch. One real bug surfaced and was caught by validation rather than by
eye: an early draft of Traktor's tires and exhaust used `cellar`'s dark grey instead of a shared
neutral, which `findOffPalettePixel` flagged immediately — floor-2-rural has no standing to borrow a
colour that belongs to floor-1-cellar's own five.

**Constrains:** the next floor's roster (3-7, still parked per #22) starts from a blank slate with
these presets and this shading technique already established, rather than needing its own version of
this redraw later — there is no more legacy 16×16 art left to carry forward. Any future sprite work
should run `findOffPalettePixel`/`validateSpriteSize` (or the pixel editor's own save path, which
calls the same functions) before presenting candidates, not just before committing — it catches a
bucket/palette mismatch a design review by eye can miss entirely.

## 37. Animation is a render-side table, clips are authored beside the art, and four frames is the walk cycle

**Decided:** M6, issue #150. **Applies:** #2's `sim/`→`render/` boundary, #7's construction-time
validation, #19's graceful content gaps and #4's overflow policy to animation.

Three decisions, taken together because #150 could not be built without answering all three, and
every one of them is inherited by roughly thirty-five creatures nobody has drawn yet.

### The animator is render-side, and animation state is derived, never stored

The obvious implementation is an `animationFrame` field on the entity, advanced in `stepEnemies`.
It is also the one that quietly ends this project's determinism story: a frame index advanced in
a tick makes the simulation a function of presentation timing, and replays, seeded runs,
shareable bug reports and the WASM seam all rest on it not being one. So `render/animation/`
keeps its own table keyed by entity handle — slot *and* generation, so a recycled slot is a new
creature rather than one inheriting the last occupant's stride — and animation state is
*resolved* from simulation state every frame (`render/animation/state.ts`: hurt from
`flash`/`hitStun`, telegraph from the same `enemyTelegraphProgress` the warning ring is drawn
from, move from the tick's own position delta). Nothing is written back. The lint rule in
`tools/eslint/architecture.js` stops the renderer importing its way into the simulation;
`tests/determinism/animation-state.test.ts` stops it happening by accident through a shared
object, by running the same seed rendered at 60 Hz and at 240 Hz and comparing the simulation
bit for bit.

Clips advance on the render clock rather than the tick counter, which is the other half of the
same split: a 144 Hz display plays a 440 ms walk cycle in 440 ms instead of 2.4× fast, and a
paused or single-stepped simulation does not freeze a body mid-stride. The delta is clamped
(`MAX_FRAME_DELTA_MS`) for the same reason `FixedTimestepLoop` clamps its step backlog — a
backgrounded tab's four-second gap is spent, not deferred.

One consequence worth naming: a **corpse** is entirely render-side state. The simulation frees
an enemy's slot on the tick it dies, so there is no entity left to hang a death pose on; the
animator keeps a small fixed table of corpses (position, radius, facing and clip phase, captured
from the last frame the body was alive) and plays the death clip out on those, fading them at the
end. Fixed and overwriting oldest-first, per #4: a room-clearing bomb drops the oldest corpse's
last few frames rather than growing a table mid-fight. `GameView` clears the whole table on a
room change, because a body vanishing with its room is not a body dying.

### Clips are authored in the `*.anim.json` sidecar, not in `src/content/`

Every other kind of content in this game lives in `src/content/`, so putting clips anywhere else
needs an argument. It is this: a clip is a frame list over one specific strip. Authored anywhere
other than beside that strip, there are two files that have to agree about a frame count and a
build that can only see one of them — and the sidecar is a file the art build already reads and
validates, and the pixel editor (#108) already writes. So `name.anim.json` grew an optional
`clips` map, one entry per animation state, and `render/floor-art.ts` finds strips by
`import.meta.glob` rather than by a list of imports: adding an animated creature is dropping two
files in a folder, which is the bar `CONTRIBUTING.md`'s content definition-of-done sets. The
states are a closed set (`ANIMATION_STATES` in `tools/art/spec.mjs`, imported by the runtime
rather than re-listed, so the build's idea of a legal clip name and the animator's agree by
construction).

Where the line between #7 and #19 falls, concretely:

- A clip naming a state nothing plays, or pointing at a frame index the strip does not have, or
  a `once` clip with an `onEnd` that means nothing — **wrong data**. `validateAnimation` fails
  the build, and `compileAnimationSet` throws again at load, adding the one check the build
  cannot make: that the frame count the sidecar declares is the frame count the loaded texture
  actually divides into.
- A state with no clip authored yet — **a gap**. It falls back to the idle clip and warns once
  per (sprite, state) behind `import.meta.env.DEV`, exactly the shape `nearestFloorChoice`
  already uses. Which is why an `idle` clip is *required* whenever `clips` is present: a fallback
  that might itself be missing is not a fallback.

A name authored both ways — `name.png` and `name.strip.png` side by side — fails the scan. Both
would pack under one atlas key, and it is the exact shape of animating an existing creature and
forgetting to delete the static PNG.

### Four frames of walk cycle

`WALK_CYCLE_FRAMES` in `tools/art/spec.mjs`, and the number every creature in M10 will be
authored to. Contact, passing, contact, passing: the smallest count that reads as a cycle rather
than as a two-pose flicker, which is also where 16-bit-era sprite work landed for the same
reason. Going to six or eight buys detail nobody looks at in a bullet hell — the player is
reading silhouettes and telegraphs, not gaits — at a cost paid thirty-five more times in
authoring hours, and paid again in every atlas.

Frames are shared across clips rather than duplicated: the Kellerassel's strip is eight frames —
four walk (frame 0 doubling as the idle rest pose), one flinch, three death — not one strip per
clip. That is what keeps the count per creature closer to eight than to twenty.

Advisory, not enforced. A creature that genuinely reads better on two frames because it hovers or
rolls is not a spec violation; four is the number to reach for absent a reason not to, and the
reason belongs in the commit that departs from it.

**Constrains:** every animated creature from here on, floors 3-7 included; the projectile and
boss animation #151-#154 will want (same clips, same sidecar, same states); and any future
"presentation state derived per frame" system — a squash-and-stretch pass, a shadow that reacts
to height — which reaches for a render-side table keyed by entity handle before it considers a
field on the entity.

## 38. The player is a four-way body plus a one-way hose, and drunk is a pose rather than a wobble

**Decided:** M6, drawing Alois (#151) — the first character in the game whose *movement* and
*aim* are two different directions, and the first whose art has to change with a gameplay stat.

Three questions had to be answered together, and each one had an obvious answer that was wrong.

**Four-way body, not eight.** The obvious answer to "a twin-stick game needs to show where you
are aiming" is more directions, and it does not work: eight directions is not eight more frames,
it is eight of *every* frame — walk, idle, flinch, death, and all of it again drunk. What the
player actually needs to read is two independent things, and drawing them into one sprite is what
makes the count multiply. So the body is authored in three strips (toward the camera, away, and
side-on mirrored for the fourth) and drawn in the direction he is **moving**, and the
Trink-Rucksack's hose — the Schlauch, which is where the shots come from, per
`docs/GAME_DESIGN.md` §2 — is a second sprite drawn in the direction he is **aiming**, in eight.
Aim resolution ends up finer than body resolution, which is the right way round: eight nozzle
frames total, against the twenty-four extra body frames the same fineness would have cost.
Walking left while shooting right — #151's own acceptance criterion — then needs no art at all;
it is two layers already pointing where they were told to.

The body follows aim only when he is standing still, where movement has no opinion and an idle
body facing away from what it is shooting looks broken. A diagonal draws as the side view rather
than the front or back one: it keeps the face and the tank in frame, and both are how a player
finds themselves in a busy room.

**Directions are strips, not clips.** #37 fixed the clip names — `idle`, `move`, `telegraph`,
`hurt`, `death` — precisely so that a clip nothing plays is a typo rather than a feature, and
that is worth keeping: it means "the same walk, facing the other way" cannot be expressed as a
clip. It is expressed as another strip, which costs the format nothing, the build nothing, and
the runtime nothing — `render/player-art.ts` loads all seven through #150's own `cutStrip` and
`compileAnimationSet`. The one thing this does need that the enemy animator deliberately refuses
to do is **carrying clip phase across a set swap**: `EntityAnimator` resets a slot's stride when
its set changes, because a recycled slot must not inherit the previous occupant's, and a body
turning a corner is exactly the opposite case. Hence `render/player-view.ts` being its own small
player rather than a seventh caller of the animator — that, plus Alois never becoming a corpse
(`systems/impact.ts` keeps his entity alive through death on purpose, which is also why he is the
one body that can resolve `death` from simulation state at all, where an enemy cannot).

**Drunk is drawn, not animated.** The tempting implementation of "the character should read as
drunk" is a sway — a sine on the sprite's rotation or offset, free and immediately convincing.
It is also unshippable, because #33's accessibility toggles exist to turn exactly that off, and
#151's acceptance criterion is that reduced-motion and no-sway get "an Alois who is still
readable and **still drunk**". A drunk read built out of motion is a drunk read those players
never get. So it is built out of *poses*: three more strips with a lean, a wider stance,
half-lidded eyes and a flushed cheek, swapped in at Beduselt — the tier where
`promilleDriftScale` and `promilleWobbleAmplitude` start ramping, so he begins looking unsteady
on the same tier he begins being unsteady. The renderer adds no motion of its own, which is what
makes the accessibility toggles a no-op on him by construction rather than by a code path that
has to remember.

The drunk strips author `idle` and `move` only. A flinch and a death are the same flinch and
death drunk or sober — the difference would be a lean nobody reads through a hit flash — so
`PlayerView` asks the *sober* strip for those two states rather than letting #19's idle fallback
quietly turn a drunk death into a drunk idle. That is the one place in this design where the
graceful fallback would have hidden a bug instead of covering a gap, and it is handled explicitly
for that reason.

**Constrains:** every playable character after Alois (`docs/GAME_DESIGN.md` §6's roster —
Resi, Schorsch, the rest) inherits the seven-strip shape, the four-way/eight-way split, and the
"drunk is a pose" rule; a character whose weapon is not a hose still gets a second layer for
wherever their shot comes from. Anything that later wants a *ninth* body direction should add
nozzle frames instead and ask what is actually unreadable. And `GameSim.aimDirectionX`/`Y` and
`lastShotTick` are now part of what the renderer may read: aim is simulation state because it is
a function of the input log, not because the renderer needed somewhere to put it.

## 39. Projectile legibility is scored against a sprite's *better* extreme, not its brightest pixel

**Decided:** M6, while authoring the projectile set for #152. **Amends:** #34, whose gate this
loosens in one direction and keeps everywhere else.

`tools/art/build.mjs` took each projectile's brightest opaque pixel as "the rim" and required a
3:1 contrast ratio against every large-area background colour of every floor the sprite could
appear on. That is a faithful reading of `CONTENT_BIBLE.md` §5's "enemy shots always get a bright
rim so they read against any background", and it made the sweep's most important sprite —
**Alois's own shot** — impossible to author at all.

A `common` projectile appears on all seven floors, so it is checked against all seven at once. A
search over the whole legal `common` palette (neutrals plus every floor's five, plus every
colour's derived shade ramp — 195 colours) returns **zero** candidates. The reason is not a tight
threshold, it is a contradiction: Die Alpen's background is snow (`#eef2f5`, `#b9c4cc`,
`#6e7680`) and Der Wald's is near-black (`#16261a`). Nothing bright clears the first; nothing
dark clears the second; and nothing in between clears either, because Alpen's own mid grey sits
exactly where "in between" is. The per-floor case was survivable but lopsided in the same way:
Der Keller admitted only near-white rims and Dorf & Acker only near-*black* ones, which is how
the first draft of floor 2's shots ended up as flat black dots with no rim at all — the opposite
of what §5 asked for.

**The fix: for each background, score the sprite on whichever of its two brightness extremes
reads better against that background.** `validate.mjs` gained `darkestOpaqueColor` beside
`brightestOpaqueColor`; `checkProjectileLegibility` takes both and uses `max(...)` per background.
A shot with a black outline and a bright core then reads on snow *by its outline* and on black *by
its core*, which is what a pixel artist would have done unprompted and what §5's rule was already
half-stating. Every one of #152's ten projectile sprites carries both ends deliberately.

**Why this is still a gate, and not a formality.** Which end does the work is a property of the
*background*, not of the sprite, so a sprite still has to earn both. A flat mid-tone blob has
both extremes in the middle and fails against most floors exactly as before —
`tests/art/contrast.test.ts` asserts that specific case, because it is the one that would make
this change a rubber stamp. What now passes is specifically a sprite with real internal contrast.
The threshold (3.0) and the swatch sets (`floorBackgroundSwatches`) are untouched.

**What this constrains:**

- **`src/pixel-editor/legibility-panel.ts` moves with it.** The live panel and the build gate must
  agree or an author chases a failure that is not there; it computes the same two extremes and the
  same `max`.
- **A projectile still has to be *drawn* with an outline.** The gate can only check that the
  extremes exist, not that the darker one traces the silhouette. That part stays a review
  judgement, and #34's legibility test (the sprite shown at 1× in motion over real floor tiles) is
  where it is actually caught.
- **This is a projectile rule, nothing else.** Characters, tiles and bosses are held to palette
  and size, never to contrast — a Kellerassel that reads poorly against a cellar wall is a
  drawing problem, not a hard constraint, because a creature is large, slow, and telegraphed. A
  shot is none of those, which is why it has a gate at all.

## 40. A room's furniture is authored data the renderer looks up, and a floor's tileset is a five-name manifest

*Render side superseded by #74: `prop-view.ts` and `room.ts` are gone — props and obstacles are billboards, walls are boxes (`render/world/scenery.ts`). The manifest stands, two fields longer (`wallHeight`, `lighting`).*

**Decided:** M6, wiring #152's art into the renderer.

Two gaps turned up together while looking for the last placeholders, and they have the same
shape: art that existed, or data that existed, with nothing joining the two.

**`decorativeProps` had been authored since M2 and almost nothing drew it.** Seventeen prop types
appear across the room templates — fence posts, bunting, the Maibaum, a market stall, a well, a
trough, a tractor. Exactly two of them did anything: `barrel` and `maypole` become destructible
targets, and `pedestal` becomes loot, all three in the simulation. The other fourteen were
authored intention that reached the screen as nothing at all, which is most of the reason every
room read as a bare grid. `render/prop-view.ts` now draws them from `PROP_TILE_NAMES`, a
prop-type-to-tile map with three kinds of entry:

- **a tile name** — draw it
- **`null`** — something else already draws this (a trellis from the room's `sightBlocks`, a
  puddle from its hazards, a barrel from `EntityView`). Listed rather than omitted, so that
- **absent** — means a real content gap: no art has been drawn for this type yet. It warns once
  per distinct message in a dev build and the room loads without it (#19), and
  `tests/content/sprite-coverage.test.ts` fails on a pull request that introduces one, which is
  the check that actually matters.

**Floor 1's wall art shipped in #35 and was never loaded.** `cellar-wall.png` and
`cellar-plank.png` sat in the tree for two milestones while `render/room.ts` drew flat `Graphics`
rectangles over the top of them. What was missing was not the art and not the loader — it was
anything that said *which* of a floor's tiles is its wall. `FLOOR_TILESETS` is that, and it is
deliberately a hand-written manifest rather than a naming convention: "adding a sprite is dropping
a file in a folder" is right for content (one more floor variant, one more prop) and wrong for
roles, because inferring "the wall" from `*-wall.png` would turn a rename into a silent behaviour
change. Five names per floor is the whole of it, and a floor with no entry keeps the flat
`RoomTheme` fill — which is what floors 3-7 still do.

**The two smaller decisions this forced, both recorded here because they cost a component and a
field:**

- **`GameSim.propKind`.** The simulation genuinely treats a barrel and Der Stier's Maibaum
  identically — that is #38's own note on why `maypole` needed nothing from the engine — so
  nothing on a target's body distinguished them, and the renderer drew a Maibaum as a barrel. One
  `Uint8Array` component, written by `spawnTarget`, indexes `DESTRUCTIBLE_PROP_KINDS`. Render-only,
  like `spawnBounce`: it cannot affect a replay, and it is written on every spawn anyway, because
  a recycled slot inheriting the last occupant's prop kind is a bug a player would see.
- **`FiringBehaviourBase.art`.** Which sprite an enemy's shot draws is authored on the *behaviour*,
  not the enemy — a creature with two firing states can plausibly fire two different things — and
  interned by `EnemyRegistry` into a small integer the projectile store carries, so the frame loop
  never compares a string. Omitted means "the floor's default shot", so a new enemy needs nothing
  here until its shot is worth telling apart from its neighbours'.

**What this constrains:** the crates are `common` art, not floor 1's, because *every* generic
cellar template is tagged `cellar, rural` alike — a cellar-palette prop placed in one of them
appears on floor 2 off that floor's palette. Any future prop shared by templates that span floors
has to be `common` for the same reason, and a prop that must be one floor's own can only live in a
template tagged for that floor alone. Floor 1's set-piece crates are in `cellar-larder` rather
than in the start room for the same reason from the other direction: there is no `start` special
role, so no template can be guaranteed to be the room the run opens in. Pinning them there needs
that role and belongs with #58's story delivery, not with the art.

## 41. Effects are always simulated and sometimes drawn — accessibility suppression is render-side

**Decided:** M6, building the VFX pass (#153). **Constrains:** every effect added after it.

Particles live in the simulation and draw from the seeded cosmetic random stream, because a
replay whose foam sprays differently is not evidence of anything (`ParticleStore`'s own doc
comment, and #16's reason for a separate stream at all). #153 adds two accessibility toggles —
**reduced motion** and **reduce flashing** — and the obvious implementation of both is to stop
spawning the effects they remove.

**That implementation is wrong, and the reason is replays.** A run recorded with reduced motion
on would consume a different number of draws from the cosmetic stream than the same inputs with
it off, so the two would diverge — not in what the player did, but in everything downstream of
the stream. A recording made by a player who uses the toggle would then play back as a different
run on a machine that does not, which is the one thing the seeded-stream design exists to
prevent. It would also make the toggle a *balance* setting by accident, since particle count is a
simulation cost.

So: **every effect is spawned unconditionally, and `render/particles.ts` decides what to draw.**
`ParticleView.draws(kind)` is the whole of the suppression, `GameView.setAccessibility` is how it
is told, and `applySettingsToSim` deliberately has no entry for either toggle —
`tests/unit/settings.test.ts` asserts that a sim configured with both on is identical to one with
both off. The cost is that a suppressed particle is still stepped, which is a few microseconds
against a 4 ms budget and buys exact replay equivalence.

**What may be suppressed, and what may not.** The line is whether an effect is the *only* copy of
something:

| Kept, always | Removable |
|---|---|
| Foam and splash — "that connected", "that died" | The room-clear glint ring |
| Hit sparks — the second half of "that connected" | The door puffs |
| A creature's own death effect — it says *what* died | The pickup glints |
| The telegraph ring's growth — it is the countdown | The ring's brightness *pulse* |
| The one-frame white hit flash | The muzzle flash |
| Damage numbers, knockback, hitstun | The vignette's breathing |

Screen shake is the one thing damped rather than removed (to a quarter): it is the cheapest
signal that a hit was *yours* rather than something happening elsewhere on screen, and a floor of
it still reads where none does not. `swayScale` (#33) stays the separate, finer control for the
camera specifically.

**The one-frame hit flash is deliberately not a "flash".** `reduceFlashes` exists for repetition —
a muzzle flashing eight times a second, a vignette breathing continuously — not for brightness.
A hit flash fires once per hit and is what tells the player a shot landed; removing it would
leave a hit reading as a shot the game dropped, which is exactly the "an accessibility toggle
must not remove information" rule this whole entry is about.

**What this constrains:** an effect added later is only allowed to be removable if something else
already carries its meaning. An effect that is the sole carrier of a fact has to be kept under
every toggle — or the fact has to be given a second home first. In practice that means new
effects go in `sim/particle/effects.ts` next to the existing bursts, whose own doc comment states
the rule, and get a row in `tests/unit/particle-art.test.ts`'s suppression table either way.

## 42. The line box grew rather than the cap height shrinking, and accented letters are composed

**Decided:** M6, building the pixel font and UI kit (#154). **Constrains:** every UI screen laid
out from here on — #52's localisation, #53's text scaling, #58's item flavour text, and every M8
menu.

#52 named the trap and asked for it to be solved early: *"Designing a readable 8px font with
umlauts inside a 640×360 frame is genuinely constrained work — the diacritics need vertical room
that simply is not there."* It is not there because a diacritic can only get its room from one of
two places, and both cost something:

- **a shorter cap height**, keeping an 8-row line box: four HUD rows in 40 pixels, and letterforms
  five rows tall;
- **a taller line box**, keeping the caps: three HUD rows in the same 40 pixels, and letterforms
  seven rows tall.

Both were built as far as a rendered sample of the same German strings, and the taller box won on
the thing the whole issue is about: at five rows, `Ä`'s dots and `A`'s apex are two pixels apart
and the eye reads them as one shape. The cell is **10 rows** — two for a diacritic, one clear, a
seven-row cap band, and one descender — and `LINE_ADVANCE` is 12 so a descender and the next
line's diacritic cannot touch. The display face (#44) uses the same shape at 16.

**A diacritic's room is reserved, not borrowed, and that is what makes composition possible.**
`Ä` is `A` plus the dieresis mark, placed by rule; so are the other 53 accented Latin-1 letters.
Fifty-four hand-drawn bitmaps became one table of base-plus-mark pairs, a mark redrawn once moves
every letter that uses it, and `tests/unit/ui-font.test.ts` asserts that no accented Latin-1
letter is drawn by hand — because the first one that is, is the first one whose dots sit a pixel
off from every other.

**The one asymmetry is deliberate.** A one-row mark keeps a clear row between itself and the
letter; a two-row mark sits straight on it. The dieresis is a one-row mark for exactly this
reason: it is the only mark German, Boarisch and English need, and it is the one that must never
be misread. The circumflex, tilde and ring — which no target language uses — pay the cramped
price instead. That rule is a field on the face (`markClearance`, and `MarkSource.tight`), not a
special case in the compiler.

**What this constrains:** German runs roughly a third longer than English for the same UI string,
and this is now checkable rather than arguable — `PixelFace.measure` is exact and needs no
renderer, so `tests/unit/ui-strings.test.ts` fails a pull request that makes a real German string
overflow the element that draws it. Two of the current strings clear their budget by under 10%
("Schloss Neuschwanstein" on a floor card, the longest shop preview), so that test is load-bearing
rather than decorative. A new UI element declares its budget there or it is not finished.

## 43. UI art is screen-space, generated at boot, and lives in `src/render/ui/` — not in the atlas

*Mechanics superseded by #74: UI art rasterises to `DataTexture`s via `textureFromPixels`, and the HUD draws at internal pixels, not "the display's own resolution". Where it lives and the role format stand.*

**Decided:** M6, with #154. **Constrains:** every later HUD element, and M8's menus.

The obvious home for a heart, a Biermarke and a panel corner is `assets/sprites/common/tiles/`,
next to the minimap icons that are already there. It is the wrong home, and the reason is what the
atlas pipeline's contract actually says: **16×16 exactly, a per-floor palette, drawn in the world
at `WORLD_ZOOM`.** Every clause of that is about a sprite that lives *in a room on a floor*. A
panel corner is 3×3, belongs to no floor, and is drawn in screen space at the UI's own scale.
Forcing it through would have meant a fifth sprite category whose spec contradicted the other
four.

So UI art is authored as **source**, in `render/ui/`, in a role format (`pixel-art.ts`) where a
pixel names `outline`/`fill`/`highlight`/`accent` rather than a colour, and is generated into
textures once at boot the way `placeholder-art.ts` already generates its shapes. Roles rather than
a tint because one mug bitmap has to draw red Maß, white Weißbier *and* near-black Schwarzbier,
and a tint can only ever darken — the same reason `placeholder-art.ts` swaps textures for a hit
flash instead of tinting one.

**The UI is laid out in UI pixels on a whole-number scale.** `render/ui/text.ts`'s `uiScaleFor`
returns an integer, `app/main.ts` scales one `hudLayer` by it, and every component below measures
itself in units where one is one pixel of the 640×360 frame. This *narrows*
`docs/CONTENT_BIBLE.md` §5's "HUD text is not held to 640×360": it is still drawn outside the
scaled game container at the display's own resolution — which is why it is crisp on a 4K monitor
rather than eight device pixels tall — but its *grid* is now the frame's, because a pixel font at
a fractional size resamples and `resolution.ts` exists to prevent exactly that. The bible's bullet
has been amended to say so.

**What this constrains:** a new HUD element lays out in UI pixels and reports its own height, so
the stack in `app/main.ts` composes rather than being a column of hand-written offsets. Anything
that wants to be bigger multiplies by a whole number. And #53's text scaling is a change to one
integer rather than a second layout system.

## 44. There are two faces, and the broken one is only for what nobody has to read under fire

**Decided:** M6, with #154. **Constrains:** where Fraktur may be used, forever.

Bavaria's own typographic voice is Fraktur, and a Bavarian roguelike that sets everything in a
clean pixel sans is leaving its best joke on the table. Fraktur is also, measurably, slower to
read: it is built out of broken strokes and near-identical stems, its capitals include pairs
(`A`/`U`, `B`/`V`, `C`/`E`, `I`/`J`, `K`/`R`, `M`/`W`) that people who grew up reading it still
confuse, and at a pixel size its whole character comes from breaks that need three pixels each to
read as deliberate.

So there are two faces, and the rule between them is not stylistic:

| | Text face | Display face |
|---|---|---|
| Cell | 10 rows, 7-row caps | 16 rows, 11-row caps |
| For | every label, price, prompt, description | the game's name, a floor's name, a boss plate, the word a run ends on |
| Test | can it be read while something is shooting at you? | is anything shooting at you? |

**A broken script is allowed exactly where nothing is happening.** A floor card is up while the
player is standing still; a death word is the last thing a run says. A Promille readout is not,
and never gets it.

Authenticity lost to legibility in three places, each recorded because the temptation to "fix"
them later is real: **no long ſ** (it is a typesetting rule, not a glyph, and it reads as `f` to a
modern eye), **no ligatures**, and **modern capital skeletons** wearing Fraktur's weight and
breaks rather than its actual confusable forms. What is kept is what makes it the script: broken
strokes, two-pixel stems with diamond spurs, the Elefantenrüssel where a capital has room, and the
tight narrow rhythm that makes a word read as one dark mass.

**The display face falls back to the text face, glyph by glyph.** It authors A–Z, a–z, 0–9, ß and
heading punctuation; anything else is borrowed and reseated on the display baseline. A display
face legitimately needs fewer characters than a text face — nothing writes a paragraph in it — but
a heading that hit a missing character would show a box, and `docs/DECISIONS.md` #19's rule is
that a content gap degrades gracefully. Borrowing *is* the graceful degradation;
`tests/unit/ui-font.test.ts` still holds both faces to full printable Latin-1.

**A treatment is data, not a second face.** Outline, weight, a top-to-bottom colour ramp, a
texture and a hard offset shadow are one `TitleStyle` object, and a treated line is rasterised
**whole** rather than glyph by glyph — an outline belongs to the word, or every letter gap grows
a seam. That is affordable only because this is a display face: the things drawn with it change on
an event, a handful of times a run, never per frame.

**What this constrains:** a new heading picks one of the three schemes in `TITLE_STYLES` rather
than inventing colours, and anything that reads as a *label* uses `uiText`, not `displayText` —
including headings inside a HUD element, where a raised voice would just be noise.
## 45. A sprite's canvas is its size on screen — the actor grid is one authored pixel per internal pixel

*Mechanism superseded by #74: the Pixi `scale` is now a billboard's world size over `ACTOR_PIXELS_PER_UNIT`. The rule stands unchanged — a canvas height is literally how tall a thing stands.*

**Decided:** M6, from an art-direction audit asking why sprites kept growing whenever they were
redrawn with more detail. **Supersedes** the half of #27 that claimed pixel density was decoupled
from on-screen size: it was decoupled on one axis.

### What was actually happening

`EntityView` sized every body in the game by one expression:

```ts
const referenceHeight = bodyTexture.height;
const spriteScale = radius / (referenceHeight / 2);
sprite.scale.set(spriteScale * flip, spriteScale);
```

#27 introduced it so that redrawing the player at 32px instead of 16 would not make him twice as
tall, and for *height* it does exactly that. But the same factor is then applied to width, where
nothing constrains it: drawn width is `authored width × radius ÷ (authored height ÷ 2)`. Widening
a canvas widens the body on screen, one-for-one, with no change to what can be hit.

So the pipeline offered an author one lever for "more detail" — more pixels — wired to two
different outputs depending on which axis they were spent on. Vertically: resolution. Horizontally:
size. And `CATEGORY_SPECS.character` pins `minHeight` at 16 (#26 kept it there deliberately, to
keep the committed roster legal), so a wide, flat creature *cannot* spend them vertically. The spec
pushed exactly one shape of creature into the one axis the renderer did not defend.

The Kellerassel is the worked example, and is what prompted the audit. #36's redraw took it from
16×16 to 24×16 — the only direction available to a woodlouse. On screen: 26×18 internal pixels to
42×25, **2.24× the area**, on a radius that never moved. The note that started this was "I asked
for a more detailed sprite, I didn't ask for it to grow."

Two further consequences of deriving size from the collider, both live on `main` until this:

- **Twelve different pixel sizes.** Measured across the committed roster, `screen px ÷ authored px`
  ranged from 0.8 to 2.5 and took twelve distinct values, nine of them fractional — meaning
  resampled, which `render/resolution.ts`'s own opening paragraph calls "a hard rule rather than a
  preference". Alois and the pickups sat at 1.0; the floor tiles at 2.0; the roster smeared across
  the gap between them, at 1.167, 1.273, 1.4, 1.538, 1.556, 1.75, 1.818.
- **#26's boss ceiling was arithmetically unreachable.** It raised `boss` to 160×160 reasoning that
  "160 authored is 320 on screen ... deliberately close to filling" a 180-tall playfield. But a body
  was drawn `2 × radius` world units tall and the largest radius in the game is `mid`'s 10, so every
  boss was 40 internal pixels tall whatever it was authored at — 11% of the playfield, not 89%. Die
  Große Kellerassel was authored 40×20, 3% of the canvas the spec allowed, and drawn at 2.0: the
  game's climactic sprite was its *coarsest* art, twice the pixel size of the Alois standing next to
  it.

### The decision

**On-screen size is the authored canvas, and nothing else.** `render/resolution.ts` states two
grids and every drawing path takes one of them:

- `ACTOR_SPRITE_SCALE` — one authored pixel per internal pixel, for anything that *is* a thing: a
  character, a boss, a corpse, a pickup. Want more detail? Draw more pixels. Want it bigger? Draw a
  bigger canvas. The two questions finally have two different answers.
- `TILE_SPRITE_SCALE` — two internal pixels per authored pixel, for room art. Not a compromise and
  not chosen here: a 16px tile covering `ROOM_TILE_UNITS` world units *is* 2.0 by definition. A
  background that repeats identically and unnoticed carrying less detail than the things acting in
  front of it is the same judgement `tools/art/spec.mjs` already makes by pinning `tile` at exactly
  16×16 while letting a character grow.

Both are whole numbers by construction, so no sprite is ever resampled. `tests/unit/resolution.test.ts`
pins both.

**The collider stops deciding size and starts being checked against it.**
`tests/content/sprite-scale.test.ts` walks the real sprite tree and holds every creature's
silhouette — its *inked* box, not its canvas — to between 0.6× and 1.8× its collider diameter, on
its longest axis. Longest axis rather than height because the collider is a circle and a creature is
not: no circle matches both a Kellerassel's 24px width and its 14px height, and its width is what a
player reads and shoots at. The band is deliberately wide; this is a gate against a sprite drifting
away from its collider unnoticed, not a house style for how big a creature should be. That decision
stays with a person, where `CLAUDE.md`'s sign-off ritual puts it.

Two creatures fail it today — Shopkeeper and Kellerassel-Segment, both drawn well inside their own
hitbox because the old renderer inflated them to fit and nothing ever had to be authored to size.
They are listed in `PENDING_REDRAW`, which the same test asserts may only ever shrink.

### What this did to the committed art

Anything already on the actor grid is untouched: Alois, every pickup, Bauer, Zapfhahn, Bierratte,
Schimmelspore. Four sprites were at exactly 2.0 — the engine was already drawing them as 2×2 blocks
— so they were re-encoded at 2× nearest-neighbour: Große Kellerassel, Der Stier, Kuh and
Maibaum-Dieb now hold on disk the pixels the screen was already showing, unchanged to the eye and
with real resolution available to a future pass. That is a file-format correction, not new art, and
is why it did not go through art sign-off.

Everything that was at a fractional scale now draws at its authored size, which is smaller than
before — the Kellerassel at 24×14, Schimmelfleck at 22×16, Rollfass at 21×26, Traktor at 28×22.
Those numbers were never designed; they are what the old formula happened to produce. Growing any of
them back is now a one-line art change with a visible target, and Traktor especially wants one: a
tractor half the size of the cow beside it is a real note, and it is *expressible* for the first
time.

`character`'s ceiling rises 32×32 → 64×48 to make room for this, and the number now means something
concrete: it is how much of a 640×360 frame the category may cover. A `mid` collider is 40 internal
pixels across, and the widest bodies in the roster are half again as wide as they are tall.

**Constrains:** anything new that draws a sprite takes one of the two grid constants — a third
scale is a third pixel size, and this is now the third time (after #26 and #27) that a coupling
between art size and something else broke silently. One deliberate exemption exists and names the
rule by contrast: a sprite whose on-screen size is *live information* is scaled to that information
instead. A projectile is drawn to its own collider because `shotRadius` is item-modifiable and a
bigger shot has to look bigger; a telegraph ring grows because the growth is the countdown; a
particle shrinks because that is the effect. A body is not information — it is a body — so it is
drawn at the grid.

## 46. Touch is a third input device, not a mobile port

**Decided:** M8, on direct request — `docs/GAME_DESIGN.md` #13 said "no mobile build" explicitly
so it would not get relitigated by accident, and this relitigates it on purpose, deliberately, in
the narrow form actually asked for: play on a phone browser, not a native build, a different
control scheme, or a redesigned layout. That line is now stale and this entry replaces it.

### What changed and what didn't

`InputSampler` already treated keyboard and gamepad as interchangeable producers of one
`InputFrame` (this file's own opening line on the input module: "the game never reads a key code
or a stick value"). Touch is a third producer of the same frame, not a parallel system: a new
`TouchSource` (`app/input/touch.ts`) holds two stick axes and four button states, set by whatever
widget is driving it rather than polled, and `InputSampler.sampleTouch` reads it exactly the way
`sampleGamepad` reads the pad — including snapping the aim stick to the same eight directions
every other device already snaps to (#20's "eight-way, full stop, on every device" reads literally
now). `updateActiveDevice`'s two-way arbitration (whichever device most recently crossed its
activity threshold wins, gamepad checked first) became three-way with touch appended last in the
chain, after keyboard — an arbitrary but stable tie-break, the same kind the gamepad/keyboard pair
already had.

The radial dead-zone math `GamepadSource.readStick` used was pulled out to `app/input/dead-zone.ts`
so `TouchSource` could reuse it rather than re-deriving the same rescale-from-the-edge formula;
`GamepadSource` itself is otherwise unchanged; its own test suite is the proof.

On-screen chrome (`app/touch-controls.ts`) is a fixed-position DOM overlay — two draggable sticks
at the bottom corners (move left, aim right, matching the keyboard's WASD-moves/arrows-aim split)
and four tap buttons for bomb/use/map/pause — built with the same plain-DOM-plus-`dev-ui/tokens.ts`
approach `accessibility-panel.ts` already established for player-facing chrome that isn't worth a
framework. It mounts only when `window.matchMedia('(pointer: coarse)')` matches, so a mouse-and-
keyboard player on a touch-capable laptop never sees it, and it ships in every build rather than
behind `import.meta.env.DEV` — it is a control scheme, not a debug tool.

### What this deliberately does not cover

No layout changes, no phone-specific HUD, no orientation handling, no app-store build, no
touch-aware tutorial prompts beyond the one activation string (`main.ts`'s `activatePrompt`) that
already had to special-case its device. `render/resolution.ts`'s whole-number-scale rule is
untouched, so a portrait phone narrower than 640 CSS pixels still floors its viewport scale at 1×
and overflows — landscape happens to clear that bar on most phones, but nothing here guarantees or
enforces it. Any of that is a separate, larger piece of work with its own design questions (a
rotate-to-landscape prompt, hiding dev-only chrome like `#seed-control` on a phone, a touch-shaped
settings screen) and was explicitly scoped out of this change rather than silently skipped.

**Constrains:** a fourth input device follows this same shape — a `*Source` class the sampler
polls or reads, one `sample*` method that snaps aim to an octant and treats aim deflection as fire,
and arbitration appended to `updateActiveDevice`'s chain — rather than a parallel input path. Any
UI element gated on `ActiveDevice` (today, only `main.ts`'s activation prompt) has to keep handling
`'touch'` as its own case rather than folding it into `'gamepad'` for convenience; the two devices
have no bindings in common to fall back on.

## 47. Der Rosinenklauber suppresses a `rosinen` item's drawback by per-item convention, not a declared penalty field

**Decided:** M6, #166. **Amends:** none — the choice #166 itself left open.

Der Rosinenklauber's whole effect is "every `rosinen` item you hold keeps its upgrade and loses
its drawback." An item's drawback is not a separable thing today: it is just another entry a
`modifyStats` hook returns, indistinguishable from its upgrade entries to anything outside the
item's own file. Two ways to let the Klauber suppress it:

1. **Per-item convention.** Each `rosinen` item's `modifyStats` checks a cached flag
   (`state.charge`) for whether the Klauber is held, and omits its own penalty entry when it is.
   No engine change; follows the existing "reach into `ctx.sim`, never import a value" rule the
   same way `weisswurst.ts`'s floor check already does for a `sim`-derived condition
   `modifyStats` cannot read directly.
2. **A declared penalty.** `ItemDefinition` grows an optional field that separates an item's cost
   modifiers from its upgrade modifiers, so the Klauber (or anything else) can suppress them
   generically, without each `rosinen` item's author remembering to wire it in by hand.

Chosen: **option 1.** `rosinen` has exactly one member (`apfelkuchen-mit-rosinen.ts`) at the
moment this landed — inventing a new `ItemDefinition` field, a compile/validation rule for it and
a generic suppression path in the engine is real engine surface bought for a convention with a
single follower today, and `.github/ISSUE_TEMPLATE/content.yml` already wants an engine change
like option 2 behind its own feature issue rather than riding in on a content one. The convention
costs one `onPickup`/`modifyStats` shape per tainted item (`apfelkuchen-mit-rosinen.ts`) plus one
shared helper (`der-rosinenklauber.ts`'s `syncRosinenItems`) that walks every held `rosinen` item
on the Klauber's own pickup and removal, so pickup order between the Klauber and a tainted item
never matters.

**Constrains:** every future `rosinen` item has to remember the same shape by hand — a cached
`state.charge` (or `state.timer`, if `charge` is already spoken for) flag set on its own
`onPickup`, read by its own `modifyStats`, and left alone otherwise; nothing enforces this the way
a declared field would. #59's push toward 120+ items is exactly the pressure that could make this
the wrong call in hindsight — the more `rosinen` items exist, the cheaper option 2's enforcement
gets relative to trusting every author to copy the convention correctly. If a `rosinen` item ships
with a forgotten Klauber check, that is this decision's failure mode, and the fix is option 2,
not a patch on option 1.

## 48. A tile may draw at 32x32 on the actor grid, per asset, instead of only 16x16 on the room grid

*`render/room.ts`'s `tileRect` is gone (#74); the per-asset choice stands, read by `render/tiles.ts`'s `tileGridScale`.*

**Decided:** M8, #180, from a direct note that the committed floor/wall tiles read as low-detail
next to character art. **Amends:** #45's tile half — not the actor half, which is untouched — by
turning `TILE_SPRITE_SCALE` from the only grid room art draws on into the default one.

### What #45 said and why this isn't quite reopening it

#45 fixed `ACTOR_SPRITE_SCALE` (one authored pixel per internal pixel, for anything that is a
body) and `TILE_SPRITE_SCALE` (two internal pixels per authored pixel, for room art) as the two
grids a sprite may draw on, and named the choice deliberate rather than an oversight: "a background
that repeats identically and unnoticed carrying less detail than the things acting in front of it"
is the same judgement `tools/art/spec.mjs` already made pinning `tile` at exactly 16x16 while
letting a character grow. That reasoning is sound and this decision does not relitigate it — a
tile that repeats across a whole floor genuinely does not need a character's detail budget by
default, and floor 1's `cellar-plank` block and every destructible stay at 16 for exactly that
reason.

What changed is narrower: whether *every* tile must stay on that grid, or whether an author who
wants more resolvable detail on one — because it reads flat, because it's the thing the player
stares at for an entire floor — can ask for it, on that one asset, without inventing a third scale.
#45's own "Constrains" line is the guardrail this stays inside: "anything new that draws a sprite
takes one of the two grid constants — a third scale is a third pixel size." 32x32 is not a third
scale. It is `ACTOR_SPRITE_SCALE`, the grid that already exists, made available to `tile` as well
as `character`.

### The mechanism

`tools/art/spec.mjs`'s `CATEGORY_SPECS.tile` widens from an exact 16x16 to a 16-or-32 pair —
`tools/art/validate.mjs`'s `validateSpriteSize` enforces the two sizes discretely rather than as a
continuous range, because anything in between (a 24x24 tile, say) would need a fractional sprite
scale to keep its `ROOM_TILE_UNITS` footprint fixed, which `render/resolution.ts`'s whole-number-
scale rule already rules out for every other sprite in the game.

`render/room.ts`'s `tileRect` — the one place every wall, wall-lip, block and void-rect fill draws
through — picks its sprite scale as `ROOM_TILE_UNITS / texture.width` instead of drawing at native
size. A 16px texture gets scale 1 (unchanged: `TILE_SPRITE_SCALE`'s grid). A 32px texture gets
scale 0.5, which combined with `WORLD_ZOOM` lands it on exactly `ACTOR_SPRITE_SCALE`'s 1:1 grid,
filling the identical on-screen cell. The floor-variant loop in `createRoomView` (Floor 2's "living
floor" mix) does the same. Neither path needs to know which grid a given texture is actually on;
the texture's own width says so.

This is what lets floor 1 (`cellar-wall`, `cellar-wall-lip`, `cellar-floor`) and floor 2
(`rural-wall`, `rural-wall-lip`, the four `rural-floor-*` variants) redraw at 32x32 in the same
change that ships this decision, while `cellar-plank`, `rural-hedge-block`, every destructible, and
every door stay at 16x16 with nothing about them touched — a per-asset upgrade path rather than a
floor-wide or game-wide cutover, the same incremental shape #35/#37's own tile art landed in
originally.

**Constrains:** a tile redraw is now also a size decision, not just a palette one — going to 32
doubles the pixel count (and therefore the redraw work and the atlas bytes) for real, resolvable
detail, not a free upscale of the existing 16px art. Per this repo's own pixel-art sign-off
convention, which size to draw at is exactly the kind of choice that needs a candidate shown at
true on-screen scale next to Alois before it lands, not assumed from "more pixels is obviously
better." A future third size is not "just add another number to `LEGAL_TILE_SIZES`" — it would
need its own grid constant and its own whole-number-scale proof the way 16 and 32 already have
one each; nothing here makes a third size cheap.

## 49. Every tile category redraws at 32x32 together, or not at all — mixed density within a category is the bug #48 left open

*`prop-view.ts` is gone (#74): a prop is a billboard sized from its own texture, so the per-category rule is what remains.*

**Decided:** M8, #182, closing the gap #48 (`#180`) deliberately left open: that decision redrew
only floor 1 and floor 2's floor/wall/wall-lip, naming `cellar-plank`, `rural-hedge-block`, every
destructible, and every door as "per-asset upgrade, not floor-wide" — true as a mechanism, but it
left exactly the mismatch #180 was drawn to fix sitting on every other tile in the room: an
obstacle block or a piece of furniture at the old 16px density next to a now-32px floor and a
1:1-detail character.

**What changed:** every remaining `tile`-category asset under `assets/sprites/*/tiles/` —
obstacle blocks (`cellar-plank`, `rural-hedge-block`), destructibles (`cellar-barrel`,
`rural-barrel`, `rural-maibaum-base`), both doors (`door-open`, `door-closed`), and every
decorative prop (`cellar-bulb`, the three crates, `boss-plate`, `pedestal`, `shopkeeper-stand`,
and floor 2's bandstand/bunting/fence-post/hay-bale/maibaum-top/market-stall/tractor/trough/well)
— redrew at 32x32 in the same change, on-palette, each with its own deliberate structural detail
(wood-grain direction, staggered stone coursing, individual leaf-cluster placement, hoop rivets,
fabric folds) rather than a single filter applied uniformly — the same "candidate shown at true
on-screen scale next to Alois" sign-off #48 already required, run once per asset rather than once
for the whole batch, because a barrel's stave-and-hoop structure and a hedge's leaf rosette are not
the same design choice even though both are "add detail to an existing silhouette."

No living room in floors 1-2 now mixes a crisp 32px surface with a soft 16px prop, obstacle, or
door — the exact symptom `#182`'s title named.

**The redraw alone shipped every destructible, door, prop, and the pedestal twice as big, not
just denser — a second bug this same change had to fix before the first draft of it could land.**
`tileRect`'s `ROOM_TILE_UNITS / texture.width` scale (`#48`) was the only place a tile-category
sprite's on-screen size was ever actually derived from its own texture. Every other renderer that
draws this category of art had baked in an assumption that the source is 16px and never checked:
`entities.ts` scaled a destructible target by the fixed `TILE_SPRITE_SCALE` constant regardless of
its texture's real width, `prop-view.ts`'s `centred()` (every decorative prop) and
`pedestal-view.ts`'s plinth set no scale on their sprite at all (native 1-authored-pixel-per-
world-unit), and `createDoorView`'s door tiles were drawn "at native size" by explicit design
comment. All four were silently correct only because every tile-category asset outside `tileRect`
happened to be 16px — the day one of them wasn't, each one doubled on screen with nothing in the
renderer able to notice. `tileRect`'s formula is now `room.ts`'s exported `tileGridScale(texture)`,
and all four call sites use it, the same way `tileRect` and the floor-variant loop already did —
one shared derivation rather than four places that could each independently drift from it again.

`tests/unit/animated-entities.test.ts` gained the regression case this should have had from the
start: a destructible target authored at 32x32 renders at exactly half the scale of one authored at
16x16, not the same scale for both.

**The minimap icons (`minimap-boss`, `minimap-shop`, `minimap-treasure`) also moved to 32x32**,
but for consistency of the file spec only, not for any visual gain: `render/minimap-hud.ts`'s
`makeIcon` draws every room-role icon at a fixed `ICON_PX` (8 screen pixels) regardless of the
source texture's own size — it is HUD chrome sized to the minimap's own scale, not a room sprite
sized by `tileRect`'s `ROOM_TILE_UNITS / texture.width` rule. A 32px source is downsampled to the
same 8px icon a 16px source already was, so the extra authored pixels buy nothing a player can
see. They were redrawn anyway on direct instruction, with a plain bevelled upscale and no bespoke
interior texture — spending hand-authored detail on pixels nobody will ever resolve would be the
wrong side of this same decision's reasoning.

**Constrains:** floors 3-7 (#39-#43, parked in M10) have no tile art yet at all. When they land,
author every tile-category asset straight at 32x32 from the start rather than shipping at 16x16
and coming back for a second pass — this issue and #180 before it are now two separate times a
floor's tile art needed revisiting for exactly this reason, and a third floor doing it the old way
on purpose would be relitigating a settled call. `tools/art/spec.mjs`/`validate.mjs` need no
change either way; the 16-or-32 rule from #48 already covers both sizes.

## 50. Mid-run save/resume replays the input log instead of snapshotting `GameSim`

**Decided:** M7, #45. The save system needed a way to reconstruct an in-progress run exactly —
same room, same inventory, same RNG stream position — after the tab was closed and reopened.
The obvious-looking approach is a snapshot: walk `GameSim`'s ECS `World`, every pooled store
(projectiles, particles, decals, damage numbers), the floor/room graph, the item inventory and
stat cache, and the RNG streams, and serialise all of it. `GameSim` is roughly 4,000 lines and
carries that much state precisely because M2-M6 have spent five milestones adding to it; a
hand-written snapshot format would need to track every one of those additions forever, and a
single missed field is a resume that loads but is subtly wrong — the worst failure mode a save
system can have, because nothing about it looks broken.

**What it does instead:** persists the run's seed and the exact sequence of `InputFrame`s it
received, then reconstructs by calling `startRun(seed)` and replaying every frame through
`GameSim.step` before the player sees anything. This is not a workaround — it is what `GameSim`'s
own class doc comment already promises: it "reads a single `InputFrame` per tick and nothing
else… which is what makes a run reproducible from a seed and an input log," and
`sim/input/frame.ts`'s `InputFrame` doc comment independently says "a replay is a list of these,
and nothing else." The save system is the first thing to actually build that replay, rather than
a second, parallel serialisation format competing with a guarantee the sim already makes.

**What this took to actually hold across a floor advance:** `app/main.ts`'s `advanceFloor` (the
boss-room "next floor" exit) used to reseed the next floor's generator from `Math.random()` — a
real, pre-existing gap in the seed-and-input-log promise above, invisible until something needed
to replay across a floor boundary. Fixed by drawing from `sim.random.floor` (the run's own seeded
floor stream, `sim/rng/streams.ts`) instead, which is also the textbook-correct stream for the
purpose per that file's own "a system draws from its own stream only" rule. Replaying a run that
never crosses into floor 2 never exercised this; the bug had been sitting there since `advanceFloor`
was written.

**What replay does *not* cover:** `app/main.ts`'s dev-only tools that bypass the recorded
`InputFrame` entirely — the `N` key's floor tour (`crossDoor`) and the seed-finder's speculative
`generateFloor` calls — are not part of the input log and are not guaranteed to survive a resume.
This is the same "known gap, written down rather than silently accepted" shape `startRun`'s own
doc comment already uses for the debug-overlay rebind gap.

**Constrains:** #48 (seeded runs, daily run and replay recording) needs exactly this artifact — a
seed plus an `InputFrame` log — for its own replay files, and should extend `save/active-run.ts`
rather than inventing a second recording format. Any future change to what `GameSim.step` reads,
or to what an app-level system does *between* steps that isn't a pure function of `sim` state (the
old `advanceFloor` bug's shape), breaks replay-based resume silently — a determinism regression
here fails the same way it always does: quietly, until someone tries to reproduce a run.

## 51. The Stammtisch is a screen over the run, unlock effects are read rather than applied, and a chair only exists for content that exists

**Decided:** M7, #46. The hub between runs — `GAME_DESIGN.md` §11's regulars' table, where every
boss you beat adds someone and everyone at the table brought something with them.

**A screen, not a room.** The design doc describes a place: the regulars' table in the village
tavern. Building it as one means a second simulation mode — a walkable room, collision, an NPC
to stand in front of and an interact verb — for four people who each say one line. It is drawn
out of the #154 kit instead, over a paused run, which is what makes adding a regular a row in
`content/stammtisch/regulars.ts` rather than a level someone has to author, and what lets #47's
characters and #50's challenges extend the same screen instead of extending a space. The cost
is real and accepted: the hub does not *feel* like a place yet. If it ever needs to, it can
become one behind the same view model, because nothing outside `render/stammtisch.ts` knows how
it is drawn.

**The meta layer is `app/`, not `sim/`.** Unlocks read the save; the save reads `localStorage`
and the wall clock. A `GameSim` that could see how many runs the player had lost would stop
being a pure function of a seed and an input log (#2, #50), so the whole of `app/meta/` is pure
functions over a `SaveData` plus a roster, with `app/meta/index.ts` as the only part that
persists anything. That is also why the rules are testable without a browser and why
`render/stammtisch.ts` holds no rules at all — it draws a view model that
`buildStammtischView` assembled.

**An unlock is a flag other issues read, not an effect this one applies.** `unlocks` is a list
of ids in the save; nothing in `app/meta/` knows what any of them *do*. #85 will read
`promille` to keep the first runs sober, #47 will read a character id, #50 a challenge. The
alternative — an unlock carrying a function, or a switch statement over ids — would put every
future feature's behaviour inside the hub, which is exactly the shape that makes a hub the file
everyone has to touch. The consequence to be honest about: the `promille` grant currently runs
ahead of its gate, so beating Der Stier announces a mechanic that is already on for everybody.
That errs in the harmless direction (nobody is shown something they cannot have) and #85 closes
it.

**Unlocks are re-evaluated on every commit, never granted by the code that raised the event.**
`grantEarnedUnlocks` walks every definition against the save's statistics each time the save
changes. So an unlock added to the roster later is granted retroactively to whoever already met
its condition, a re-tuned threshold takes effect on the next commit rather than being frozen
into whoever was playing that week, and the boss-defeat path and the run-end path cannot drift
apart. The cost is a walk over a handful of definitions a few times per run.

**The table has a chair for content that exists, and not one per planned floor.** Two chairs
are earned off the two bosses in the game; the other two off totals (kills, runs) a session
actually reaches. Seven chairs for seven floors would have been the obvious shape and would
have meant an itch.io release (M9, two floors) shipping a table with five chairs nobody can
ever fill — a progress bar that is mostly a promise. Adding a floor's chair is a row on the day
that floor's boss lands, exactly like `HIGHEST_PLAYABLE_FLOOR`.

**Save schema v2, and the first real migration.** `lastRun` and `greetedRegulars` are new
stores: `bestRuns` is sorted by length and capped, so the run a player *just* finished is often
not in it, and a table commenting on your best run ever after you died in thirty seconds is the
generic-feeling text this issue exists to avoid. The v1 → v2 migration back-fills `lastRun`
from the most recently recorded best run, and #45's `MIGRATIONS` chain went from "proven
against a synthetic fixture" to carrying a real step — indexed by version, so `MIGRATIONS[i]`
takes a save at version `i` to `i + 1` and index 0 is a v0 stamp rather than a hole.

**Constrains:** #85 (Promille gate), #47 (characters), #50 (challenges and achievements) and
#48 (seeded/daily runs, which the run-start panel's seed row is the front end of) all attach by
adding a row to `content/stammtisch/` and reading an id out of `save.unlocks` — not by adding a
branch to the hub. Any new per-run statistic an unlock wants to be earned on has to be
committed in `withRunOutcome`/`withBossDefeat`, because those two are the only places the save
learns that anything happened.

## 52. The sober run is one gated getter, one item flag, and a run parameter in the save

**Decided:** M7, #85. The implementation of [#9](#9-promille-is-unlocked-not-on-from-the-first-run),
which said the mechanic would be unlocked rather than on and left the shape of the "not
unlocked" path open. Three of the answers turned out to constrain other work, so they are here
rather than only in the code.

**One gated getter, not a guard per system.** #9's own wording asked for "the system not
running, rather than the system running with its numbers set to zero", and the honest reading
of that was tempting: a branch in movement, one in shooting, one in the camera, one in the HUD.
What actually shipped is smaller and stronger — `GameSim.promille` returns `0` when the run is
sober, and the tier, the drift, the aim wobble, the camera sway, the screen distortion, the
stat modifiers, the HUD bar and the debug readout are every one of them already a pure function
of that number. Six guards that could drift apart became one that cannot, and it holds even for
the debug tuning window, which writes `tuning.promille.current` directly and bypasses
`addPromille` (also gated, so the field cannot quietly accumulate either). The cost is that
"the meter is zero" and "there is no meter" are the same state inside the simulation; what
distinguishes them for anything that needs to know is `GameSim.promilleUnlocked`, which is what
the HUD and the drop tables read.

**A tier gate and a mechanic gate are two different fields.** `promilleRequirement`
(`any`/`sober`/`rausch`, #26) says which *tier* an item needs. It cannot express Konterbier,
which clears a Kater at any tier and is therefore perfectly inert in a run that cannot have
one — and #85 names Konterbier specifically. Extending the enum with a fourth value would have
kept one field at the price of mixing two kinds of question in it; instead `needsPromille` is
its own boolean, defaulting to `promilleRequirement !== 'any'` because an item that needs a
tier needs the meter that has tiers. Eleven of today's items set it explicitly, and the
registry rejects the contradiction (`needsPromille: false` on a gated item) rather than picking
a side.

The field is data an author has to remember, which is a failure mode, so it is backed by a
test rather than by a convention: `tests/content/sober-run.test.ts` asserts that no item a
sober run can be offered has a *description* naming Promille, Kater, Trinkfest or a tier. That
works because `ItemDefinition.description` is required to be a plain-language translation of
what the item does — an item that is Promille machinery and forgot to say so gives itself away
in its own player-facing text. The same file checks the other paths content can leak through:
a sober drop table naming the beer pickup, a room template authoring one directly (which does
not go through `dropLoot`'s branch at all), and a pool the filter has emptied.

**The run's state is saved with the run, not re-derived from the unlock set.** Save schema v3
adds `promilleUnlocked` to `ActiveRunSave`. This is not redundancy: `withBossDefeat` commits
the Promille unlock the instant Der Stier falls (#51, deliberately), so a player who beats him
and closes the tab has a save whose `unlocks` say "promilled" describing a log that was sober
for every tick it recorded. Rebuilding that run from `unlocks` would replay the same inputs
against different drop tables and a different item pool — a resume that is quietly not the run
that was saved. The v2 → v3 migration back-fills `true` for the same reason and not from
`unlocks` either: every run recorded before the field existed *was* promilled.

**Constrains:** a run is reproduced by its seed **and** its parameters, of which this is the
first. #48's replays and shared seeds have to carry the same flag, and any later run parameter
(a character, #47; a challenge, #50; a curse, #49) is another one — the shape to copy is a
field on `ActiveRunSave` plus a migration, not a re-derivation from the save's current state.
Any new item whose effect spends, refunds, caps or tolerates the meter must set
`needsPromille`, and any new pickup whose description names the mechanic needs a
`soberDescription`; both are enforced on the pull request rather than at runtime. The dev
override (`B`, `__kellerbier.promille`) lives in its own `localStorage` key rather than in the
save, so it never travels through export/import to somebody else's machine and `resetProgress`
does not silently clear it.

## 53. A replay is a compressed input log, watched by re-entering `startRun` — never a second sim mode

**Decided:** M7, #48. Seeded runs, the daily run, and replay recording/playback — cashing in the
determinism #2/#3 already promise ("a run is its seed plus its input log").

**Nothing new to store, bar one field #52 also needed.** `sim/input/recording.ts`'s
`InputRecording`/`InputPlayback` and `app/save/schema.ts`'s `ActiveRunSave` (#50) already had
everything a replay needs — a seed and a packed frame log. `app/replay/` adds only what those two
didn't: `codec.ts` compresses the packed bytes with `CompressionStream('gzip')` for storage/a
`.json` file, and `store.ts`/`file.ts` are the save-side and file-side plumbing around that. The
one field `ReplayRecord` does carry beyond that — `promilleUnlocked` — exists because #52 landed
in the same v3 and its own "Constrains" section named this exact requirement: a replay is
reproduced by its seed **and** its run parameters, so watching one has to reconstruct the
Promille state that run actually had, not whatever the save happens to say today. The 100 KB
budget (`tests/determinism/replay.test.ts`) is gzip finding the repetition ordinary play already
has — a held direction or a held fire button is many identical frames in a row — not a bespoke
encoding; a synthetic worst case (a stick sweeping through a full circle every single tick,
never once repeating) does not hit the budget, but no real run plays that way, and the
literal claim in `CLAUDE.md`'s docs already banked on this ("a full run compresses to a few
kilobytes because the simulation is deterministic").

**Watching a replay is not a second run mode.** `app/main.ts`'s `enterReplay`/`seekReplayTo`
call the exact same `startRun`/`advanceOneTick(frame, false)` path `resumeActiveRun` already
uses to fast-forward a saved run on reload — the only new argument is `startRun`'s `persist:
false`, which stops a replay's own throwaway recorder from overwriting the real `activeRun`
save slot. Scrubbing is therefore "rebuild from tick 0, replay up to the target tick," the same
technique a mid-run resume already relies on, rather than a snapshot/rewind mechanism this
issue would otherwise have had to invent.

**A replay is only ever entered over a finished run.** `V` (watch) and loading a replay file are
both gated on `deathPhase === 'over'` (loading a file additionally confirms if a live run is
mid-flight) — because entering one calls `startRun` and there is no live run's state to
preserve once its outcome is already recorded. This is what keeps replay-watching from needing
a "pause and remember the live run" mechanism: there is deliberately nothing to remember.
`advanceDeathSequence`'s outcome-recording (save write, daily-run entry, `pendingSeed` reroll,
auto-opening the hub) is skipped while `replay !== null` for the same reason — a replay
reproduces an outcome that was already recorded once, for real, and must not record it again.

**The daily run's "one attempt" is a local, honest-player mechanism, not an enforced one.**
`dailyRunHistory` records the *first* result for a UTC date key (`app/daily.ts`'s
`dailyDateKey`, chosen over local time so the seed and the "already played" boundary land on
the same real moment for every player) and ignores a later attempt on the same seed — there is
no server to check against, so a player can always clear `localStorage` and play again. That is
the same trust model every other stat in `save/schema.ts` already runs on; a real leaderboard
would need a server-side day boundary and attempt count, not a client-side one, which is why
this is recorded as a local decision rather than treated as the finished feature a leaderboard
would need.

**Constrains:** a future server-backed daily leaderboard needs its own attempt-counting, not an
extension of `dailyRunHistory`. A future "resume a live run into a replay without losing it"
feature (not asked for here) would need `enterReplay` to snapshot rather than discard the live
`sim`, which nothing here does today.

---

## 54. A character is a stat block plus named rules, and a rule is a branch in exactly one system

**Decided:** M7, #47. The other five playable characters — `GAME_DESIGN.md` §3's roster, whose
own rule for itself is that each one is a different **verb**, not a different stat spread.

**The verb cannot be data, so the *name* of the verb is.** Bruder Barnabas refuses food, König
Ludwig flies, Der Wolpertinger is rerolled every floor, D'Sennerin's ricochets come back at
her. None of that is expressible as numbers, and a `CharacterDefinition` carrying functions
would put behaviour in `src/content/`, which the `content-is-data` lint rule exists to prevent
(#7, and the M6 schedule's assumption that adding content is a data change). So a character is
a stat block, a list of item ids, a list of projectile tags — and a list of **rule ids**. Each
rule id is read by exactly one system: `refusesFood` by `sim/systems/pickup.ts`, `flies` by
`sim/systems/movement.ts`, `ricochetHurtsOwner` by `sim/systems/collision.ts`, `fasting`,
`purse` and `chaos` by `GameSim` itself. Adding the seventh character stays a file in
`src/content/characters/`; adding a genuinely new verb costs a rule id and one system, which is
the honest price of a verb that did not exist before. The three ids read on per-tick paths are
resolved to booleans once at construction, so no hot loop scans an array to find out who it is
carrying.

**Three of the four ways a character touches the pipeline are separate sources.** The fixed
stat block registers once as `'character'`; Barnabas's fast is `'character-fast'`, Ludwig's
purse `'character-purse'`, the Wolpertinger's roll `'character-chaos'`. One combined source
would have been fewer lines and would have made the stat inspector (#25) say "Resi ×1.3" where
the truth is "Resi ×1.3, and Fastn ×1.5 because you have not eaten in a minute". The whole
point of #25 was that a number comes with the chain of named reasons that produced it.

**A character's own condition, not an entry in the unlock list.** #46 wrote
`CharacterDefinition.requires` as the id of a `STAMMTISCH_UNLOCKS` entry, because at the time
the only unlockable things were what the four regulars brought. Every unlock belongs to exactly
one regular — the content test asserts it, and the table is drawn on that assumption — so five
characters as five unlocks would have meant nine chairs at a four-chair table: one feature's
roster rebuilding another feature's furniture. A character states the same `UnlockCondition`
instead, so `conditionMet`/`conditionProgress` and the "always something to work toward"
progress line come along unchanged, and the roster is drawn as its own panel on the run-start
side of the hub.

**The conditions are what the shipped game can produce, not what the design doc wants.**
§3 unlocks Resi on floor 3 and König Ludwig by beating him on floor 6. Floors 3-7 are parked
(M10), so those are goals with no way to reach them — the "a gate nobody updated" failure
`CLAUDE.md` warns about, in its purest form: a perfectly correct character nobody can ever
play. Every condition is therefore something a player of the current two-floor build can meet
(the two bosses, total kills, finished runs, Der Stier three times as Ludwig's stand-in), and
`tests/content/characters.test.ts` fails the build if a new one names a floor past
`HIGHEST_PLAYABLE_FLOOR`. Each becomes its intended condition in the same file on the day its
floor lands.

**Flight crosses furniture, never the map.** `RoomGeometry.addBlock` grew an `overflyable`
flag, and it is off by default: an authored obstacle opts in, while the blocks standing in for
an `L`/`T` room's unclaimed grid cells (and a staircase's seams) do not. The failure mode of
the other default is a player flying out of the room into cells that were deliberately not
compiled, next to doors that were deliberately not made; the failure mode of this one is a
crate Ludwig has to walk around. His flight is also *rented* — the purse drains a Biermarke a
second and his damage multiplier dies with it — which is the answer to the issue's own warning
that flight must not trivialise a floor built around obstacles: crossing them is a shortcut
whose currency is time, and time is what his purse is denominated in. Floors 4 and 6 are the
real test of that, and they do not exist yet.

**Save schema v4**, two fields. `selectedCharacter` is a preference, not progress — a stored id
that is unknown or has since re-locked falls back to the first unlocked character rather than
failing, because a `startRun` that throws is a black screen. `ActiveRunSave.character` is the
other one, and it is #52's argument applied unchanged: a character is a run *parameter*, so it
rides with the log it describes. The table writes a choice the moment the player cycles to it,
mid-run included, so a run resumed against the save's *current* pick would replay one
character's inputs at another's health and speed — the same divergence #85 had to prevent for
the Promille flag, discovered by merging into it. `ReplayRecord.character` is the third copy of
that same argument, found the same way when #53's replays landed: a replay is a rebuilt run,
so watching a Barnabas run while the table has Resi selected would reconstruct a run nobody
played. Both back-fill to Alois, which is the only character a log recorded before this issue
could have been.

**Constrains:** #48's daily run has to decide whether a fixed character is part of a day's seed.
#50's challenges are the same shape as a character (a run modifier chosen at the table) and
should reuse `CharacterTraits` rather than growing a parallel one. Per-character *art* is
deliberately not part of this — every character plays as Alois's sprites today, because new
pixel art needs a sign-off round (`CLAUDE.md`) that a stat block does not.

## 55. Character art is chibi-proportioned: a head that is a third of the body, eyes with a sclera, and a silhouette prop

*The wall-lip "continuous tiling band" is superseded by #74: the lip is the face of a wall box in `render/world/scenery.ts`. The proportions and palette tiers stand.*

**Decided:** M8, redrawing Alois. The old roster is drawn at roughly realistic proportions —
Alois was a 16×28 figure whose head was eight of those rows, with two pixels of eye and no
mouth — and at the 640×360 internal frame that reads as "small person, far away" rather than as
a character. The reference the direction was picked against is the Japanese-console-RPG chibi:
head deliberately over-large, face carrying real expression, body simplified to the few shapes
that survive under it.

**The three rules are proportion, face, and prop.** *Proportion:* the head, hair and any
headwear together are between a third and a half of the sprite's height — Alois lands at 16 of
32 with the Hut on, ~9 without it. *Face:* eyes are drawn with a white highlight against a dark
iris, wide enough to read a blink, a squeeze and a half-lid as three different things, and
there is a mouth. That is what buys the `idle`/`hurt`/drunk poses their expression budget
without a single extra frame: on a two-pixel eye the drunk strip and the sober strip differ
only in how the legs are placed. *Prop:* a character gets one silhouette-carrying object it is
recognisable by at a glance and from behind — Alois's Trachtenhut, and the brass Trink-Rucksack
keg that is now drawn on the hip facing the camera and on the back facing away. The keg is the
reason `render/player-view.ts`'s `SCHLAUCH_ANCHOR` is measured off the art rather than picked:
the hose has to leave the tank a player can see.

**A canvas is a size, so the size was signed off with the design.** `docs/DECISIONS.md` #45
made an authored pixel an internal pixel, and `CLAUDE.md`'s sign-off ritual makes the canvas
part of what a person chooses. Four options were rendered at true scale on a Der Keller floor
tile — a 2-head 18×26, this one, a 2.7-head 18×32 and a soft-inked 22×34 — and 20×32 was
picked. That is 1.14× the player's 28-pixel collider, comfortably inside
`tests/content/sprite-scale.test.ts`'s 0.6-1.8 band, and about one floor tile tall, which is
the ratio the rest of the roster now has to be redrawn against.

**Hard black ink, flat fills, no dithering.** Every silhouette edge is `#000000`; shading is at
most one step of the palette ramp, and only where a shape would otherwise be ambiguous (the
hair parting on the back of the head, the iron hoops on the keg). The alternative — the
soft-inked, three-tone option — was the more sophisticated drawing and the worse *game* sprite:
at 1:1 over Der Wald's near-black floor it loses its outline entirely, and the projectile
legibility argument in `docs/DECISIONS.md` #39 applies to a body standing on that floor for the
same reason it applies to a shot crossing it.

**Alois alone is composed from source; everything else stays a drawn PNG.** His seven strips
are forty-four frames holding about a dozen distinct drawings — six directions of one body, each
with an idle, a blink, two walk contacts, a flinch and three death beats — so they are authored
as blocks in `tools/art/authoring/alois.mjs` and written out by `npm run art:alois`, with
`tests/art/alois-authoring.test.ts` holding the committed PNGs byte-identical to that source.
This is #43's argument for UI art, applied to the one sprite in `assets/` with the same
repetition problem, and it is deliberately not a policy: a Kellerassel is one drawing seven
times and belongs in the pixel editor. The cost is that these seven files cannot be hand-edited
and committed, which is the right way round — the failure it prevents is someone running the
build and silently reverting touch-ups nobody wrote down.

**Constrains:** every remaining character, boss and shopkeeper sprite, which are now
inconsistent with the player until each is redrawn — one issue per group, each needing its own
`CLAUDE.md` sign-off round, since this decision fixes the *style* but not any particular
creature's canvas. `PENDING_REDRAW` in `tests/content/sprite-scale.test.ts` already names two
of them for a different reason and should be emptied by the same work. Per-character art for
#47's roster (#54's closing note) inherits these rules whenever it lands.

**Amendment (M8, #193): the two bosses are full chibi, not an exception.** The question
#193 existed to answer was whether a boss — the one thing in a room that is meant to
frighten — should follow the chibi direction or break it. Three readings went to an option
round at true scale on each boss's own floor with Alois in frame: full chibi, chibi
proportions with a hostile face, and a deliberate realistic exception. **Full chibi won.** A
boss is as cute as the roster and the threat is carried by scale, motion and the telegraph
pose, not by the face — with one concession, a slightly angled dark brow, so the read is
"the game, but this one wants to hurt you" rather than "the mascot". Every boss on floors
3-7 (#39-#43) inherits this. The "Alois alone is composed" paragraph above is also amended:
Die Große Kellerassel, Der Stier and the Maibaum-Dieb are composed from
`tools/art/authoring/bosses.mjs` too, for Alois's exact reason — seven frames of one
re-posed body — and "a Kellerassel belongs in the editor" now means the *floor* Kellerassel,
not the boss. The scale that came with the win is #56.

**Amendment (M8, #196): the tiles get a contrast hierarchy, and it runs the other way.**
Every other redraw in this set brings a sprite *up* to the chibi direction. The tileset is
the opposite job: a chibi foreground only reads because it is the boldest thing on screen, and
a background drawn with the same hard `#000000` ink and the same confident shapes takes that
away — the room becomes a colouring book. So the wall/lip/floor tiles were redrawn *quieter*,
and the three-tier rule floors 3-7 inherit is:

- **Background surface** (`*-wall`, `*-floor`/`*-floor-*`): the darkest mark is the floor's own
  darkest background swatch (`tools/art/palette.mjs`'s `floorBackgroundSwatches`), **never**
  `#000000` or the `#1c1a1f` near-black. Internal value spread is at most one step of that
  palette. Texture is sparse and seam-safe — a wall that reads fine as one tile and busy tiled
  across a room (Der Keller's old diagonal `cellar-floor`, the hard mortar courses) is the
  specific failure this fixes. The wall band behind everything also grew a `bleed` margin — it
  tiles a few cells past the frame on every side, *equally*, so a letterboxed viewport shows
  wall rather than a hard edge and the same amount of it top and bottom (a `0..frame` fill sat
  flush at the top and overshot at the bottom, which read as the room being off-centre).
- **Prop / obstacle / boundary** (`*-hedge-block`; `cellar-plank` by the same rule though it
  was out of #196's scope; and — the one background tile that moved up a tier — the
  **wall-lip**): middle weight. One step of `#1c1a1f` near-black on form-defining edges,
  moderate internal contrast. The wall-lip stopped being a flat value bar: it is the built
  wall the doors are set into, so it carries real material (Der Keller's `cellar-wall-lip` is a
  rubble-stone footing, Dorf & Acker's `rural-wall-lip` the base of a trimmed hedge), authored
  lit-top / contact-shadow-bottom. `render/room.ts` lays it as a **continuous tiling band**
  along each edge — turned a quarter per edge so the shadow always meets the floor — covering
  exactly the interior span and no more; a band rather than a row of discrete tiles so there is
  no cell grid for a door sprite to sit half a cell out of. The corner cells beyond get a
  dedicated `*-wall-lip-corner` tile (rotated from a north-west master): a solid, most-shadowed
  block of the wall material with no straight contact-shadow edge, because a corner cell
  touches the floor only at its one diagonal point. The bare 1px `wallEdge` stroke it replaces
  is kept only for a floor with no tile art at all.
- **Foreground** (doors, Alois, the roster): unchanged. Full `#000000`, full value range. The
  door is the one tile in #196's scope that kept foreground ink weight, because a door is a
  thing the player walks at deliberately, not a surface (see #58).

Composition changed, not palette — every redrawn tile is built from the same
`FLOOR_PALETTES` colours it was, so `FLOOR_BACKGROUND_SWATCHES` and the projectile-legibility
gate (`tools/art/contrast.mjs`, #39) did not move. `tools/art/spec.mjs`/`validate.mjs` are
untouched; the tiles stayed 32×32 (#48/#49 already settled size, and a finer 1:1 grid buys
composition room, not resolution). Floors 3-7 author their tiles to this hierarchy from the
start.

**Amendment (M8, #191): the Der Keller roster, and "a creature gets a face" is not absolute.**
Floor 1's roster is the first of the per-group redraws. It is mostly *not* people — a
woodlouse, a mould patch, a rolling barrel, a barrel splinter, a wall tap — so #55's three
rules were re-read rather than transferred, and the option round settled which carry:

- **The face rule is for the animals only.** The Kellerassel, its shed segment and the
  Bierratte get an eye — a white sclera against a near-black pupil, big enough to read a
  blink and a flinch. The **Schimmelfleck does not**: it is a spreading growth and reads by
  its lumpy silhouette and the way it pulses, not by looking back — a deliberate exception to
  "every creature gets a face", because the thing it *is* has no face. Its Spore inherits
  that. The **Zapfhahn and Rollfass stay objects** — a wall tap is plumbing, a barrel is a
  barrel — the same call #192 makes for the Traktor. The Fasssplitter is flung debris.
- **Proportion becomes "the head-feature is oversized".** The Kellerassel's front plate and
  the Bierratte's head are large against a shrunk body; there is no shared head block the way
  #192's human roster has one, because these bodies share no head shape.
- **Brown, not grey, for the chitin.** Der Keller is the lowest-contrast floor by design
  (`tools/art/palette.mjs`'s three close greys), so #55's "lean on the outline, not the
  shading" clause bites hardest here. The Kellerassel and its parts are drawn in the floor's
  one brown, which separates them from the grey wall before the `#000000` edge even has to.

The Kellerassel stays a seven-frame strip — same frame count and the same
idle/move/hurt/death clip list its untouched `.anim.json` names — now built from shared parts
(`tools/art/authoring/floor1-roster.mjs`, `npm run art:floor1`), with the three death beats a
woodlouse's actual defence: it rolls into a ball. The canvas grew from 24×16 to 26×18. The
other seven sprites are single frames. `kellerassel-segment` leaves `PENDING_REDRAW` in
`tests/content/sprite-scale.test.ts` (redrawn to 0.71× its collider, inside the band); the
list now holds only `shopkeeper`, for #194. Everything is byte-locked by
`tests/art/floor1-roster-authoring.test.ts`.

**Amendment (M8, #192): the Dorf & Acker roster, and the human head ratio is decided here.**
Floor 2's roster is the second of the per-group redraws (#191 is Floor 1's). Two calls the
issue held for the option round, both now settled and recorded so a later sprite cannot
re-litigate them:

- **A person on this floor has Alois's head ratio, not two-thirds of it.** Bauer,
  Blaskapellist and Böllerschmeißer carry a head-plus-headwear that is ~44% of the sprite —
  Alois's own proportion — so they read as his brothers rather than as adults he is a child
  beside. The alternative (human heads at two-thirds of Alois's, making him read childlike)
  was a valid direction and was rejected deliberately. `HUMAN_FACE` in
  `tools/art/authoring/floor2-roster.mjs` is Alois's eye and mouth verbatim, spliced into
  every full-bodied human; the test asserts it is present, so "same ratio" is enforced, not
  hoped for. The Gartenzwerg keeps its own outsized-hat chibi proportion (it was already
  chibi — the question was only what changes, and the answer is: it gets Alois's eye and the
  hat becomes its thrown prop); the Kuh and Gockel scale the feature that reads as the head
  against a shrunk body.
- **The Traktor stays a machine — grille and headlamps, no eyes.** The Kuh has a face because
  it is livestock and follows the creature rules; a tractor with eyes is a different game's
  tone, and Floor 2 is the one that has to stay funny without becoming cartoon farmyard
  (`docs/CONTENT_BIBLE.md`). Its chibi read is carried by proportion — fat wheels, stubby
  hood, the oversized exhaust stack that is also its prop.

Floor 2 has no red, brown or skin tone in its five (`tools/art/palette.mjs`), so "skin" is
`#cabc92` — cream two steps down, the warmest tone the floor allows, the same one the
Maibaum-Dieb established (#199) — and the roster is blue/green/cream throughout. Hard
`#000000` ink matters more on this bright floor than on Der Keller: the failure mode is a
sprite with too much saturated fill competing with the tileset, and the outline is what keeps
a body in front of it. The seven sprites are composed from source
(`tools/art/authoring/floor2-roster.mjs`, `npm run art:floor2`), byte-locked by
`tests/art/floor2-roster-authoring.test.ts` — Alois's argument (#55) and the bosses' (#56)
applied to seven near-identical chibi bodies that share one face. The Maibaum-Dieb is
untouched: #193/#199 already moved it to `bosses/` and composed it. This landed in one pull
request with #191 (the Floor 1 roster above) — the two halves of the same redraw, sharing the
authoring method and this amendment — so `PENDING_REDRAW` in
`tests/content/sprite-scale.test.ts` came down to just `shopkeeper` (#194) across the pair.

**Amendment (M8, #194): the Wirt, and `PENDING_REDRAW` empties.** The last of the character
redraws, and the smallest, but `common/` rather than one floor's roster — a shopkeeper is
drawn against every floor's tileset, so #39's projectile argument ("no single value clears all
seven") applies to a body for the same reason it applies to a shot, and he is authored from
the master palette the way Alois is, not held to one floor's five. Three readings went to the
option round at true scale on Der Keller and Dorf & Acker tiles — a bald innkeeper with a
raised stein, a capped one with a bar rag, and an older, grey-bearded one with a tray — and
**the grey-bearded reading with the tray won**. `FACE` in `tools/art/authoring/shopkeeper.mjs`
is Alois's eye and mouth verbatim (the same splice `HUMAN_FACE` above makes), the beard leaves
a deliberate gap at the mouth rather than covering it, and the tray's brass rim sits a pixel
past the shoulder line on each side so it reads as held rather than fused into the torso. He
is composed from source the same way, `npm run art:shopkeeper`, byte-locked by
`tests/art/shopkeeper-authoring.test.ts`, and gets a two-frame `idle` breathing loop — a
static common-room body is the "paused game" read #151 already rejected for Alois, and the
shop is the one room the player has time to stand and notice it in. His canvas grew from
16×16 (0.57× his 28px `normal` collider, the last name on the art-debt list #45 recorded) to
22×32 (~1.1×), which empties `PENDING_REDRAW` in `tests/content/sprite-scale.test.ts` for the
first time since #45 opened it.

**This is the first non-Alois `common/` creature to animate, and the loader had never been
asked for one.** `render/floor-art.ts`'s animated-strip glob was `floor-*/characters/*.strip.png`
only — deliberately, per its own comment, because until now the one thing in
`common/characters/` that animated was Alois, loaded by `render/player-art.ts` and keyed by
facing rather than by enemy id. Dropping `shopkeeper.strip.png` in did not fail the build (the
art pipeline's own checks are bucket-agnostic) and did not fail a test (nothing asserted the
loader's glob coverage) — it silently fell back to the shared blob at runtime, caught only by
standing in front of him in a real room. Fixed by adding `common/characters/*.strip.png` (and
its sidecar glob) alongside the floor pattern in `STRIP_URLS`/`STRIP_SIDECARS`; Alois's own
strips land in that map too now, unused, the same "flat and complete rather than filtered per
consumer" every other glob in that file already is. Constrains: the next `common/` creature
that needs a clip inherits this for free, but a silent art-pipeline gap like this one is the
argument for actually playtesting art in the running game, not just the build passing.

## 56. A boss is its own enemy size class, drawn taller than its collider and standing on it

*The anchor exception was generalised by #73 and its mechanics superseded by #74: every billboard is bottom-anchored on its footprint. The size class stands.*

**Decided:** M8, #193, alongside #55's boss amendment. "Bosses can be bigger — 20-25% of the
screen, look to Isaac" was the direction, and #45 makes that a decision with a consequence:
since an authored pixel is an on-screen pixel, a boss drawn at a quarter of the 360-tall frame
is ~90-140 internal pixels of silhouette, and `tests/content/sprite-scale.test.ts` holds every
body to within 1.8x the collider it is drawn over. Die Große Kellerassel and Der Stier were
`mid` (radius 10, a 40px collider); a 130px chibi over that fails the check, and papering it
with an exemption is exactly what #193's acceptance criteria forbids.

**So `boss` is a fourth `EnemySize`** (`sim/enemy/size.ts`), radius 22 — a 44-world-unit,
88-internal-pixel collider, ~3x `mid` — which puts a quarter-frame silhouette mid-band. This
is deliberately a real gameplay quantity and not a rendering fudge: the hitbox is what dodge
spacing, knockback and contact separation all read, and an Isaac boss *does* occupy a large
piece of the room. Mass 20 with it, high enough that a player's own body checking the boss
never shoves it off a charge line — Der Stier keeps that as an explicit override so its feel
does not move if the class default ever does. The two existing bosses and the Maibaum-Dieb move onto the
class in the same change; their authored health and contact damage are unchanged, so the
fights are the same fights at a bigger read. `mid` stays the ceiling for the `character`
sprite category (`tools/art/spec.mjs`), and the Maibaum-Dieb moved from `characters/` to
`floor-2-rural/bosses/` to match — which is also how it picks up the boss ground shadow.

**A boss stands on its collider rather than being centred through it.** #45's "authored size
is on-screen size, centred on the body" is right for anything the size of a body; a sprite
two to three times taller than its hitbox, centred, sinks half of itself through the floor.
So `render/entities.ts` bottom-anchors a boss sprite (and its corpse, and its shadow) at the
collider's lower edge — the one place the anchor is not `0.5` — and every boss frame is
authored with its ground contact on the canvas's bottom edge, `bob` bending the legs rather
than lifting the feet, so the anchor lands on the shadow instead of a few pixels above it.
Everything else is untouched, and a recycled ECS slot that was a boss and is now a fly is
explicitly put back to centre.

**The wind-up is read off the body, not the ring.** Every other enemy grows a telegraph ring
over its wind-up; scaled to a boss's collider that ring wraps the room and says nothing about
where it is safe to stand. So a boss gets no ring — its `telegraph` clip holds a visibly
strained pose and `ENTITY_PALETTE.bossTelegraphTint` flushes the body red over the countdown.
The attack's own telegraph (the spit cone, the charge line) still has to be dodgeable on
position; that was never the ring's job.

**Constrains:** every floor 3-7 boss (#39-#43) is authored at this scale and this class from
the start, ground contact on the bottom edge, and telegraphs by pose + flush. `tools/art/
spec.mjs`'s `boss` canvas ceiling (160x160) is now a real limit rather than a generous one,
and a boss that genuinely needs to be taller is a spec change with a paragraph, not a quiet
bump.

**Amendment (#199): the Maibaum-Dieb comes off this class.** When phase two stopped being
"Der Stier with a rider" and became the thief dismounted and fighting on foot, "a quarter of
the frame" stopped being true of him — he is a stocky Bua, player-sized, so he is back to
`normal` (radius 7). He keeps his art in `floor-2-rural/bosses/` and so keeps the boss ground
shadow and the pose-plus-flush telegraph; "boss" for him is the health bar and the room, not
the size class. The stolen maypole is no longer raised in his sprite either — it is 2-3x his
height, far past a `normal` canvas and past the `sprite-scale` band if it were in his
silhouette — so `render/maibaum-view.ts` draws it separately, in his hands, angled by the
swing. Der Stier himself is unchanged: still `boss`, still 24 health, just no longer splitting
at half.

## 57. The Maibaum-Dieb's phase-two branch is emergent from four small primitives, not a stored flag

**Decided:** #199. Floor 2's phase two is now a distinct on-foot fight whose shape depends on
one thing the player controls during phase one: whether the arena's maypole is still standing
when Der Stier dies. If it is, the dieb walks to it, grabs it, and only ever swings a wide
telegraphed arc. If the player brought it down (~7 hits, up from a barrel's 4), he has no
weapon and falls back to Der Stier's own charge.

**No "armed" bit is stored anywhere.** Which branch he is in is just which state his machine
walked into. `approachProp` heads for the nearest live prop of a named kind and falls back to
`walkTowardPlayer` when there is none; `whenPropWithin`/`whenPropBeyond` fire on that same
distance (and `whenPropBeyond` always fires when the prop is gone — an infinite distance);
`grabProp` removes the prop on entry and is a silent no-op when nothing is in range. Five
primitives in `sim/enemy/`, each validated at construction (`docs/DECISIONS.md` #7), each small
enough to be worth having for one set-piece — the same bet #14 makes about the whole enemy
format. The maypole picks one of three authored arena positions per room entry from
`random.floor` (the stream that already owns placement), spawns with a mass so high nothing
moves it (`MAYPOLE_MASS` — a maypole is planted, only chipped down), and while it stands it is
`render/maibaum-view.ts`'s to draw: tall, walk-behind (the view re-orders itself against the
player each frame), and doubling as the weapon once `GameSim.consumeProp` latches
`maypoleStolen`.

**`meleeArc` is a reusable swept blade, not a one-tick sector.** The aim locks when the state
is entered, then the blade travels `arc` radians over `sweepTicks` and each tick only threatens
the wedge it crosses *that* tick — standing inside the arc's footprint is not being caught by
it, and the blade passes any bearing once so it connects once (the player's contact i-frames
cover the rest). `meleeBladeAngle` is shared by the hit check and by the view that swings the
weapon sprite, so the pole a player sees and the wedge that can hit them are one motion.
Scale-free and weapon-agnostic: the Maibaum-Dieb swings the maypole with a 90° arc at reach 64
(`weapon: 'maibaum'`), and a future Wiesn mob can swipe a Bierbank with a small one — the sim
owns the sweep, each weapon gets its own tiny `render/` component keyed off its own trigger.

**Constrains:** nothing new on the schedule needs this, but a later boss that wants a
content-driven branch on room state has `whenPropWithin`/`whenPropBeyond` and `approachProp` to
reach for, and any melee mob has `meleeArc`. A graceful-degradation note: a
`meleeArc`/`grabProp`/`approachProp` that names a prop kind no floor authors is a typo, and
throws at registry construction rather than producing a boss that never attacks.

## 58. A door is a half-tile mirrored into a whole, it parts along the doorway, and it has three states

*Drawing superseded by #74: a door is `DoorPiece` in `render/world/scenery.ts` — a passage cut through the wall box, a leaf mesh, a glow light — and the Pixi `anchor:(1,1)` placement maths is gone. The half-texture and the three states stand.*

**Decided:** M8, #196. The door was the one tile in that issue's scope that is *not*
background — a thing the player walks at on purpose, with states they must tell apart across a
room — so it kept the foreground's hard `#000000` ink while the walls and floors went quiet
(#55's amendment). Three things changed.

**One texture is half a door; the renderer makes the whole.** Before this, `door-closed`/
`door-open` were each drawn *twice* side by side across the 24-unit gap, and the old
concentric-square art tiled that way read as two holes rather than one door. Now each texture
is the **right half** — seam on its left edge, a light stone frame post on its right,
room-facing edge along the bottom — and `render/room.ts`'s `createDoorView` draws it on the
right of the doorway and a horizontally-mirrored copy on the left. The leaf is near-black
(`#1c1a1f`) iron with beveled panel bands and rivets, deliberately darker than any wall it sits
in so a shut door reads against grey concrete and green hedge alike; the light frame post rims
it. `doorHalfPlacements` is the pure function that
positions and orients the two halves; its per-direction `scaleX`/`scaleY`/`rotation` were
derived by hand from Pixi's `anchor:(1,1)` transform and are locked by
`tests/unit/door-layout.test.ts`, because getting a mirror, a quarter-turn and a retract to
share one sprite was the whole of the fiddliness.

**It parts along the doorway's long axis, not its depth.** The old open/close transition
scaled each tile on its depth axis — a north door's tiles got shorter top-to-bottom. Now the
two halves slide *apart* toward opposite walls: a north/south door parts sideways, a west/east
door parts up and down, the way an Isaac door does. That axis is always the sprite's own local
x once its `rotation` is applied, so `render/view.ts`'s `applyDoorSwingScale` only ever touches
`scale.x`, rebuilding it from a stored `retractSign` (the mirror) and `baseScale`.

**`locked` is a third state, and it needed plumbing the sim doesn't have.** A key-locked
treasure room (`metadata.keyLocked`, one room today: `cellar-treasure-locked.json`) used to
show a doorway identical to any free door — you learned it was locked by walking into it.
`GameSim` only knows door *geometry*, not what template sits on the far side, so
`app/main.ts`'s `lockedDoorsFor` (it has the floor plan) computes which of the current room's
doorways lead to an unopened key-locked room and hands them to `GameView.setLockedDoors`;
`doorStateFor` then draws those `locked` instead of `open` once the room's own enemies are
down. `door-locked.png` is a new `common` tile — the closed leaf with a padlock across the
seam. Per `docs/DECISIONS.md` #19 it is optional: a texture set without it falls the `locked`
state back to `closed`, never throws mid-transition.

**Constrains:** floors 3-7 share these three door tiles (they are `common`, not per-floor) and
inherit the half-tile/mirror/rotate model; a floor that wants its own door art authors three
right-half textures to the same contract. `DoorTextures` gained an optional `locked`, and
`doorTexturesFrom` treats a missing `door-locked.png` as fine while still requiring
`open`+`closed`.

## 59. An ordinary room's interior is generated, any shape; the authored pool is the start room, the specials, and sprinkles

**Decided:** #random-rooms. The floor generator (`sim/room/floor-plan.ts`) already builds the
room *graph* — slots, roles, doors, connectivity — procedurally. What was still a hand-authored
pool was every room's *interior*, and most of that pool had become filler: sparse rooms, a big
puddle, three barrels against a wall. `sim/room/generate-room.ts` now fills the interior of an
ordinary `normal` slot of any shape directly, returning a `RoomTemplate`-shaped object that
flows through the unchanged `validateRoomTemplate` / `compileRoomTemplate` path. A multi-cell
room (`1x2`/`2x2`/`L`/`T`) is generated as one continuous tile grid spanning the shape's
bounding box — the seams between glued sub-rooms carry no wall — then sliced back into
per-sub-room `RoomSubLayout`s; `L`/`T` drop their corner cells and those become solid.

**What it generates.** Obstacle cover aimed at a tuned *tile-coverage band* rather than a piece
count (`RoomGenTuning.minCoverTiles`..`maxCoverTiles`, live in the debug tuning window) — a
moderate amount in most rooms, a near-empty or cluttered one only on the `sparseChance` /
`busyChance` rolls, because the challenge is the mob fight, not the walk. A per-floor-tag enemy
roster spent against a threat budget that scales with distance from start. Scenery props
(barrels, crates), and on `hazardChance` one floor-flavour hazard patch (Floor 1 puddle, Floor
2 trellis). Everything is seeded off `roomGenSeed(runSeed, floor, roomId, salt)` — a standalone
`Rng`, drawing from no shared stream — so a seed reproduces its rooms exactly and adding or
reordering generation can never desync loot or enemies. Tuning is not part of a replay, the
same as every other `SimTuning` value.

**Rule 1: never trap the player.** The centre is not special-cased — it can be blocked like
anything else. The player only ever *enters* a generated room through a door, landing in the
never-solid wall-margin ring; a BFS from that ring tile is what `fillUnreachedPockets` uses to
seal any pocket, so the whole walkable area is one region. **Nothing is carved open in front of
a door**: the tile straight ahead of where the player lands may be solid, so a room can meet
them with a wall in their face and a step to take left or right — zero tiles of forward
clearance is an ordinary shape, not a defect, and about one door in ten has it at the
checked-in tuning. `hasBoxedInDoor` hard-rejects only the layout where *all three* interior
tiles at a door (ahead, left, right) are walls at once, since then the door opens onto nothing
but the margin lane. That check has to be pinned to those three tiles rather than to the
neighbours of the landing tile itself: the ring runs unbroken around every cell, so a landing
tile's own left and right are always open and asking about them says nothing. Props are
additionally route-checked (a barrel that would plug a one-tile gap costs the walkable region
more than its own tile, and is rejected); hazards are walk-through. `tests/content/
generated-room.test.ts` re-derives all of this on the *compiled* geometry with the real player
radius.

**What stays authored, and the sprinkle rule.** The **start room** and the boss / treasure /
shop / secret / supersecret rooms are hand-authored. Every *other* authored room — no
`specialRole`, any shape — is automatically a **sprinkle**: `app/main.ts` rolls
`roomGen.authoredRoomChance` per ordinary slot and, on a hit, drops a fitting authored room
(right shape, tag, door superset) in instead of generating, weighted by `metadata.weight`.
There is no opt-in flag — "author a room, it shows up" — because a room a designer bothered to
make is a room they want in the game. The authored ordinary rooms that remain
(`cellar-crossroads`, `cellar-hall`, `cellar-pillars`, plus the multi-cell landmarks) also
serve as the floor generator's `eligibleTemplates` fallback and as fixtures a handful of `sim/`
tests load by name; ~28 filler `1x1` templates that were nothing but a puddle or a barrel were
deleted.

**Constrains:** the generator has enemy rosters for `cellar` and `rural` only — floors 3-7
(#39-#43) need a roster added when their content lands. Per-floor feel is `DEFAULT_ROOM_GEN_TUNING`
(Floor 1) plus `content/floors/definition.ts`'s `ROOM_GEN_FLOOR_OVERRIDES` merged over it. A
generated multi-cell room's whole obstacle budget is one `RoomGeometry` (64 blocks), void cells
included — the coverage band scales by cell count but a busy `T` can still hit the ceiling and
fall back to a lighter layout.

## 60. A floor's in-room obstacle is a set of 2–4 composed rock tiles the room mixes per cell, with no keyline

*`render/room.ts` is gone (#74): the per-cell variant pick lives in `render/world/scenery.ts` via `tiles.ts`'s `pickTileVariant`; a rock is a billboard. The rule stands.*

**Decided:** M8. The obstacle blocks looked like furniture — floor 1's `cellar-plank` read as a
wooden hatch, floor 2's `rural-hedge-block` as a hedge with a blue frame — and a three-cell
wall of them read as three copies of one stamp with a walkable-looking channel between
neighbours. Three things changed, all off one sign-off round (`CLAUDE.md`).

**The hard edge was never in the tile.** `render/room.ts` stroked a 1px `RoomTheme.blockEdge`
rectangle around every obstacle rect — and did it whether or not a tileset was present. On
floor 2 that stroke *is* the "blue border": `blockEdge` is that floor's sky blue. The stroke is
now gone whenever a tileset is present (the flat-colour fallback for floors 3-7 keeps it), the
same way the bare floor/wall outline already yields to the lip course. An authored obstacle's
rounded silhouette is its edge.

**One obstacle is now a variant set, mixed per cell.** `FloorTileset.block: string` became
`blockVariants: readonly string[]` (2–4 entries), and `render/room.ts`'s new `tileRectVariants`
picks one per 16-unit cell off the same `pickTileVariant` hash the "living floor" (#37) uses —
deterministic on `(col, row)`, so a cell always draws the same rock. A pile of rock reads as a
pile; a repeated stamp reads as a mistake. `FloorArt` gained `blockVariantNames` (the obstacle
peer of `tileVariantNames`) so click-to-pick resolves to the exact variant under the cursor;
`pickObstacleBlockAt` (a boolean) became `pickObstacleBlockNameAt`.

**The rocks are composed, not drawn.** `tools/art/authoring/blocks.mjs` + `npm run art:blocks`,
locked byte-for-byte by `tests/art/blocks-authoring.test.ts` — four near-identical boulders per
floor is exactly the drift trap #55/#56 moved Alois and the bosses into source for. Floor 1 is
faceted grey boulders (chunks lit top-left, dark contact band, a translucent cast shadow baked
into the tile); floor 2 is "Lesesteinhaufen" — a packed mound of neutral-grey field stones with
moss in the crevices, the one blocker the rural palette (no grey or brown of its own, but
neutrals are legal everywhere) can carry. Every silhouette reaches within ~2px of all four cell
edges so a clump reads as one solid mass with no walkable gap.

**Constrains:** a floor adding room art now owns a `blockVariants` list, not one `block` name,
and `tests/content/sprite-coverage.test.ts` checks every entry exists. Floors 3-7's flat
`RoomTheme.block`/`blockEdge` fallback is unchanged. The cast shadow is baked as partial-alpha
pixels whose RGB is the legal neutral `#1c1a1f`, so `findOffPalettePixel` still passes.

## 61. Anything the player acts on casts a ground shadow, from one shared function

*Superseded by #74: the shadow map draws every standing sprite's real silhouette shadow through the alpha-tested depth pass; `ground-shadow.ts` and `inked-bounds.ts` are deleted, and scenery casts one too.*

**Decided:** M8. #195 gave the player, ordinary enemies and dropped pickups a soft
`common/characters/actor-shadow.png` blob, reusing the boss shadow's idea (#152), and left "the
other props" for a follow-up. Three problems had accumulated: the follow-up never happened
(destructible barrels, the planted Maibaum and placed Bierfassln cast nothing), the three
renderers that *did* draw one each had their own copy of the maths, and every copy sized and
placed the shadow off the **collider radius** — which since #45 is unrelated to the sprite.
Alois fills a 32px canvas over a 14-unit collider, so `radius * 0.85` put his shadow 2px up his
shins at an alpha faint enough to miss.

**The rule, and where the line is.** A shadow means "this is a thing in the room you deal with":
the player, every enemy and boss, a dropped pickup, a destructible target, a placed Bierfassl,
the planted Maibaum. Pure scenery the player only walks past does **not** get one — a fence
post, a well, a hay bale, bunting, the cellar bulb — because a shadow on all of it turns the
floor into visual noise and stops the shadow *meaning* anything. Also exempt: a shot in flight,
the item floating in a pedestal's beam, the `boss-plate` floor marking, and the obstacle tiles,
which bake their own contact shadow (#60). The first cut of this drew shadows under every
`decorativeProps` prop and was walked back for exactly that reason.

**Match the drawing, not the physics.** The shadow seats under the art's **last opaque row** —
found per sprite by `render/inked-bounds.ts`, which scans the texture's own source image on a
scratch 2D canvas once and caches it — not under the padded canvas edge and not under the
collider (#195's `radius * 0.85` was the collider guess, and it sat 2px up the player's shins
because his 32px canvas is not his 14-unit hitbox). No DOM, no 2D context, or an undecoded
source falls back to the canvas bottom, which is never worse than before. Width is the drawn
width times a footprint fraction — `GROUND_SHADOW.standingFootprint` 0.72, `lyingFootprint` 0.5
for a keg / stein / coin / Brezn that lies flat — capped at `0.6` of a tile, since a padded
canvas is far wider than where the thing actually touches down.

**One implementation.** `render/ground-shadow.ts`: `styleGroundShadow(sprite, texture,
shadowWidth, weight)` and `groundShadowFeetY(centreY, texture, scale)`, tuned by `GROUND_SHADOW`
in `palette.ts` — `bodyAlpha` up to `0.4` from #195's 0.22/0.24. `EntityView`, `PlayerView` and
`MaibaumView` call it. A boss keeps its own wider, flatter texture and `radius * 3` sizing
(bottom-anchored at the collider, #193) — #152 tuned that against the boss sprites and it was
never the thing that was wrong.

**Constrains:** a new renderer that draws something the player acts on is expected to call
`ground-shadow.ts`, not roll its own. The shadow texture is threaded as `textures.actorShadow`
through `GameView`; absent (tests, the bench scene) every shadow is simply skipped, exactly as
before.

## 62. A second, derived palette tier for everything the player does not act on

**Decided:** M8. #196 set the contrast hierarchy (foreground bold, props middling, background
quiet) and #195 brought the decorative props up to the chibi direction — but both stayed on the
**same** per-floor legal palette. So `rural-well` and `rural-fence-post`, which the player walks
straight through, were painted in the same confident hues as `rural-barrel`, which the player
can push and break. Non-interactive scenery read as an obstacle. Colour was doing the wrong
job.

**Two tiers, and the line between them is "does the player act on it".** *Foreground* (the
default): the player, every enemy and boss, projectiles, VFX, pickups, the obstacle
`blockVariants` (#60), the `destructibles` (barrel, Maibaum), doors, the pedestal — anything
shot, collected, pushed, opened or routed around. *Background*: walls, floors, the wall lip,
and every free-standing decorative prop that is art-only (no collision, nothing to destroy).
The foreground palette does not move; the background one is quieter so scenery recedes instead
of implying an interaction it does not have.

**Derived, not authored — per #28.** `BACKGROUND_PALETTES[floorTag]` is `FLOOR_PALETTES[floorTag]`
with each hue pushed `BACKGROUND_TIER.darken` `SHADE_LIGHTNESS_STEP`s darker and
`BACKGROUND_TIER.desaturate` `DESATURATION_STEP`s toward grey (one each), **then clamped under a
hard HSL ceiling** — `maxLightness` 0.4, `maxSaturation` 0.3 (`clampToBackgroundCeiling`). The
nudge alone tames a floor's own muted greys and greens but not a prop's bright accent: a cream
highlight or a sky-blue panel starts so far above the wall that one step still leaves it
flashing against it. The ceiling pulls every derived tone — and the neutrals, which
`backgroundColorsFor` runs through it too, because hit-flash white has no business on a sprite
that never flashes — down to where it reads as scenery; the re-tone migration also collapses a
highlight shade-step whose tone would break the ceiling. A tone already under it (every
wall/floor/lip tone #196 tuned) is untouched. No second table to keep in sync, and the
~40-colour cap in `docs/CONTENT_BIBLE.md` §5 is untouched because these are pure functions of
hues already counted. `legalPixelColorsFor` and `nudgeShade` gained a `tier` argument
(defaulting to `'foreground'`, so every prior caller is unchanged); `pickableColorsFor(bucket,
tier)` is the swatch set, with `allowedColorsFor` staying the foreground one verbatim.

**The `common` bucket derives from every floor hue.** `crate-*`, `shopkeeper-stand` and
`boss-plate` are shared scenery with no per-floor mood to derive from, so their background tier
is every hue in `FLOOR_PALETTES` run through the same `toBackgroundHue` — symmetric with
foreground `common`, which may already draw the whole `MASTER_PALETTE`. A crate's wood still
needs somewhere to shade to; a single fixed neutral flattened it.

**Classification is a manifest, not a naming convention.** `tools/art/tiers.mjs`'s
`BACKGROUND_SPRITE_NAMES` is the explicit list, the same call `FLOOR_TILESETS` and
`PROP_TILE_NAMES` are — inferring "background" from a `-wall` suffix would make a rename a
silent behaviour change. Foreground is the default for every non-`tile` category;
`tests/content/sprite-coverage.test.ts` requires every `tile` on disk to be in
`BACKGROUND_SPRITE_NAMES` or `FOREGROUND_TILE_NAMES` and fails a pull request on one that is in
neither, so adding a tile forces a tier decision.

**Constrains:** `tools/art/build.mjs` checks each sprite's off-palette pixels against its own
tier. The pixel editor's swatch panel and a fresh sprite's default colour come from the tier of
the sprite being edited (a `tier` select in the New controls, set from `spriteTier` on Load),
so #25's "there is no off-palette pixel to lint for" holds for both tiers. `contrast.mjs`'s
projectile-legibility gate now scores shots against the *background-tier* wall/floor tones,
since that is what a shot actually flies over. Floors 3-7 (#39-#43) inherit the tier for free:
`BACKGROUND_PALETTES` already covers every floor tag, so their content landing only adds tile
names to the manifest. Making a decorative prop *solid* is a separate question (its own issue) —
this decision is about not *implying* a collision that is not there.

## 63. The Stammtisch hub is retired; a plain results screen carries the same unlocks

**Decided:** M7 follow-up to #51. #51 built the hub between runs as a tavern table: four
regulars, each arriving on a boss kill or a stat total, each with a name, a role, a greeting and
several lines of dialogue conditioned on the last run. Playing it rather than just building it
showed the framing was not paying for itself: with no portraits yet (pixel art needs its own
sign-off, per `CLAUDE.md`), a "regular" was a name plate and a paragraph of text indistinguishable
from the leaderboard rows next to it. Four chairs, a speech panel, a run-start roster and a seed
panel crammed into one 640×360 screen read as a dense, undifferentiated dump of text rather than a
hub with personality — the opposite of what the chairs-not-a-progress-bar argument in #51 was
for.

**The fix is subtraction, not a redesign.** `src/render/run-results.ts`'s `RunResultsScreen`
replaces `StammtischScreen` outright: the last run's line, a plain list of unlocks (locked ones
show their goal and progress, unlocked ones show what they do), and the run board. No regulars,
no seats, no greeting/arrival state, no dialogue conditioned on the last run, no cursor to move
across a table. `app/meta/definition.ts`'s `RegularDefinition`/`RegularLine`/`LineCondition` are
gone along with `progress.ts`'s `pickLine`/`fillTokens`/`withGreetings`, and
`src/content/stammtisch/regulars.ts` is deleted rather than kept unused — there is no reduced
version of "a regular's line" that this screen still needs.

**Two unlocks remain, and two are cut outright.** `promille` (beat Der Stier — the game's
signature mechanic) and the run board (`run-board`, formerly `stammtisch-tafel`, 200 kills) are
real, load-bearing gates and stay. `lore-opas-zettl` (Da Sepp's flavour text) and
`stammtisch-zufoi` (Da Toni's seed-reveal) existed only to be delivered by a regular's dialogue
that no longer exists, and neither had anything else to attach to, so both are deleted rather than
re-homed. `UnlockCategory` drops `'lore'` for the same reason.

**Character select, seed entry, the daily run and replay-watching move to a real main menu —
M8's "title screen, pause and settings" — rather than living on this screen, and are simply
unreachable in-game until that milestone.** Concretely: the `F` (cycle character), `E`/`R`/`D`
(seed entry/reroll/daily) and `V` (watch latest replay) keys are gone with the panel that hosted
them; `pendingIsDaily`/`activeRunIsDaily` and the daily-run-outcome commit in `app/main.ts` go
with them, since nothing can set them true any more (`ReplayRecord.kind` is hardcoded `'normal'`
until a trigger exists again). `dailyRunHistory`/`recordDailyRunOutcome`/`dailyStatus` and the
character roster/selection functions in `app/meta/` are untouched — real, tested systems a menu
will call again — only their one call site in `main.ts` is gone. `C` (copy run details), `L`
(import a replay file) and `X` (export the latest stored replay) stay **global** keys rather than
moving with the rest: they are `CONTRIBUTING.md`'s bug-report tooling, not hub features, and never
belonged to the Stammtisch's presentation in the first place.

**`SaveDataV5` drops `greetedRegulars`.** Nothing reads it any more, and there is nothing to
back-fill in its place — `migrations.ts`'s `v4ToV5` only bumps the version, the same as `v0ToV1`.
The results screen still opens itself the moment a run ends having earned something new, but the
signal is now `app/main.ts` comparing the save's unlocked ids at the start of the run against the
ids after it — no per-item seen/unseen state is needed once the screen has no dialogue to only
say once.

## 64. Der Losbrunnen: a chance-spawned boss-room machine that rerolls an item as an additive stat source, fed and browsed on `use` alone

**Decided:** M7 (unmilestoned; #218's own body). **Issue:** #218, an explicitly rough design —
"argue with, not a spec to implement" — plus a follow-up comment from the issue's own author
settling several of its open questions (increasing cost, a break chance, spawning in the boss
room rather than a dedicated one, one machine per chosen item) that this entry treats as
authoritative over the issue body's own looser framing.

**What "reroll a trait" means, given the architecture:** #26/#15 already made an item's
`modifyStats` a *pure function of `ItemRuntimeState`*, shared by every copy of that id — there is
no per-copy instance to mutate, so "reroll this item's traits" cannot mean giving one held copy a
different number than another the way a naive reading of #218 might suggest. Instead a roll
registers a delta `ItemStatModifier[]` under its own stat-pipeline source key,
`itemRollSourceKey(id)` = `item-roll:<id>` (`sim/item/roll.ts`), which composes on top of the
item's own `item:<id>` source (#14) rather than replacing or mutating it — the authored definition
is never touched, so a second roll (or losing and re-picking-up the item, which clears the roll
source in `GameSim.removeItem`) always starts from the same honest baseline. A roll's magnitude is
a random one of the item's current `modifyStats` entries, nudged by a tuned percent
(`MachineTuning`'s `*RollPercent` fields) in the tier's direction — `multiply` nudges its factor by
`1 ± percent`, `add` nudges by `± percent` of its own magnitude, so the delta's shape always
matches what it is layered onto. Eligibility (`itemEligibleForMachine`) is "does `modifyStats`
return anything right now" — an item whose bonus is itself state-gated (Enzian's burst-only fire
rate multiplier, say) is honestly, if narrowly, ineligible outside that window rather than the
machine inventing something to roll for it; accepted as a real scope boundary, not engineered
around.

**Legendary is authored data with a graceful fallback, per decision #19's shape.** `ItemDefinition`
gains an optional `legendaryRoll?: readonly ItemStatModifier[]` — hand-tuned, replaces the roll
source outright rather than nudging a percent, the "distinct, strictly-better named variant" #218
asks for without inventing a second `ItemDefinition` the roll would have to swap the held item for.
Authored for four items so far (`kraftbier`, `braumeister-schuerze`, `bierbauch`, `halbe-portion`)
as proof it is real content, not just schema; every other item's `legendary` roll falls back to the
`rare` tier's generic magnitude, exactly `nearestFloorChoice`'s "closest authored alternative,
never a crash" precedent, just for a content gap in roll tables instead of spawn groups. The
follow-up comment's other rarity idea — a rare/legendary roll changing an item's *kind* of effect
(fire → poison → freeze) rather than a number — is out of scope for this pass: it would need
per-item authored alternate hook sets, a real design of its own the comment itself only sketches.

**Placement rides the boss room's existing reward, rather than becoming a new special room or new
content-authoring surface.** The follow-up comment asks for exactly this ("not its own room on the
floor"). `floorHasLosbrunnen` is rolled once per floor, in the same guarded block
`rollFloorCurse()`/`dispatchItemFloorStart` already share (`floor !== lastFloorStartDispatched`),
from `random.items` — the stream's own doc comment already covers "loot rolls," so no new RNG
stream was needed. If true, and the room compiling next is the boss room, its machine position is
computed off the *same* authored `pedestal` `decorativeProps` entry every boss room already has for
its reward (`LOSBRUNNEN_OFFSET_X/Y`, nudged through `safeSpawnPoint` the same as the pedestal
itself) — no room JSON needed a new prop type. It waits for the boss to actually die exactly like
`pendingBossPedestals` already does (`pendingBossLosbrunnen`, flushed in the same room-clear tick),
and persists across a room revisit through the same `RoomLootSnapshot` a pedestal's own state
already rides (`RoomLootSnapshot.machine`).

**Bomb was tried for cycling, then rejected — the machine is `use`-only.** An earlier pass gave the
Bomb button the item-picker's cycle step, on the theory that the machine only ever sits in an
already-cleared boss room so nothing was fighting the player there to place a bomb at anyway. User
review during the same session rejected it directly: a player even slightly off their intended
target while trying to place a Bierfassl near the machine could destroy it by accident, and that is
not the machine's real risk — a bad *roll* is. The picker is `use`-only instead
(`GameSim.useMachine`): a fresh machine's first press opens it, a move-axis *tap* (edge-detected
against `machineCyclePreviousSign`, the axis equivalent of `previousButtons`) cycles the preview
while it's open — no new `InputAction`, no rebind-menu entry, since `move` is otherwise idle in a
cleared room — and a second `use` press confirms and feeds; an already-fed, unbroken machine's
`use` goes straight to a reroll, since there is nothing left to choose. Bomb keeps its ordinary job,
and gets a *deliberate* new one instead of an accidental one: `GameSim.breakMachineFromBlast`, wired
into `sim/systems/bombs.ts`'s `explode` right where `dispatchItemBombDetonate` already fires, breaks
the current floor's Losbrunnen outright if a detonation lands within the blast's own radius — "should
be possible, yes" from the same review, and now the *only* way to destroy the machine rather than
merely risk a bad roll on it.

**Rendering is a placeholder, on purpose.** `render/machine-view.ts` reuses `PedestalView`'s own
already-loaded beam/plinth textures, tinted with two new `ENTITY_PALETTE` entries
(`machineTint`/`machineBrokenTint`) rather than new pixel art — `CLAUDE.md`'s sign-off pass ("show
a small set of design options... let the user pick before the art lands in a commit") applies to a
Losbrunnen sprite exactly as much as any other new tile, and was not run this pass. A dedicated
sprite is real follow-up work, not a gap this decision papers over.

**Constrains:** a future item whose bonus should be excluded from Losbrunnen rolls entirely (an
active item's activation cost, say) has no opt-out field yet — everything with a live
`modifyStats` result is eligible. The picker's "browse with move, confirm with use" idiom is the
first of its kind in the game and is the shape to reach for if another narrow, no-combat menu ever
needs input without a new binding; it is not a general pause-menu/inventory-browsing input model on
its own.

## 65. Enemy pressure comes primarily from shots, not contact — a charge or a seek is the exception

**Decided:** M8, from #229's own playtest. The issue's speed pass first tried to fix "nothing in
this game asks anything of a retreating player" by giving Bierratte a body that outran the
player: `walkTowardPlayer` at a speed above `DEFAULT_MOVEMENT_TUNING.maxSpeed`, triggered silently
the instant the player got close. It did exactly what it was told to and played terribly —
nothing telegraphed it, nothing about it could be dodged once it started, and the player's one
existing tool against pressure (a straight retreat) had just been taken away with nothing put in
its place. It read as the game cheating, not as a threat, and had to be redesigned rather than
just re-tuned.

**The rule.** An enemy's actual damage output — the thing a player has to dodge, not merely avoid
standing next to — should come from a shot, not from a body. A shot can be telegraphed, aimed,
led and dodged in the open; contact damage from a body closing distance can only be avoided by
not being there, which for a body faster than the player isn't a real choice at all. Bierratte's
fix (#229) is the template every future pursuing enemy should read against: `scurry` (harmless
wander) → `telegraph` (the shared red ring every wind-up in the game already uses) → one aimed
shot faster than the player → a short `dash` that closes the last stretch for contact damage if
the player didn't move. The shot is the threat; the dash is only what happens if it was ignored.

**What this doesn't ban.** A charge (Kuh, Bauer's lunge, Der Stier) is fine, and so is a body
whose whole point is being bumped into (a basic Kellerassel, Traktor) — both stay useful. A charge
is a telegraphed, punishable commitment, not a silent stat check, and a slow contact-only body is
exactly the "thing you walk past while something else is pressuring you" #229's own writeup wants
a floor to have. What doesn't work is a body's *speed alone*, with no telegraph and no ranged
component, being what makes a room hard — that is what Bierratte's first draft did, and why it
needed replacing rather than tuning down.

**Constrains:** designing a new pursuing or aggressive enemy — reach for a telegraphed shot as the
primary threat first; a charge or a contact-seeking body is the secondary or occasional tool, not
the default source of pressure. `docs/CONTENT_BIBLE.md` §2 states the practical version of this
rule for whoever authors the next roster entry.

## 66. A boss's health pool is tuned against its own authored cycle, measured with a real sim

**Decided:** M8, #232. Die Große Kellerassel (18 health) and Der Stier (24, Maibaum-Dieb 18) were
priced like ordinary enemies rather than like the multi-state set pieces they were written as: at
a floor-of-the-run 3-6 DPS, both died in one or two laps of their own authored loop — Der Stier's
`approach → telegraph → charge → stunned` (~131 ticks) or the Kellerassel's `crawl → curl →
advance → wind → spit` (~194 ticks). Phase two (the Kellerassel's split, the dieb) then arrived
as noise a few seconds in rather than a moment the player had earned.

**The rule.** A boss's health is tuned, not computed — "tune it, do not compute it" is #232's own
instruction — but the target is checkable: the authored loop should run at least four times in a
fight against a realistic mid-run player before the boss dies or phase-shifts. `tests/content/
boss-pacing.test.ts` is that check, run against a real `GameSim` rather than by hand: a boss alone
in a room, a player who only aims and fires, at both the 3 DPS a run starts at and the 6 DPS one
Bierkrug buys, counting how many times the loop's own attack state (`spit`, `charge`) is actually
entered. Der Stier is 80 now (was 24), the Maibaum-Dieb 60 (was 18, same 0.75 ratio), Die Große
Kellerassel 180 (was 18) with its half-health split threshold unchanged so the fight's total
budget is still split evenly between phases (90 before the split, three 30-health segments after
— the original 9/3-each split, just scaled).

**Contact damage is not the lever.** Both bosses' `contactDamage` came down too (Der Stier and the
Maibaum-Dieb from 3 to 1, the Kellerassel from 2 to 1) — `docs/DECISIONS.md` #65's "pressure from
a shot, not a body" applies to a charge as much as an idle touch, since `sim/systems/contact.ts`
reads one flat `contactDamage` field for both. At the old numbers two contacts could remove all or
most of a 6-health player's bar; length (the health pool above) is the intended difficulty lever
now, so contact stays a tax for standing still, not a second clock on the fight.

**Constrains:** a future boss's health and contact damage should be checked the same way — measure
the authored loop's own cycle count against a `GameSim`, at the DPS band a run's own item pool
actually produces, rather than picking a number and trusting the total feels right. `contactDamage`
on a boss-sized body is capped by "two contacts, half health," not raised to compensate for a short
fight.

## 67. The screen-flow is four states, "hub" is the title screen, and strings stay hardcoded until #52

**Decided:** M8, #158. Three things worth writing down before the next screen or the localisation
layer builds on top of this.

**`ScreenFlow` (`app/screen-flow.ts`) is deliberately narrow: `'title' | 'run' | 'paused' |
'credits'`.** A run's own ending — the freeze/slowmo beat, the game-over or victory screen, the
results screen behind or after it — stays inside `'run'`, tracked by `main.ts`'s existing
`deathPhase`, rather than becoming more top-level states. Splitting them out would have made the
state machine "more correct" on paper and bought nothing: those screens are the run *finishing*,
not a different place a player has gone, and every one of them already had to work while `replay`
and `runResults` — two more existing, independent flags — were also live. The four `ScreenFlow`
states are exactly the transitions that were genuinely missing (nothing owned "is the title up",
"is the game paused", "are we reading credits" before this issue); everything downstream of a run
starting keeps the flags it already had.

**"Retry or hub" (the issue's own words) is Retry-or-Title.** `docs/DECISIONS.md` #63 named "a
real main menu" as where character select, seed entry, the daily run and replay-watching would
eventually move — this issue is that menu, but its own scope list is only Start/Continue/Settings/
Credits/Quit. There is still no separate hub *room* the way Isaac's basement is one, and building
one was not this issue's job: "Hub" on the game-over/victory/pause screens goes to the title
screen, which is the only screen a finished or paused run has to go back to today.
`app/main.ts`'s `quitToTitle` is one function for both the pause menu's "Quit to Title" and the
end screens' "Hub", because which of the two called it is exactly `screenFlow.current` at the
moment it runs: `'paused'` still has a live, resumable run; a finished run's `activeRun` save was
already cleared by `advanceDeathSequence` before its own screen ever showed. Character select,
seed entry, the daily run and replay-watching remain unreachable in-game, same as #63 left them —
still real, tested code in `app/meta/`, just not wired to a button, and still a follow-up rather
than scope creep onto this one.

**Every string this issue introduced is plain, hardcoded English.** #52 (the localisation layer:
three locales, the "no hardcoded strings" lint rule, the missing-key build check) does not exist
yet — it is still open. Building a real localisation layer as a side effect of the title-screen
issue would have been scope creep in the other direction, and satisfying a lint rule that has not
been written yet is not a thing that can be done honestly. What *is* done: every string this issue
added is short, English, and lives in exactly one place per screen (`title-screen.ts`,
`pause-screen.ts`, `credits-screen.ts`, the `Menu` item labels on `GameOverScreen`/
`VictoryScreen`/`RunResultsScreen`) rather than scattered inline — so that #52's own pass is a
mechanical extraction into a key/locale table, not an archaeology dig through this issue's diff.

**Constrains:** the next screen that needs player-facing text should keep doing this — one string
literal per label, not composed at multiple call sites — until #52 lands and gives it somewhere to
move to. The next screen that needs a *new* top-level state (a shop, a character-select screen)
extends `Screen` in `screen-flow.ts` rather than adding another boolean to `main.ts`; a state that
is really a sub-beat of an existing screen (the way game-over/victory/results are all `'run'`)
should stay a flag inside that screen's own handling instead.

## 68. Der Losbrunnen gets a second home in the shop, a near-certain spawn, and a break risk the player can see coming

**Decided:** M8, #238, a tuning-and-placement follow-up on #218/`docs/DECISIONS.md` #64. A
two-floor run only ever saw the Losbrunnen a quarter of the time (`spawnChance: 0.5`, rolled once
per floor), and the one machine that did appear sat in an already-cleared boss room — a spot with
no combat left to spend a build on and no guarantee the player still had Biermarken after the
fight. #238's acceptance bar was explicit: a two-floor run should reliably contain one, reachable
at a moment the player has both money and a reason to care, with a break chance that is a risk
taken knowingly rather than a surprise.

**`spawnChance` moved from 0.5 to 0.85, the cheapest lever and the issue's own "minimum."** At two
floors that is a >97% chance of at least one Losbrunnen in the run (missing on *both* floors is
now `0.15²`), while still leaving room for the rare floor that gets none — a coin flip becoming a
near-certainty, not a guarantee, which keeps `random.items.chance` doing real work.

**The shop is now the machine's second home, exactly as the issue proposed — "not its own room on
the floor," the same instruction #64 already had to satisfy for the original boss-room placement.**
A new `losbrunnen` `decorativeProps` type (a free-form `string` already, per
`RoomDecorativeProp.type` — no schema change needed) is authored into both floor-1 shop templates
(`cellar-shop.json`, `cellar-shop-vorrat.json`), offset clear of the shop's own goods. Unlike the
boss room's reward, a shop's stock is never held back for a fight, so a `losbrunnen` prop spawns
`machineRuntime` the instant the shop loads — no `pendingBossLosbrunnen`-style hold-until-clear
needed there. `GameSim.losbrunnenClaimedThisFloor`, a new floor-scoped flag alongside
`floorHasLosbrunnen`, is what keeps the invariant "at most one machine per floor" true now that two
kinds of room can host it: whichever of a floor's shop or boss room the player actually reaches
first claims it (setting the flag), and the other room's own spawn branch checks the flag before
doing anything. This is genuinely order-independent — a shop visited before the boss room gets it,
a boss room reached first (or a floor with no shop at all, same as every floor 2+ template today)
falls back to exactly #64's original behaviour, and nothing needed to know the floor's layout in
advance to arrange that.

**`breakChance` is now visible and escalating instead of a flat, hidden 15% forever.** A new
`MachineTuning.breakChanceIncrement` (0.05 default) is added to `breakChance` for every roll
already made (`GameSim.machineBreakChance`, read with the same "count of rolls so far" the cost
formula already uses, i.e. before `rolls` increments) — the number climbs the more a player pushes
their luck. `machinePreview` gained a `breakChance` field, surfaced in `machineHudLabel`'s cost
clause on every state that is actually offering a roll (`Losbrunnen — feed Kraftbier? 1
Biermarken, 15% to break`), so the player always sees the price of the pull they are about to make.
The issue's other framing of this same idea — "make the break a visible escalating risk the player
is choosing to take... more in keeping with pillar 3 ['the player should be able to talk themselves
into a bad decision'] than a flat hidden roll" — is what this reads as directly: nothing is
concealed, and pulling again is a legible bet each time.

**Not done this pass:** the issue's own follow-up comment (a real pause-and-choose menu, mixing the
Diablo reroll dialog with Vampire Survivors' reward screen, both passive and active items
rerollable) is a materially bigger UI surface than this pass's tuning-and-placement scope and is
left as real follow-up work, not a gap this decision papers over — the existing "browse with move,
confirm with use" idiom (#64) is unchanged. Rerolling before the boss fight rather than after was
the issue's most speculative option ("consider whether") and is superseded by the shop placement
above, which reaches the same "a machine met while still thinking about the build" goal without
needing the boss room's reward-pedestal anchor to move.

## 69. Der Losbrunnen's picker becomes a real card menu, and active items can reroll too

**Decided:** M8, #238's own follow-up comment from the issue's author, implemented in the same
pass as #68: "the machine use should open a real menu where the user can choose the item... like
the reroll machine in Diablo, maybe a little mixed with the reward dialog in Vampire Survivors...
Also we want passive AND active items to be able to reroll."

**The picker is now a real screen, built entirely from the existing `UiKit` — no new pixel art, no
new input binding.** `render/machine-picker.ts`'s `MachinePickerScreen` replaces the old
single-line `machinePrompt` text for the two states that actually offer a roll: `'unfed'` with its
picker open (choosing which item to feed) and `'fed'` (confirming a reroll). Both draw through the
same shape — a row of `kit.buttonSprite` cards (`'selected'` state doing double duty as "this is
the one you'd feed"), a `FocusRing` tracking the current one, the selected card's full description
on its own wide line below (cards hold only a name; German item descriptions run long —
Böllerschmeißer's is a full sentence — and wrapping that inside a small fixed-height card risked
overflow), and a cost/break-chance/hint line under that. `'empty'`/`'broken'`/a fresh `'unfed'`
machine before its first `use` keep the old plain `machinePrompt` line — there is nothing to choose
in any of those, so a full-screen card menu would be theatre over an invitation or an apology.
Input is unchanged from #64: `use` opens it, a move-axis tap cycles the selection
(`cycleMachinePreviewFromAxis`), `use` again confirms — the screen only turns
`GameSim.machineChoices`/`machinePreview` into pixels every frame, the same "screen reads state,
`main.ts` owns the words and the input" split every other HUD piece here already keeps.

**"Game will pause during this" is honoured as a presentation guarantee, not a `loop.paused` engine
freeze.** `RunResultsScreen` hard-pauses because it opens *between* runs; the Losbrunnen's picker
opens *mid-run, mid-replay*, and a replay is a recorded `InputFrame` per tick — stopping
`sim.step()` outright would mean any menu interaction has to happen through a side channel outside
that log, which a replay has no way to reproduce. So ticks keep flowing while the picker is open,
exactly as #64's original text-prompt version already did; what changed is only the presentation,
via a large dimmed modal that reads as "the world stopped for this" without the sim actually
stopping. This is provably safe rather than merely convenient: `stepPedestal`'s priority chain
(`docs/DECISIONS.md`'s own #64 entry) is the only thing standing between a boss room's cleared
enemies and its reward, and a shop's own enemy — `content/enemies/shopkeeper.ts`'s `Wirt` — has
`contactDamage: 0` and starts `peaceful`, only ever firing back if the player shot it first. Every
room the machine can appear in is threat-free at the moment it is interactable, so a functional
freeze buys nothing a shallow one does not already give the player, and the alternative (gating
large parts of `GameSim.step`'s carefully, comment-explained ordering behind a new conditional) was
a real risk for zero real benefit. If a future room ever puts the machine somewhere genuinely
unsafe, the freeze that would actually need adding is a narrow one — skip `stepEnemies` specifically
while the picker is open — not `loop.paused`.

**Active items reroll through a new `cooldown` target, parallel to a stat's `modifyStats` entry.**
`sim/item/roll.ts` gains `MachineRollTarget` (`{ kind: 'stat', modifier }` or `{ kind: 'cooldown' }`)
and `machineRollTargets`, which `itemEligibleForMachine` is now defined in terms of: a `modifyStats`
entry per current output, plus one more `cooldown` target whenever `item.active !== undefined` —
offered unconditionally, unlike a state-gated `modifyStats` entry, since a cooldown is always a real
number to nudge regardless of current charge. `rollItemStatModifiers` picks uniformly among
whatever is on offer (a hybrid item like Enzian can have both); a `cooldown` hit nudges
`ActiveItemDefinition.maxCharge` by the tier's usual percent, *shrinking* it on a favourable roll —
a shorter cooldown being the active-item equivalent of a bigger stat. The result is stored in
`GameSim`'s new `activeItemCooldownFactor` map (item id → factor), read through a new
`effectiveMaxCharge(item)` method everywhere `active.maxCharge` used to be read directly
(`chargeActiveItem`, `useActiveItem`, `ActiveItemHud`'s bar fill) — the same "replaces, never
composes with, the previous roll" promise `itemRollSourceKey`'s stat source already keeps, and
cleared on `removeItem`'s last-copy-loss branch for the same "exactly the prior state" reason.
`maxCharge` was the only choice available without inventing new authored data: an active item's
other numbers (a Böllerschmeißer's fuse length, a Kirchturmuhr's freeze radius) are plain
module-level constants closed over by its hook functions, invisible to anything outside the closure
— `active.maxCharge` is the one active-item number that already lives on the definition itself.

**Constrains:** an item whose cooldown is rerolled and who then loses its `active` field would have
nowhere for the stored factor to mean anything — not reachable today (no item's shape changes at
runtime) but worth knowing if that ever becomes possible. A future item wanting a *different*
numeric trait reroll-able (fuse length, blast radius) would need that trait promoted from a hook
closure's local constant onto `ActiveItemDefinition` first, the same way `maxCharge` already is.

## 70. Playtest telemetry has no server — opt-in, anonymous, and file-based end to end

**Decided:** M8, #54 and #159. #54 asks for "opt-in, anonymous telemetry" and "a dashboard over the
collected data." The obvious shape — a backend endpoint the client posts to, a database, a web
dashboard reading it — is exactly what `docs/TECH_STACK.md`'s own scope (a static site on GitHub
Pages, no server, no account system) rules out, and standing one up for two floors' worth of
balance data would be infrastructure this project would then own indefinitely. Kellerbier already
has a working answer to "how does data leave a player's machine on their own terms": `CONTRIBUTING.md`'s
bug-report flow, where `C` copies run details and `X` downloads a replay `.json` a player attaches
by hand. Telemetry reuses that shape rather than inventing a second one.

**The rule.** `app/telemetry/schema.ts`'s `TelemetryStore` lives in the unified save (#45, v7),
opted out by default, exactly like every other privacy-affecting default in this project
(`AccessibilitySettings`'s own "defaults are the full experience" precedent). Opting in
(`app/telemetry/store.ts#optIntoTelemetry`) mints a `crypto.randomUUID()` session id — the same
mechanism `replay/store.ts` already uses for a replay's own id — and nothing more: no device
fingerprint, no account, no IP, collected client-side or otherwise. What gets recorded is exactly
#54's own list (run outcome, deaths by floor and best-effort cause, item pickups, room clear times,
Promille tier ticks) and nothing else, buffered locally and capped (`MAX_TELEMETRY_RUNS`, the same
"keep a handful, drop the rest" shape `MAX_REPLAYS`/`MAX_BEST_RUNS` already use). A player exports
it as a `.json` file whenever they choose (`app/telemetry/file.ts#downloadTelemetryFile`, the
Settings → Privacy tab); nothing is ever sent anywhere automatically. "The dashboard" is
`tools/telemetry/dashboard.mjs`: a Node script that reads whatever export files it is handed and
prints the aggregate — the same relationship `tools/playtest/report.mjs` already has to the balance
simulator's own `results.json`, applied to real play instead of a scripted sweep.

**The session identifier is for #159, not for attribution.** A structured playtest session
(`docs/PLAYTEST_PROTOCOL.md`) needs a way to tell one tester's data apart from another's without
naming either of them — the id, read off the Settings → Privacy tab (and included in `C`'s "copy
run details" text, `run-summary.ts`), is that and nothing more. A fresh id is minted on every
opt-in rather than being reused, so opting out and back in later reads as a new session rather than
quietly resuming an old one.

**Constrains:** any future telemetry field has to answer #54's own question ("does this help tune
the two-floor curve") before it is added — this is not a general analytics pipe. If a real backend
is ever justified (post-#159, once a playtest cadence is actually running and file-shuffling
becomes the bottleneck), that is a new decision to make deliberately, not a default this one
quietly grows into.

## 71. The local diffusion pipeline lives outside the repo; generation is scripted, not just manual

**Decided:** tooling/workflow (#258), not tied to a milestone.

ComfyUI plus a Stable Diffusion 1.5 checkpoint and a pixel-art LoRA is several gigabytes of model
weights — nothing about them is source, so none of it goes in `kellerbier`'s git tree. ComfyUI is
installed at `D:\repos\ComfyUI`, a sibling of this repo rather than a subdirectory of it: same
parent folder, own `.git` (upstream ComfyUI's, not ours), own venv, own `models/` directory for
the checkpoint and LoRA. Nothing under that path is ever committed here. The repo's own half of
#258 is `tools/art/diffusion-postprocess.mjs` (box-filter downscale, then palette-snap onto
`palette.mjs`'s existing `FLOOR_PALETTES`/`MASTER_PALETTE`) plus its CLI — that part *is* source,
because it is deterministic and has no business living next to a GPU-bound model server.

**Remote API, not manual-only.** The issue's open question was whether this has to be a human
sitting at the home machine's ComfyUI web UI for every generation, or whether it can be driven
programmatically (Claude, or a script, calling the local server's HTTP API). This session answered
it empirically: `POST http://127.0.0.1:8188/prompt` with a workflow graph (`CheckpointLoaderSimple`
→ `LoraLoader` → `CLIPTextEncode` ×2 → `KSampler` → `VAEDecode` → `SaveImage`), then polling
`GET /history/<prompt_id>`, took one raw text prompt to a finished PNG in about 18 seconds with no
human clicking anything. The manual web UI stays available for interactive iteration — picking a
seed by eye, nudging LoRA strength, browsing intermediate previews — but it is a fallback for that
kind of exploration, not the only way in. Anything that just needs "n candidates for this prompt"
can go through the HTTP API directly.

**The model choices, for whoever revisits this GPU:** the checkpoint is the
`stable-diffusion-v1-5/stable-diffusion-v1-5` mirror on Hugging Face (the original `runwayml` repo
is gone); the LoRA is `artificialguybr/pixelartredmond-1-5v-pixel-art-loras-for-sd-1-5` — an SD1.5
LoRA, not the far more commonly-linked SDXL "PixelArtRedmond," which will silently produce garbage
if loaded against this checkpoint. Trigger phrase is `Pixel Art, PixArFK` in the positive prompt.

**Constrains, and the gotcha that cost the most time getting here:** on a 20-series-or-newer Nvidia
GPU (this machine's RTX 2070 Super included), ComfyUI's own README already warns the `cu126`
portable build is for 10-series-and-older cards only — but the deeper trap is one level down:
`comfy-kitchen` (ComfyUI's fused-kernel package, pinned by its `requirements.txt`) registers a
custom op with a `list[int]` parameter, which `torch.library.infer_schema` only started accepting
in a torch release newer than the `2.6.0+cu124` that `pip install torch --index-url .../whl/cu124`
still resolves to. The fix was installing torch from the `cu130` index instead
(`pip install --upgrade torch torchvision torchaudio --extra-index-url
https://download.pytorch.org/whl/cu130`, landing on `2.14.0+cu130`) — a plain "follow ComfyUI's
own install docs for a 20-series GPU" outcome in hindsight, but the failure mode (an import
traceback deep in `comfy_kitchen`'s CUDA backend, not an obvious "wrong torch version" message)
is not self-explanatory. Anyone reinstalling this pipeline from scratch should start from the
`cu130` index directly rather than the more commonly-linked `cu124` one.

## 72. Der Losbrunnen's picker gets a real rolling-then-choosing beat, a two-pane layout, and actually freezes the player

**Decided:** M10 (unmilestoned follow-up), the UX redesign #69 itself flagged as parked: "a
materially bigger UI surface than \[#68's] tuning-and-placement scope... left as real follow-up
work." Driven by a conversational spec rather than a numbered issue: pause properly, split the
window in two (left: which item; right: what the roll produced), animate the roll for
anticipation, collapse to a single flagged result on a bad pull, and close the whole dialog outright
on a machine break rather than showing anything.

**The picker is now a phase machine, not a single confirm-and-apply button press.**
`GameSim.useMachine` no longer resolves a roll synchronously the instant it's paid for.
A new `MachineRollPhase` (`sim/game/sim.ts`) tracks `'idle'` (nothing rolling — item-select or an
idly-fed machine both read this way, exactly as `machinePickerOpenValue` alone used to), `'rolling'`
(`MachineTuning.rollAnimationTicks`, default 36 — a pure presentation delay), and `'choosing'` (a
results board waiting for a confirm press). `GameSim.advanceMachineRoll`, called every tick by
`sim/systems/machine.ts`'s `stepMachine` exactly the way the axis-cycle read already was, ticks the
countdown down and resolves the outcome — deterministically, off the tick counter alone — the
instant it reaches zero, so a replay reproduces the exact same roll regardless of the animation's
length or the machine's actual frame rate.

**Break pre-empts the results board outright, per this session's own explicit answer to "when
should break happen."** `GameSim.resolveMachineRoll` rolls `machineBreakChance` *first*: if it
hits, the machine is marked broken, `machineRollPhase` goes straight back to `'idle'` with no
candidate ever generated, and the picker screen closes on the very next frame (`machinePreview.state`
reads `'broken'`, which `app/main.ts`'s existing show/hide branch already treats as "nothing to
show"). This is a deliberate behaviour change from #69/#238's original `applyMachineRoll`, which
rolled the stat modifier unconditionally and treated a break as a side effect *after* that roll
still landed — here, a broken roll changes nothing about the item at all. Surviving the break
gamble is what unlocks `sim/item/roll.ts`'s new `rollMachineOutcome`: one draw against the full
tier weights decides whether this pull is the bad-luck one at all (a lone `unlucky` candidate, per
this session's chosen "separate pull type" framing rather than drawing three and collapsing them),
and only when it isn't does it draw two more tiers from `common`/`uncommon`/`rare`/`legendary`
(`selectFavourableMachineRollTier`, `unlucky` excluded from the pool entirely rather than
drawn-and-discarded) to fill out a three-option board. The player then browses with `move` and
confirms with `use` — `GameSim.confirmMachineRollChoice` — the exact same idiom #69 established for
item-select, now reused for "which result" instead of "which item."

**The player actually stops moving now — a narrow input freeze, not `loop.paused`.** #69's own
entry explains at length why a hard engine pause was rejected: the picker opens mid-run, mid-replay,
and `useMachine` is only ever reachable through a tick's own recorded input, so freezing the whole
sim would also freeze the one channel the dialog needs to hear a confirm press. That reasoning is
unchanged and still correct — what was missing was that nothing had ever gated the player's own
*movement* while the dialog was up in the first place, so "the world stopped for this" was a visual
metaphor the sim never actually enforced beyond the fact that every room hosting the machine happens
to be threat-free anyway. `GameSim.isMachineDialogOpen` (item-select open *or* a `'rolling'`/
`'choosing'` roll phase) is now read by `stepPlayerMovement`, `stepShooting` and
`stepBombPlacement` — the same `if (knockedDown) return`/zero-input shape Umgfalln already used —
so the player is inert for the dialog's entire duration while ticks keep flowing underneath exactly
as before (replay-safe, no new side channel). `sim/systems/pedestal.ts` also now gives `use`
outright to a roll actually in flight (`isMachineRollActive`, deliberately narrower — it excludes
plain item-select, which already had its own pedestal/shop/machine priority order to preserve)
rather than letting a coincidentally-nearby pedestal or shop pickup win the press instead.

**The screen itself is a genuine two-pane split (`render/machine-picker.ts`, rewritten), not a
single column that swapped its own contents.** Left pane: the item card(s) — identical shape to
#69's own row/description, just single-column now that it only owns half the panel. Right pane:
empty with a placeholder line before anything's rolled, a `wellSprite`/`solid`-fill progress bar
during `'rolling'`, and up to three `buttonSprite` cards during `'choosing'`, each tinted by
`HUD_PALETTE.machineRollTier` (a new five-colour record, common through legendary plus unlucky's
red) — decoration on top of a label that already spells the tier out in text
(`"Legendary — Damage up"`), never the only signal, the same rule `palette.ts`'s own
`promilleTier` comment states. The sole `unlucky` candidate a bad pull ever shows gets its own small
red "UNLUCKY" badge above the card besides, since a single card sitting alone is easy to misread as
"just another common" at a glance. A second `FocusRing` tracks whichever result is currently
selected, mirroring the left pane's own ring exactly.

**Not done this pass:** no new sound cue for the roll landing beyond reusing `ui-confirm` on a
result actually being applied; the anticipation bar is a plain linear fill, not a slot-machine-style
spin — either is real follow-up work if the beat needs more flavour, not a gap this entry papers
over.

## 73. A body has two circles — a footprint it stands on and a hurtbox it is shot in — and everything that stands is drawn on one Y-sorted layer

*"One sorted layer" and "the lighting had to follow them up" are superseded by #74: the depth buffer orders bodies and real lights shade them. The two circles stand; the hurtbox lift is #74's open item.*

**Decided:** M8, from a direction note: *"comparing to Isaac there is one major difference which
makes the game feel more immersive… almost all sprites have a certain perceived height. When Isaac
moves to a stone block north of him we can see his head sticks out over the block. His hurtbox is
also only his body, which is on the ground."* Two things had to change for that, and neither works
without the other.

### What was in the way

**Nothing in the renderer could express "behind".** `render/view.ts` built one fixed stack — room,
then props, then bodies, then the player — so a player was always in front of every rock and every
piece of furniture in the room, and every enemy was always behind them. The game had exactly one
walk-behind object, the arena Maibaum (#57), and it got there by having `view.ts` lift its
container out of the world and re-insert it above or below the player **every frame**, off a `footY`
getter written for that one prop. That is a decent trick used once and an untenable one used twice.

**And there was no height to draw.** A body was one circle used for four jobs at once — walls,
pushing, contact damage, and being shot — and #45 sized the art *to that circle* on purpose, with
`tests/content/sprite-scale.test.ts` holding every silhouette to within 1.8x of it on its longest
axis. A creature whose hitbox is its whole silhouette has no head to stick out over anything. #56
had already hit this from the other side and had to except bosses from #45's centre anchor ("a
sprite two to three times taller than its hitbox, centred, sinks half of itself through the floor")
without generalising it.

### The two circles

`sim/collision/footprint.ts`, and a `hurtbox` component alongside `body`:

- **The footprint** (`GameSim.body`) is the circle on the floor — movement, walls, pushing, contact
  damage, pickup reach, melee reach. It is deliberately smaller than the drawing. The four enemy
  size classes state their own (`ENEMY_PROFILES.footprint`: 3 / 5 / 7 / 18 against radii 4 / 7 / 10
  / 22); anything else derives one at `FOOTPRINT_RATIO` 0.7.
- **The hurtbox** (`GameSim.hurtbox`) is the circle a projectile has to cross, offset up the screen
  from the footprint's centre. Its radius is **the radius the body always had**, so every balance
  number in `tuning.ts` still applies to the thing it was tuned against.

The offset is derived, not authored: a sprite stands on its footprint's south pole, so shrinking
the footprint by `d` lifts the drawing by `d`, and the hurtbox is lifted by the same `d` so it keeps
sitting on the body instead of sliding down to its feet. Rounded to a whole world unit, because it
is a *position* and `render/resolution.ts`'s whole-number rule is about positions. A stored radius
of zero means "no hurtbox of its own" and resolves to the footprint (`hurtboxRadiusOf`), so a
pickup — whose radius is grab reach, a number the player feels — stays one circle, and so does
anything a test builds by hand.

**Shooting an enemy is meant to feel identical, and one body deliberately breaks that rule.** Alois's
hurtbox is his *footprint* (`PLAYER_FOOTPRINT` 5, against a drawn radius of 7), so a shot over his
hat is a miss. That is the half of the note about his own hurtbox, it is what makes a near miss read
as skill rather than as the game being loose, and it makes him about a third harder to hit — a real
difficulty change to expect in a playtest, not a side effect to discover.

### One sorted layer

`render/depth.ts` builds a single `sortableChildren` container keyed on each thing's **foot line**,
`y + footprintRadius` — which is also where its sprite is bottom-anchored, so the two agree by
construction and a body drawn in front of another is a body whose feet are further down the screen.
Into it go the room's obstacles, its decorative furniture, every body `EntityView` draws, the
player, and the Maibaum. #56's boss exception stopped being an exception and became the rule; the
Maibaum's per-frame re-parenting is deleted.

It is its own render group. Writing `zIndex` marks a render group's structure dirty and Pixi rebuilds
that group's instruction set; the world container also holds the projectile layer, and rebuilding
five thousand sprites that did not move because a body walked two pixels is a cost that would only
show up in the exact fight it must not.

Flat things stay below it and unsorted — floor, lip course, puddles, decals, ground shadows,
telegraph shapes, corpses — and captions (pickup labels, shop prices) stay above it, because a price
an enemy can walk in front of is a price nobody can read at the moment they are deciding to buy.

**A pedestal and Der Losbrunnen stay out**, below the layer. Both are a plinth under a light beam,
and a beam is a glow rather than a body: sorting the three sprites of one against the room would put
a barrel between a pedestal and its own light. The player therefore still always draws in front of
one, exactly as before.

### Height for the rocks

A body only reads as tall if something can cover it, and the roster's sprites are all about as tall
as their colliders (Alois is 32 authored pixels over a 28-pixel collider), so shrinking a footprint
buys four to six internal pixels of head clearance — real, but not the effect. The effect comes from
the obstacles, and it needed art: `tools/art/authoring/blocks.mjs` now builds each block tile
`BLOCK_CELL + BLOCK_LIP` tall (32 + **8**), bottom-anchored in its cell so the extra rows overhang
the cell *above*. **Collision is untouched** — the simulation still blocks exactly the cell, and the
overhang is height a player walks behind and is never stopped by.

8 was picked in a sign-off round (`CLAUDE.md`) against 12 and 16, rendered by
`tools/art/block-specimens.mjs` onto real floor tiles with Alois standing against a clump's north
face: 8 covers him to the knee, enough to read as depth and little enough that a two-cell clump
still reads as rock on a floor rather than as a wall. Floor 1's boulders grow by being taller;
floor 2's Lesesteinhaufen grows by being *piled higher* — extra cap stones rather than stretched
ovals, because a pile is not a single rock. `tools/art/validate.mjs` allows a tile to be up to
`MAX_TILE_OVERHANG_RATIO` (a quarter) taller than it is wide; width is still pinned to 16 or 32
(#48), which is what keeps `tileGridScale` whole, and `render/room.ts` derives the overhang from the
texture rather than from a constant, so the art is the only place it is stated.

### What the gates now check

`tests/content/sprite-scale.test.ts` keeps its floor on the longest axis and moves its **ceiling to
width only**. Capping height was the right check while height meant nothing and is the wrong one now
that it is the feature — it is the check that would have failed Alois for having a hat. Nothing is
lost: `tools/art/spec.mjs`'s `character` (48) and `boss` (160) canvas maxima already bound how much
of the frame a body may cover. `tests/art/blocks-authoring.test.ts` gained the assertion that a
block's overhang rows are actually *inked*, because a tile that leaves them empty passes every other
check, looks exactly like the old art, and silently has no effect.

### The lighting had to follow them up

The ambient light (#37/#243) is not a light — it is gradient *sprites* laid over the floor at one
fixed depth, so it shades what is under it and nothing else. That was invisible while nothing stood
*in* it. Moving the obstacles and the furniture above it left the bulb pooling light on a floor and
on nothing standing on it: a lit floor with unlit rock on top, which is a bug rather than a trade.

So the light is applied to them a second way. `AmbientLight.tintAt(x, y)` answers what the lighting
does to a body **standing at** a floor point, and `GameView.tintScenery` applies it as a `tint` to
every rock and every prop. Three things make that faithful rather than approximate:

- **Sampled at the foot line, one value for the whole sprite.** A rock's raised crown is not further
  across the room than its base, it is above it — shading by where its pixels land on screen would
  read height as depth and slide the falloff up its face. One value per object is also all the
  falloff deserves: it varies over hundreds of world units and a rock is sixteen.
- **Read back out of the same canvases the textures are uploaded from**, not re-derived from the
  gradient stops, so the sampler and the GPU are looking at the same pixels by construction. A
  changed stop, puff or blur radius moves both or neither.
- **Off a revision counter**, so Floor 1's static lamp shades a room once at load and only Floor 2's
  drifting cloud costs anything per frame. Floor 2 is exact besides: its cloud is already a
  `multiply`, which is precisely what a tint is.

**A tint can shade and shift hue; it cannot brighten.** So the bulb's *additive* glow becomes warmth
rather than bloom (`KELLER_GLOW_WARMTH`): a rock in the pool reads warm instead of reading grey
against a warm floor, but it does not blow out to white the way it did when it was drawn under the
overlay. That is deliberate and was chosen by looking at it. Drawing the glow itself over the depth
layer was tried first and is worse: it falls on the bodies too, and at the alpha the floor was tuned
for it washes the foreground out — Alois under the bulb loses his outline and his shirt goes pink.
The floor is the surface that pool was authored against; foreground art is not. What the roster
gains for it is that an obstacle now reads as a solid thing to route around (#62's own words for the
foreground tier) instead of blooming into the floor it stands on.

**Constrains:** anything new that stands on the floor joins the depth layer and writes a foot line —
there is no second mechanism, and the Maibaum is the worked example of why. Any sprite authored
taller from here gets its height for free and its hitbox unchanged, which is the point: this entry
is the *permission* for the roster to grow upward, and #45's "a bigger canvas is a bigger body" now
means a bigger *silhouette*, not a bigger hitbox.

## 74. One renderer: three.js draws the world in 3D and the HUD as a 2D pass — sprites stay 2D

**Decided:** M6, replacing PixiJS wholesale on the render side. **Supersedes** the Pixi mechanics in
#1, #40, #43, #45, #48, #49, #55, #56, #58, #60, #61 and #73 — the rules those entries state mostly
stand; the machinery under them does not. **Enforced by:** the architecture lint (#2), unchanged;
`tests/content/sprite-scale.test.ts` for sprite size.

### Why

Lighting. The 2D room had grown three separate fakes for one missing thing: gradient sprites for
the bulb's pool (#37/#243, then `tintAt` in #73), a blob sprite under every body for a shadow (#61),
and a Y-sorted layer so a body could stand behind another (#73). Each was a hand-rolled
approximation of what a depth buffer, a shadow map and a point light do for free, each had its own
bugs (#73's "lit floor with unlit rock on top" is the worked example), and a fourth effect — a thrown
Maß lighting the floor it flies over — was not reachable that way at all. The proof of concept
(`/poc-3d.html`, since deleted) stood the authored sprites on a lit floor under a fixed camera and
the room read as a *place*. That was the argument, and it was made by looking, not by benchmark.

### What the world is now

- **A fixed 65° perspective camera** (`render/world/camera.ts`), fitted once so exactly one
  `320×180`-unit view — `INTERNAL / WORLD_ZOOM`, the frame the 2D game showed — fills the internal
  frame, and targeting the same clamped viewport centre `followOffset` always computed. A `1x1`
  room never scrolls; a `2x2` scrolls exactly as it did (`GAME_DESIGN.md`'s "Room shape and the
  camera" still holds). The proof of concept chose 56° against 38° (more drama, less playfield) and
  90° (the 2D game); tuning after it landed on 65° (lens 34, zoom 0.985). `GameView.setElevation`
  is kept for tuning.
- **Walls with height, per tileset.** `FloorTileset.wallHeight` (`render/floor-art.ts`): Der
  Keller's are 26 units of wall, Dorf & Acker's `rural-wall` a 10-unit hedge the player looks over.
  `FloorTileset.lighting` names the light rig. Both are decisions about what the wall tile *is*, so
  they live where the tile is named (#40's manifest, two fields longer). All four walls are the
  floor's full height (the near wall was a short kerb in the proof of concept; the 65° camera looks
  over a full one).
- **Real light and a shadow map** (`render/world/lighting.ts`). A cellar hangs a point light on
  every `bulb` prop — two by default if none is authored, because a cellar with no light is a black
  screen, not a mood. Daylight is a sky, a sun, and a cloud plane that *casts a shadow* through the
  alpha-tested depth pass, so it darkens the barrels and the Bauer as it passes, not only the floor.
  A key light from the camera's side does the shadow map, so a body's shadow falls behind it,
  up-screen, off whatever the player is aiming at. Alois carries a lantern; every live player shot
  carries a small point light of its own.
- **Everything that stands is a 2D sprite standing up** (`render/world/billboard.ts`): a
  bottom-anchored quad, leaned back by the camera's elevation so its projected height is exactly
  its authored height, sized from the frame's pixel size over `ACTOR_PIXELS_PER_UNIT`. A frame is
  chosen by moving the quad's UVs on one shared texture, never by binding another. Lit by a standard
  material, and **the hit flash is the emissive term at full white** — the blown-out silhouette
  #43 describes `placeholder-art.ts` faking with a texture swap, now a material property.
  Obstacles, props, creatures, pickups, corpses alike: a boulder drawn as a textured box read as a
  crate with rock wallpaper, and the authored tile already *is* the illusion of a rock.
- **Standing sprites are a second render pass** (`render/world/layers.ts`, `GameView.render`). At
  65° a leaned quad lies almost flat — a full-height character's head sits ~14 units behind its
  feet, inside the back wall's box, and one pass lets the wall's depth clip it. So the room draws
  first, then everything on `ACTOR_LAYER` (every sprite, boulder, projectile, particle) draws again
  over it with the depth buffer cleared — the 2D renderer's painter's-order compositing, sprites
  still depth-sorted against each other. Lights are `enableAll`'d so the second pass is lit; the
  key light's shadow camera too, so the sprites still cast.
  *Corrected by #292: they do not.* three.js's shadow pass filters casters by the **viewing**
  camera's layers (`renderObject`), not the shadow camera's — and pass one's camera, the one that
  triggers the shadow render, is on layer 0 only. Enabling every layer on `key.shadow.camera` was
  never enough on its own; standing sprites have never cast a shadow through this path. Left that
  way for now (`docs/PERFORMANCE_AUDIT.md` F6): re-enabling it naively puts one shadow draw call
  back per body, which needs to be sequenced against #294's instancing rather than done first.
  `scene.background` is nulled for the pass — a `Color` background makes three force a colour
  clear on every `render`, `autoClear` or not, which would wipe pass one.
- **Flat things stay flat** (`render/world/flat.ts`): decals, telegraph shapes and plinths are
  quads a hair above the floor plane, stacked by kind so overlaps order predictably.
- **Projectiles and particles are instanced**: one `InstancedMesh` per projectile texture and per
  particle kind. Five thousand shots is a handful of draws.
- **Text is a HUD thing** (`render/world/label.ts`). Damage numbers, prices and pickup names have
  to stay legible at any angle, so they live on the 2D pass and are placed each frame at the
  projection of the world point they belong to. `GameView` projecting a point is the one seam
  between the two passes.

### The HUD did not get rewritten

The alternatives for the screen-space half:

- **Keep Pixi for the HUD on a second canvas.** Two renderers, two GL contexts, two texture
  uploads of the same art, and a compositing seam exactly where the vignette and the damage numbers
  need to know where the world is. Rejected.
- **Port the HUD to DOM.** Crisp text for free, but the pixel fonts, the nine-slice kit and the
  pointer model (#43, #154) would all be reauthored, and a DOM overlay can neither sit *under* a
  world effect nor be captured with the frame. Rejected.
- **Both renderers behind a flag.** Keeps a rollback and doubles every render-side change for as
  long as the flag lives — and a flag like that is never removed. Rejected. **The user's decision:
  one renderer, and delete the old one.**

So `render/gfx/` is a small 2D scene graph with the vocabulary the HUD, menus and screens were
already written in — `Container`, `Sprite`, `NineSliceSprite`, `BitmapText`, `Graphics`, `Texture`
— drawn by three.js as an orthographic pass over the world (`render/gfx/layer.ts`,
`render/app.ts`): painter's order is the whole depth model, depth test and sorting off. Pixel fonts
and the UI kit are rasterised straight into `DataTexture`s by pure functions (`textureFromPixels`;
`render/ui/font.ts`, `pixel-art.ts`) — Node-safe, no renderer, which is what keeps `CLAUDE.md`'s
specimen-sheet sign-off working.

**One canvas, exactly `INTERNAL_WIDTH × INTERNAL_HEIGHT` device pixels, CSS-upscaled by a whole
number.** `resolution.ts`'s integer rule moved from a Pixi container onto the element, and lighting
and shadows get the same chunky grain as the sprites they fall on. What this gives up is #43's "HUD
at the display's own resolution": the HUD draws at internal pixels like everything else. It reads
the same — a UI pixel was already one internal pixel — and `uiScaleFor(textScale)` is now only
#53's text-scale multiplier.

### What went

`render/ambient-light.ts`, `ground-shadow.ts`, `inked-bounds.ts`, `depth.ts`, `placeholder-art.ts`,
`prop-view.ts`, `room.ts` — the Y-sort layer, the fake shadows, the canvas-gradient ambient light,
the generated Pixi textures. The depth buffer, the shadow map and real lights are what they were
standing in for. The atlas under `assets/atlases/` was never loaded by the runtime, before or after:
it is a validation and packing artefact (`tools/atlas-packer/`), and stays one.

### Performance, honestly

`TECH_STACK.md` §2's "≤ 20 draw calls, one atlas, batch everything" reasoning was written for a
sprite batcher and is stale. The shape now is a few merged floor meshes, the wall boxes, one mesh
per standing body, one `InstancedMesh` per projectile texture and per particle kind, and one 2D mesh
per HUD element; the count comes from `renderer.info.render.calls` (debug overlay,
`src/debug/draw-calls.ts`). The 12 ms frame budget stands. The draw-call row **has not been
re-baselined** and is not asserted by the bench — it never was: the headless bench reports
`drawCalls: null` — and GPU cost in general is unverified in CI, which has no GPU. That is a known
gap, not a met budget.

**Constrains:** `sim/` still never imports the renderer — it did not know Pixi existed and does not
know three.js does (#2, same lint). `render/gfx/`'s vocabulary is the HUD's contract: a new HUD
element is written against it, not against three.js directly. A billboard derives its world size
from `ACTOR_PIXELS_PER_UNIT` and nothing else, so #45 holds unchanged — a canvas *height* is now
literally how tall a thing stands. Per-floor wall height and lighting are tileset data, authored
beside the tile names. A flash is emissive, a telegraph is a floor shape, a label is HUD text
projected from a world point — one mechanism each, no second one. **Open:** #283's northward hurtbox
lift is preserved in the sim, but its 2D rationale (a hitbox "under" a tall sprite) no longer
describes the picture — a proper 3D hurtbox is a follow-up. The draw-call budget needs
re-baselining against this scene, and the bench still cannot see it.

## 75. The mini-boss gate is placed off the path to the boss — and a floor with no mini-boss content simply has none

**Decided:** M8, #274 (item D of #270). **Builds on:** #19's content-gap policy, #271's XL floors,
#big-rooms' "a special slot is `1x1`".

A mini-boss room is not "one more special room." Its whole reason to exist is #275: the key to the
boss door is in it, so *where* it sits is the mechanic. Four rules, enforced in `assignRoles`
(`sim/room/floor-plan.ts`) and re-derived independently in `validateFloorPlan`, so a generator
change that breaks one fails the 10,000-floor sweep rather than shipping a floor nobody can read:

- **Last third of the floor** — `distanceFromStart >= 0.6 x bossDistance`. The backtrack after
  taking the key should be short; a gate two doors in means walking the floor twice.
- **Never adjacent to the boss room.** The key and the door it opens in sight of each other turns
  the detour into theatre.
- **Never on the only path to the boss.** This is the point of the role. If the mini-boss sits on
  the critical path, then locked doors already gate the boss and the key is dead weight — the key
  exists so the fight can be a *branch*. Enforced as "removing this room never disconnects the boss
  from the start", the same property `eligibleTemplates` already enforces for a `keyLocked`
  treasure room, asked of a room instead of a template's door count. Secret and supersecret rooms
  are not counted as connections here: reaching one costs a bomb, so a path through one is not a
  path a player can be assumed to have.
- **`1x1`, and a dead end where the floor has one** — the boss slot's own reasoning (#big-rooms) and
  `specialPool`'s own fallback shape. Measured over 3,000 real floors per floor: 92% land on a dead
  end on Floor 1 and 97% on Floor 2; the rest fall back to a through-room rather than retrying
  forever.

A floor that cannot satisfy the first three is a **retry**, never a floor that quietly relabels an
ordinary room — the rule `assignRoles` already applies to the secret rooms. Measured over 2,000
floors per configuration, the constraint costs about 23% more generation attempts on Floor 1
(2.39 -> 2.94 attempts per accepted floor), 12% on Floor 2, and 32% on an XL Floor 1 — against a
ceiling of 200 attempts, and the 10,000-floor test still never hits it.

**A floor whose content has no mini-boss template gets no mini-boss slot, and therefore no lock.**
Floors 3-7 (#39-#43, parked in M10) have no room templates at all yet, and floors 1-2 will spend
M6-M8 having their content replaced underneath them. So the slot count is derived from the pool
(`minibossSlotsForFloor`: is there a `1x1`, `specialRole: 'miniboss'` template tagged for this
floor?), not from the floor number, and a floor without one degrades to zero slots with a
dev-only `console.warn`, once per floor tag — #19's policy exactly. The failure mode this exists
to prevent is not a crash but a dead run: **a locked boss door with no key.** That is why the
count is data-driven rather than a constant, and why #275 must gate its lock on
`FloorPlan.minibossRoomIds` being non-empty rather than on "floor N has a mini-boss by now."

**The placeholder occupant is a guaranteed elite (#156), not a rolled one** — but only while it
*is* a placeholder. #276 (F of #270) gave floor 1 real fights: Der Rattenkönig and Die
Zapfhahn-Orgel, rolled between as a `spawnGroups` content choice. `applyCompiledRoom`'s
`guaranteedElite` now also checks `!bossBar`, so a real mini-boss spawns plain — it carries its own
health tuned against its own cycle (#66), and the ×1.8 elite modifier on top would break that — while
`dorf-miniboss.json`'s `kuh`/`bauer` placeholder stays a guaranteed elite until floor 2 gets its own
roster. Guaranteed elites draw no extra number from `random.enemies`, so every other room's elite
roll stays byte-identical. The authored open arena (no obstacles, like the two boss arenas) stands.

**The playtest bot walks the detour now, one issue before it is forced.** `pathToBoss` takes
waypoints and the harness feeds it the floor's mini-boss rooms; when #275 lands, the route that
already works is the only one that works, so a broken lock cannot be mistaken for a broken bot.
Making the bot walk into an arena holding a single evasive body immediately exposed something the
harness had been hiding: `cautious`'s 110px engage range sits just outside a shot's ~105px
lifetime, which was survivable only because ordinary rooms hold several enemies and one always
closes. `combatInput` now presses the attack — closes to 44px — after two seconds with nothing
landing. Over twelve seeds, `cautious` went from 6 stuck runs (all in a mini-boss arena) to 1 (in
an ordinary Floor 2 room, the same one the pre-#274 baseline gets stuck in), with a win where
before there was none.

**Constrains:** a mini-boss template is `1x1` until the slot itself learns shapes, and every floor
that wants the role must author one tagged for its own floor tag — no template, no gate, no key.
`FloorPlan.minibossRoomIds` is the count (0, 1, or 2 on an XL floor), and anything deciding whether
a floor is gated reads that, not the floor number. Rules 1-3 live in `minibossSlotProblem` and are
checked twice on purpose; loosening one means changing that function, not the caller. If the retry
rate ever becomes a real cost, rule 1 (the 0.6 fraction) is the one to relax — 2 and 3 are the
design.

## 76. Der Meisterschlüssel: the boss door is locked until the floor's mini-boss is down, and the key is a boolean

**Decided:** M8, #275 (item E of #270). **Builds on:** #75 (the mini-boss slot), #196 (the
padlocked-door tile and the key-locked treasure room), #19 (content-gap degradation), #50 (input-log
replay).

The mini-boss room (#75) exists so the fight can be a *branch*, not a wall across the critical path.
The lock that makes the branch mandatory: the mini-boss drops **Der Meisterschlüssel**, and the
boss room's doors stay shut until it is in hand.

**It is a boolean on `GameSim`, not a Kellerschlüssel and not a counter.** A Kellerschlüssel drops
from a weighted table (`content/pickups/drop-tables.ts`), and #196 went out of its way to keep it
away from any slot with more than one door for exactly this reason: a currency that *might* not drop
can never gate a critical path, because a run with no key and no mini-boss left to kill is
soft-locked. So the Meisterschlüssel is its own pickup with its own `{ kind: 'masterkey' }` effect,
spawned only by a mini-boss room clearing — never rolled, never stocked in a shop
(`tests/content/pickups.test.ts` enforces the absence). And it is one `meisterschluesselHeld`
boolean, not a count: there is one boss gate per floor, and carrying two keys would mean nothing.
It is cleared on floor advance and the instant it is spent (`transitionTo`).

**The lock is enforced in `GameSim.transitionTo`, the same place #196's treasure lock is** — refused
on touch when the destination is a `specialRole: 'boss'` room and the key is not held, spent on the
actual crossing (not on a brush past the threshold, unlike a Kellerschlüssel — standing in a boss
doorway with the key must never leave the run keyless and still outside). `bossDoorGated`, set per
floor by `app/main.ts` from `FloorPlan.minibossRoomIds` being non-empty, is what turns the check on:
**a floor whose content authors no mini-boss template has no mini-boss room and therefore no lock**
(#75's rule, carried through — the gate rides the slot existing, never "floor N should have one by
now"). Once the boss door opens, `bossDoorGated` drops for the rest of the floor, so a Blutwurz
(#84) spirit walk back to the already-cleared boss room never finds it re-locked.

**Determinism falls out for free.** The key drop is a mini-boss room clearing (deterministic), the
pickup is a walk-over collection (deterministic), the gate flag is derived from the deterministic
floor plan with no RNG drawn — so an input-log replay across a floor advance (#50,
`tests/determinism/floor-advance-replay.test.ts`) reproduces the gate and key state, and a
save/resume rides the same guarantee.

**Finding the mini-boss room: revealed on the minimap once a locked boss door has been seen.** A
mandatory off-path fight is only good if the detour is a route decision rather than a search. The
mini-boss icon shows from the moment the player first stands next to a locked boss door — which is
exactly "has visited a room adjacent to the boss room" (`minibossRoomsRevealed` in `app/main.ts`,
feeding `computeReveal`'s new flag). On **floor 1 it is always visible**, because floor 1 is the
tutorial (`CONTENT_BIBLE §1`: beatable by someone who has never played the genre). Options
considered and rejected: always-visible everywhere (weakest exploration), and never (a bad first
run on a 24-room XL floor).

**The fallback, if the detour plays badly:** drop the key entirely and place the mini-boss room *on*
the path, as the boss room's antechamber — zero backtracking, half the code, a guaranteed fight
before the boss, at the cost of the exploration payoff and of being predictable. This is a real
option, taken if a playtest says the backtrack is annoying, not tuned around.

**No reachable soft-lock**, enumerated: a floor whose mini-boss content is missing gets no lock
(#75); `validateFloorPlan` re-checks — independently of `assignRoles` — that every mini-boss room is
reachable from the start *without* passing through the boss room (the converse of #75's rule 3), so
the 10,000-floor sweep fails a generator change that breaks it; a Blutwurz spirit walk preserves the
held/spent key (the sim is never recreated) and re-locks nothing; a re-entered cleared mini-boss
room re-drops a key under Blutwurz's own "cleared rooms repopulate" rule (a second fight for a
second key — coherent, not a bug); the dev floor loop's `advanceFloor` clears the key and
re-derives the gate. A dev `J` shortcut and `sim.grantMeisterschluessel()` grant the key so a
tuning pass on a gated floor's boss does not cost a mini-boss fight each time.

**Constrains:** anything that needs "does this floor gate its boss" reads `sim.bossDoorLocked` /
`FloorPlan.minibossRoomIds`, never the floor number. The boss-door lock and the treasure-door lock
share the padlock tile and the `transitionTo` refusal shape but nothing else — they are two keys,
and `docs/DECISIONS.md` #76 is the note that says a later economy pass must not merge them.

## 77. Pixel-art candidates are generated on one of two tracks; the sign-off gate is the same on both

**Decided:** tooling/workflow (#276, where the two Floor 1 mini-boss sprites were the first art to
go through it), not tied to a milestone. Amends the `CLAUDE.md` "New pixel art needs sign-off"
rule with *how* the options round produces its candidates, which #71 (the local diffusion
pipeline) left implicit.

**The rule was always "show options, let them be picked, then commit" — this is which machine
draws the options.** On the home machine, the local ComfyUI install (#71) plus
`D:\repos\ComfyUI\pixel-bench` (a one-click server; `start-pixel-bench.bat` brings up ComfyUI on
`:8188` and the bench UI on `:8199`) is the fast way to a batch: its `/generate` endpoint takes a
text prompt to a finished, background-keyed, downscaled, palette-snapped PNG in ~20 seconds with
nothing clicked, so an agent can generate tens of candidates, cull the broken and off-style ones
itself, and bring the user ~10 survivors. In the cloud — or any checkout without that GPU — there
is no diffusion step: the options are authored as programmatic block art the way
`tools/art/authoring/*.mjs` already builds Alois, the bosses and both floor rosters (#43/#55),
rendered to a specimen sheet by a throwaway `pngjs` script, and the user is shown two or three.

**Neither track is what gets signed off.** The generation method is a scaffold for producing
candidates quickly and nothing more. What the user approves is the design and the canvas size
(#45), and the finalists still have to be shown standing in the room at true scale next to Alois
(#74 — a billboard in a 3D room, not a flat swatch) before any sprite lands in a commit. After a
pick, the diffusion output or the block art is hand-cleaned and the animation frames and angles
are authored from it, inside the picked direction, with no further sign-off round (the `CLAUDE.md`
rule's existing "iterating within a picked direction" clause).

**Constrains:** `pixel-bench` and everything under `D:\repos\ComfyUI` is never committed to this
repo (#71). The only repo-side half of the diffusion path is `tools/art/diffusion-postprocess.mjs`
and its CLI, which are deterministic and stay source. If the two tracks ever produce visibly
different house styles for the same category, that is a bug in the prompts or the block authoring,
not a reason to fork the sign-off gate.

## 78. A room a player revisits is cached whole, not made persistent and re-dressed

**Decided:** #293 (tier 2 of the render audit, `docs/PERFORMANCE_AUDIT.md` F2/F3), while
implementing the issue's own prescribed design.

**What the issue asked for.** "Invert it: one long-lived `Scenery` per `GameView`, with a
`dress(room, floor, doors, props)` that rewrites what is there" — a merged wall/void geometry
whose buffers are rewritten in place, a pool of `Billboard`s for blocks and props, a pool of
`DoorPiece`s repositioned rather than rebuilt. That is the shape `sim/`'s `SlotPool` discipline
already lives by, applied to `render/world/`.

**What actually landed, and why it is not that.** The wall/void merge is exactly as asked
(`Scenery.finalizeWalls`, `appendBox`) — one BufferGeometry per (occluder layer × wall/top split)
instead of one `Mesh` per run, which alone drops the room pass from ~87–153 draw calls to at most
four. What did *not* land is the single persistent `Scenery` with pooled billboards and doors.
Instead, `render/world/scenery-cache.ts`'s `SceneryCache` caches up to `SCENERY_CACHE_CAPACITY`
(4) whole, already-built `Scenery` instances by `GameSim.roomId`, LRU-evicted (disposed) beyond
that. A revisit within the window is a cache *hit* — the identical `Scenery`, `Mesh`es, materials
and `DoorPiece`s handed back, nothing rebuilt (`tests/unit/scenery-cache-gameview.test.ts` pins
this at the object-identity level) — which satisfies the acceptance criterion ("zero geometries or
materials constructed by a crossing between visited rooms") the same way persistence would have,
for the access pattern that criterion's own test methodology actually exercises: walking back and
forth across a handful of doors, not touring a whole floor and returning to the start.

**Why the swap.** Billboard/door pooling means every consumer of a `Billboard` (`standTile`,
blocks, props, the Maibaum's two-tile crown) and every `DoorPiece` construction site becomes
"acquire a pooled slot and reposition it" instead of "construct" — a wider, riskier diff touching
the same code #292 had just finished making correct, for a win the whole-object cache already
delivers on the revisit case that is actually measured. The one place this is a real, deliberate
trade instead of a free lunch: `MAX_DOOR_GLOWS` (`render/world/lighting.ts`) went from 8 to 12,
because a cached-but-off-screen room's `DoorPiece`s keep the door-glow `PointLight`s they acquired
(the cache detaches, never disposes, an entry that is still held) rather than releasing them the
moment the room leaves the screen. More point lights sitting in the fragment loop is exactly what
F7 warns against paying carelessly; here it is paid on purpose, sized against
`SCENERY_CACHE_CAPACITY`, and written down at both call sites so the two constants are not raised
independently of each other by accident.

**The room-transition slide still holds a second live room**, unchanged from before this issue —
#293's own text recommends rendering the outgoing room to a texture once and sliding that quad
instead, specifically because a second live room used to cost ~60 draw calls and a relink-prone
point-light-count change. Both of those are gone now: the wall merge makes a second live room
~4 draw calls, not ~60, and #292's fixed light pools make its presence during the slide free of
any shader churn. The problem the texture-snapshot was solving is substantially already solved by
the two changes that shipped instead, so the snapshot itself stayed out of scope — revisit it only
if a future measurement shows the second live room is still the cost driver it once was.

**Constrains:** a future change to `SCENERY_CACHE_CAPACITY` should re-check `MAX_DOOR_GLOWS`
against it (the doc comments on both cross-reference each other). A floor change clears the whole
cache (`GameView.sync`'s `roomChanged` branch) because a generated room's id is a floor-plan slot
name, not a run-wide one — anything that starts minting room ids with a different uniqueness
scope needs to re-examine that assumption. The dev `G` regenerate key marks its room's cache entry
stale (`GameView.notifyRoomContentChanged`) rather than disposing it inline, specifically because
that call can land between frames, before `sync` has swapped the currently-displayed `Scenery`
for its replacement — anything else that mutates a room's content out from under a live id should
use the same lazy-invalidation seam, not call into `SceneryCache` directly.

## 79. The atlas loads at runtime; body instancing and the CI perf harness stay out of #294

**Decided:** #294 (tier 3 of the render audit, `docs/PERFORMANCE_AUDIT.md` F8/§5), which scoped
four items — load the atlas, instance the bodies, re-baseline the draw-call budget, land a
browser perf harness in CI. Only the first landed; the other three are deferred, each for a
different reason, rather than attempted and left half-finished.

**Item 1, landed as scoped.** `render/floor-art.ts` no longer globs and `loadTexture`s 113
individual sprite files; `loadAtlasSheets()` loads the three packed sheets
(`assets/atlases/{common,floor-1-cellar,floor-2-rural}.png`) and their manifests once, and every
named sprite is a `Texture.sub()` view over the whole sheet — the same "rectangle view over a
shared `TextureSource`" vocabulary `cutStrip` already cut an animation frame with, so packing a
sprite into a sheet needed no new concept, only a second thing to cut a rectangle out of.
`spriteOrigins` is now built directly from each manifest key's `<category>/<name>`, which is
simpler than the old regex-matched-against-folder-name approach it replaces, not just
differently sourced. The issue's own fallback option — keep the per-file path as a dev fallback —
was not taken: maintaining two loaders that must produce byte-identical `Texture` frames is a
second thing to keep in sync for a fallback nothing in this codebase's dev/test/prod split
actually needs (`vitest`, `vite build` and `npm run dev` all run the atlas build first, per
`tools/art/build-atlas.mjs`'s own dev-plugin and CLI entry points).

`render/player-art.ts` was in scope too, though the issue names only `floor-art.ts`: Alois's own
seven strips are authored under `common/characters/`, which is packed into `common`'s sheet
alongside every other `common`-bucket sprite, so loading them through a second, separate glob
would have both duplicated the fetch of `common.png` (once per loader, since `main.ts` and
`editor/playtest.ts` both call `loadFloorArt()` and `loadPlayerArt()` in the same `Promise.all`)
and left the "boot fetches 3 sprite requests" criterion measuring a number the second loader could
silently break later. `loadAtlasSheets()` is exported from `floor-art.ts` and shared by both —
memoized behind a module-level promise so whichever loader asks first pays the fetch and the other
gets the same promise back, rather than each fetching its own copy of "the atlas, loaded."

**The pixel editor's live preview (`render/live-art-preview.ts`) needed a real fix, not just a
check**, per the issue's own callout. Every sprite's `Texture` is now a sub-rectangle of a *shared*
per-bucket sheet rather than a `TextureSource` of its own, so the old "replace the whole image"
strategy would have painted over every other sprite packed into the same sheet. It now promotes
each edited sheet to a persistent `<canvas>` once (seeded via `drawImage` from whatever the sheet
already was, so the rest of it survives) and composites every edit as a `putImageData` at the
target sprite's own `frame.x`/`frame.y` — the same absolute-offset composition `Texture.sub`
already does, so this is one code path rather than a special case per sprite shape. The one
behavioural change: `app/main.ts`'s `attachLiveArtPreviewListener` call site now excludes animated
`enemyArt` entries (those also present in `enemyStrips`) from the editable target map. Painting
into an animation frame's own rectangle is technically safe post-fix, but a live-preview message
does not say *which frame* it is drawing, and `enemyArt`'s entry for an animated name is always
that strip's first frame — silently writing a paint stroke into "frame 0's rectangle" while the
artist is looking at frame 3 in the docked editor would be a worse failure than the honest
`applied: false` the exclusion produces instead.

**Items 2 and 4, deferred.** Body instancing (`render/entities.ts`, `world/billboard.ts`) is the
issue's own acknowledged highest-risk piece: a custom per-instance-UV shader, a fallback path for
the alpha-fade case the issue's text says instancing cannot cover, a depth-sort rework because one
`InstancedMesh` cannot rely on painter's-order the way separate meshes did, and an acceptance
criterion ("compared frame-by-frame, not by eye") this session has no tooling to verify against.
Landing it wrong would trade a linear-but-correct draw-call cost for a constant-but-subtly-broken
one — sorting artifacts or a silhouette drifted from its collider are worse than the problem being
solved. The actor pass therefore stays one draw call per standing body; #294's "actor pass under
10 draw calls" acceptance criterion is not met by this change, and `TECH_STACK.md` §3's draw-call
row says so rather than being marked done.

The CI perf harness (item 4) is deferred for the same reason it was scoped out of #292 and #293
before it: every number in all three tier issues came from Playwright driving the preinstalled
Chromium by hand, and landing that as a repeatable CI gate (draw calls per pass under a ceiling,
zero `linkProgram` after a warm-up tour, zero net geometry/texture growth across 20 crossings) is
its own piece of infrastructure work — a `tests/perf/` suite plus a CI job — not a few extra lines
alongside items 1-2. Instancing is also the harness's most interesting thing to gate on; landing
the harness before the actor pass actually changes shape would mean writing its most important
assertion twice.

**What was actually measured, by hand, the same way #292/#293's numbers were:** boot's sprite/atlas
network requests went from 113 individual PNGs to the three atlas sheets (zero requests under
`assets/sprites/**`); a 30-room dev-`N` tour repeating #293's own churn check
(`tests/unit/scenery-cache-gameview.test.ts`'s object-identity guarantee, unaffected by this
issue) still shows zero `compileShader`/`linkProgram`/`deleteProgram` on a room revisit, confirming
the atlas rewrite did not disturb #292/#293's caching; every sprite category (a tile, an animated
enemy, a boss, a static character, a pickup, a projectile, vfx) was spot-checked visually in a live
run and renders identically to before. `tests/content/atlas-manifests.test.ts` is the CI-checked
half of that: it cross-validates the built `assets/atlases/*.json` manifests against
`scanSprites()`'s ground truth (every committed sprite has a manifest frame, every frame fits
inside its sheet, every animated sprite's sidecar round-trips through `compileAnimationSet` the
same way `cutStrip`/`loadPlayerArt` use it at runtime) — a Node-only regression test for the format
`floor-art.ts`/`player-art.ts` assume, standing in for the parts of "identical rendering" that
*can* be checked without a browser.

**Constrains:** a future change to the atlas manifest format (`tools/art/build.mjs`'s `frames`
shape) must keep `tests/content/atlas-manifests.test.ts` passing or update it deliberately — it is
the only thing pinning that contract down outside of a live-browser check. Landing instancing
later should start from `ProjectileView`/`ParticleView`'s existing instanced-layer pattern (the
issue's own suggestion) and needs to re-verify the same three churn/identity guarantees this entry
measured by hand, plus the depth-sort and alpha-fade fallback the issue's scope section calls out
still working. Whoever picks up item 4 should build its assertions around the counts this entry
and #292/#293 already established as meaningful (draw calls per pass, `linkProgram`/`compileShader`
deltas, `renderer.info.memory` deltas), not new metrics — those three are what the manual checks
across all three tier issues converged on as hardware-independent and worth gating on.

## 80. Lights never leave the scene, and a linked shader program is never deleted

**Decided:** the room-switch stutter fix, after #291/#292/#293/#294 had each landed and the game
still "stutters or gets stuck for almost multiple seconds" on a crossing. `docs/PERFORMANCE_AUDIT.md`
§3b has the measurements; this is the two rules they produced and what they constrain.

**What was actually happening.** Every lit material's shader program is keyed on, among other
things, `numPointLights` — three.js bakes the light count into the GLSL as a `#define`, so a scene
whose count changes needs a different program for every lit material, linked synchronously, on the
frame the count changed. #292 made the *set* of `PointLight`s constant — a lantern, the shot
lights, a pool of door glows, a pool of bulb rigs, all created once — and the count kept changing
anyway, for three reasons that were each one step past where #292 stopped: a `DoorPiece` parented
its pooled glow under its own group, and #293's cache detaches a visited room's group from the
scene with the glows inside it (three counts only lights it can traverse to); `PedestalView` and
`MachineView` still made their own `PointLight`s, under groups hidden when a room has none (a hidden
subtree is not traversed either); and #291's shader warm rendered into a 1×1 `WebGLRenderTarget`,
whose linear output colour space is *also* part of the program key, so it linked a second, unused
set of programs on the dwell frame and the on-screen set still linked on the switch. Underneath
that, F1's original mechanism: three reference-counts programs per material and `deleteProgram`s
at zero, and rooms own a few per-instance materials each, so even a constant count would relink
whatever the last disposed room had been the sole user of.

**Rule 1 — a light is a scene-root resident, positioned in world space, never parented.** Every
`PointLight` the game has is created by `Lighting`'s constructor and added to the scene root there;
nothing else constructs one. A `DoorPiece`, a pedestal slot, the machine each *claim* one
(`acquireDoorGlow`, the new `acquirePropLight`, pool `MAX_PROP_LIGHTS`) and drive its `position`
and `intensity` — `DoorPiece.placeGlow` works the door's world position out from its centre and
facing, and `Scenery.setOffset` re-places every door's glow when the room slides. What used to be
"add the light to my group" is now "tell the light where my group is." The corollary is
`Scenery.attach`/`detach`: the only way a room joins or leaves the scene, because a room that is
off screen must have dark glows (`DoorPiece.setLive`) while its lights stay in the count — and
`attach` also resets the group to the origin, which fixed a latent bug where a cached room last
seen sliding *out* would have come back a room's width off. `tests/unit/lighting-pool.test.ts`
counts with `traverseVisible`, the traversal three actually does, across detached rooms, hidden
slots, a slide and a revisit through the real `GameView`.

**Rule 2 — once linked, a program lives as long as the renderer.** `render/world/program-pins.ts`
walks `renderer.info.programs` after every `GameView.render` and bumps each new program's
`usedTimes` once, so no `material.dispose()` can take it to zero. This is deliberately the generic
mechanism rather than the audit's "cache every material" — a billboard's tint, a door leaf's
colour, a floor sprite's texture are per-instance for good reasons, and a cache would have to
enumerate every material shape the renderer ever draws and be kept in step with each new one.
Pinning needs no such list. It is safe *because of rule 1*: with every input to a program's key
constant across a run (light count, shadow setup, output colour space, the material shapes), the
set of programs this keeps alive is bounded — it plateaus at ~20 where before it climbed past 150.
Memory-wise a program is a compiled GPU object in the low tens; textures and geometry are not
pinned and are disposed exactly as before.

**The warm follows both rules.** `GameView.warmSceneryGroup` renders into the canvas under a 1×1
scissor, never a render target, so the variants it links are the ones the frame draws; and the
first `render` runs `renderer.compile` over the whole scene so the persistent layers link behind
the title card rather than on the first crossing into a room that has enemies or loot. Two
details make that actually cover them: the views that build their meshes lazily (`PedestalView`'s
slots, `EntityView`'s telegraph shapes and labels, `DecalView`, `ParticleView`'s per-kind layers)
now build one hidden instance up front, so `compile` has something to compile; and because a
driver defers the link itself until the first status query — which three makes on a program's
first *draw* — `ProgramPins.settle` fetches a couple of newly linked programs' uniforms per frame,
so a hidden mesh's program finishes linking behind the card, not the first time it shows.
`warmSceneryGroup` also stopped consuming `shadowNeedsRefresh` — a warm room used to get baked
into the live room's shadow map on the first frame of a floor — and the warm now waits a frame
whenever a shadow re-render is pending, since drawing lit materials before any shadow map exists
binds an empty colour texture to a shadow sampler (a driver warning per draw).

**What this costs and constrains.** `numPointLights` is a constant for every lit fragment — F7's
per-fragment loop, made fixed. The first cut of this fixed it at 35 (1 lantern + 8 shot lights +
12 door glows + 6 bulbs + 8 prop lights), up from a varying 16–26: the right trade for a stutter
(a relink of every shader is hundreds of milliseconds; nine more loop iterations at 640×360 is
not), and the pools were then sized to what is actually measured rather than padded. A door now
claims its glow while its room is *on screen* (`Scenery.attach` claims, `detach` returns) instead
of for its lifetime, so the glow pool covers the two rooms a slide draws rather than every room
`SceneryCache` holds — the worst adjacent pair across 300 generated floors totals 9 doors, so
`MAX_DOOR_GLOWS` is 10; bulbs are 3 (the unauthored default is two, authored content uses one);
prop lights are 3 (one pedestal per authored room, one machine per floor, a spare). **25 point
lights**, and under SwiftShader — directional only, as always — a settled room went from 4.2 to
5.5 frames per second, a 30% cheaper lit fragment. `tests/unit/lighting-pool.test.ts` pins each
pool to its measurement so content growth trips a test rather than a silent dark door. The
audit's other F7 lever — replacing the glow lights with emissive quads — is a visual change and
stays open for a sign-off round. Anything that adds a light to the game adds it to `Lighting`'s
constructor and a pool, never to a scene-graph node it owns — the `GameView` case in that test is
what fails if it does. Anything that changes a program-key input mid-run (a second shadow-casting
light, tone mapping, a render-target pass) re-opens both rules and needs re-measuring with the
harness in `tools/perf/room-crossings.mjs`.

**The gate.** The same harness runs in CI as the "room-crossing gate" job (`npm run
perf:crossings`): headless Chromium on SwiftShader against the dev server, twelve real door
crossings, failing on any `linkProgram` after the run's first crossing or a program count above
40. The audit deferred this as its own piece of infrastructure (#79); it is here because the
relink came back twice after being fixed once, and nothing in the unit suite can see it — it lives
between three.js's program cache and the driver. It gates on the work (calls, counts), never on a
SwiftShader frame time. The run's *first* crossing is allowed a link or two: a shape nothing has
drawn yet (a fading corpse, a room prop no other room has) links once per renderer lifetime and
is pinned from then on.

**Rejected:** compiling asynchronously (`KHR_parallel_shader_compile` / `renderer.compileAsync`)
instead — it would hide the link on drivers that have it and leave the relink itself in place;
the fix is that there is nothing to link. Replacing the slide's live outgoing room with a snapshot
(audit plan item 8) — it would have removed the *slide's* light-count swing but not the cache's,
and the cache's was the larger one.

## 81. An enemy may change the arena: `dropProp` puts terrain in the world, and a spawn choice may place a squad

**Decided:** #277 (Dorf & Acker's mini-bosses), while implementing Der Ladewagen and Die
Blaskapelle.

**The bet #14 made, and the two places it needed widening.** Every enemy in the game is a size,
four numbers and a state machine built out of named primitives, and the whole schedule rests on
"adding an enemy needs no engine change." Floor 2's mini-bosses are the first two fights that
could not be authored inside it, and it is worth saying precisely *why*, because "the primitive
list grew" is only defensible if it grows for a class of fight rather than for one enemy.

**`dropProp` — a body that leaves terrain behind it.** `summon` (#276) grows the room's *bodies*;
nothing could grow its *geometry*. Der Ladewagen's one idea is a soft timer made of geometry —
it sheds hay bales as it drives a circuit, they are solid to shots from both teams, and the arena
degrades while the player is standing in it. The primitive is the smallest general form of that:
a prop kind, a cadence, a cap, the dropped prop's health, and how far behind the body it lands.
It is built on `spawnTarget`, the same call an authored `decorativeProps` barrel goes through, so
a dropped bale *is* a barrel as far as collision, shots, splash and the renderer are concerned —
there is no second kind of terrain. It is deferred out of `stepEnemies` off an `EnemyDropProp`
event for the same reason `summon` and `splitOnDeath` are: spawning grows the world, and a system
loop that has cached its component arrays must not have them swapped underneath it.

`maxActive` is not a performance knob, it is the fairness one, and it matters more here than it
does on `summon`: a body walks away or dies, a prop does neither, so an uncapped dropper
eventually walls a player into a corner they cannot shoot out of. Three further skips are part of
the primitive rather than of the content: a drop inside a wall, a drop overlapping another prop,
and a drop on top of the player. The last is the one an arena that degrades must never do — a
bale appearing under the player shoves them with no warning and nothing they could have done.

**`RoomSpawnChoice.escorts` — a mini-boss may be more than one body.** Die Blaskapelle is three
Blaskapellisten standing in formation, and the fight is that killing one *changes* the pattern
rather than thinning it: three healths, three positions, three things to aim at. A room's
`spawnGroups` could already place `count` bodies of one rolled choice, spread mechanically 8px
apart — the wrong tool twice over, since the three are different enemy ids and where they stand
relative to each other is the fight. Escorts hang off the **choice**, not the group, because the
choice is what the roll picks: on the group, the run that rolled Der Ladewagen would get two
bandsmen standing beside a tractor. It is data-only — the compile emits ordinary `enemySpawns`
entries — so nothing downstream knows a squad from three separately authored spawns. The kept
third idea in #277, Der Gartenzwerg-Reigen (a ring of gnomes), is the same shape with five.

**`fireOnBeat.beatOffset` — the offset rides the room clock, not the body clock.** `fireOnBeat`
(#37) already fires off `sim.tick` rather than off ticks-in-state, so that two Blaskapellisten
ring together whenever each entered its firing state. The mini-boss needs the opposite of
together and the same property underneath: an eighth behind the tuba has to *stay* an eighth
behind it, for the whole fight, regardless of spawn order. So the offset is taken against the
same clock, and scaled with `fireIntervalScale` alongside the bar it sits inside — a difficulty
knob that stretched the beat but not the offsets would silently re-voice the lattice.

**What this does not license.** None of these is a per-enemy hook. A primitive earns its place by
being the general form of a *kind* of fight the format cannot express at all — "an enemy that
changes the room's geometry", "a mini-boss that is a formation" — never by being the shortest
path to one creature. The test for the next one is the same: could a second, unrelated enemy be
authored out of it without touching `sim/`?

**Found while building it:** `orbitPoint` had never been used by any authored enemy, and its
radial correction was inverted — a body inside its ring was pulled further in, one outside pushed
further out. Since an `orbitPoint` body's ring is centred on its own spawn point, every such
enemy would have started exactly at the degenerate centre and oscillated one pixel back and forth
forever, velocity spinning a full circle around it, going nowhere. Fixed in the same change
because Der Ladewagen is the first content that uses the primitive and cannot drive a circuit
without it. The general lesson is #7's: a primitive nothing has authored against yet is
untested content-side, however carefully it was written.

## 82. A mini-boss pays too, at half a boss's confidence — and a room's identity has to survive two of it on one floor

**Decided:** M8, #278 (item H of #270). **Builds on:** #75/#76 (the mini-boss slot and its key),
#28 (pedestals), #218/#238 (Der Losbrunnen, whose second-home reasoning this explicitly declines
to extend a third time), #271 (XL floors, two mini-boss rooms).

A longer floor (#270) pays more from the per-room-clear roll automatically — 16 rooms fire it more
often than 11 — but a floor still hands out exactly one boss pedestal regardless of length, and the
mini-boss fight #275 already made mandatory was paying nothing at all beyond the Meisterschlüssel.
Both gaps get closed the same way #28's pedestal already closes them for a boss room: a real item,
held back on the room's own authored `pedestal` prop until the fight actually ends
(`GameSim.pendingMinibossPedestal`, the exact `pendingBossPedestals` shape and reasoning), drawn
from the `treasure` pool (`pedestalPoolForRole` already reserved this for the day it happened). The
odds are lower than a boss's guaranteed pedestal — 40% for a floor's first mini-boss, 20% for an
XL floor's second — and a miss is never a bare nothing: it pays a consolation bundle (a half-Maß, a
Biermarke, a Kellerschlüssel) that costs the run nothing to receive but means the room always
resolves into *something* landing on the floor. Both `sim/tuning.ts`'s `MinibossRewardTuning` rates
move at runtime, same as every other roll in the file. **Not eligible for the Losbrunnen slot** —
#238 already gave the machine a second home (the boss room's own reward spot) precisely so a third
home never turns a chance encounter into furniture; a mini-boss pedestal never populates
`pendingBossLosbrunnen` and the reward-roll code path that fills it is boss-only.

Measured over 20,000 simulated seeds (real `generateFloor` calls for both playable floors, off the
same continuing `floor` RNG stream a live run advances, plus a real coin flip per mini-boss slot
found at the tuned rates): **0.876 extra pedestal items per two-floor run** — close to, and
slightly above, the issue's own back-of-envelope 0.8, because floor 2's higher `xlChance` (0.25 vs
floor 1's 0.15) means real XL floors show up 19.8% of the time across both floors combined, each
contributing an extra 0.2-chance slot the naive per-floor-average missed.

**The second mini-boss on an XL floor drops no key, and only pays the lower rate.** Its
Meisterschlüssel would be strictly redundant — the first one already opens the one boss gate a
floor has — and #278's own words are the reasoning: "a key with nothing to unlock is a small lie to
the player about what keys are." `GameSim.minibossKeyGrantedThisFloor`, a plain boolean reset every
floor start, is read (then set) by the room-clear drain that spawns `pendingMinibossKey`/rolls
`pendingMinibossPedestal`: false means this clear is the floor's first mini-boss (guaranteed key,
`firstItemChance`), true means every mini-boss clear after it this floor is a "second" (no key,
`secondItemChance`). A plain boolean is exact, not a shortcut, because that drain only ever runs
once per distinct `roomId` — `roomClearedIds` blocks every later clear of the same physical room
from reaching it again, Blutwurz (#84) included, so there is never a need to tell one mini-boss
room apart from another once granted. A Blutwurz spirit walk re-fighting an *already-cleared*
mini-boss room still leaves its key collectible, exactly as before this issue — but not through this
gate: the original, uncollected pickup is what `roomLootSnapshots`/`restoreOrSpawnRoomLoot` already
put back on every reload of an unfinished room, key included, which is the actual mechanism #76's
"cleared rooms repopulate" note was describing all along.

**The bug this ran into, and had to fix first: two mini-boss rooms on one floor can be the same
room as far as `GameSim` is concerned.** `roomId` — and so `roomClearedIds`, the thing that decides
whether a room's enemies spawn at all — has always been keyed by the *template's own authored id*
(`compiled.source.id`), not a per-slot id from the floor plan (`GameSim.clearFloorProgress`'s own
doc comment already flagged this as a known, tolerated *cross-floor* collision — different floors
draw from different `floorTag` pools, so it stays rare). What nobody had hit yet: an XL floor's two
mini-boss slots draw from the *same* one-template-per-floor-tag pool that exists today
(`dorf-miniboss`/`cellar-miniboss`, the only mini-boss template authored per tag), so both slots
resolve to the identical template *within one floor* — a same-floor collision the cross-floor
framing never covered. Measured directly (`generateFloor` on a forced-XL floor 2, seed 0): both
mini-boss room instances came back `templateId: 'dorf-miniboss'`. The player-visible failure: clear
the first mini-boss, walk into the second, physically distinct room, and it reads as already
cleared — no enemies, no key, no reward, the instant the first one is, because
`roomClearedIds.has('dorf-miniboss')` is already true. This is exactly the "reachable through the
real progression" gap `CLAUDE.md` calls out, not a corner of #278 — the second mini-boss's reward
economy is moot if the room can never actually be fought.

The fix: `GameSim.loadRoom`/`transitionTo` grew an optional trailing `roomInstanceId`, used as
`roomId` in place of the template's own id whenever a caller supplies one. `app/main.ts` (every real
room-load call site — `crossDoor`, `advanceFloor`, the Blutwurz entrance, the `G`/room-editor dev
tools) and the playtest harness now pass the floor plan's own `FloorPlanRoom.id`, which is unique
per physical slot even when two slots share a template. Safe everywhere it's threaded through,
because every one of `roomClearedIds`/`roomLootSnapshots`/`unlockedKeyRoomIds` is fully wiped on
every floor advance (`clearFloorProgress`) regardless — so a per-floor-unique instance id closes the
same-floor gap with no new cross-floor one opened. A caller with no floor plan (a unit test, the
in-page room editor's own template preview) keeps the old template-id fallback, which is exactly
right for it. Staircases were deliberately left alone — a mini-boss room is never one, and widening
scope to a second, unrelated collision class this issue didn't need to prove is exactly what
`CLAUDE.md` warns against doing without cause.

## 83. Two keys, not one, and the mini-boss is a branch — the two questions #270 owed an answer to

**Decided:** M8, #279 (item I of #270, the epic's closing write-up). **The verdicts themselves were
made earlier**, while implementing #274/#275, and are already written down in full in #75 and #76;
this entry exists because #270 asked for both of them in one place, findable without knowing which
implementation issue happened to be open when each was settled — the same standing #239 gives its
own decisions: the reasoning is the artefact, not the verdict, and it should not cost a reader two
lookups to find both halves of one design rule.

**1. Why there are two kinds of key, and why a later pass must never merge them.** A
Kellerschlüssel drops from a weighted table (`content/pickups/drop-tables.ts`) and can therefore
never gate the critical path — a run with no key and nothing left to produce one is a soft-lock,
which is exactly why #196 kept `keyLocked` treasure templates out of any slot with more than one
door in the first place. A Meisterschlüssel is the opposite kind of thing on purpose: granted by a
fight that a floor's own content guarantees is present (or, if it isn't, the lock never engages at
all — #75's content-gap rule), never rolled, never stocked in a shop, one boolean per floor rather
than a count. The two share a padlock tile and a `transitionTo` refusal shape and nothing else.
Full mechanics: #76.

**2. Off-path with a key, not on-path as an antechamber.** #75/#76 chose the branch: the mini-boss
room sits in the floor's last third, never adjacent to the boss room, and never on the only route
to it, so finding it and fighting it is a route decision rather than a wall the run walks through
automatically. The evidence that settled it is the same evidence #270 opened with — a boss at
3.94 doors from the start (mean of 500 seeds, floor 1) meant the floor was over before a run had a
shape, and an *on-path* mini-boss would have bought length without buying a decision, exactly the
"more of the same" failure #270's own measurements warned against for a longer floor generally.
An off-path fight behind a key spends the same room budget on a choice — take the detour now, or
keep exploring and come back — instead of a second corridor segment. The rejected alternative (drop
the key, place the mini-boss as the boss room's antechamber) is not a straw man and is not closed
off: it is cheaper by half the code and a legitimate fallback if a playtest ever says the backtrack
plays badly, and #76 records it as exactly that — a decision to revisit with evidence, not a door
nailed shut.

**Constrains:** `docs/GAME_DESIGN.md` §4 and `docs/CONTENT_BIBLE.md`'s mini-boss section describe
the shipped shape (off-path, two keys); a change to either verdict gets a new entry that supersedes
this one (this file's own top-of-page rule), not an edit to it or to #75/#76, which stay as the
record of what was reasoned through at the time.

## 83. Difficulty relief and room readability: the constraints that outlast the batch

A pass of player-help and readability changes. Most of it is local — a tuning number, a
material swap — and lives in the code. These are the parts that constrain something else.

### Every explosive telegraphs the same way, and it does not grow

`FloorHazardBar` / `FloorHazardDisc` (`render/world/flat.ts`) are the one telegraph shape for
anything that explodes: a red diagonal hazard hatch, shown at the blast's **true size from the
moment it is armed**, blinking faster as the fuse runs out. The Bierfassl uses the crossed bars
(its Bomberman shape), a radial blast the disc. A growing marker read as "the danger is still
arriving" right up until it wasn't; a static one at full size with the countdown in the blink
says "this whole area, in this many beats." The player's own Böllerschmeißer item routes through
`GameSim.activeItemBlastTelegraph` — a per-tick value the item's `onTick` re-arms while its fuse
burns and `stepItemTick` clears at the top of every tick, so a marker that is not being kept
alive vanishes on its own. The rule going forward: a new explosive adds a hatch entry, never its
own telegraph.

### `dropLoot`'s `guaranteed` flag drops the miss, not the mix

An elite always leaves loot (#1) by passing `guaranteed` to `GameSim.dropLoot`, which skips the
`null` "nothing" entry when accumulating and rolling. It is still that enemy's own tier table
and the same relative weights between the real pickups — only the drop *rate* for that one roll
goes to 1. Anything else that wants "always drops something, from this table" uses the same
flag rather than a second table.

### A boulder a bomb clears is removed whole, and the destruction is the sim's to remember

`RoomGeometry.breakBoulders` removes any `blockOverflyable` block whose **centre** the blast
cross covers — the whole block, not a per-cell carve. A merged boulder run the blast lands the
middle of goes entirely, which reads as "the bomb cleared that path" rather than leaving a
ragged half-wall; free-standing clumps (the common generated case) are one or two tiles anyway.
Structural walls and void stand-ins (`overflyable === 0`) are never touched. `GameSim` owns the
"stays cleared" record (`destroyedBoulders`, keyed by authored template id like `roomClearedIds`)
and replays it in `applyCompiledRoom` and through `reapplyDestroyedBoulders` for a prewarmed
build — a fresh `RoomGeometry` is compiled per room load, so the removal has to be replayed onto
it, not stored on it.

### The renderer rebuilds a room's scenery in place when its content changes without a transition

A bombed secret wall (#5) and a cleared boulder (#4) both mutate the current room with no room
transition to hang a redraw off. `GameView.sync` grew a branch: when `staleRoomIds` holds the
*current* room and nothing else changed, it rebuilds that room's `Scenery` in place — the same
`getOrBuildScenery` cache-replace the room-change branch uses, which is safe here for the same
reason (`sync` reassigns `this.scenery` before the next `render`). The stale flag is keyed on
`sim.roomId` (the authored template id `getOrBuildScenery` also keys on, not the floor plan's
slot id): `app/main.ts` polls `sim.bouldersChangedTick` and, on a secret reveal, calls
`GameView.markCurrentRoomStale()`, which resolves that id itself. A secret doorway that has been
opened draws blasted (rubble, no leaf, no frame): `DoorPiece` gains a `blasted` flag, `Scenery`
is told which directions are secret (`secretDoorDirections`), and `prewarmRoom` carries the
*next* room's set so a room built ahead of the crossing knows its own blasted walls.

### Doors have no roof now

The lintel and the course of wall over a doorway are gone (#6); the jambs run full wall height.
Every doorway is an open-topped portal. This was for the south wall — the camera only ever sees
its back, and a capped doorway there gave the player no way to tell an open door from a shut
one. Anything that later wants to draw *above* a doorway (a sign, a boss-door arch) is adding
back something this removed on purpose, and should say why.

## 84. Every item is visible, and the boring half of the roster got a real design

**Decided:** the 2026-09 item pass, after the 139→51 cut (#299) — a second, hand-driven pass
over what survived it.

**The problem the cut left behind.** Fifty-one items whose *designs* earned their slot still
included nine whose whole effect was a stat line — Bierbank ("Luck +1, Range +5%"),
Braumeister-Schürze ("Damage +0.2"), Feuerwehrhelm, Kartoffelsalat, Traktor-Auspuff, a
Gartenzwerg-Hut whose entire payoff was Luck, a Bauern-Mistgabel that was a first-shot damage
bump — and two (Bierdeckel, Luftballon) that were the same `returning` tag under two names.
`docs/GAME_DESIGN.md` §8's hard rule is "an item must be recognisable in one sentence and change
how you play", and "+5% range" fails the second half however well it passes the first. Worse,
almost nothing an item did was *visible*: Almabtrieb's description promised its moving shots a
different colour and nothing drew one, Blaskapelle's ring dealt damage with no ring, Lederhosn's
one absorbed hit and Weißwurst's noon bell had no on-screen state at all.

**Rule one: most items change the verb, a few change the numbers — on purpose.** The redesigned
nine map onto shapes the engine already had and the roster had never used: `bouncing`
(Bierdeckel, a flicked mat), `splitting` (Kartoffelsalat), knockback-on-hit (Feuerwehrhelm, hose
water), a parallel double shot (Bierbank), a triple fan (Braumeister-Schürze), a no-hit streak
that grows the fan (Gartenzwerg-Hut), a trail of stationary poison clouds (Traktor-Auspuff), a
melee-range jab replacing the gun outright (Bauern-Mistgabel), and the minimap's long-reserved
secret-room unlock (Schlüsselbund). Deliberately *kept* as plain stat items: Apfelkuchen,
Bierkrug, Kraftbier, Radler, Platzangst, the Promille machinery (Bierbauch, Feierabendbier,
Konterbier) and the room-clear economy (Brotzeitbrett). A roster where every item is a build
pivot has no cheap early pickups; the point is the ratio, not the absence.

**Rule two: every item shows itself, through one of three channels.** (1) *On the shot*: a
per-projectile tint (`ProjectileStore.tint`, `sim/projectile/tints.ts`, `GameSim.tintProjectile`)
the renderer applies as an instanced colour, so Spezi's second shot is brown, Colaweizen's is
cola-dark, Almabtrieb's moving shot finally has its colour, Weißwurst's shots go white until noon
— alongside the existing size channel (Bierkrug, Kraftbier and Radler now change the shot's
radius). Names live in `sim/` so content can name one as a string literal under
`content-is-data`; RGB values live in `render/palette.ts`, and nothing in `step` reads the field,
so a tint can never move a replay. (2) *In the room*: area items draw the area they hit
(`splashBurst` on Blaskapelle, Schuhplattler, Watschn, Braumeister-Hammer, Steinkrug). (3) *On a
HUD row*: `ItemDefinition.status`, a pure reader the renderer polls (`render/item-status-hud.ts`),
for the items whose effect is a counter or a condition — Lederhosn's absorbed hit, Gartenzwerg's
streak, Lebkuchenherz's slogan, Visier's volley countdown, Neuschwanstein's next bill. It is a
query, not a hook: declared beside `hooks`, never in them, so `items.test.ts`'s "no filler" check
(an item must declare a hook) is not satisfied by a readout alone.

**What this does not license.** A tint is not a substitute for a sprite when a tag has one
(`PLAYER_TAG_SPRITE_ORDER` still wins the texture; the tint multiplies it), and a status row is
not a substitute for a visible effect — the row exists for state, not for effects that could have
been drawn. Adding an item still means asking which of the three channels it shows through, and
"none" is the same failing answer "no hook" already was.

**Found while building it.** Item hook dispatch was not re-entrant: a hook that spawned a shot
(`spawnItemProjectile`) ran a nested `onProjectileSpawn` broadcast that, on exit, nulled the
outer broadcast's `dispatchSim` and overwrote the shared scratch context — so every item sorted
after the spawning one silently lost its hook for that broadcast, and the spawner came back to
someone else's `ctx.state`. With Spezi and Braumeister-Visier the only spawners it was a
once-in-five-shots skip; a fan of three plus a streak's extras coming out as *four* shots in the
headless run is what exposed it. `sim/systems/items.ts` now saves and restores the dispatch state
around every broadcast on a fixed, preallocated stack. Separately: a stationary player projectile that survives its hit (`piercing`)
re-registers against a body still overlapping it every other tick — `lastHitTarget` lapses the
moment a tick finds nothing — so Traktor-Auspuff's clouds pop on first contact rather than
pierce, and the note is on the item for the next trail-shaped design. And the `splitting` tag
had never been granted by any authored item, so `spawnSplitChildren` had never inherited a
child's presentational fields (`art`, `tint`) — it does now.

## 85. Item icons are plain objects on the pickups' 24×24 canvas, composed from source, landed batch by batch

**Decided:** the 2026-09 item pass, second half — the pixel art for the 51-item roster, after
#82 settled the effects.

**What was chosen, and against what.** `CLAUDE.md`'s sign-off round, cloud track (#77): three
programmatic directions for the first ten items, rendered at 6× beside Alois and the pickups.
*A, the plain object* — the item itself filling the canvas, one step of palette shading, 1px
`#000000` ink — won over *B*, the same object drawn smaller on a round beer-mat badge, and *C*, a
2px-ink variant with one feature oversized (the object equivalent of #55's chibi rule). A is the
pickups' own language: `pickup-mass-full.png` and friends are 24×24 on exactly these rules, so an
item on a pedestal and a Maß on the floor read as one family of object, and the pedestal's
quality-coloured beam and light stay the thing that says "this one is an item". B's badge would
have said it twice; C's weight sat oddly next to the pickups it shares a room with.

**The canvas is the pickups' canvas.** #45 makes 24×24 the icon's size on screen — three-quarters
of Alois — which was shown standing on real pedestals from the game camera before anything was
committed, per the billboards note in `CLAUDE.md`. The icon is drawn untinted; the tint the
placeholder disc still wears for an item with no art yet is what marks the gap.

**Composed from source, like Alois and the bosses.** `tools/art/authoring/items.mjs` draws each
icon from a small raster kit (discs, lines, rects, a grid stamp) and `npm run art:items` writes
`assets/sprites/common/characters/item-<id>.png`; `tests/art/items-authoring.test.ts` holds the
PNGs byte-identical to the source and checks palette, canvas and the hard ink edge — a painted
pixel on the canvas border fails, which is why every drawing keeps one pixel of margin. #55's
"a Kellerassel belongs in the editor" argument does not apply: fifty-one small drawings in one
language *is* the repetition problem composing solves.

**Batches, not a big bang.** Ten items per round, each round shown before it lands; the loader
keys `item-<sprite>` the way it keys `pickup-<id>`, and `PedestalView` falls back to the disc for
an item not yet drawn — `CLAUDE.md`'s content-gap shape, so the roster can ship half-drawn
without a broken pedestal. An icon the round found doubtful (the tuba, the belly) is redrawn in
the next batch rather than committed on a shrug.

## 86. The Promille gate moved inside the run, and the flip stays a simulation event

**Decided:** M7/M8, #236 (item of #228). **Builds on:** #85 (the gate itself, and the sober run
it creates), #51 (a boss defeat commits to the save the moment it happens), #48 (replays are a
seed plus an input log and nothing else).

The gate was `bossDefeated: 2` — Der Stier. Against the seven-floor plan that is the end of
chapter two of seven; against the two-floor game M9 actually ships it is the end of the *game*.
A first-time player therefore finished the whole thing and was then told, on the results screen,
that the mechanic `docs/GAME_DESIGN.md` §5 calls "the mechanic that makes Kellerbier its own game
rather than a reskin" had just unlocked. For most itch.io visitors that was the only playthrough,
so the signature system shipped effectively switched off.

**Floor 1's boss, not "the first boss defeated".** Both survive M10 unparking; the floor number is
the one that stays a single field in `content/progression/unlocks.ts`, and `app/promille-gate.ts`
reads it back out of the unlock's own condition (`promilleUnlockFloor`) rather than writing it
down a second time. Moving the gate again is still a data change. #85's teaching argument is
untouched: a new player still spends a whole floor sober learning to move and shoot.

**The flip is the sim's, and that is what keeps determinism free.** The obvious implementation is
the app noticing the save changed and reaching into the run. That would make a replay's outcome
depend on the save of whoever is watching it — precisely the divergence `ActiveRunSave.
promilleUnlocked` exists to prevent. Instead `GameSim` takes a `promilleUnlockFloor` run parameter
and flips itself in `step`'s room-clear branch, on the tick a boss room on that floor becomes
clear. The flip is then a pure function of the run's own state, so the same seed and the same
input log flip at the same tick, and *nothing new has to be recorded*: `promilleUnlockFloor` is
derived from the already-recorded `promilleUnlocked` flag (`resolvePromilleUnlockFloor`), so
neither `ActiveRunSave` nor `ReplayRecord` grew a field and no migration was needed.

**An arrival, not a notification.** The unlock now happens mid-fight-cleanup instead of on a
screen built to explain things, so it brings its own beat: a banner
(`render/promille-unlock-hud.ts`), the same `ui-unlock-fanfare` the results screen plays, the HUD
row appearing (which re-stacks the column — the eternal-heart row's precedent), and **a full Maß
on the floor**. The last one is the part that is easy to leave out and is not optional: a meter
that appears empty and then waits on a ~2% per-kill drop weight to move for the first time is an
announcement, not an arrival, and the whole point of moving the gate inside the run is that the
player gets to *use* the mechanic on the floor they have left.

**What deliberately did not change.** `promilleUnlocked: false` is still the sim's default-off
switch for everything the mechanic touches, and the boss's own drops on the unlocking tick still
roll the `sober` half of their tables — the run was sober right up to that line, and rolling it
the other way would have made a drop table depend on an event later in the same tick. The dev
override's `sober` now pins a run's *start* rather than the whole run; that is not a lost
capability so much as an honest one, since the sober game is floor 1 now and nothing past floor
1's boss is a state the shipping build has.

## 87. Promille is drained by mistakes, not by the clock — and the reward is drawn on the shots

**Decided:** M8, #311 (item of #228). **Builds on:** #17 (the meter), #92 (Trinkfest and the
penalties), #85/#236 (the gate, and moving it inside the run), #4 (graceful degradation as a
policy — this is its opposite case: a number that degraded so gracefully nobody noticed it did
nothing).

The mechanic the design doc calls the reason this is not a reskin could not be reached. Measured
on `main`: `decayPerSecond: 0.05` took **3.0 Promille a minute** while a cleared room paid back
about **0.09** (2.3 kills at ~1.8% `mass-half`, plus a ~12% room-clear roll). Sixteen to thirty
times more went out than came in, so no amount of drinking moved the meter and every tier above
Nüchtern was a debug-slider state. A scripted bot that walks to every Maß it sees peaked at
**0.50 Promille** across six seeds — literally one half-Maß, landing exactly on the Angeheitert
boundary and decaying back out on the next tick.

**The drain is the mistake, not the clock.** `docs/GAME_DESIGN.md` §5 always listed four ways down
— time, Wurst, water, *being hit* — and only the clock was ever implemented, which is the whole
bug in one sentence: the meter was drained by something the player cannot play against. Now a hit
costs `hitPromilleLoss` (0.4) in `applyPlayerDamage`, the one chokepoint every landed hit passes
through, and the clock is a slow bleed (0.006/s) sized to sit *under* what a floor drops. The
result is a meter that behaves like a combo counter: the damage a player is carrying is a
statement about how well they are playing, and a mistake takes it away twice over.

**A flat cost per hit, not a proportional one.** A graze costs exactly what a maul does. Scaling
it with damage would make the meter a second health bar with the same shape as the first, and the
thing being punished is *getting hit*, not getting hit hard.

**Beer was paid for out of the coins, not out of `null` and not out of the Wurst.** Tripling the
Maß weights while leaving every `null` alone keeps a promilled run and a sober one dropping
something exactly as often — `tests/content/sober-run.test.ts` gates on that, and #85's "the real
game with a feature missing" complaint works in both directions. Taking it from Biermarken rather
than Wurst means the trade a drinking run makes is money for beer, which is the trade it should
be making.

**A half-Maß is 0.6, not 0.5.** The arithmetic half was exactly `ANGEHEITERT_AT`, so the pickup
bought one tick of the tier it was meant to reach. A drink has to clear the boundary it is for.
Trivial, invisible in the code, and worth the third of the measured improvement it accounts for.

**The reward had to go where the player is already looking.** Every penalty was on screen and the
payoff was in a stat panel. `promilleShotHeat` ramps from 0 sober to 1 at the Umgfalln threshold
and `render/projectiles.ts` spends it on three things at once: the instance colour (multiplied
*into* the item tint, so a Spezi's brown shot goes hot brown rather than generic flame), one
additive glow layer, and the point light each shot already carried. Deliberately shaped unlike
its neighbouring ramps — it starts at zero Promille rather than at a tier boundary, because the
damage bonus does too, and a shot that looked identical until Beduselt would be hiding the thing
it exists to show.

**Heat is a property of the frame, not of the shot.** Baking it in at spawn was the other option
and is worse: a shot fired sober would stay cold while crossing a room the player got drunk in,
which reads as a rendering bug rather than as history. One player means one meter.

**One glow layer, not one per sprite.** The halo always wears the base player sprite even for a
burning or poisoned shot — a flame shape, not a second copy of the status art — which caps the
whole effect at exactly one extra shader program (`docs/DECISIONS.md` #80; the room-crossing gate
counts those).

**What the measurement says afterwards.** The same six seeds, the same bot: 100% Nüchtern and a
0.50 peak before, against 54% Nüchtern / 23% Angeheitert / 17% Beduselt / 6% Vollrausch and a 3.23
peak after. The bot dies on floor 1 in most of them, which is the right shape: the meter climbs
with survival rather than with the clock. `PlaytestOutcome.peakPromille` was added for this — the
tier distribution says where the meter *lived*, and "was the top of the ladder reachable at all"
is a different question.

## 88. The raisins got a pool, and the purity pacts got a price

**Decided:** M8, #237 (item of #228). **Builds on:** #166 (the tag, the pacts and the
strip-and-ban behaviour), #299 (the 139 → 51 cut), #310 (the item icon language), #24 (the run's
own premise).

`docs/GAME_DESIGN.md` §2 says the run is about a raisin that got into the beer. The item pool
contained one raisin. Three quality-3 items existed whose entire cost — or entire payoff — was a
restriction on a set of size one: Reinheitsgebot 1516 (+50% damage for locking out an apple cake
whose own text reads "Permanently Range -15%"), Sudordnung 1493 (+65% for that plus four soft
drinks), and Der Rosinenklauber, which protects the set and so was strictly the worst of the
three. Measured across 4,000 simulated two-floor runs of eight offers: **16.1%** were offered a
`rosinen` item at all.

**#166 was not wrong.** It landed the system — the tag, the pacts, the hooks, the strip-and-ban —
correctly and completely. What did not land was the content the system exists to serve, and that
is a failure mode with no test to catch it, because every unit test about a mechanic passes
whether the mechanic has one member or fifty. `tests/content/rosinen-pool.test.ts` is the gate
that was missing: pool size, which pools the tag reaches, the measured offer rate, and how much of
each pool the pacts actually lock out.

**Ten items, and the shape is §8's, strictly.** A clean item plus an upgrade plus one legible
cost, never hidden and never delayed. Several are deliberately among the strongest things in the
roster — that is the line the whole mechanic hangs on, and one mediocre apple cake did not deliver
it. Rumtopf (+80% damage, and nothing at all below Vollrausch) and Rosinenschnaps (+45% damage,
and every kill pours you another one) are the two that make a purist actually hesitate; #311 is
what made the second one's cost mean something, since a Promille meter nobody could move was not a
currency anything could be priced in.

**The costs are stats, never reach.** Two of the ten were drafted paying in Range — Rosinenschnecke
as `orbiting` shots at Range -55%, Semmelknödel as `arcing` at Range -40% — and both softlocked
about 25 of 30 fuzz seeds. The reason is the same for both and worth writing down: *an item that
removes reach can make a room unwinnable*, and a boss room it cannot finish is a run that ends
there rather than a build that plays differently. They became `homing` at -20% damage and a
slow-but-heavy shot at -40% Shot Speed. Damage and Shot Speed can go as low as the design likes;
Range is the one axis where the drawback can stop being a drawback and start being a wall.

**The pacts were re-priced against the pool that now exists**, not the one that was imagined:
+50% → +35% for 1516, +65% → +50% for 1493, the 15-point gap between them kept because it is what
the four `impure` items are worth. The lockout costs ~1.25 offers a run now (76.8% of runs see at
least one raisin, up from 16.1%), including two quality-3 items — so taking a pact early, with a
whole run to spend the damage on and the pool mostly unseen, is good; taking one on floor 2, or
onto a raisin build already assembled, is not. That is the decision the item was always described
as being.

**The icons are one batch in #310's language, and the raisin is drawn identically on all of them.**
The tag is a fact about an item rather than a judgement about it (§8), so it should be the same
fact every time: `raisins()` in `tools/art/authoring/items.mjs` is a shared helper for exactly
that reason, and a player learns the dot once.

## 89. No dodge roll. The answer to pressure is the meter, and the retreat bot is dead

**Decided:** M8, #239 (the last item of #228). **Builds on:** #229/#230/#231/#232 (the pressure
pass), #20 (no mouse aim), #46 (the fixed touch layout), #48 (the recorded input frame), #311 (the
Promille rework), #309 (the difficulty relief pass).

The question #239 exists to answer once instead of five times by accident: **should Alois have a
dash, roll, parry or block?** Every roguelite called "tight" in the last decade has one, and it is
usually the thing people name when they say a game feels good. Alois's whole verb list is Fire,
Bomb, Use, Map, Pause.

**The verdict is no.** Not deferred — decided, with a named trigger to reopen it.

### The premise did flip, and that is why this had to be answered rather than assumed

#239's original argument was that a dodge is an answer to a threat you cannot walk away from, and
Kellerbier had not yet taken walking away off the table. That is no longer true. #228's own
regression check was the retreat bot — "a scripted bot that does nothing but back away from the
nearest enemy and fire at it survived a floor-1 tour untouched … when it can no longer clear a
room unharmed, the pressure pass has worked."

Re-run after #229–#232, 24 seeds, the `cautious` playtest profile (engage range 110, retreat
margin 36, panics under 45% health — a retreat-and-fire bot by construction):

```
24 runs: 0 cleared floor 1 untouched, 21 died on floor 1, mean floor-1 damage 5.6 half-Wurst
```

Zero, from "untouched every time". The cheap escape is off the table, so the honest version of the
question is now live: **does the player have an answer to the pressure they are now under?**

### They do, and it is not a movement verb

Three answers, all already in the game, and the pressure pass is what made two of them matter:

1. **Positioning is a real answer now.** Every charge in the roster is linear and telegraphed
   (#233 gave telegraphs a shape rather than one shared ring), so stepping out of a line is a
   skill the game rewards. It was not a skill before, because nothing was ever *in* a line with
   the player who was walking backwards anyway.
2. **The committed, costly, high-risk verb is the Maß.** #311 turned Promille into exactly the
   emotional beat a dodge roll provides — a deliberate, expensive commitment that trades safety
   for power — except it is a build decision held across a whole floor rather than a button
   pressed in a panic. Drinking to Vollrausch is +120% damage against a wobbling aim and a
   knockdown one Maß away, and a hit costs Promille, so playing well is what holds it. Adding
   i-frames on a button would blunt the exact risk that mechanic was just built to create.
3. **Bombs and active items are the panic buttons the design already has.** `ActiveItemHud`,
   charging and `useActiveItem` all exist; a charge-and-release defensive active is the same beat
   as a dash and costs no input-layer change at all.

### And the bill has not got smaller

A dash still touches: the recorded input frame's byte layout (#48's replays), rebinding, gamepad,
the fixed touch layout (#46), the accessibility suite, Promille's drift and momentum — a committed
dash under Vollrausch is a design problem of its own — and every enemy telegraph in the roster,
since a dash changes what "dodgeable" means for all of them. #309 had to spend a whole pass
walking difficulty back after the pressure pass overshot; adding player power on top of that
would mean re-tuning the roster a third time in one milestone.

Isaac remains the proof by example: no dodge, and tight, because its rooms are dense and its
enemies close. That is now true here too.

### When to reopen

One trigger, and it is a sentence a real player says, not a metric: **"I could see the hit coming
and I had nothing to do about it."** That is the complaint a dodge answers and nothing else does.
If #159's playtest loop surfaces it — as opposed to "it's hard now" or "I died a lot", which are
the pressure pass working — reopen this immediately, and open the implementation issue naming the
input-frame, replay, rebinding, gamepad, touch, accessibility and Promille consequences up front.

The measurement is kept rather than quoted: `tests/playtest/retreat-bot.test.ts` fails if the
retreat bot ever walks through floor 1 untouched again. A number that lives only in a decision doc
rots quietly, and this one is load-bearing for the verdict above.

**What this verdict is not backed by:** a human playtester. The retreat-bot number is a
measurement of the *premise*, not of how the game feels in hands that did not tune it; #159 is
what closes that gap, and it is deliberately not blocked on this decision. Recording the verdict
now is the point — the argument is the artefact, so that the next person to have this idea finds
it rather than re-deriving it.

## 90. The dispatch-depth guard is leak-proof now, and 64 is what a real 25-item build needs

**Decided:** M8, #314. **Builds on:** #26/#27 (the item hook dispatch system and its budget),
#30 (the synergy fuzz harness), #84 (nested dispatch from inside a hook, `docs/DECISIONS.md`'s
sibling note in `sim/systems/items.ts`'s own doc comment), #237 (the roster growth that made the
symptom louder).

`npm run fuzz` had been red on `main` long enough that the number it reported stopped being
information: 4,080 of 10,000 combinations failing with the same message. Two bugs, stacked. The
real one: `MAX_DEPTH` (8) is a guard against a hook re-entering the dispatch system too deep, and
`beginDispatch`/`endDispatch` are hand-paired at eleven call sites with no `try`/`finally` — so a
hook that legitimately tripped the guard threw *before* its matching `endDispatch` ran, and every
frame above it on the call stack did the same on the way out. The dispatch depth is module-level
state (`depthSlot`), deliberately shared across every `GameSim` the fuzz harness builds in one
process for the reasons #26's own doc comment gives — so one real trip left the counter stuck
raised, and every combination that ran afterwards inherited it. 4,079 of the 4,080 were never real
failures at all; they were one crash's shadow.

**The fix is `try`/`finally` at all eleven dispatch sites**, wrapping the `forEachHeld` call so
`endDispatch` always runs, however the dispatch — or anything nested inside it — exits.
`GameSim`'s constructor also calls the new `resetItemDispatchState()` unconditionally, on top of
that: belt and braces, because "module-level state shared by a long-lived process" is exactly the
shape of bug that comes back, and a one-line reset at the one place every sim is born is cheap
insurance against whatever the next version of it looks like.

**That alone took 4,080 down to 80 — and 80 was still real, just wrong to gate on.** Every one of
the 80 was the same message, `nested more than 8 deep`, and 77 of them were 25-item combinations.
`MAX_DEPTH`'s original comment assumed "real nesting is two deep — a hook spawns, the spawn
dispatches" — true for *one* spawner item, which is what #84 was written against. It stops being
true once a build can hold several different spawner items at once (Spezi, Braumeister-Visier,
Braumeister-Hammer and others are all spawners now): each one's spawn dispatch can land on a
held item whose own hook spawns again, and that chain nests once *per spawner in the build*, not
twice total. A 25-item roster makes holding several of them simultaneously the unsurprising case,
not the edge one.

Measured by running the guard with progressively higher ceilings against the full, deterministic
10,000-combination sweep (same seeds every time): 11 crashes remained at a ceiling of 16, 1
remained at 24 and again at 32 (the same seed both times), and 0 remained at 48 and at 64. The
one seed that needed more than 32 is a 25-item build stacking `braumeister-hammer`,
`braumeister-visier` and `braumeister-schuerze` together with several other spawners — a real,
finite chain, not a runaway: every ceiling tested completed the full sweep in about the same
40 seconds, so this was never an infinite loop hiding behind a low bound. `MAX_DEPTH` is now 64 —
comfortable headroom above the worst case this roster produces today, while still catching what
the guard actually exists to catch: a hook that is *unboundedly* re-entering itself, not a
large-but-finite fan of legitimately spawning items. `tests/unit/item-hooks.test.ts`'s #314
regression tests pin the leak-proof behaviour without hardcoding the exact ceiling, so a future
roster that needs the number raised again does not also need to touch those tests.

`npm run fuzz` on `main` now reports zero crashes and zero non-finite values across all 10,000
combinations — the nightly job (`.github/workflows/fuzz.yml`) going red again will mean something.

## 91. Being drunk takes your sight, not your camera — and the blur is a framebuffer copy, not a render target

Promille's headline penalty was **camera sway**: the whole frame drifting in a slow 12-pixel
circle, always, from the first sip. It was the effect that made the mechanic read as drunk at a
glance, and it was the wrong one.

A moving frame is a nausea generator. `docs/GAME_DESIGN.md` §5 already knew half of this — it has
required a sway accessibility toggle since #33, on exactly the grounds that "motion sickness is a
real accessibility issue, not an optional nicety." What the guardrail missed is that a slider
does not help the player it is written for: someone who starts feeling ill ten minutes into a
roguelite does not diagnose it, open a settings screen and find the camera-sway row. They stop
playing, and they do not say why. A default that needs a setting to be comfortable is a default
that is wrong.

### What replaced it

Sway is cut to a quarter (`maxSway` 12 → 3) rather than removed — a slow, small drift still says
"this run is drunk" and no longer says it loudly enough to be the reason someone quits. Its job
went to two penalties that take something away without moving anything:

- **`promilleTunnelVision`** — the vignette's clear radius closes with the meter. Shaped exactly
  like the sway ramp it replaces (a straight ratio of the value, starting at the first sip, not
  at a tier boundary), because it is inheriting sway's role and a first Maß that costs nothing at
  all is a first Maß the player does not feel.
- **`promilleGloom`** — the world pass, blurred and drained of colour, from Beduselt up. Later
  than the tunnel on purpose: a blur reads far stronger than a narrowing, and Angeheitert is the
  design doc's "sweet spot", so it pays peripheral vision and keeps a readable room.

Both are unbounded ramps whose renderers decide how far past `1` they will draw, like
`maxScreenDistortion` and `maxShotHeat` before them — and both bottom out at the deepest the
meter can actually be driven (7.0 Promille, `promilleCapFor` at `TRINKFEST_MAX`) rather than at a
round number, so nothing is left unspent below a value no player will ever reach.

**The HUD is never blurred, and that is what makes the strength affordable.** The murk is the last
thing `GameView.render` draws; the HUD, the vignette and every toast are the UI pass `app.ts`
draws over it. A player who cannot read their own health bar is looking at a bug, not at a
difficulty setting.

**Accessibility moved with it.** The two new penalties carry *no* simulation-side scale, unlike
`swayScale`/`driftScale`/`wobbleScale`. Those exist because sway, drift and wobble move something
the player is aiming with; sight is drawn and never simulated, so the softening lives in
`Vignette.setReducedMotion` and `GameView`'s own `REDUCED_MOTION_GLOOM` — render-side, per #41,
where it cannot make a reduced-motion run step differently from a full one. Softened rather than
switched off, for the reason `app/settings.ts` gives about damped screenshake: with sway a
whisper, these two *are* the meter's visual language now, and a toggle that removes information
is not an accessibility toggle.

### The tunnel closes by growing the frame, not by shrinking the sprite

The obvious way to tighten a vignette is to scale its quad down. It does not work here: the
vignette follows the *player*, not screen centre, and a quad small enough to be a tight tunnel is
too small to still cover the screen corners once camera-follow (#100) has the player off centre —
the uncovered corner reads as a hole punched in the dark. Compositing a fill behind it does not
fix that either; a backdrop at the same alpha double-blends everywhere the gradient is already
opaque, so the seam moves rather than disappearing.

What works is the opposite move. The quad keeps its full `COVERAGE`, and the sprite reads a
`Rectangle` frame **larger than the texture**. The same 512 pixels of gradient are squeezed into a
smaller part of the quad, and every sample outside them lands past the texture's own bounds —
where `ClampToEdgeWrapping` returns the border texel, which the generated gradient makes fully
opaque all the way round. So the fill outside the tunnel is the same pixel the gradient ends at,
at the same alpha, by construction: no seam, no second sprite, no extra draw call. It is also
free most frames, since the frame only changes when the aperture actually moves and Promille
drifts by 0.006 a second.

### The blur copies the framebuffer, because a render target costs every shader in the game

The natural way to blur a frame is to render the world into a `WebGLRenderTarget` and sample it.
That is exactly the trap `GameView.warmSceneryGroup`'s own doc comment describes from the other
side: three keys a material's program on the colour space it writes into, and a non-XR render
target is always the working (linear) space while the canvas is sRGB. Routing the world through a
target would compile a complete second program set — and, if the target were only used while the
player was drunk, it would compile it *mid-run*, on the frame someone crossed into Beduselt.
That is the blocking `linkProgram` #80 and `tools/perf/room-crossings.mjs` exist to prevent.

`copyFramebufferToTexture` sidesteps the whole question. The world draws to the canvas exactly as
it always has; the finished 640×360 frame is copied into a `FramebufferTexture` with one GPU-side
`copyTexSubImage2D`, and a single clip-space quad draws it back through a 13-tap tent, blended at
an alpha the ramp sets. One extra program, linked at boot alongside everything else
`GameView.render` compiles on its first frame — the crossing gate still reports zero links after
the first crossing, at 26 programs against a ceiling of 40.

Measured rather than eyeballed: horizontal edge energy over the middle of the frame drops from
3.03 sober to 1.87 at 4.4 Promille, and holds at 2.93 with `maxGloom` set to 0 at the same
Promille — so the softening is the blur doing its job, not the vignette's darkening being
mistaken for one.

### The follow-up: they will hit you sober

The first playtest answered the question the paragraph this replaces left open, and the answer was
that legible penalties are not the same as felt risk. Three changes came out of it.

**The curves are weighted toward the top.** "More at higher Promille, not more everywhere" cannot
be had from a straight line — raising the ceiling on a linear ramp raises the first sip in the
same proportion. Both renderers now bend their ramp with the same `lateBias(t) = t * (0.6 + 0.4t)`
before spending it, which weights the back half about 1.7x the front. That bought
`CLOSED_APERTURE` 0.49 → 0.34 and the blur radius 3.2 → 4.6 internal pixels with Angeheitert
landing within a pixel or two of where it already was. Deliberately not `t²`, which would make
the first Maß free — the reason the tunnel ramp starts at the first sip rather than at a tier
boundary is that a drink the player cannot feel is a drink that did not happen.

**A bigger hitbox was built, and then taken back out — "easier to hit" was figurative.** Worth
recording because the reasoning that produced it is seductive and wrong. The argument was: every
penalty in this entry costs the player his *senses*, none of them changes how often the room
connects, so a good player can drink to the top of the meter and keep not being hit — reward real,
risk atmosphere. `promilleHurtboxScale` grew the player's hurtbox from `PLAYER_FOOTPRINT` (5, the
one hurtbox in the game deliberately smaller than its sprite) to `PLAYER_RADIUS` (7, the size he is
drawn) and it worked exactly as designed.

It was still the wrong mechanic, because the premise is false. A drunk run *already* gets hit more,
and not by accident: the player cannot see far, cannot see clearly, and is carrying up to triple
damage — which is an invitation to play further forward — so he reads the room later and commits
harder. The penalties above are not only atmosphere; they are the difficulty, working through the
player rather than through his collider. Adding a hitbox handicap on top charges twice for the same
idea, and it charges in the one currency §5's guardrail protects: a hit the player cannot see
coming is a hit he will not believe was his. **A design that already produces the outcome does not
need a mechanic that also produces it** — and "the risk is not felt" is a brief to make the
existing penalties bite harder, which is what the curve change above actually is, not a brief to
add a new one.

**And a hit now sobers harder than a meal.** `hitPromilleLoss` 0.4 → 0.7. There are two ways down
the meter and they are meant to read differently — eating is a choice made with a pickup in front
of you, a hit is a mistake the room made for you — and the mistake being the *cheaper* of the two
made the meter a worse readout of how well a run was going than it looked. A full Wurst has always
taken 0.5, so 0.4 was quietly the wrong way round for the whole life of the mechanic. Nothing
noticed because nothing compared the two numbers; `promille.test.ts` now does, against the largest
`PickupEffect.promille` on the roster rather than against a hardcoded 0.5, so a new pickup cannot
re-break it.

Together the tighter curves and the heavier drain make the meter self-limiting instead of a
ratchet: the drunker the run, the more it gets hit — by the design, not by a handicap — and the
more it gets hit the more sober it becomes. The fantasy is the right one: you feel indestructible
and the room disagrees.

## 92. The Sixpack banks Promille, and a Maß is *offered* to items before it is drunk

**Decided:** the risk/reward playtest pass. **Builds on:** #26/#32 (item hooks and the beer-pickup
hook), #85 (Promille machinery in a sober run), #91 (the risk/reward pass this is the answer to).

Promille is a meter you cannot bank. A Maß on the floor is worth whatever it is worth *the moment
you walk over it*, so a player at 4.2 has to leave beer lying there or fall over, and one who has
just been knocked back to sober by a hit — which #91 made much more likely — has nothing to climb
with until the floor drops another. §5's whole risk/reward argument is a decision about how drunk
to be, and until this item the player could only make that decision at the instant a pickup
happened to be under their feet. The Sixpack is that decision, unhooked from the pickup: bank six
Maß through a floor you want to fight sober, cash them in on the boss.

### The hook had to fire before the beer, not after

`onBeerPickup` already existed (#32's Konterbier) and storing a Maß from it was tried first. It is
a real bug, not merely inelegant: that hook runs *after* `addPromille`, so a carrier intercepting a
Maß at 4.4 Promille would have to un-drink one the player had already fallen over from. Umgfalln
is not a number you can put back.

So `onBeerOffered` is its own hook, fired before the drink, and it uses the claim-a-flag shape
`onLethalDamage` established: hooks are broadcast to every held item and a broadcast has no single
answer to return, so a hook calls `GameSim.claimOfferedBeer` and the engine reads the flag once
dispatch is done. `offerBeerToItems` owns the reset-dispatch-read sequence rather than leaving the
reset to its caller, which is the one thing the `blutwurzActive` version of this pattern gets
wrong and is worth not repeating.

Two consequences fall out of the ordering, and both are the point:

- **`onBeerPickup` does not fire on a stored Maß**, because no beer was drunk. Konterbier must not
  clear a Kater off a bottle that went into a carrier.
- **The toast is decided by the offer too.** The offer moved *above* `reportCollected`, not merely
  above `addPromille`: "Maß — Raises Promille" over a meter that did not move is exactly the kind
  of thing a player reports as a bug. It reads "Stored, not drunk", which deliberately does not
  name the Sixpack — the hook is open to any item that banks beer, and a toast naming one of them
  goes stale the moment a second exists.

### Three rules that keep the item simple

- **It stores Promille, not bottles.** A half Maß fills 0.6 of a slot. Counting bottles would
  upgrade every half Maß to a full one for free the moment you picked the carrier up.
- **A Maß that does not fit is drunk, not split.** No partial deposits. The pack is full, so you
  drink it, exactly as you would without the item — which is also the whole answer to "what
  happens when it is full", and the least surprising one available.
- **The charge bar is not a cooldown.** `maxCharge` is 1 and `state.charge` is a plain readiness
  flag kept up whenever there is anything to pour. The limit on this item is how much beer the
  room has handed out, which is a resource already on screen; a bar that filled on its own would
  be a second, invisible economy competing with it.

### It gets a HUD row, and gives up its status line for it

Six containers you read the *shape* of beat a fraction you read the digits of — the same argument
`HealthHud` already makes for drawing Wurst instead of "6/6". So `render/sixpack-hud.ts` is a row
of six bottles under the active-item slot, appearing and disappearing with the item (and taking
its row gap with it, like the Promille bar in a sober run). The item therefore declares **no**
`ItemStatusReader`, unlike most items whose effect is a counter: two rows counting the same
bottles is worse than one, and the roster's "every item is visible while held" rule is met by the
better of the two readouts rather than by both.

### The name is the user's, and so is every Bavarian word

This item shipped as "Sechsertragerl" for about ten minutes. It was proposed as *the Sixpack*, and
renamed on the strength of `CONTENT_BIBLE.md` §0's "item names stay Bavarian in all locales" —
which was the wrong call twice over: the rule is a style guide, and the person it is written for
had already chosen. The bible and `CLAUDE.md` now both say the harder thing outright: **do not
invent or substitute Bavarian and German names.** Ask, and use exactly what comes back, including
when the answer is an English word. A plausible-looking invention is worse than a plain English
placeholder, because it reads as authentic to everyone who cannot check it.
