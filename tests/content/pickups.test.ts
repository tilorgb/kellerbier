import { describe, expect, it } from 'vitest';
import { ENEMY_DEFINITIONS } from '../../src/content/enemies/index.js';
import {
  ENEMY_DROP_TABLES,
  PICKUP_DEFINITIONS,
  ROOM_CLEAR_DROP_TABLE,
} from '../../src/content/pickups/index.js';
import { LOOT_TIERS, type DropTable } from '../../src/sim/pickup/definition.js';
import { PickupRegistry } from '../../src/sim/pickup/registry.js';

/**
 * The pickup roster and its drop tables, checked at build time.
 *
 * A drop table naming a pickup id that does not exist is a room that hands
 * out nothing — or throws — the moment the wrong enemy dies, which is the
 * kind of bug found by a player rather than by whoever wrote it.
 */
describe('the pickup roster', () => {
  it('compiles', () => {
    expect(() => new PickupRegistry(PICKUP_DEFINITIONS)).not.toThrow();
  });

  it('has a definition for every pickup, reachable by id', () => {
    const registry = new PickupRegistry(PICKUP_DEFINITIONS);
    expect(registry.count).toBe(PICKUP_DEFINITIONS.length);
    for (const definition of PICKUP_DEFINITIONS) {
      expect(registry.get(definition.id).id).toBe(definition.id);
      expect(definition.id).toBe(definition.id.toLowerCase().trim());
      expect(definition.id).not.toContain(' ');
      expect(definition.name.length).toBeGreaterThan(0);
      // The pickup toast's (#26) plain-language half — "what did that do".
      expect(definition.description.length).toBeGreaterThan(0);
      expect(definition.radius).toBeGreaterThan(0);
      // Drawn on the pickup itself (`render/entities.ts`) — long enough to
      // say something, short enough to fit on a four-pixel-radius blob.
      expect(definition.label.length).toBeGreaterThan(0);
      expect(definition.label.length).toBeLessThanOrEqual(3);
    }
  });

  it('rejects two pickups sharing an id', () => {
    const first = PICKUP_DEFINITIONS[0];
    if (first === undefined) {
      throw new Error('PICKUP_DEFINITIONS must not be empty');
    }
    expect(() => new PickupRegistry([first, first])).toThrow(/share the id/i);
  });
});

function checkTable(registry: PickupRegistry, table: DropTable, where: string): void {
  for (const variant of ['sober', 'promilled'] as const) {
    let hasPositiveWeight = false;
    for (const entry of table[variant]) {
      expect(entry.weight, `${where}.${variant} has a negative weight`).toBeGreaterThanOrEqual(0);
      if (entry.weight > 0) {
        hasPositiveWeight = true;
      }
      if (entry.pickupId !== null) {
        expect(
          registry.indexOf(entry.pickupId) >= 0,
          `${where}.${variant} names unknown pickup "${entry.pickupId}"`,
        ).toBe(true);
      }
    }
    expect(hasPositiveWeight, `${where}.${variant} has no positive weight to roll`).toBe(true);
    // A sober run must never be able to roll Beer — see DECISIONS.md §9 and #85.
    if (variant === 'sober') {
      expect(table.sober.some((entry) => entry.pickupId === 'beer')).toBe(false);
    }
  }
}

describe('drop tables', () => {
  const registry = new PickupRegistry(PICKUP_DEFINITIONS);

  it('every enemy tier has a table, and every table names only real pickups', () => {
    for (const tier of LOOT_TIERS) {
      checkTable(registry, ENEMY_DROP_TABLES[tier], `ENEMY_DROP_TABLES.${tier}`);
    }
  });

  it('the room-clear table names only real pickups', () => {
    checkTable(registry, ROOM_CLEAR_DROP_TABLE, 'ROOM_CLEAR_DROP_TABLE');
  });

  it('every enemy in the roster resolves to a known loot tier', () => {
    for (const definition of ENEMY_DEFINITIONS) {
      const tier = definition.lootTier ?? 'normal';
      expect(LOOT_TIERS as readonly string[], `${definition.id} has an unknown lootTier`).toContain(
        tier,
      );
    }
  });
});
