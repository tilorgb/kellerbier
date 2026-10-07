import { describe, expect, it, vi } from 'vitest';
import { ENEMY_DEFINITIONS } from '../../src/content/enemies/index.js';
import { ROOM_TEMPLATES } from '../../src/content/rooms/index.js';
import { CollisionLayer } from '../../src/sim/collision/layers.js';
import { entityIndex } from '../../src/sim/ecs/entity.js';
import type { EnemyDefinition } from '../../src/sim/enemy/definition.js';
import { EnemyRegistry } from '../../src/sim/enemy/registry.js';
import { GameSim } from '../../src/sim/game/sim.js';
import { createInputFrame } from '../../src/sim/input/frame.js';
import { ProjectileTeam } from '../../src/sim/projectile/store.js';
import { RoomGeometry } from '../../src/sim/room/geometry.js';
import { compileRoomTemplate } from '../../src/sim/room/template.js';
import { ENEMY_STRIDE, enemySubmerged } from '../../src/sim/systems/enemy.js';

/**
 * Bachforelle (#408): lives in the Waldbach as a shadow nothing can touch,
 * breaks the surface at a random moment, fires one shot down each diagonal,
 * and dives again — and never once leaves the water.
 */

const IDLE = createInputFrame();

function groveRoom(): RoomGeometry {
  const grove = ROOM_TEMPLATES.find((room) => (room as { id?: string }).id === 'wald-grove');
  return compileRoomTemplate(grove, 3, 'wald-grove', ENEMY_DEFINITIONS).geometry;
}

function bareSim(room: RoomGeometry, seed = 3, enemies?: readonly EnemyDefinition[]): GameSim {
  const sim = new GameSim({ seed, room, ...(enemies === undefined ? {} : { enemies }) });
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

function spawnTrout(sim: GameSim, x: number, y: number): number {
  const entity = sim.spawnEnemyKind(sim.enemies.indexOf('bachforelle'), x, y);
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
  return -1;
}

/** Parks the player far from the water, out of every shot's way. */
function parkPlayer(sim: GameSim): void {
  const base = sim.playerIndex * 4;
  sim.transform.data[base] = sim.room.minX + 12;
  sim.transform.data[base + 1] = sim.room.maxY - 12;
  sim.transform.data[base + 2] = sim.room.minX + 12;
  sim.transform.data[base + 3] = sim.room.maxY - 12;
}

describe('Bachforelle (#408)', () => {
  it('compiles as a water creature that starts submerged', () => {
    const compiled = new EnemyRegistry(ENEMY_DEFINITIONS).get('bachforelle');
    expect(compiled.zone).toBe('waldbach');
    expect(compiled.health).toBe(4);
    const swim = compiled.states.find((state) => state.name === 'swim');
    expect(swim?.submerged).toBe(true);
    expect(swim?.rollsDuration).toBe(true);
    expect(compiled.states.find((state) => state.name === 'surface')?.submerged).toBe(false);
  });

  it('is placed into the stream when spawned on the bank', () => {
    const sim = bareSim(groveRoom());
    const trout = spawnTrout(sim, sim.room.minX + 20, sim.room.maxY - 20);
    expect(sim.room.isInStream(sim.positionX(trout), sim.positionY(trout))).toBe(true);
  });

  it('never leaves the water over 10,000 ticks, across seeds', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const sim = bareSim(groveRoom(), seed);
      parkPlayer(sim);
      const trout = spawnTrout(sim, 160, 90);
      let surfaced = 0;
      for (let tick = 0; tick < 10_000; tick++) {
        sim.step(IDLE);
        parkPlayer(sim);
        expect(sim.room.isInStream(sim.positionX(trout), sim.positionY(trout))).toBe(true);
        if (!enemySubmerged(sim, trout)) {
          surfaced += 1;
        }
      }
      expect(surfaced).toBeGreaterThan(0);
    }
  });

  it('surfaces after a random 90-240 ticks, different between seeds', () => {
    const waits = new Set<number>();
    for (const seed of [11, 12, 13, 14, 15, 16]) {
      const sim = bareSim(groveRoom(), seed);
      parkPlayer(sim);
      const trout = spawnTrout(sim, 160, 90);
      const wait = stepUntil(sim, trout, 'surface', 400);
      expect(wait).toBeGreaterThanOrEqual(90);
      expect(wait).toBeLessThanOrEqual(241);
      waits.add(wait);
    }
    expect(waits.size).toBeGreaterThan(1);
  });

  it('is on no collision layer while submerged, and back on Obstacle when surfaced', () => {
    const sim = bareSim(groveRoom());
    parkPlayer(sim);
    const trout = spawnTrout(sim, 160, 90);
    expect(enemySubmerged(sim, trout)).toBe(true);
    expect(sim.collision.data[trout * 2]).toBe(0);
    sim.applySplashDamage(sim.positionX(trout), sim.positionY(trout), 30, 10);
    expect(sim.health.data[trout * 2]).toBe(4);

    expect(stepUntil(sim, trout, 'surface', 400)).toBeGreaterThan(0);
    expect(enemySubmerged(sim, trout)).toBe(false);
    expect(sim.collision.data[trout * 2]).toBe(CollisionLayer.Obstacle);
    sim.applySplashDamage(sim.positionX(trout), sim.positionY(trout), 30, 1);
    expect(sim.health.data[trout * 2]).toBe(3);
  });

  it('fires exactly four shots, one down each diagonal', () => {
    const sim = bareSim(groveRoom());
    parkPlayer(sim);
    const trout = spawnTrout(sim, 160, 90);
    expect(stepUntil(sim, trout, 'fire', 500)).toBeGreaterThan(0);
    sim.step(IDLE);
    const angles: number[] = [];
    sim.projectiles.forEachLive((slot) => {
      if (sim.projectiles.team[slot] === ProjectileTeam.Enemy) {
        angles.push(
          Math.atan2(sim.projectiles.velocityY[slot] ?? 0, sim.projectiles.velocityX[slot] ?? 0),
        );
      }
    });
    expect(angles).toHaveLength(4);
    const quarter = Math.PI / 2;
    for (const angle of angles) {
      // Each one sits exactly on a diagonal: π/4 past a multiple of π/2.
      const past = (((angle - quarter / 2) % quarter) + quarter) % quarter;
      expect(Math.min(past, quarter - past)).toBeLessThan(1e-5);
    }
    expect(new Set(angles.map((angle) => Math.round(angle * 100))).size).toBe(4);
  });

  it('dives again after lingering', () => {
    const sim = bareSim(groveRoom());
    parkPlayer(sim);
    const trout = spawnTrout(sim, 160, 90);
    stepUntil(sim, trout, 'linger', 500);
    expect(stepUntil(sim, trout, 'swim', 40)).toBeGreaterThanOrEqual(24);
    expect(enemySubmerged(sim, trout)).toBe(true);
    expect(sim.collision.data[trout * 2]).toBe(0);
  });

  it('is not spawned at all in a room with no stream, and never counts toward its clear', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const sim = bareSim(new RoomGeometry(0, 0, 320, 180));
    const entity = sim.spawnEnemyKind(sim.enemies.indexOf('bachforelle'), 100, 100);
    sim.world.flush();
    expect(sim.world.isAlive(entity)).toBe(false);
    expect(sim.liveEnemyCount).toBe(0);
    warn.mockRestore();
  });
});

describe('ranged after (generic)', () => {
  it('rejects a range with min above max', () => {
    const bad: EnemyDefinition = {
      id: 'bad',
      name: 'Bad',
      size: 'mini',
      health: 1,
      contactDamage: 0,
      initial: 'a',
      states: [
        {
          name: 'a',
          behaviours: [{ behaviour: 'pause' }],
          transitions: [{ to: 'a', after: { min: 10, max: 5 } }],
        },
      ],
    };
    expect(() => new EnemyRegistry([bad])).toThrow(/ranged "after"/);
  });
});

describe('fireRing (generic)', () => {
  it('rejects aimCardinal and an empty ring', () => {
    const ring = (shots: number, aimCardinal: boolean): EnemyDefinition => ({
      id: 'ringer',
      name: 'Ringer',
      size: 'mini',
      health: 1,
      contactDamage: 0,
      initial: 'a',
      states: [
        {
          name: 'a',
          behaviours: [
            { behaviour: 'pause' },
            {
              behaviour: 'fireRing',
              shots,
              everyTicks: 10,
              speed: 1,
              damage: 1,
              lifetimeTicks: 10,
              aimCardinal,
            },
          ],
        },
      ],
    });
    expect(() => new EnemyRegistry([ring(0, false)])).toThrow(/at least one shot/);
    expect(() => new EnemyRegistry([ring(4, true)])).toThrow(/aimCardinal/);
  });
});
