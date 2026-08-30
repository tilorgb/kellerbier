import { describe, expect, it } from 'vitest';
import { ITEM_DEFINITIONS } from '../../src/content/items/index.js';
import {
  BOSS_REWARD_DROP_TABLE,
  ENEMY_DROP_TABLES,
  PICKUP_DEFINITIONS,
  ROOM_CLEAR_DROP_TABLE,
} from '../../src/content/pickups/index.js';
import { ROOM_TEMPLATES } from '../../src/content/rooms/index.js';
import { ENEMY_DEFINITIONS } from '../../src/content/enemies/index.js';
import { isMultiCellRoomTemplate, type RoomSubLayout } from '../../src/content/rooms/definition.js';
import { validateRoomTemplate } from '../../src/sim/room/template.js';
import { ITEM_POOLS, type ItemPoolId } from '../../src/sim/item/definition.js';
import { ItemRegistry } from '../../src/sim/item/registry.js';
import { itemEligibleForOffer } from '../../src/sim/item/pool.js';
import { type DropTable, pickupDescriptionFor } from '../../src/sim/pickup/definition.js';

/**
 * The content half of the Promille gate (#85), checked at build time.
 *
 * `tests/unit/promille-gate.test.ts` proves the *engine* honours a sober run.
 * This file proves the *content* can survive one — which is a different and
 * more fragile claim, because it goes on being true only for as long as
 * every item, pickup and room authored from here on remembers the gate
 * exists. That is exactly the shape `CLAUDE.md` describes: a graceful
 * runtime path is no substitute for catching the gap on the pull request,
 * the way `room-floor-eligibility.test.ts` catches a floor a room claims and
 * cannot serve.
 *
 * The acceptance criterion these are written against is the strict one:
 * "a first-time player can clear floor 1 without meeting the word Promille
 * anywhere", and "a sober run contains no beer at all".
 */

/** Ids of every pickup that moves the meter — the ones a sober run must never see. */
const PROMILLE_PICKUP_IDS = new Set(
  PICKUP_DEFINITIONS.filter((pickup) => pickup.effect.kind === 'promille').map(
    (pickup) => pickup.id,
  ),
);

/**
 * Words that give the mechanic away in player-facing text.
 *
 * Deliberately more than just "Promille": the tiers, the debuff and the
 * tolerance are all names for parts of a system a sober player has never
 * been told about, and a description reading "clears the Kater" is no less
 * of a leak for avoiding the headline word. Matched case-insensitively and
 * on a word boundary, so "Rausch" catches Vollrausch without also catching
 * Almrausch — an item named for the alpenrose, which is a flower.
 */
const PROMILLE_WORDS = [
  'promille',
  'kater',
  'trinkfest',
  'rausch',
  'nüchtern',
  'angeheitert',
  'beduselt',
  'umgfalln',
];

function leakedWords(text: string): string[] {
  const lower = text.toLowerCase();
  return PROMILLE_WORDS.filter((word) => new RegExp(`\\b${word}\\b`, 'u').test(lower));
}

const registry = new ItemRegistry(ITEM_DEFINITIONS);

const SOBER_CONTEXT = {
  promilleUnlocked: false,
  floor: 1,
  dusel: 0,
  taken: new Set<string>(),
};

function soberPool(pool: ItemPoolId): readonly { id: string; description: string }[] {
  return registry.all.filter((item) => itemEligibleForOffer(item, pool, SOBER_CONTEXT));
}

function subLayoutsOf(template: unknown): readonly RoomSubLayout[] {
  const validated = validateRoomTemplate(template, 'room template', ENEMY_DEFINITIONS);
  return isMultiCellRoomTemplate(validated) ? validated.cells : [validated];
}

describe('a sober run contains no beer (#85)', () => {
  const tables: readonly (readonly [string, DropTable])[] = [
    ['weak enemies', ENEMY_DROP_TABLES.weak],
    ['normal enemies', ENEMY_DROP_TABLES.normal],
    ['tough enemies', ENEMY_DROP_TABLES.tough],
    ['room clear', ROOM_CLEAR_DROP_TABLE],
    ['boss reward', BOSS_REWARD_DROP_TABLE],
  ];

  it.each(tables)('the %s sober table never names a Promille pickup', (_name, table) => {
    for (const entry of table.sober) {
      expect(PROMILLE_PICKUP_IDS.has(entry.pickupId ?? '')).toBe(false);
    }
  });

  it.each(tables)(
    'the %s sober table still pays out as often as the promilled one',
    (_n, table) => {
      // Beer's weight is meant to move to Biermarken, keys and health, not to
      // evaporate — a sober run that simply drops less is the "the real game
      // with a feature missing" failure the issue calls out by name. Compared
      // as the odds of *something* dropping (everything but the `null`
      // outcome) rather than as raw totals, since that is the number a player
      // actually feels.
      const chance = (entries: DropTable['sober']): number => {
        let total = 0;
        let nothing = 0;
        for (const entry of entries) {
          total += entry.weight;
          if (entry.pickupId === null) {
            nothing += entry.weight;
          }
        }
        return (total - nothing) / total;
      };
      expect(chance(table.sober)).toBeGreaterThanOrEqual(chance(table.promilled) - 1e-9);
    },
  );

  it('no room template hands one out directly, whatever its drop tables say', () => {
    // The drop tables are not the only way a pickup reaches the floor: a
    // room can author one at a fixed position, and that path does not go
    // through `dropLoot`'s sober/promilled branch at all. Nothing authors
    // beer today; this is what stops the first room that does from doing it
    // silently.
    for (const template of ROOM_TEMPLATES) {
      for (const layout of subLayoutsOf(template)) {
        for (const spawn of layout.pickupSpawns) {
          expect(PROMILLE_PICKUP_IDS.has(spawn.type)).toBe(false);
        }
      }
    }
  });
});

describe('a sober run offers no Promille item (#85)', () => {
  it('filters out every gated item and every piece of Promille machinery', () => {
    for (const item of registry.all) {
      const offerable = ITEM_POOLS.some((pool) => itemEligibleForOffer(item, pool, SOBER_CONTEXT));
      expect(offerable).toBe(item.needsPromille ? false : item.pools.length > 0);
    }
  });

  it('treats a tier gate as implying the mechanic, without the author saying so twice', () => {
    for (const item of registry.all) {
      if (item.promilleRequirement !== 'any') {
        expect(item.needsPromille).toBe(true);
      }
    }
  });

  it('leaves every pool with something to offer', () => {
    // The filter above removes a fifth of the roster. Graceful exhaustion
    // (#28) means an empty pool is an empty pedestal rather than a crash —
    // but a whole *pool* that can never fill a pedestal in a sober run is a
    // content gap, not a graceful outcome, and it is a gap that would only
    // show up as "the treasure room was empty again" in play.
    for (const pool of ITEM_POOLS) {
      expect(soberPool(pool).length).toBeGreaterThan(0);
    }
  });
});

describe('a sober run never says the word (#85)', () => {
  it('for any item it can offer', () => {
    // The real check behind `needsPromille`: an item that is Promille
    // machinery but forgot to say so is caught here, because its own
    // description — which `ItemDefinition.description` requires to be a
    // plain-language translation of what it does — gives it away.
    for (const pool of ITEM_POOLS) {
      for (const item of soberPool(pool)) {
        expect({ id: item.id, leaked: leakedWords(item.description) }).toEqual({
          id: item.id,
          leaked: [],
        });
      }
    }
  });

  it('for any pickup it can drop', () => {
    const dropped = new Set<string>();
    for (const table of [
      ENEMY_DROP_TABLES.weak,
      ENEMY_DROP_TABLES.normal,
      ENEMY_DROP_TABLES.tough,
      ROOM_CLEAR_DROP_TABLE,
      BOSS_REWARD_DROP_TABLE,
    ]) {
      for (const entry of table.sober) {
        if (entry.pickupId !== null) {
          dropped.add(entry.pickupId);
        }
      }
    }
    for (const pickup of PICKUP_DEFINITIONS) {
      if (!dropped.has(pickup.id)) {
        continue;
      }
      const description = pickupDescriptionFor(pickup, false);
      expect({ id: pickup.id, leaked: leakedWords(description) }).toEqual({
        id: pickup.id,
        leaked: [],
      });
    }
  });

  it('while still saying it in a promilled run, where the word is the point', () => {
    // The other half of the same rule: `soberDescription` must not have
    // quietly become the *only* description. Food heals and lowers the meter,
    // and a promilled player is entitled to be told the second half.
    const food = PICKUP_DEFINITIONS.filter((pickup) => pickup.effect.kind === 'food');
    expect(food.length).toBeGreaterThan(0);
    for (const pickup of food) {
      expect(leakedWords(pickupDescriptionFor(pickup, true))).toContain('promille');
      expect(pickupDescriptionFor(pickup, false)).not.toBe(pickup.description);
    }
  });
});
