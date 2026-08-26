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
});

/**
 * #29's acceptance criteria, checked mechanically rather than only by
 * reading the files: every item has funny flavour text, none is filler, and
 * the roster reaches the milestone's size.
 */
describe('#29 — the first 25 items', () => {
  it('reaches at least 25 new items on top of the three that proved the format', () => {
    expect(ITEM_DEFINITIONS.length).toBeGreaterThanOrEqual(28);
  });

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

/**
 * #59's batches of ten toward the 120+ target — tracked here rather than in
 * a hundred separate issues, per the issue's own note. Bumped by ten (or
 * whatever the next batch lands) each time, the same way #29's own
 * milestone assertion above stayed in place as a floor once its count was
 * reached.
 */
describe('#59 — batch 1 of ten toward 120+', () => {
  it('reaches at least ten new items on top of #29 and #26', () => {
    expect(ITEM_DEFINITIONS.length).toBeGreaterThanOrEqual(38);
  });
});

describe('#59 — batch 2 of ten toward 120+', () => {
  it('reaches at least twenty new items on top of #29 and #26', () => {
    expect(ITEM_DEFINITIONS.length).toBeGreaterThanOrEqual(48);
  });
});

describe('#59 — batch 3 of ten toward 120+', () => {
  it('reaches at least thirty new items on top of #29 and #26', () => {
    expect(ITEM_DEFINITIONS.length).toBeGreaterThanOrEqual(58);
  });
});

describe('#59 — batch 4 of ten toward 120+', () => {
  it('reaches at least forty new items on top of #29 and #26', () => {
    expect(ITEM_DEFINITIONS.length).toBeGreaterThanOrEqual(68);
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
    // Reinheitsgebot 1516 strips every already-held `impure` item the moment
    // it is picked up — expected here, not a bug this smoke test should
    // flag, so the expectation accounts for it rather than assuming every
    // definition stays held.
    const impureCount = ITEM_DEFINITIONS.filter((definition) =>
      definition.tags?.includes('impure'),
    ).length;
    expect(sim.inventory.count).toBe(ITEM_DEFINITIONS.length - impureCount);

    expect(() => {
      for (let tick = 0; tick < 600; tick++) {
        // A slowly sweeping aim, so different shots find different enemies
        // (and walls, for Steinkrug/Föhn/bouncing) rather than one fixed line.
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
          // Whichever active item (Feuerwasser, Enzian) happens to be
          // charged fires; the rest are no-ops per `useActiveItem`.
          sim.useActiveItem('feuerwasser');
          sim.useActiveItem('enzian');
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

    expect(Number.isFinite(sim.stats.value(StatId.Stammwuerze))).toBe(true);
  });
});
