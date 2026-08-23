import { describe, expect, it } from 'vitest';
import cellarCrossroads from '../../src/content/rooms/cellar.json';
import { EventKind } from '../../src/sim/events/queue.js';
import { GameSim } from '../../src/sim/game/sim.js';
import { ProjectileTeam } from '../../src/sim/projectile/store.js';
import { ParticleKind } from '../../src/sim/particle/store.js';
import { stepEnemyDeaths } from '../../src/sim/systems/enemy.js';

function roomSim(): GameSim {
  return new GameSim({ roomTemplate: cellarCrossroads, floor: 1, population: 'empty' });
}

describe('room lifecycle', () => {
  it('locks doors until the authoritative enemy count reaches zero', () => {
    const sim = roomSim();
    const enemies: number[] = [];
    sim.world.forEach(sim.enemyMask, (index) => enemies.push(index));

    expect(enemies).toHaveLength(6);
    expect(sim.liveEnemyCount).toBe(6);
    expect(sim.doorsLocked).toBe(true);
    expect(sim.transitionTo(cellarCrossroads, 1, 'north')).toBe(false);

    for (const index of enemies) {
      sim.kill(index);
    }
    sim.world.flush();

    expect(sim.liveEnemyCount).toBe(0);
    expect(sim.roomCleared).toBe(true);
    expect(sim.doorsLocked).toBe(false);
  });

  it('clears transient entities and does not repopulate a cleared room', () => {
    const sim = roomSim();
    const player = sim.playerIndex;
    const healthBefore = sim.playerHealth;
    const enemies: number[] = [];
    sim.world.forEach(sim.enemyMask, (index) => enemies.push(index));
    for (const index of enemies) {
      sim.kill(index);
    }
    sim.world.flush();

    sim.projectiles.spawn(100, 100, 1, 0, 2, 1, 30, ProjectileTeam.Player);
    sim.particles.spawn(100, 100, 0, 0, 30, 1, ParticleKind.Foam);
    expect(sim.projectiles.liveCount).toBe(1);
    expect(sim.particles.liveCount).toBe(1);

    expect(sim.transitionTo(cellarCrossroads, 1, 'north')).toBe(true);
    expect(sim.roomTransitionTicks).toBeGreaterThan(0);
    expect(sim.roomTransitionTicks).toBeLessThanOrEqual(20);
    expect(sim.liveEnemyCount).toBe(0);
    expect(sim.world.count).toBe(1);
    expect(sim.projectiles.liveCount).toBe(0);
    expect(sim.particles.liveCount).toBe(0);
    expect(sim.playerIndex).toBe(player);
    expect(sim.playerHealth).toBe(healthBefore);
    expect(sim.positionY(player)).toBeCloseTo(sim.room.maxY - 8);
  });

  it('keeps doors locked while a death split is still alive', () => {
    const template = {
      ...cellarCrossroads,
      enemySpawns: [{ x: 176, y: 64, group: 'splitter' }],
      spawnGroups: [
        {
          id: 'splitter',
          count: 1,
          choices: [{ enemyId: 'schimmelfleck', minFloor: 1, maxFloor: 7 }],
        },
      ],
    };
    const sim = new GameSim({ roomTemplate: template, floor: 1, population: 'empty' });
    let parent = -1;
    sim.world.forEach(sim.enemyMask, (index) => {
      parent = index;
    });

    sim.kill(parent);
    sim.events.push(
      EventKind.Death,
      parent,
      -1,
      sim.positionX(parent),
      sim.positionY(parent),
      0,
      0,
      0,
    );
    stepEnemyDeaths(sim);

    expect(sim.liveEnemyCount).toBe(2);
    expect(sim.doorsLocked).toBe(true);
  });
});
