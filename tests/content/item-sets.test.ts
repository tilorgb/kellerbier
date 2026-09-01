import { describe, expect, it } from 'vitest';
import { ITEM_DEFINITIONS } from '../../src/content/items/index.js';
import { ITEM_SET_DEFINITIONS } from '../../src/content/item-sets/index.js';
import { ItemRegistry } from '../../src/sim/item/registry.js';
import { SetRegistry } from '../../src/sim/item/set.js';

/**
 * The item-set roster (#137), checked at build time — a broken set (a
 * member id that doesn't resolve, a duplicate) has to fail the build, the
 * same "content is checked at compile/construction time" convention
 * `tests/content/items.test.ts` already holds the item roster to.
 */
describe('the item-set roster', () => {
  it('compiles against the real item roster', () => {
    const items = new ItemRegistry(ITEM_DEFINITIONS);
    expect(() => new SetRegistry(ITEM_SET_DEFINITIONS, items)).not.toThrow();
  });

  it('every set has at least two distinct, real member items', () => {
    for (const set of ITEM_SET_DEFINITIONS) {
      expect(set.members.length).toBeGreaterThanOrEqual(2);
      expect(new Set(set.members).size).toBe(set.members.length);
      for (const memberId of set.members) {
        expect(ITEM_DEFINITIONS.some((item) => item.id === memberId)).toBe(true);
      }
    }
  });

  it('the Braumeister set includes the existing Braumeister-Visier', () => {
    const braumeister = ITEM_SET_DEFINITIONS.find((set) => set.id === 'braumeister');
    expect(braumeister).toBeDefined();
    expect(braumeister?.members).toContain('braumeister-visier');
  });

  it('rejects a set naming an item that does not exist', () => {
    const items = new ItemRegistry(ITEM_DEFINITIONS);
    expect(
      () =>
        new SetRegistry(
          [{ id: 'ghost', name: 'Ghost', members: ['nope', 'also-nope'], bonus: [] }],
          items,
        ),
    ).toThrow(/not a registered item/);
  });

  it('rejects two sets sharing an id', () => {
    const items = new ItemRegistry(ITEM_DEFINITIONS);
    const dupe = [
      { id: 'a', name: 'A', members: ['braumeister-visier', 'braumeister-schuerze'], bonus: [] },
      {
        id: 'a',
        name: 'A again',
        members: ['braumeister-visier', 'braumeister-hammer'],
        bonus: [],
      },
    ];
    expect(() => new SetRegistry(dupe, items)).toThrow(/share the id/);
  });

  it('rejects a "set" of only one item', () => {
    const items = new ItemRegistry(ITEM_DEFINITIONS);
    expect(
      () =>
        new SetRegistry(
          [{ id: 'lonely', name: 'Lonely', members: ['braumeister-visier'], bonus: [] }],
          items,
        ),
    ).toThrow(/at least two members/);
  });
});
