import { describe, expect, it } from 'vitest';
import { GameSim } from '../../src/sim/game/sim.js';
import { createInputFrame } from '../../src/sim/input/frame.js';
import { RoomGeometry } from '../../src/sim/room/geometry.js';
import {
  blaskapellePosaune,
  blaskapelleTrompete,
  blaskapelleTuba,
} from '../../src/content/enemies/index.js';

/**
 * `fireOnBeat`'s `beatOffset` (#277) — what makes Die Blaskapelle a lattice
 * rather than three sprays arriving at once.
 *
 * The property that matters is not "each one fires": it is that the three
 * fire on *different ticks of the same bar*, and keep doing so no matter when
 * each body entered the room. `fireOnBeat` is timed off `sim.tick` precisely
 * so that a body's own state clock cannot drift the beat, and this is the
 * check that the offset rides the same clock rather than the state's.
 */

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

/** Ticks (mod the bar) on which a lone body of `id` put anything in the air. */
function beatsOf(id: string, spawnAfter = 0): Set<number> {
  const sim = emptySim();
  const beats = new Set<number>();
  let spawned = false;
  let previous = 0;
  for (let tick = 0; tick < 400; tick++) {
    if (!spawned && tick >= spawnAfter) {
      sim.spawnEnemyKind(sim.enemies.indexOf(id), 60, 90);
      sim.world.flush();
      spawned = true;
    }
    sim.step(createInputFrame());
    const live = sim.projectiles.liveCount;
    if (spawned && live > previous && tick > spawnAfter + 2) {
      // `sim.tick` has already been advanced by the `step` that fired, so the
      // beat the shot left on is the tick before the one now showing.
      beats.add((sim.tick - 1 + 30) % 30);
    }
    previous = live;
  }
  return beats;
}

describe('fireOnBeat beatOffset (#277)', () => {
  it('the band is authored on three different beats of one 30-tick bar', () => {
    expect(blaskapelleTuba.states[0]?.behaviours[1]).toMatchObject({ beatOffset: 0 });
    expect(blaskapelleTrompete.states[0]?.behaviours[1]).toMatchObject({ beatOffset: 10 });
    expect(blaskapellePosaune.states[0]?.behaviours[1]).toMatchObject({ beatOffset: 20 });
  });

  it('each member rings on its own beat, and only its own', () => {
    expect([...beatsOf('die-blaskapelle-tuba')]).toEqual([0]);
    expect([...beatsOf('die-blaskapelle-trompete')]).toEqual([10]);
    expect([...beatsOf('die-blaskapelle-posaune')]).toEqual([20]);
  });

  it('the beat is the room clock, not the body clock — a late arrival still lands on it', () => {
    // The whole reason the offset lives on `sim.tick`: three separate bodies
    // with three separate state timers have to stay in formation regardless of
    // the order they spawned in.
    expect([...beatsOf('die-blaskapelle-trompete', 7)]).toEqual([10]);
    expect([...beatsOf('die-blaskapelle-posaune', 13)]).toEqual([20]);
  });
});
