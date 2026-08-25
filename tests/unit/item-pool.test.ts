import { describe, expect, it } from 'vitest';
import type { ItemDefinition } from '../../src/sim/item/definition.js';
import { itemEligibleForOffer, itemOfferWeight, selectItemOffer } from '../../src/sim/item/pool.js';
import { ItemRegistry } from '../../src/sim/item/registry.js';
import { Rng } from '../../src/sim/rng/rng.js';
import { DEFAULT_ITEM_POOL_TUNING } from '../../src/sim/tuning.js';

/** A minimal, valid item — mirrors `tests/unit/item-hooks.test.ts`'s `baseItem`. */
function baseItem(id: string, overrides: Partial<ItemDefinition> = {}): ItemDefinition {
  return {
    id,
    name: id,
    description: 'a test item',
    sprite: 'test',
    pools: ['treasure'],
    quality: 0,
    promilleRequirement: 'any',
    ...overrides,
  };
}

function context(overrides: Partial<Parameters<typeof selectItemOffer>[2]> = {}) {
  return {
    promilleUnlocked: true,
    floor: 1,
    dusel: 0,
    taken: new Set<string>(),
    ...overrides,
  };
}

describe('itemEligibleForOffer', () => {
  it('rejects an item that does not belong to the pool', () => {
    const item = new ItemRegistry([baseItem('a', { pools: ['shop'] })]).at(0);
    expect(itemEligibleForOffer(item, 'treasure', context())).toBe(false);
    expect(itemEligibleForOffer(item, 'shop', context())).toBe(true);
  });

  it('rejects an already-taken item', () => {
    const item = new ItemRegistry([baseItem('a')]).at(0);
    expect(itemEligibleForOffer(item, 'treasure', context({ taken: new Set(['a']) }))).toBe(false);
  });

  it('rejects a sober/rausch item when Promille is not unlocked, keeps "any"', () => {
    const registry = new ItemRegistry([
      baseItem('sober-item', { promilleRequirement: 'sober' }),
      baseItem('rausch-item', { promilleRequirement: 'rausch' }),
      baseItem('any-item', { promilleRequirement: 'any' }),
    ]);
    const ctx = context({ promilleUnlocked: false });
    expect(itemEligibleForOffer(registry.get('sober-item'), 'treasure', ctx)).toBe(false);
    expect(itemEligibleForOffer(registry.get('rausch-item'), 'treasure', ctx)).toBe(false);
    expect(itemEligibleForOffer(registry.get('any-item'), 'treasure', ctx)).toBe(true);
  });

  it('allows sober/rausch items once Promille is unlocked', () => {
    const registry = new ItemRegistry([
      baseItem('sober-item', { promilleRequirement: 'sober' }),
      baseItem('rausch-item', { promilleRequirement: 'rausch' }),
    ]);
    const ctx = context({ promilleUnlocked: true });
    expect(itemEligibleForOffer(registry.get('sober-item'), 'treasure', ctx)).toBe(true);
    expect(itemEligibleForOffer(registry.get('rausch-item'), 'treasure', ctx)).toBe(true);
  });
});

describe('itemOfferWeight', () => {
  it('is unaffected by floor or Dusel at quality 0', () => {
    const item = new ItemRegistry([baseItem('a', { quality: 0 })]).at(0);
    const low = itemOfferWeight(item, context({ floor: 1, dusel: 0 }), DEFAULT_ITEM_POOL_TUNING);
    const high = itemOfferWeight(item, context({ floor: 20, dusel: 50 }), DEFAULT_ITEM_POOL_TUNING);
    expect(high).toBe(low);
    expect(low).toBe(DEFAULT_ITEM_POOL_TUNING.qualityWeight0);
  });

  it('grows with floor depth and with Dusel at quality > 0', () => {
    const item = new ItemRegistry([baseItem('a', { quality: 3 })]).at(0);
    const shallow = itemOfferWeight(
      item,
      context({ floor: 1, dusel: 0 }),
      DEFAULT_ITEM_POOL_TUNING,
    );
    const deep = itemOfferWeight(item, context({ floor: 7, dusel: 0 }), DEFAULT_ITEM_POOL_TUNING);
    const lucky = itemOfferWeight(item, context({ floor: 1, dusel: 10 }), DEFAULT_ITEM_POOL_TUNING);
    expect(deep).toBeGreaterThan(shallow);
    expect(lucky).toBeGreaterThan(shallow);
  });
});

describe('selectItemOffer', () => {
  it('never returns undefined when something is eligible, and never returns something ineligible', () => {
    const registry = new ItemRegistry([
      baseItem('a', { quality: 0 }),
      baseItem('b', { quality: 1, pools: ['shop'] }),
      baseItem('c', { quality: 2 }),
    ]);
    const rng = new Rng(1234);
    for (let draw = 0; draw < 50; draw++) {
      const offer = selectItemOffer(registry, 'treasure', context(), DEFAULT_ITEM_POOL_TUNING, rng);
      expect(offer).toBeDefined();
      expect(offer?.id).not.toBe('b');
    }
  });

  it('falls back gracefully — returns undefined, never throws — once the pool is exhausted', () => {
    const registry = new ItemRegistry([baseItem('a'), baseItem('b')]);
    const rng = new Rng(1);
    const ctx = context({ taken: new Set(['a', 'b']) });
    expect(() =>
      selectItemOffer(registry, 'treasure', ctx, DEFAULT_ITEM_POOL_TUNING, rng),
    ).not.toThrow();
    expect(
      selectItemOffer(registry, 'treasure', ctx, DEFAULT_ITEM_POOL_TUNING, rng),
    ).toBeUndefined();
  });

  it('returns undefined for a pool nothing declares, rather than throwing', () => {
    const registry = new ItemRegistry([baseItem('a', { pools: ['shop'] })]);
    const rng = new Rng(1);
    expect(
      selectItemOffer(registry, 'devil', context(), DEFAULT_ITEM_POOL_TUNING, rng),
    ).toBeUndefined();
  });

  it('never offers the same item twice across a run that takes every offer it draws', () => {
    const registry = new ItemRegistry([
      baseItem('a'),
      baseItem('b'),
      baseItem('c'),
      baseItem('d'),
      baseItem('e'),
    ]);
    const rng = new Rng(99);
    const taken = new Set<string>();
    const offered: string[] = [];
    for (let draw = 0; draw < registry.count; draw++) {
      const offer = selectItemOffer(
        registry,
        'treasure',
        context({ taken }),
        DEFAULT_ITEM_POOL_TUNING,
        rng,
      );
      expect(offer).toBeDefined();
      if (offer !== undefined) {
        expect(taken.has(offer.id)).toBe(false);
        taken.add(offer.id);
        offered.push(offer.id);
      }
    }
    expect(new Set(offered).size).toBe(offered.length);
    // Every member of the pool was reachable — none permanently excluded.
    expect(offered.sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('is deterministic: the same seed and the same sequence of context draws the same offers', () => {
    const registry = new ItemRegistry([baseItem('a'), baseItem('b'), baseItem('c'), baseItem('d')]);
    const run = (): string[] => {
      const rng = new Rng(42);
      const taken = new Set<string>();
      const offers: string[] = [];
      for (let draw = 0; draw < 3; draw++) {
        const offer = selectItemOffer(
          registry,
          'treasure',
          context({ taken }),
          DEFAULT_ITEM_POOL_TUNING,
          rng,
        );
        if (offer !== undefined) {
          taken.add(offer.id);
          offers.push(offer.id);
        }
      }
      return offers;
    };
    expect(run()).toEqual(run());
  });
});
