import { describe, expect, it } from 'vitest';
import { entityIndex } from '../../src/sim/ecs/entity.js';
import { GameSim } from '../../src/sim/game/sim.js';
import { createInputFrame } from '../../src/sim/input/frame.js';
import { RoomGeometry } from '../../src/sim/room/geometry.js';
import { StatId } from '../../src/sim/stats/definition.js';
import { TICKS_PER_SECOND } from '../../src/sim/time.js';

/**
 * The Schimmelfleck's hold on the player (`GameSim.stepMould`): slowed to
 * half speed over ten seconds while any mould lives, a segment drained every
 * five seconds at that floor while a patch lives (never the last one), and
 * all of it handed back the moment the room's mould is gone.
 */

const IDLE = createInputFrame();

function emptySim(): GameSim {
  const sim = new GameSim({ room: new RoomGeometry(0, 0, 320, 180) });
  const doomed: number[] = [];
  sim.world.forEach(sim.collidableMask, (index) => {
    if (index !== sim.playerIndex) doomed.push(index);
  });
  for (const index of doomed) sim.world.destroy(sim.world.entityAt(index));
  sim.world.flush();
  return sim;
}

function place(sim: GameSim, id: string, x: number, y: number): number {
  const entity = sim.spawnEnemyKind(sim.enemies.indexOf(id), x, y);
  sim.world.flush();
  return entityIndex(entity);
}

function steps(sim: GameSim, ticks: number): void {
  for (let i = 0; i < ticks; i++) sim.step(IDLE);
}

function clearEnemies(sim: GameSim): void {
  const doomed: number[] = [];
  sim.world.forEach(sim.enemyMask, (index) => doomed.push(index));
  for (const index of doomed) sim.world.destroy(sim.world.entityAt(index));
  sim.world.flush();
}

const health = (sim: GameSim): number => sim.playerHealth;

describe('the Schimmelfleck slows, drains and gives it all back', () => {
  it('slows the player to half speed over ten seconds, then drains a segment every five', () => {
    const sim = emptySim();
    const base = sim.stats.value(StatId.MoveSpeed);
    const start = health(sim);
    place(sim, 'schimmelfleck', 300, 170);

    steps(sim, 5 * TICKS_PER_SECOND);
    expect(sim.stats.value(StatId.MoveSpeed)).toBeCloseTo(base * 0.75, 2);
    expect(sim.mouldPatchPresent).toBe(true);

    steps(sim, 5 * TICKS_PER_SECOND);
    expect(sim.stats.value(StatId.MoveSpeed)).toBeCloseTo(base * 0.5, 5);
    expect(health(sim)).toBe(start);

    steps(sim, 5 * TICKS_PER_SECOND);
    expect(health(sim)).toBe(start - 1);
    steps(sim, 5 * TICKS_PER_SECOND);
    expect(health(sim)).toBe(start - 2);
    expect(sim.mouldBorrowedHealthSegments).toBe(2);
  });

  it('stops draining with only spores left, keeps the slow, and restores everything once they die', () => {
    const sim = emptySim();
    const base = sim.stats.value(StatId.MoveSpeed);
    const start = health(sim);
    const patch = place(sim, 'schimmelfleck', 300, 170);
    steps(sim, 15 * TICKS_PER_SECOND);
    expect(health(sim)).toBe(start - 1);

    sim.world.destroy(sim.world.entityAt(patch));
    sim.world.flush();
    place(sim, 'schimmelspore', 310, 175);
    steps(sim, 6 * TICKS_PER_SECOND);
    expect(sim.mouldPatchPresent).toBe(false);
    expect(health(sim)).toBe(start - 1);
    expect(sim.stats.value(StatId.MoveSpeed)).toBeCloseTo(base * 0.5, 5);

    clearEnemies(sim);
    steps(sim, 1);
    expect(health(sim)).toBe(start);
    expect(sim.stats.value(StatId.MoveSpeed)).toBeCloseTo(base, 5);
    expect(sim.mouldBorrowedHealthSegments).toBe(0);
  });

  it('never drains the last segment', () => {
    const sim = emptySim();
    sim.health.data[sim.playerIndex * 2] = 1;
    place(sim, 'schimmelfleck', 300, 170);
    steps(sim, 30 * TICKS_PER_SECOND);
    expect(health(sim)).toBe(1);
  });
});
