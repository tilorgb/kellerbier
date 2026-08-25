import { describe, expect, it } from 'vitest';
import { StatPipeline } from '../../src/sim/stats/cache.js';
import { StatId, type BaseStats } from '../../src/sim/stats/definition.js';
import type { StatModifier } from '../../src/sim/stats/modifiers.js';

function baseStats(overrides: Partial<Record<StatId, number>> = {}): BaseStats {
  return {
    [StatId.Stammwuerze]: 10,
    [StatId.Schluckfrequenz]: 20,
    [StatId.Reichweite]: 30,
    [StatId.Wurfkraft]: 3.5,
    [StatId.Gschwindigkeit]: 1.8,
    [StatId.Dusel]: 0,
    ...overrides,
  };
}

function flatModifier(id: string, value: number): StatModifier[] {
  return [
    {
      stat: StatId.Stammwuerze,
      op: 'add',
      value,
      source: { kind: 'item', id, label: id },
    },
  ];
}

describe('StatPipeline cache', () => {
  it('returns the base value with no modifiers registered', () => {
    const pipeline = new StatPipeline(() => baseStats());
    expect(pipeline.value(StatId.Stammwuerze)).toBe(10);
  });

  it('applies modifiers registered under a source', () => {
    const pipeline = new StatPipeline(() => baseStats());
    pipeline.setSourceModifiers('item:sword', flatModifier('sword', 5));
    expect(pipeline.value(StatId.Stammwuerze)).toBe(15);
  });

  it('removing a source exactly restores the previous value', () => {
    const pipeline = new StatPipeline(() => baseStats());
    const before = pipeline.value(StatId.Stammwuerze);
    pipeline.setSourceModifiers('item:sword', flatModifier('sword', 5));
    expect(pipeline.value(StatId.Stammwuerze)).toBe(before + 5);
    pipeline.clearSource('item:sword');
    expect(pipeline.value(StatId.Stammwuerze)).toBe(before);
  });

  it('replacing a source does not double its old modifiers', () => {
    const pipeline = new StatPipeline(() => baseStats());
    pipeline.setSourceModifiers('item:sword', flatModifier('sword', 5));
    pipeline.setSourceModifiers('item:sword', flatModifier('sword', 5));
    expect(pipeline.value(StatId.Stammwuerze)).toBe(15);
  });

  it('caches the resolved traces object while nothing changes', () => {
    const pipeline = new StatPipeline(() => baseStats());
    const first = pipeline.traces();
    const second = pipeline.traces();
    // Same object, not just equal values — proof resolveStats ran once, not
    // once per call.
    expect(second).toBe(first);
  });

  it('produces a freshly resolved traces object once a source changes', () => {
    const pipeline = new StatPipeline(() => baseStats());
    const first = pipeline.traces();
    pipeline.setSourceModifiers('item:sword', flatModifier('sword', 5));
    const second = pipeline.traces();
    expect(second).not.toBe(first);
  });

  it('picks up a live base-stat change even without a modifier change', () => {
    let damage = 10;
    const pipeline = new StatPipeline(() => baseStats({ [StatId.Stammwuerze]: damage }));
    expect(pipeline.value(StatId.Stammwuerze)).toBe(10);
    damage = 25;
    expect(pipeline.value(StatId.Stammwuerze)).toBe(25);
  });

  it('clearing a source that was never set is a no-op', () => {
    const pipeline = new StatPipeline(() => baseStats());
    expect(() => {
      pipeline.clearSource('item:nothing');
    }).not.toThrow();
    expect(pipeline.value(StatId.Stammwuerze)).toBe(10);
  });
});
