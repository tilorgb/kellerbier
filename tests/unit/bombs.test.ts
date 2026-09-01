import { describe, expect, it } from 'vitest';
import cellarCrossroads from '../../src/content/rooms/cellar.json';
import { entityIndex } from '../../src/sim/ecs/entity.js';
import { GameSim, PLAYER_HEALTH, TARGET_RADIUS } from '../../src/sim/game/sim.js';
import { RoomGeometry } from '../../src/sim/room/geometry.js';
import { createInputFrame, quantiseAxis } from '../../src/sim/input/frame.js';
import { ROOM_COLUMNS, ROOM_ROWS, type RoomSubLayout } from '../../src/content/rooms/definition.js';
import { bombFuseProgress } from '../../src/sim/systems/bombs.js';

function bareRoom(): RoomGeometry {
  return new RoomGeometry(0, 0, 320, 180);
}

/** A sim whose training targets have been cleared out of the way. */
function emptySim(): GameSim {
  const sim = new GameSim({ room: bareRoom() });
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

const idle = () => createInputFrame();

describe('Bierfassl fuse and blast', () => {
  it('does nothing until the fuse runs out, then explodes and destroys a destructible obstacle', () => {
    const sim = emptySim();
    const index = sim.playerIndex;
    // Well clear of the player and the blast radius default (40px) reaches it.
    const barrelX = sim.positionX(index) + 400;
    const barrelY = sim.positionY(index) + 400;
    const bomb = sim.spawnBierfassl(barrelX + 10, barrelY, 0, 0, false);
    const barrel = sim.spawnTarget(barrelX, barrelY, TARGET_RADIUS);
    sim.world.flush();

    // `stepBombs` decrements while the fuse is still positive, so it takes
    // `bombFuseTicks` ticks to reach zero and one more for the tick that
    // reads zero and explodes.
    const fuseTicks = Math.round(sim.tuning.pickup.bombFuseTicks);
    for (let tick = 0; tick < fuseTicks; tick++) {
      sim.step(idle());
      expect(sim.world.isAlive(bomb)).toBe(true);
      expect(sim.world.isAlive(barrel)).toBe(true);
    }

    sim.step(idle());
    expect(sim.world.isAlive(bomb)).toBe(false);
    expect(sim.world.isAlive(barrel)).toBe(false);
  });

  it('a set-down Bierfassl never moves', () => {
    const sim = emptySim();
    const index = sim.playerIndex;
    const x = sim.positionX(index) + 100;
    const y = sim.positionY(index) + 100;
    const bomb = sim.spawnBierfassl(x, y, 0, 0, false);
    sim.world.flush();
    const bombIndex = entityIndex(bomb);

    for (let tick = 0; tick < 20; tick++) {
      sim.step(idle());
    }
    expect(sim.positionX(bombIndex)).toBeCloseTo(x, 5);
    expect(sim.positionY(bombIndex)).toBeCloseTo(y, 5);
  });

  it('a rolled Bierfassl moves and slows down under its own drag', () => {
    const sim = emptySim();
    const index = sim.playerIndex;
    const x = sim.positionX(index) + 20;
    const y = sim.positionY(index);
    const bomb = sim.spawnBierfassl(x, y, 1, 0, true);
    sim.world.flush();
    const bombIndex = entityIndex(bomb);

    sim.step(idle());
    const firstStepX = sim.positionX(bombIndex);
    expect(firstStepX).toBeGreaterThan(x);

    for (let tick = 0; tick < 40; tick++) {
      sim.step(idle());
    }
    const laterX = sim.positionX(bombIndex);
    // Drag brings it to a stop well short of a constant-velocity roll — the
    // regression this guards is `stepBodies` never damping `velocity`, only
    // `push` (see `bodies.ts`), which would otherwise roll a Bierfassl at a
    // fixed speed forever.
    const distancePerStep = firstStepX - x;
    expect(laterX - firstStepX).toBeLessThan(distancePerStep * 30);
  });

  it('a blast harms the player standing next to it', () => {
    const sim = emptySim();
    const index = sim.playerIndex;
    sim.spawnBierfassl(sim.positionX(index) + 5, sim.positionY(index), 0, 0, false);
    sim.world.flush();

    const fuseTicks = Math.round(sim.tuning.pickup.bombFuseTicks);
    for (let tick = 0; tick <= fuseTicks; tick++) {
      sim.step(idle());
    }
    expect(sim.playerHealth).toBeLessThan(PLAYER_HEALTH);
  });

  it('never hurts the player on contact, even set down in a slot a contact-damage enemy just vacated', () => {
    const sim = emptySim();
    const index = sim.playerIndex;
    const x = sim.positionX(index) + 100;
    const y = sim.positionY(index) + 100;

    // `kellerassel` carries `contactDamage: 1` — kill it and free its slot so
    // the entity pool's LIFO free list hands that exact slot to the
    // Bierfassl spawned right after. Regression for a fresh Bierfassl
    // inheriting whatever contact damage was last written into its reused
    // slot, since it never had the component attached at all before.
    const enemy = sim.spawnEnemyKind(sim.enemies.indexOf('kellerassel'), x, y);
    sim.world.flush();
    sim.world.destroy(enemy);
    sim.world.flush();

    // Placed clear of the player, not underfoot — `spawnBierfassl`'s own
    // `freshBombEntity` mechanism suspends *all* player contact (`stepContacts`'s
    // `suspendsPlayerContact`, damage included) for a bomb set down exactly
    // where the player is standing, which would make this test pass whether
    // or not the bug is fixed. Walking into it is what a real "touching a
    // bomb to move it" does.
    sim.spawnBierfassl(sim.positionX(index) + 30, sim.positionY(index), 0, 0, false);
    sim.world.flush();

    const frame = createInputFrame();
    frame.moveX = quantiseAxis(1);
    for (let tick = 0; tick < 60; tick++) {
      sim.step(frame);
    }
    expect(sim.playerHealth).toBe(PLAYER_HEALTH);
  });
});

describe('bombFuseProgress (#208)', () => {
  it('is 0 for anything without a fuse', () => {
    const sim = emptySim();
    expect(bombFuseProgress(sim, sim.playerIndex)).toBe(0);
  });

  it('climbs from 0 right after placement to 1 on the tick it explodes', () => {
    const sim = emptySim();
    const index = sim.playerIndex;
    const bomb = sim.spawnBierfassl(sim.positionX(index) + 100, sim.positionY(index), 0, 0, false);
    sim.world.flush();
    const bombIndex = entityIndex(bomb);

    expect(bombFuseProgress(sim, bombIndex)).toBe(0);

    const fuseTicks = Math.round(sim.tuning.pickup.bombFuseTicks);
    let lastProgress = 0;
    for (let tick = 0; tick < fuseTicks; tick++) {
      sim.step(idle());
      const progress = bombFuseProgress(sim, bombIndex);
      expect(progress).toBeGreaterThanOrEqual(lastProgress);
      lastProgress = progress;
    }
    expect(lastProgress).toBeCloseTo(1, 5);
  });
});

describe('bombable (hidden) walls', () => {
  const template = { ...cellarCrossroads, enemySpawns: [], spawnGroups: [] };

  it('loads a hidden direction closed even though the template has a door there', () => {
    const sim = new GameSim({
      roomTemplate: template,
      floor: 1,
      population: 'empty',
      hiddenDoors: [{ direction: 'north', cellCol: 0, cellRow: 0 }],
    });

    expect(sim.doors.some((door) => door.direction === 'north')).toBe(false);
    expect(sim.doors.some((door) => door.direction === 'east')).toBe(true);
  });

  it('reveals it once a Bierfassl explodes near that wall, and stays revealed', () => {
    const sim = new GameSim({
      roomTemplate: template,
      floor: 1,
      population: 'empty',
      hiddenDoors: [{ direction: 'north', cellCol: 0, cellRow: 0 }],
    });
    const centreX = (sim.room.minX + sim.room.maxX) / 2;
    sim.spawnBierfassl(centreX, sim.room.minY + 2, 0, 0, false);
    sim.world.flush();

    const fuseTicks = Math.round(sim.tuning.pickup.bombFuseTicks);
    for (let tick = 0; tick <= fuseTicks; tick++) {
      sim.step(createInputFrame());
    }

    expect(sim.doors.some((door) => door.direction === 'north')).toBe(true);
  });

  it('a blast nowhere near the hidden wall leaves it hidden', () => {
    const sim = new GameSim({
      roomTemplate: template,
      floor: 1,
      population: 'empty',
      hiddenDoors: [{ direction: 'north', cellCol: 0, cellRow: 0 }],
    });
    sim.spawnBierfassl(sim.room.maxX - 2, sim.room.maxY - 2, 0, 0, false);
    sim.world.flush();

    const fuseTicks = Math.round(sim.tuning.pickup.bombFuseTicks);
    for (let tick = 0; tick <= fuseTicks; tick++) {
      sim.step(createInputFrame());
    }

    expect(sim.doors.some((door) => door.direction === 'north')).toBe(false);
  });

  /**
   * Regression for a real bug found while testing #107's `T`/`L` rooms: a
   * multi-cell room (#100) can have two doors sharing a direction on
   * different cells — hiding the one that borders a secret room used to hide
   * *every* door in that direction (`bombableWalls` was keyed by direction
   * alone), soft-locking the player behind what looked like a normal door on
   * the minimap.
   */
  it('hiding one door never hides an unrelated door sharing its direction on another cell', () => {
    const blankRow = '#' + '.'.repeat(ROOM_COLUMNS - 2) + '#';
    const wallRow = '#'.repeat(ROOM_COLUMNS);
    const tileGrid = Array.from({ length: ROOM_ROWS }, (_row, index) =>
      index === 0 || index === ROOM_ROWS - 1 ? wallRow : blankRow,
    );
    const subLayout: RoomSubLayout = {
      tileGrid,
      obstacles: [],
      enemySpawns: [],
      spawnGroups: [],
      pickupSpawns: [],
      hazards: [],
      decorativeProps: [],
    };
    const oneByTwo = {
      id: 'synthetic-1x2',
      cells: [subLayout, subLayout],
      metadata: { floorTags: ['test'], shape: '1x2', difficultyTier: 1, weight: 1 },
    };
    const placement = {
      cells: [
        { col: 0, row: 0 },
        { col: 1, row: 0 },
      ],
      doors: [
        { cellIndex: 0, direction: 'north' as const },
        { cellIndex: 1, direction: 'north' as const },
      ],
    };

    // The constructor's `roomTemplate` option never accepts a `placement`
    // (it can't load a multi-cell draft — see `editor/playtest.ts`'s doc
    // comment on the same limitation), so build an empty sim first and load
    // the multi-cell room directly through `loadRoom`.
    const sim = new GameSim({ population: 'empty' });
    sim.loadRoom(
      oneByTwo,
      1,
      null,
      // Only cell 1's north door borders a secret room; cell 0's north door
      // is a real neighbour and must stay walkable.
      [{ direction: 'north', cellCol: 1, cellRow: 0 }],
      placement,
    );

    expect(sim.doors.some((door) => door.direction === 'north' && door.cellCol === 0)).toBe(true);
    expect(sim.doors.some((door) => door.direction === 'north' && door.cellCol === 1)).toBe(false);
  });
});
