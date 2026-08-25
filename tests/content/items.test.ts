import { describe, expect, it } from 'vitest';
import { ITEM_DEFINITIONS } from '../../src/content/items/index.js';
import { ItemRegistry } from '../../src/sim/item/registry.js';

/**
 * The item roster, checked at build time rather than at play time.
 *
 * Mirrors `tests/content/enemies.test.ts` and `tests/content/pickups.test.ts`
 * — a broken item definition (a duplicate id, an empty pool list, an active
 * item with no charge) has to fail the build, not surface as an item that
 * silently does nothing the first time a player finds it.
 */
describe('the item roster', () => {
  it('compiles', () => {
    expect(() => new ItemRegistry(ITEM_DEFINITIONS)).not.toThrow();
  });

  it('has a definition for every item, reachable by id', () => {
    const registry = new ItemRegistry(ITEM_DEFINITIONS);
    expect(registry.count).toBe(ITEM_DEFINITIONS.length);
    for (const definition of ITEM_DEFINITIONS) {
      expect(registry.get(definition.id).id).toBe(definition.id);
      expect(definition.id).toBe(definition.id.toLowerCase().trim());
      expect(definition.id).not.toContain(' ');
      expect(definition.name.length).toBeGreaterThan(0);
      expect(definition.description.length).toBeGreaterThan(0);
      expect(definition.pools.length).toBeGreaterThan(0);
    }
  });

  it('sorts the compiled roster by id, independent of declaration order', () => {
    const registry = new ItemRegistry(ITEM_DEFINITIONS);
    const ids = registry.all.map((item) => item.id);
    expect(ids).toEqual([...ids].sort());
  });

  it('declares at least one item for every hook shape the format supports', () => {
    const registry = new ItemRegistry(ITEM_DEFINITIONS);
    const hasModifyStats = registry.all.some((item) => item.hooks.modifyStats !== undefined);
    const hasEventHook = registry.all.some((item) => item.hooks.onKill !== undefined);
    const hasActive = registry.all.some((item) => item.active !== undefined);
    // Proves the format end to end (#26's acceptance criteria), the same
    // reason `content/enemies/bierratte.ts` exists for the enemy primitives.
    expect(hasModifyStats).toBe(true);
    expect(hasEventHook).toBe(true);
    expect(hasActive).toBe(true);
  });

  it('rejects two items sharing an id', () => {
    const first = ITEM_DEFINITIONS[0];
    if (first === undefined) {
      throw new Error('ITEM_DEFINITIONS must not be empty');
    }
    expect(() => new ItemRegistry([first, first])).toThrow(/share the id/i);
  });
});
