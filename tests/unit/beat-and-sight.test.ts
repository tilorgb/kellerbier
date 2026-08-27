import { describe, expect, it } from 'vitest';
import { entityIndex } from '../../src/sim/ecs/entity.js';
import type { EnemyDefinition } from '../../src/sim/enemy/definition.js';
import { GameSim, type GameSimOptions } from '../../src/sim/game/sim.js';
import { createInputFrame } from '../../src/sim/input/frame.js';
import { RoomGeometry } from '../../src/sim/room/geometry.js';

const IDLE = createInputFrame();

function bareRoom(): RoomGeometry {
  return new RoomGeometry(0, 0, 320, 180);
}

function emptySim(options: GameSimOptions = {}): GameSim {
  const sim = new GameSim({ room: bareRoom(), ...options });
  const player = sim.playerIndex;
  const doomed: number[] = [];
  sim.world.forEach(sim.collidableMask, (index) => {
    if (index !== player) {
      doomed.push(index);
    }
  });
  for (const index of doomed) {
    sim.world.destroy(sim.world.entityAt(index));
  }
  sim.world.flush();
  return sim;
}

function place(sim: GameSim, id: string, x: number, y: number): number {
  const entity = sim.spawnEnemyKind(sim.enemies.indexOf(id), x, y);
  sim.world.flush();
  return entityIndex(entity);
}

function liveProjectileCount(sim: GameSim): number {
  let count = 0;
  sim.projectiles.forEachLive(() => {
    count += 1;
  });
  return count;
}

/**
 * A stationary tuba player firing a ten-shot ring every four ticks — a tiny
 * `everyTicks` so a test doesn't have to run for half a second of simulated
 * time to see two beats land.
 */
const drummer: EnemyDefinition = {
  id: 'test-drummer',
  name: 'Test Drummer',
  size: 'normal',
  health: 3,
  contactDamage: 0,
  initial: 'oompah',
  states: [
    {
      name: 'oompah',
      behaviours: [
        { behaviour: 'pause' },
        {
          behaviour: 'fireOnBeat',
          shots: 6,
          everyTicks: 4,
          speed: 1,
          damage: 1,
          lifetimeTicks: 30,
        },
      ],
    },
  ],
};

/** A stationary turret that fires straight at the player every tick, once sighted. */
const sniper: EnemyDefinition = {
  id: 'test-sniper',
  name: 'Test Sniper',
  size: 'normal',
  health: 3,
  contactDamage: 0,
  initial: 'watch',
  states: [
    {
      name: 'watch',
      behaviours: [
        { behaviour: 'pause' },
        { behaviour: 'fireAtPlayer', everyTicks: 1, speed: 1, damage: 1, lifetimeTicks: 30 },
      ],
    },
  ],
};

describe('fireOnBeat (#37)', () => {
  it('fires on sim.tick modulo everyTicks, not on ticks-since-state-entry', () => {
    const sim = emptySim({ enemies: [drummer] });
    // roomWarmupTicks holds every enemy inert for a beat after load — run it
    // out first so the assertions below are purely about the beat gate.
    while (sim.roomWarmupTicks > 0) {
      sim.step(IDLE);
    }

    place(sim, 'test-drummer', 40, 40);
    // Enter this second body's firing state on a tick that is *not* itself a
    // multiple of 4 — if firing were still gated on ticks-since-state-entry
    // (as every other firing primitive is), this one would ring out of phase
    // with the first.
    sim.step(IDLE);
    place(sim, 'test-drummer', 200, 40);

    let fired = 0;
    for (let step = 0; step < 20; step++) {
      const before = liveProjectileCount(sim);
      sim.step(IDLE);
      const after = liveProjectileCount(sim);
      if (after > before) {
        fired += 1;
        // Both drummers ring on the same tick: a beat that landed for only
        // one of them would fire 6 shots, not 12.
        expect(after - before).toBe(12);
      }
    }
    expect(fired).toBeGreaterThan(0);
  });
});

describe('hop-trellis line of sight (#37)', () => {
  it('blocks an aimed shot when a sight-block sits between shooter and player', () => {
    const room = bareRoom();
    room.addSightBlock(90, 0, 110, 180);
    const sim = emptySim({ room, enemies: [sniper] });
    while (sim.roomWarmupTicks > 0) {
      sim.step(IDLE);
    }
    const player = sim.playerIndex;
    const transform = sim.transform.data;
    transform[player * 4] = 200;
    transform[player * 4 + 1] = 90;
    transform[player * 4 + 2] = 200;
    transform[player * 4 + 3] = 90;
    place(sim, 'test-sniper', 20, 90);

    for (let tick = 0; tick < 10; tick++) {
      sim.step(IDLE);
    }
    expect(liveProjectileCount(sim)).toBe(0);
  });

  it('fires once the line to the player is clear', () => {
    const sim = emptySim({ room: bareRoom(), enemies: [sniper] });
    while (sim.roomWarmupTicks > 0) {
      sim.step(IDLE);
    }
    const player = sim.playerIndex;
    const transform = sim.transform.data;
    transform[player * 4] = 200;
    transform[player * 4 + 1] = 90;
    transform[player * 4 + 2] = 200;
    transform[player * 4 + 3] = 90;
    place(sim, 'test-sniper', 20, 90);

    let fired = false;
    for (let tick = 0; tick < 10 && !fired; tick++) {
      sim.step(IDLE);
      fired = liveProjectileCount(sim) > 0;
    }
    expect(fired).toBe(true);
  });
});
