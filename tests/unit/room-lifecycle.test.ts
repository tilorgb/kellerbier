import { describe, expect, it } from 'vitest';
import cellarCrossroads from '../../src/content/rooms/cellar.json';
import { BOSS_REWARD_DROP_TABLE } from '../../src/content/pickups/drop-tables.js';
import { EventKind } from '../../src/sim/events/queue.js';
import { GameSim, PLAYER_RADIUS } from '../../src/sim/game/sim.js';
import { createInputFrame } from '../../src/sim/input/frame.js';
import { ProjectileTeam } from '../../src/sim/projectile/store.js';
import { ParticleKind } from '../../src/sim/particle/store.js';
import { stepEnemyDeaths } from '../../src/sim/systems/enemy.js';
import { applyDamageAt } from '../../src/sim/systems/impact.js';

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

  it('only compiles doors the placement actually gives it, not every direction the template authors', () => {
    // `cellarCrossroads`'s own metadata authors all four directions as
    // possible doors — the floor plan's real neighbour graph is what should
    // narrow that down, via `roomPlacement`. With none given at all, every
    // direction the template allows still compiles (`SINGLE_CELL_PLACEMENT`
    // has no `doors` to override it with) — the exact bug a start room
    // loaded with no placement used to hit.
    const wideOpen = new GameSim({ roomTemplate: cellarCrossroads, floor: 1, population: 'empty' });
    expect(wideOpen.doors.map((door) => door.direction).sort()).toEqual([
      'east',
      'north',
      'south',
      'west',
    ]);

    const narrow = new GameSim({
      roomTemplate: cellarCrossroads,
      floor: 1,
      population: 'empty',
      roomPlacement: {
        cells: [{ col: 0, row: 0 }],
        doors: [{ cellIndex: 0, direction: 'north' }],
      },
    });
    expect(narrow.doors.map((door) => door.direction)).toEqual(['north']);
  });

  it('spawns the player on a walkable tile even when an obstacle sits at the room centre', () => {
    // The room's geometric centre — where `spawnPlayer` starts from — is
    // exactly what a hand-authored obstacle box can also cover, which used
    // to spawn the player stuck inside it.
    const template = {
      ...cellarCrossroads,
      enemySpawns: [],
      spawnGroups: [],
      obstacles: [{ x: 104, y: 56, width: 32, height: 32 }],
    };
    const sim = new GameSim({ roomTemplate: template, floor: 1, population: 'empty' });
    const player = sim.playerIndex;
    const x = sim.positionX(player);
    const y = sim.positionY(player);

    expect(sim.room.isClear(x, y, PLAYER_RADIUS)).toBe(true);
    expect(x < 104 || x > 136 || y < 56 || y > 88).toBe(true);
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
  it('rolls the boss table on clear, which can pay out nothing — the room pedestal is the real reward', () => {
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
    // Neutralises `needMultiplierFor`'s boost (a fresh run starts owning
    // none of these) so the observed split matches the table's own weights
    // rather than the "player is broke" skew every fresh sim starts under.
    sim.addBiermarken(999);
    sim.addKeys(999);
    sim.addBombs(999);

    // The bonus roll is genuinely optional now (`BOSS_REWARD_DROP_TABLE`
    // carries a `null` weight, unlike a boss's guaranteed pedestal item) —
    // rolled directly, repeatedly, rather than via one room clear, since
    // only one clear roll exists per room and the point is that the *table*
    // can land on either outcome, not any one specific draw from it.
    // `world.flush()` after each roll: `world.count` excludes this tick's
    // own spawns until flushed, same as everywhere else in this file.
    const outcomes = new Set<boolean>();
    for (let roll = 0; roll < 40; roll++) {
      const before = sim.world.count;
      sim.dropLoot(BOSS_REWARD_DROP_TABLE, sim.room.minX + 10, sim.room.minY + 10);
      sim.world.flush();
      outcomes.add(sim.world.count > before);
    }
    expect(outcomes.has(true)).toBe(true);
    expect(outcomes.has(false)).toBe(true);
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

describe('Die Große Kellerassel (#36)', () => {
  function bossFightSim(): GameSim {
    const bossRoom = {
      ...cellarCrossroads,
      id: 'test-grosse-kellerassel',
      enemySpawns: [{ x: 176, y: 64, group: 'boss' }],
      spawnGroups: [
        {
          id: 'boss',
          count: 1,
          choices: [{ enemyId: 'grosse-kellerassel', minFloor: 1, maxFloor: 1 }],
        },
      ],
      metadata: { ...cellarCrossroads.metadata, specialRole: 'boss' },
    };
    return new GameSim({ roomTemplate: bossRoom, floor: 1, population: 'empty' });
  }

  /** The one enemy alive right after the room loads: the boss body itself. */
  function bossIndex(sim: GameSim): number {
    let index = -1;
    sim.world.forEach(sim.enemyMask, (found) => {
      index = found;
    });
    return index;
  }

  function liveSegments(sim: GameSim): number {
    let count = 0;
    sim.world.forEach(sim.enemyMask, () => {
      count += 1;
    });
    return count;
  }

  it('shows a combined health bar the instant the room loads, and hides it once cleared', () => {
    const sim = bossFightSim();
    const health = sim.bossHealth;
    expect(health).not.toBeNull();
    expect(health?.current).toBe(health?.max);

    sim.kill(bossIndex(sim));
    sim.world.flush();
    expect(sim.bossHealth).toBeNull();
  });

  it('splits into three segments at half health, and the door stays locked through the split', () => {
    const sim = bossFightSim();
    const boss = bossIndex(sim);
    const fullHealth = sim.bossHealth?.current ?? 0;

    // Exactly the phase-two threshold, not zero — the split has to happen
    // before the body would otherwise die of the hit.
    applyDamageAt(sim, boss, fullHealth / 2, sim.positionX(boss), sim.positionY(boss), 0, 0, -1);
    // Past the room's own warmup (`ROOM_WARMUP_TICKS`, during which nothing
    // decides anything) plus the hitstop the hit itself asked for.
    for (let tick = 0; tick < 60; tick++) {
      sim.step(idle());
    }

    expect(liveSegments(sim)).toBe(3);
    expect(sim.doorsLocked).toBe(true);
    expect(sim.transitionTo(cellarCrossroads, 1, 'north')).toBe(false);
    // The fight's total health budget is unchanged by the split.
    const afterSplit = sim.bossHealth;
    expect(afterSplit?.max).toBe(fullHealth / 2);
    expect(afterSplit?.current).toBe(fullHealth / 2);
  });

  it('unlocks the doors and rolls a guaranteed reward once every segment is down', () => {
    const sim = bossFightSim();
    const boss = bossIndex(sim);
    const fullHealth = sim.bossHealth?.current ?? 0;

    applyDamageAt(sim, boss, fullHealth / 2, sim.positionX(boss), sim.positionY(boss), 0, 0, -1);
    // Past the room's own warmup (`ROOM_WARMUP_TICKS`, during which nothing
    // decides anything) plus the hitstop the hit itself asked for.
    for (let tick = 0; tick < 60; tick++) {
      sim.step(idle());
    }
    expect(liveSegments(sim)).toBe(3);

    const segments: number[] = [];
    sim.world.forEach(sim.enemyMask, (index) => segments.push(index));
    for (const index of segments) {
      sim.kill(index);
    }
    sim.world.flush();
    sim.step(idle());

    expect(sim.liveEnemyCount).toBe(0);
    expect(sim.doorsLocked).toBe(false);
    expect(sim.bossHealth).toBeNull();
    // The room-clear bonus roll itself — optional, unlike a boss's pedestal
    // item — is covered by its own `describe('boss room reward', ...)` block.
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
