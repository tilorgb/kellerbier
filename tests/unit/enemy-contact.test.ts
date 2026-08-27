import { describe, expect, it } from 'vitest';
import { entityIndex } from '../../src/sim/ecs/entity.js';
import { GameSim } from '../../src/sim/game/sim.js';
import { createInputFrame } from '../../src/sim/input/frame.js';
import { RoomGeometry } from '../../src/sim/room/geometry.js';

const IDLE = createInputFrame();

function bareRoom(): RoomGeometry {
  return new RoomGeometry(0, 0, 320, 180);
}

/**
 * A room with the training targets cleared out, same reasoning as
 * `tests/unit/enemy.test.ts`'s own `emptySim` — this is about two specific
 * bodies, and six placeholders in the way would confuse which one collided.
 */
function emptySim(): GameSim {
  const sim = new GameSim({ room: bareRoom() });
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

/** An authored enemy, real AI and all — `spawnEnemy`'s training targets carry no `enemyMask` component, so this system never sees them. */
function place(sim: GameSim, id: string, x: number, y: number): number {
  const entity = sim.spawnEnemyKind(sim.enemies.indexOf(id), x, y);
  sim.world.flush();
  return entityIndex(entity);
}

function gapBetween(sim: GameSim, a: number, b: number): number {
  return Math.hypot(sim.positionX(a) - sim.positionX(b), sim.positionY(a) - sim.positionY(b));
}

function reachBetween(sim: GameSim, a: number, b: number): number {
  return (sim.body.data[a * 2] ?? 0) + (sim.body.data[b * 2] ?? 0);
}

describe('enemies against each other (#big-rooms follow-up)', () => {
  it('pushes two enemies spawned on top of each other apart', () => {
    const sim = emptySim();
    // Far from the player, so its own contact pass never intervenes.
    const a = place(sim, 'kellerassel', 40, 40);
    const b = place(sim, 'kellerassel', 40, 40);

    for (let tick = 0; tick < 20; tick++) {
      sim.step(IDLE);
    }

    // A little slack for the tick the separation is applied on, same as
    // `contact.test.ts`'s own player-vs-enemy assertion.
    expect(gapBetween(sim, a, b)).toBeGreaterThan(reachBetween(sim, a, b) - 0.5);
  });

  it('resolves a pair straddling a grid cell boundary, not just a pair sharing one cell', () => {
    // The default grid cell is 32px; these two sit 4px apart but on opposite
    // sides of the column-0/column-1 boundary, so they land in different
    // cells — this is the cross-cell "forward neighbour" sweep, not the
    // same-cell loop every other test in this file happens to exercise.
    const sim = emptySim();
    const a = place(sim, 'kellerassel', 30, 40);
    const b = place(sim, 'kellerassel', 34, 40);

    for (let tick = 0; tick < 20; tick++) {
      sim.step(IDLE);
    }

    expect(gapBetween(sim, a, b)).toBeGreaterThan(reachBetween(sim, a, b) - 0.5);
  });

  it('keeps three enemies split from the same point apart from each other', () => {
    // The exact shape of the reported bug: a boss splitting into several
    // bodies at once (`splitFromEvent`, `systems/enemy.ts`), all landing
    // near the same point.
    const sim = emptySim();
    const a = place(sim, 'kellerassel-segment', 40, 40);
    const b = place(sim, 'kellerassel-segment', 42, 41);
    const c = place(sim, 'kellerassel-segment', 41, 39);

    for (let tick = 0; tick < 20; tick++) {
      sim.step(IDLE);
    }

    const pairs: readonly (readonly [number, number])[] = [
      [a, b],
      [b, c],
      [a, c],
    ];
    for (const [x, y] of pairs) {
      expect(gapBetween(sim, x, y)).toBeGreaterThan(reachBetween(sim, x, y) - 0.5);
    }
  });

  it('shares the separation by mass, same as the player already does', () => {
    // `grosse-kellerassel` (size `mid`) is twice the mass of `kellerassel`
    // (size `normal`) — the lighter body should give up more ground.
    const sim = emptySim();
    const light = place(sim, 'kellerassel', 40, 40);
    const heavy = place(sim, 'grosse-kellerassel', 40, 40);
    const lightStartX = sim.positionX(light);
    const heavyStartX = sim.positionX(heavy);

    // One tick only, so the correction is read in isolation from whatever
    // either body's own `walkTowardPlayer` contributes afterwards.
    sim.step(IDLE);

    const lightMoved = Math.abs(sim.positionX(light) - lightStartX);
    const heavyMoved = Math.abs(sim.positionX(heavy) - heavyStartX);
    expect(lightMoved).toBeGreaterThan(heavyMoved);
  });

  it('leaves the player and their own contact pass untouched', () => {
    // A regression guard on the new system's own dedup/layer filter: it must
    // never also resolve a player-vs-enemy pair, which `stepContacts`
    // already owns.
    const sim = emptySim();
    const player = sim.playerIndex;
    const playerX = sim.positionX(player);
    const playerY = sim.positionY(player);
    place(sim, 'kellerassel', playerX + 200, playerY + 200);

    for (let tick = 0; tick < 10; tick++) {
      sim.step(IDLE);
    }
    expect(sim.positionX(player)).toBeCloseTo(playerX, 3);
    expect(sim.positionY(player)).toBeCloseTo(playerY, 3);
  });
});
