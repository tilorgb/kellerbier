import type { PromilleTuning } from '../tuning.js';

/**
 * The Promille tiers, per `docs/GAME_DESIGN.md` §5.
 *
 * Pure functions of a value and a tuning object, kept out of `GameSim` so the
 * tier/multiplier/ramp math is testable without a running simulation — the
 * same reason `death-word.ts` (#15) is its own file.
 */
export const PromilleTier = {
  Nuchtern: 0,
  Angeheitert: 1,
  Beduselt: 2,
  Vollrausch: 3,
  Umgfalln: 4,
} as const;

export type PromilleTierId = (typeof PromilleTier)[keyof typeof PromilleTier];

export const PROMILLE_MAX = 5.0;

/** Tier boundaries from the design doc's table, read as half-open ranges. */
const ANGEHEITERT_AT = 0.5;
const BEDUSELT_AT = 1.5;
const VOLLRAUSCH_AT = 3.0;
const UMGFALLN_AT = 4.5;

export function promilleTierOf(value: number): PromilleTierId {
  if (value >= UMGFALLN_AT) {
    return PromilleTier.Umgfalln;
  }
  if (value >= VOLLRAUSCH_AT) {
    return PromilleTier.Vollrausch;
  }
  if (value >= BEDUSELT_AT) {
    return PromilleTier.Beduselt;
  }
  if (value >= ANGEHEITERT_AT) {
    return PromilleTier.Angeheitert;
  }
  return PromilleTier.Nuchtern;
}

export function promilleTierName(tier: PromilleTierId): string {
  switch (tier) {
    case PromilleTier.Angeheitert:
      return 'Angeheitert';
    case PromilleTier.Beduselt:
      return 'Beduselt';
    case PromilleTier.Vollrausch:
      return 'Vollrausch';
    case PromilleTier.Umgfalln:
      return 'Umgfalln';
    default:
      return 'Nuchtern';
  }
}

/**
 * Damage and fire-rate bonuses are the numbers the design doc states exactly,
 * per tier — stepped, not a curve, because that is how they're authored.
 */
export function promilleDamageMultiplier(tier: PromilleTierId, tuning: PromilleTuning): number {
  switch (tier) {
    case PromilleTier.Angeheitert:
      return 1 + tuning.angeheitertDamageBonus;
    case PromilleTier.Beduselt:
      return 1 + tuning.beduseltDamageBonus;
    case PromilleTier.Vollrausch:
    case PromilleTier.Umgfalln:
      return 1 + tuning.vollrauschDamageBonus;
    default:
      return 1;
  }
}

export function promilleFireRateMultiplier(tier: PromilleTierId, tuning: PromilleTuning): number {
  switch (tier) {
    case PromilleTier.Angeheitert:
      return 1 + tuning.angeheitertFireRateBonus;
    case PromilleTier.Beduselt:
      return 1 + tuning.beduseltFireRateBonus;
    case PromilleTier.Vollrausch:
    case PromilleTier.Umgfalln:
      return 1 + tuning.vollrauschFireRateBonus;
    default:
      return 1;
  }
}

/** 0 at and below the Beduselt threshold, ramping linearly to 1 at `PROMILLE_MAX`. */
function rampFrom(value: number, start: number): number {
  if (value <= start) {
    return 0;
  }
  return Math.min(1, (value - start) / (PROMILLE_MAX - start));
}

/**
 * Movement drift and aim wobble only start at Beduselt ("movement has drift
 * and momentum; aim wobbles") — Angeheitert gets none of either, only sway.
 */
export function promilleDriftScale(value: number, tuning: PromilleTuning): number {
  return rampFrom(value, BEDUSELT_AT) * tuning.maxDrift;
}

export function promilleWobbleAmplitude(value: number, tuning: PromilleTuning): number {
  return rampFrom(value, BEDUSELT_AT) * tuning.maxWobble;
}

/**
 * Sway starts immediately — Angeheitert's "very slight camera sway" is the
 * bottom of this ramp, not a separate on/off step.
 */
export function promilleSwayMagnitude(value: number, tuning: PromilleTuning): number {
  return Math.min(1, value / PROMILLE_MAX) * tuning.maxSway;
}
