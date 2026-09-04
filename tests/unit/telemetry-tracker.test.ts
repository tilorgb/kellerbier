import { describe, expect, it } from 'vitest';
import cellarCrossroads from '../../src/content/rooms/cellar.json';
import { GameSim } from '../../src/sim/game/sim.js';
import { createInputFrame } from '../../src/sim/input/frame.js';
import { TelemetryTracker } from '../../src/app/telemetry/tracker.js';

function roomSim(): GameSim {
  return new GameSim({ roomTemplate: cellarCrossroads, floor: 1, population: 'empty' });
}

const idle = () => createInputFrame();

describe('TelemetryTracker (#54, #159)', () => {
  it('records a room clear as the tick count from room entry to the clear edge', () => {
    const sim = roomSim();
    const tracker = new TelemetryTracker();

    for (let tick = 0; tick < 10; tick++) {
      sim.step(idle());
      tracker.recordTick(sim, 1, 'start', 'normal', false);
    }
    // `sim.tick` is now 10 — record the clearing tick as an edge.
    tracker.recordTick(sim, 1, 'start', 'normal', true);

    const record = tracker.finish(sim, {
      seed: sim.seed,
      character: 'alois',
      outcome: 'won',
      floor: 1,
      roomRole: 'normal',
      ticksSurvived: sim.tick,
    });
    // Room entry is set on the first `recordTick` call after the room
    // changes, which already happens one tick into the room (the tracker has
    // no way to see tick 0 before its own first call) — 9, not 10, is the
    // correct edge-to-edge count for this test's own call pattern.
    expect(record.roomClears).toEqual([{ floor: 1, role: 'normal', ticks: 9 }]);
  });

  it('resets the room-entry tick when the room id changes', () => {
    const sim = roomSim();
    const tracker = new TelemetryTracker();

    for (let tick = 0; tick < 5; tick++) {
      sim.step(idle());
      tracker.recordTick(sim, 1, 'start', 'normal', false);
    }
    for (let tick = 0; tick < 3; tick++) {
      sim.step(idle());
      tracker.recordTick(sim, 1, 'next', 'boss', false);
    }
    tracker.recordTick(sim, 1, 'next', 'boss', true);

    const record = tracker.finish(sim, {
      seed: sim.seed,
      character: 'alois',
      outcome: 'won',
      floor: 1,
      roomRole: 'boss',
      ticksSurvived: sim.tick,
    });
    // Ticks since entering "next", not since the run started.
    expect(record.roomClears).toEqual([{ floor: 1, role: 'boss', ticks: 2 }]);
  });

  it('records every distinct item picked up during the run, once each', () => {
    const sim = roomSim();
    const tracker = new TelemetryTracker();

    sim.step(idle());
    tracker.recordTick(sim, 1, 'start', 'normal', false);
    sim.pickUpItem('zwoa-drei-gsuffa');
    sim.step(idle());
    tracker.recordTick(sim, 1, 'start', 'normal', false);
    sim.step(idle());
    tracker.recordTick(sim, 1, 'start', 'normal', false);

    const record = tracker.finish(sim, {
      seed: sim.seed,
      character: 'alois',
      outcome: 'won',
      floor: 1,
      roomRole: 'normal',
      ticksSurvived: sim.tick,
    });
    expect(record.itemsHeld).toEqual(['zwoa-drei-gsuffa']);
  });

  it('accumulates ticks spent at each Promille tier', () => {
    const sim = roomSim();
    const tracker = new TelemetryTracker();

    for (let tick = 0; tick < 7; tick++) {
      sim.step(idle());
      tracker.recordTick(sim, 1, 'start', 'normal', false);
    }
    const record = tracker.finish(sim, {
      seed: sim.seed,
      character: 'alois',
      outcome: 'won',
      floor: 1,
      roomRole: 'normal',
      ticksSurvived: sim.tick,
    });
    const totalTicks = Object.values(record.promilleTierTicks).reduce((a, b) => a + b, 0);
    expect(totalTicks).toBe(7);
    // A fresh run starts at tier 0 (Nüchtern) and nothing here raises Promille.
    expect(record.promilleTierTicks['0']).toBe(7);
  });

  it('records a death cause with the flavour word and every enemy still alive in the room', () => {
    const sim = roomSim();
    const tracker = new TelemetryTracker();
    const enemies: number[] = [];
    sim.world.forEach(sim.enemyMask, (index) => enemies.push(index));
    expect(enemies.length).toBeGreaterThan(0);

    sim.step(idle());
    tracker.recordTick(sim, 1, 'start', 'normal', false);
    sim.applyPlayerDamage(sim.playerHealth + sim.playerSoulHealth + sim.playerEternalHealth + 100);
    expect(sim.playerDead).toBe(true);

    const record = tracker.finish(sim, {
      seed: sim.seed,
      character: 'alois',
      outcome: 'died',
      floor: 1,
      roomRole: 'normal',
      ticksSurvived: sim.playerDeathTick,
    });
    expect(record.outcome).toBe('died');
    expect(record.deathCause?.word).toBe(sim.deathWord);
    expect(record.deathCause?.enemiesPresent.length).toBeGreaterThan(0);
  });

  it('records no death cause for a won run', () => {
    const sim = roomSim();
    const tracker = new TelemetryTracker();
    sim.step(idle());
    tracker.recordTick(sim, 1, 'start', 'normal', false);

    const record = tracker.finish(sim, {
      seed: sim.seed,
      character: 'alois',
      outcome: 'won',
      floor: 1,
      roomRole: 'normal',
      ticksSurvived: sim.tick,
    });
    expect(record.deathCause).toBeNull();
  });
});
