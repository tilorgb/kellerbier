# Kellerbier — Balance Methodology

#54 asks for two floors balanced against data rather than opinion, and names the higher-leverage
half of that up front: **the balance simulator turns a balance change from a week of playtesting
into an afternoon.** This document is the other half — how the simulator, real playtest
telemetry, and a documented methodology fit together, and the decisions that come out of running
them once, honestly, rather than assumed.

It depends on `docs/PLAYTEST_PROTOCOL.md`: #54's own notes say to run at least one full round of
sessions before tuning starts, because telemetry says *that* players die in a particular room and
only watching them says *why*. See §5 for where that round stands today.

---

## 1. Two tools, two kinds of evidence

**The balance simulator** (`tests/playtest/`, `npm run playtest`) is a scripted bot playing a
sweep of seeds, starting loadouts and skill profiles through real, generated floors 1-2 —
fast, deterministic, free of a human's time, and blind to anything it wasn't told to do (it
never shops, never reads a Promille meter, never notices a Maibaum is interactive). It answers
*"does this change break anything, and roughly how hard is each floor for a scripted baseline"*
cheaply enough to run on every tuning idea. `tools/playtest/report.mjs` formats its
`playtest/results.json` into a report: win rate overall and by skill, per-floor attempts/deaths/
avg ticks/avg damage, item win-rate outliers, and Promille tier usage across the sweep.

**Playtest telemetry** (`app/telemetry/`, opt-in, anonymous — `docs/DECISIONS.md` #67) is real
players' real runs: how each run ended, deaths by floor and best-effort cause, item pickups, room
clear times, and Promille tier ticks. It answers what the simulator structurally cannot — whether
a *human*, with human judgement and human mistakes, finds the same floor hard for the same
reason, and whether the mechanics the bot skips (Promille, items found rather than pre-granted,
detours) hold up. `tools/telemetry/dashboard.mjs` aggregates whatever exported `.json` files a
person has been handed (per `docs/PLAYTEST_PROTOCOL.md`) into the same shape of report.

Neither replaces the other. The simulator is what makes a tuning pass fast; telemetry is what
makes it honest about what floors 1-2 actually ask of a person, not a bot.

## 2. Reading the simulator's report without being misled by it

Two caveats are load-bearing enough to repeat here, not just in the code comments where they
live (`tests/playtest/lib/harness.ts`, `tests/playtest/lib/report.ts`):

- **Item win-rate rows are not yet a clean per-item signal.** Every item in one drawn
  loadout combination shares that combination's whole result — an 8-item loadout that wins
  reports all eight of its items at the same inflated rate, whether or not any single one of
  them was doing the carrying. With #54's small, CI-sized sweep (a handful of combinations, not
  a real per-item isolation test), an outlier row is a lead to check by hand, not a verdict. The
  honest fix is either many more combinations than a per-commit CI budget allows, or dedicated
  single-item isolation runs — both are future work, not something this pass claims to have
  solved.
- **The bot never touches Promille.** It paths to the boss and fights; nothing about the
  simulator sweep drinks, eats, or otherwise raises the meter, so its own Promille tier usage
  table is not evidence about tier balance — only real telemetry is. The field is carried through
  the sweep anyway so the report has something to print once that changes.

What the sweep *is* good evidence for: whether a change crashes anything (the one thing CI gates
on — `tests/playtest/run.test.ts`'s own doc comment explains why nothing else does), and the
rough shape of per-floor attrition for a baseline bot, which is a useful sanity check even though
it is not a claim about human difficulty.

## 3. The win-rate band

**Chosen deliberately: a full, organically-built run (a real player picking up items as they
go, not a fixed pre-granted loadout) should win 20-35% of the time for a player who has learned
the game's core loop** — roughly a skilled `reckless`/`cautious`-equivalent human, not a first
attempt. This is a genre-standard band for a roguelike-lite where death resets meaningful
progress (`docs/GAME_DESIGN.md` §1's "risk you choose" pillar wants losing to sting), picked over
either extreme:

- Below ~20% and most runs end before the player has seen enough of a build to feel like their
  own decisions mattered — losing reads as the game's fault, not a fair fight.
- Above ~35% and Der Stier stops being the wall M7's own sequencing note wants him to be — the
  "first unlock is Promille itself, granted for beating Der Stier" design leans on the boss
  actually gating something.

**This is not yet validated against real play** — it is the deliberate target the tools in this
document exist to check a real playtest round against, per #54's own acceptance criterion ("a
band that was chosen deliberately and written down"), not a claim that floors 1-2 currently land
in it. §5 below is where that gets checked once real telemetry exists.

The simulator's own sweep win rate (17.5% at the time of writing, `playtest/results.json`) is
**not** a read on this band — it deliberately includes a zero-item baseline loadout precisely to
stress-test the floors at their hardest, which no real run plays through unmodified. It is a
regression signal (did this change make the floor harder for a bot with nothing), not a proxy
for the band above.

## 4. Targeted balance work — status against #54's own scope bullets

| Scope bullet | Status |
|---|---|
| The difficulty curve across two floors, no spike | No spike in the current sweep (floor 2's per-attempt damage/death rate reads *gentler* than floor 1's — see `playtest/results.json`), but floor 2's sample is small (8 of 40 runs reach it) and this is bot evidence, not human evidence. Recheck once §5's round exists. |
| Item win-rate outliers, across the 120+ pool | Infrastructure ready (`itemWinRates` in the simulator report, `dashboard.mjs`'s item table from real telemetry); §2's confound means the simulator alone cannot close this out yet. Needs either isolation sweeps or real telemetry volume. |
| Promille tier usage | Infrastructure ready (`promilleTierTicks` end to end, from `app/telemetry/tracker.ts` through the dashboard); the simulator cannot answer this at all (§2) — this is telemetry-only, and needs real runs to have anything to report. |
| Boss attempt counts and completion rates | Covered by `docs/DECISIONS.md` #66's own boss-pacing work (health tuned against the authored cycle, `tests/content/boss-pacing.test.ts`) — the sim-level half is already done; real attempt/completion rates are what the telemetry dashboard's per-floor table gives once boss-room runs accumulate. |
| Run length and win rate | §3 above sets the deliberate target; not yet checked against real play. |

**Every row that says "needs real telemetry" is the same dependency #54's own notes name:**
this pass ships the instrumentation and the methodology, honestly, rather than a set of tuning
numbers backed by evidence that does not exist yet. Once `docs/PLAYTEST_PROTOCOL.md`'s first
round has run and been triaged, re-run `npm run playtest`, collect the round's exported telemetry
files, run `node tools/telemetry/dashboard.mjs <files...>`, and revisit every row in this table
against real numbers.

## 5. Where the first playtest round stands

Not yet run. `docs/PLAYTEST_PROTOCOL.md` §7 makes this an explicit prerequisite for the rest of
this document's targeted-tuning rows, not an oversight — update this section (and re-check §4's
table) the moment a round's findings are triaged.
