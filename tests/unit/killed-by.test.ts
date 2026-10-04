import { describe, expect, it } from 'vitest';
import { entityIndex } from '../../src/sim/ecs/entity.js';
import type { EnemyDefinition } from '../../src/sim/enemy/definition.js';
import { GameSim, type GameSimOptions } from '../../src/sim/game/sim.js';
import { createInputFrame } from '../../src/sim/input/frame.js';
import { RoomGeometry } from '../../src/sim/room/geometry.js';
import { killerLine } from '../../src/render/game-over.js';

const IDLE = createInputFrame();

function emptySim(options: GameSimOptions = {}): GameSim {
  const sim = new GameSim({ room: new RoomGeometry(0, 0, 320, 180), ...options });
  const doomed: number[] = [];
  sim.world.forEach(sim.collidableMask, (index) => {
    if (index !== sim.playerIndex) {
      doomed.push(index);
    }
  });
  for (const index of doomed) {
    sim.world.destroy(sim.world.entityAt(index));
  }
  sim.world.flush();
  while (sim.roomWarmupTicks > 0) {
    sim.step(IDLE);
  }
  return sim;
}

/** One half-heart left, so the next hit is the last. */
function nearlyDead(sim: GameSim): void {
  sim.health.data[sim.playerIndex * 2] = 1;
}

function runUntilDead(sim: GameSim, ticks = 300): void {
  for (let tick = 0; tick < ticks && !sim.playerDead; tick++) {
    sim.step(IDLE);
  }
}

const sniper: EnemyDefinition = {
  id: 'test-killer-sniper',
  name: 'Test Sniper',
  size: 'normal',
  health: 3,
  contactDamage: 0,
  initial: 'aim',
  states: [
    {
      name: 'aim',
      behaviours: [
        { behaviour: 'pause' },
        { behaviour: 'fireAtPlayer', everyTicks: 5, speed: 3, damage: 1, lifetimeTicks: 120 },
      ],
    },
  ],
};

const brute: EnemyDefinition = {
  id: 'test-killer-brute',
  name: 'Test Brute',
  size: 'normal',
  health: 3,
  contactDamage: 1,
  initial: 'walk',
  states: [{ name: 'walk', behaviours: [{ behaviour: 'walkTowardPlayer', speed: 1 }] }],
};

describe('what killed the player', () => {
  it('is nothing while the player is alive', () => {
    expect(emptySim().killedBy).toBeNull();
  });

  it('names the enemy whose shot landed the last hit', () => {
    const sim = emptySim({ enemies: [sniper] });
    sim.spawnEnemyKind(
      sim.enemies.indexOf('test-killer-sniper'),
      sim.positionX(sim.playerIndex) - 80,
      sim.positionY(sim.playerIndex),
    );
    sim.world.flush();
    nearlyDead(sim);
    runUntilDead(sim);
    expect(sim.playerDead).toBe(true);
    expect(sim.killedBy).toEqual({ kind: 'enemy', name: 'Test Sniper' });
  });

  it('names the enemy that walked into the player', () => {
    const sim = emptySim({ enemies: [brute] });
    const entity = sim.spawnEnemyKind(
      sim.enemies.indexOf('test-killer-brute'),
      sim.positionX(sim.playerIndex) + 30,
      sim.positionY(sim.playerIndex),
    );
    sim.world.flush();
    expect(entityIndex(entity)).toBeGreaterThanOrEqual(0);
    nearlyDead(sim);
    runUntilDead(sim);
    expect(sim.killedBy).toEqual({ kind: 'enemy', name: 'Test Brute' });
  });

  it('blames the player own Bierfassl', () => {
    const sim = emptySim();
    sim.spawnBierfassl(
      sim.positionX(sim.playerIndex) + 5,
      sim.positionY(sim.playerIndex),
      0,
      0,
      false,
    );
    sim.world.flush();
    nearlyDead(sim);
    runUntilDead(sim);
    expect(sim.killedBy).toEqual({ kind: 'ownBomb' });
  });

  it('reads as a line on the death screen', () => {
    expect(killerLine('de', { kind: 'enemy', name: 'Bierratte' })).toBe('Getötet von Bierratte');
    expect(killerLine('en', { kind: 'ownBomb' })).toBe('Killed by your own Bierfassl');
    expect(killerLine('en', null)).toBe('');
  });
});
