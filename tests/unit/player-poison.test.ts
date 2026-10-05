import { describe, expect, it } from 'vitest';
import cellarCrossroads from '../../src/content/rooms/cellar.json';
import { entityIndex } from '../../src/sim/ecs/entity.js';
import { ENEMY_DEFINITIONS } from '../../src/content/enemies/index.js';
import type { EnemyDefinition } from '../../src/sim/enemy/definition.js';
import { GameSim, type GameSimOptions } from '../../src/sim/game/sim.js';
import { CLOUD_CAPACITY } from '../../src/sim/hazard/cloud-store.js';
import { createInputFrame } from '../../src/sim/input/frame.js';
import { resolveProjectileHit, finalizeProjectileTags } from '../../src/sim/projectile/behavior.js';
import { ProjectileTeam } from '../../src/sim/projectile/store.js';
import { ProjectileTag } from '../../src/sim/projectile/tags.js';
import { RoomGeometry } from '../../src/sim/room/geometry.js';
import { STATUS_EFFECT_STRIDE, STATUS_POISON } from '../../src/sim/systems/status-effects.js';

/**
 * Poison on the player (#401): enemy shots and clouds poison, it refreshes
 * and never stacks, it can kill, and only a drunk Maß cures it.
 */
const IDLE = createInputFrame();

const spitter: EnemyDefinition = {
  id: 'test-spitter',
  name: 'Test Spitter',
  size: 'mid',
  health: 999,
  contactDamage: 0,
  initial: 'spit',
  states: [
    {
      name: 'spit',
      behaviours: [
        { behaviour: 'pause' },
        {
          behaviour: 'fireAtPlayer',
          everyTicks: 600,
          speed: 3,
          damage: 0,
          lifetimeTicks: 200,
          poison: true,
        },
      ],
    },
  ],
};

const emitter: EnemyDefinition = {
  id: 'test-emitter',
  name: 'Test Emitter',
  size: 'mid',
  health: 999,
  contactDamage: 0,
  initial: 'wait',
  states: [
    { name: 'wait', behaviours: [{ behaviour: 'pause' }], transitions: [{ to: 'puff', after: 2 }] },
    {
      name: 'puff',
      behaviours: [
        { behaviour: 'pause' },
        { behaviour: 'emitCloud', radius: 30, growTicks: 10, lifetimeTicks: 40 },
      ],
    },
  ],
};

function emptySim(options: GameSimOptions = {}): GameSim {
  const sim = new GameSim({
    room: new RoomGeometry(0, 0, 320, 180),
    enemies: [...ENEMY_DEFINITIONS, spitter, emitter],
    ...options,
  });
  const player = sim.playerIndex;
  const doomed: number[] = [];
  sim.world.forEach(sim.collidableMask, (index) => {
    if (index !== player) doomed.push(index);
  });
  for (const index of doomed) sim.world.destroy(sim.world.entityAt(index));
  sim.world.flush();
  return sim;
}

function poison(sim: GameSim, index = sim.playerIndex): number {
  return sim.statusEffect.data[index * STATUS_EFFECT_STRIDE + STATUS_POISON] ?? 0;
}

function enemyPoisonShot(sim: GameSim): number {
  const slot = sim.projectiles.spawn(
    100,
    100,
    1,
    0,
    3,
    0,
    60,
    ProjectileTeam.Enemy,
    ProjectileTag.Poison,
  );
  finalizeProjectileTags(sim, slot);
  return slot;
}

describe('poisoned enemy shots', () => {
  it('a poison: true shot carries the Poison tag and poisons the player on a hit', () => {
    const sim = emptySim();
    const player = sim.playerIndex;
    sim.spawnEnemyKind(
      sim.enemies.indexOf('test-spitter'),
      sim.positionX(player) + 60,
      sim.positionY(player),
    );
    sim.world.flush();
    for (let tick = 0; tick < 60 && poison(sim) === 0; tick++) {
      sim.step(IDLE);
    }
    expect(poison(sim)).toBeGreaterThan(0);
    expect(poison(sim)).toBeLessThanOrEqual(sim.tuning.projectileTags.playerPoisonDurationTicks);
  });

  it('a second hit refreshes the duration and never stacks', () => {
    const sim = emptySim();
    const full = sim.tuning.projectileTags.playerPoisonDurationTicks;
    resolveProjectileHit(sim, enemyPoisonShot(sim), sim.playerIndex, 100, 100, -1, 0);
    expect(poison(sim)).toBe(full);
    for (let tick = 0; tick < 50; tick++) sim.step(IDLE);
    expect(poison(sim)).toBe(full - 50);
    resolveProjectileHit(sim, enemyPoisonShot(sim), sim.playerIndex, 100, 100, -1, 0);
    expect(poison(sim)).toBe(full);
  });

  it('uses the player knobs, not the knobs for poison on enemies', () => {
    const sim = emptySim();
    sim.tuning.projectileTags.poisonDurationTicks = 7;
    sim.tuning.projectileTags.playerPoisonDurationTicks = 200;
    resolveProjectileHit(sim, enemyPoisonShot(sim), sim.playerIndex, 100, 100, -1, 0);
    expect(poison(sim)).toBe(200);
  });
});

describe('poison damage', () => {
  it('costs the starting 3 half-Maß over a full poisoning', () => {
    const sim = emptySim();
    const before = sim.playerHealth;
    sim.poisonPlayer();
    for (let tick = 0; tick < 200; tick++) sim.step(IDLE);
    expect(poison(sim)).toBe(0);
    expect(before - sim.playerHealth).toBe(3);
  });

  it('can kill the player', () => {
    const sim = emptySim();
    sim.health.data[sim.playerIndex * 2] = 1;
    sim.poisonPlayer();
    for (let tick = 0; tick < 200 && !sim.playerDead; tick++) sim.step(IDLE);
    expect(sim.playerDead).toBe(true);
  });

  it('is not swallowed by i-frames, and does not grant any', () => {
    const sim = emptySim();
    sim.poisonPlayer();
    sim.makePlayerInvulnerable(500);
    const before = sim.playerHealth;
    for (let tick = 0; tick < 70; tick++) sim.step(IDLE);
    // A tick lands every 60 sim ticks, through the i-frames.
    expect(before - sim.playerHealth).toBeGreaterThanOrEqual(1);

    const other = emptySim();
    other.poisonPlayer();
    for (let tick = 0; tick < 70; tick++) other.step(IDLE);
    // A tick landed, and the player is still hittable.
    expect(other.playerInvulnerableTicks).toBe(0);
  });
});

describe('a Maß cures poison', () => {
  function drinkOnTheFloor(sim: GameSim, id: 'mass-full' | 'mass-half'): void {
    const player = sim.playerIndex;
    sim.spawnPickup(id, sim.positionX(player), sim.positionY(player));
    sim.world.flush();
    sim.step(IDLE);
  }

  it.each(['mass-full', 'mass-half'] as const)('%s clears it', (id) => {
    const sim = emptySim();
    sim.poisonPlayer();
    drinkOnTheFloor(sim, id);
    expect(poison(sim)).toBe(0);
  });

  it('still cures in a sober run, where the Promille raise is inert', () => {
    const sim = emptySim({ promilleUnlocked: false });
    sim.poisonPlayer();
    sim.drinkBeer(sim.tuning.promille.massFullAmount);
    expect(poison(sim)).toBe(0);
    expect(sim.promille).toBe(0);
  });

  it('a Maß stored by the Sixpack does not cure — pouring it does', () => {
    const sim = emptySim();
    sim.pickUpItem('sixpack');
    sim.poisonPlayer();
    drinkOnTheFloor(sim, 'mass-full');
    expect(sim.itemState('sixpack').timer).toBeGreaterThan(0);
    expect(poison(sim)).toBeGreaterThan(0);

    expect(sim.useActiveItem('sixpack')).toBe(true);
    expect(poison(sim)).toBe(0);
  });

  it('other food does not cure', () => {
    const sim = emptySim();
    sim.poisonPlayer();
    const player = sim.playerIndex;
    sim.spawnPickup('bratwurst-full', sim.positionX(player), sim.positionY(player));
    sim.world.flush();
    sim.step(IDLE);
    expect(poison(sim)).toBeGreaterThan(0);
  });
});

describe('poison clouds', () => {
  it('grows, lingers, then despawns', () => {
    const sim = emptySim();
    sim.spawnPoisonCloud(10, 10, 40, 10, 30);
    const cloud = sim.clouds.oldest;
    expect(sim.clouds.currentRadius(cloud)).toBe(0);
    for (let tick = 0; tick < 5; tick++) sim.step(IDLE);
    expect(sim.clouds.currentRadius(cloud)).toBeCloseTo(20);
    for (let tick = 0; tick < 10; tick++) sim.step(IDLE);
    expect(sim.clouds.currentRadius(cloud)).toBe(40);
    for (let tick = 0; tick < 20; tick++) sim.step(IDLE);
    expect(sim.clouds.count).toBe(0);
  });

  it('refreshes poison while the player stands inside, and not outside', () => {
    const sim = emptySim();
    const player = sim.playerIndex;
    sim.spawnPoisonCloud(sim.positionX(player) + 200, sim.positionY(player), 20, 0, 60);
    sim.step(IDLE);
    expect(poison(sim)).toBe(0);

    const healthBefore = sim.playerHealth;
    sim.spawnPoisonCloud(sim.positionX(player), sim.positionY(player), 20, 0, 400);
    sim.step(IDLE);
    const full = sim.tuning.projectileTags.playerPoisonDurationTicks;
    expect(poison(sim)).toBeGreaterThan(full - 2);
    for (let tick = 0; tick < 120; tick++) sim.step(IDLE);
    // Standing in it for two seconds is no more poison than one tick of it,
    // and costs one half-Maß a second — not one per tick it keeps refreshing.
    expect(poison(sim)).toBeLessThanOrEqual(full);
    expect(poison(sim)).toBeGreaterThan(full - 2);
    expect(healthBefore - sim.playerHealth).toBeLessThanOrEqual(3);
    expect(healthBefore - sim.playerHealth).toBeGreaterThanOrEqual(2);
  });

  it('never poisons enemies', () => {
    const sim = emptySim();
    const enemy = entityIndex(sim.spawnTarget(200, 100, 8));
    sim.world.flush();
    sim.spawnPoisonCloud(200, 100, 40, 0, 60);
    for (let tick = 0; tick < 30; tick++) sim.step(IDLE);
    expect(poison(sim, enemy)).toBe(0);
  });

  it('recycles the oldest on overflow instead of failing', () => {
    const sim = emptySim();
    for (let index = 0; index < CLOUD_CAPACITY + 10; index++) {
      sim.spawnPoisonCloud(index, 0, 5, 0, 300);
    }
    expect(sim.clouds.count).toBeLessThanOrEqual(sim.tuning.poisonCloud.maxActive);
    sim.tuning.poisonCloud.maxActive = 2;
    sim.spawnPoisonCloud(0, 0, 5, 0, 300);
    expect(sim.clouds.count).toBe(2);
  });

  it('are cleared on room load', () => {
    const sim = emptySim();
    sim.spawnPoisonCloud(10, 10, 40, 10, 300);
    sim.loadRoom(cellarCrossroads);
    expect(sim.clouds.count).toBe(0);
  });

  it('emitCloud leaves one at the emitter on state entry', () => {
    const sim = emptySim();
    const player = sim.playerIndex;
    sim.spawnEnemyKind(
      sim.enemies.indexOf('test-emitter'),
      sim.positionX(player) + 100,
      sim.positionY(player),
    );
    sim.world.flush();
    for (let tick = 0; tick < 10; tick++) sim.step(IDLE);
    expect(sim.clouds.count).toBe(1);
    const cloud = sim.clouds.oldest;
    expect(sim.clouds.radius[cloud]).toBe(30);
    expect(sim.clouds.lifetimeTicks[cloud]).toBe(40);
  });
});
