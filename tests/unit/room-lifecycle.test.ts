import { describe, expect, it } from 'vitest';
import cellarCrossroads from '../../src/content/rooms/cellar.json';
import { EventKind } from '../../src/sim/events/queue.js';
import { GameSim } from '../../src/sim/game/sim.js';
import { createInputFrame } from '../../src/sim/input/frame.js';
import { ProjectileTeam } from '../../src/sim/projectile/store.js';
import { ParticleKind } from '../../src/sim/particle/store.js';
import { stepEnemyDeaths } from '../../src/sim/systems/enemy.js';

function roomSim(): GameSim {
  return new GameSim({ roomTemplate: cellarCrossroads, floor: 1, population: 'empty' });
}

const idle = () => createInputFrame();

describe('room lifecycle', () => {
  it('locks doors until the authoritative enemy count reaches zero', () => {
    const sim = roomSim();
    const enemies: number[] = [];
    sim.world.forEach(sim.enemyMask, (index) => enemies.push(index));

    expect(enemies).toHaveLength(2);
    expect(sim.liveEnemyCount).toBe(2);
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

describe('key-locked treasure rooms', () => {
  const lockedRoom = {
    ...cellarCrossroads,
    id: 'test-treasure-locked',
    enemySpawns: [],
    spawnGroups: [],
    metadata: { ...cellarCrossroads.metadata, specialRole: 'treasure', keyLocked: true },
  };

  it('refuses the transition, and spends no key, with none held', () => {
    const sim = new GameSim({
      roomTemplate: { ...cellarCrossroads, enemySpawns: [], spawnGroups: [] },
      floor: 1,
      population: 'empty',
    });

    expect(sim.keys).toBe(0);
    expect(sim.transitionTo(lockedRoom, 1, 'north')).toBe(false);
    expect(sim.keys).toBe(0);
    expect(sim.roomId).toBe('cellar-crossroads');
  });

  it('spends exactly one key and loads the room once one is held', () => {
    const sim = new GameSim({
      roomTemplate: { ...cellarCrossroads, enemySpawns: [], spawnGroups: [] },
      floor: 1,
      population: 'empty',
    });
    sim.addKeys(2);

    expect(sim.transitionTo(lockedRoom, 1, 'north')).toBe(true);

    expect(sim.keys).toBe(1);
    expect(sim.roomId).toBe('test-treasure-locked');
  });
});

describe('the shopkeeper', () => {
  function shopSim(): GameSim {
    const template = {
      ...cellarCrossroads,
      enemySpawns: [{ x: 176, y: 64, group: 'wirt' }],
      spawnGroups: [
        { id: 'wirt', count: 1, choices: [{ enemyId: 'shopkeeper', minFloor: 1, maxFloor: 7 }] },
      ],
    };
    return new GameSim({ roomTemplate: template, floor: 1, population: 'empty' });
  }

  it('does not seal the doors just by standing there peacefully', () => {
    const sim = shopSim();
    let liveShopkeepers = 0;
    sim.world.forEach(sim.enemyMask, () => {
      liveShopkeepers += 1;
    });

    // Alive in the world (`locksRoom: false` never stopped it spawning) but
    // not counted toward `roomEnemyCount` — the whole point of the flag.
    expect(liveShopkeepers).toBe(1);
    expect(sim.liveEnemyCount).toBe(0);
    expect(sim.doorsLocked).toBe(false);
    expect(sim.transitionTo(cellarCrossroads, 1, 'north')).toBe(true);
  });

  it('still does not seal the doors once killed', () => {
    const sim = shopSim();
    let shopkeeperIndex = -1;
    sim.world.forEach(sim.enemyMask, (index) => {
      shopkeeperIndex = index;
    });

    sim.kill(shopkeeperIndex);
    sim.world.flush();

    expect(sim.liveEnemyCount).toBe(0);
    expect(sim.doorsLocked).toBe(false);
  });
});

describe('boss room reward', () => {
  it('rolls the boss table on clear, which — unlike the ordinary table — never drops nothing', () => {
    const bossRoom = {
      ...cellarCrossroads,
      id: 'test-boss-room',
      enemySpawns: [{ x: 176, y: 64, group: 'lone' }],
      spawnGroups: [
        { id: 'lone', count: 1, choices: [{ enemyId: 'kellerassel', minFloor: 1, maxFloor: 7 }] },
      ],
      metadata: { ...cellarCrossroads.metadata, specialRole: 'boss' },
    };
    const sim = new GameSim({ roomTemplate: bossRoom, floor: 1, population: 'empty' });
    let enemyIndex = -1;
    sim.world.forEach(sim.enemyMask, (index) => {
      enemyIndex = index;
    });

    sim.kill(enemyIndex);
    sim.world.flush();
    sim.step(idle());

    // Player plus at least one dropped pickup — `BOSS_REWARD_DROP_TABLE`
    // never rolls its "nothing" outcome, unlike `ROOM_CLEAR_DROP_TABLE`.
    expect(sim.world.count).toBeGreaterThan(1);
  });
});

describe('the boss room "next floor" exit', () => {
  function bossSim(doors: Partial<Record<'north' | 'east' | 'south' | 'west', boolean>>): GameSim {
    const bossRoom = {
      ...cellarCrossroads,
      id: 'test-boss-exit-room',
      enemySpawns: [{ x: 176, y: 64, group: 'lone' }],
      spawnGroups: [
        { id: 'lone', count: 1, choices: [{ enemyId: 'kellerassel', minFloor: 1, maxFloor: 7 }] },
      ],
      metadata: {
        ...cellarCrossroads.metadata,
        specialRole: 'boss',
        doors: { north: false, east: false, south: false, west: false, ...doors },
      },
    };
    return new GameSim({ roomTemplate: bossRoom, floor: 1, population: 'empty' });
  }

  function killBoss(sim: GameSim): void {
    let enemyIndex = -1;
    sim.world.forEach(sim.enemyMask, (index) => {
      enemyIndex = index;
    });
    sim.kill(enemyIndex);
    sim.world.flush();
  }

  it('stays hidden while the boss is still alive', () => {
    const sim = bossSim({ north: true });
    expect(sim.nextFloorDoor).toBeNull();
    expect(sim.doors.some((door) => door.direction === 'south')).toBe(false);
  });

  it('opens on the first free wall once the boss dies', () => {
    const sim = bossSim({ north: true });
    killBoss(sim);

    const exit = sim.nextFloorDoor;
    expect(exit).not.toBeNull();
    expect(exit?.direction).toBe('south');
    expect(sim.doors).toContain(exit);
  });

  it('never appears on an ordinary cleared room', () => {
    const sim = roomSim();
    const enemies: number[] = [];
    sim.world.forEach(sim.enemyMask, (index) => enemies.push(index));
    for (const index of enemies) {
      sim.kill(index);
    }
    sim.world.flush();

    expect(sim.roomCleared).toBe(true);
    expect(sim.nextFloorDoor).toBeNull();
  });

  it('stays hidden when every wall already has a real door', () => {
    const sim = bossSim({ north: true, east: true, south: true, west: true });
    killBoss(sim);

    expect(sim.nextFloorDoor).toBeNull();
  });
});

describe('clearFloorProgress', () => {
  function clearedRoomSim(): GameSim {
    const sim = roomSim();
    const enemies: number[] = [];
    sim.world.forEach(sim.enemyMask, (index) => enemies.push(index));
    for (const index of enemies) {
      sim.kill(index);
    }
    sim.world.flush();
    // `roomClearedIds` only records a room's template id once `step` (or
    // `transitionTo`, leaving through a real door) actually observes
    // `roomEnemyCount === 0` — `kill` alone decrements the count but never
    // touches the set. One idle tick is what a real clear looks like.
    sim.step(idle());
    expect(sim.roomCleared).toBe(true);
    return sim;
  }

  // `roomId` is keyed by the authored template's own id, not a per-instance
  // floor-plan id (`GameSim.clearFloorProgress`'s doc comment) — reloading
  // `cellarCrossroads` here stands in for a *different* physical room, in a
  // freshly generated floor, that happens to draw the same template.
  it('without it, a fresh floor drawing an already-cleared template spawns nothing', () => {
    const sim = clearedRoomSim();

    sim.loadRoom(cellarCrossroads, 1, null, [], undefined, { col: 0, row: 0 }, false);

    const respawned: number[] = [];
    sim.world.forEach(sim.enemyMask, (index) => respawned.push(index));
    expect(respawned).toHaveLength(0);
    expect(sim.liveEnemyCount).toBe(0);
  });

  it('lets a fresh floor drawing an already-cleared template spawn its content again', () => {
    const sim = clearedRoomSim();

    sim.clearFloorProgress();
    sim.loadRoom(cellarCrossroads, 1, null, [], undefined, { col: 0, row: 0 }, false);

    const respawned: number[] = [];
    sim.world.forEach(sim.enemyMask, (index) => respawned.push(index));
    expect(respawned).toHaveLength(2);
    expect(sim.liveEnemyCount).toBe(2);
  });
});
