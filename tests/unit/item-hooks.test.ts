import { describe, expect, it } from 'vitest';
import { GameSim, TARGET_HEALTH } from '../../src/sim/game/sim.js';
import type { ItemDefinition } from '../../src/sim/item/definition.js';
import { ItemInventory } from '../../src/sim/item/inventory.js';
import { ItemRegistry } from '../../src/sim/item/registry.js';
import { RoomGeometry } from '../../src/sim/room/geometry.js';
import { StatId } from '../../src/sim/stats/definition.js';
import {
  type InputFrame,
  InputAction,
  createInputFrame,
  quantiseAxis,
  setActionDown,
} from '../../src/sim/input/frame.js';
import {
  dispatchItemBeerPickup,
  dispatchItemDamageTaken,
  dispatchItemFloorStart,
  dispatchItemHit,
  dispatchItemKill,
  dispatchItemProjectileSpawn,
  dispatchItemRoomClear,
  dispatchItemShoot,
  stepItemTick,
} from '../../src/sim/systems/items.js';

const IDLE = createInputFrame();

function aiming(aimX: number, aimY: number): InputFrame {
  const frame = createInputFrame();
  frame.aimX = quantiseAxis(aimX);
  frame.aimY = quantiseAxis(aimY);
  setActionDown(frame, InputAction.Fire, true);
  return frame;
}

function bareRoom(): RoomGeometry {
  return new RoomGeometry(0, 0, 320, 180);
}

/** A minimal, valid item — every field a test doesn't care about filled with a harmless default. */
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

/** Fires one shot leftward and runs until it lands. Mirrors `tests/unit/impact.test.ts`. */
function landOneShot(sim: GameSim): void {
  sim.step(aiming(-1, 0));
  for (let tick = 0; tick < 90; tick++) {
    sim.step(IDLE);
    if (sim.frozen) {
      // `applyDamageAt` (and the item dispatch inside it) already ran
      // synchronously on the tick that detected the hit — hitstop starting
      // is the observable sign the hit landed.
      return;
    }
  }
  throw new Error('the shot never landed');
}

describe('ItemRegistry validation', () => {
  it('compiles a minimal valid item', () => {
    expect(() => new ItemRegistry([baseItem('a')])).not.toThrow();
  });

  it('rejects two items sharing an id', () => {
    expect(() => new ItemRegistry([baseItem('a'), baseItem('a')])).toThrow(/share the id/i);
  });

  it('rejects an item with no pools', () => {
    expect(() => new ItemRegistry([baseItem('a', { pools: [] })])).toThrow(/no pools/i);
  });

  it('rejects an unknown pool', () => {
    // @ts-expect-error — deliberately invalid content, the case the registry has to catch at runtime.
    expect(() => new ItemRegistry([baseItem('a', { pools: ['stammtisch'] })])).toThrow(
      /unknown pool/i,
    );
  });

  it('rejects an invalid quality', () => {
    // @ts-expect-error — deliberately invalid content.
    expect(() => new ItemRegistry([baseItem('a', { quality: 9 })])).toThrow(/invalid quality/i);
  });

  it('rejects an unknown Promille requirement', () => {
    // @ts-expect-error — deliberately invalid content.
    expect(() => new ItemRegistry([baseItem('a', { promilleRequirement: 'schwer' })])).toThrow(
      /Promille requirement/i,
    );
  });

  it('rejects an active item with no positive integer charge', () => {
    expect(() => new ItemRegistry([baseItem('a', { active: { maxCharge: 0 } })])).toThrow(
      /maxCharge/,
    );
    expect(() => new ItemRegistry([baseItem('a', { active: { maxCharge: 2.5 } })])).toThrow(
      /maxCharge/,
    );
  });

  it('sorts the compiled roster by id, not by declaration order', () => {
    const registry = new ItemRegistry([baseItem('zeta'), baseItem('alpha'), baseItem('mitte')]);
    expect(registry.all.map((item) => item.id)).toEqual(['alpha', 'mitte', 'zeta']);
  });
});

describe('ItemInventory — deterministic hook ordering', () => {
  it('always visits held items in id order, regardless of pickup order', () => {
    const registry = new ItemRegistry([baseItem('bravo'), baseItem('alpha'), baseItem('charlie')]);
    const alpha = registry.indexOf('alpha');
    const bravo = registry.indexOf('bravo');
    const charlie = registry.indexOf('charlie');

    const pickedLast = new ItemInventory(registry);
    pickedLast.pickUp(charlie);
    pickedLast.pickUp(alpha);
    pickedLast.pickUp(bravo);

    const pickedFirst = new ItemInventory(registry);
    pickedFirst.pickUp(bravo);
    pickedFirst.pickUp(charlie);
    pickedFirst.pickUp(alpha);

    const orderA: string[] = [];
    pickedLast.forEachHeld((index) => orderA.push(registry.at(index).id));
    const orderB: string[] = [];
    pickedFirst.forEachHeld((index) => orderB.push(registry.at(index).id));

    expect(orderA).toEqual(['alpha', 'bravo', 'charlie']);
    expect(orderB).toEqual(['alpha', 'bravo', 'charlie']);
  });

  it('a second copy bumps count without changing held order', () => {
    const registry = new ItemRegistry([baseItem('alpha'), baseItem('bravo')]);
    const inventory = new ItemInventory(registry);
    inventory.pickUp(registry.indexOf('bravo'));
    inventory.pickUp(registry.indexOf('alpha'));
    inventory.pickUp(registry.indexOf('alpha'));

    expect(inventory.count).toBe(2);
    expect(inventory.stateOf(registry.indexOf('alpha')).count).toBe(2);
    const order: string[] = [];
    inventory.forEachHeld((index) => order.push(registry.at(index).id));
    expect(order).toEqual(['alpha', 'bravo']);
  });

  it('losing the last copy removes the item from held order and resets charge', () => {
    const registry = new ItemRegistry([baseItem('alpha'), baseItem('bravo')]);
    const inventory = new ItemInventory(registry);
    const alpha = registry.indexOf('alpha');
    inventory.pickUp(alpha);
    inventory.stateOf(alpha).charge = 3;

    expect(inventory.remove(alpha)).toBe(false);
    expect(inventory.has(alpha)).toBe(false);
    expect(inventory.stateOf(alpha).charge).toBe(0);
    expect(inventory.count).toBe(0);
  });

  it('losing one of several copies keeps the item held', () => {
    const registry = new ItemRegistry([baseItem('alpha')]);
    const inventory = new ItemInventory(registry);
    const alpha = registry.indexOf('alpha');
    inventory.pickUp(alpha);
    inventory.pickUp(alpha);

    expect(inventory.remove(alpha)).toBe(true);
    expect(inventory.has(alpha)).toBe(true);
    expect(inventory.stateOf(alpha).count).toBe(1);
  });
});

describe('GameSim.pickUpItem / removeItem — stat pipeline integration', () => {
  it('folds modifyStats into the stat pipeline under item:<id>, scaled by stack count', () => {
    const item = baseItem('krug', {
      hooks: {
        modifyStats: (state) => [{ stat: 'stammwuerze', op: 'add', value: state.count }],
      },
    });
    const sim = new GameSim({ room: bareRoom(), items: [item] });
    const base = sim.stats.value(StatId.Stammwuerze);

    sim.pickUpItem('krug');
    expect(sim.stats.value(StatId.Stammwuerze)).toBe(base + 1);

    sim.pickUpItem('krug');
    expect(sim.stats.value(StatId.Stammwuerze)).toBe(base + 2);

    const trace = sim.stats.trace(StatId.Stammwuerze);
    const addStep = trace.steps.find((step) => step.stage === 'add');
    expect(addStep?.stage === 'add' && addStep.source.kind).toBe('item');
    expect(addStep?.stage === 'add' && addStep.source.id).toBe('krug');
  });

  it('removing every copy exactly restores the base value', () => {
    const item = baseItem('krug', {
      hooks: { modifyStats: (state) => [{ stat: 'stammwuerze', op: 'add', value: state.count }] },
    });
    const sim = new GameSim({ room: bareRoom(), items: [item] });
    const base = sim.stats.value(StatId.Stammwuerze);

    sim.pickUpItem('krug');
    sim.pickUpItem('krug');
    expect(sim.stats.value(StatId.Stammwuerze)).not.toBe(base);

    sim.removeItem('krug');
    sim.removeItem('krug');
    expect(sim.stats.value(StatId.Stammwuerze)).toBe(base);
    expect(sim.hasItem('krug')).toBe(false);
  });

  it('throws for an unknown item id', () => {
    const sim = new GameSim({ room: bareRoom() });
    expect(() => sim.pickUpItem('does-not-exist')).toThrow(/no item definition/i);
    expect(() => sim.removeItem('does-not-exist')).toThrow(/no item definition/i);
  });

  it('picking up an item shows its name and description on the pickup toast', () => {
    const item = baseItem('krug', { name: 'Bierkrug', description: 'Damage up' });
    const sim = new GameSim({ room: bareRoom(), items: [item] });

    expect(sim.pickupToast).toBeNull();
    sim.pickUpItem('krug');
    expect(sim.pickupToast).toEqual({ name: 'Bierkrug', description: 'Damage up' });
  });
});

describe('GameSim.pickUpItem / removeItem — onPickup/onRemove lifecycle', () => {
  it('fires onPickup once per pickup, and onRemove only when the last copy leaves', () => {
    const log: string[] = [];
    const item = baseItem('glas', {
      hooks: {
        onPickup: (ctx) => log.push(`pickup:${String(ctx.state.count)}`),
        onRemove: (ctx) => log.push(`remove:${String(ctx.state.count)}`),
      },
    });
    const sim = new GameSim({ room: bareRoom(), items: [item] });

    sim.pickUpItem('glas');
    sim.pickUpItem('glas');
    expect(log).toEqual(['pickup:1', 'pickup:2']);

    // One of two copies gone: still held, onRemove must not fire yet.
    expect(sim.removeItem('glas')).toBe(true);
    expect(log).toEqual(['pickup:1', 'pickup:2']);

    expect(sim.removeItem('glas')).toBe(false);
    expect(log).toEqual(['pickup:1', 'pickup:2', 'remove:0']);
  });
});

describe('GameSim active items', () => {
  it('needs full charge before it fires, and charging past the cap does not overflow', () => {
    const log: string[] = [];
    const item = baseItem('flasche', {
      active: { maxCharge: 3 },
      hooks: { onActivate: (ctx) => log.push(ctx.itemId) },
    });
    const sim = new GameSim({ room: bareRoom(), items: [item] });
    sim.pickUpItem('flasche');

    sim.chargeActiveItem('flasche', 2);
    expect(sim.useActiveItem('flasche')).toBe(false);
    expect(log).toEqual([]);

    sim.chargeActiveItem('flasche', 10); // clamps at maxCharge, does not overshoot
    expect(sim.itemState('flasche').charge).toBe(3);
    expect(sim.useActiveItem('flasche')).toBe(true);
    expect(log).toEqual(['flasche']);
    expect(sim.itemState('flasche').charge).toBe(0);
  });

  it('a consumable item removes itself from the inventory the instant it activates', () => {
    const item = baseItem('pille', { active: { maxCharge: 1, consumable: true } });
    const sim = new GameSim({ room: bareRoom(), items: [item] });
    sim.pickUpItem('pille');
    sim.chargeActiveItem('pille', 1);

    expect(sim.useActiveItem('pille')).toBe(true);
    expect(sim.hasItem('pille')).toBe(false);
  });

  it('does nothing for an item that is not held, or not active', () => {
    const passive = baseItem('nur-passiv');
    const active = baseItem('nur-aktiv', { active: { maxCharge: 1 } });
    const sim = new GameSim({ room: bareRoom(), items: [passive, active] });
    sim.pickUpItem('nur-passiv');

    expect(sim.useActiveItem('nur-passiv')).toBe(false); // held, but not active
    expect(sim.useActiveItem('nur-aktiv')).toBe(false); // active, but not held
    sim.chargeActiveItem('nur-aktiv', 5); // not held — no-op, does not throw
  });
});

describe('GameSim onTick — held-item order and per-tick dispatch', () => {
  it('dispatches every held item once a tick, in id order, regardless of pickup order', () => {
    const log: string[] = [];
    const items = [baseItem('bravo'), baseItem('alpha')].map((definition) => ({
      ...definition,
      hooks: { onTick: (ctx: { itemId: string }) => log.push(ctx.itemId) },
    }));

    const pickedInDeclarationOrder = new GameSim({ room: bareRoom(), items });
    pickedInDeclarationOrder.pickUpItem('bravo');
    pickedInDeclarationOrder.pickUpItem('alpha');
    pickedInDeclarationOrder.step(IDLE);

    const pickedReversed = new GameSim({ room: bareRoom(), items });
    pickedReversed.pickUpItem('alpha');
    pickedReversed.pickUpItem('bravo');
    pickedReversed.step(IDLE);

    expect(log).toEqual(['alpha', 'bravo', 'alpha', 'bravo']);
  });

  it('skips onTick entirely while the simulation is frozen by hitstop', () => {
    const log: string[] = [];
    const item = baseItem('taktgeber', { hooks: { onTick: (ctx) => log.push(ctx.itemId) } });
    const sim = new GameSim({ room: bareRoom(), items: [item] });
    sim.pickUpItem('taktgeber');
    sim.requestHitstop(3);

    sim.step(IDLE);
    expect(log).toEqual([]);
  });
});

describe('item hook dispatch — event hooks called directly, the way the systems call them', () => {
  it('dispatchItemShoot / dispatchItemProjectileSpawn fire for a held item', () => {
    const shootLog: number[] = [];
    const spawnLog: number[] = [];
    const item = baseItem('abzug', {
      hooks: {
        onShoot: (ctx) => shootLog.push(ctx.directionX),
        onProjectileSpawn: (ctx) => spawnLog.push(ctx.projectile),
      },
    });
    const sim = new GameSim({ room: bareRoom(), items: [item] });
    sim.pickUpItem('abzug');

    dispatchItemShoot(sim, 1, 0);
    dispatchItemProjectileSpawn(sim, 5);

    expect(shootLog).toEqual([1]);
    expect(spawnLog).toEqual([5]);
  });

  it('dispatchItemHit / dispatchItemKill carry the target and damage through', () => {
    const hits: { target: number; damage: number }[] = [];
    const kills: number[] = [];
    const item = baseItem('jaeger', {
      hooks: {
        onHit: (ctx) => hits.push({ target: ctx.target, damage: ctx.damage }),
        onKill: (ctx) => kills.push(ctx.target),
      },
    });
    const sim = new GameSim({ room: bareRoom(), items: [item] });
    sim.pickUpItem('jaeger');

    dispatchItemHit(sim, 7, 4, 10, 20);
    expect(hits).toEqual([{ target: 7, damage: 4 }]);
    expect(kills).toEqual([]);

    dispatchItemKill(sim, 7);
    expect(kills).toEqual([7]);
  });

  it('dispatchItemDamageTaken fires for player damage', () => {
    const log: number[] = [];
    const item = baseItem('polster', { hooks: { onDamageTaken: (ctx) => log.push(ctx.amount) } });
    const sim = new GameSim({ room: bareRoom(), items: [item] });
    sim.pickUpItem('polster');

    dispatchItemDamageTaken(sim, 2);
    expect(log).toEqual([2]);
  });

  it('dispatchItemRoomClear / dispatchItemFloorStart fire once per call', () => {
    const rooms: string[] = [];
    const floors: number[] = [];
    const item = baseItem('wanderer', {
      hooks: {
        onRoomClear: (ctx) => rooms.push(ctx.itemId),
        onFloorStart: (ctx) => floors.push(ctx.floor),
      },
    });
    const sim = new GameSim({ room: bareRoom(), items: [item] });
    sim.pickUpItem('wanderer');

    dispatchItemRoomClear(sim);
    dispatchItemFloorStart(sim, 3);

    expect(rooms).toEqual(['wanderer']);
    expect(floors).toEqual([3]);
  });

  it('never calls a hook the item did not declare', () => {
    const sim = new GameSim({ room: bareRoom(), items: [baseItem('leer')] });
    sim.pickUpItem('leer');
    // None of these should throw, even though `leer` has no `hooks` at all.
    expect(() => {
      dispatchItemShoot(sim, 1, 0);
      dispatchItemHit(sim, 0, 1, 0, 0);
      dispatchItemKill(sim, 0);
      dispatchItemDamageTaken(sim, 1);
      dispatchItemRoomClear(sim);
      dispatchItemFloorStart(sim, 2);
      stepItemTick(sim);
    }).not.toThrow();
  });
});

describe('item hooks wired into real gameplay systems', () => {
  it('firing a shot calls onShoot and onProjectileSpawn through stepShooting', () => {
    const shots: number[] = [];
    const spawns: number[] = [];
    const item = baseItem('lauf', {
      hooks: {
        onShoot: () => shots.push(1),
        onProjectileSpawn: () => spawns.push(1),
      },
    });
    const sim = new GameSim({ room: bareRoom(), items: [item], population: 'empty' });
    sim.pickUpItem('lauf');

    sim.step(aiming(1, 0));
    expect(shots.length).toBe(1);
    expect(spawns.length).toBe(1);
  });

  it('a lethal shot calls onHit and onKill through stepImpact', () => {
    const hits: number[] = [];
    const kills: number[] = [];
    const item = baseItem('metzger', {
      hooks: { onHit: () => hits.push(1), onKill: () => kills.push(1) },
    });
    const sim = new GameSim({ items: [item] });
    sim.pickUpItem('metzger');
    sim.tuning.shooting.shotDamage = TARGET_HEALTH;

    landOneShot(sim);

    expect(hits.length).toBe(1);
    expect(kills.length).toBe(1);
  });
});

describe('40 held items — hook dispatch stays inside its budget', () => {
  it('costs well under 0.5 ms a tick to dispatch onTick across 40 items (#26 acceptance criteria)', () => {
    const items = Array.from({ length: 40 }, (_unused, index) =>
      baseItem(`item-${String(index).padStart(2, '0')}`, {
        hooks: { onTick: (ctx) => (ctx.state.charge += 1) },
      }),
    );
    const sim = new GameSim({ room: bareRoom(), items });
    for (const definition of items) {
      sim.pickUpItem(definition.id);
    }
    expect(sim.inventory.count).toBe(40);

    // Warm up the JIT before measuring, same reasoning the bench harness uses.
    for (let warm = 0; warm < 50; warm++) {
      stepItemTick(sim);
    }

    const iterations = 500;
    const start = performance.now();
    for (let tick = 0; tick < iterations; tick++) {
      stepItemTick(sim);
    }
    const elapsed = performance.now() - start;
    const perTick = elapsed / iterations;

    expect(perTick).toBeLessThan(0.5);
  });
});

describe('item hooks respect promilleRequirement (#32)', () => {
  it('a sober item ticks while Nüchtern and goes silent the instant Promille rises', () => {
    const log: string[] = [];
    const item = baseItem('fastenkur', {
      promilleRequirement: 'sober',
      hooks: { onTick: (ctx) => log.push(ctx.itemId) },
    });
    const sim = new GameSim({ room: bareRoom(), items: [item] });
    sim.pickUpItem('fastenkur');

    stepItemTick(sim);
    expect(log).toEqual(['fastenkur']);

    sim.tuning.promille.current = 0.5; // Angeheitert — no longer sober
    stepItemTick(sim);
    expect(log).toEqual(['fastenkur']); // the second tick never fired

    sim.tuning.promille.current = 0; // back to Nüchtern
    stepItemTick(sim);
    expect(log).toEqual(['fastenkur', 'fastenkur']);
  });

  it('a rausch item stays silent below Vollrausch, and fires at or above it — the failure mode #32 exists to prevent', () => {
    const log: number[] = [];
    const item = baseItem('vollgas', {
      promilleRequirement: 'rausch',
      hooks: { onKill: (ctx) => log.push(ctx.target) },
    });
    const sim = new GameSim({ room: bareRoom(), items: [item] });
    sim.pickUpItem('vollgas');

    dispatchItemKill(sim, 7); // Nüchtern by default — not rausch, must not leak
    expect(log).toEqual([]);

    sim.tuning.promille.current = 3.0; // Vollrausch
    dispatchItemKill(sim, 7);
    expect(log).toEqual([7]);
  });

  it('never fires onActivate on a rausch item while sober even fully charged, and does the instant rausch is reached', () => {
    const log: string[] = [];
    const item = baseItem('stosstrupp', {
      promilleRequirement: 'rausch',
      active: { maxCharge: 1 },
      hooks: { onActivate: (ctx) => log.push(ctx.itemId) },
    });
    const sim = new GameSim({ room: bareRoom(), items: [item] });
    sim.pickUpItem('stosstrupp');
    sim.chargeActiveItem('stosstrupp', 1);

    expect(sim.useActiveItem('stosstrupp')).toBe(false); // charged, but sober
    expect(log).toEqual([]);
    // A dormant press spends nothing — the charge is exactly where it was.
    expect(sim.itemState('stosstrupp').charge).toBe(1);

    sim.tuning.promille.current = 3.0; // Vollrausch
    expect(sim.useActiveItem('stosstrupp')).toBe(true);
    expect(log).toEqual(['stosstrupp']);
  });

  it('modifyStats folds in only while the requirement is met, and the pipeline notices a tier crossing on its own', () => {
    const item = baseItem('mutprobe', {
      promilleRequirement: 'rausch',
      hooks: { modifyStats: () => [{ stat: 'stammwuerze', op: 'add', value: 5 }] },
    });
    const sim = new GameSim({ room: bareRoom(), items: [item] });
    const base = sim.stats.value(StatId.Stammwuerze);
    sim.pickUpItem('mutprobe');

    // Picked up while sober: the bonus never applies in the first place.
    expect(sim.stats.value(StatId.Stammwuerze)).toBe(base);

    // Nothing here calls `refreshItemStats` — crossing the tier boundary on
    // its own is exactly what `syncItemPromilleGate` has to notice. 3.5 is
    // comfortably inside Vollrausch, not on its 3.0 edge: the per-tick decay
    // `stepPromille` runs at the top of every `step` would otherwise nudge a
    // value sitting exactly on the boundary back under it before this same
    // tick's gate ever reads it. The assertion is `>`, not an exact sum,
    // because Vollrausch's own damage multiplier (a separate stat source,
    // `syncPromilleModifiers`) also lands on `stammwuerze` here — this test
    // only needs to show the item's own `add(5)` took effect, not pin down
    // the two sources' combined arithmetic.
    sim.tuning.promille.current = 3.5;
    sim.step(IDLE);
    expect(sim.stats.value(StatId.Stammwuerze)).toBeGreaterThan(base);

    sim.tuning.promille.current = 0; // back to Nüchtern
    sim.step(IDLE);
    expect(sim.stats.value(StatId.Stammwuerze)).toBe(base);
  });

  it('dispatchItemBeerPickup fires for a held item, gated by promilleRequirement like every other hook', () => {
    const log: string[] = [];
    const anyItem = baseItem('konterbier-test', {
      hooks: { onBeerPickup: (ctx) => log.push(ctx.itemId) },
    });
    const soberItem = baseItem('sober-drinker', {
      promilleRequirement: 'sober',
      hooks: { onBeerPickup: (ctx) => log.push(ctx.itemId) },
    });
    const sim = new GameSim({ room: bareRoom(), items: [anyItem, soberItem] });
    sim.pickUpItem('konterbier-test');
    sim.pickUpItem('sober-drinker');

    dispatchItemBeerPickup(sim);
    expect(log).toEqual(['konterbier-test', 'sober-drinker']);

    log.length = 0;
    sim.tuning.promille.current = 3.0; // Vollrausch — the sober one goes quiet
    dispatchItemBeerPickup(sim);
    expect(log).toEqual(['konterbier-test']);
  });
});
