/**
 * A pickup, as data.
 *
 * `effect` says what happens on collection in terms `sim/systems/pickup.ts`
 * interprets — not a function, so a definition stays inspectable and testable
 * without running the simulation, the same convention `enemy/definition.ts`
 * uses for state machines.
 */
export interface PickupDefinition {
  /** Unique, lower case, no spaces. Used by room templates and drop tables. */
  readonly id: string;
  /** The name a player would see. German, per docs/CONTENT_BIBLE.md. */
  readonly name: string;
  /** A short, plain-language translation of what it does — "Bomb", "Currency +5". Shown on the pickup toast (#26). */
  readonly description: string;
  readonly radius: number;
  readonly tint: number;
  /**
   * A one-to-three character glyph drawn on the pickup — the placeholder-art
   * substitute for a real icon (#34). Distinct tint plus distinct label is
   * two independent signals for what a pickup is, the same "no information
   * by colour alone" reasoning `placeholder-art.ts`'s minimap icons already
   * follow.
   */
  readonly label: string;
  readonly effect: PickupEffect;
}

export type PickupEffect =
  | { readonly kind: 'health'; readonly pool: 'red' | 'soul' | 'eternal'; readonly amount: number }
  | { readonly kind: 'currency'; readonly amount: number }
  | { readonly kind: 'bombs'; readonly amount: number }
  | { readonly kind: 'keys'; readonly amount: number }
  /**
   * Brezn, Obazda, Radi: a small heal that also lowers Promille.
   * `promille` is the positive amount it lowers by — passed straight to
   * `GameSim.lowerPromille`, which (like `addPromille`) takes a magnitude,
   * not a signed delta.
   */
  | { readonly kind: 'food'; readonly heal: number; readonly promille: number }
  /**
   * Beer: the one pickup that raises Promille. Never rolled in a sober run's
   * tables. No `amount` field — the raise reads `tuning.promille.beerAmount`
   * at collection time, the same tunable value the debug tuning window
   * already binds a slider to, so there is exactly one number that says how
   * much one beer is worth.
   */
  | { readonly kind: 'promille'; readonly heal: number }
  /**
   * Weißwurst: generous on floors before `floorThreshold`, spoiled from it on.
   * One definition, one tint — "the sprite does not change" holds by
   * construction, not by a rule someone could forget to keep.
   */
  | {
      readonly kind: 'weisswurst';
      readonly floorThreshold: number;
      readonly healBelowFloor: number;
      readonly damageAtOrAbove: number;
    };

/** One weighted outcome. `pickupId: null` is "nothing drops" — its own outcome, not an absence. */
export interface DropTableEntry {
  readonly pickupId: string | null;
  readonly weight: number;
}

/**
 * A drop table has two variants, selected once per run by whether Promille is
 * unlocked (#85). `sober` never names `'beer'` — its weight goes to
 * Biermarken, Kellerschlüssel and health instead, per the issue's own
 * "Update — the drop table has a sober variant" note. This is what makes drop
 * rates "data, tunable without a code change": both variants are read here,
 * nothing branches on run state anywhere else.
 */
export interface DropTable {
  readonly sober: readonly DropTableEntry[];
  readonly promilled: readonly DropTableEntry[];
}

export const LOOT_TIERS = ['weak', 'normal', 'tough'] as const;
export type LootTier = (typeof LOOT_TIERS)[number];
