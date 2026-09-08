import { describe, expect, it } from 'vitest';
import { ITEM_DEFINITIONS } from '../../src/content/items/index.js';
import { GameSim } from '../../src/sim/game/sim.js';
import { ItemRegistry } from '../../src/sim/item/registry.js';
import { StatId, STAT_IDS } from '../../src/sim/stats/definition.js';
import {
  InputAction,
  createInputFrame,
  quantiseAxis,
  setActionDown,
} from '../../src/sim/input/frame.js';

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

  it('rejects an item that is gated on a tier but claims not to need the meter (#85)', () => {
    const gated = ITEM_DEFINITIONS.find((item) => item.promilleRequirement !== 'any');
    if (gated === undefined) {
      throw new Error('expected at least one Promille-gated item');
    }
    // `needsPromille` defaults to "yes, if it is gated", so the only way to
    // reach this is to write the contradiction out by hand — and it is worth
    // rejecting rather than resolving, because either half could be the
    // mistake and the registry cannot tell which.
    expect(() => new ItemRegistry([{ ...gated, needsPromille: false }])).toThrow(
      /needs a tier needs the meter/i,
    );
    // The consistent pairing compiles, and so does an ungated item opting in.
    expect(() => new ItemRegistry([{ ...gated, needsPromille: true }])).not.toThrow();
  });
});

/**
 * #29's acceptance criteria, checked mechanically rather than only by
 * reading the files: every item has funny flavour text and none is filler.
 *
 * The roster-size milestone assertions that used to live here (#29's "at
 * least 28", #59's ten batches toward 120+) tracked the roster *growing*.
 * The 2026-09 cut reversed that on purpose — 139 items down to 51, keeping
 * only the ones whose design earns its slot — so a lower-bound count is no
 * longer a meaningful regression check and is gone rather than bumped down
 * to match.
 */
describe('#29 — the first 25 items', () => {
  it('every item carries funny, non-empty flavour text', () => {
    for (const definition of ITEM_DEFINITIONS) {
      expect(
        definition.flavourText?.trim().length,
        `${definition.id} has no flavour text`,
      ).toBeGreaterThan(0);
      // Flavour text is not the mechanical description restated — the two
      // acceptance criteria ("one sentence" and "funny") are different jobs.
      expect(definition.flavourText).not.toBe(definition.description);
    }
  });

  it('no "+1 damage" filler — every item declares at least one hook, or is active', () => {
    for (const definition of ITEM_DEFINITIONS) {
      const hookCount = Object.keys(definition.hooks ?? {}).length;
      const isFiller = hookCount === 0 && definition.active === undefined;
      expect(isFiller, `${definition.id} declares neither a hook nor an active effect`).toBe(false);
    }
  });

  it('every item is offerable — at least one pool, a valid quality, an honest Promille requirement', () => {
    const registry = new ItemRegistry(ITEM_DEFINITIONS);
    for (const item of registry.all) {
      expect(item.pools.length).toBeGreaterThan(0);
      expect(item.quality).toBeGreaterThanOrEqual(0);
      expect(item.quality).toBeLessThanOrEqual(3);
      expect(['any', 'sober', 'rausch']).toContain(item.promilleRequirement);
    }
  });
});

function aiming(angleRadians: number): ReturnType<typeof createInputFrame> {
  const frame = createInputFrame();
  frame.aimX = quantiseAxis(Math.cos(angleRadians));
  frame.aimY = quantiseAxis(Math.sin(angleRadians));
  setActionDown(frame, InputAction.Fire, true);
  return frame;
}

/**
 * A stand-in for #30's synergy fuzz harness, which does not exist yet (it is
 * its own, separate M3 issue) — this does not replace it. What it *does*
 * check, honestly: every one of #29's 26 new items, held at once, survives a
 * few hundred ticks of real play — firing, enemies dying, a Bierfassl going
 * off, an active item firing — without throwing or producing a NaN/Infinity
 * anywhere in the stat pipeline. #30 is what turns this into an actual
 * fuzzer (randomised subsets, many seeds, outlier detection); this is the
 * floor that has to be true before that harness has anything to build on.
 */
describe('#29 — held-together smoke test (stand-in for #30)', () => {
  it('every item, held at once, runs several hundred ticks without a crash or a NaN', () => {
    const sim = new GameSim({ items: ITEM_DEFINITIONS, population: 'enemies', seed: 12345 });
    for (const definition of ITEM_DEFINITIONS) {
      sim.pickUpItem(definition.id);
    }
    // Reinheitsgebot 1516 strips every already-held `rosinen` item, and
    // Sudordnung 1493 strips every already-held `rosinen` or `impure` item,
    // the moment each is picked up — expected here, not a bug this smoke
    // test should flag, so the expectation accounts for it rather than
    // assuming every definition stays held.
    //
    // A pact only ever strips what is *already* in the inventory, so which
    // items survive depends on where they sit in `ITEM_DEFINITIONS` relative
    // to the two pacts. That used to be invisible: every tagged item in the
    // roster happened to come before both pacts, so "the union of both tags"
    // was the right count by luck. #237's `rosinen` batch put items on both
    // sides of them and the assertion started over-counting, which is a bug
    // in the expectation and not in the pacts.
    const indexOf = (id: string): number =>
      ITEM_DEFINITIONS.findIndex((definition) => definition.id === id);
    const reinheitsgebotAt = indexOf('reinheitsgebot-1516');
    const sudordnungAt = indexOf('sudordnung-1493');
    const strippedCount = ITEM_DEFINITIONS.filter((definition, index) => {
      const tags = definition.tags ?? [];
      // `rosinen` is stripped by either pact, so it survives only past both.
      if (tags.includes('rosinen')) {
        return index < Math.max(reinheitsgebotAt, sudordnungAt);
      }
      // `impure` is Sudordnung's alone (#166 narrowed Reinheitsgebot to raisins).
      return tags.includes('impure') && index < sudordnungAt;
    }).length;
    expect(sim.inventory.count).toBe(ITEM_DEFINITIONS.length - strippedCount);

    expect(() => {
      for (let tick = 0; tick < 600; tick++) {
        // A slowly sweeping aim, so different shots find different enemies
        // (and walls, for Steinkrug/bouncing) rather than one fixed line.
        const angle = (tick / 37) * Math.PI * 2;
        sim.step(aiming(angle));

        if (tick % 90 === 0) {
          sim.spawnBierfassl(
            sim.positionX(sim.playerIndex) + 40,
            sim.positionY(sim.playerIndex),
            0,
            0,
            false,
          );
          sim.world.flush();
        }
        if (tick % 5 === 0) {
          // The one active item left in the roster fires once charged;
          // otherwise this is a no-op per `useActiveItem`.
          sim.useActiveItem('boellerschmeisser');
        }

        for (const stat of STAT_IDS) {
          const value = sim.stats.value(stat);
          if (!Number.isFinite(value)) {
            throw new Error(
              `stat ${stat} went non-finite at tick ${String(tick)}: ${String(value)}`,
            );
          }
        }
        sim.projectiles.forEachLive((slot) => {
          const vx = sim.projectiles.velocityX[slot] ?? 0;
          const vy = sim.projectiles.velocityY[slot] ?? 0;
          const damage = sim.projectiles.damage[slot] ?? 0;
          if (!Number.isFinite(vx) || !Number.isFinite(vy) || !Number.isFinite(damage)) {
            throw new Error(`projectile ${String(slot)} went non-finite at tick ${String(tick)}`);
          }
        });
      }
    }).not.toThrow();

    expect(Number.isFinite(sim.stats.value(StatId.Damage))).toBe(true);
  });
});
