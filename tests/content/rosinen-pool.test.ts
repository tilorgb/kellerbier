import { describe, expect, it } from 'vitest';
import { ITEM_DEFINITIONS } from '../../src/content/items/index.js';
import { ItemRegistry } from '../../src/sim/item/registry.js';
import { itemEligibleForOffer, selectItemOffer } from '../../src/sim/item/pool.js';
import { createTuning } from '../../src/sim/tuning.js';
import { RngStream, createStreamRng } from '../../src/sim/rng/streams.js';
import { ITEM_POOLS, type ItemPoolId } from '../../src/sim/item/definition.js';

/**
 * The `rosinen` pool has to stay a pool (#237).
 *
 * The run is about raisins and the item roster contained exactly one raisin,
 * which made three quality-3 items — both purity pacts and Der
 * Rosinenklauber — restrictions on, or payoffs for, a set of size one. A
 * two-floor run offered a `rosinen` item at all about **16%** of the time.
 *
 * That is a content gap that reads as fine in every unit test ever written
 * about the *system*: #166 landed the tag, the pacts, the hooks and the
 * strip-and-ban behaviour correctly and completely, and none of it was
 * wrong. This file is the gate the gap needed instead — the same shape
 * `room-floor-eligibility.test.ts` puts on a floor a room claims and cannot
 * serve, pointed at a mechanic whose content can quietly evaporate under it.
 */

const registry = new ItemRegistry(ITEM_DEFINITIONS);
const TUNING = createTuning();

function isRosinen(id: string): boolean {
  return registry.all.some((item) => item.id === id && item.tags.includes('rosinen'));
}

const ROSINEN = registry.all.filter((item) => item.tags.includes('rosinen'));

/**
 * The pedestals a two-floor run actually rolls, in order: each floor's
 * treasure rooms and shop, its mini-boss reward (drawn from `treasure`,
 * `pedestalPoolForRole`) and its boss. Deliberately a fixed, conservative
 * shape rather than a real generated floor — this is a *pool composition*
 * test, and threading the floor generator through it would make it fail for
 * reasons that have nothing to do with the roster.
 */
const RUN_POOLS: readonly ItemPoolId[] = [
  'treasure',
  'shop',
  'treasure',
  'boss',
  'treasure',
  'shop',
  'treasure',
  'boss',
];

/** The share of `seeds` runs that were offered at least one `rosinen` item. */
function offerRate(seeds: number): number {
  let runs = 0;
  for (let seed = 0; seed < seeds; seed++) {
    const rng = createStreamRng(seed, RngStream.Items);
    const taken = new Set<string>();
    let sawOne = false;
    for (const pool of RUN_POOLS) {
      const offer = selectItemOffer(
        registry,
        pool,
        { promilleUnlocked: true, floor: 2, luck: 0, taken },
        TUNING.itemPool,
        rng,
      );
      if (offer === undefined) {
        continue;
      }
      taken.add(offer.id);
      sawOne ||= isRosinen(offer.id);
    }
    if (sawOne) {
      runs += 1;
    }
  }
  return runs / seeds;
}

describe('the rosinen pool (#237)', () => {
  it('is a set, not a single item', () => {
    // 10-15 was the issue's own target. The floor is what matters: one is
    // what the mechanic had, and anything close to it puts the pacts back to
    // being free damage.
    expect(ROSINEN.length).toBeGreaterThanOrEqual(10);
  });

  it('reaches the pools a run actually draws from', () => {
    // A tag whose members all live in `devil` and `secret` is statistically
    // invisible however many of them there are.
    for (const pool of ['treasure', 'shop', 'boss'] as const) {
      const inPool = ROSINEN.filter((item) =>
        itemEligibleForOffer(item, pool, {
          promilleUnlocked: true,
          floor: 2,
          luck: 0,
          taken: new Set<string>(),
        }),
      );
      expect(inPool.length, `no rosinen item can be offered from "${pool}"`).toBeGreaterThanOrEqual(
        5,
      );
    }
  });

  it('offers a two-floor run at least one raisin most of the time', () => {
    // Measured across seeds rather than asserted from the pool sizes — how
    // often a tag actually reaches a player is a function of quality
    // weighting and of which pools it sits in, not of how many items carry
    // it. 16% before this pass; the gate is set well under what the roster
    // currently manages so that it fails on a real regression rather than on
    // one item being re-tuned.
    expect(offerRate(500)).toBeGreaterThan(0.6);
  });

  it('has raisins worth wanting, not just raisins', () => {
    // §8: "several rosinen items are among the strongest in the game, and
    // that is the point of them." A pool of ten weak items is the same
    // non-decision as a pool of one.
    expect(ROSINEN.filter((item) => item.quality >= 2).length).toBeGreaterThanOrEqual(6);
    expect(ROSINEN.filter((item) => item.quality >= 3).length).toBeGreaterThanOrEqual(2);
  });

  it('keeps every raisin to the shape the tag promises', () => {
    for (const item of ROSINEN) {
      // "It never inflicts a hidden or delayed penalty and it never lies in
      // its description" (§8) is not machine-checkable, but "it says
      // something about a cost" is the part that catches an item authored as
      // a clean upgrade that happened to get the tag.
      expect(item.description.length, `${item.id} has no description`).toBeGreaterThan(0);
      expect(
        item.pools.length,
        `${item.id} carries the tag but is in no pool, so it is not in the set the pacts lock out`,
      ).toBeGreaterThan(0);
    }
  });

  it('locks out something worth the pacts naming it', () => {
    // What Reinheitsgebot 1516 and Sudordnung 1493 actually cost, as a share
    // of each pool they can be found in. Under a tenth and the pact is free
    // damage again, which is the state #237 exists to leave behind.
    const pact = (tags: readonly string[]): number => {
      let locked = 0;
      let total = 0;
      for (const pool of ITEM_POOLS) {
        for (const item of registry.all) {
          if (
            !itemEligibleForOffer(item, pool, {
              promilleUnlocked: true,
              floor: 2,
              luck: 0,
              taken: new Set<string>(),
            })
          ) {
            continue;
          }
          total += 1;
          if (tags.some((tag) => item.tags.includes(tag))) {
            locked += 1;
          }
        }
      }
      return locked / total;
    };
    expect(pact(['rosinen'])).toBeGreaterThan(0.1);
    expect(pact(['rosinen', 'impure'])).toBeGreaterThan(pact(['rosinen']));
  });
});
