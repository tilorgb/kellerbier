import { describe, expect, it } from 'vitest';
import { ITEM_DEFINITIONS } from '../../src/content/items/index.js';
import { SKILL_PROFILES, type SkillProfile } from './lib/bot.js';
import { runPlaytest } from './lib/harness.js';

/**
 * The retreat bot, kept as a regression check — #228 asked for exactly this.
 *
 * The epic's evidence for "nothing in Kellerbier can hurt a player who keeps
 * walking" was a scripted bot that does nothing but back away from the
 * nearest enemy and fire at it: it *"survived a floor-1 tour untouched, and
 * took 50 seconds over a three-enemy room"*. The epic then named the
 * condition for its own pressure pass being finished: **"when it can no
 * longer clear a room unharmed, the pressure pass has worked."**
 *
 * `cautious` is that bot without having to write a second one — engage range
 * 110, retreat margin 36, panics under 45% health, holds its distance and
 * fires. Measured after #229-#232 landed, over 24 seeds: zero cleared floor 1
 * untouched, 21 died on it, mean floor-1 damage 5.6 half-Wurst.
 *
 * This is also the standing evidence behind `docs/DECISIONS.md` #89 (no dodge
 * roll), whose whole argument turns on backing away no longer being a
 * complete answer to the game. A number that lives only in a decision doc
 * rots quietly; this is the version that fails when it stops being true.
 *
 * Kept out of `npm run test` with the rest of `tests/playtest/**` — a dozen
 * scripted floor-1 runs is slow by design, and this runs beside #54's own
 * sweep, nightly and on demand.
 */

/** The retreat-and-fire bot, by construction — see this file's own doc comment. */
const RETREAT_BOT: SkillProfile = SKILL_PROFILES.cautious ?? {
  name: 'cautious',
  engageRange: 110,
  retreatMargin: 36,
  panicHealthFraction: 0.45,
};

/** Enough seeds that one lucky floor cannot carry the result, few enough to stay a minute of runtime. */
const SEEDS = Array.from({ length: 12 }, (_, index) => 200 + index);

/**
 * How many of those runs may clear floor 1 without being touched before this
 * fails. One, not zero: the floor generator can produce a genuinely thin
 * floor, and "backing away is still a *correct* answer to some rooms" is
 * #229's own acceptance criterion — this is a gate on the dominant strategy,
 * not a ban on retreating.
 */
const MAX_UNTOUCHED = 1;

describe('the retreat bot no longer walks through floor 1 (#228, #239)', () => {
  it('cannot clear floor 1 without taking a hit', () => {
    const untouched: number[] = [];
    let damage = 0;
    for (const seed of SEEDS) {
      const outcome = runPlaytest({
        seed,
        skill: RETREAT_BOT,
        items: ITEM_DEFINITIONS,
        loadoutItemIds: [],
      });
      const floorOne = outcome.floors[0];
      damage += floorOne?.damageTaken ?? 0;
      // Only a run that actually *got past* floor 1 unharmed counts. A run
      // that died on it took damage by definition, and a `stuck` run never
      // finished the floor, so neither is evidence either way.
      if ((floorOne?.damageTaken ?? 0) === 0 && outcome.floorsReached > 1) {
        untouched.push(seed);
      }
    }
    process.stdout.write(
      `\nretreat bot — ${String(untouched.length)}/${String(SEEDS.length)} cleared floor 1 untouched, mean floor-1 damage ${(damage / SEEDS.length).toFixed(1)}\n`,
    );
    expect(
      untouched.length,
      `the retreat-and-fire bot walked through floor 1 untouched on ${untouched.length === 0 ? 'no seeds' : `seeds ${untouched.join(', ')}`} — the pressure pass has regressed (#228)`,
    ).toBeLessThanOrEqual(MAX_UNTOUCHED);
  }, 600_000);
});
