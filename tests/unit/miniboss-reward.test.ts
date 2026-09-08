import { describe, expect, it } from 'vitest';
import cellarMiniboss from '../../src/content/rooms/cellar-miniboss.json';
import { blutwurz } from '../../src/content/items/blutwurz.js';
import { GameSim } from '../../src/sim/game/sim.js';
import { createInputFrame } from '../../src/sim/input/frame.js';

const IDLE = createInputFrame();

/** An empty single-cell room, only its id different — safe to load with no combat side effects. */
function emptyRoom(id: string): unknown {
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
    decorativeProps: [],
    metadata: {
      floorTags: ['cellar'],
      shape: '1x1',
      doors: { north: false, east: false, south: false, west: false },
      difficultyTier: 1,
      weight: 1,
    },
  };
}

function livePickupKinds(sim: GameSim): string[] {
  const kinds: string[] = [];
  sim.world.forEach(sim.pickupKind.bit, (index) => {
    const definitionIndex = sim.pickupKind.data[index] ?? -1;
    if (definitionIndex >= 0) {
      kinds.push(sim.pickups.at(definitionIndex).id);
    }
  });
  return kinds;
}

/** Kills every live enemy and steps once — the tick a mini-boss room's own clear roll resolves on. */
function clearMiniboss(sim: GameSim): void {
  const enemies: number[] = [];
  sim.world.forEach(sim.enemyMask, (index) => enemies.push(index));
  expect(enemies.length).toBeGreaterThan(0);
  for (const index of enemies) {
    sim.kill(index);
  }
  sim.world.flush();
  sim.step(IDLE);
}

describe('mini-boss reward roll (#278)', () => {
  it('the first mini-boss of the floor always drops the key, and a forced hit fills its pedestal', () => {
    const sim = new GameSim({ roomTemplate: cellarMiniboss, floor: 1 });
    sim.tuning.minibossReward.firstItemChance = 1;

    clearMiniboss(sim);

    expect(livePickupKinds(sim)).toContain('meisterschluessel');
    expect(sim.activePedestals.length).toBe(1);
    // A hit pays the pedestal only — the consolation bundle is the *miss*
    // case, never both.
    expect(livePickupKinds(sim)).not.toContain('mass-half');
  });

  it('a forced miss still pays the guaranteed key plus the consolation bundle, never a bare nothing', () => {
    const sim = new GameSim({ roomTemplate: cellarMiniboss, floor: 1 });
    sim.tuning.minibossReward.firstItemChance = 0;

    clearMiniboss(sim);

    const kinds = livePickupKinds(sim);
    expect(kinds).toContain('meisterschluessel');
    expect(kinds).toContain('mass-half');
    expect(kinds).toContain('biermarke-5');
    expect(kinds).toContain('kellerschluessel');
    expect(sim.activePedestals.length).toBe(0);
  });

  it("an XL floor's second, distinct mini-boss room drops no key and rolls the lower rate", () => {
    const sim = new GameSim({ roomTemplate: emptyRoom('start'), floor: 1, population: 'empty' });
    sim.tuning.minibossReward.firstItemChance = 1;
    sim.tuning.minibossReward.secondItemChance = 1;

    // Two physical mini-boss room slots on the same floor sharing one
    // template — exactly the XL-floor collision `loadRoom`'s
    // `roomInstanceId` fixes (today's content pool has only one authored
    // mini-boss template per floor tag, so both of an XL floor's slots draw
    // it). Distinct instance ids are what make them two real fights instead
    // of the second reading as already-cleared the moment the first is.
    sim.loadRoom(cellarMiniboss, 1, null, [], undefined, { col: 0, row: 0 }, false, 'miniboss-a');
    clearMiniboss(sim);
    expect(livePickupKinds(sim)).toContain('meisterschluessel');
    expect(sim.activePedestals.length).toBe(1);

    sim.loadRoom(cellarMiniboss, 1, null, [], undefined, { col: 0, row: 0 }, false, 'miniboss-b');
    // The second room is a genuinely fresh fight, not a pre-cleared room —
    // this is exactly the collision `roomInstanceId` prevents.
    expect(sim.liveEnemyCount).toBeGreaterThan(0);
    clearMiniboss(sim);

    // No second key — it would have nothing left to unlock.
    expect(livePickupKinds(sim)).not.toContain('meisterschluessel');
    // But the reward roll still runs, just at the lower forced-certain rate.
    expect(sim.activePedestals.length).toBe(1);
  });

  it('a Blutwurz spirit walk re-fighting the *same* mini-boss room still leaves the key collectible (#76)', () => {
    // #278's new gate (`minibossKeyGrantedThisFloor`) only ever matters the
    // *first* time a distinct mini-boss room reaches the room-clear drain —
    // `roomClearedIds` blocks every later clear of that same physical room
    // from reaching it again, Blutwurz included. What actually makes #76's
    // "cleared rooms repopulate" hold for the key is a different, older
    // mechanism this change must not disturb: an uncollected pickup is
    // captured by `snapshotRoomLoot` and put back by `restoreOrSpawnRoomLoot`
    // on every reload of the same room, key included, so a second fight
    // still ends with the key available to pick up — never re-rolled, never
    // silently withheld.
    const sim = new GameSim({ roomTemplate: cellarMiniboss, floor: 1, items: [blutwurz] });
    sim.tuning.minibossReward.firstItemChance = 1;
    clearMiniboss(sim);
    expect(livePickupKinds(sim)).toContain('meisterschluessel');
    expect(sim.roomCleared).toBe(true);

    sim.startBlutwurz();
    expect(sim.blutwurzActive).toBe(true);

    // Force-reload the identical template with no explicit instance id —
    // the same room, the same fallback identity `loadRoom` has always used —
    // so this is unambiguously a repeat of the *same* physical room, not a
    // second XL slot.
    sim.loadRoom(cellarMiniboss, 1, null, [], undefined, { col: 0, row: 0 });
    expect(sim.liveEnemyCount).toBeGreaterThan(0);
    clearMiniboss(sim);

    // The player starts back at the mini-boss's own spawn point (its
    // authored key spot), so the still-uncollected key from the first fight
    // is standing right where they land and is picked up on this very tick.
    expect(sim.meisterschluessel).toBe(true);
  });

  it('never hosts the Losbrunnen even when the floor rolled one', () => {
    const sim = new GameSim({ roomTemplate: emptyRoom('start'), floor: 2, population: 'empty' });
    sim.tuning.machine.spawnChance = 1;
    // A real floor-start transition (2 -> 1) so the roll above is the one
    // that actually decides `floorHasLosbrunnen` for the mini-boss room
    // loaded just below, on the same floor.
    sim.loadRoom(emptyRoom('start-2'), 1, null, [], undefined, { col: 0, row: 0 });
    sim.tuning.minibossReward.firstItemChance = 1;

    sim.loadRoom(cellarMiniboss, 1, null, [], undefined, { col: 0, row: 0 });
    clearMiniboss(sim);

    expect(sim.activePedestals.length).toBe(1); // the item roll itself still ran
    expect(sim.activeMachine).toBeNull(); // but never as a Losbrunnen
  });

  it('is deterministic under replay: the same seed and route land the same roll, hit or miss', () => {
    function run(seed: number): {
      pedestalItemIndex: number;
      key: boolean;
      consolationKinds: string[];
    } {
      const sim = new GameSim({ roomTemplate: cellarMiniboss, floor: 1, seed });
      clearMiniboss(sim);
      const kinds: string[] = [];
      sim.world.forEach(sim.pickupKind.bit, (index) => {
        const d = sim.pickupKind.data[index] ?? -1;
        if (d >= 0) kinds.push(sim.pickups.at(d).id);
      });
      return {
        pedestalItemIndex: sim.activePedestals[0]?.itemIndex ?? -1,
        key: kinds.includes('meisterschluessel'),
        consolationKinds: kinds.filter((k) => k !== 'meisterschluessel').sort(),
      };
    }

    // Real (un-forced) rates — two different seeds, each replayed twice, to
    // exercise both the seed-to-seed spread and the same-seed reproduction
    // `random.items` guarantees.
    for (const seed of [1, 2]) {
      expect(run(seed)).toEqual(run(seed));
    }
  });
});
