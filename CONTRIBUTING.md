# Contributing to Kellerbier

Written down once, while the project is small, so that nobody has to ask.

---

## The short version

1. Branch from `main`, named `feat/<issue>-<slug>` or `fix/<issue>-<slug>`.
2. Make the change. Run `npm run lint && npm run typecheck && npm run test`.
3. Open a pull request. CI posts a **playable preview link** on it.
4. **Play the change**, on that link, before asking anyone else to.
5. Merge when the gate is green and the definition of done for that kind of work is met.

---

## Branches

| Prefix | For |
|---|---|
| `feat/` | new behaviour, from a `feature` or milestone issue |
| `fix/` | a bug, from a `bug` issue |
| `chore/` | tooling, dependencies, CI, docs |
| `spike/` | a throwaway experiment, never merged |

Include the issue number: `feat/13-impact-feel`. Six months later the number is the only
thing that will still tell you why the branch existed.

## Commits

Conventional-ish prefixes — `feat:`, `fix:`, `perf:`, `refactor:`, `test:`, `docs:`, `ci:`,
`chore:` — then a short imperative summary.

The body is where the value is. **Say why, not what.** The diff already says what changed; it
cannot say what you tried first, which of two defensible options you picked, or what you found
out while measuring. A commit that explains its reasoning is the cheapest documentation this
project will ever get, and the only kind that is guaranteed to still be accurate.

Close issues from the pull request body (`Closes #13`), not from individual commits.

## Pull requests

- One issue per pull request wherever it is possible. Where it is not — because two issues
  genuinely cannot demonstrate their own acceptance criteria apart — say so in the body.
- Fill in the acceptance criteria from the issue, ticked, with a word on how each was checked.
- Say what you found while building it, especially anything you got wrong. A pull request that
  reads as though the first attempt worked is a pull request that has hidden its most useful
  half.
- Keep the diff to the thing the issue asked for. If you find something else broken, fix it in
  its own change, or say plainly in the body why it had to ride along.

## Review

Small projects do not need heavyweight review, but they do need someone to have *played* the
change. For anything with the `feel` or `gameplay` label, that is the review: open the preview
link and play it. A diff cannot tell you whether a dodge feels like a commitment.

---

## Definition of done

Work is done when the row for its kind is fully true. Not when it works on your machine.

### Engine — `engine`, `perf`, `infra`

- [ ] Unit-tested, including the failure mode the code exists to prevent
- [ ] Allocation-checked if it runs in the frame loop, and marked `@hot` if it does
- [ ] Inside its budget in `docs/TECH_STACK.md` §3, measured rather than assumed
- [ ] Lint-clean, including the architecture rules
- [ ] The non-obvious decision is written down — in the code if it is local, in
      `docs/DECISIONS.md` if it constrains anything else

### Gameplay — `gameplay`, `feel`

- [ ] Playable in the preview build, by someone who did not write it
- [ ] **Tuned by feel, not by theory.** Expect to spend longer on the numbers than on the code
- [ ] Every constant lives in `src/sim/tuning.ts` and can be changed at runtime
- [ ] Inspectable in the debug overlay — if you cannot see it, you cannot tune it
- [ ] Deterministic: same seed and same input log, same run

### Content — `content`, `design`

- [ ] Schema-valid, and validated by the content test suite
- [ ] Authored as **data**, with no engine change required to add the next one
- [ ] Passes the synergy fuzz harness without a crash, a NaN or an outlier
- [ ] Names and text follow the rules in `docs/CONTENT_BIBLE.md`
- [ ] Localisation keys resolve in every locale

### Art — `art`

- [ ] On-palette, and packed into the floor's atlas
- [ ] Legible at the internal resolution, against the floors it appears on
- [ ] No batch-breakers: no per-sprite filters, no blend-mode changes
- [ ] Silhouette reads at a glance — in a bullet hell the player sees shapes, not detail

### Audio — `audio`

- [ ] Wired through the impact audio seam rather than triggered from a system
- [ ] Mixed against the loudest thing it will ever play under
- [ ] Has an off switch that reaches zero

---

## Labels

**Milestone**, exactly one: `M0`–`M9`.

**Type**, one or more:

| Label | For |
|---|---|
| `engine` | the simulation, ECS, collision, pooling |
| `gameplay` | rules and systems the player interacts with |
| `feel` | how something *feels* — movement, impact, response |
| `content` | items, enemies, rooms, floors, text |
| `art` | sprites, atlases, palette, effects |
| `audio` | music and sound |
| `tooling` | editors, harnesses, generators, the debug overlay |
| `perf` | budgets, benchmarks, optimisation |
| `infra` | CI, build, release, dependencies |
| `design` | balance and design decisions |
| `a11y` | accessibility |
| `epic` | a body of work with sub-issues |
| `roadmap` | the generated tracking issue. Do not edit it by hand |

**Report** labels are applied by the issue templates: `bug` and `feature`.

Colours and descriptions live in [`tools/labels/labels.json`](../tools/labels/labels.json), and
are applied by the **Labels** workflow — from the Actions tab, or automatically when the scheme
changes. Adding a label is a reviewable change to that file rather than a click in a settings
page nobody else can see. Run `node tools/labels/apply-labels.mjs --dry-run` to see the scheme.

---

## Reporting a bug

**Attach the seed.** In a procedurally generated game a bug report without one is frequently
unactionable — nobody can reach the room you were standing in.

Press `F1` to open the debug overlay and `C` to copy the run's identity to the clipboard. Paste
that into the report. Once replay recording lands (#48) attach the replay file too, and the bug
becomes reproducible on any machine, exactly, every time.
