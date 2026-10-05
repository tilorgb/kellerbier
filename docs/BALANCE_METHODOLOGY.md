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
avg ticks/avg damage, the same split by kind of room within a floor (#368 — ordinary rooms,
mini-boss, boss, and where runs ended), item win-rate outliers, and Promille tier usage across
the sweep.

**Playtest telemetry** (`app/telemetry/`, opt-in, anonymous — `docs/DECISIONS.md` #70) is real
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
  single-item isolation runs. The second now exists — `PLAYTEST_ITEMS=1 npm run playtest`, §7 —
  and is the table to read for a single item; the loadout table above stays a crash gate's
  by-product.
- **Adding or removing an item re-rolls every loadout, so win rates do not compare across a
  roster change.** `LOADOUTS` is drawn from `ITEM_DEFINITIONS` by a seeded combination generator
  (`tests/playtest/run.test.ts`), so a 62nd item does not add one run to the sweep — it changes
  which items every drawn combination contains, and the whole sweep plays out differently. The
  Sixpack landing moved the sweep's win rate from 50% to 27.5% on the same seeds, and that number
  is not evidence about the Sixpack: it is forty different runs. Compare win rates only between
  commits with the same roster; across a content change, the sweep is a crash gate and nothing
  more.
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
- Above ~35% and the last boss stops being a wall — a run that is won most of the time has nothing
  left to come back for. (This bullet used to lean on Promille being granted for beating Der
  Stier; #236 moved that unlock to floor 1's boss.)

**This is not yet validated against real play** — it is the deliberate target the tools in this
document exist to check a real playtest round against, per #54's own acceptance criterion ("a
band that was chosen deliberately and written down"), not a claim that floors 1-2 currently land
in it. §5 below is where that gets checked once real telemetry exists.

The simulator's own sweep win rate (40.0% at commit `abd1ff5`, `playtest/results.json`) is
**not** a read on this band — it deliberately includes a zero-item baseline loadout precisely to
stress-test the floors at their hardest, which no real run plays through unmodified. It is a
regression signal (did this change make the floor harder for a bot with nothing), not a proxy
for the band above.

## 4. Targeted balance work — status against #54's own scope bullets

| Scope bullet | Status |
|---|---|
| The difficulty curve across two floors, no spike | **Failing: the curve falls instead of rising** (#368). Bot and human evidence agree — see §6. A first tuning step is in; its effect is unmeasured until it has been played. |
| Item win-rate outliers, across the pool | **Four outliers found by the bot** (§7): Spezi and Colaweizen far above the pack, Steinkrug and Hendlgeruch far below. Bot evidence on 16 runs an item; none has been confirmed or dismissed by a person yet, and real telemetry has too few pickups to say anything. |
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

**No observed round has been run.** `docs/PLAYTEST_PROTOCOL.md` §7 makes that an explicit
prerequisite for the rest of this document's targeted-tuning rows, not an oversight — update this
section (and re-check §4's table) the moment a round's findings are triaged.

What exists instead is the first unobserved telemetry: **10 runs from two sessions** (the report on
#54, 2026-10-02), some of them the maintainer's own. That is enough to notice one thing (§6) and
far too little for anything else in §4: 7 of 51 items were ever held, each in one or two runs, and
Promille reads 77% Nüchtern / 20% Angeheitert / 3% Beduselt off a handful of runs.

## 6. The curve falls where it should rise (#368)

**Human runs** (10, see §5): all 8 deaths are on floor 1 and none on floor 2. Floor 1's boss took
2950 ticks on average, floor 2's 824.

**Simulator** (400 runs — `PLAYTEST_SEEDS=40 npm run playtest` — before the tuning below), per
run that reached each kind of room:

| Floor | Rooms | Runs | Ended here | Avg ticks | Avg damage taken |
|---|---|---|---|---|---|
| 1 | normal | 400 | 38 (10%) | 1835 | 1.2 |
| 1 | miniboss | 379 | 107 (28%) | 1020 | 2.0 |
| 1 | boss | 252 | 72 (29%) | 794 | 1.4 |
| 2 | normal | 179 | 18 (10%) | 2040 | 0.6 |
| 2 | miniboss | 168 | 41 (24%) | 601 | 1.9 |
| 2 | boss | 120 | 8 (7%) | 800 | 0.4 |

What that says:

- **Floor 1's two gates are where runs end.** The mini-boss stops 28% of the runs that reach it
  and the boss 29%; ordinary rooms 10%.
- **Floor 2's boss is the easiest gate in the game** — 7% — and deals a third of the damage floor
  1's does. The last fight should not be that.
- **Floor 2's ordinary rooms do half the damage floor 1's do** over the same time.
- **Floor 2's mini-boss holds up**: 24%, and it hits as hard as floor 1's in less time.

**The nightly sweep's forty runs are too few to read this from.** The first version of this
table was built on them and said Der Stier ended no run at all and that floor 2's ordinary rooms
ended none either; at four hundred both are plainly wrong. Forty runs put two or three
run-enders either way on any row. Read rows off the wide sweep, not the nightly one.

Read it with one caveat: the runs on floor 2 are the ones that survived floor 1, which in this
sweep means the ones that drew a stronger loadout. Some of floor 2's gentleness is that
filter, not the floor. It does not explain a boss that ends no run at all, and the human runs —
which pick items up as they go — show the same shape.

### The first tuning step, and what the simulator could not say about it

Both directions, a small step each (#368): floor 1's two mini-bosses eased — Der Rattenkönig
keeps one rat fewer alive, Die Zapfhahn-Orgel's widest fan loses a shot — and Der Stier hardened
without being lengthened: a shorter warning, a faster charge, a shorter stun, for him and for the
disarmed Maibaum-Dieb. Floor 2's ordinary rooms were left alone on purpose:
`content/floors/definition.ts` records that adding bodies there was tried, played and rejected.

**The simulator cannot tell these numbers from the old ones.** On the same 400 runs, floor 1's
mini-boss row went from 107 run-enders to 106 and Der Stier's from 8 to 10 — noise. Variants
twice as strong (a charge at 3.3 after a 20-tick warning; a rat every 170 ticks instead of 120)
moved them to 11 and 101, which is no more than that. The bot kites at range and does not react to a telegraph, so how long a
warning lasts or how wide a lane is does not change what happens to it. What ends its runs at a
gate is mostly how much health it arrives with.

So this step is **checked for breakage, not for effect**: the sweep still runs without a crash,
the retreat bot still cannot walk floor 1 untouched, and `tests/content/boss-pacing.test.ts`
still holds every fight to its cycle count. Whether floor 1 now feels fairer and Der Stier now
feels like a last boss is a question for a person playing it, and then for telemetry — the
"Runs by build" table (`tools/telemetry/README.md`) is what separates runs before this change
from runs after it.

## 7. Items, one at a time

`PLAYTEST_ITEMS=1 npm run playtest` plays every item **on its own** against a run with no items
at all, on the same seeds and both skill profiles (`tests/playtest/items.test.ts`). That is a
paired comparison: what differs between an item's row and the baseline is the item and nothing
else, which is what §2's loadout table could never offer. It writes `playtest/items.md`.

The measure is **rooms cleared**, not win rate. A bot holding one item almost never wins and
neither does a bot holding none, so win rate is mostly a column of zeros. How far a run got moves
for an item that helps a little and for one that hurts. An item is flagged when it sits two
standard deviations or more from the rest of the pool — "outside the expected band" measured
against what the other items do, because nothing else says what an item is meant to be worth.

### First run (commit `78b3834`, 16 runs an item)

Empty-handed, the bot clears 13.7 rooms, reaches floor 2 half the time and wins 6%.

| Item | Rooms vs none | Reach floor 2 | Win | What it is |
|---|---|---|---|---|
| Spezi | +9.0 | 94% | 63% | A second shot on every shot |
| Colaweizen | +8.5 | 94% | 75% | Shots stick and slow; −20% damage |
| Hendlgeruch | −7.8 | 0% | 0% | Pulls distant enemies toward you |
| Steinkrug | −9.4 | 0% | 0% | Shots splash on impact |

- **Spezi and Colaweizen each turn a 6% bot into a 60–75% one, alone.** For Spezi that is
  plausible on its face: it doubles the shots. Colaweizen is the more surprising one — a slow
  is worth far more to a bot that kites than its −20% damage costs.
- **Steinkrug kills its own holder.** Every one of its 16 runs died on floor 1, half of them in
  ordinary rooms. Against a single target at range it deals exactly what no item deals, so the
  mug itself is not weak. Its splash is centred on the enemy it hits and spares only that enemy —
  every other splash item in the game spares the player instead — so shooting something that has
  closed to melee range costs Alois health. Whether that is intended is a design question; the
  item's description does not mention it.
- **Hendlgeruch is a pure downside for anything that fights at range**, which is what its
  description says it does. Whether an item that only hurts belongs in the treasure pool is the
  question, not whether the number is wrong.

### Second run, and the first item pass (2026-10-04)

At 40 runs an item the top of the table was Steckerlfisch, Colaweizen, Spezi, Bierbank and
Sauwetter, each winning 50–63% of runs alone against 3% empty-handed. Reading the items for why
turned up three causes, and all three were changed:

- **Shot damage was rounded to a whole number, and the base is 1.** So a "Damage −20%" gave 0.8
  and rounded straight back to 1: Bierbank, Colaweizen and the Braumeister-Schürze (−30%) fired at
  full damage, and the Schürze's three shots were triple damage. Damage is fractional now and
  health is a float, so a stated penalty is the penalty. The same rounding had been flattening
  Promille: Angeheitert's +25% rounded to nothing and Beduselt's +60% rounded up to +100%. Both
  now land as written, which is a real change to how drinking pays and wants playing.
- **Burn and poison dealt 6 damage per application** against ordinary enemies of 2–5 health, so
  one burning hit was a kill. Both now deal 3.
- **The strongest were also the commonest.** Spezi and Steckerlfisch moved from quality 1 to 2.

Colaweizen's slow was halved to 45 ticks as well, which the bot does not notice: it is still
longer than the gap between two shots, so a target under fire stays slowed.

The same sweep afterwards: Steckerlfisch 55% → 33%, Sauwetter 53% → 40%, the Schürze 38% → 23%.
Colaweizen stays at 63% and is now the clear top of the table. Bierbank reads 55% and Spezi 35%
where both were in the fifties — neither is believable as an effect (Spezi was not touched), and
together they are a fair measure of this table's noise at 40 runs: about ten points either way.

### What this table cannot say

- **It is the bot's opinion.** The bot holds a range and circles (§6). An item that rewards
  getting close, timing, or a decision — and anything that needs Promille, which the bot never
  drinks — is undervalued here by construction.
- **Sixteen runs.** Enough to see ±8 rooms, not ±2. Rows in the middle of the table are not
  ranked against each other; only the flagged ones mean anything. `PLAYTEST_ITEMS=20` runs twenty
  seeds for a closer look.
- **Alone is not how items are met.** The point of the item system is combinations
  (`docs/GAME_DESIGN.md` §8). An item that is ordinary alone and absurd beside another does not
  show up here; the fuzz harness looks for crashes in combinations, and nothing yet measures
  their strength.
