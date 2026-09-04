import type { ProjectileTagName } from '../projectile/tags.js';
import type { StatId } from '../stats/definition.js';
import type { ModifierOp } from '../stats/modifiers.js';

/**
 * Who you are playing as, as data (#47).
 *
 * `docs/GAME_DESIGN.md` §3 is explicit that a character is **a different
 * verb, not a different stat spread**: König Ludwig flies and pays for it,
 * Der Wolpertinger is rerolled every floor, D'Sennerin's own ricochets can
 * hit her. A stat block alone cannot express any of those, and a
 * `CharacterDefinition` carrying functions would put behaviour in
 * `src/content/` — which the `content-is-data` lint rule (and the reasoning
 * behind it) rules out.
 *
 * So a character is a stat block **plus a list of named rules**. The rule is
 * a string in the roster and a branch in the one system that owns it: flight
 * lives in `sim/systems/movement.ts`, the ricochet in
 * `sim/systems/collision.ts`. Adding the sixth character stays a data
 * change; adding a genuinely new *verb* is a rule id and the one system that
 * reads it, which is the honest cost of a verb that did not exist before.
 *
 * Nothing here is optional-with-a-default: a character states its whole
 * hand. `NEUTRAL_TRAITS` below is what "no character at all" means, and is
 * what every test that does not care about #47 gets.
 */

/** One character's contribution to the stat pipeline, in `ModifierSource` kind `'character'`. */
export interface CharacterStatModifier {
  readonly stat: StatId;
  readonly op: ModifierOp;
  readonly value: number;
}

/**
 * The verbs. Each one is read by exactly one system, named in its comment —
 * if a rule ever needs two, that is the moment to ask whether it is really
 * one rule.
 */
export const CharacterRule = {
  /**
   * Crosses a room's interior obstacles and ignores its puddles
   * (`sim/systems/movement.ts`). Never crosses a room's own walls, or the
   * grid cells a multi-cell shape does not claim — see
   * `RoomGeometry.addBlock`'s `overflyable` flag for why those two are not
   * the same kind of rectangle.
   */
  Flies: 'flies',
  /**
   * Spends a Biermarke every `purseDrainTicks`, and only hits like Ludwig
   * while the purse still has something in it (`GameSim.stepCharacter`).
   * Broke is not a death spiral — it is an ordinary, fragile character until
   * the next coin.
   */
  Purse: 'purse',
  /** Every stat rerolled on entering a floor (`GameSim.rerollChaosStats`). */
  Chaos: 'chaos',
  /**
   * Her own shots can hit her once they have bounced at least once
   * (`sim/systems/collision.ts`) — "small rooms become a danger to herself",
   * stated as a rule rather than as a warning in the flavour text.
   */
  RicochetHurtsOwner: 'ricochetHurtsOwner',
} as const;

export type CharacterRuleId = (typeof CharacterRule)[keyof typeof CharacterRule];

/** Every rule id, for the content test that checks a roster names only real ones. */
export const CHARACTER_RULE_IDS: readonly CharacterRuleId[] = [
  CharacterRule.Flies,
  CharacterRule.Purse,
  CharacterRule.Chaos,
  CharacterRule.RicochetHurtsOwner,
];

/** How a character plays. The half of a roster entry the simulation reads. */
export interface CharacterTraits {
  readonly id: string;
  /** Shown as the source label in the stat inspector, so a modifier says whose it is. */
  readonly name: string;
  /** Red Maß the run starts and caps at. `PLAYER_HEALTH` is Alois's. */
  readonly maxHealth: number;
  readonly startingBiermarken: number;
  readonly startingBombs: number;
  readonly startingKeys: number;
  /** Item ids handed over at run start, through the ordinary `pickUpItem` path. */
  readonly items: readonly string[];
  /** Tags every shot carries before any item hook runs — `ShootingTuning.forcedTags`. */
  readonly shotTags: readonly ProjectileTagName[];
  readonly stats: readonly CharacterStatModifier[];
  readonly rules: readonly CharacterRuleId[];
}

/**
 * What a `GameSim` with no character is: Alois's own hand, and the state
 * every test written before #47 was already running under.
 *
 * `maxHealth: 6` repeats `sim/game/sim.ts`'s `PLAYER_HEALTH` rather than
 * importing it, because the import would run the other way — `sim.ts`
 * already imports this module, and a character's health is a property of the
 * character, not of the engine's idea of a default player.
 */
export const NEUTRAL_TRAITS: CharacterTraits = {
  id: 'alois',
  name: 'Alois',
  maxHealth: 6,
  startingBiermarken: 0,
  startingBombs: 0,
  startingKeys: 0,
  items: [],
  shotTags: [],
  stats: [],
  rules: [],
};

export function hasCharacterRule(traits: CharacterTraits, rule: CharacterRuleId): boolean {
  return traits.rules.includes(rule);
}
