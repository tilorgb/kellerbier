import { describe, expect, it } from 'vitest';
import waldGrove from '../../src/content/rooms/wald-grove.json';
import { SFX_DEFINITIONS, ENEMY_WINDUP_SFX } from '../../src/content/audio/sfx.js';
import { ENEMY_DEFINITIONS, specht } from '../../src/content/enemies/index.js';
import { entityIndex } from '../../src/sim/ecs/entity.js';
import type { EnemyDefinition } from '../../src/sim/enemy/definition.js';
import { EnemyRegistry } from '../../src/sim/enemy/registry.js';
import { GameSim } from '../../src/sim/game/sim.js';
import { createInputFrame } from '../../src/sim/input/frame.js';
import { RoomGeometry } from '../../src/sim/room/geometry.js';
import { nearestWallPoint } from '../../src/sim/room/perch.js';
import {
  ENEMY_MOTION_STRIDE,
  ENEMY_STRIDE,
  type EnemyTelegraphShapeInfo,
  enemyAimAngle,
  enemyTelegraphShape,
  TelegraphShape,
  enemyFlightHeight,
} from '../../src/sim/systems/enemy.js';

/**
 * Specht (#411): a woodpecker perched on the wall. It drums (the telegraph),
 * dives straight at where the player stood as the drumming stopped, sticks
 * its beak in the floor for a moment — the hit window — and flies back to
 * the nearest wall. It flies: over cover, water and pits, never through a
 * wall.
 */

const IDLE = createInputFrame();

/** A sim with nothing in it but the player, in `room` or the Wald grove. */
function emptySim(
  definitions: readonly EnemyDefinition[] = ENEMY_DEFINITIONS,
  room?: RoomGeometry,
): GameSim {
  const sim =
    room === undefined
      ? new GameSim({
          seed: 5,
          roomTemplate: waldGrove,
          floor: 3,
          population: 'empty',
          enemies: definitions,
        })
      : new GameSim({ seed: 5, room, enemies: definitions });
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
  return sim;
}

function spawn(sim: GameSim, id: string, x: number, y: number): number {
  const entity = sim.spawnEnemyKind(sim.enemies.indexOf(id), x, y);
  sim.world.flush();
  return entityIndex(entity);
}

function place(sim: GameSim, index: number, x: number, y: number): void {
  const t = sim.transform.data;
  t[index * 4] = x;
  t[index * 4 + 1] = y;
  t[index * 4 + 2] = x;
  t[index * 4 + 3] = y;
}

function stateName(sim: GameSim, index: number): string {
  const base = index * ENEMY_STRIDE;
  return (
    sim.enemies.at(sim.enemy.data[base] ?? 0).states[sim.enemy.data[base + 1] ?? 0]?.name ?? ''
  );
}

/** Steps until the body enters `state`; returns the tick count, or -1. */
function stepUntil(sim: GameSim, index: number, state: string, limit = 600): number {
  for (let tick = 0; tick < limit; tick++) {
    if (stateName(sim, index) === state) {
      return tick;
    }
    sim.step(IDLE);
  }
  return -1;
}

describe('Specht (#411)', () => {
  it('compiles as a flying mini that perches, drums, dives and lands', () => {
    const compiled = new EnemyRegistry(ENEMY_DEFINITIONS).get('specht');
    expect(compiled.health).toBe(4);
    expect(compiled.flying).toBe(true);
    expect(compiled.perches).toBe(true);
    expect(compiled.telegraphDrum).toBe(true);
    const byName = new Map(compiled.states.map((state) => [state.name, state]));
    expect(byName.get('drum')?.telegraphTicks).toBe(50);
    expect(byName.get('stuck')?.grounded).toBe(true);
    expect(byName.get('dive')?.grounded).toBe(false);
  });

  it('refuses an onArrived nothing can raise', () => {
    expect(
      () =>
        new EnemyRegistry([
          {
            ...specht,
            states: [
              {
                name: 'wait',
                behaviours: [{ behaviour: 'pause' }],
                transitions: [{ to: 'wait', onArrived: true }],
              },
            ],
            initial: 'wait',
          },
        ]),
    ).toThrow(/onArrived/);
  });

  it('has a drumroll of its own, played through the wind-up seam', () => {
    const id = ENEMY_WINDUP_SFX.specht;
    expect(id).toBeDefined();
    expect(SFX_DEFINITIONS.some((sfx) => sfx.id === id)).toBe(true);
  });

  it('spawns on the nearest wall, facing into the room', () => {
    const sim = emptySim();
    const room = sim.room;
    const bird = spawn(sim, 'specht', 120, room.minY + 20);
    const radius = sim.body.data[bird * 2] ?? 0;
    // Against the north wall, a few units clear of it so the wall's lip does
    // not cover the bird.
    expect(sim.positionY(bird)).toBeGreaterThan(room.minY + radius);
    expect(sim.positionY(bird)).toBeLessThan(room.minY + radius + 8);
    expect(sim.positionX(bird)).toBeCloseTo(120, 3);
    // Heading south, into the room.
    expect(sim.enemyMotion.data[bird * ENEMY_MOTION_STRIDE + 1]).toBe(1);
  });

  it('drums with its aim on the player, then dives to where they stood as it began — at any angle', () => {
    const sim = emptySim();
    const room = sim.room;
    const player = sim.playerIndex;
    const bird = spawn(sim, 'specht', 80, room.minY + 10);
    place(sim, player, 200, 120);
    expect(stepUntil(sim, bird, 'drum')).toBeGreaterThanOrEqual(0);
    const firstAim = enemyAimAngle(sim, bird);
    // The player walks during the drumming: the warning follows them.
    let lastSpot = { x: 0, y: 0 };
    for (let tick = 0; tick < 200 && stateName(sim, bird) === 'drum'; tick++) {
      place(sim, player, 200 - tick * 0.2, 100);
      lastSpot = { x: sim.positionX(player), y: sim.positionY(player) };
      sim.step(IDLE);
    }
    expect(stateName(sim, bird)).toBe('dive');
    expect(enemyAimAngle(sim, bird)).not.toBeCloseTo(firstAim, 2);
    // Its warning through the dive is the landing circle on that spot.
    const shape: EnemyTelegraphShapeInfo = {
      shape: TelegraphShape.Ring,
      progress: 0,
      x: 0,
      y: 0,
      angle: 0,
      arc: 0,
      reach: 0,
    };
    expect(enemyTelegraphShape(sim, bird, shape)).toBe(true);
    expect(shape.shape).toBe(TelegraphShape.Ground);
    expect(Math.hypot(shape.x - lastSpot.x, shape.y - lastSpot.y)).toBeLessThan(1);
    // Off-axis: neither a cardinal nor a diagonal.
    const angle = Math.abs(enemyAimAngle(sim, bird)) % (Math.PI / 4);
    expect(angle).toBeGreaterThan(0.05);
    expect(angle).toBeLessThan(Math.PI / 4 - 0.05);
    // The player leaves for good: the dive still goes to the spot, not to them.
    place(sim, player, room.minX + 20, room.maxY - 20);
    expect(stepUntil(sim, bird, 'stuck', 200)).toBeGreaterThanOrEqual(0);
    expect(
      Math.hypot(sim.positionX(bird) - lastSpot.x, sim.positionY(bird) - lastSpot.y),
    ).toBeLessThan(2);
  });

  it('marks its landing spot, not its direction, while it drums — following the player', () => {
    const sim = emptySim();
    const player = sim.playerIndex;
    const bird = spawn(sim, 'specht', 120, sim.room.minY + 10);
    place(sim, player, 150, 110);
    expect(stepUntil(sim, bird, 'drum')).toBeGreaterThanOrEqual(0);
    const shape: EnemyTelegraphShapeInfo = {
      shape: TelegraphShape.Ring,
      progress: 0,
      x: 0,
      y: 0,
      angle: 0,
      arc: 0,
      reach: 0,
    };
    for (const x of [150, 170, 190]) {
      place(sim, player, x, 110);
      sim.step(IDLE);
      expect(enemyTelegraphShape(sim, bird, shape)).toBe(true);
      expect(shape.shape).toBe(TelegraphShape.Ground);
      expect(shape.reach).toBe(10);
      expect(shape.x).toBeCloseTo(x, 3);
      expect(shape.y).toBeCloseTo(110, 3);
    }
  });

  it('hurts only by landing on the player — never by being touched', () => {
    const sim = emptySim();
    const player = sim.playerIndex;
    const bird = spawn(sim, 'specht', 120, sim.room.minY + 10);
    place(sim, player, 120, 100);
    const full = sim.playerHealth;
    // Standing still: the landing circle is on them, and the landing hurts.
    expect(stepUntil(sim, bird, 'stuck')).toBeGreaterThanOrEqual(0);
    expect(sim.playerHealth).toBe(full - 1);
    // Standing in the stuck bird's face for the whole window: nothing more.
    const hurt = sim.playerHealth;
    for (let tick = 0; tick < 40; tick++) {
      place(sim, player, sim.positionX(bird) + 4, sim.positionY(bird));
      sim.step(IDLE);
    }
    expect(sim.playerHealth).toBe(hurt);
  });

  it('a dodged landing does no harm', () => {
    const sim = emptySim();
    const room = sim.room;
    const player = sim.playerIndex;
    const bird = spawn(sim, 'specht', 120, room.minY + 10);
    place(sim, player, 120, 100);
    const full = sim.playerHealth;
    expect(stepUntil(sim, bird, 'dive')).toBeGreaterThanOrEqual(0);
    place(sim, player, room.maxX - 20, room.maxY - 20);
    expect(stepUntil(sim, bird, 'stuck', 200)).toBeGreaterThanOrEqual(0);
    expect(sim.playerHealth).toBe(full);
  });

  it('sits still on the floor for the whole hit window, then flies to the nearest wall', () => {
    const sim = emptySim();
    const room = sim.room;
    const player = sim.playerIndex;
    const bird = spawn(sim, 'specht', 160, room.minY + 10);
    place(sim, player, 100, 100);
    expect(stepUntil(sim, bird, 'dive')).toBeGreaterThanOrEqual(0);
    // A clean dodge: out of the way as the dive starts, so it lands on
    // nothing and the window is measured with no push from a hit.
    place(sim, player, room.maxX - 20, room.maxY - 20);
    expect(stepUntil(sim, bird, 'stuck', 200)).toBeGreaterThanOrEqual(0);
    const stuckX = sim.positionX(bird);
    const stuckY = sim.positionY(bird);
    let ticks = 0;
    while (stateName(sim, bird) === 'stuck' && ticks < 200) {
      expect(enemyFlightHeight(sim, bird)).toBe(0);
      expect(sim.positionX(bird)).toBeCloseTo(stuckX, 5);
      expect(sim.positionY(bird)).toBeCloseTo(stuckY, 5);
      sim.step(IDLE);
      ticks += 1;
    }
    expect(ticks).toBe(55);
    expect(stepUntil(sim, bird, 'perch', 300)).toBeGreaterThanOrEqual(0);
    const wall = new Float64Array(4);
    expect(nearestWallPoint(room, stuckX, stuckY, sim.body.data[bird * 2] ?? 0, wall)).toBe(true);
    expect(sim.positionX(bird)).toBeCloseTo(wall[0] ?? 0, 1);
    expect(sim.positionY(bird)).toBeCloseTo(wall[1] ?? 0, 1);
    expect(enemyFlightHeight(sim, bird)).toBe(1);
  });

  it('throws wood chips while it drums', () => {
    const sim = emptySim();
    const bird = spawn(sim, 'specht', 160, sim.room.minY + 10);
    expect(stepUntil(sim, bird, 'drum')).toBeGreaterThanOrEqual(0);
    const before = sim.particles.liveCount;
    sim.step(IDLE);
    for (let tick = 0; tick < 12; tick++) {
      sim.step(IDLE);
    }
    expect(sim.particles.liveCount).toBeGreaterThan(before);
  });

  it('is deterministic', () => {
    const run = (): string => {
      const sim = emptySim();
      spawn(sim, 'specht', 160, 40);
      spawn(sim, 'specht', 60, 120);
      const trace: number[] = [];
      for (let tick = 0; tick < 1500; tick++) {
        sim.step(IDLE);
        trace.push(sim.positionX(sim.playerIndex), sim.playerHealth);
      }
      return trace.join(',');
    };
    expect(run()).toBe(run());
  });
});

describe('flying enemies (#411)', () => {
  /** Two straight-line rollers, identical but for `flying`. */
  const roller = (id: string, flying: boolean): EnemyDefinition => ({
    id,
    name: id,
    size: 'mini',
    health: 5,
    contactDamage: 0,
    flying,
    initial: 'roll',
    states: [
      {
        name: 'roll',
        behaviours: [{ behaviour: 'rollBounce', speed: 1.5, axis: 'x', direction: 1 }],
      },
    ],
  });
  const definitions = [roller('walker', false), roller('flier', true)];

  function room(): RoomGeometry {
    const geometry = new RoomGeometry(0, 0, 320, 180);
    geometry.addBlock(100, 20, 116, 36, true); // furniture
    geometry.addPit(Math.floor(100 / 16), Math.floor(100 / 16)); // a pit at 96-112, 96-112
    geometry.addStream(100, 140, 116, 156);
    return geometry;
  }

  function runAlong(id: string, y: number): number {
    const sim = emptySim(definitions, room());
    place(sim, sim.playerIndex, 300, 170);
    const body = spawn(sim, id, 60, y);
    for (let tick = 0; tick < 300; tick++) {
      sim.step(IDLE);
    }
    return sim.positionX(body);
  }

  it('a walker is stopped by furniture and by a pit', () => {
    expect(runAlong('walker', 28)).toBeLessThan(100);
    expect(runAlong('walker', 104)).toBeLessThan(100);
  });

  it('a flier crosses furniture, pits and water', () => {
    expect(runAlong('flier', 28)).toBeGreaterThan(116);
    expect(runAlong('flier', 104)).toBeGreaterThan(116);
    expect(runAlong('flier', 148)).toBeGreaterThan(116);
  });

  it('a flier still stops at the room wall', () => {
    expect(runAlong('flier', 60)).toBeLessThanOrEqual(320);
  });
});
