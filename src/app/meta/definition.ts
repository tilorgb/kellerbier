import type { CharacterTraits } from '../../sim/character/definition.js';

/**
 * The shapes the Stammtisch is authored in (#46).
 *
 * The hub is two things: a table of **regulars** who arrive as you beat
 * bosses, and the **unlocks** each of them brings with them. Both are data —
 * `src/content/stammtisch/` holds the roster the same way
 * `src/content/enemies/` holds the bodies, and adding a regular is a row
 * rather than an engine change.
 *
 * Nothing here imports the simulation. A run is finished by the time any of
 * it is read, and what it reads is a `RunFacts` record the app assembles from
 * the save — so the meta layer stays testable without a `GameSim`, and the
 * sim stays a pure function of a seed and an input log, which it would not be
 * if it could see how many runs the player had already lost.
 */

/** The statistics keys the save's `statistics` map carries for the hub. */
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
 * of floor 2" is the fact the table actually cares about.
 */
export function bossStatKey(floor: number): string {
  return `boss.floor${String(floor)}`;
}

/** What a regular wants from you before they will sit down. */
export type UnlockCondition =
  | { readonly kind: 'bossDefeated'; readonly floor: number }
  | { readonly kind: 'statAtLeast'; readonly stat: string; readonly value: number };

/** What kind of thing an unlock hands over — used to group and to colour it. */
export type UnlockCategory = 'mechanic' | 'character' | 'items' | 'challenge' | 'lore' | 'hub';

export interface UnlockDefinition {
  readonly id: string;
  /** Shown as the thing the regular brought. Bavarian, like every other name. */
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
 * When a regular says a given line.
 *
 * Every one of these except `always` reads the **last run**, which is the
 * whole point: #46's acceptance criterion is that the comments reference the
 * actual last run rather than generic text, and a predicate that cannot see
 * the run cannot do that. `always` is the fallback so a roster is never
 * speechless, and `pickLine` only falls back to it when nothing sharper
 * matches.
 */
export type LineCondition =
  | { readonly kind: 'always' }
  | { readonly kind: 'noRun' }
  | { readonly kind: 'diedOnFloor'; readonly floor: number }
  | { readonly kind: 'reachedFloor'; readonly floor: number }
  | { readonly kind: 'shorterThan'; readonly seconds: number }
  | { readonly kind: 'longerThan'; readonly seconds: number }
  | { readonly kind: 'killsBelow'; readonly kills: number }
  | { readonly kind: 'killsAtLeast'; readonly kills: number };

/**
 * One thing a regular says, and when.
 *
 * `text` may carry the tokens `{sek}`, `{kills}`, `{stock}` and `{wort}`,
 * filled in from the last run by `fillTokens`. A line that only *matches* on
 * the last run still reads as canned; a line that quotes the number back at
 * the player does not, and it is cheaper than authoring one line per outcome.
 */
export interface RegularLine {
  readonly when: LineCondition;
  readonly text: string;
}

export interface RegularDefinition {
  readonly id: string;
  /** Bavarian, and short enough to sit under a seat on the table. */
  readonly name: string;
  /** Who they are, one line. */
  readonly role: string;
  /** Left-to-right order at the table. Stable: a seat is a place, not a rank. */
  readonly seat: number;
  /** The unlock they bring with them — earning it is what seats them. */
  readonly grants: string;
  /** What they say the moment they arrive: what they brought, in their own voice. */
  readonly greeting: string;
  /** What they say afterwards, most specific first — see `pickLine`. */
  readonly lines: readonly RegularLine[];
  /** What the empty chair says while they are still out there. Never names them. */
  readonly waiting: string;
}

/**
 * A playable character offered on the run-start panel (#46's shape, #47's
 * content).
 *
 * ## Why a character carries its own condition rather than an unlock id
 *
 * #46 wrote `requires` as the id of an entry in `STAMMTISCH_UNLOCKS`,
 * because at the time the only unlockable things were what the four
 * regulars brought with them. #47 made that the wrong shape: every unlock
 * belongs to exactly one regular (`tests/content/stammtisch.test.ts` asserts
 * it, and the table is drawn on that assumption), so five characters as five
 * unlocks would mean five more chairs at a four-chair table — a table
 * rebuilt to fit the roster of a *different* feature.
 *
 * A character is its own unlockable thing instead: it states the same
 * `UnlockCondition` the unlocks use, so `conditionMet`/`conditionProgress`
 * and the "always something to work toward" progress line come along
 * unchanged, and the run-start panel shows the roster with its own goals
 * under it. The table stays the regulars' table.
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

/** Everything the hub is built from, handed in as one bundle so a test can substitute its own. */
export interface StammtischContent {
  readonly regulars: readonly RegularDefinition[];
  readonly unlocks: readonly UnlockDefinition[];
  readonly characters: readonly CharacterDefinition[];
}
