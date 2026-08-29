import { describe, expect, it } from 'vitest';
import { GameSim } from '../../src/sim/game/sim.js';
import type { SingleCellRoomTemplate } from '../../src/content/rooms/definition.js';
import { InputAction, createInputFrame, setActionDown } from '../../src/sim/input/frame.js';

const IDLE = createInputFrame();

function pressUse(): typeof IDLE {
  const frame = createInputFrame();
  setActionDown(frame, InputAction.Use, true);
  return frame;
}

function runOutHitstop(sim: GameSim): void {
  while (sim.frozen) {
    sim.step(IDLE);
  }
  sim.step(IDLE);
}

/** Local coordinates in the authored sub-layout — offset by `ROOM_MARGIN_X/Y` once compiled. */
const PICKUP_A = { x: 60, y: 90 };
const PICKUP_B = { x: 220, y: 90 };
const PEDESTAL = { x: 140, y: 40 };

/**
 * A bare `1x1` room, no enemies (so it reads as cleared the instant it
 * loads), with two free pickups and a pedestal — enough loot of two
 * different kinds (a template-authored pickup, a pedestal item) to check
 * both survive a leave-and-return, independently of one another.
 */
function lootRoom(id: string): SingleCellRoomTemplate {
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
    pickupSpawns: [
      { x: PICKUP_A.x, y: PICKUP_A.y, type: 'brezn' },
      { x: PICKUP_B.x, y: PICKUP_B.y, type: 'radi' },
    ],
    hazards: [],
    decorativeProps: [{ x: PEDESTAL.x, y: PEDESTAL.y, type: 'pedestal' }],
    metadata: {
      floorTags: ['test'],
      shape: '1x1',
      doors: { north: false, east: false, south: false, west: false },
      difficultyTier: 1,
      weight: 1,
      specialRole: 'treasure',
    },
  };
}

/** An unrelated second room — going here and back is what "leaving" means. */
function elsewhere(id = 'test-elsewhere'): SingleCellRoomTemplate {
  return { ...lootRoom(id), pickupSpawns: [], decorativeProps: [] };
}

function placePlayer(sim: GameSim, x: number, y: number): void {
  const base = sim.playerIndex * 4;
  sim.transform.data[base] = x;
  sim.transform.data[base + 1] = y;
  sim.transform.data[base + 2] = x;
  sim.transform.data[base + 3] = y;
}

function countPickups(sim: GameSim): number {
  let count = 0;
  sim.world.forEach(sim.pickupKind.bit, () => {
    count += 1;
  });
  return count;
}

/**
 * The live position of the one pickup of kind `id` — `compileRoomTemplate`
 * offsets authored `x`/`y` by a margin, so a raw authored coordinate never
 * matches a spawned entity's real position; reading it back through the
 * entity itself (the same way `pedestal.test.ts`'s `placePlayerAtPedestal`
 * does for a pedestal) is what actually lines the player up with it.
 */
function pickupPosition(sim: GameSim, id: string): { x: number; y: number } {
  const definitionIndex = sim.pickups.indexOf(id);
  const matches: { x: number; y: number }[] = [];
  sim.world.forEach(sim.pickupKind.bit, (index) => {
    if ((sim.pickupKind.data[index] ?? -1) === definitionIndex) {
      matches.push({ x: sim.positionX(index), y: sim.positionY(index) });
    }
  });
  const found = matches[0];
  if (found === undefined) {
    throw new Error(`no live pickup of kind "${id}"`);
  }
  return found;
}

/** The set of pickup kinds currently live in the room. */
function pickupKinds(sim: GameSim): string[] {
  const kinds: string[] = [];
  sim.world.forEach(sim.pickupKind.bit, (index) => {
    const definitionIndex = sim.pickupKind.data[index] ?? -1;
    kinds.push(sim.pickups.at(definitionIndex).id);
  });
  return kinds;
}

describe('room loot persistence', () => {
  it('leaves both a template pickup and the pedestal item untouched, and both are there on return', () => {
    const room = lootRoom('test-loot-room');
    const sim = new GameSim({ roomTemplate: room, floor: 1 });

    expect(countPickups(sim)).toBe(2);
    expect(sim.activePedestals[0]?.itemIndex).toBeGreaterThanOrEqual(0);
    const offeredItem = sim.activePedestals[0]?.itemIndex;

    sim.loadRoom(elsewhere(), 1);
    sim.loadRoom(room, 1);

    expect(countPickups(sim)).toBe(2);
    expect(sim.activePedestals[0]?.itemIndex).toBe(offeredItem);
  });

  it('a pickup collected before leaving does not come back — only what was left does', () => {
    const room = lootRoom('test-loot-room');
    const sim = new GameSim({ roomTemplate: room, floor: 1 });

    const breznAt = pickupPosition(sim, 'brezn');
    placePlayer(sim, breznAt.x, breznAt.y);
    sim.step(IDLE);
    expect(countPickups(sim)).toBe(1);
    expect(pickupKinds(sim)).toEqual(['radi']);

    sim.loadRoom(elsewhere(), 1);
    sim.loadRoom(room, 1);

    expect(countPickups(sim)).toBe(1);
    expect(pickupKinds(sim)).toEqual(['radi']);
  });

  it('a pedestal item taken before leaving stays taken, not re-offered', () => {
    const room = lootRoom('test-loot-room');
    const sim = new GameSim({ roomTemplate: room, floor: 1 });
    const pedestal = sim.activePedestals[0];
    if (pedestal === undefined) {
      throw new Error('test room has no pedestal');
    }
    placePlayer(sim, pedestal.x, pedestal.y);
    const takenIndex = pedestal.itemIndex;
    expect(takenIndex).toBeGreaterThanOrEqual(0);

    sim.step(pressUse());
    expect(sim.inventory.has(takenIndex)).toBe(true);
    runOutHitstop(sim);

    sim.loadRoom(elsewhere(), 1);
    sim.loadRoom(room, 1);

    expect(sim.activePedestals[0]?.itemIndex).toBe(-1);
    // Still held — taking it once, then leaving and coming back, must not
    // grant it a second time or take it away.
    expect(sim.inventory.has(takenIndex)).toBe(true);
  });

  it('loot dropped by a kill, not just template-authored loot, survives a round trip', () => {
    const room = elsewhere('test-drop-room');
    const sim = new GameSim({ roomTemplate: room, floor: 1 });
    // Stands in for an enemy's drop or the room-clear roll — from `GameSim`'s
    // own perspective a pickup is a pickup regardless of who called
    // `spawnPickup`, which is exactly what `snapshotRoomLoot` relies on.
    sim.spawnPickup('beer', 100, 60);
    sim.world.flush();
    expect(countPickups(sim)).toBe(1);

    sim.loadRoom(elsewhere('test-other-room'), 1);
    sim.loadRoom(room, 1);

    expect(countPickups(sim)).toBe(1);
  });

  it('a fully looted room stays empty on a later visit', () => {
    const room = elsewhere('test-empty-room');
    const sim = new GameSim({ roomTemplate: room, floor: 1 });
    sim.spawnPickup('beer', 100, 60);
    sim.world.flush();
    placePlayer(sim, 100, 60);
    sim.step(IDLE);
    expect(countPickups(sim)).toBe(0);

    sim.loadRoom(elsewhere('test-other-room-2'), 1);
    sim.loadRoom(room, 1);

    expect(countPickups(sim)).toBe(0);
  });

  it('a restored pickup does not pop in again — only a genuinely new one does', () => {
    const room = lootRoom('test-loot-room');
    const sim = new GameSim({ roomTemplate: room, floor: 1 });

    // Freshly authored on first load: it just appeared, so it pops.
    sim.world.forEach(sim.pickupKind.bit, (index) => {
      expect(sim.spawnBounce.data[index] ?? 0).toBeGreaterThan(0);
    });

    sim.loadRoom(elsewhere(), 1);
    sim.loadRoom(room, 1);

    // Same two pickups, restored from `roomLootSnapshots` rather than
    // spawned anew — they were already on the floor, so walking back in
    // must not play the spawn pop a second time.
    expect(countPickups(sim)).toBe(2);
    sim.world.forEach(sim.pickupKind.bit, (index) => {
      expect(sim.spawnBounce.data[index] ?? 0).toBe(0);
    });
  });

  it('clearFloorProgress forgets leftover loot too, the same as it forgets a cleared room', () => {
    const room = lootRoom('test-loot-room');
    const sim = new GameSim({ roomTemplate: room, floor: 1 });
    expect(countPickups(sim)).toBe(2);

    sim.loadRoom(elsewhere(), 1);
    sim.clearFloorProgress();
    // `roomId` is keyed by the template's own id (`GameSim.clearFloorProgress`'s
    // doc comment) — reloading the same template here stands in for a
    // different physical room, on a freshly generated floor, that happens to
    // draw the same template.
    sim.loadRoom(room, 1);

    // No snapshot to restore from (forgotten), and the room was never marked
    // cleared before this load either — it rolls fresh from the template,
    // same as a genuine first visit.
    expect(countPickups(sim)).toBe(2);
    expect(sim.activePedestals[0]?.itemIndex).toBeGreaterThanOrEqual(0);
  });
});
