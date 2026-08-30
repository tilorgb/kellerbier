# Kellerbier

> *Wasser, Malz, Hopfen — und Rosinen.*

A Bavarian roguelite dungeon crawler / bullet hell, in the tradition of *The Binding of Isaac*.

**Alois** is at his grandparents' for Sunday lunch, the way he is every Sunday, and he has gone
down to the cellar for another bottle of the good **Pfeitinger**. The crate is empty. The full
one next to it is Pfeitinger too, and the label is wrong: *gebraut nach dem neuen bayerischen
Reinheitsgebot*. Water, malt, hops — and raisins.

Raisins. Here as well. In Opa's beer.

*Trinkt diesen Mist doch selber.* So Alois takes Opa's Trink-Rucksack down off its hook, fills
it with what's left of the tainted crate, switches it from *trinken* to *schießen*, and heads
south to find out who is responsible.

Seven floors from that cellar to the Wiesn, via the Bavarian Forest, the Alps, Neuschwanstein
and a very industrial brewery. Expect Wolpertinger, aggressive swans, a tuba player who shoots
sound rings, and König Ludwig II in a swan boat.

## Status

Pre-production. Design docs are in [`docs/`](docs/); the work is tracked in
[issues](../../issues), grouped by milestone label `M0`–`M10`.

**Current state and what's next: the [roadmap issue](../../issues?q=is%3Aissue+label%3Aroadmap)**,
regenerated automatically from the issue list on every issue event.

## Documentation

| Doc | What's in it |
|---|---|
| [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md) | Pillars, story, run structure, the Promille mechanic, economy, meta-progression |
| [docs/CONTENT_BIBLE.md](docs/CONTENT_BIBLE.md) | Floors, enemy rosters, bosses, item seeds, naming and tone rules |
| [docs/TECH_STACK.md](docs/TECH_STACK.md) | Engine choice, performance architecture and budgets, project layout, testing |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Milestones M0–M10 and what "done" means for each |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Architectural decisions and the reasoning behind them |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Branches, commits, the definition of done, labels, bug reports |

## Tech stack

TypeScript · Vite · PixiJS v8 (WebGL/WebGPU) · custom fixed-timestep ECS · Vitest · deployed as a static web build.

Built performance-first: Structure-of-Arrays entity storage, object pooling, zero allocation
in the frame loop, spatial-hash broadphase. Target budget is **5,000 active projectiles and
200 enemies at a locked 60 fps**, enforced by a CI benchmark. See
[docs/TECH_STACK.md](docs/TECH_STACK.md) for the reasoning.

## Development

```bash
npm install
npm run dev        # Vite dev server with hot reload
npm run test       # Vitest — headless simulation and content-validation tests
npm run bench      # performance budget, run on its own so the timings mean something
npm run fuzz       # synergy fuzz harness — 10,000 item combinations, nightly + on demand
npm run lint       # ESLint, including the architecture rules, plus Prettier
npm run typecheck  # tsc --noEmit
npm run build      # production static build
```

**Controls:** `WASD` to move, arrow keys to aim and fire. `T` opens the tuning
window — every feel constant on a slider, changed while the game runs. `O` opens the debug
overlay — frame graph, entity and pool counts, draw calls, hitboxes (`H`) and the spatial-hash
grid (`G`). Middle-drag pans the camera, `0` recentres, `C` copies the run's seed and tick for
a bug report. `B` cycles the Promille gate (#85) between following your save, forcing a sober
run and forcing a promilled one, and restarts on the same seed — dev builds only, since in a
release build it would hand a player the mechanic the unlock exists to make them earn. (Plain letters rather than F-keys or punctuation — a hosted preview's browser
chrome claims F-keys as its own shortcuts, and punctuation-row keys can land on a dead accent
key on a non-US keyboard layout.)

**Room editor:** with `npm run dev` running, open `/editor.html` to author room templates —
grid, palette, metadata, inline validation, browse/duplicate, and a live in-engine playtest of
the room you're editing. Dev-only; see `docs/TECH_STACK.md` §6.

## Continuous integration

Every push and pull request runs typecheck, lint, the full test suite, the performance budget
and a production build. Pull requests from this repository also get a **playable preview link**
posted as a comment — a game is judged by feel, and feel cannot be reviewed in a diff.

The **synergy fuzz harness** — 10,000 randomised item combinations played headless against the
scripted enemy roster — runs nightly and on demand (`.github/workflows/fuzz.yml`), not on every
pull request: it is slow by design, and it reports crashes, non-finite stats, softlocks and
balance outliers rather than gating every commit on them.

## A note on tone

This is affectionate parody, not advertising. Alcohol is a core mechanic, which puts the
game at roughly PEGI 12–16 — that is a deliberate choice, not an accident. No real brewery
trademarks, logos or brands appear anywhere in this project; see the naming rules in
[docs/CONTENT_BIBLE.md](docs/CONTENT_BIBLE.md).

## License

TBD before first public release.
