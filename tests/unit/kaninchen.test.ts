import { describe, expect, it } from 'vitest';
import { ENEMY_DEFINITIONS, kaninchen } from '../../src/content/enemies/index.js';
import { entityIndex } from '../../src/sim/ecs/entity.js';
import type { EnemyDefinition } from '../../src/sim/enemy/definition.js';
import { EnemyRegistry } from '../../src/sim/enemy/registry.js';
import { GameSim } from '../../src/sim/game/sim.js';
import { createInputFrame } from '../../src/sim/input/frame.js';
import { RoomGeometry } from '../../src/sim/room/geometry.js';
import {
  ENEMY_STRIDE,
  enemyHopProgress,
  snapToCardinal,
  snapToDiagonal,
} from '../../src/sim/systems/enemy.js';

/**
 * Kaninchen (#407): hops on the four axes, attacks only on a diagonal, only
 * from a pawn's capture square. Plus the two generic `chargeAtPlayer` options
 * it brought (`snap`, `maxDistance`), tested on enemies of their own.
 */

const IDLE = createInputFrame();

function bareSim(definitions?: readonly EnemyDefinition[], room?: RoomGeometry): GameSim {
  const sim = new GameSim({
    seed: 11,
    room: room ?? new RoomGeometry(0, 0, 320, 180),
    ...(definitions === undefined ? {} : { enemies: definitions }),
  });
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

function teleportPlayer(sim: GameSim, x: number, y: number): void {
  const base = sim.playerIndex * 4;
  sim.transform.data[base] = x;
  sim.transform.data[base + 1] = y;
  sim.transform.data[base + 2] = x;
  sim.transform.data[base + 3] = y;
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

describe('snap helpers', () => {
  it('snaps to the nearest diagonal', () => {
    expect(snapToDiagonal(0.1)).toBeCloseTo(Math.PI / 4);
    expect(snapToDiagonal(Math.PI - 0.2)).toBeCloseTo((3 * Math.PI) / 4);
    expect(snapToDiagonal(-Math.PI / 2 + 0.3)).toBeCloseTo(-Math.PI / 4);
  });

  it('snaps to the nearest axis', () => {
    expect(snapToCardinal(0.6)).toBeCloseTo(0);
    expect(snapToCardinal(1.0)).toBeCloseTo(Math.PI / 2);
  });
});

describe('chargeAtPlayer snap and maxDistance (generic)', () => {
  const charger = (
    snap: 'cardinal' | 'diagonal' | undefined,
    maxDistance: number | undefined,
  ): EnemyDefinition => ({
    id: 'charger',
    name: 'Charger',
    size: 'mini',
    health: 99,
    contactDamage: 0,
    initial: 'go',
    states: [
      {
        name: 'go',
        behaviours: [
          {
            behaviour: 'chargeAtPlayer',
            speed: 2,
            ...(snap === undefined ? {} : { snap }),
            ...(maxDistance === undefined ? {} : { maxDistance }),
          },
        ],
      },
    ],
  });

  it('a cardinal snap runs straight along the nearest axis', () => {
    const sim = bareSim([charger('cardinal', undefined)]);
    teleportPlayer(sim, 300, 100);
    const body = spawn(sim, 'charger', 100, 80);
    for (let step = 0; step < 20; step++) {
      sim.step(IDLE);
    }
    expect(sim.positionY(body)).toBeCloseTo(80, 5);
    expect(sim.positionX(body)).toBeGreaterThan(130);
  });

  it('a diagonal snap runs along the nearest diagonal', () => {
    const sim = bareSim([charger('diagonal', undefined)]);
    teleportPlayer(sim, 200, 120);
    const body = spawn(sim, 'charger', 100, 100);
    for (let step = 0; step < 15; step++) {
      sim.step(IDLE);
    }
    const dx = sim.positionX(body) - 100;
    const dy = sim.positionY(body) - 100;
    expect(dx).toBeGreaterThan(10);
    expect(dy).toBeCloseTo(dx, 5);
  });

  it('maxDistance stops the charge after exactly that far', () => {
    const sim = bareSim([charger(undefined, 15)]);
    teleportPlayer(sim, 300, 100);
    const body = spawn(sim, 'charger', 100, 100);
    for (let step = 0; step < 40; step++) {
      sim.step(IDLE);
    }
    expect(sim.positionX(body)).toBeCloseTo(115, 3);
  });

  it('rejects a bad snap or a non-positive maxDistance', () => {
    const bad = charger(undefined, 0);
    expect(() => new EnemyRegistry([bad])).toThrow(/maxDistance/);
    const typo = {
      ...charger(undefined, undefined),
      states: [
        { name: 'go', behaviours: [{ behaviour: 'chargeAtPlayer', speed: 2, snap: 'diag' }] },
      ],
    } as unknown as EnemyDefinition;
    expect(() => new EnemyRegistry([typo])).toThrow(/snap/);
  });
});

describe('Kaninchen (#407)', () => {
  it('compiles as an easy weak mini', () => {
    const compiled = new EnemyRegistry(ENEMY_DEFINITIONS).get('kaninchen');
    expect(kaninchen.size).toBe('mini');
    expect(compiled.health).toBe(3);
    expect(compiled.lootTier).toBe('weak');
    expect(compiled.states.map((state) => state.name)).toEqual(['hop', 'windup', 'strike']);
  });

  it('only ever hops along an axis, and never toward a player it is not next to', () => {
    const sim = bareSim();
    teleportPlayer(sim, 30, 30);
    const rabbit = spawn(sim, 'kaninchen', 200, 100);
    let lastX = sim.positionX(rabbit);
    let lastY = sim.positionY(rabbit);
    let hops = 0;
    for (let step = 0; step < 600; step++) {
      sim.step(IDLE);
      const x = sim.positionX(rabbit);
      const y = sim.positionY(rabbit);
      const movedX = Math.abs(x - lastX) > 1e-6;
      const movedY = Math.abs(y - lastY) > 1e-6;
      // Never both at once: every step of every hop is orthogonal.
      expect(movedX && movedY).toBe(false);
      if ((movedX || movedY) && enemyHopProgress(sim, rabbit) > 0) {
        hops += 1;
      }
      lastX = x;
      lastY = y;
    }
    expect(stateName(sim, rabbit)).toBe('hop');
    expect(hops).toBeGreaterThan(50);
  });

  it('covers exactly one hopDistance per hop', () => {
    const sim = bareSim();
    teleportPlayer(sim, 30, 30);
    const rabbit = spawn(sim, 'kaninchen', 160, 90);
    const startX = sim.positionX(rabbit);
    const startY = sim.positionY(rabbit);
    for (let step = 0; step < 12; step++) {
      sim.step(IDLE);
    }
    const moved =
      Math.abs(sim.positionX(rabbit) - startX) + Math.abs(sim.positionY(rabbit) - startY);
    // `hopDistance` is scaled by the global `enemy.speedScale`, like every walk.
    expect(moved).toBeCloseTo(16 * sim.tuning.enemy.speedScale, 3);
  });

  it('never hops into a block', () => {
    const room = new RoomGeometry(0, 0, 320, 180);
    // Boxed in on three sides: only west is open.
    room.addBlock(166, 60, 200, 120);
    room.addBlock(120, 60, 200, 84);
    room.addBlock(120, 96, 200, 120);
    const sim = bareSim(undefined, room);
    teleportPlayer(sim, 30, 30);
    const rabbit = spawn(sim, 'kaninchen', 158, 90);
    for (let step = 0; step < 400; step++) {
      sim.step(IDLE);
      expect(room.isClear(sim.positionX(rabbit), sim.positionY(rabbit), 2.9)).toBe(true);
    }
  });

  it('winds up only from a diagonal capture square, then leaps diagonally', () => {
    const sim = bareSim();
    const rabbit = spawn(sim, 'kaninchen', 160, 90);
    // Straight beside it is not a capture square.
    teleportPlayer(sim, 176, 90);
    for (let step = 0; step < 120; step++) {
      sim.step(IDLE);
      expect(stateName(sim, rabbit)).toBe('hop');
      teleportPlayer(sim, sim.positionX(rabbit) + 16, sim.positionY(rabbit));
    }
    // One diagonal step away, while it rests: it winds up.
    let wound = false;
    for (let step = 0; step < 60 && !wound; step++) {
      teleportPlayer(sim, sim.positionX(rabbit) + 16, sim.positionY(rabbit) + 16);
      sim.step(IDLE);
      wound = stateName(sim, rabbit) === 'windup';
    }
    expect(wound).toBe(true);
    const fromX = sim.positionX(rabbit);
    const fromY = sim.positionY(rabbit);
    // Step off the square: the leap still goes where the wind-up pointed.
    teleportPlayer(sim, fromX - 60, fromY + 60);
    for (let step = 0; step < 40 && stateName(sim, rabbit) !== 'strike'; step++) {
      sim.step(IDLE);
    }
    // Where the leap ended: the last tick still in `strike` (the next hop
    // starts moving on the tick it takes over).
    let endX = sim.positionX(rabbit);
    let endY = sim.positionY(rabbit);
    for (let step = 0; step < 30 && stateName(sim, rabbit) === 'strike'; step++) {
      endX = sim.positionX(rabbit);
      endY = sim.positionY(rabbit);
      sim.step(IDLE);
    }
    const dx = endX - fromX;
    const dy = endY - fromY;
    expect(dx).toBeGreaterThan(10);
    expect(dy).toBeCloseTo(dx, 3);
    expect(Math.hypot(dx, dy)).toBeLessThanOrEqual(26.01);
  });

  it('never winds up mid-hop', () => {
    const sim = bareSim();
    const rabbit = spawn(sim, 'kaninchen', 160, 90);
    for (let step = 0; step < 300; step++) {
      teleportPlayer(sim, sim.positionX(rabbit) + 16, sim.positionY(rabbit) - 16);
      const hopping = enemyHopProgress(sim, rabbit) > 0;
      sim.step(IDLE);
      if (stateName(sim, rabbit) === 'windup') {
        expect(hopping).toBe(false);
        return;
      }
    }
    throw new Error('never wound up');
  });
});
