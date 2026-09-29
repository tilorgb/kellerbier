import { describe, expect, it } from 'vitest';
import { GameSim } from '../../src/sim/game/sim.js';
import type { SingleCellRoomTemplate } from '../../src/content/rooms/definition.js';
import { ROOM_TEMPLATES } from '../../src/content/rooms/index.js';
import { ROOM_MARGIN_X, ROOM_MARGIN_Y } from '../../src/sim/room/template.js';
import { entityIndex } from '../../src/sim/ecs/entity.js';
import { createInputFrame } from '../../src/sim/input/frame.js';
import { RoomGeometry } from '../../src/sim/room/geometry.js';
import { applyDamageAt } from '../../src/sim/systems/impact.js';
import { stepLootDrops } from '../../src/sim/systems/loot.js';

/**
 * Chest and Locked Chest (#353): open on touch, a Locked Chest spends a key
 * or is refused and shoved aside, the payout is always something, an opened
 * chest stays behind inert and survives a revisit.
 */

const IDLE = createInputFrame();

/** A sim whose training targets have been cleared out of the way. */
function emptySim(): GameSim {
  const sim = new GameSim({ room: new RoomGeometry(0, 0, 320, 180) });
  const playerSlot = sim.playerIndex;
  const doomed: number[] = [];
  sim.world.forEach(sim.collidableMask, (index) => {
    if (index !== playerSlot) {
      doomed.push(index);
    }
  });
  for (const index of doomed) {
    sim.world.destroy(sim.world.entityAt(index));
  }
  sim.world.flush();
  return sim;
}

function kinds(sim: GameSim): string[] {
  const out: string[] = [];
  sim.world.forEach(sim.pickupKind.bit, (index) => {
    out.push(sim.pickups.at(sim.pickupKind.data[index] ?? -1).id);
  });
  return out;
}

function positionOf(sim: GameSim, id: string): { x: number; y: number } {
  const definitionIndex = sim.pickups.indexOf(id);
  const matches: { x: number; y: number }[] = [];
  sim.world.forEach(sim.pickupKind.bit, (index) => {
    if ((sim.pickupKind.data[index] ?? -1) === definitionIndex) {
      matches.push({ x: sim.positionX(index), y: sim.positionY(index) });
    }
  });
  const found = matches[0];
  if (found === undefined) {
    throw new Error(`no live "${id}"`);
  }
  return found;
}

function placePlayer(sim: GameSim, x: number, y: number): void {
  const base = sim.playerIndex * 4;
  sim.transform.data[base] = x;
  sim.transform.data[base + 1] = y;
  sim.transform.data[base + 2] = x;
  sim.transform.data[base + 3] = y;
}

/** Spawns `id` right on the player and steps once. */
function touch(sim: GameSim, id: string): void {
  const player = sim.playerIndex;
  sim.spawnPickup(id, sim.positionX(player), sim.positionY(player));
  sim.world.flush();
  sim.step(IDLE);
}

describe('Chest (#353)', () => {
  it('opens on touch into 2-3 pickups and stays behind, opened', () => {
    for (let seed = 0; seed < 20; seed++) {
      const sim = emptySim();
      touch(sim, 'chest');
      const live = kinds(sim);
      expect(live).not.toContain('chest');
      expect(live.filter((id) => id === 'chest-open')).toHaveLength(1);
      const payout = live.filter((id) => id !== 'chest-open');
      expect(payout.length).toBeGreaterThanOrEqual(2);
      expect(payout.length).toBeLessThanOrEqual(3);
    }
  });

  it('never drifts toward the player on the magnet', () => {
    const sim = emptySim();
    // The magnet ships switched off (radius 0); turn it on so this proves
    // something.
    sim.tuning.pickup.magnetRadius = 40;
    const player = sim.playerIndex;
    const x = sim.positionX(player) + 30;
    const y = sim.positionY(player);
    sim.spawnPickup('chest', x, y);
    sim.world.flush();
    for (let tick = 0; tick < 10; tick++) {
      sim.step(IDLE);
    }
    expect(positionOf(sim, 'chest')).toEqual({ x, y });
  });

  it('an opened chest is inert: never collected, never pushed', () => {
    const sim = emptySim();
    const player = sim.playerIndex;
    const x = sim.positionX(player);
    const y = sim.positionY(player);
    sim.spawnPickup('chest-open', x, y);
    sim.world.flush();
    for (let tick = 0; tick < 10; tick++) {
      sim.step(IDLE);
    }
    expect(positionOf(sim, 'chest-open')).toEqual({ x, y });
  });
});

describe('Locked Chest (#353)', () => {
  it('without a key it stays shut and is shoved aside like a full-pool Wurst', () => {
    const sim = emptySim();
    const player = sim.playerIndex;
    const startX = sim.positionX(player) + 2;
    const startY = sim.positionY(player);
    sim.spawnPickup('locked-chest', startX, startY);
    sim.world.flush();
    sim.step(IDLE);
    expect(sim.keys).toBe(0);
    expect(kinds(sim)).toEqual(['locked-chest']);
    expect(positionOf(sim, 'locked-chest').x).toBeGreaterThan(startX);
  });

  it('with a key it spends exactly one and opens into 3-4 pickups', () => {
    for (let seed = 0; seed < 20; seed++) {
      const sim = emptySim();
      sim.tuning.chest.lockedItemChance = 0;
      sim.addKeys(2);
      touch(sim, 'locked-chest');
      expect(sim.keys).toBe(1);
      const live = kinds(sim);
      expect(live).not.toContain('locked-chest');
      expect(live.filter((id) => id === 'locked-chest-open')).toHaveLength(1);
      const payout = live.filter((id) => id !== 'locked-chest-open');
      expect(payout.length).toBeGreaterThanOrEqual(3);
      expect(payout.length).toBeLessThanOrEqual(4);
      expect(sim.activePedestals).toHaveLength(0);
    }
  });

  it('on an item roll it pays a treasure-pool pedestal and nothing else', () => {
    const sim = emptySim();
    sim.tuning.chest.lockedItemChance = 1;
    sim.addKeys(1);
    touch(sim, 'locked-chest');
    expect(sim.keys).toBe(0);
    expect(kinds(sim)).toEqual(['locked-chest-open']);
    expect(sim.activePedestals).toHaveLength(1);
    expect(sim.activePedestals[0]?.price).toBe(0);
  });
});

describe('chest sources (#353)', () => {
  it('an elite drops a Chest when its chest roll hits', () => {
    const sim = emptySim();
    sim.tuning.chest.eliteChestChance = 1;
    const bierratte = sim.enemies.indexOf('bierratte');
    const enemy = sim.spawnEnemyKind(bierratte, 200, 90, true);
    sim.world.flush();
    sim.events.clear();
    applyDamageAt(sim, entityIndex(enemy), 999, 200, 90, 0, 0, -1);
    stepLootDrops(sim);
    sim.world.flush();
    expect(kinds(sim)).toEqual(['chest']);
  });

  it('a non-elite never drops a Chest through the elite roll', () => {
    const sim = emptySim();
    sim.tuning.chest.eliteChestChance = 1;
    const bierratte = sim.enemies.indexOf('bierratte');
    for (let kill = 0; kill < 30; kill++) {
      const enemy = sim.spawnEnemyKind(bierratte, 200, 90, false);
      sim.world.flush();
      sim.events.clear();
      applyDamageAt(sim, entityIndex(enemy), 999, 200, 90, 0, 0, -1);
      stepLootDrops(sim);
      sim.world.flush();
    }
    // Bierratte is weak-tier, whose table names no chest.
    expect(kinds(sim)).not.toContain('chest');
  });
});

function chestRoom(id: string, withChest: boolean): SingleCellRoomTemplate {
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
    pickupSpawns: withChest ? [{ x: 180, y: 72, type: 'chest' }] : [],
    hazards: [],
    decorativeProps: [],
    metadata: {
      floorTags: ['test'],
      shape: '1x1',
      doors: { north: false, east: false, south: false, west: false },
      difficultyTier: 1,
      weight: 1,
    },
  };
}

describe('an opened chest survives a revisit (#353)', () => {
  it('is still there, opened, and the closed one does not come back', () => {
    const room = chestRoom('test-chest-room', true);
    const sim = new GameSim({ roomTemplate: room, floor: 1 });
    const at = positionOf(sim, 'chest');
    placePlayer(sim, at.x, at.y);
    sim.step(IDLE);
    expect(kinds(sim)).toContain('chest-open');

    sim.loadRoom(chestRoom('test-elsewhere', false), 1);
    sim.loadRoom(room, 1);

    const live = kinds(sim);
    expect(live).toContain('chest-open');
    expect(live).not.toContain('chest');
  });
});

describe('walled-off chest rooms (#353)', () => {
  it.each([
    ['cellar-chest-alcove', 1],
    ['dorf-chest-alcove', 2],
  ] as const)('%s spawns its Chest inside the boulder pocket, not nudged out', (id, floor) => {
    const template = ROOM_TEMPLATES.find(
      (room) => (room as { id?: string }).id === id,
    ) as SingleCellRoomTemplate;
    const sim = new GameSim({ roomTemplate: template, floor, population: 'empty' });
    const authored = template.pickupSpawns[0];
    if (authored === undefined) {
      throw new Error(`${id} authors no chest`);
    }
    const at = positionOf(sim, 'chest');
    expect(at.x).toBe(authored.x + ROOM_MARGIN_X);
    expect(at.y).toBe(authored.y + ROOM_MARGIN_Y);
  });
});
