import { describe, expect, it } from 'vitest';
import { bauernMistgabel, schnupftabak } from '../../src/content/items/index.js';
import { GameSim } from '../../src/sim/game/sim.js';
import type { ItemDefinition } from '../../src/sim/item/definition.js';
import { PROJECTILE_TINT_INDEX } from '../../src/sim/projectile/tints.js';
import { RoomGeometry } from '../../src/sim/room/geometry.js';
import {
  type InputFrame,
  InputAction,
  createInputFrame,
  quantiseAxis,
  setActionDown,
} from '../../src/sim/input/frame.js';

/**
 * Schnupftabak (#396), against the real definition: the cycle is driven by
 * the trigger, a lost build-up starts over, the sneeze is a cone per shot of
 * the squeeze, and the same seed and inputs sneeze on the same ticks.
 */

const IDLE = createInputFrame();
const FIRE = firing();
const WAIT = 0;
const RAMP = 1;
const ARMED = 3;

function firing(): InputFrame {
  const frame = createInputFrame();
  frame.aimX = quantiseAxis(1);
  frame.aimY = quantiseAxis(0);
  setActionDown(frame, InputAction.Fire, true);
  return frame;
}

/** A short cycle with a fixed wait, and an inhale longer than a shot lives so the room is empty of shots when the sneeze goes. */
function simWith(...items: ItemDefinition[]): GameSim {
  const sim = new GameSim({
    room: new RoomGeometry(0, 0, 640, 360),
    items,
    population: 'empty',
  });
  for (const item of items) {
    sim.pickUpItem(item.id);
  }
  const tuning = sim.tuning.sneeze;
  tuning.waitMinTicks = 30;
  tuning.waitMaxTicks = 30;
  tuning.rampTicks = 40;
  tuning.inhaleTicks = 50;
  return sim;
}

/** Holds fire until a sneeze goes out; returns how many shots that one tick added. */
function fireUntilSneeze(sim: GameSim, limit = 600): number {
  const state = sim.itemState('schnupftabak');
  for (let step = 0; step < limit; step++) {
    const armed = state.charge === ARMED;
    const before = sim.projectiles.liveCount;
    sim.step(FIRE);
    if (armed && sim.lastShotTick === sim.tick - 1) {
      return sim.projectiles.liveCount - before;
    }
  }
  throw new Error('no sneeze within the limit');
}

describe('Schnupftabak', () => {
  it('sneezes a seven-shot cone after a build-up, and goes back to waiting', () => {
    const sim = simWith(schnupftabak);
    expect(fireUntilSneeze(sim)).toBe(7);
    expect(sim.itemState('schnupftabak').charge).toBe(WAIT);
    expect(sim.sneezeBuildUp).toBe(0);
  });

  it('adds three shots to the cone for every extra copy', () => {
    const sim = simWith(schnupftabak);
    sim.pickUpItem('schnupftabak');
    expect(fireUntilSneeze(sim)).toBe(10);
  });

  it('paints the volley snuff-brown, in more than one size', () => {
    const sim = simWith(schnupftabak);
    fireUntilSneeze(sim);
    const projectiles = sim.projectiles;
    const radii = new Set<number>();
    projectiles.forEachLive((slot) => {
      expect(projectiles.tint[slot]).toBe(PROJECTILE_TINT_INDEX.schnupf);
      radii.add(projectiles.radius[slot] ?? 0);
    });
    expect(radii.size).toBeGreaterThan(1);
  });

  it('does not advance at all while the trigger is not held', () => {
    const sim = simWith(schnupftabak);
    const state = sim.itemState('schnupftabak');
    sim.step(IDLE);
    const rolled = state.timer;
    for (let step = 0; step < 500; step++) {
      sim.step(IDLE);
    }
    expect(state.charge).toBe(WAIT);
    expect(state.timer).toBe(rolled);
  });

  it('slows the Schlauch during the ramp and stops it for the inhale', () => {
    const sim = simWith(schnupftabak);
    // Long enough for several slowed shots to land inside the ramp.
    sim.tuning.sneeze.rampTicks = 160;
    const state = sim.itemState('schnupftabak');
    const gaps: number[] = [];
    let last = -1;
    for (let step = 0; step < 600 && state.charge !== ARMED; step++) {
      sim.step(FIRE);
      if (sim.lastShotTick === sim.tick - 1) {
        if (last >= 0) {
          gaps.push(sim.lastShotTick - last);
        }
        last = sim.lastShotTick;
      }
    }
    const base = sim.tuning.shooting.fireDelayTicks;
    expect(gaps[0]).toBe(base);
    // The very next shot after the build-up begins is already late.
    expect(gaps[1]).toBeGreaterThan(base);
    expect(Math.max(...gaps)).toBeGreaterThan(gaps[1] ?? 0);
    // Nothing leaves the Schlauch for the whole inhale.
    expect(sim.tick - 1 - last).toBeGreaterThanOrEqual(sim.tuning.sneeze.inhaleTicks);
  });

  it('fires at exactly the old rate again after the sneeze', () => {
    const sim = simWith(schnupftabak);
    fireUntilSneeze(sim);
    const sneezeTick = sim.lastShotTick;
    while (sim.lastShotTick === sneezeTick) {
      sim.step(FIRE);
    }
    expect(sim.lastShotTick - sneezeTick).toBe(sim.tuning.shooting.fireDelayTicks);
  });

  it('loses the build-up when fire is released past the grace window, and keeps it through a shorter release', () => {
    const sim = simWith(schnupftabak);
    const state = sim.itemState('schnupftabak');
    while (state.charge !== RAMP) {
      sim.step(FIRE);
    }
    for (let step = 0; step < sim.tuning.sneeze.graceTicks - 2; step++) {
      sim.step(IDLE);
    }
    sim.step(FIRE);
    expect(state.charge).toBe(RAMP);

    for (let step = 0; step < sim.tuning.sneeze.graceTicks + 2; step++) {
      sim.step(IDLE);
    }
    expect(state.charge).toBe(WAIT);
    expect(state.timer).toBeGreaterThan(0);
    expect(sim.sneezeBuildUp).toBe(0);
  });

  it('turns every shot of the squeeze into its own cone — three with the Bauern-Mistgabel', () => {
    const sim = simWith(bauernMistgabel, schnupftabak);
    expect(fireUntilSneeze(sim)).toBe(21);
  });

  it('sneezes on the same ticks, into the same shots, for the same seed and inputs', () => {
    const trace = (): number[] => {
      const sim = simWith(schnupftabak);
      sim.tuning.sneeze.waitMinTicks = 20;
      sim.tuning.sneeze.waitMaxTicks = 90;
      const out: number[] = [];
      for (let sneeze = 0; sneeze < 3; sneeze++) {
        fireUntilSneeze(sim);
        out.push(sim.tick);
        sim.projectiles.forEachLive((slot) => {
          out.push(sim.projectiles.radius[slot] ?? 0, sim.projectiles.velocityX[slot] ?? 0);
        });
      }
      return out;
    };
    expect(trace()).toEqual(trace());
  });

  it('clears the blink when the item is lost mid build-up', () => {
    const sim = simWith(schnupftabak);
    const state = sim.itemState('schnupftabak');
    while (state.charge !== RAMP) {
      sim.step(FIRE);
    }
    sim.step(FIRE);
    expect(sim.sneezeBuildUp).toBeGreaterThan(0);
    sim.removeItem('schnupftabak');
    expect(sim.sneezeBuildUp).toBe(0);
  });
});
