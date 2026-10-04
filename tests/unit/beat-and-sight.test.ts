import { describe, expect, it } from 'vitest';
import { entityIndex } from '../../src/sim/ecs/entity.js';
import type { EnemyDefinition } from '../../src/sim/enemy/definition.js';
import { GameSim, type GameSimOptions } from '../../src/sim/game/sim.js';
import { createInputFrame, quantiseAxis } from '../../src/sim/input/frame.js';
import cellarPillars from '../../src/content/rooms/cellar-pillars.json';
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

/** Sits still until the player comes within reach, then switches to `alert`. */
const watcher: EnemyDefinition = {
  id: 'test-watcher',
  name: 'Test Watcher',
  size: 'normal',
  health: 3,
  contactDamage: 0,
  initial: 'idle',
  states: [
    {
      name: 'idle',
      behaviours: [{ behaviour: 'pause' }],
      transitions: [{ to: 'alert', whenPlayerWithin: 300 }],
    },
    {
      name: 'alert',
      behaviours: [{ behaviour: 'pause' }],
      transitions: [{ to: 'idle', whenPlayerBeyond: 300 }],
    },
  ],
};

describe('solid obstacles block line of sight', () => {
  function setUp(room: RoomGeometry, enemies: EnemyDefinition[]): GameSim {
    const sim = emptySim({ room, enemies });
    while (sim.roomWarmupTicks > 0) {
      sim.step(IDLE);
    }
    const player = sim.playerIndex;
    const transform = sim.transform.data;
    transform[player * 4] = 200;
    transform[player * 4 + 1] = 90;
    transform[player * 4 + 2] = 200;
    transform[player * 4 + 3] = 90;
    return sim;
  }

  const stateOf = (sim: GameSim, index: number): number => sim.enemy.data[index * 4 + 1] ?? -1;

  it('blocks an aimed shot when a rock sits between shooter and player', () => {
    const room = bareRoom();
    room.addBlock(90, 0, 110, 180, true);
    const sim = setUp(room, [sniper]);
    place(sim, 'test-sniper', 20, 90);
    for (let tick = 0; tick < 10; tick++) {
      sim.step(IDLE);
    }
    expect(liveProjectileCount(sim)).toBe(0);
  });

  it('does not react to a player hidden behind a rock', () => {
    const room = bareRoom();
    room.addBlock(90, 0, 110, 180, true);
    const sim = setUp(room, [watcher]);
    const index = place(sim, 'test-watcher', 20, 90);
    for (let tick = 0; tick < 10; tick++) {
      sim.step(IDLE);
    }
    expect(stateOf(sim, index)).toBe(0);
  });

  it('reacts once the line to the player is clear', () => {
    const sim = setUp(bareRoom(), [watcher]);
    const index = place(sim, 'test-watcher', 20, 90);
    for (let tick = 0; tick < 10; tick++) {
      sim.step(IDLE);
    }
    expect(stateOf(sim, index)).toBe(1);
  });
});

/** Always walks straight at the player. */
const walker: EnemyDefinition = {
  id: 'test-walker',
  name: 'Test Walker',
  size: 'normal',
  health: 3,
  contactDamage: 0,
  initial: 'walk',
  states: [{ name: 'walk', behaviours: [{ behaviour: 'walkTowardPlayer', speed: 1 }] }],
};

describe('walkers lose track of a player behind a solid obstacle', () => {
  function walkerSim(room: RoomGeometry): { sim: GameSim; index: number } {
    const sim = emptySim({ room, enemies: [walker] });
    while (sim.roomWarmupTicks > 0) {
      sim.step(IDLE);
    }
    const player = sim.playerIndex;
    const transform = sim.transform.data;
    transform[player * 4] = 280;
    transform[player * 4 + 1] = 90;
    transform[player * 4 + 2] = 280;
    transform[player * 4 + 3] = 90;
    return { sim, index: place(sim, 'test-walker', 40, 90) };
  }

  it('walks straight at a player it can see', () => {
    const { sim, index } = walkerSim(bareRoom());
    for (let tick = 0; tick < 30; tick++) {
      sim.step(IDLE);
    }
    expect(sim.positionX(index)).toBeGreaterThan(60);
    expect(Math.abs(sim.positionY(index) - 90)).toBeLessThan(1);
  });

  it('wanders slowly instead of pressing toward a player hidden behind a rock', () => {
    const room = bareRoom();
    room.addBlock(150, 0, 170, 180, true);
    const { sim, index } = walkerSim(room);
    const startX = sim.positionX(index);
    const startY = sim.positionY(index);
    for (let tick = 0; tick < 30; tick++) {
      sim.step(IDLE);
    }
    const moved = Math.hypot(sim.positionX(index) - startX, sim.positionY(index) - startY);
    // It moves (it is wandering, not frozen), but at half speed and not
    // locked onto the player: 30 ticks of a full-speed walk would be ~30 units.
    expect(moved).toBeGreaterThan(0);
    expect(moved).toBeLessThan(20);
  });
});

describe('walkers search where they last saw the player', () => {
  it('walks around a wall to the spot the player was last seen', () => {
    const room = bareRoom();
    const sim = emptySim({ room, enemies: [walker] });
    while (sim.roomWarmupTicks > 0) {
      sim.step(IDLE);
    }
    const player = sim.playerIndex;
    const transform = sim.transform.data;
    const putPlayer = (x: number, y: number): void => {
      transform[player * 4] = x;
      transform[player * 4 + 1] = y;
      transform[player * 4 + 2] = x;
      transform[player * 4 + 3] = y;
    };
    putPlayer(280, 60);
    const index = place(sim, 'test-walker', 40, 60);
    // One look at the player across open floor...
    sim.step(IDLE);
    // ...then a wall goes up between them, with a gap at the bottom, and the
    // player slips out of sight.
    room.addBlock(150, 0, 170, 140, true);
    putPlayer(290, 170);

    for (let tick = 0; tick < 600; tick++) {
      sim.step(IDLE);
    }
    // Got past the wall, through the gap — a straight-line walker would
    // still be pressed against its left face.
    expect(sim.positionX(index)).toBeGreaterThan(180);
  });
});

describe('chasing a player who ducks behind a pillar (real room)', () => {
  it('keeps after a player who runs behind a pillar, and does not snag on its corner', () => {
    const sim = new GameSim({ roomTemplate: cellarPillars, suppressRoomContent: true });
    while (sim.roomWarmupTicks > 0) {
      sim.step(IDLE);
    }
    const player = sim.playerIndex;
    const transform = sim.transform.data;
    transform[player * 4] = 110;
    transform[player * 4 + 1] = 145;
    transform[player * 4 + 2] = 110;
    transform[player * 4 + 3] = 145;
    // Left of the bottom-left pillar (72..88, 114..130 in room space).
    const index = place(sim, 'kellerassel', 50, 122);

    const up = createInputFrame();
    up.moveY = quantiseAxis(-1);
    // The player slips up behind the pillar and stays there.
    for (let tick = 0; tick < 20; tick++) {
      sim.step(up);
    }
    for (let tick = 0; tick < 120; tick++) {
      sim.step(IDLE);
    }
    // It followed to where the player actually went (not the corner they
    // vanished at) and routed round the pillar instead of pressing into it.
    const distance = Math.hypot(
      sim.positionX(index) - sim.positionX(player),
      sim.positionY(index) - sim.positionY(player),
    );
    expect(distance).toBeLessThan(20);
  });
});
