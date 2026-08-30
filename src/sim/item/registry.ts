import {
  type ActiveItemDefinition,
  type ItemDefinition,
  type ItemHooks,
  type ItemPoolId,
  type ItemQuality,
  ITEM_POOLS,
  type PromilleRequirement,
} from './definition.js';

/** An `ItemDefinition` with its defaults filled in and its id resolved to an index. */
export interface CompiledItem {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly flavourText: string;
  readonly sprite: string;
  readonly pools: readonly ItemPoolId[];
  readonly quality: ItemQuality;
  readonly promilleRequirement: PromilleRequirement;
  /**
   * `ItemDefinition.needsPromille` with its default filled in — the single
   * field `itemEligibleForOffer` reads to keep a Promille item out of a
   * sober run's pools, so neither it nor any other consumer has to remember
   * that a tier-gated item implies this too.
   */
  readonly needsPromille: boolean;
  readonly tags: readonly string[];
  readonly active: ActiveItemDefinition | undefined;
  readonly hooks: ItemHooks;
}

const VALID_POOLS = new Set<string>(ITEM_POOLS);
const VALID_PROMILLE_REQUIREMENTS = new Set<PromilleRequirement>(['any', 'sober', 'rausch']);

/**
 * Item data, checked once and turned into something dispatch can read fast.
 *
 * Sorted by `id` at construction — never by declaration order, and never
 * touched again after that — which is the entire mechanism behind
 * deterministic hook ordering (#26's acceptance criteria, and the issue's own
 * note: "sort by a stable item id, not by acquisition order"). Two items
 * both modifying the same stat resolve in the same order regardless of which
 * was picked up first, so a seeded run never diverges on pickup order.
 * `ItemInventory` relies on this: it keeps the ids a run actually holds in
 * registry-index order, which by construction is id order.
 */
export class ItemRegistry {
  readonly all: readonly CompiledItem[];

  private readonly byId = new Map<string, number>();

  constructor(definitions: readonly ItemDefinition[]) {
    const sorted = [...definitions].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    for (const definition of sorted) {
      this.validate(definition);
      if (this.byId.has(definition.id)) {
        throw new Error(`Two items share the id "${definition.id}"`);
      }
      this.byId.set(definition.id, this.byId.size);
    }
    this.all = sorted.map((definition) => this.compile(definition));
  }

  get count(): number {
    return this.all.length;
  }

  /** The index of an item by id, or -1. Indices are what `ItemInventory` stores. */
  indexOf(id: string): number {
    return this.byId.get(id) ?? -1;
  }

  /** The item at an index. Throws rather than returning a half-item. */
  at(index: number): CompiledItem {
    const item = this.all[index];
    if (item === undefined) {
      throw new RangeError(`No item definition at index ${String(index)}`);
    }
    return item;
  }

  /** The item with an id. Throws, because a missing id is a content bug. */
  get(id: string): CompiledItem {
    const index = this.indexOf(id);
    if (index < 0) {
      throw new Error(`No item definition with id "${id}"`);
    }
    return this.at(index);
  }

  private validate(definition: ItemDefinition): void {
    const where = `item "${definition.id}"`;
    if (definition.id.trim() === '' || definition.id !== definition.id.toLowerCase()) {
      throw new Error(`${where} must have a non-empty, lower-case id`);
    }
    if (definition.id.includes(' ')) {
      throw new Error(`${where} must not contain spaces`);
    }
    if (definition.name.trim() === '') {
      throw new Error(`${where} must have a name`);
    }
    if (definition.description.trim() === '') {
      throw new Error(`${where} must have a description`);
    }
    if (definition.pools.length === 0) {
      throw new Error(`${where} declares no pools — it could never be offered to a run`);
    }
    for (const pool of definition.pools) {
      if (!VALID_POOLS.has(pool)) {
        throw new Error(`${where} declares the unknown pool "${pool}"`);
      }
    }
    if (!Number.isInteger(definition.quality) || definition.quality < 0 || definition.quality > 3) {
      throw new Error(`${where} has an invalid quality "${String(definition.quality)}" (0-3)`);
    }
    if (!VALID_PROMILLE_REQUIREMENTS.has(definition.promilleRequirement)) {
      throw new Error(
        `${where} has an unknown Promille requirement "${definition.promilleRequirement}"`,
      );
    }
    if (definition.needsPromille === false && definition.promilleRequirement !== 'any') {
      throw new Error(
        `${where} is gated on Promille ("${definition.promilleRequirement}") but declares ` +
          `needsPromille: false — an item that needs a tier needs the meter that has tiers`,
      );
    }
    if (definition.active !== undefined) {
      if (!(definition.active.maxCharge > 0) || !Number.isInteger(definition.active.maxCharge)) {
        throw new Error(
          `${where} is active but its maxCharge is not a positive integer ` +
            `(got ${String(definition.active.maxCharge)})`,
        );
      }
    }
  }

  private compile(definition: ItemDefinition): CompiledItem {
    return {
      id: definition.id,
      name: definition.name,
      description: definition.description,
      flavourText: definition.flavourText ?? '',
      sprite: definition.sprite,
      pools: definition.pools,
      quality: definition.quality,
      promilleRequirement: definition.promilleRequirement,
      needsPromille: definition.needsPromille ?? definition.promilleRequirement !== 'any',
      tags: definition.tags ?? [],
      active: definition.active,
      hooks: definition.hooks ?? {},
    };
  }
}
