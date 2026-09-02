import { describe, expect, it } from 'vitest';
import type { ItemDefinition, ItemRuntimeState } from '../../src/sim/item/definition.js';
import {
  itemEligibleForMachine,
  itemRollSourceKey,
  machineRollTierWeight,
  rollItemStatModifiers,
  selectMachineRollTier,
} from '../../src/sim/item/roll.js';
import { ItemRegistry } from '../../src/sim/item/registry.js';
import { Rng } from '../../src/sim/rng/rng.js';
import { DEFAULT_MACHINE_TUNING } from '../../src/sim/tuning.js';

/** A minimal, valid item — mirrors `tests/unit/item-pool.test.ts`'s `baseItem`. */
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

const runtimeState = (): ItemRuntimeState => ({ count: 1, charge: 0, timer: 0 });

describe('itemEligibleForMachine', () => {
  it('is eligible when modifyStats returns something for the current state', () => {
    const item = new ItemRegistry([
      baseItem('a', {
        hooks: { modifyStats: () => [{ stat: 'stammwuerze', op: 'add', value: 1 }] },
      }),
    ]).at(0);
    expect(itemEligibleForMachine(item, runtimeState())).toBe(true);
  });

  it('is ineligible with no modifyStats hook at all', () => {
    const item = new ItemRegistry([baseItem('a')]).at(0);
    expect(itemEligibleForMachine(item, runtimeState())).toBe(false);
  });

  it('is ineligible when modifyStats currently returns nothing (a gated or state-dependent item)', () => {
    const item = new ItemRegistry([baseItem('a', { hooks: { modifyStats: () => [] } })]).at(0);
    expect(itemEligibleForMachine(item, runtimeState())).toBe(false);
  });
});

describe('machineRollTierWeight / selectMachineRollTier', () => {
  it('is unaffected by Dusel for the two middle tiers', () => {
    const low = machineRollTierWeight('common', 0, DEFAULT_MACHINE_TUNING);
    const high = machineRollTierWeight('common', 50, DEFAULT_MACHINE_TUNING);
    expect(high).toBe(low);
  });

  it('pushes weight up for rare/legendary and down for unlucky as Dusel rises', () => {
    const rareLow = machineRollTierWeight('rare', 0, DEFAULT_MACHINE_TUNING);
    const rareHigh = machineRollTierWeight('rare', 20, DEFAULT_MACHINE_TUNING);
    expect(rareHigh).toBeGreaterThan(rareLow);

    const unluckyLow = machineRollTierWeight('unlucky', 0, DEFAULT_MACHINE_TUNING);
    const unluckyHigh = machineRollTierWeight('unlucky', 20, DEFAULT_MACHINE_TUNING);
    expect(unluckyHigh).toBeLessThan(unluckyLow);
  });

  it('never goes negative even at extreme Dusel', () => {
    expect(machineRollTierWeight('unlucky', 10000, DEFAULT_MACHINE_TUNING)).toBeGreaterThanOrEqual(
      0,
    );
  });

  it('always draws one of the five tiers, deterministically for a given seed', () => {
    const rng = new Rng(7);
    const tiers = new Set<string>();
    for (let draw = 0; draw < 200; draw++) {
      tiers.add(selectMachineRollTier(rng, 0, DEFAULT_MACHINE_TUNING));
    }
    for (const tier of tiers) {
      expect(['unlucky', 'common', 'uncommon', 'rare', 'legendary']).toContain(tier);
    }
    const run = (): string[] => {
      const seeded = new Rng(42);
      return Array.from({ length: 10 }, () =>
        selectMachineRollTier(seeded, 5, DEFAULT_MACHINE_TUNING),
      );
    };
    expect(run()).toEqual(run());
  });
});

describe('rollItemStatModifiers', () => {
  const multiplyItem = new ItemRegistry([
    baseItem('multiply-item', {
      hooks: { modifyStats: () => [{ stat: 'stammwuerze', op: 'multiply', value: 1.4 }] },
    }),
  ]).at(0);

  const addItem = new ItemRegistry([
    baseItem('add-item', {
      hooks: { modifyStats: () => [{ stat: 'stammwuerze', op: 'add', value: 0.2 }] },
    }),
  ]).at(0);

  it('nudges a multiply modifier up on a favourable tier, down on unlucky', () => {
    const rng = new Rng(1);
    const good = rollItemStatModifiers(
      multiplyItem,
      runtimeState(),
      'common',
      rng,
      DEFAULT_MACHINE_TUNING,
    );
    expect(good.modifiers).toHaveLength(1);
    expect(good.modifiers[0]?.op).toBe('multiply');
    expect(good.modifiers[0]?.value).toBeGreaterThan(1);
    expect(good.rolled?.favourable).toBe(true);

    const bad = rollItemStatModifiers(
      multiplyItem,
      runtimeState(),
      'unlucky',
      rng,
      DEFAULT_MACHINE_TUNING,
    );
    expect(bad.modifiers[0]?.value).toBeLessThan(1);
    expect(bad.rolled?.favourable).toBe(false);
  });

  it('nudges an add modifier proportionally to its own magnitude', () => {
    const rng = new Rng(1);
    const result = rollItemStatModifiers(
      addItem,
      runtimeState(),
      'rare',
      rng,
      DEFAULT_MACHINE_TUNING,
    );
    expect(result.modifiers[0]?.op).toBe('add');
    expect(result.modifiers[0]?.value).toBeCloseTo(0.2 * DEFAULT_MACHINE_TUNING.rareRollPercent, 6);
  });

  it('returns nothing, without throwing, for an item with no current modifiers', () => {
    const empty = new ItemRegistry([baseItem('empty', { hooks: { modifyStats: () => [] } })]).at(0);
    const result = rollItemStatModifiers(
      empty,
      runtimeState(),
      'common',
      new Rng(1),
      DEFAULT_MACHINE_TUNING,
    );
    expect(result.modifiers).toEqual([]);
    expect(result.rolled).toBeUndefined();
  });

  it('a legendary roll uses the authored legendaryRoll outright, replacing the generic delta', () => {
    const item = new ItemRegistry([
      baseItem('legendary-item', {
        hooks: { modifyStats: () => [{ stat: 'stammwuerze', op: 'multiply', value: 1.4 }] },
        legendaryRoll: [{ stat: 'stammwuerze', op: 'multiply', value: 2 }],
      }),
    ]).at(0);
    const result = rollItemStatModifiers(
      item,
      runtimeState(),
      'legendary',
      new Rng(1),
      DEFAULT_MACHINE_TUNING,
    );
    expect(result.modifiers).toEqual([{ stat: 'stammwuerze', op: 'multiply', value: 2 }]);
    expect(result.usedLegendaryFallback).toBe(false);
  });

  it('a legendary roll on an item with no authored legendaryRoll falls back to the rare magnitude', () => {
    const rng = new Rng(1);
    const legendary = rollItemStatModifiers(
      multiplyItem,
      runtimeState(),
      'legendary',
      rng,
      DEFAULT_MACHINE_TUNING,
    );
    expect(legendary.usedLegendaryFallback).toBe(true);
    expect(legendary.modifiers[0]?.value).toBeCloseTo(
      1 + DEFAULT_MACHINE_TUNING.rareRollPercent,
      6,
    );
  });
});

describe('itemRollSourceKey', () => {
  it('never collides with the item’s own modifyStats source key', () => {
    expect(itemRollSourceKey('kraftbier')).not.toBe('item:kraftbier');
    expect(itemRollSourceKey('kraftbier')).toBe('item-roll:kraftbier');
  });
});
