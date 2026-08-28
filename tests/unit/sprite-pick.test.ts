import { describe, expect, it } from 'vitest';
import cellarCrossroads from '../../src/content/rooms/cellar.json';
import { pickEnemyAt, pickTileNameAt } from '../../src/app/sprite-pick.js';
import { GameSim } from '../../src/sim/game/sim.js';
import { ENEMY_STRIDE } from '../../src/sim/systems/enemy.js';

function roomSim(): GameSim {
  return new GameSim({ roomTemplate: cellarCrossroads, floor: 1 });
}

describe('sprite-pick', () => {
  it('resolves the enemy whose collider contains the clicked point', () => {
    const sim = roomSim();
    let index = -1;
    sim.world.forEach(sim.enemyMask, (candidate) => {
      index = candidate;
    });
    expect(index).toBeGreaterThanOrEqual(0);
    const expectedId = sim.enemies.at(sim.enemy.data[index * ENEMY_STRIDE] ?? 0).id;
    expect(pickEnemyAt(sim, sim.positionX(index), sim.positionY(index))).toBe(expectedId);
  });

  it('returns null when the point is nowhere near any enemy', () => {
    const sim = roomSim();
    expect(pickEnemyAt(sim, sim.room.minX - 1000, sim.room.minY - 1000)).toBeNull();
  });

  it('resolves a click near, but not exactly on, the enemy — real clicks are never pixel-perfect', () => {
    const sim = roomSim();
    let index = -1;
    sim.world.forEach(sim.enemyMask, (candidate) => {
      index = candidate;
    });
    expect(index).toBeGreaterThanOrEqual(0);
    const expectedId = sim.enemies.at(sim.enemy.data[index * ENEMY_STRIDE] ?? 0).id;
    // Just past the raw collider radius (`ENEMY_PROFILES`' 4-10 world units) —
    // a click this far off would have missed before the pick radius was
    // padded past the physics hitbox.
    expect(pickEnemyAt(sim, sim.positionX(index) + 9, sim.positionY(index))).toBe(expectedId);
  });

  it('resolves the tile name at a cell via the same hash render/room.ts draws with', () => {
    const sim = roomSim();
    const name = pickTileNameAt(sim, 1, sim.room.minX + 4, sim.room.minY + 4, {
      1: ['cellar-floor'],
    });
    expect(name).toBe('cellar-floor');
  });

  it('returns null outside the room bounds', () => {
    const sim = roomSim();
    expect(
      pickTileNameAt(sim, 1, sim.room.minX - 10, sim.room.minY, { 1: ['cellar-floor'] }),
    ).toBeNull();
  });

  it('returns null for a floor with no tile names loaded', () => {
    const sim = roomSim();
    expect(
      pickTileNameAt(sim, 3, sim.room.minX + 4, sim.room.minY + 4, { 1: ['cellar-floor'] }),
    ).toBeNull();
  });
});
