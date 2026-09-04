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
  /**
   * What `description` says in a **sober run** (#85), for the pickups whose
   * honest description names a mechanic that run does not have — the three
   * food items, whose "lowers Promille" half has nothing to lower.
   *
   * Authored rather than derived. #85's acceptance criterion is that a
   * first-time player clears floor 1 "without meeting the word Promille
   * anywhere", and a toast is the most-read text in the game; stripping the
   * clause with a regex would eventually produce a sentence nobody wrote,
   * whereas a second authored string is checked by the same content tests
   * the first one is. Omitted means the description is already true in both
   * runs, which is the case for all but three pickups.
   */
  readonly soberDescription?: string;
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
  | { readonly kind: 'currency'; readonly amount: number }
  | { readonly kind: 'bombs'; readonly amount: number }
  | { readonly kind: 'keys'; readonly amount: number }
  /**
   * Wurst: the only health pickup in the game (#health-food-redesign). Heals
   * `pool` by `heal` and lowers Promille by `promille` — every tier of every
   * pool doubles as the "soberness" mechanic the old Brezn/Obazda/Radi food
   * items used to be, not just the red-pool Bratwurst. `promille` is the
   * positive amount it lowers by — passed straight to `GameSim.lowerPromille`,
   * which (like `addPromille`) takes a magnitude, not a signed delta.
   *
   * Refused outright — stays on the floor, no heal, no Promille change —
   * when `pool` is already at its ceiling (`GameSim.healthPoolFull`), the
   * same all-or-nothing shape Bruder Barnabas's fast refusal already uses.
   */
  | {
      readonly kind: 'food';
      readonly pool: 'red' | 'soul' | 'eternal';
      readonly heal: number;
      readonly promille: number;
    }
  /**
   * Maß: the only Promille pickup in the game, full and half — replaces the
   * old single-tier Bier. Never rolled in a sober run's tables, and no
   * longer heals at all (that is Wurst's job now). No `amount` field — the
   * raise reads `tuning.promille.massFullAmount`/`massHalfAmount` at
   * collection time, the same tunable-value pattern the debug tuning window
   * already binds a slider to.
   */
  | { readonly kind: 'promille'; readonly size: 'full' | 'half' };

/**
 * The description to show for `definition` in a run that is (or is not)
 * promilled — `soberDescription` where one is authored and the run is sober,
 * `description` otherwise.
 *
 * A function rather than a field lookup at each call site because there are
 * two of them (the pickup toast in `sim/systems/pickup.ts`, and the shop
 * preview in `GameSim.shopPreview`) and a third would be easy to add without
 * noticing this rule existed.
 */
export function pickupDescriptionFor(
  definition: Pick<PickupDefinition, 'description' | 'soberDescription'>,
  promilleUnlocked: boolean,
): string {
  return promilleUnlocked
    ? definition.description
    : (definition.soberDescription ?? definition.description);
}

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
