import type { PickupDefinition } from './definition.js';

/**
 * Pickup data, checked once and turned into something a system can read fast.
 *
 * Deliberately flat compared to `EnemyRegistry` — a `PickupDefinition` has no
 * cross-references to resolve, so compilation here is just "assign a stable
 * index and reject duplicate ids."
 */
export class PickupRegistry {
  readonly all: readonly PickupDefinition[];

  private readonly byId = new Map<string, number>();

  constructor(definitions: readonly PickupDefinition[]) {
    for (const definition of definitions) {
      if (definition.id.trim() === '' || definition.id !== definition.id.toLowerCase()) {
        throw new Error(`pickup "${definition.id}" must have a non-empty, lower-case id`);
      }
      if (this.byId.has(definition.id)) {
        throw new Error(`Two pickups share the id "${definition.id}"`);
      }
      this.byId.set(definition.id, this.byId.size);
    }
    this.all = definitions;
  }

  get count(): number {
    return this.all.length;
  }

  /** The index of a pickup by id, or -1. Indices are what entities store. */
  indexOf(id: string): number {
    return this.byId.get(id) ?? -1;
  }

  /** The pickup at an index. Throws rather than returning a half-pickup. */
  at(index: number): PickupDefinition {
    const pickup = this.all[index];
    if (pickup === undefined) {
      throw new RangeError(`No pickup definition at index ${String(index)}`);
    }
    return pickup;
  }

  /** The pickup with an id. Throws, because a missing id is a content bug. */
  get(id: string): PickupDefinition {
    const index = this.indexOf(id);
    if (index < 0) {
      throw new Error(`No pickup definition with id "${id}"`);
    }
    return this.at(index);
  }
}
