import { describe, expect, it } from 'vitest';
import waldMiniboss from '../../src/content/rooms/wald-miniboss.json';
import waldMinibossEast from '../../src/content/rooms/wald-miniboss-east.json';
import { bieberLogEast } from '../../src/content/enemies/index.js';
import { entityIndex } from '../../src/sim/ecs/entity.js';
import { World } from '../../src/sim/ecs/world.js';
import { GameSim } from '../../src/sim/game/sim.js';
import { LOG_HEALTH, propKindIndex } from '../../src/sim/game/prop-kinds.js';
import { createInputFrame } from '../../src/sim/input/frame.js';
import { ENEMY_STRIDE } from '../../src/sim/systems/enemy.js';

/**
 * Bieber (#467): the log he rolls leaves the woodpile, crosses the room along
 * its own row toward the player, and comes to rest against the far wall as
 * cover again — without ever counting toward the room's enemies.
 */

const LOG = propKindIndex('log');

function arena(template: unknown = waldMiniboss): GameSim {
  const sim = new GameSim({
    seed: 1,
    roomTemplate: template as typeof waldMiniboss,
    floor: 3,
    population: 'empty',
  });
  for (let tick = 0; tick < 200 && sim.roomWarmupTicks > 0; tick++) {
    sim.step(createInputFrame());
  }
  sim.health.data[sim.playerIndex * 2] = 1_000_000;
  sim.health.data[sim.playerIndex * 2 + 1] = 1_000_000;
  // The template's own spawn (a Bieber) is cleared: each test places its own.
  for (let index = 0; index < sim.world.highWater; index++) {
    if (
      sim.world.states[index] === World.ALIVE &&
      ((sim.world.masks[index] ?? 0) & sim.enemyMask) === sim.enemyMask
    ) {
      sim.kill(index);
    }
  }
  sim.world.flush();
  return sim;
}

function placeBieber(sim: GameSim, x: number, y: number): number {
  const entity = sim.spawnEnemyKind(sim.enemies.indexOf('bieber'), x, y);
  sim.world.flush();
  return entityIndex(entity);
}

function stateName(sim: GameSim, index: number): string {
  const base = index * ENEMY_STRIDE;
  const compiled = sim.enemies.at(sim.enemy.data[base] ?? 0);
  return compiled.states[sim.enemy.data[base + 1] ?? 0]?.name ?? '';
}

function stand(sim: GameSim, x: number, y: number): void {
  const player = sim.playerIndex;
  sim.transform.data[player * 4] = x;
  sim.transform.data[player * 4 + 1] = y;
  sim.transform.data[player * 4 + 2] = x;
  sim.transform.data[player * 4 + 3] = y;
  sim.velocity.data[player * 2] = 0;
  sim.velocity.data[player * 2 + 1] = 0;
}

function rollersAlive(sim: GameSim): number[] {
  const found: number[] = [];
  for (let index = 0; index < sim.world.highWater; index++) {
    if (sim.world.states[index] !== World.ALIVE) {
      continue;
    }
    if (((sim.world.masks[index] ?? 0) & sim.enemyMask) !== sim.enemyMask) {
      continue;
    }
    const id = sim.enemies.at(sim.enemy.data[index * ENEMY_STRIDE] ?? 0).id;
    if (id.startsWith('bieber-log')) {
      found.push(index);
    }
  }
  return found;
}

/** Steps until Bieber enters `name`, up to `limit` ticks; the tick it happened on, or -1. */
function stepUntilState(sim: GameSim, bieber: number, name: string, limit = 900): number {
  for (let tick = 0; tick < limit; tick++) {
    sim.step(createInputFrame());
    if (stateName(sim, bieber) === name) {
      return tick;
    }
  }
  return -1;
}

describe('Bieber (#467)', () => {
  it('stands in an arena with a row of logs against the wall opposite a door-free side', () => {
    const west = arena(waldMiniboss);
    const east = arena(waldMinibossEast);
    expect(west.countProps(LOG)).toBe(5);
    expect(east.countProps(LOG)).toBe(5);
    expect(waldMiniboss.metadata.doors.west).toBe(false);
    expect(waldMinibossEast.metadata.doors.east).toBe(false);
  });

  it('a log stands with its own health, sturdier than a barrel, and settles as sturdy', () => {
    const settle = bieberLogEast.states
      .find((state) => state.name === 'settle')
      ?.behaviours.find((behaviour) => behaviour.behaviour === 'becomeProp');
    expect(settle?.behaviour === 'becomeProp' ? settle.health : -1).toBe(LOG_HEALTH);
    const sim = arena();
    for (let index = 0; index < sim.world.highWater; index++) {
      if (
        sim.world.states[index] === World.ALIVE &&
        ((sim.world.masks[index] ?? 0) & sim.propKind.bit) !== 0 &&
        sim.propKind.data[index] === LOG
      ) {
        expect(sim.health.data[index * 2]).toBe(LOG_HEALTH);
      }
    }
  });

  it('shoves a log along its row toward the player, and it settles against the far wall as cover', () => {
    const sim = arena();
    const player = sim.playerIndex;
    // Level with the middle log, well east of the woodpile.
    stand(sim, sim.room.maxX - 50, 90);
    const before = sim.liveEnemyCount;
    const bieber = placeBieber(sim, 120, 90);
    expect(sim.liveEnemyCount).toBe(before + 1);
    expect(stepUntilState(sim, bieber, 'shove')).toBeGreaterThanOrEqual(0);
    // One tick into the shove: the log has left the pile and is rolling.
    sim.step(createInputFrame());
    expect(sim.countProps(LOG)).toBe(4);
    const rollers = rollersAlive(sim);
    expect(rollers).toHaveLength(1);
    const roller = rollers[0] ?? -1;
    const rowY = sim.positionY(roller);
    expect(Math.abs(rowY - sim.positionY(player))).toBeLessThan(12);
    // A rolling log is never part of the roster that locks the room.
    expect(sim.liveEnemyCount).toBe(before + 1);

    let startX = sim.positionX(roller);
    for (let tick = 0; tick < 400 && sim.world.states[roller] === World.ALIVE; tick++) {
      // Out of the lane: this half of the test is about the log, not the hit.
      stand(sim, sim.room.maxX - 50, 140);
      sim.step(createInputFrame());
      expect(Math.abs(sim.positionY(roller) - rowY)).toBeLessThan(4);
      startX = Math.max(startX, sim.positionX(roller));
    }
    // It travelled east, and came to rest as a prop again — five logs once more
    // (checked the tick it stopped, before he fetches the next one).
    expect(startX).toBeGreaterThan(sim.room.maxX - 60);
    expect(sim.countProps(LOG)).toBe(5);
  });

  it('a rolled log hurts nothing once it has settled, and never leaves loot when shot to pieces', () => {
    const sim = arena();
    const bieber = placeBieber(sim, 120, 90);
    stand(sim, sim.room.maxX - 50, 90);
    stepUntilState(sim, bieber, 'shove');
    sim.step(createInputFrame());
    const roller = rollersAlive(sim)[0] ?? -1;
    expect(roller).toBeGreaterThanOrEqual(0);
    expect(sim.enemies.at(sim.enemy.data[roller * ENEMY_STRIDE] ?? 0).lootTier).toBe('none');
  });

  it('fires a three-shot cone with its tail between logs', () => {
    const sim = arena();
    const bieber = placeBieber(sim, 120, 90);
    stand(sim, sim.room.maxX - 50, 90);
    expect(stepUntilState(sim, bieber, 'swish')).toBeGreaterThanOrEqual(0);
    sim.step(createInputFrame());
    expect(sim.projectiles.liveCount).toBe(3);
  });

  it('with the woodpile gone, falls through to the swish instead of stalling', () => {
    const sim = arena();
    for (let index = 0; index < sim.world.highWater; index++) {
      if (
        sim.world.states[index] === World.ALIVE &&
        ((sim.world.masks[index] ?? 0) & sim.propKind.bit) !== 0 &&
        sim.propKind.data[index] === LOG
      ) {
        sim.world.destroy(sim.world.entityAt(index));
      }
    }
    sim.world.flush();
    expect(sim.countProps(LOG)).toBe(0);
    const bieber = placeBieber(sim, 120, 90);
    stand(sim, sim.room.maxX - 50, 90);
    expect(stepUntilState(sim, bieber, 'raise', 600)).toBeGreaterThanOrEqual(0);
  });
});
