import { describe, expect, it } from 'vitest';
import { entityIndex } from '../../src/sim/ecs/entity.js';
import { World } from '../../src/sim/ecs/world.js';
import type { EnemyDefinition } from '../../src/sim/enemy/definition.js';
import { EventKind } from '../../src/sim/events/queue.js';
import { GameSim, PLAYER_RADIUS, type GameSimOptions } from '../../src/sim/game/sim.js';
import {
  type InputFrame,
  InputAction,
  createInputFrame,
  quantiseAxis,
  setActionDown,
} from '../../src/sim/input/frame.js';
import { RoomGeometry } from '../../src/sim/room/geometry.js';
import {
  ENEMY_STRIDE,
  enemyTelegraphProgress,
  isEnemyInvulnerable,
} from '../../src/sim/systems/enemy.js';

const IDLE = createInputFrame();

function bareRoom(): RoomGeometry {
  return new RoomGeometry(0, 0, 320, 180);
}

/**
 * A room with the training targets cleared out.
 *
 * Every test here is about one authored body, and a playground with six
 * placeholders in it measures whichever one got in the way first.
 */
function emptySim(options: GameSimOptions = {}): GameSim {
  const sim = new GameSim({ room: bareRoom(), ...options });
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

/** Puts one authored enemy in the room and returns its storage slot. */
function place(sim: GameSim, id: string, x: number, y: number): number {
  const entity = sim.spawnEnemyKind(sim.enemies.indexOf(id), x, y);
  sim.world.flush();
  return entityIndex(entity);
}

function aiming(aimX: number, aimY: number): InputFrame {
  const frame = createInputFrame();
  frame.aimX = quantiseAxis(aimX);
  frame.aimY = quantiseAxis(aimY);
  setActionDown(frame, InputAction.Fire, true);
  return frame;
}

function health(sim: GameSim, index: number): number {
  return sim.health.data[index * 2] ?? 0;
}

function distance(sim: GameSim, a: number, b: number): number {
  return Math.hypot(sim.positionX(a) - sim.positionX(b), sim.positionY(a) - sim.positionY(b));
}

/** The name of the state a body is in, which is what content calls it. */
function stateName(sim: GameSim, index: number): string {
  const base = index * ENEMY_STRIDE;
  const compiled = sim.enemies.at(sim.enemy.data[base] ?? 0);
  return compiled.states[sim.enemy.data[base + 1] ?? 0]?.name ?? '';
}

/** Fires at an enemy to the player's right until a shot lands. */
function landShot(sim: GameSim): void {
  for (let tick = 0; tick < 120; tick++) {
    sim.step(aiming(1, 0));
    let landed = 0;
    sim.events.forEach((slot) => {
      if (sim.events.kind[slot] === EventKind.ProjectileHit) {
        landed += 1;
      }
    });
    if (landed > 0) {
      return;
    }
  }
  throw new Error('no shot landed');
}

function liveEnemies(sim: GameSim, id: string): number {
  const definition = sim.enemies.indexOf(id);
  let found = 0;
  for (let index = 0; index < sim.world.highWater; index++) {
    if (sim.world.states[index] !== World.ALIVE) {
      continue;
    }
    if (((sim.world.masks[index] ?? 0) & sim.enemyMask) !== sim.enemyMask) {
      continue;
    }
    if ((sim.enemy.data[index * ENEMY_STRIDE] ?? -1) === definition) {
      found += 1;
    }
  }
  return found;
}

function enemyProjectiles(sim: GameSim): number {
  let count = 0;
  sim.projectiles.forEachLive(() => {
    count += 1;
  });
  return count;
}

describe('authored behaviour', () => {
  it('walks a Kellerassel at the player', () => {
    const sim = emptySim();
    const player = sim.playerIndex;
    const enemy = place(sim, 'kellerassel', sim.positionX(player) + 70, sim.positionY(player));

    const before = distance(sim, player, enemy);
    for (let tick = 0; tick < 60; tick++) {
      sim.step(IDLE);
    }
    expect(distance(sim, player, enemy)).toBeLessThan(before - 20);
  });

  it('curls the Kellerassel when it is hit, and nothing gets through the shell', () => {
    const sim = emptySim();
    const enemy = place(
      sim,
      'kellerassel',
      sim.positionX(sim.playerIndex) + 40,
      sim.positionY(sim.playerIndex),
    );

    landShot(sim);
    // The hit is read on the tick after it lands — impact runs after the enemy
    // system — and the hitstop the hit asked for sits in between, during which
    // nothing decides anything. A handful of ticks covers both.
    for (let tick = 0; tick < 10 && stateName(sim, enemy) !== 'curl'; tick++) {
      sim.step(IDLE);
    }
    expect(stateName(sim, enemy)).toBe('curl');
    expect(isEnemyInvulnerable(sim, enemy)).toBe(true);

    const remaining = health(sim, enemy);
    for (let tick = 0; tick < 30; tick++) {
      sim.step(aiming(1, 0));
      if (isEnemyInvulnerable(sim, enemy)) {
        // Shots land on it and do nothing at all, which is the lesson.
        expect(health(sim, enemy)).toBe(remaining);
      }
    }
  });

  it('always opens the shell again, however much is fired into it', () => {
    const sim = emptySim();
    const enemy = place(
      sim,
      'kellerassel',
      sim.positionX(sim.playerIndex) + 40,
      sim.positionY(sim.playerIndex),
    );

    landShot(sim);
    let opened = false;
    for (let tick = 0; tick < 120; tick++) {
      sim.step(aiming(1, 0));
      if (!isEnemyInvulnerable(sim, enemy) && stateName(sim, enemy) === 'crawl') {
        opened = true;
        break;
      }
    }
    // Being shot while curled must not renew the window: the invulnerability is
    // counted from the tick the state began, and only `crawl` listens for hits.
    expect(opened).toBe(true);
  });

  it('warns before the Zapfhahn sprays, and the warning is readable the whole way', () => {
    const sim = emptySim();
    const player = sim.playerIndex;
    const enemy = place(sim, 'zapfhahn', sim.positionX(player) + 60, sim.positionY(player));

    let peak = 0;
    let firstShotTick = -1;
    for (let tick = 0; tick < 200 && firstShotTick < 0; tick++) {
      sim.step(IDLE);
      peak = Math.max(peak, enemyTelegraphProgress(sim, enemy));
      if (enemyProjectiles(sim) > 0) {
        firstShotTick = tick;
      }
    }

    expect(firstShotTick).toBeGreaterThan(0);
    // The ring reaches its full size, and it does so before anything is in the
    // air. A telegraph that finishes after the attack lands is worse than none.
    expect(peak).toBeGreaterThan(0.95);
    expect(stateName(sim, enemy)).not.toBe('idle');
  });

  it('stretches the wind-up along with the ring when telegraphs are lengthened', () => {
    const firstShot = (telegraphScale: number): number => {
      const sim = emptySim();
      sim.tuning.enemy.telegraphScale = telegraphScale;
      const player = sim.playerIndex;
      place(sim, 'zapfhahn', sim.positionX(player) + 60, sim.positionY(player));
      for (let tick = 0; tick < 400; tick++) {
        sim.step(IDLE);
        if (enemyProjectiles(sim) > 0) {
          return tick;
        }
      }
      throw new Error('the tap never fired');
    };

    // The accessibility direction: more warning, and the attack waits for it.
    expect(firstShot(2)).toBeGreaterThan(firstShot(1));
  });

  it('leaves spores where a Schimmelfleck died, and they stay dead', () => {
    const sim = emptySim();
    const player = sim.playerIndex;
    place(sim, 'schimmelfleck', sim.positionX(player) + 40, sim.positionY(player));
    expect(liveEnemies(sim, 'schimmelspore')).toBe(0);

    for (let tick = 0; tick < 400 && liveEnemies(sim, 'schimmelfleck') > 0; tick++) {
      sim.step(aiming(1, 0));
    }
    expect(liveEnemies(sim, 'schimmelfleck')).toBe(0);
    // Declared on the state it died in, which is the machinery a boss phase
    // needs — and the count is the count the content asked for.
    expect(liveEnemies(sim, 'schimmelspore')).toBe(2);

    for (let tick = 0; tick < 600 && liveEnemies(sim, 'schimmelspore') > 0; tick++) {
      sim.step(aiming(1, 0));
    }
    // Nothing put them there, so nothing brings them back.
    for (let tick = 0; tick < 200; tick++) {
      sim.step(IDLE);
    }
    expect(liveEnemies(sim, 'schimmelspore')).toBe(0);
  });

  it('runs the same way twice from the same seed', () => {
    const trace = (seed: number): string => {
      const sim = new GameSim({ seed, population: 'enemies' });
      const parts: string[] = [];
      for (let tick = 0; tick < 400; tick++) {
        sim.step(IDLE);
      }
      for (let index = 0; index < sim.world.highWater; index++) {
        if (((sim.world.masks[index] ?? 0) & sim.enemyMask) !== sim.enemyMask) {
          continue;
        }
        parts.push(sim.positionX(index).toFixed(4), sim.positionY(index).toFixed(4));
      }
      return parts.join(',');
    };

    expect(trace(7)).toBe(trace(7));
    // And the wandering ones are actually drawing from the seed rather than
    // running the same path whatever it is.
    expect(trace(7)).not.toBe(trace(8));
  });

  it('scales the whole roster with one speed number', () => {
    const travelled = (speedScale: number): number => {
      const sim = emptySim();
      sim.tuning.enemy.speedScale = speedScale;
      const player = sim.playerIndex;
      const enemy = place(sim, 'kellerassel', sim.positionX(player) + 80, sim.positionY(player));
      const before = sim.positionX(enemy);
      for (let tick = 0; tick < 60; tick++) {
        sim.step(IDLE);
      }
      return before - sim.positionX(enemy);
    };

    expect(travelled(2)).toBeGreaterThan(travelled(1) * 1.5);
  });
});

/**
 * Primitives the shipped roster does not use yet.
 *
 * Written as content in the test rather than added to the game, which is the
 * claim #14 is making: an enemy is data, and data can come from anywhere.
 */
describe('primitives, authored as data', () => {
  const charger: EnemyDefinition = {
    id: 'stier',
    name: 'Stier',
    size: 'mid',
    health: 6,
    contactDamage: 2,
    initial: 'wind',
    states: [
      {
        name: 'wind',
        behaviours: [{ behaviour: 'pause' }, { behaviour: 'telegraph', ticks: 12 }],
        transitions: [{ to: 'charge', after: 12 }],
      },
      {
        name: 'charge',
        behaviours: [{ behaviour: 'chargeAtPlayer', speed: 3 }],
        transitions: [{ to: 'winded', onBlocked: true }],
      },
      { name: 'winded', behaviours: [{ behaviour: 'pause' }] },
    ],
  };

  /** A room with a pillar between the two of them, for the charge to hit. */
  function walledRoom(): RoomGeometry {
    const room = new RoomGeometry(0, 0, 320, 180);
    room.addBlock(120, 60, 140, 120);
    return room;
  }

  it('ends a charge against a wall rather than grinding along it', () => {
    const sim = emptySim({ room: walledRoom(), enemies: [charger] });
    const player = sim.playerIndex;
    // The player on one side of the pillar, the bull on the other.
    const transform = sim.transform.data;
    transform[player * 4] = 60;
    transform[player * 4 + 1] = 90;
    transform[player * 4 + 2] = 60;
    transform[player * 4 + 3] = 90;
    const enemy = place(sim, 'stier', 220, 90);

    let charged = false;
    for (let tick = 0; tick < 200; tick++) {
      sim.step(IDLE);
      if (stateName(sim, enemy) === 'charge') {
        charged = true;
      }
      if (stateName(sim, enemy) === 'winded') {
        break;
      }
    }
    expect(charged).toBe(true);
    expect(stateName(sim, enemy)).toBe('winded');
  });

  it('locks a charge on the direction it started in', () => {
    const sim = emptySim({ enemies: [charger] });
    const player = sim.playerIndex;
    const enemy = place(sim, 'stier', sim.positionX(player) + 90, sim.positionY(player));

    while (stateName(sim, enemy) !== 'charge') {
      sim.step(IDLE);
    }
    sim.step(IDLE);
    const headingX = sim.velocity.data[enemy * 2] ?? 0;
    const headingY = sim.velocity.data[enemy * 2 + 1] ?? 0;

    // The player leaves. A charge that follows is a charge that cannot be
    // dodged, which makes the telegraph in front of it a lie.
    const transform = sim.transform.data;
    transform[player * 4 + 1] = 30;
    transform[player * 4 + 3] = 30;
    sim.step(IDLE);

    expect(sim.velocity.data[enemy * 2]).toBeCloseTo(headingX, 5);
    expect(sim.velocity.data[enemy * 2 + 1]).toBeCloseTo(headingY, 5);
  });
});

describe('enemies against the player', () => {
  it('never ends a tick inside the player', () => {
    const sim = new GameSim({ seed: 1, population: 'enemies' });
    const player = sim.playerIndex;
    const playerRadius = sim.body.data[player * 2] ?? 0;

    let worst = 0;
    for (let tick = 0; tick < 1200; tick++) {
      // Circling, which is what a player does, and what used to drag a light
      // body a fifth of the way inside them.
      const angle = (tick / 60) * Math.PI * 2;
      const frame = createInputFrame();
      frame.moveX = quantiseAxis(Math.cos(angle));
      frame.moveY = quantiseAxis(Math.sin(angle));
      sim.step(frame);
      // Death (#15) is a real state now: the run stops, main.ts stops calling
      // step, and the game moves to the death sequence. Simulating hundreds of
      // ticks past that point is not a scenario the real game produces, and
      // separation is not tuned to hold indefinitely once nothing is left
      // clearing the pile of enemies that gathers on a body nobody is steering
      // out of the way anymore.
      if (sim.playerDead) {
        break;
      }

      for (let index = 0; index < sim.world.highWater; index++) {
        if (sim.world.states[index] !== World.ALIVE) {
          continue;
        }
        if (((sim.world.masks[index] ?? 0) & sim.enemyMask) !== sim.enemyMask) {
          continue;
        }
        const reach = playerRadius + (sim.body.data[index * 2] ?? 0);
        worst = Math.max(worst, reach - distance(sim, player, index));
      }
    }
    // Touching is fine. A body that settles inside the player is not, and it is
    // what a separation applied to one of the pair and deferred on the other
    // produces the moment the other one walks.
    expect(worst).toBeLessThan(0.5);
  });

  it('never removes the player from the world, whatever kills them', () => {
    const sim = new GameSim({ seed: 1, population: 'enemies' });
    const player = sim.playerIndex;

    for (let tick = 0; tick < 2000; tick++) {
      sim.step(IDLE);
    }
    // Their health can reach zero and the run can end (#15), but their entity
    // slot has to survive it. A freed slot is handed to the next body that
    // spawns, and the camera follows whatever lands in it.
    expect(sim.playerIndex).toBe(player);
    expect(sim.body.data[player * 2]).toBe(PLAYER_RADIUS);
    expect(health(sim, player)).toBeGreaterThanOrEqual(0);
    expect(sim.world.states[player]).toBe(World.ALIVE);
  });
});
