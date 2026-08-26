# Lessons for a TypeScript/React component library

This doc is not about Kellerbier. It is a set of notes, written for a different team (mine, at
work) that builds a TypeScript/React component library for other product teams to consume. I
went looking through this repo for engineering practices, tooling choices and small mechanisms
that would transfer to that context, even though the two projects share almost no code-level
overlap — this one is a PixiJS bullet hell with a custom ECS, that one is a React design system.
It lives in `docs/` because that's where this project's documentation lives, not because it's
documentation *of* Kellerbier; skip it if you're here to work on the game.

Every section names the file it came from, so you can go read the real thing instead of trusting
my paraphrase.

---

## 1. Enforce architecture with a lint rule, not a review comment

The single load-bearing rule in this codebase is "`src/sim/` never imports `src/render/`"
(`docs/DECISIONS.md` #2). It isn't a convention anyone remembers to check for — it's a
`no-restricted-imports` config keyed off file path
(`tools/eslint/architecture.js`), with a matching `no-restricted-globals` ban on `window`,
`document`, `Date`, etc. inside the same files. The rule's own doc comment says why: *"the
erosion is invisible in code review — the diff always looks like a small convenience."*

**For a component library**, the equivalent boundary violations are just as invisible in a diff:
a "primitives" package reaching into an app-specific context provider, a headless/logic package
importing something DOM-only and breaking SSR, a component quietly importing a raw color instead
of a token. All are one-line diffs that look harmless. `no-restricted-imports` (with `patterns`,
which supports globs) catches every one of these for free — it ships in `eslint-plugin-import` /
core ESLint already, no custom rule needed for the import-boundary case.

The second half of the lesson: **the lint rule set is tested like source code.**
`tests/lint/architecture.test.ts` runs the real ESLint config against fixture files that are
*deliberately* broken, and asserts both that the violation fires and that the message explains
*why*, not just what. That test suite is what makes "we have an architecture rule for that" a
verified claim instead of a hopeful one — someone editing the rule can't silently break it
without a red test.

## 2. A decision log that is append-only, not a wiki page

`docs/DECISIONS.md` records architectural decisions with a strict rule: **entries are never
edited once written.** A decision that turns out to be wrong gets a *new* entry that supersedes
the old one, because "the reasoning that led to the wrong answer is usually the most useful thing
on the page." Each entry also states what it **constrains** — what future work has to work around
because of this choice — which is the part a Slack thread never captures.

A component library accumulates exactly this kind of decision and loses it just as fast: why
compound components over a `render`-prop API, why a given component doesn't forward `ref`, why a
prop got deprecated instead of removed, why CSS-in-JS was rejected for vanilla-extract. A team
that writes these down — and doesn't rewrite history on them — stops re-litigating the same
argument every 18 months when the person who made the call has moved teams.

## 3. Tokens as one small file, injected once, on purpose not-Tailwind

`src/dev-ui/tokens.ts` is a single exported string of CSS custom properties
(`--kb-color-surface-0`, `--kb-radius-sm`, …) plus an `injectDevUiTokens()` function that appends
a `<style>` tag exactly once, guarded by a module-level flag, so any dev tool can call it on boot
without tracking whether another tool already did. The file's own comment explains the choice
explicitly: *"Plain CSS custom properties, not Tailwind: these tools are a handful of `<style>`
blocks each, not a design surface large enough to earn a build step."*

Two transferable pieces here, one obvious and one not:

- The obvious one: a token file is a *contract*, kept separate from anything that consumes it, so
  every consumer (in Kellerbier's case, two unrelated dev tools) reaches for a variable instead of
  re-deriving a hex value by eye.
- The less obvious one, and worth sitting with: **the scale of the tool should earn the size of
  the solution.** This project judged its dev-tool surface too small for Tailwind. A component
  library almost certainly *has* earned Tailwind/vanilla-extract/Style Dictionary/whatever — but
  the discipline of asking the question explicitly, in writing, rather than defaulting to the
  heaviest tool available, is the actual lesson, not "don't use Tailwind."

## 4. Live-bound controls, and "copy only what changed"

`src/debug/tuning-window.ts` is a debug panel of sliders bound directly to the live tuning
objects the simulation reads — move a slider, the next tick uses the new value, no reload. That
alone is Storybook's Controls addon, already familiar territory. The part worth stealing outright
is the **"copy changed" button** (`changedValuesAsSource` in the same file): it diffs the live
values against the shipped defaults, and copies to the clipboard *only the fields that moved*,
formatted exactly the way the source file (`sim/tuning.ts`) declares them — ready to paste over
the defaults, comment included (`// was 4.2`).

> ```
> movement:
>   maxSpeed: 5.6, // was 5
>   ticksToStop: 24, // was 18
> ```

For a token/theme playground this is directly reusable: let someone drag sliders or swap swatches
against your live token set, and instead of a JSON blob of *everything*, hand back a minimal diff
in the exact shape your theme-override file expects. "A dump of every field is a diff nobody can
read" (the file's own words) — the point of a live-tuning tool is finding the two or three values
that were wrong, and the output should match that.

## 5. "Covered by tests" isn't "done" — a human has to be able to see it

This project's `CLAUDE.md` has an explicit rule that a feature isn't finished "however green the
test suite is" until a person running the dev server can actually see or feel it — a HUD element,
a debug-overlay entry, something that changes on screen. `ActiveItemHud`
(`src/render/active-item-hud.ts`) is called out as the pattern to copy for any new one: a small
component with a `view` and a `sync(sim)` method, wired into `app/main.ts`.

Translate directly: a new component or variant in a component library is not done when its unit
tests are green, if nobody can actually look at it. The equivalent gate is "does it have a story
(or your playground's equivalent) that renders it," and that gate belongs in the definition of
done, not in a reviewer's memory.

## 6. Definition of done, split by *kind* of change

`CONTRIBUTING.md`'s DoD is not one checklist — it's five, keyed by label (`engine`, `gameplay`,
`content`, `art`, `audio`), because "unit-tested" and "tuned by feel, not by theory" are
meaningfully different bars for different kinds of work, and a single generic checklist ends up
either too weak for some changes or too heavy for others (nobody needs to check "deterministic:
same seed, same run" on an art-asset swap).

A component library has the same spread: a new component, a visual/token change, a breaking
prop-API change, and an accessibility fix are not the same shape of "done." A breaking API change
plausibly needs a codemod and a changelog entry with a migration example; a token change needs a
visual-regression baseline update and a design sign-off; an a11y fix needs a screen-reader pass,
not just an axe-core assertion. Worth writing as separate rows in one table, the way this repo
does, rather than one list that's always slightly wrong for the change in front of you.

## 7. PR bots that respect the review thread

Two small scripts, `tools/ci/comment-bench.mjs` and `tools/ci/comment-preview.mjs`, both post a
comment with a hidden marker (`<!-- kellerbier-bench -->`) and both search for that marker before
posting — if found, they `PATCH` the existing comment instead of posting a new one. The comment
in the source says exactly why: *"a PR with fifteen identical bot comments on it is a PR whose
review conversation has been buried by its own infrastructure."* Every size-limit bot,
bundlephobia-style bot, or Chromatic-status bot on a component library repo should do the same —
most third-party ones already do, but a homegrown one won't unless you build it in.

Two more CI habits worth lifting wholesale from `.github/workflows/ci.yml`:

- **The playable preview link is a first-class CI output, not an afterthought** — every PR from
  the same repo gets a link to a real deployed build (a `gh-pages` worktree, one subfolder per PR
  number), because *"a game is judged by feel, and feel cannot be reviewed in a diff."* A
  component library is judged by how it looks and behaves, which a diff also can't show — a
  Storybook/playground preview per PR (self-hosted the way this repo does it, or via Chromatic)
  earns its keep the same way. It's the reason `CONTRIBUTING.md` can say, as a real review step,
  "play the change on that link before asking anyone else to."
- **Performance deltas are measured on one runner, minutes apart, not compared across days.** The
  `benchmark` job in `ci.yml` builds and benchmarks both the PR head *and* its merge base on the
  same GitHub Actions runner in the same job, specifically because a shared runner's absolute
  numbers "move by a third between mornings" and any tolerance band wide enough to absorb that
  noise is too wide to catch a real regression. History across merges to `main` is kept
  separately (`bench/history.jsonl`, appended only on push to `main`, never on a PR branch, "so a
  trend made of pull-request runs is [not] a trend of branches that mostly no longer exist"). A
  bundle-size or render-cost check on a component library should do the same: measure PR-vs-base
  on one runner in one job, and keep the long trend as a separate append-only artifact fed only by
  merges.

## 8. A test pyramid shaped by what actually breaks, not by test *type*

The suite here isn't just "unit tests" — it's four categorically different kinds of test, each
answering a different question `tests/`:

| Kind | Answers | Cadence |
|---|---|---|
| `tests/unit/` | Does this function do the right thing? | every commit |
| `tests/determinism/` | Does the same seed + input log reproduce byte-for-byte? | every commit |
| `tests/content/` | Is every data file (enemy, room, item) structurally valid? | every commit |
| `tests/fuzz/` | Do 10,000 random item combinations survive without crashing, NaN-ing, or producing a wildly outlier run? | nightly + on demand, deliberately **not** on every PR |

The fuzz harness is explicitly excused from gating every PR — `README.md` says it "is slow by
design, and it reports crashes, non-finite stats, softlocks and balance outliers rather than
gating every commit on them." That's a real, deliberate trade: a check too slow to run on every
push should run somewhere, on a schedule, rather than be skipped entirely because it can't be a
merge gate.

The translation for a component library isn't "add fuzz testing" as a literal ask — it's the
shape: pick the two or three categories of failure that matter most (visual regression, a11y
regression, and "does every published prop combination render without throwing/warning") and give
each its own test category with its own cadence, instead of lumping everything into one `test`
script and one CI gate. A nightly job that renders every exported component against a large
random sample of its prop space — flagging thrown errors and console warnings, not diffing pixels
— is a cheap way to catch prop-interaction bugs nobody thought to write a test for, and it's fine
for it to be slow and off the PR-blocking path, exactly like this repo's fuzz harness.

## 9. Custom ESLint rules are cheap, and worth writing your own for a real invariant

`tools/eslint/no-hot-allocation.js` is a from-scratch ESLint rule — no plugin dependency, ~140
lines — enforcing one project-specific invariant: files marked `@hot` may not allocate inside a
function (object/array literals, closures, `.map`/`.filter`/`.slice`, a module-level number
binding). It's exported as a small plugin object (`kellerbierPlugin`) and wired into the flat
config the same way any third-party plugin would be, and — per point 1 above — it has its own
fixture-backed test suite proving every violation shape is actually caught.

The point isn't "write an allocation-banning rule," which is very specific to this game's
performance model. It's that **writing an ESLint rule for a codebase-specific invariant is a
half-day task, not a research project**, and a component library has plenty of candidates that a
generic plugin doesn't cover: "no raw hex/rgb color literals outside the token file," "every
exported component forwards `ref`," "every public prop has a doc comment," "no default export
from a components package." Each is a rule this project's pattern shows how to build, wire in,
and — critically — test, so it stays trustworthy as the codebase changes around it.

## 10. Repo metadata as a reviewable file, not a setting only one person can click

`tools/labels/labels.json` holds the GitHub label scheme (names, colors, descriptions) as data;
`tools/labels/apply-labels.mjs` applies it, run from CI or by hand with `--dry-run` to preview.
`CONTRIBUTING.md` frames this explicitly: *"Adding a label is a reviewable change to that file
rather than a click in a settings page nobody else can see."*

The same shape is worth it for a component library's own metadata that otherwise tends to live in
someone's head or a wiki page: a component-status registry (stable/beta/deprecated, with a
deprecation date and a migration link), an icon manifest, a list of which components have a
finished a11y audit. One JSON file, diffable and reviewable in a PR, applied by a script — instead
of a spreadsheet that drifts the moment the person who maintains it goes on leave.

## 11. Strict TypeScript, called out as non-negotiable

`docs/TECH_STACK.md` §6 lists `strict` mode with `noUncheckedIndexedAccess` on, and says plainly:
*"Non-negotiable."* Worth restating for a library specifically: a library's compiler settings
don't just protect its own source — `noUncheckedIndexedAccess` and strict null checks shape the
`.d.ts` a consumer's own type-checker inherits. Loosening them locally to make the library easier
to write pushes the cost onto every consumer instead of removing it.

## What doesn't transfer, and why it's still useful to have read

Most of this repo's actual performance engineering — zero-allocation frame loops, Structure-of-
Arrays component storage, object pooling, the `bytesPerPass` allocation-measurement harness in
`tests/helpers/allocation.ts` — is real, careful work that has no business in a React component
library. Don't adopt "ban object literals in hot files" as a rule; nothing in a typical component
render loop needs that discipline, and a rule copied without its reason becomes cargo-culting.

The one instinct worth keeping from that part of the codebase, stripped of its specifics: **when
you measure something noisy, measure it several times and trust the most favorable reading only
after you understand *why* the noise exists**, not the first number you saw. `bytesPerPass`
explains, in its own doc comment, exactly why it takes the minimum across rounds instead of an
average, and what that choice costs. If this team ever builds a render-cost or re-render-count
regression test for a genuinely perf-sensitive component (a virtualized list, a canvas-backed
chart), that comment is a better guide to doing it honestly than most blog posts on the topic —
but it's a tool for a rare case, not a default.

## If you only take five things from this

1. An append-only decision log (§2) — cheapest to start, and the one most likely to be missed
   later if it isn't there.
2. One custom ESLint rule, with fixtures and a test, for whichever architecture violation shows up
   most often in review comments today (§1, §9).
3. "Copy changed only" as the export shape for any live theme/token playground (§4).
4. One-comment-edited-in-place for every bot that posts to a PR (§7).
5. Split the definition of done by kind of change instead of running one generic checklist (§6).
