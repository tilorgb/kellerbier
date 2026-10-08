import { describe, expect, it } from 'vitest';
import { ENEMY_DEFINITIONS } from '../../src/content/enemies/index.js';
import { ROOM_TILE_UNITS } from '../../src/content/rooms/definition.js';
import { entityIndex } from '../../src/sim/ecs/entity.js';
import { GameSim, ROOM_WARMUP_TICKS } from '../../src/sim/game/sim.js';
import { WeatherPhase } from '../../src/sim/hazard/weather.js';
import {
  type InputFrame,
  InputAction,
  createInputFrame,
  quantiseAxis,
  setActionDown,
} from '../../src/sim/input/frame.js';
import { generateRoom } from '../../src/sim/room/generate-room.js';
import { Rng } from '../../src/sim/rng/rng.js';
import {
  DEFAULT_MOVEMENT_TUNING,
  DEFAULT_ROOM_GEN_TUNING,
  DEFAULT_WEATHER_TUNING,
} from '../../src/sim/tuning.js';

/**
 * Floor 4's weather (#40): the avalanche that sweeps a room on a telegraph,
 * and the wind gust that leans on everything in it.
 */

const IDLE = createInputFrame();

function held(moveX: number, moveY: number): InputFrame {
  const frame = createInputFrame();
  frame.moveX = quantiseAxis(moveX);
  frame.moveY = quantiseAxis(moveY);
  return frame;
}

/** Fires straight north from wherever the player stands. */
function firingNorth(): InputFrame {
  const frame = createInputFrame();
  frame.aimX = quantiseAxis(0);
  frame.aimY = quantiseAxis(-1);
  setActionDown(frame, InputAction.Fire, true);
  return frame;
}

const OPEN_GRID = [
  '###############',
  '#.............#',
  '#.............#',
  '#.............#',
  '#.............#',
  '#.............#',
  '#.............#',
  '#.............#',
  '###############',
];

/** A single-screen room whose whole interior is one lane of `type`, with an optional boulder. */
function roomWith(type: string, boulder = false): unknown {
  return {
    id: `weather-${type}`,
    tileGrid: OPEN_GRID,
    obstacles: boulder ? [{ x: 112, y: 48, width: 16, height: 16 }] : [],
    enemySpawns: [],
    spawnGroups: [],
    pickupSpawns: [],
    hazards: [{ x: 16, y: 16, width: 208, height: 112, type }],
    decorativeProps: [],
    metadata: {
      floorTags: ['alpen'],
      shape: '1x1',
      doors: { north: false, east: false, south: false, west: false },
      difficultyTier: 1,
      weight: 1,
    },
  };
}

function simIn(template: unknown, seed = 3): GameSim {
  const sim = new GameSim({
    seed,
    roomTemplate: template,
    floor: 4,
    population: 'empty',
    enemies: ENEMY_DEFINITIONS,
  });
  for (let tick = 0; tick < ROOM_WARMUP_TICKS + 2; tick++) {
    sim.step(IDLE);
  }
  return sim;
}

function placePlayer(sim: GameSim, x: number, y: number): void {
  const base = sim.playerIndex * 4;
  sim.transform.data[base] = x;
  sim.transform.data[base + 1] = y;
  sim.transform.data[base + 2] = x;
  sim.transform.data[base + 3] = y;
  sim.velocity.data[sim.playerIndex * 2] = 0;
  sim.velocity.data[sim.playerIndex * 2 + 1] = 0;
}

function spawn(sim: GameSim, id: string, x: number, y: number): number {
  const entity = sim.spawnEnemyKind(sim.enemies.indexOf(id), x, y);
  sim.world.flush();
  return entityIndex(entity);
}

/** Steps until the avalanche enters `phase`, or fails. */
function stepUntilAvalanche(sim: GameSim, phase: number, limit = 2000): void {
  for (let tick = 0; tick < limit; tick++) {
    if (sim.weather.avalanche.phase === phase) {
      return;
    }
    sim.step(IDLE);
  }
  throw new Error(`avalanche never reached phase ${String(phase)}`);
}

function stepUntilWind(sim: GameSim, phase: number, limit = 2000): void {
  for (let tick = 0; tick < limit; tick++) {
    if (sim.weather.wind.phase === phase) {
      return;
    }
    sim.step(IDLE);
  }
  throw new Error(`wind never reached phase ${String(phase)}`);
}

describe('weather lanes load from a room template (#40)', () => {
  it('reads avalanche and wind lanes off the hazards, and nothing else', () => {
    const sim = simIn(roomWith('avalanche'));
    expect(sim.weather.avalanche.count).toBe(1);
    expect(sim.weather.wind.count).toBe(0);
    expect(sim.weather.active).toBe(true);
    const plain = simIn(roomWith('puddle'));
    expect(plain.weather.active).toBe(false);
  });

  it('is cleared when a room without weather loads', () => {
    const sim = simIn(roomWith('wind'));
    expect(sim.weather.wind.count).toBe(1);
    sim.loadRoom(roomWith('puddle'), 4);
    expect(sim.weather.active).toBe(false);
  });
});

describe('the avalanche (#40)', () => {
  const tuning = DEFAULT_WEATHER_TUNING;

  it('gives enough warning to cross a full room, by the tuning', () => {
    // #40's acceptance criterion, held as a number: a single screen's
    // interior is 13 tiles wide, and the rumble lasts longer than walking
    // that takes at top speed, with a beat to spare.
    const interiorWidth = 13 * ROOM_TILE_UNITS;
    const crossingTicks = interiorWidth / DEFAULT_MOVEMENT_TUNING.maxSpeed;
    expect(tuning.avalancheTelegraphTicks).toBeGreaterThan(crossingTicks * 1.15);
  });

  it('runs quiet → rumble → slide → quiet on its clock, from the room loading', () => {
    const sim = simIn(roomWith('avalanche'));
    expect(sim.weather.avalanche.phase).toBe(WeatherPhase.Quiet);
    stepUntilAvalanche(sim, WeatherPhase.Telegraph);
    // The clock starts once the room's warm-up is over: the calm is counted
    // from the moment the room is live, not from the door.
    expect(sim.tick).toBe(tuning.avalancheQuietTicks + ROOM_WARMUP_TICKS);
    stepUntilAvalanche(sim, WeatherPhase.Active);
    expect(sim.tick).toBe(
      tuning.avalancheQuietTicks + tuning.avalancheTelegraphTicks + ROOM_WARMUP_TICKS,
    );
    expect(sim.weather.avalancheProgress(sim.tuning.weather)).toBeGreaterThanOrEqual(0);
    stepUntilAvalanche(sim, WeatherPhase.Quiet);
    expect(sim.weather.avalanche.rounds).toBe(1);
  });

  it('hits a player standing in the open once, and shoves them south', () => {
    const sim = simIn(roomWith('avalanche'));
    stepUntilAvalanche(sim, WeatherPhase.Active);
    const room = sim.room;
    const x = (room.minX + room.maxX) / 2;
    const y = room.minY + 60;
    placePlayer(sim, x, y);
    const healthBefore = sim.playerHealth;
    for (let tick = 0; tick < tuning.avalancheSweepTicks + 2; tick++) {
      sim.step(IDLE);
    }
    expect(sim.playerHealth).toBe(healthBefore - tuning.avalancheDamage);
    expect(sim.positionY(sim.playerIndex)).toBeGreaterThan(y + 4);
  });

  it('spares a player sheltering directly downhill of a boulder', () => {
    const sim = simIn(roomWith('avalanche', true));
    stepUntilAvalanche(sim, WeatherPhase.Active);
    const room = sim.room;
    // The one boulder, read back off the compiled room; the player stands
    // just under its foot, inside its run.
    expect(room.blockCount).toBe(1);
    const x = ((room.blocks[0] ?? 0) + (room.blocks[2] ?? 0)) / 2;
    const foot = room.blocks[3] ?? 0;
    placePlayer(sim, x, foot + 10);
    const healthBefore = sim.playerHealth;
    for (let tick = 0; tick < tuning.avalancheSweepTicks + 2; tick++) {
      sim.step(IDLE);
    }
    expect(sim.playerHealth).toBe(healthBefore);
    // And the same spot a body-length further down the slope is in the open again.
    const exposed = simIn(roomWith('avalanche', true));
    stepUntilAvalanche(exposed, WeatherPhase.Active);
    placePlayer(exposed, x, foot + tuning.avalancheShelterDepth + 6);
    for (let tick = 0; tick < tuning.avalancheSweepTicks + 2; tick++) {
      exposed.step(IDLE);
    }
    expect(exposed.playerHealth).toBe(healthBefore - tuning.avalancheDamage);
  });

  it('hits a walking enemy in the lane and leaves a flying one alone', () => {
    const sim = simIn(roomWith('avalanche'));
    // A Bauer shoots; the player is not the subject here.
    sim.health.data[sim.playerIndex * 2] = 1_000_000;
    sim.health.data[sim.playerIndex * 2 + 1] = 1_000_000;
    const room = sim.room;
    const walker = spawn(sim, 'bauer', room.minX + 60, room.minY + 70);
    const flyer = spawn(sim, 'specht', room.minX + 150, room.minY + 70);
    const walkerHealth = sim.health.data[walker * 2] ?? 0;
    const flyerHealth = sim.health.data[flyer * 2] ?? 0;
    stepUntilAvalanche(sim, WeatherPhase.Active);
    // Keep both where the front will cross them: an enemy is still a body
    // with its own ideas, so pin the walker each tick.
    for (let tick = 0; tick < tuning.avalancheSweepTicks + 2; tick++) {
      const base = walker * 4;
      sim.transform.data[base] = room.minX + 60;
      sim.transform.data[base + 1] = room.minY + 70;
      sim.step(IDLE);
    }
    expect(sim.health.data[walker * 2]).toBeLessThan(walkerHealth);
    expect(sim.health.data[flyer * 2]).toBe(flyerHealth);
  });

  it('is the same slide in two runs of the same seed', () => {
    const a = simIn(roomWith('avalanche'), 11);
    const b = simIn(roomWith('avalanche'), 11);
    stepUntilAvalanche(a, WeatherPhase.Active);
    stepUntilAvalanche(b, WeatherPhase.Active);
    for (let tick = 0; tick < 40; tick++) {
      a.step(IDLE);
      b.step(IDLE);
    }
    expect(a.particles.liveCount).toBe(b.particles.liveCount);
    expect(a.weather.avalanche.ticks).toBe(b.weather.avalanche.ticks);
  });
});

describe('the wind gust (#40)', () => {
  const tuning = DEFAULT_WEATHER_TUNING;

  it('blows the player sideways while it gusts, east first and then west', () => {
    const sim = simIn(roomWith('wind'));
    const room = sim.room;
    const x = (room.minX + room.maxX) / 2;
    const y = (room.minY + room.maxY) / 2;
    stepUntilWind(sim, WeatherPhase.Active);
    expect(sim.weather.windDirection).toBe(1);
    placePlayer(sim, x, y);
    for (let tick = 0; tick < 40; tick++) {
      sim.step(IDLE);
    }
    expect(sim.positionX(sim.playerIndex)).toBeGreaterThan(x + 10);

    stepUntilWind(sim, WeatherPhase.Quiet);
    expect(sim.weather.windDirection).toBe(-1);
    stepUntilWind(sim, WeatherPhase.Active);
    placePlayer(sim, x, y);
    for (let tick = 0; tick < 40; tick++) {
      sim.step(IDLE);
    }
    expect(sim.positionX(sim.playerIndex)).toBeLessThan(x - 10);
  });

  it('can still be walked into, slowly', () => {
    const sim = simIn(roomWith('wind'));
    const room = sim.room;
    const x = (room.minX + room.maxX) / 2;
    const y = (room.minY + room.maxY) / 2;
    stepUntilWind(sim, WeatherPhase.Active);
    placePlayer(sim, x, y);
    for (let tick = 0; tick < 60; tick++) {
      sim.step(held(-1, 0));
    }
    expect(sim.positionX(sim.playerIndex)).toBeLessThan(x - 5);
  });

  it('bends the player’s shots, and never pushes before it has shown itself', () => {
    const sim = simIn(roomWith('wind'));
    const room = sim.room;
    placePlayer(sim, (room.minX + room.maxX) / 2, room.maxY - 20);
    stepUntilWind(sim, WeatherPhase.Telegraph);
    const xBefore = sim.positionX(sim.playerIndex);
    for (let tick = 0; tick < tuning.windTelegraphTicks - 2; tick++) {
      sim.step(IDLE);
    }
    expect(sim.positionX(sim.playerIndex)).toBeCloseTo(xBefore, 3);
    stepUntilWind(sim, WeatherPhase.Active);
    sim.step(firingNorth());
    let bent = 0;
    for (let tick = 0; tick < 20; tick++) {
      sim.step(IDLE);
    }
    sim.projectiles.forEachLive((slot) => {
      bent = Math.max(bent, Math.abs(sim.projectiles.velocityX[slot] ?? 0));
    });
    expect(bent).toBeGreaterThan(0);
  });
});

describe('generated weather lanes (#40)', () => {
  const spec = (seed: number) => ({
    rng: new Rng(seed),
    floorTag: 'alpen',
    floor: 4,
    roomId: 'r0',
    doors: ['north', 'south'] as const,
    distanceFromStart: 2,
    role: 'normal' as const,
  });

  it('lays one lane per kind over the whole cell when the floor asks for it', () => {
    const template = generateRoom(spec(1) as never, {
      ...DEFAULT_ROOM_GEN_TUNING,
      avalancheChance: 1,
      windChance: 1,
    });
    const avalanche = template.hazards.filter((hazard) => hazard.type === 'avalanche');
    const wind = template.hazards.filter((hazard) => hazard.type === 'wind');
    expect(avalanche).toHaveLength(1);
    expect(wind).toHaveLength(1);
    expect(avalanche[0]).toMatchObject({ x: 16, y: 16, width: 208, height: 112 });
  });

  it('lays none anywhere the chances are zero', () => {
    for (let seed = 0; seed < 20; seed++) {
      const template = generateRoom(spec(seed) as never, DEFAULT_ROOM_GEN_TUNING);
      expect(
        template.hazards.some((hazard) => hazard.type === 'avalanche' || hazard.type === 'wind'),
      ).toBe(false);
    }
  });
});
