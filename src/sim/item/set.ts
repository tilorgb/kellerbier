import type { ItemStatModifier } from './definition.js';
import type { ItemRegistry } from './registry.js';

/**
 * Item sets (#137): a handful of items visibly the same character/theme's
 * gear, which pay off with a bonus on top of what each piece already does
 * on its own once every piece is held at once.
 *
 * A set is authored data, the same "content, not engine" shape
 * `sim/item/definition.ts`'s `ItemDefinition` uses — `bonus` reuses
 * `ItemStatModifier` verbatim (a `StatModifier` missing its `source`, which
 * `GameSim` fills in exactly like an item's own `modifyStats` output does),
 * rather than inventing a second shape for "some numbers applied to stats."
 */
export interface ItemSetDefinition {
  /** Unique, lower case, no spaces — same convention as `ItemDefinition.id`. */
  readonly id: string;
  /** The name a player would see on the completion notification, e.g. "Braumeister". */
  readonly name: string;
  /** Item ids that make up the set. At least two — a "set" of one is just an item. */
  readonly members: readonly string[];
  /** Applied only while every member above is currently held. */
  readonly bonus: readonly ItemStatModifier[];
}

/** The `StatPipeline` source key a set's `bonus` output registers under, once complete. */
export function setStatSourceKey(id: string): string {
  return `set:${id}`;
}

/** A validated `ItemSetDefinition`, with `memberIndices` resolved against the run's `ItemRegistry`. */
export interface CompiledItemSet {
  readonly id: string;
  readonly name: string;
  readonly members: readonly string[];
  /** `members`, resolved to registry indices — what `GameSim` actually checks `ItemInventory.has` against. */
  readonly memberIndices: readonly number[];
  readonly bonus: readonly ItemStatModifier[];
}

/**
 * Every item set, checked once against the run's already-built `ItemRegistry`
 * and turned into something dispatch can read fast — the same shape
 * `ItemRegistry` itself is, one layer up: a set's members have to actually
 * exist as items before anything can ask "are they all held."
 *
 * Sorted by `id` at construction, same reasoning `ItemRegistry`'s own doc
 * comment gives: two sets both completing on the same pickup resolve their
 * notifications/modifiers in a fixed order regardless of pickup order.
 */
export class SetRegistry {
  readonly all: readonly CompiledItemSet[];

  private readonly byId = new Map<string, number>();

  constructor(definitions: readonly ItemSetDefinition[], items: ItemRegistry) {
    const sorted = [...definitions].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    for (const definition of sorted) {
      this.validate(definition, items);
      if (this.byId.has(definition.id)) {
        throw new Error(`Two item sets share the id "${definition.id}"`);
      }
      this.byId.set(definition.id, this.byId.size);
    }
    this.all = sorted.map((definition) => this.compile(definition, items));
  }

  get count(): number {
    return this.all.length;
  }

  private validate(definition: ItemSetDefinition, items: ItemRegistry): void {
    const where = `item set "${definition.id}"`;
    if (definition.id.trim() === '' || definition.id !== definition.id.toLowerCase()) {
      throw new Error(`${where} must have a non-empty, lower-case id`);
    }
    if (definition.id.includes(' ')) {
      throw new Error(`${where} must not contain spaces`);
    }
    if (definition.name.trim() === '') {
      throw new Error(`${where} must have a name`);
    }
    if (definition.members.length < 2) {
      throw new Error(`${where} needs at least two members — one item is not a set`);
    }
    if (new Set(definition.members).size !== definition.members.length) {
      throw new Error(`${where} lists the same item id more than once`);
    }
    for (const memberId of definition.members) {
      if (items.indexOf(memberId) < 0) {
        throw new Error(`${where} names "${memberId}", which is not a registered item`);
      }
    }
  }

  private compile(definition: ItemSetDefinition, items: ItemRegistry): CompiledItemSet {
    return {
      id: definition.id,
      name: definition.name,
      members: definition.members,
      memberIndices: definition.members.map((memberId) => items.indexOf(memberId)),
      bonus: definition.bonus,
    };
  }
}
