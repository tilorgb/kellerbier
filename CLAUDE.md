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

## Closing issues from a PR

`CONTRIBUTING.md` already says this, but it's easy to miss under a title that merely *mentions*
the issue number (`"Multi-cell room camera-follow (#100)"`) instead of actually closing it: the
PR **body** needs a real keyword — `Closes #N`, `Fixes #N`, or `Resolves #N` — or the issue stays
open after merge. After merging a PR meant to close an issue, it's cheap to double-check with
`gh issue view <N> --json state` rather than assume the merge did it.
