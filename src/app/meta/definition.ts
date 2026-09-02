import type { CharacterTraits } from '../../sim/character/definition.js';

/**
 * The shapes meta-progression content is authored in.
 *
 * Two rosters: **unlocks** (things a save earns outside of a single run —
 * mostly by beating a boss or crossing a stat total) and **characters** (the
 * run-start roster, #47). Both are data — `src/content/progression/` holds
 * them the same way `src/content/enemies/` holds the bodies, and adding one
 * is a row rather than an engine change.
 *
 * Nothing here imports the simulation. A run is finished by the time any of
 * it is read, and what it reads is a `RunFacts` record the app assembles from
 * the save — so the meta layer stays testable without a `GameSim`, and the
 * sim stays a pure function of a seed and an input log, which it would not be
 * if it could see how many runs the player had already lost.
 */

/** The statistics keys the save's `statistics` map carries for progression. */
export const STAT_RUNS = 'runs';
export const STAT_KILLS = 'kills';
export const STAT_TICKS = 'ticks';
export const STAT_DEEPEST_FLOOR = 'deepestFloor';

/**
 * The statistic counting how often the boss of `floor` has been beaten.
 *
 * Keyed by floor, not by the boss's enemy id: which body a floor's boss is
 * made of is a content decision that has already changed once (#38 split Der
 * Stier into two phases with two ids), and "you beat what was at the bottom
 * of floor 2" is the fact progression actually cares about.
 */
export function bossStatKey(floor: number): string {
  return `boss.floor${String(floor)}`;
}

/** What earns an unlock, or a character. */
export type UnlockCondition =
  | { readonly kind: 'bossDefeated'; readonly floor: number }
  | { readonly kind: 'statAtLeast'; readonly stat: string; readonly value: number };

/** What kind of thing an unlock hands over — used to group and to colour it. */
export type UnlockCategory = 'mechanic' | 'character' | 'items' | 'challenge' | 'hub';

export interface UnlockDefinition {
  readonly id: string;
  /** Bavarian, like every other name in this project. */
  readonly name: string;
  /** One line on what it changes, in the player's own words rather than the code's. */
  readonly effect: string;
  readonly category: UnlockCategory;
  /** What earns it — evaluated against the save, and shown as a goal until it is met. */
  readonly condition: UnlockCondition;
  /** The goal as a sentence: "Schlog Der Stier im 2. Stock". */
  readonly goal: string;
}

/**
 * A playable character offered on the run-start path (#47).
 *
 * A character carries its own `UnlockCondition` rather than an unlock id, so
 * `conditionMet`/`conditionProgress` and the "always something to work
 * toward" progress line come along unchanged, and the roster shows its own
 * goals under it without needing a matching entry in `PROGRESSION_UNLOCKS`.
 */
export interface CharacterDefinition {
  readonly id: string;
  readonly name: string;
  /** One line on who they are, in the player's language, not the code's. */
  readonly note: string;
  /** What earns them, or `null` for the one you start with. */
  readonly requires: UnlockCondition | null;
  /** That condition as a sentence: "Schlog Der Stier am Dorfplatz". Empty for Alois. */
  readonly goal: string;
  /** How they actually play — handed straight to `GameSim` as its `character`. */
  readonly traits: CharacterTraits;
}

/** Everything progression is built from, handed in as one bundle so a test can substitute its own. */
export interface ProgressionContent {
  readonly unlocks: readonly UnlockDefinition[];
  readonly characters: readonly CharacterDefinition[];
}
