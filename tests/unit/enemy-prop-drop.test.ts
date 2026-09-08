import { describe, expect, it } from 'vitest';
import { World } from '../../src/sim/ecs/world.js';
import { EventKind } from '../../src/sim/events/queue.js';
import { GameSim } from '../../src/sim/game/sim.js';
import { propKindIndex } from '../../src/sim/game/prop-kinds.js';
import { createInputFrame } from '../../src/sim/input/frame.js';
import { EnemyRegistry } from '../../src/sim/enemy/registry.js';
import type { EnemyDefinition } from '../../src/sim/enemy/definition.js';
import { RoomGeometry } from '../../src/sim/room/geometry.js';

/**
 * `dropProp` (#277) — the terrain counterpart to `summon`, and Der Ladewagen's
 * whole fight: an arena that degrades while the player is standing in it.
 *
 * The failure modes worth a test are all the ones that make the room *unfair*
 * rather than the ones that make it empty: a cap that does not hold walls the
 * player in, a drop that lands on top of them shoves them with no warning, and
 * a stack of bales on one pixel is a single tile with quadruple health instead
 * of the arc the state is written to lay down.
 */

const BALE = propKindIndex('bale');

function emptySim(): GameSim {
  const sim = new GameSim({ room: new RoomGeometry(0, 0, 320, 180) });
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

function run(sim: GameSim, ticks: number): void {
  for (let tick = 0; tick < ticks; tick++) {
    sim.step(createInputFrame());
  }
}

describe('dropProp (#277)', () => {
  it('Der Ladewagen lays hay behind itself as it drives its circuit', () => {
    const sim = emptySim();
    sim.spawnEnemyKind(sim.enemies.indexOf('der-ladewagen'), 160, 90);
    sim.world.flush();
    run(sim, 700);
    expect(sim.countProps(BALE)).toBeGreaterThanOrEqual(4);
  });

  it('never stacks two bales on the same spot', () => {
    const sim = emptySim();
    sim.spawnEnemyKind(sim.enemies.indexOf('der-ladewagen'), 160, 90);
    sim.world.flush();
    run(sim, 1400);

    const bales: { x: number; y: number; r: number }[] = [];
    const propBit = sim.propKind.bit;
    for (let index = 0; index < sim.world.highWater; index++) {
      if (sim.world.states[index] !== World.ALIVE) continue;
      if (((sim.world.masks[index] ?? 0) & propBit) === 0) continue;
      if (((sim.world.masks[index] ?? 0) & sim.enemyMask) === sim.enemyMask) continue;
      if ((sim.propKind.data[index] ?? 0) !== BALE) continue;
      bales.push({
        x: sim.positionX(index),
        y: sim.positionY(index),
        r: sim.hurtbox.data[index * 2] ?? 0,
      });
    }
    expect(bales.length).toBeGreaterThan(1);
    for (let a = 0; a < bales.length; a++) {
      for (let b = a + 1; b < bales.length; b++) {
        const first = bales[a];
        const second = bales[b];
        if (first === undefined || second === undefined) continue;
        const gap = Math.hypot(first.x - second.x, first.y - second.y);
        expect(gap, `bales ${String(a)} and ${String(b)} overlap`).toBeGreaterThanOrEqual(
          first.r + second.r - 0.001,
        );
      }
    }
  });

  it('stops at maxActive rather than filling the room', () => {
    const sim = emptySim();
    sim.spawnEnemyKind(sim.enemies.indexOf('der-ladewagen'), 160, 90);
    sim.world.flush();
    // Long enough to have asked for far more drops than the cap allows.
    run(sim, 4000);
    expect(sim.countProps(BALE)).toBeLessThanOrEqual(10);
  });

  it('never drops a bale on top of the player', () => {
    const sim = emptySim();
    sim.spawnEnemyKind(sim.enemies.indexOf('der-ladewagen'), 160, 90);
    sim.world.flush();
    const player = sim.playerIndex;
    for (let tick = 0; tick < 1200; tick++) {
      sim.step(createInputFrame());
      // Pin the player onto the circuit itself, where every bale wants to land.
      sim.transform.data[player * 2] = 200;
      sim.transform.data[player * 2 + 1] = 90;
      sim.velocity.data[player * 2] = 0;
      sim.velocity.data[player * 2 + 1] = 0;
      expect(sim.propWithin(200, 90, 1)).toBe(false);
    }
  });

  it('is deterministic — the same run lays the same hay', () => {
    const layout = (): string => {
      const sim = emptySim();
      sim.spawnEnemyKind(sim.enemies.indexOf('der-ladewagen'), 160, 90);
      sim.world.flush();
      run(sim, 900);
      const spots: string[] = [];
      const propBit = sim.propKind.bit;
      for (let index = 0; index < sim.world.highWater; index++) {
        if (sim.world.states[index] !== World.ALIVE) continue;
        if (((sim.world.masks[index] ?? 0) & propBit) === 0) continue;
        if (((sim.world.masks[index] ?? 0) & sim.enemyMask) === sim.enemyMask) continue;
        if ((sim.propKind.data[index] ?? 0) !== BALE) continue;
        spots.push(`${sim.positionX(index).toFixed(3)},${sim.positionY(index).toFixed(3)}`);
      }
      return spots.join(' ');
    };
    expect(layout()).toBe(layout());
  });

  it('a dropped bale blocks a shot, the way an authored barrel does', () => {
    const sim = emptySim();
    sim.spawnEnemyKind(sim.enemies.indexOf('der-ladewagen'), 160, 90);
    sim.world.flush();
    run(sim, 700);
    // Nothing subtle to assert about the collision layer beyond what it is:
    // `spawnTarget` puts every prop on `Obstacle`, which both projectile teams'
    // masks already include (`sim/collision/layers.ts`), so a bale is cover for
    // the same reason a barrel is. What is worth pinning is that the bale
    // carries real health — a prop a shot passes straight through would be
    // scenery, and the whole fight is that it is not.
    const propBit = sim.propKind.bit;
    let checked = 0;
    for (let index = 0; index < sim.world.highWater; index++) {
      if (sim.world.states[index] !== World.ALIVE) continue;
      if (((sim.world.masks[index] ?? 0) & propBit) === 0) continue;
      if (((sim.world.masks[index] ?? 0) & sim.enemyMask) === sim.enemyMask) continue;
      if ((sim.propKind.data[index] ?? 0) !== BALE) continue;
      expect(sim.health.data[index * 2]).toBeGreaterThan(0);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('an unknown propKind throws at construction, not at spawn time', () => {
    const broken: EnemyDefinition = {
      id: 'broken-dropper',
      name: 'Broken',
      size: 'mid',
      health: 4,
      contactDamage: 0,
      initial: 'go',
      states: [
        {
          name: 'go',
          behaviours: [
            { behaviour: 'pause' },
            {
              behaviour: 'dropProp',
              propKind: 'not-a-prop',
              everyTicks: 10,
              maxActive: 2,
              health: 3,
            },
          ],
        },
      ],
    };
    expect(() => new EnemyRegistry([broken])).toThrow(/not-a-prop/);
  });

  it('rejects a drop with no cap, no cadence or no health', () => {
    const make = (drop: Record<string, unknown>): EnemyDefinition => ({
      id: 'dropper',
      name: 'Dropper',
      size: 'mid',
      health: 4,
      contactDamage: 0,
      initial: 'go',
      states: [
        {
          name: 'go',
          behaviours: [
            { behaviour: 'pause' },
            { behaviour: 'dropProp', propKind: 'bale', ...drop } as never,
          ],
        },
      ],
    });
    expect(() => new EnemyRegistry([make({ everyTicks: 0, maxActive: 2, health: 3 })])).toThrow(
      /everyTicks/,
    );
    expect(() => new EnemyRegistry([make({ everyTicks: 10, maxActive: 0, health: 3 })])).toThrow(
      /maxActive/,
    );
    expect(() => new EnemyRegistry([make({ everyTicks: 10, maxActive: 2, health: 0 })])).toThrow(
      /health/,
    );
  });

  it('raises one EnemyDropProp event per drop that comes due', () => {
    const sim = emptySim();
    sim.spawnEnemyKind(sim.enemies.indexOf('der-ladewagen'), 160, 90);
    sim.world.flush();
    let events = 0;
    for (let tick = 0; tick < 400; tick++) {
      sim.step(createInputFrame());
      sim.events.forEach((slot) => {
        if (sim.events.kind[slot] === EventKind.EnemyDropProp) {
          events += 1;
        }
      });
    }
    expect(events).toBeGreaterThan(0);
  });
});

describe('countProps / propWithin (#277)', () => {
  it('does not mistake an enemy body for a prop', () => {
    // Every enemy carries the `propKind` component, because `spawnEnemyKind`
    // builds on `spawnTarget` — and its kind is left at 0, which is `barrel`.
    // Counting bodies as barrels is the bug this exists to keep fixed.
    const sim = emptySim();
    sim.spawnEnemyKind(sim.enemies.indexOf('bauer'), 100, 90);
    sim.world.flush();
    expect(sim.countProps(propKindIndex('barrel'))).toBe(0);
    expect(sim.propWithin(100, 90, 12)).toBe(false);
  });

  it('counts a real prop', () => {
    const sim = emptySim();
    sim.spawnTarget(100, 90, 7, propKindIndex('barrel'), 5);
    sim.world.flush();
    expect(sim.countProps(propKindIndex('barrel'))).toBe(1);
    expect(sim.propWithin(100, 90, 2)).toBe(true);
    expect(sim.propWithin(200, 90, 2)).toBe(false);
  });
});
