import { describe, expect, it } from 'vitest';
import cellarCrossroads from '../../src/content/rooms/cellar.json';
import cellarHall from '../../src/content/rooms/cellar-hall.json';
import { ENEMY_DEFINITIONS } from '../../src/content/enemies/index.js';
import { entityIndex } from '../../src/sim/ecs/entity.js';
import { EnemyRegistry } from '../../src/sim/enemy/registry.js';
import { GameSim } from '../../src/sim/game/sim.js';
import { createInputFrame } from '../../src/sim/input/frame.js';
import { RoomGeometry } from '../../src/sim/room/geometry.js';
import { ENEMY_STRIDE } from '../../src/sim/systems/enemy.js';

/**
 * Boar (#409): sees the player cross one of its four axes, paws the ground,
 * and charges straight down that axis until it hits something — and the
 * first thing it hits pays for it: a body (player or enemy) takes double and
 * is thrown, a block breaks, a secret wall opens, a closed door is smashed.
 */

const IDLE = createInputFrame();
const emptyCrossroads = { ...cellarCrossroads, enemySpawns: [], spawnGroups: [] };

function openSim(room = new RoomGeometry(0, 0, 320, 180)): GameSim {
  const sim = new GameSim({ seed: 9, room });
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

function place(sim: GameSim, index: number, x: number, y: number): void {
  const t = sim.transform.data;
  t[index * 4] = x;
  t[index * 4 + 1] = y;
  t[index * 4 + 2] = x;
  t[index * 4 + 3] = y;
}

function spawn(sim: GameSim, id: string, x: number, y: number): number {
  const entity = sim.spawnEnemyKind(sim.enemies.indexOf(id), x, y);
  sim.world.flush();
  return entityIndex(entity);
}

function stateName(sim: GameSim, index: number): string {
  const base = index * ENEMY_STRIDE;
  return (
    sim.enemies.at(sim.enemy.data[base] ?? 0).states[sim.enemy.data[base + 1] ?? 0]?.name ?? ''
  );
}

function stepUntil(sim: GameSim, index: number, state: string, limit: number): number {
  for (let tick = 0; tick < limit; tick++) {
    if (stateName(sim, index) === state) {
      return tick;
    }
    sim.step(IDLE);
  }
  return stateName(sim, index) === state ? limit : -1;
}

/** Holds the Boar still in `roam` so a test can set the scene before it reacts. */
function freezeAt(sim: GameSim, boar: number, x: number, y: number): void {
  place(sim, boar, x, y);
  sim.velocity.data[boar * 2] = 0;
  sim.velocity.data[boar * 2 + 1] = 0;
}

describe('Boar (#409)', () => {
  it('compiles as a tough mid that charges on the axes with an impact', () => {
    const compiled = new EnemyRegistry(ENEMY_DEFINITIONS).get('boar');
    expect(compiled.health).toBe(9);
    expect(compiled.lootTier).toBe('tough');
    const charge = compiled.states.find((state) => state.name === 'charge');
    expect(charge?.movement).toMatchObject({
      behaviour: 'chargeAtPlayer',
      snap: 'cardinal',
      impact: { bodyDamageMultiplier: 2, breaksBlocks: true, breaksDoors: true },
    });
  });

  it('winds up when the player crosses one of its axes in sight, and not off-axis', () => {
    const sim = openSim();
    const boar = spawn(sim, 'boar', 160, 90);
    place(sim, sim.playerIndex, 220, 130);
    for (let tick = 0; tick < 30; tick++) {
      freezeAt(sim, boar, 160, 90);
      place(sim, sim.playerIndex, 220, 130);
      sim.step(IDLE);
    }
    expect(stateName(sim, boar)).toBe('roam');
    // Straight east of it, within tolerance.
    let wound = false;
    for (let tick = 0; tick < 5 && !wound; tick++) {
      place(sim, sim.playerIndex, sim.positionX(boar) + 60, sim.positionY(boar) + 5);
      sim.step(IDLE);
      wound = stateName(sim, boar) === 'windup';
    }
    expect(wound).toBe(true);
  });

  it('does not see the player down its axis through a wall', () => {
    const room = new RoomGeometry(0, 0, 320, 180);
    room.addBlock(190, 60, 200, 120);
    const sim = openSim(room);
    const boar = spawn(sim, 'boar', 140, 90);
    for (let tick = 0; tick < 60; tick++) {
      freezeAt(sim, boar, 140, 90);
      place(sim, sim.playerIndex, 260, 90);
      sim.step(IDLE);
    }
    expect(stateName(sim, boar)).toBe('roam');
  });

  it('charges only along the axis it locked, and a step off the axis dodges it', () => {
    const sim = openSim();
    const boar = spawn(sim, 'boar', 80, 90);
    place(sim, sim.playerIndex, 200, 92);
    expect(stepUntil(sim, boar, 'windup', 10)).toBeGreaterThanOrEqual(0);
    // Off the axis during the wind-up.
    place(sim, sim.playerIndex, 200, 150);
    expect(stepUntil(sim, boar, 'charge', 60)).toBeGreaterThan(0);
    const y = sim.positionY(boar);
    for (let tick = 0; tick < 20; tick++) {
      place(sim, sim.playerIndex, 200, 150);
      sim.step(IDLE);
      expect(sim.positionY(boar)).toBeCloseTo(y, 5);
    }
    expect(sim.positionX(boar)).toBeGreaterThan(130);
    expect(sim.playerHealth).toBe(sim.playerMaxHealth);
  });

  it('hits the player for double contact damage, throws them, and stops', () => {
    const sim = openSim();
    const boar = spawn(sim, 'boar', 60, 90);
    place(sim, sim.playerIndex, 200, 90);
    const before = sim.playerHealth;
    stepUntil(sim, boar, 'charge', 60);
    expect(stepUntil(sim, boar, 'stunned', 120)).toBeGreaterThan(0);
    expect(before - sim.playerHealth).toBe(2);
    expect(sim.positionX(sim.playerIndex)).toBeGreaterThan(200);
  });

  it('hits another enemy for double damage — the one way enemies hurt each other', () => {
    const sim = openSim();
    const boar = spawn(sim, 'boar', 60, 90);
    const victim = spawn(sim, 'kaninchen', 150, 90);
    place(sim, sim.playerIndex, 260, 90);
    stepUntil(sim, boar, 'windup', 10);
    for (let tick = 0; tick < 200 && stateName(sim, boar) !== 'stunned'; tick++) {
      place(sim, victim, 150, 90);
      sim.velocity.data[victim * 2] = 0;
      sim.velocity.data[victim * 2 + 1] = 0;
      sim.step(IDLE);
    }
    expect(stateName(sim, boar)).toBe('stunned');
    expect(sim.health.data[victim * 2]).toBe(3 - 2);
    expect(sim.playerHealth).toBe(sim.playerMaxHealth);
  });

  it('smashes the first block it runs into, and stops there', () => {
    const room = new RoomGeometry(0, 0, 320, 180);
    // Overflyable: a boulder, the destructible kind (`RoomGeometry.breakBlockAt`).
    room.addBlock(150, 84, 166, 100, true);
    const sim = openSim(room);
    const boar = spawn(sim, 'boar', 60, 92);
    place(sim, sim.playerIndex, 140, 92);
    stepUntil(sim, boar, 'windup', 10);
    place(sim, sim.playerIndex, 140, 150);
    stepUntil(sim, boar, 'stunned', 200);
    expect(room.blockCount).toBe(0);
    expect(room.isClear(158, 92, 2)).toBe(true);
    expect(sim.positionX(boar)).toBeLessThan(150);
  });

  it('runs at full speed right up to what it hits — no braking a body-length short', () => {
    const room = new RoomGeometry(0, 0, 320, 180);
    room.addBlock(160, 80, 176, 96, true);
    const sim = openSim(room);
    const boar = spawn(sim, 'boar', 60, 88);
    place(sim, sim.playerIndex, 140, 88);
    stepUntil(sim, boar, 'windup', 10);
    place(sim, sim.playerIndex, 140, 160);
    expect(stepUntil(sim, boar, 'charge', 60)).toBeGreaterThan(0);
    const fullSpeed = 3.2 * sim.tuning.enemy.speedScale;
    const steps: number[] = [];
    for (let tick = 0; tick < 120 && stateName(sim, boar) === 'charge'; tick++) {
      const before = sim.positionX(boar);
      sim.step(IDLE);
      steps.push(sim.positionX(boar) - before);
    }
    expect(room.blockCount).toBe(0);
    // Every step up to the smash is a full-speed one; only the step that
    // lands the hit may be shorter (the run up to contact), and then it stops.
    const moving = steps.filter((step) => step > 1e-6);
    expect(moving.length).toBeGreaterThan(5);
    for (const step of moving.slice(0, -1)) {
      expect(step).toBeCloseTo(fullSpeed, 5);
    }
    const radius = sim.body.data[boar * 2] ?? 0;
    // It stopped with its front edge at the block it smashed, within a unit.
    expect(160 - (sim.positionX(boar) + radius)).toBeLessThan(1.5);
  });

  it('smashes a block it only clips with one flank', () => {
    const room = new RoomGeometry(0, 0, 320, 180);
    // The Boar runs along y = 92 with a 7-unit radius; the block's top edge
    // is at 97, so only its lower flank meets it — the centre line misses.
    room.addBlock(160, 97, 176, 113, true);
    const sim = openSim(room);
    const boar = spawn(sim, 'boar', 60, 92);
    place(sim, sim.playerIndex, 140, 92);
    stepUntil(sim, boar, 'windup', 10);
    place(sim, sim.playerIndex, 140, 160);
    expect(stepUntil(sim, boar, 'stunned', 200)).toBeGreaterThan(0);
    expect(room.blockCount).toBe(0);
  });

  it('breaks only the one tile of a merged row it hits, and the rest stays cover', () => {
    const room = new RoomGeometry(0, 0, 320, 180);
    // Three logs stacked north–south, merged into one rect — what generated
    // Floor 3 cover looks like (`sliceObstacles`). The Boar runs into the middle one.
    room.addBlock(160, 80, 176, 128, true);
    const sim = openSim(room);
    const boar = spawn(sim, 'boar', 60, 104);
    place(sim, sim.playerIndex, 140, 104);
    stepUntil(sim, boar, 'windup', 10);
    place(sim, sim.playerIndex, 140, 170);
    expect(stepUntil(sim, boar, 'stunned', 200)).toBeGreaterThan(0);
    expect(room.isClear(168, 104, 2)).toBe(true);
    expect(room.isClear(168, 88, 2)).toBe(false);
    expect(room.isClear(168, 120, 2)).toBe(false);
  });

  it('stops at a plain wall without breaking anything', () => {
    const sim = openSim();
    const boar = spawn(sim, 'boar', 60, 90);
    place(sim, sim.playerIndex, 200, 92);
    stepUntil(sim, boar, 'windup', 10);
    place(sim, sim.playerIndex, 200, 160);
    expect(stepUntil(sim, boar, 'stunned', 200)).toBeGreaterThan(0);
    expect(sim.positionX(boar)).toBeGreaterThan(280);
  });
});

describe('Boar and doors (#409)', () => {
  function crossroads(): GameSim {
    return new GameSim({ roomTemplate: emptyCrossroads, floor: 1, population: 'empty' });
  }

  /** Charges a Boar from the room's middle into the north wall at its door. */
  function chargeNorth(sim: GameSim): number {
    const midX = (sim.room.minX + sim.room.maxX) / 2;
    const midY = (sim.room.minY + sim.room.maxY) / 2;
    const boar = spawn(sim, 'boar', midX, midY + 20);
    place(sim, sim.playerIndex, midX + 2, sim.room.minY + 30);
    // A freshly loaded room holds its enemies inert for a warm-up first.
    expect(stepUntil(sim, boar, 'windup', 120)).toBeGreaterThanOrEqual(0);
    place(sim, sim.playerIndex, midX + 60, midY);
    stepUntil(sim, boar, 'stunned', 300);
    return boar;
  }

  it('smashes a closed door open: passable while the room is still locked', () => {
    const sim = crossroads();
    chargeNorth(sim);
    expect(sim.doorsLocked).toBe(true);
    const north = sim.doors.find((door) => door.direction === 'north');
    expect(north).toBeDefined();
    expect(north !== undefined && sim.isDoorBroken(north)).toBe(true);
    expect(sim.brokenDoorsChangedTick).toBeGreaterThanOrEqual(0);
    // The player can leave through it — and only through it.
    const midX = (sim.room.minX + sim.room.maxX) / 2;
    place(sim, sim.playerIndex, midX, sim.room.minY + 2);
    expect(sim.doorContact?.direction).toBe('north');
    expect(sim.transitionTo(cellarHall, 1, 'north', undefined, undefined, undefined, true)).toBe(
      true,
    );
  });

  it('a locked door the Boar did not smash stays shut', () => {
    const sim = crossroads();
    chargeNorth(sim);
    expect(sim.transitionTo(cellarHall, 1, 'south', undefined, undefined, undefined, true)).toBe(
      false,
    );
  });

  it('leaving through it does not clear the room: it is full again on return, door still broken', () => {
    const sim = new GameSim({ roomTemplate: cellarCrossroads, floor: 1 });
    const authored = sim.liveEnemyCount;
    expect(authored).toBeGreaterThan(0);
    chargeNorth(sim);
    const midX = (sim.room.minX + sim.room.maxX) / 2;
    place(sim, sim.playerIndex, midX, sim.room.minY + 2);
    expect(sim.transitionTo(cellarHall, 1, 'north', undefined, undefined, undefined, true)).toBe(
      true,
    );
    expect(sim.roomId).not.toBe('cellar-crossroads');
    // Clear the room escaped into, so its own doors let the player back.
    const here: number[] = [];
    sim.world.forEach(sim.enemyMask, (index) => here.push(index));
    for (const index of here) {
      sim.kill(index);
    }
    sim.world.flush();
    // Back again: the authored enemies are all there, at full health.
    expect(
      sim.transitionTo(cellarCrossroads, 1, 'south', undefined, undefined, undefined, true),
    ).toBe(true);
    expect(sim.liveEnemyCount).toBe(authored);
    sim.world.forEach(sim.enemyMask, (index) => {
      expect(sim.health.data[index * 2]).toBe(sim.health.data[index * 2 + 1]);
    });
    expect(sim.doorsLocked).toBe(true);
    const north = sim.doors.find((door) => door.direction === 'north');
    expect(north !== undefined && sim.isDoorBroken(north)).toBe(true);
  });

  it('opens a secret wall exactly as a bomb would', () => {
    const sim = new GameSim({
      roomTemplate: emptyCrossroads,
      floor: 1,
      population: 'empty',
      hiddenDoors: [{ direction: 'north', cellCol: 0, cellRow: 0 }],
    });
    expect(sim.doors.some((door) => door.direction === 'north')).toBe(false);
    chargeNorth(sim);
    expect(sim.doors.some((door) => door.direction === 'north')).toBe(true);
  });

  it('never smashes a boss or mini-boss room door', () => {
    const sim = crossroads();
    // Stand-in: the guard is on the room's role, which a test reads back
    // through `smashWallAt` directly.
    const roleField = sim as unknown as { roomSpecialRole: string | undefined };
    roleField.roomSpecialRole = 'miniboss';
    const midX = (sim.room.minX + sim.room.maxX) / 2;
    expect(sim.smashWallAt(midX, sim.room.minY)).toBe(false);
    roleField.roomSpecialRole = undefined;
    expect(sim.smashWallAt(midX, sim.room.minY)).toBe(true);
  });
});

describe('Boar determinism (#409)', () => {
  it('the same input log gives the same run', () => {
    const run = (): string => {
      const sim = new GameSim({ seed: 21, roomTemplate: cellarCrossroads, floor: 1 });
      const midX = (sim.room.minX + sim.room.maxX) / 2;
      const midY = (sim.room.minY + sim.room.maxY) / 2;
      const boar = spawn(sim, 'boar', midX, midY);
      const trace: string[] = [];
      for (let tick = 0; tick < 900; tick++) {
        const frame = createInputFrame();
        frame.moveX = tick % 120 < 60 ? 90 : -90;
        frame.moveY = tick % 200 < 100 ? 40 : -40;
        sim.step(frame);
        trace.push(
          `${sim.positionX(boar).toFixed(4)},${sim.positionY(boar).toFixed(4)},` +
            `${stateName(sim, boar)},${String(sim.playerHealth)},${String(sim.liveEnemyCount)}`,
        );
      }
      return trace.join('\n');
    };
    const first = run();
    expect(first).toContain('charge');
    expect(run()).toBe(first);
  });
});
