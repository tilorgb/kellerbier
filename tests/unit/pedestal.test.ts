import { describe, expect, it } from 'vitest';
import { GameSim } from '../../src/sim/game/sim.js';
import type { ItemDefinition } from '../../src/sim/item/definition.js';
import type {
  RoomSpecialRole,
  SingleCellRoomTemplate,
} from '../../src/content/rooms/definition.js';
import { InputAction, createInputFrame, setActionDown } from '../../src/sim/input/frame.js';

const IDLE = createInputFrame();

/** A minimal, valid item — mirrors `tests/unit/item-hooks.test.ts`'s `baseItem`. */
function baseItem(id: string, overrides: Partial<ItemDefinition> = {}): ItemDefinition {
  return {
    id,
    name: id,
    description: `${id} description`,
    sprite: 'test',
    pools: ['treasure'],
    quality: 0,
    promilleRequirement: 'any',
    ...overrides,
  };
}

/** Local coordinates in the authored sub-layout — `compileRoomTemplate` offsets these by `ROOM_MARGIN_X/Y`. */
const PEDESTAL_X = 160;
const PEDESTAL_Y = 90;

/**
 * A bare, open `1x1` room with one pedestal, authored to `compileRoomTemplate`'s
 * expected shape. `id` must differ across rooms loaded into the same run — a
 * room with no enemies is marked cleared (`roomClearedIds`) the instant it
 * first loads, and a second load under the *same* id would be treated as a
 * re-entry into an already-cleared room, which never re-spawns a pedestal
 * (matching how a cleared room's pickups don't reappear either).
 */
function pedestalRoom(
  specialRole: RoomSpecialRole | undefined,
  id = 'test-pedestal-room',
): SingleCellRoomTemplate {
  return {
    id,
    tileGrid: [
      '###############',
      '#.............#',
      '#.............#',
      '#.............#',
      '#.............#',
      '#.............#',
      '#.............#',
      '#.............#',
      '###############',
    ],
    obstacles: [],
    enemySpawns: [],
    spawnGroups: [],
    pickupSpawns: [],
    hazards: [],
    decorativeProps: [{ x: PEDESTAL_X, y: PEDESTAL_Y, type: 'pedestal' }],
    metadata: {
      floorTags: ['test'],
      shape: '1x1',
      doors: { north: false, east: false, south: false, west: false },
      difficultyTier: 1,
      weight: 1,
      ...(specialRole === undefined ? {} : { specialRole }),
    },
  };
}

function pressUse(): typeof IDLE {
  const frame = createInputFrame();
  setActionDown(frame, InputAction.Use, true);
  return frame;
}

/**
 * Steps past a pedestal pickup/swap's hitstop pause and one further idle
 * tick — while frozen, `step` returns before it reaches the line that
 * updates `previousButtons`, so the tick that *ends* the freeze still
 * carries a stale, pre-freeze `previousButtons`. One more non-frozen tick
 * with nothing held is what a player's own button release would produce
 * during the freeze in a real session; without it, a second `use` press
 * right after this helper is indistinguishable from the first one still
 * being held down and no edge fires.
 */
function runOutHitstop(sim: GameSim): void {
  while (sim.frozen) {
    sim.step(IDLE);
  }
  sim.step(IDLE);
}

function placePlayer(sim: GameSim, x: number, y: number): void {
  const base = sim.playerIndex * 4;
  sim.transform.data[base] = x;
  sim.transform.data[base + 1] = y;
  sim.transform.data[base + 2] = x;
  sim.transform.data[base + 3] = y;
}

/** Stands the player exactly on the room's (single) compiled pedestal position. */
function placePlayerAtPedestal(sim: GameSim): void {
  const pedestal = sim.activePedestals[0];
  if (pedestal === undefined) {
    throw new Error('test room has no pedestal to stand on');
  }
  placePlayer(sim, pedestal.x, pedestal.y);
}

function simWithPedestal(
  items: readonly ItemDefinition[],
  specialRole: RoomSpecialRole | undefined = 'treasure',
  seed = 1,
): GameSim {
  const sim = new GameSim({ seed, roomTemplate: pedestalRoom(specialRole), items });
  placePlayerAtPedestal(sim);
  return sim;
}

describe('pedestal pickup (#28)', () => {
  it('offers an item on construction, readable through activePedestals', () => {
    const sim = simWithPedestal([baseItem('bierkrug-test')]);
    expect(sim.activePedestals).toHaveLength(1);
    const pedestal = sim.activePedestals[0];
    expect(pedestal?.itemIndex).toBe(sim.items.indexOf('bierkrug-test'));
  });

  it('takes the item through the use button — pickUpItem behind a button, not a direct call', () => {
    const sim = simWithPedestal([baseItem('bierkrug-test')]);
    const index = sim.items.indexOf('bierkrug-test');
    expect(sim.inventory.has(index)).toBe(false);

    sim.step(pressUse());

    expect(sim.inventory.has(index)).toBe(true);
    expect(sim.activePedestals[0]?.itemIndex).toBe(-1);
    expect(sim.pedestalReveal).toEqual({
      name: 'bierkrug-test',
      description: 'bierkrug-test description',
    });
  });

  it('refusing — never pressing use — leaves the pedestal and the inventory untouched', () => {
    const sim = simWithPedestal([baseItem('bierkrug-test')]);
    const index = sim.items.indexOf('bierkrug-test');

    // Stand right next to it for a while and walk off without ever pressing `use`.
    for (let tick = 0; tick < 30; tick++) {
      sim.step(IDLE);
    }

    expect(sim.inventory.has(index)).toBe(false);
    expect(sim.activePedestals[0]?.itemIndex).toBe(index);
  });

  it('never offers the same item twice in a run, across separate pedestals', () => {
    const items = [baseItem('a'), baseItem('b')];
    const sim = simWithPedestal(items, 'treasure', 7);
    sim.step(pressUse());
    expect(
      sim.inventory.has(sim.items.indexOf('a')) || sim.inventory.has(sim.items.indexOf('b')),
    ).toBe(true);
    const takenId = sim.inventory.has(sim.items.indexOf('a')) ? 'a' : 'b';
    const remainingId = takenId === 'a' ? 'b' : 'a';

    // A second, freshly-loaded treasure room in the same run must never
    // re-offer the item already taken.
    sim.loadRoom(pedestalRoom('treasure', 'test-pedestal-room-2'), 1);
    placePlayerAtPedestal(sim);
    const secondOffer = sim.activePedestals[0];
    expect(secondOffer?.itemIndex).toBe(sim.items.indexOf(remainingId));
  });

  it('falls back gracefully — an exhausted pool spawns an empty pedestal, never throws', () => {
    const sim = simWithPedestal([baseItem('only-one')], 'treasure', 3);
    sim.step(pressUse());
    expect(sim.inventory.has(sim.items.indexOf('only-one'))).toBe(true);

    expect(() => {
      sim.loadRoom(pedestalRoom('treasure', 'test-pedestal-room-2'), 1);
    }).not.toThrow();
    placePlayerAtPedestal(sim);
    expect(sim.activePedestals[0]?.itemIndex).toBe(-1);

    // An empty pedestal is not "available" — pressing use near it is a no-op,
    // not a second (impossible) pickup of the only item in the pool.
    runOutHitstop(sim);
    sim.step(pressUse());
    expect(sim.inventory.stateOf(sim.items.indexOf('only-one')).count).toBe(1);
  });

  it('swaps an active item for another rather than holding both, and the old one is lost', () => {
    const active1 = baseItem('active-one', { active: { maxCharge: 1 } });
    const active2 = baseItem('active-two', { active: { maxCharge: 1 } });
    const sim = simWithPedestal([active1, active2], 'treasure', 11);

    sim.step(pressUse());
    const firstTaken = sim.heldActiveItemId();
    expect(firstTaken).not.toBeNull();
    runOutHitstop(sim);

    sim.loadRoom(pedestalRoom('treasure', 'test-pedestal-room-2'), 1);
    placePlayerAtPedestal(sim);
    const secondOffered = sim.activePedestals[0]?.itemIndex;
    expect(secondOffered).toBeGreaterThanOrEqual(0);
    const secondId = sim.items.at(secondOffered ?? -1).id;
    expect(secondId).not.toBe(firstTaken);

    sim.step(pressUse());

    expect(sim.heldActiveItemId()).toBe(secondId);
    if (firstTaken !== null) {
      expect(sim.inventory.has(sim.items.indexOf(firstTaken))).toBe(false);
    }
  });

  it('is deterministic: the same seed offers the same item at the same pedestal', () => {
    const items = [baseItem('a', { quality: 0 }), baseItem('b', { quality: 1 })];
    const first = simWithPedestal(items, 'treasure', 555);
    const second = simWithPedestal(items, 'treasure', 555);
    expect(first.activePedestals[0]?.itemIndex).toBe(second.activePedestals[0]?.itemIndex);
  });

  it('draws the boss pool for a boss-role room and the secret pool for a secret-role room', () => {
    const bossOnly = baseItem('boss-item', { pools: ['boss'] });
    const secretOnly = baseItem('secret-item', { pools: ['secret'] });

    const bossSim = simWithPedestal([bossOnly, secretOnly], 'boss', 2);
    expect(bossSim.activePedestals[0]?.itemIndex).toBe(bossSim.items.indexOf('boss-item'));

    const secretSim = simWithPedestal([bossOnly, secretOnly], 'secret', 2);
    expect(secretSim.activePedestals[0]?.itemIndex).toBe(secretSim.items.indexOf('secret-item'));
  });

  it('activates a held, fully-charged active item through the use button when no pedestal is in range', () => {
    const consumable = baseItem('feuerwasser-test', { active: { maxCharge: 1, consumable: true } });
    const sim = new GameSim({
      seed: 1,
      roomTemplate: pedestalRoom(undefined),
      items: [consumable],
    });
    // Far outside `interactRadius` of the room's pedestal, so `use` falls through to the active item.
    placePlayer(sim, 10, 10);
    const index = sim.items.indexOf('feuerwasser-test');
    sim.pickUpItem('feuerwasser-test');
    sim.chargeActiveItem('feuerwasser-test', 1);
    expect(sim.itemState('feuerwasser-test').charge).toBe(1);

    sim.step(pressUse());

    // `consumable: true` removes it the instant it fires.
    expect(sim.inventory.has(index)).toBe(false);
  });
});
