import { STAT_IDS, type BaseStats, type StatId } from './definition.js';
import type { ModifierSource, StatModifier } from './modifiers.js';

/**
 * A hard floor and/or ceiling on a stat's final value, named so the trace can
 * say *why* a value stopped moving rather than just where it stopped.
 */
export interface StatCap {
  readonly min?: number;
  readonly max?: number;
  /** Printed in the trace when the cap actually changes the value. */
  readonly label: string;
}

export type StatCaps = Readonly<Partial<Record<StatId, StatCap>>>;

export type TraceStep =
  | { readonly stage: 'base'; readonly value: number }
  | {
      readonly stage: 'add';
      readonly source: ModifierSource;
      readonly delta: number;
      readonly value: number;
    }
  | {
      readonly stage: 'multiply';
      readonly source: ModifierSource;
      readonly factor: number;
      readonly value: number;
    }
  | {
      readonly stage: 'cap';
      readonly label: string;
      readonly from: number;
      readonly value: number;
    };

export interface StatTrace {
  readonly stat: StatId;
  /** Every step the value passed through, in resolution order: base, then
   *  each flat add, then each multiplier, then a cap step if one bound. */
  readonly steps: readonly TraceStep[];
  readonly value: number;
}

export type StatTraces = Readonly<Record<StatId, StatTrace>>;

/**
 * Falls back to `previous` rather than letting a bad modifier poison the
 * whole chain. `previous` is itself always finite by induction — the base
 * value is sanitised the same way — so this is the one guard the pipeline
 * needs against a modifier that is NaN, Infinity, or produces one.
 */
function finiteOr(value: number, previous: number): number {
  return Number.isFinite(value) ? value : previous;
}

/**
 * `base → flat additions → multipliers → caps → final`, for one stat.
 *
 * Pure: the same base, modifiers and cap always produce the same trace. Order
 * within a stage is the order `modifiers` lists them in — the caller's
 * insertion order — which is also the order the debug overlay prints.
 */
export function resolveStat(
  stat: StatId,
  base: number,
  modifiers: readonly StatModifier[],
  cap?: StatCap,
): StatTrace {
  const steps: TraceStep[] = [];
  let value = finiteOr(base, 0);
  steps.push({ stage: 'base', value });

  for (const modifier of modifiers) {
    if (modifier.stat !== stat || modifier.op !== 'add') {
      continue;
    }
    value = finiteOr(value + modifier.value, value);
    steps.push({ stage: 'add', source: modifier.source, delta: modifier.value, value });
  }

  for (const modifier of modifiers) {
    if (modifier.stat !== stat || modifier.op !== 'multiply') {
      continue;
    }
    value = finiteOr(value * modifier.value, value);
    steps.push({ stage: 'multiply', source: modifier.source, factor: modifier.value, value });
  }

  if (cap !== undefined) {
    const before = value;
    if (cap.min !== undefined) {
      value = Math.max(cap.min, value);
    }
    if (cap.max !== undefined) {
      value = Math.min(cap.max, value);
    }
    if (value !== before) {
      steps.push({ stage: 'cap', label: cap.label, from: before, value });
    }
  }

  return { stat, steps, value };
}

/** `resolveStat` over every stat. The whole of the stat pipeline (#25). */
export function resolveStats(
  base: BaseStats,
  modifiers: readonly StatModifier[],
  caps: StatCaps,
): StatTraces {
  const result: Partial<Record<StatId, StatTrace>> = {};
  for (const stat of STAT_IDS) {
    result[stat] = resolveStat(stat, base[stat], modifiers, caps[stat]);
  }
  return result as StatTraces;
}
