import { describe, expect, it } from 'vitest';
import {
  type UnlockCondition,
  bossStatKey,
  floorHeldTierStatKey,
  itemSetStatKey,
  mostTaggedStatKey,
  STAT_DEEPEST_TIER,
  STAT_KILLS,
  STAT_MOST_BEERS,
  STAT_MOST_PASSIVES,
  STAT_RUNS,
} from '../../src/app/meta/definition.js';
import { CHARACTERS } from '../../src/content/characters/index.js';
import { ITEM_SET_DEFINITIONS as ITEM_SETS } from '../../src/content/item-sets/index.js';
import { ITEM_DEFINITIONS } from '../../src/content/items/index.js';
import { ITEM_UNLOCKS } from '../../src/content/progression/item-unlocks.js';
import { GameSim } from '../../src/sim/game/sim.js';
import { PromilleTier } from '../../src/sim/game/promille.js';
import { ITEM_POOLS } from '../../src/sim/item/definition.js';
import { selectItemOffer } from '../../src/sim/item/pool.js';
import { ItemRegistry } from '../../src/sim/item/registry.js';
import { Rng } from '../../src/sim/rng/rng.js';
import { DEFAULT_ITEM_POOL_TUNING } from '../../src/sim/tuning.js';

/**
 * The item-unlock roster (#503) as content: every entry names a real item, a
 * goal a player of the current build can actually meet, and a fresh save's
 * pools still hold enough to play with once all of them are out.
 *
 * The reachability half is the "a gate nobody updated" failure `CLAUDE.md`
 * warns about, in this feature's shape: an item locked behind a floor that
 * does not exist, a character nobody can pick, or a set whose pieces are
 * themselves locked is an item nobody ever sees again.
 */

/** `app/main.ts`'s `HIGHEST_PLAYABLE_FLOOR` — repeated for the reason `characters.test.ts` gives. */
const HIGHEST_PLAYABLE_FLOOR = 4;

/** Below this many open items, a fresh save's room of that kind risks standing empty. */
const MIN_OPEN_PER_POOL = 3;

const LOCKED = new Set(ITEM_UNLOCKS.map((entry) => entry.itemId));
const OPEN = ITEM_DEFINITIONS.filter((item) => !LOCKED.has(item.id));
const REGISTRY = new ItemRegistry(ITEM_DEFINITIONS);

/** The run-feat statistics `statAtLeast` may name — anything else is a typo nothing ever writes. */
function knownStatistic(stat: string): boolean {
  const fixed = [STAT_KILLS, STAT_RUNS, STAT_DEEPEST_TIER, STAT_MOST_BEERS, STAT_MOST_PASSIVES];
  if (fixed.includes(stat)) {
    return true;
  }
  for (let floor = 1; floor <= HIGHEST_PLAYABLE_FLOOR; floor++) {
    if (stat === bossStatKey(floor) || stat === floorHeldTierStatKey(floor)) {
      return true;
    }
  }
  return (
    ITEM_SETS.some((set) => stat === itemSetStatKey(set.id)) ||
    ITEM_DEFINITIONS.some((item) =>
      (item.tags ?? []).some((tag) => stat === mostTaggedStatKey(tag)),
    )
  );
}

function floorOf(condition: UnlockCondition): number | null {
  if (condition.kind === 'bossDefeated') {
    return condition.floor;
  }
  if (condition.kind === 'bossFeat') {
    return condition.floor;
  }
  for (let floor = 1; floor <= 7; floor++) {
    if (condition.stat === bossStatKey(floor) || condition.stat === floorHeldTierStatKey(floor)) {
      return floor;
    }
  }
  return null;
}

describe('item-unlock roster (#503)', () => {
  it('names real items, each once, each with a goal', () => {
    const ids = new Set(ITEM_DEFINITIONS.map((item) => item.id));
    for (const entry of ITEM_UNLOCKS) {
      expect(ids, entry.itemId).toContain(entry.itemId);
      expect(entry.goal.length, entry.itemId).toBeGreaterThan(0);
    }
    expect(LOCKED.size).toBe(ITEM_UNLOCKS.length);
  });

  it('gates every item on something the shipped game can produce', () => {
    const offered = new Set(CHARACTERS.map((character) => character.id));
    for (const { itemId, condition } of ITEM_UNLOCKS) {
      const floor = floorOf(condition);
      if (floor !== null) {
        expect(floor, itemId).toBeLessThanOrEqual(HIGHEST_PLAYABLE_FLOOR);
      }
      if (condition.kind === 'statAtLeast') {
        expect(knownStatistic(condition.stat), `${itemId}: ${condition.stat}`).toBe(true);
      }
      if (condition.kind === 'bossFeat' && condition.feat.kind === 'asCharacter') {
        // A character benched by #205 is a goal nobody can meet — that item
        // stays open until the character comes back.
        expect(offered, itemId).toContain(condition.feat.character);
      }
    }
  });

  it('never asks for something only a locked item could provide', () => {
    for (const { itemId, condition } of ITEM_UNLOCKS) {
      if (condition.kind !== 'statAtLeast') {
        continue;
      }
      for (const set of ITEM_SETS) {
        if (condition.stat === itemSetStatKey(set.id)) {
          for (const member of set.members) {
            expect(LOCKED.has(member), `${itemId} needs ${set.id}, whose ${member} is locked`).toBe(
              false,
            );
          }
        }
      }
      const tag = [...new Set(ITEM_DEFINITIONS.flatMap((item) => item.tags ?? []))].find(
        (candidate) => condition.stat === mostTaggedStatKey(candidate),
      );
      if (tag !== undefined) {
        const openTagged = OPEN.filter((item) => (item.tags ?? []).includes(tag)).length;
        expect(
          openTagged,
          `${itemId} needs ${String(condition.value)} open ${tag} items`,
        ).toBeGreaterThanOrEqual(condition.value);
      }
      if (condition.stat === STAT_MOST_PASSIVES) {
        const openPassives = OPEN.filter((item) => item.active === undefined).length;
        expect(openPassives, itemId).toBeGreaterThanOrEqual(condition.value);
      }
    }
  });

  it('leaves every pool enough to offer a fresh save, sober or promilled', () => {
    for (const promilled of [false, true]) {
      for (const pool of ITEM_POOLS) {
        const open = OPEN.filter(
          (item) => item.pools.includes(pool) && (promilled || item.needsPromille !== true),
        );
        expect(
          open.length,
          `${pool} (${promilled ? 'promilled' : 'sober'})`,
        ).toBeGreaterThanOrEqual(MIN_OPEN_PER_POOL);
      }
    }
  });
});

describe('a fresh save is never offered a locked item (#503)', () => {
  it('from any pool, across a seed sweep, until the pool runs dry', () => {
    for (let seed = 0; seed < 60; seed++) {
      const rng = new Rng(seed);
      for (const pool of ITEM_POOLS) {
        const taken = new Set<string>();
        for (;;) {
          const offer = selectItemOffer(
            REGISTRY,
            pool,
            { promilleUnlocked: seed % 2 === 0, floor: 2, luck: seed % 5, taken, locked: LOCKED },
            DEFAULT_ITEM_POOL_TUNING,
            rng,
          );
          if (offer === undefined) {
            break;
          }
          expect(LOCKED.has(offer.id), `${pool} offered ${offer.id} (seed ${String(seed)})`).toBe(
            false,
          );
          taken.add(offer.id);
        }
      }
    }
  });

  it("from the sandbox's skip-ahead kit, which draws through the same pools", () => {
    for (let seed = 0; seed < 25; seed++) {
      const sim = new GameSim({
        seed,
        population: 'empty',
        skippedFloors: 3,
        lockedItems: [...LOCKED],
      });
      for (const item of sim.heldItems()) {
        expect(LOCKED.has(item.id), `kit dealt ${item.id} (seed ${String(seed)})`).toBe(false);
      }
    }
  });
});

describe('the literal keys and tiers in the roster (#503)', () => {
  it('match what the engine writes and what the tiers are called', () => {
    // `content-is-data` keeps the roster from importing these, so they are
    // pinned here instead: a renamed helper or a reordered tier fails this.
    expect(STAT_DEEPEST_TIER).toBe('feat.run.deepestTier');
    expect(STAT_MOST_BEERS).toBe('feat.run.mostBeers');
    expect(STAT_MOST_PASSIVES).toBe('feat.run.mostPassives');
    expect(floorHeldTierStatKey(2)).toBe('feat.floor2.heldTier');
    expect(itemSetStatKey('braumeister')).toBe('feat.set.braumeister');
    expect(mostTaggedStatKey('rosinen')).toBe('feat.run.mostTagged.rosinen');
    expect([
      PromilleTier.Angeheitert,
      PromilleTier.Beduselt,
      PromilleTier.Vollrausch,
      PromilleTier.Umgfalln,
    ]).toEqual([1, 2, 3, 6]);
  });
});
