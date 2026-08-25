import { describe, expect, it } from 'vitest';
import { GameSim } from '../../src/sim/game/sim.js';
import { RoomGeometry } from '../../src/sim/room/geometry.js';
import { StatId } from '../../src/sim/stats/definition.js';
import { createInputFrame } from '../../src/sim/input/frame.js';

function bareRoom(): RoomGeometry {
  return new RoomGeometry(0, 0, 320, 180);
}

/**
 * `GameSim.stats` wired to Promille (#25): the tier-swap in
 * `syncPromilleModifiers` is the pipeline's only live source today, so it's
 * the thing to prove the wiring against.
 */
describe('GameSim stat pipeline', () => {
  it('resolves to the base value with Promille sober', () => {
    const sim = new GameSim({ room: bareRoom() });
    expect(sim.stats.value(StatId.Stammwuerze)).toBe(sim.tuning.shooting.shotDamage);
    expect(sim.stats.value(StatId.Schluckfrequenz)).toBe(sim.tuning.shooting.fireDelayTicks);
  });

  it('traces Promille as a named source once a tier is active', () => {
    const sim = new GameSim({ room: bareRoom() });
    sim.tuning.promille.current = 3.5; // Vollrausch
    sim.step(createInputFrame());

    const trace = sim.stats.trace(StatId.Stammwuerze);
    const multiplyStep = trace.steps.find((step) => step.stage === 'multiply');
    expect(multiplyStep).toBeDefined();
    expect(multiplyStep?.stage === 'multiply' && multiplyStep.source.kind).toBe('promille');
    expect(multiplyStep?.stage === 'multiply' && multiplyStep.source.label).toBe('Vollrausch');
  });

  it('removing the Promille modifier (sobering up) exactly restores the base value', () => {
    const sim = new GameSim({ room: bareRoom() });
    const base = sim.stats.value(StatId.Stammwuerze);

    sim.tuning.promille.current = 3.5; // Vollrausch
    sim.step(createInputFrame());
    expect(sim.stats.value(StatId.Stammwuerze)).not.toBe(base);

    sim.tuning.promille.current = 0; // Nuchtern
    sim.step(createInputFrame());
    expect(sim.stats.value(StatId.Stammwuerze)).toBe(base);
  });

  it('floors Schluckfrequenz at one tick rather than going to zero or negative', () => {
    const sim = new GameSim({ room: bareRoom() });
    sim.tuning.shooting.fireDelayTicks = 1;
    sim.tuning.promille.current = 3.5; // Vollrausch: fire-rate bonus shrinks the delay further
    sim.step(createInputFrame());

    expect(sim.stats.value(StatId.Schluckfrequenz)).toBeGreaterThanOrEqual(1);
    const capStep = sim.stats
      .trace(StatId.Schluckfrequenz)
      .steps.find((step) => step.stage === 'cap');
    expect(capStep).toBeDefined();
  });
});
