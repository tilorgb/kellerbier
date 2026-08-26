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

## Closing issues from a PR

`CONTRIBUTING.md` already says this, but it's easy to miss under a title that merely *mentions*
the issue number (`"Multi-cell room camera-follow (#100)"`) instead of actually closing it: the
PR **body** needs a real keyword — `Closes #N`, `Fixes #N`, or `Resolves #N` — or the issue stays
open after merge. After merging a PR meant to close an issue, it's cheap to double-check with
`gh issue view <N> --json state` rather than assume the merge did it.
