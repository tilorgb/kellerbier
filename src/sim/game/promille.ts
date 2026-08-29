import type { PromilleTuning } from '../tuning.js';
import type { PromilleRequirement } from '../item/definition.js';

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
  /** Trinkfest level 1's stage (#92) — see `promilleTierOf`. */
  Sturzbesoffen: 4,
  /** Trinkfest level 2's stage — the last stop before Umgfalln. */
  Filmriss: 5,
  Umgfalln: 6,
} as const;

export type PromilleTierId = (typeof PromilleTier)[keyof typeof PromilleTier];

/**
 * The pre-#92 Promille ceiling — still exactly what `trinkfest === 0`
 * reproduces. With Trinkfest raised, the real reachable ceiling is
 * `promilleCapFor`, not this constant; kept under its original name because
 * every pre-#92 caller (and every pre-#92 test) means "the baseline max"
 * when it says this.
 */
export const PROMILLE_MAX = 5.0;

/** Trinkfest is an integer-ish level; anything more than two stages past Vollrausch is more than #92 asks for. */
export const TRINKFEST_MIN = -1;
export const TRINKFEST_MAX = 2;

export function clampTrinkfest(value: number): number {
  return Math.min(TRINKFEST_MAX, Math.max(TRINKFEST_MIN, value));
}

/** Tier boundaries from the design doc's table, read as half-open ranges. */
const ANGEHEITERT_AT = 0.5;
const BEDUSELT_AT = 1.5;
const VOLLRAUSCH_AT = 3.0;
const UMGFALLN_AT = 4.5;

/**
 * The Promille value at which Umgfalln triggers, for a given Trinkfest.
 * `trinkfest === 0` gives back `UMGFALLN_AT` exactly, so the pre-#92 tier
 * table is unchanged at baseline. Positive Trinkfest pushes it out past the
 * old ceiling one `trinkfestStageWidth` at a time (unlocking Sturzbesoffen,
 * then Filmriss, on the way there); negative pulls it in from below —
 * always still inside Vollrausch's own 3.0–4.4 band at `TRINKFEST_MIN`, so
 * lowering Trinkfest shortens a tier rather than skipping one entirely.
 */
export function umgfallnThresholdFor(trinkfest: number, tuning: PromilleTuning): number {
  return UMGFALLN_AT + trinkfest * tuning.trinkfestStageWidth;
}

/**
 * The highest Promille a run can actually reach at a given Trinkfest —
 * what `GameSim.addPromille` clamps against. Never drops below the pre-#92
 * ceiling: a negative Trinkfest makes Umgfalln arrive sooner (see
 * `umgfallnThresholdFor`), it does not also shrink the meter itself, since
 * the knockdown already caps the player's practical progress once the
 * (lower) threshold is crossed.
 */
export function promilleCapFor(trinkfest: number, tuning: PromilleTuning): number {
  return PROMILLE_MAX + Math.max(0, trinkfest) * tuning.trinkfestStageWidth;
}

/**
 * `trinkfest` and `tuning` are what #92 adds: without them this is exactly
 * the pre-#92 function, and `trinkfest === 0` reproduces its exact
 * boundaries (the "baseline Trinkfest experiences the existing Promille
 * behaviour unchanged" acceptance criterion) because `umgfallnThresholdFor`
 * and every stage guard below key off `trinkfest` being at least 1.
 */
export function promilleTierOf(
  value: number,
  trinkfest: number,
  tuning: PromilleTuning,
): PromilleTierId {
  const umgfallnAt = umgfallnThresholdFor(trinkfest, tuning);
  if (value >= umgfallnAt) {
    return PromilleTier.Umgfalln;
  }
  const width = tuning.trinkfestStageWidth;
  if (trinkfest >= 2 && value >= UMGFALLN_AT + width) {
    return PromilleTier.Filmriss;
  }
  if (trinkfest >= 1 && value >= UMGFALLN_AT) {
    return PromilleTier.Sturzbesoffen;
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

/**
 * Whether an item's `PromilleRequirement` (#26/#32) currently holds, given
 * the tier the meter reads right now — the one gate `sim/systems/items.ts`'s
 * dispatch and `GameSim.syncItemStatModifiers`/`useActiveItem` all call,
 * rather than each item re-deriving its own version of this check.
 *
 * `'sober'` is exactly the tier before the meter ever leaves baseline —
 * Nüchtern — which is `value < ANGEHEITERT_AT` (0.5), the same number
 * `ruhige-hand.ts` used to hardcode as its own bespoke threshold before this
 * helper replaced it: the two were always the same boundary, not two
 * independent numbers that happened to agree.
 *
 * `'rausch'` is Vollrausch *or anything further down the ladder Trinkfest
 * unlocks* (Sturzbesoffen, Filmriss, #92) — `tier >= PromilleTier.Vollrausch`,
 * never `=== Vollrausch`. Comparing for equality would silently turn a
 * rausch item off the instant Trinkfest tolerance pushed the player from
 * Vollrausch into Sturzbesoffen, which is the opposite of what "rausch" is
 * supposed to mean once #92 gave the ladder more rungs.
 */
export function promilleRequirementMet(
  requirement: PromilleRequirement,
  tier: PromilleTierId,
): boolean {
  switch (requirement) {
    case 'sober':
      return tier === PromilleTier.Nuchtern;
    case 'rausch':
      return tier >= PromilleTier.Vollrausch;
    default:
      return true;
  }
}

export function promilleTierName(tier: PromilleTierId): string {
  switch (tier) {
    case PromilleTier.Angeheitert:
      return 'Angeheitert';
    case PromilleTier.Beduselt:
      return 'Beduselt';
    case PromilleTier.Vollrausch:
      return 'Vollrausch';
    case PromilleTier.Sturzbesoffen:
      return 'Sturzbesoffen';
    case PromilleTier.Filmriss:
      return 'Filmriss';
    case PromilleTier.Umgfalln:
      return 'Umgfalln';
    default:
      // Spelled with its umlaut, unlike the `PromilleTier.Nuchtern` *key*
      // above: the key is an identifier and the string is a word a player
      // reads. It was ASCII on both sides until #154, when the UI got a font
      // that can actually draw an `ü`.
      return 'Nüchtern';
  }
}

/**
 * Neutral reskin (#33): the same seven tiers, named for a generic "power"
 * meter instead of intoxication — `docs/GAME_DESIGN.md` §5's own "an option
 * to relabel the meter as a generic 'Rausch/Power'" guardrail, worded in the
 * issue as "Rausch" or "Kraft". Kraft is what this repo picked, since
 * "Rausch" (rush/intoxication) still reads as drinking — see
 * `promilleMeterLabel`.
 *
 * A parallel table rather than a parameter threaded through
 * `promilleTierName` itself: that function's one other caller
 * (`GameSim.syncPromilleModifiers`'s stat-modifier source label) feeds a
 * dev-only debug panel (`src/debug/panels/stats.ts`) nobody but an engineer
 * ever sees, and reads as an internal identity string more than a display
 * string — see `docs/DECISIONS.md` for why that one stays unconditional
 * rather than threading a rendering-only setting into `GameSim.step()`.
 * Every consumer a player or a streamer can actually see —
 * `PromilleHud` and the `O`-overlay debug text in `app/main.ts` — reads
 * through `promilleTierDisplayName` below instead.
 */
const NEUTRAL_TIER_NAME: Readonly<Record<PromilleTierId, string>> = {
  [PromilleTier.Nuchtern]: 'Ruhig',
  [PromilleTier.Angeheitert]: 'Wach',
  [PromilleTier.Beduselt]: 'Aufgeladen',
  [PromilleTier.Vollrausch]: 'Kraftvoll',
  [PromilleTier.Sturzbesoffen]: 'Übersteuert',
  [PromilleTier.Filmriss]: 'Überladen',
  [PromilleTier.Umgfalln]: 'Ausgeknockt',
};

/** `promilleTierName`, or its neutral-reskin equivalent — see `NEUTRAL_TIER_NAME`. */
export function promilleTierDisplayName(tier: PromilleTierId, neutralReskin: boolean): string {
  return neutralReskin ? NEUTRAL_TIER_NAME[tier] : promilleTierName(tier);
}

/** Kater's own display name under the neutral reskin — same reasoning as `NEUTRAL_TIER_NAME`. */
export function promilleKaterLabel(neutralReskin: boolean): string {
  return neutralReskin ? 'Erschöpft' : 'Kater';
}

/**
 * What the meter itself is called: "Promille" normally, "Kraft" under the
 * reskin. Read by the `O`-overlay debug text's line label in `app/main.ts` —
 * `PromilleHud` never spells the meter's own name out, only its tier and
 * value, so it has nothing here to switch.
 */
export function promilleMeterLabel(neutralReskin: boolean): string {
  return neutralReskin ? 'Kraft' : 'Promille';
}

/**
 * The unit suffix printed after the numeric value. `‰` (per mille) is
 * literal blood-alcohol notation, so the reskin drops it rather than hunting
 * for a neutral replacement — the bare number reads fine on its own.
 */
export function promilleUnitSuffix(neutralReskin: boolean): string {
  return neutralReskin ? '' : '‰';
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
      return 1 + tuning.vollrauschDamageBonus;
    case PromilleTier.Sturzbesoffen:
      return 1 + tuning.sturzbesoffenDamageBonus;
    case PromilleTier.Filmriss:
      return 1 + tuning.filmrissDamageBonus;
    // Umgfalln keeps Vollrausch's numbers, same as pre-#92 — it never
    // matters in play (a knocked-down player cannot fire, `stepShooting`
    // returns before this is ever read), and picking a fixed fallback here
    // rather than "whichever stage was active a tick ago" keeps this a pure
    // function of the tier alone.
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
      return 1 + tuning.vollrauschFireRateBonus;
    case PromilleTier.Sturzbesoffen:
      return 1 + tuning.sturzbesoffenFireRateBonus;
    case PromilleTier.Filmriss:
      return 1 + tuning.filmrissFireRateBonus;
    case PromilleTier.Umgfalln:
      return 1 + tuning.vollrauschFireRateBonus;
    default:
      return 1;
  }
}

/**
 * 0 at and below `start`, ramping linearly past `1` at `PROMILLE_MAX` rather
 * than clamping there (the pre-#92 behaviour). That single change is what
 * makes every ramp below escalate through the Trinkfest stages for free:
 * `value` can only exceed `PROMILLE_MAX` when Trinkfest has actually raised
 * the ceiling (`promilleCapFor`), and at `trinkfest === 0` `value` never
 * does, so the ratio never exceeds 1 and every pre-#92 reading is unchanged.
 */
function rampFrom(value: number, start: number): number {
  if (value <= start) {
    return 0;
  }
  return (value - start) / (PROMILLE_MAX - start);
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
 * bottom of this ramp, not a separate on/off step. Uncapped past `1` for the
 * same Trinkfest-escalation reason `rampFrom` is.
 */
export function promilleSwayMagnitude(value: number, tuning: PromilleTuning): number {
  return (value / PROMILLE_MAX) * tuning.maxSway;
}

/**
 * The third penalty #92 asks for alongside sway and wobble: a readable
 * screen distortion. Zero through Nüchtern/Angeheitert/Beduselt, starting
 * exactly where Vollrausch does (the design doc's "Rausch-tier item effects
 * activate" boundary), `1` at the pre-#92 ceiling, and — like every ramp
 * above — climbing past `1` through the Trinkfest stages. `render/
 * vignette.ts` is what actually spends this on a pulsing, reddening vignette.
 */
export function promilleScreenDistortion(value: number, tuning: PromilleTuning): number {
  return rampFrom(value, VOLLRAUSCH_AT) * tuning.maxScreenDistortion;
}
