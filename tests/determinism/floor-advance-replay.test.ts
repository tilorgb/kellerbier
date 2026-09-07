import { describe, expect, it } from 'vitest';
import { GameSim } from '../../src/sim/game/sim.js';
import { createInputFrame } from '../../src/sim/input/frame.js';
import { buildFloorPlan } from '../playtest/lib/floor-runtime.js';

/**
 * #271's acceptance criterion: a replay of a seed + input log crossing a
 * floor advance reproduces the same XL-ness and the same layout. `advanceFloor`
 * (`app/main.ts`) generates the next floor from `sim.random.floor` — the same
 * stream `GameSim` itself draws from over the course of play (see
 * `sim/game/sim.ts`'s maypole-choice roll) — so the whole point of #271's own
 * "roll from `rng`, never `Math.random()`" rule is that two identically-seeded
 * runs, stepped through the same ticks, land at the same stream position and
 * therefore generate the identical next floor, XL roll included.
 */
describe('crossing a floor advance replays deterministically (#271)', () => {
  it('generates the same floor 2 (layout and extraLarge) after the same stretch of floor 1 play', () => {
    const SEED = 0x1337_c0de;

    function floor2PlanAfterPlayingFloor1() {
      const sim = new GameSim({ seed: SEED });
      for (let tick = 0; tick < 300; tick++) {
        sim.step(createInputFrame());
      }
      return buildFloorPlan(sim.random.floor, 2);
    }

    const planA = floor2PlanAfterPlayingFloor1();
    const planB = floor2PlanAfterPlayingFloor1();

    expect(planB).toEqual(planA);
  });

  it('generates a different floor 2 for a different seed', () => {
    function floor2Plan(seed: number) {
      const sim = new GameSim({ seed });
      for (let tick = 0; tick < 300; tick++) {
        sim.step(createInputFrame());
      }
      return buildFloorPlan(sim.random.floor, 2);
    }

    expect(floor2Plan(1)).not.toEqual(floor2Plan(2));
  });

  it('reproduces the Meisterschlüssel gate decision across a floor advance (#275)', () => {
    // The gate is `FloorPlan.minibossRoomIds.length > 0`, re-derived at every
    // floor entry from a deterministic plan with no RNG drawn — so two
    // identically-seeded runs, stepped the same, reach the same decision.
    function gateAfterAdvance(seed: number): boolean {
      const sim = new GameSim({ seed });
      for (let tick = 0; tick < 300; tick++) {
        sim.step(createInputFrame());
      }
      const next = buildFloorPlan(sim.random.floor, 2);
      // Mirror `app/main.ts`'s `advanceFloor` / the playtest harness.
      sim.clearFloorProgress();
      sim.configureFloorGate(next.minibossRoomIds.length > 0);
      return sim.bossDoorLocked;
    }

    expect(gateAfterAdvance(0x1337_c0de)).toBe(gateAfterAdvance(0x1337_c0de));
  });

  it('clearFloorProgress wipes a held key, so a replayed floor advance starts keyless (#275)', () => {
    const sim = new GameSim({ seed: 0x1337_c0de });
    sim.configureFloorGate(true);
    sim.grantMeisterschluessel();
    expect(sim.meisterschluessel).toBe(true);

    sim.clearFloorProgress();
    expect(sim.meisterschluessel).toBe(false);
  });
});
