import { describe, expect, it } from 'vitest';
import {
  DAZE_RADIUS,
  PULSE_PERIOD_TICKS,
  PULSE_TICKS,
} from '../../src/content/items/hendlgeruch.js';
import { ITEM_DEFINITIONS } from '../../src/content/items/index.js';
import { entityIndex } from '../../src/sim/ecs/entity.js';
import { GameSim, TARGET_RADIUS } from '../../src/sim/game/sim.js';
import { createInputFrame } from '../../src/sim/input/frame.js';
import { RoomGeometry } from '../../src/sim/room/geometry.js';
import { isDazed } from '../../src/sim/systems/status-effects.js';
import type { ItemDefinition } from '../../src/sim/item/definition.js';

/**
 * The Hendlgeruch's rework: a one-second pulse every five that draws enemies in to the daze
 * ring (never onto Alois), and a daze for anyone inside that ring.
 */

const IDLE = createInputFrame();

function world(): { sim: GameSim; px: number; py: number } {
  const sim = new GameSim({
    room: new RoomGeometry(0, 0, 320, 180),
    population: 'empty',
    items: ITEM_DEFINITIONS,
  });
  sim.pickUpItem('hendlgeruch');
  return { sim, px: sim.positionX(sim.playerIndex), py: sim.positionY(sim.playerIndex) };
}

function distance(sim: GameSim, index: number, px: number, py: number): number {
  return Math.hypot(sim.positionX(index) - px, sim.positionY(index) - py);
}

describe('Hendlgeruch', () => {
  it('pulses for the first second of every five, and only then pulls', () => {
    const { sim, px, py } = world();
    const far = entityIndex(sim.spawnTarget(px + 90, py, TARGET_RADIUS));
    sim.world.flush();
    sim.step(IDLE);
    const state = sim.itemState('hendlgeruch');
    expect(state.timer).toBeGreaterThan(0);

    for (let i = 0; i < PULSE_TICKS + 5; i++) {
      sim.step(IDLE);
    }
    expect(state.timer).toBe(0);
    const resting = distance(sim, far, px, py);
    for (let i = 0; i < 30; i++) {
      sim.step(IDLE);
    }
    // Between pulses nothing is drawn in (small drift from leftover momentum aside).
    expect(Math.abs(distance(sim, far, px, py) - resting)).toBeLessThan(3);

    while (state.charge % PULSE_PERIOD_TICKS !== 5) {
      sim.step(IDLE);
    }
    expect(state.timer).toBeGreaterThan(0);
  });

  it('draws a far enemy in during a pulse, but not into the player', () => {
    const { sim, px, py } = world();
    const far = entityIndex(sim.spawnTarget(px + 95, py, TARGET_RADIUS));
    sim.world.flush();
    sim.step(IDLE);
    const before = distance(sim, far, px, py);
    for (let i = 0; i < PULSE_TICKS; i++) {
      sim.step(IDLE);
    }
    const after = distance(sim, far, px, py);
    expect(after).toBeLessThan(before - 5);
    expect(after).toBeGreaterThan(DAZE_RADIUS * 0.5);
  });

  it('dazes an enemy inside the near ring, not one outside it', () => {
    const { sim, px, py } = world();
    const near = entityIndex(sim.spawnTarget(px + DAZE_RADIUS - 10, py, TARGET_RADIUS));
    const out = entityIndex(sim.spawnTarget(px + 95, py + 60, TARGET_RADIUS));
    sim.world.flush();
    sim.step(IDLE);
    sim.step(IDLE);
    expect(isDazed(sim, near)).toBe(true);
    expect(isDazed(sim, out)).toBe(false);
  });
});

describe('hat items', () => {
  const hatItem = (id: string, hat: string): ItemDefinition => ({
    id,
    name: id,
    description: 'a hat',
    sprite: 'test',
    hat,
    pools: ['treasure'],
    quality: 0,
    promilleRequirement: 'any',
  });

  it('wears the hat of the most recently picked-up hat item, whatever the id order', () => {
    const sim = new GameSim({
      room: new RoomGeometry(0, 0, 320, 180),
      population: 'empty',
      items: [hatItem('zzz', 'hat-z'), hatItem('aaa', 'hat-a')],
    });
    expect(sim.activeHat()).toBeUndefined();
    sim.pickUpItem('zzz');
    expect(sim.activeHat()).toBe('hat-z');
    sim.pickUpItem('aaa');
    expect(sim.activeHat()).toBe('hat-a');
    sim.removeItem('aaa');
    expect(sim.activeHat()).toBe('hat-z');
  });

  it('puts the Hendl on Alois when the Hendlgeruch is held', () => {
    const { sim } = world();
    expect(sim.activeHat()).toBe('hat-hendl');
  });
});
