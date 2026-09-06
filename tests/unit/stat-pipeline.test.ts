import { describe, expect, it } from 'vitest';
import { StatId, type BaseStats } from '../../src/sim/stats/definition.js';
import type { ModifierSource, StatModifier } from '../../src/sim/stats/modifiers.js';
import {
  type StatCaps,
  type TraceStep,
  resolveStat,
  resolveStats,
} from '../../src/sim/stats/pipeline.js';

function findCapStep(
  steps: readonly TraceStep[],
): Extract<TraceStep, { stage: 'cap' }> | undefined {
  return steps.find((step): step is Extract<TraceStep, { stage: 'cap' }> => step.stage === 'cap');
}

const BASE: BaseStats = {
  [StatId.Damage]: 10,
  [StatId.FireRate]: 20,
  [StatId.Range]: 30,
  [StatId.ShotSpeed]: 3.5,
  [StatId.MoveSpeed]: 1.8,
  [StatId.Luck]: 0,
};

function itemSource(id: string): ModifierSource {
  return { kind: 'item', id, label: id };
}

function mod(stat: StatId, op: 'add' | 'multiply', value: number, id = 'test-item'): StatModifier {
  return { stat, op, value, source: itemSource(id) };
}

describe('stat pipeline', () => {
  it('resolves base -> flat additions -> multipliers -> caps, in that order', () => {
    const trace = resolveStat(StatId.Damage, 10, [
      mod(StatId.Damage, 'multiply', 2, 'multiplier-item'),
      mod(StatId.Damage, 'add', 5, 'flat-item'),
    ]);

    // Insertion order was multiply-then-add, but the trace still resolves
    // flat additions before multipliers: (10 + 5) * 2, not (10 * 2) + 5.
    expect(trace.value).toBe(30);
    expect(trace.steps.map((step) => step.stage)).toEqual(['base', 'add', 'multiply']);
  });

  it('ignores modifiers for other stats', () => {
    const trace = resolveStat(StatId.Damage, 10, [
      mod(StatId.FireRate, 'add', 100),
      mod(StatId.ShotSpeed, 'multiply', 5),
    ]);
    expect(trace.value).toBe(10);
    expect(trace.steps).toHaveLength(1);
  });

  it('records every modifier source, in the order given', () => {
    const trace = resolveStat(StatId.Damage, 10, [
      mod(StatId.Damage, 'add', 1, 'first'),
      mod(StatId.Damage, 'add', 2, 'second'),
    ]);
    const addSteps = trace.steps.filter(
      (step): step is Extract<TraceStep, { stage: 'add' }> => step.stage === 'add',
    );
    expect(addSteps.map((step) => step.source.id)).toEqual(['first', 'second']);
  });

  it('names the cap in the trace when it binds', () => {
    const caps: StatCaps = { [StatId.FireRate]: { min: 1, label: 'min fire delay' } };
    const trace = resolveStat(
      StatId.FireRate,
      20,
      [mod(StatId.FireRate, 'multiply', 0.01)],
      caps[StatId.FireRate],
    );
    expect(trace.value).toBe(1);
    const capStep = findCapStep(trace.steps);
    expect(capStep).toBeDefined();
    expect(capStep?.label).toBe('min fire delay');
  });

  it('does not add a cap step when the cap never binds', () => {
    const caps: StatCaps = { [StatId.Damage]: { min: 0, label: 'min damage' } };
    const trace = resolveStat(StatId.Damage, 10, [], caps[StatId.Damage]);
    expect(trace.steps.some((step) => step.stage === 'cap')).toBe(false);
  });

  it('removing a modifier exactly restores the previous value', () => {
    const withoutItem = resolveStats(BASE, [], {});
    const withItem = resolveStats(BASE, [mod(StatId.Damage, 'add', 7)], {});
    const removedAgain = resolveStats(BASE, [], {});

    expect(withItem[StatId.Damage].value).toBe(17);
    expect(removedAgain[StatId.Damage].value).toBe(withoutItem[StatId.Damage].value);
  });

  it('stacks 30 modifiers without producing NaN, Infinity, or a negative fire delay', () => {
    const caps: StatCaps = { [StatId.FireRate]: { min: 1, label: 'min fire delay' } };
    const modifiers: StatModifier[] = [];
    for (let index = 0; index < 30; index++) {
      modifiers.push(mod(StatId.FireRate, 'multiply', 0.7, `item-${String(index)}`));
      modifiers.push(mod(StatId.Damage, 'add', 1, `item-${String(index)}`));
    }

    const traces = resolveStats(BASE, modifiers, caps);
    for (const stat of Object.keys(BASE) as StatId[]) {
      const value = traces[stat].value;
      expect(Number.isNaN(value)).toBe(false);
      expect(Number.isFinite(value)).toBe(true);
    }
    expect(traces[StatId.FireRate].value).toBeGreaterThanOrEqual(1);
  });

  it('falls back rather than propagating a non-finite modifier', () => {
    const trace = resolveStat(StatId.Damage, 10, [
      mod(StatId.Damage, 'add', Number.POSITIVE_INFINITY),
      mod(StatId.Damage, 'add', 5),
    ]);
    expect(Number.isFinite(trace.value)).toBe(true);
    expect(trace.value).toBe(15);
  });
});
