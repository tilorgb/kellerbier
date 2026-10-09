import { describe, expect, it } from 'vitest';
import { ENEMY_DEFINITIONS } from '../../src/content/enemies/index.js';
import { mountainHare } from '../../src/content/enemies/mountain-hare.js';
import { rescueDog } from '../../src/content/enemies/rescue-dog.js';
import { skier } from '../../src/content/enemies/skier.js';
import { snowCannon } from '../../src/content/enemies/snow-cannon.js';
import { summitCross } from '../../src/content/enemies/summit-cross.js';
import { entityIndex } from '../../src/sim/ecs/entity.js';
import type { EnemyDefinition } from '../../src/sim/enemy/definition.js';
import { EnemyRegistry } from '../../src/sim/enemy/registry.js';
import { GameSim } from '../../src/sim/game/sim.js';
import { createInputFrame } from '../../src/sim/input/frame.js';
import { ProjectileTeam } from '../../src/sim/projectile/store.js';
import { RoomGeometry } from '../../src/sim/room/geometry.js';
import { ENEMY_STRIDE } from '../../src/sim/systems/enemy.js';

/**
 * Floor 4's pitched mobs (#40): the Summit cross, Snow cannon, Mountain hare,
 * Skier and Rescue dog, as authored. They are tested straight from their
 * content files, not through the roster, so this holds whether or not a mob has
 * its art yet and been registered.
 */

const NEW_MOBS: readonly EnemyDefinition[] = [
  summitCross,
  snowCannon,
  mountainHare,
  skier,
  rescueDog,
];
const IDLE = createInputFrame();

function openSim(seed = 5): GameSim {
  const known = new Set(ENEMY_DEFINITIONS.map((definition) => definition.id));
  const sim = new GameSim({
    seed,
    room: new RoomGeometry(0, 0, 320, 180),
    enemies: [...ENEMY_DEFINITIONS, ...NEW_MOBS.filter((mob) => !known.has(mob.id))],
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
  sim.health.data[player * 2] = 1_000_000;
  sim.health.data[player * 2 + 1] = 1_000_000;
  return sim;
}

function place(sim: GameSim, index: number, x: number, y: number): void {
  const t = sim.transform.data;
  t[index * 4] = x;
  t[index * 4 + 1] = y;
  t[index * 4 + 2] = x;
  t[index * 4 + 3] = y;
  sim.velocity.data[index * 2] = 0;
  sim.velocity.data[index * 2 + 1] = 0;
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

function enemyShotBearings(sim: GameSim): number[] {
  const out: number[] = [];
  const shots = sim.projectiles;
  shots.forEachLive((slot) => {
    if (shots.team[slot] === ProjectileTeam.Enemy) {
      out.push(Math.atan2(shots.velocityY[slot] ?? 0, shots.velocityX[slot] ?? 0));
    }
  });
  return out;
}

describe('the pitched Floor 4 mobs compile (#40)', () => {
  it.each(NEW_MOBS.map((mob) => [mob.id, mob] as const))('%s', (_id, mob) => {
    expect(() => new EnemyRegistry([mob])).not.toThrow();
  });
});

describe('Skier (#40): a slalom, and a drift-stop that fires off to the side', () => {
  it('moves fast, and not toward the player', () => {
    const sim = openSim();
    const skierIndex = spawn(sim, 'skier', 160, 90);
    // A player far off in a corner: if he steered at them he would head there.
    place(sim, sim.playerIndex, 20, 20);
    let travelled = 0;
    let lastX = sim.positionX(skierIndex);
    let lastY = sim.positionY(skierIndex);
    let towardPlayer = 0;
    let samples = 0;
    for (let tick = 0; tick < 40 && stateName(sim, skierIndex) === 'carve'; tick++) {
      place(sim, sim.playerIndex, 20, 20);
      sim.step(IDLE);
      const x = sim.positionX(skierIndex);
      const y = sim.positionY(skierIndex);
      travelled += Math.hypot(x - lastX, y - lastY);
      const toX = 20 - x;
      const toY = 20 - y;
      const along = ((x - lastX) * toX + (y - lastY) * toY) / (Math.hypot(toX, toY) || 1);
      towardPlayer += along;
      samples += 1;
      lastX = x;
      lastY = y;
    }
    expect(samples).toBeGreaterThan(20);
    // About 2.4 units a tick, well above a wanderer's.
    expect(travelled / samples).toBeGreaterThan(1.5);
    // Not a chaser: his net progress toward the player is a fraction of his travel.
    expect(towardPlayer).toBeLessThan(travelled * 0.8);
  });

  it('does no contact damage', () => {
    expect(skier.contactDamage).toBe(0);
  });

  it('stops, crouches, then throws a fan a quarter turn off the way he was going', () => {
    const sim = openSim();
    const skierIndex = spawn(sim, 'skier', 160, 90);
    let headingBeforeStop = 0;
    let fired = false;
    for (let tick = 0; tick < 600 && !fired; tick++) {
      place(sim, sim.playerIndex, 20, 170);
      const before = stateName(sim, skierIndex);
      if (before === 'carve') {
        headingBeforeStop = Math.atan2(
          sim.positionY(skierIndex) - sim.previousY(skierIndex),
          sim.positionX(skierIndex) - sim.previousX(skierIndex),
        );
      }
      sim.step(IDLE);
      const bearings = enemyShotBearings(sim);
      if (bearings.length === 5) {
        fired = true;
        const centre = bearings.reduce((sum, bearing) => sum + bearing, 0) / bearings.length;
        // The fan is centred a quarter turn off the heading — either side.
        const turn = Math.abs(
          ((centre - headingBeforeStop + Math.PI * 3) % (Math.PI * 2)) - Math.PI,
        );
        expect(turn).toBeGreaterThan(Math.PI / 2 - 0.5);
        expect(turn).toBeLessThan(Math.PI / 2 + 0.5);
      }
    }
    expect(fired).toBe(true);
  });

  it('drifts at random moments, not on a fixed beat', () => {
    const stopAt = (seed: number): number => {
      const sim = openSim(seed);
      const skierIndex = spawn(sim, 'skier', 160, 90);
      for (let tick = 0; tick < 400; tick++) {
        place(sim, sim.playerIndex, 20, 170);
        sim.step(IDLE);
        if (stateName(sim, skierIndex) === 'crouch') {
          return tick;
        }
      }
      return -1;
    };
    const stops = [1, 2, 3, 4, 5, 6].map(stopAt);
    expect(stops.every((tick) => tick > 0)).toBe(true);
    expect(new Set(stops).size).toBeGreaterThan(2);
  });
});

describe('Rescue dog (#40): runs up, sits, barks one clod, runs off', () => {
  it('goes through its cycle and fires exactly one shot per bark', () => {
    const sim = openSim();
    const dog = spawn(sim, 'rescue-dog', 60, 90);
    const seen: string[] = [];
    let maxShots = 0;
    for (let tick = 0; tick < 900; tick++) {
      place(sim, sim.playerIndex, 240, 90);
      sim.step(IDLE);
      const name = stateName(sim, dog);
      if (seen.at(-1) !== name) {
        seen.push(name);
      }
      maxShots = Math.max(maxShots, enemyShotBearings(sim).length);
    }
    const cycle = seen.join(' ');
    expect(cycle).toContain('search run sit bark flee search');
    expect(maxShots).toBe(1);
  });

  it('sits within range of the player before it barks', () => {
    const sim = openSim();
    const dog = spawn(sim, 'rescue-dog', 60, 90);
    for (let tick = 0; tick < 600 && stateName(sim, dog) !== 'sit'; tick++) {
      place(sim, sim.playerIndex, 240, 90);
      sim.step(IDLE);
    }
    expect(stateName(sim, dog)).toBe('sit');
    expect(Math.hypot(sim.positionX(dog) - 240, sim.positionY(dog) - 90)).toBeLessThan(70);
  });

  it('is small and dies in two hits of one', () => {
    expect(rescueDog.size).toBe('mini');
    expect(rescueDog.health).toBeLessThanOrEqual(2);
  });
});
