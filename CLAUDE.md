# Agent notes for Kellerbier

Operational guidance for an AI coding agent working in this repo, on any machine. Everything
about branch naming, commits, PRs and definition-of-done lives in
[`CONTRIBUTING.md`](CONTRIBUTING.md) — read that first. This file only covers the parts that
are specific to running as an agent rather than a human at a terminal.

## One git worktree per issue/branch

Do the work for a given issue or feature in its own git worktree, not by switching branches in
whatever checkout you started in. Keep that original checkout sitting on `main`, pulled up to
date, and never switched to a feature branch — so starting work on a different issue never
requires a manual branch context-switch, and multiple issues can be worked in parallel without
their in-progress changes colliding in one working tree.

- Claude Code CLI: use the `EnterWorktree` tool at the start of a new issue/feature task
  (name it after the issue, e.g. `issue-20-xyz`). Use `ExitWorktree` with `keep` to pause work
  on a branch, `remove` once it's merged or abandoned — but only when asked to; don't tear down
  a worktree unprompted.
- Any other tooling: `git worktree add ../kellerbier-issue-N -b feat/N-slug` (or `fix/N-slug`,
  per `CONTRIBUTING.md`'s branch prefixes) from the base checkout, same intent.

## New features need to be visible in the dev app

`CONTRIBUTING.md`'s Gameplay row already says "playable in the preview build" is part of done —
this is the agent-specific corollary: don't consider a feature finished just because it's covered
by tests and reachable by calling a sim method from a script or the console. If a person running
`npm run dev` has no way to see or feel the thing (no HUD element, no on-screen state, nothing
that changes when they play), it isn't actually shipped yet, however green the test suite is.

When a feature has player-visible state, wire it into the dev app in the same change — a HUD
element, a debug-overlay entry, a visible effect in the room, whatever fits. `ActiveItemHud`
(`src/render/active-item-hud.ts`) is the shape to copy: a small `render/` component with a `view`
and a `sync(sim)` method, wired into `app/main.ts` the same way `HealthHud`/`PromilleHud`/
`WalletHud` already are. Before calling a feature like this done, actually run it — `npm run dev`
plus a real interaction (playing it by hand, or a headless-browser script if a human isn't
driving) and look at the result, the same standard `docs/GAME_DESIGN.md` and this project's own
review culture already hold gameplay work to. It's a game: a feature nobody can experience isn't
finished, no matter how thoroughly it's unit-tested.

**"Reachable" means through the real progression, not just through a direct load.** A
`window.__kellerbier.sim.loadRoom(...)`/`sim.step` console call proves the content *renders*, not
that a player *gets there*. A new floor is the concrete recurring case: its tileset, rooms and
roster can be fully wired and still be unreachable in `npm run dev`, because `app/main.ts`'s
`advanceFloor` — the dev-only "next floor" loop off a cleared boss room — only advances up to
`HIGHEST_PLAYABLE_FLOOR`. Adding floor N's content means bumping that constant in the same change,
and then actually walking (or scripting) the real clear-boss-room → next-floor-exit path to confirm
it lands there — not just confirming the new tiles/enemies render when loaded directly. The general
version of this for anything else gated behind its own unlock/progression logic: check that the
gate itself was updated, not only that the content behind it works once reached.

## A content gap degrades gracefully at runtime — and still fails loudly in CI

`docs/DECISIONS.md` #19, from the same "floor 2 froze" incident the "reachable" section above
comes from: a room, a floor, an enemy roster whose content isn't fully authored yet must never
reach a player as a frozen game. Floor 2 shipped with its boss room throwing on floor 2
specifically because its only boss choice was authored `maxFloor: 1`, back when only floor 1
existed — an uncaught exception inside a
door-transition stops the frame loop outright, which a player experiences as a freeze, not an
error message. The schedule still guarantees more of these. Floors 3-7 (#39-#43) are parked in
M10 and will each spend time with room content in place before their full roster lands whenever
they unpark — but the nearer case is now floors 1 and 2 themselves, which spend all of M6-M8
having their content replaced underneath them: sprites swapped for animated ones, rosters
extended with elite variants (#156), a run that gains an actual ending (#155). Content churning
under a shipped floor is exactly the shape this section is about.

When you hit this shape — something *chosen from several authored options* (a `spawnGroups`
choice list is the concrete case today) has no option covering the situation actually
encountered — reach for `sim/room/template.ts`'s `nearestFloorChoice` pattern before inventing a
new one: fall back to the closest authored alternative, log it once via `console.warn` gated
behind `import.meta.env.DEV` (dev builds only, once per distinct gap so a revisited room doesn't
spam the console), and let the run continue. This mirrors `SlotPool`'s pool-overflow policy
(`docs/DECISIONS.md` #4) — a design gap and a capacity gap are both "something the content isn't
ready for," and both get graceful, logged degradation instead of taking the run down.

This is not a license to swallow real bugs. An enemy id that doesn't resolve, a transition to a
state that doesn't exist, a room shape whose cell count is wrong — these stay exactly as loud as
`docs/DECISIONS.md` #7 already made content validation: thrown at compile/construction time,
failing the build. The distinction is whether the *data itself* is trustworthy (a gap: nothing
authored for this case yet) or wrong (a bug: what's there doesn't make sense). Add the runtime
fallback for the former; never add one to paper over the latter. And a graceful runtime fallback
is never a substitute for catching the gap in CI in the first place —
`tests/content/room-floor-eligibility.test.ts` (compiles every room template against every floor
its tags claim it works on) is what should catch this class of gap on a pull request; the runtime
fallback is what protects a player on the rare gap that reaches them anyway.

## New pixel art needs sign-off before it's committed

Whenever a change adds or replaces pixel art — a tile, a character sprite, a projectile, a boss,
anything under `assets/sprites/` — don't just author one version and commit it. Generate a small
set of design options (the Floor 1 tileset went through this as 4 candidate tile designs), show
them to the user, and let them pick before the art lands in a commit. This holds even mid-session,
even for placeholder-tier art: the *pattern/style choice* is what needs sign-off, not the pixel-
perfect execution of it.

**Size is a design choice now, so it is part of what needs sign-off.** Since `docs/DECISIONS.md`
#42 a sprite's canvas is literally its size on screen — a 24×16 character is 24×16 of the 640×360
frame — so picking a canvas is picking how big the creature reads in the room, not just how much
detail it can carry. Don't infer one from what the old art happened to be, and don't let a canvas
grow sideways just because that is where the spare pixels were: show the option on a real floor
tile next to Alois at true scale, and let the size be chosen along with the design.
`tests/content/sprite-scale.test.ts` will catch a silhouette that has drifted away from the
collider it is drawn over, but it is a wide band and a gate, not an art director.

In practice: render the options at a legible scale (upscaled, nearest-neighbour, no smoothing) and
send them as an image rather than describing them in text. If the art has a "how it repeats" or
"how it varies" question — a tileset that mixes several variants across a floor, say — show that
mixed/tiled, not just the individual swatches, since that's what the option actually reads like in
play. Once a direction is picked, iterating within it (fixing a rendering bug, tightening a shape)
doesn't need another round of sign-off — only a genuinely new design choice does.

## Component-library lessons, for work outside this repo

[`docs/COMPONENT_LIBRARY_LESSONS.md`](docs/COMPONENT_LIBRARY_LESSONS.md) is not about Kellerbier
— it's a set of engineering-practice notes mined from this repo for a different project: a
TypeScript/React UI component library. It has no bearing on gameplay, engine or content work
*in this repo*.

The instruction is for the other side of that: whenever an agent is implementing a feature,
fixing a bug, or making a tooling/process decision **on that component library** (not on
Kellerbier), check that doc first for a relevant precedent — an architecture-boundary lint rule,
a decision-log entry, a token/theming pattern, a CI or definition-of-done idea — before designing
one from scratch. If the work turns up a new pattern worth carrying back the other way, add it to
the doc rather than letting it live only in that session's memory.

## Closing issues from a PR

`CONTRIBUTING.md` already says this, but it's easy to miss under a title that merely *mentions*
the issue number (`"Multi-cell room camera-follow (#100)"`) instead of actually closing it: the
PR **body** needs a real keyword — `Closes #N`, `Fixes #N`, or `Resolves #N` — or the issue stays
open after merge. After merging a PR meant to close an issue, it's cheap to double-check with
`gh issue view <N> --json state` rather than assume the merge did it.
