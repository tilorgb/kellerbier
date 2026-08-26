import type { GameSim } from '../game/sim.js';
import type { StatId } from '../stats/definition.js';
import type { ModifierOp } from '../stats/modifiers.js';

/**
 * The shape an item is authored in (#26, `docs/GAME_DESIGN.md` §8).
 *
 * An item is **data plus hooks**: everything that is not a number or a string
 * on this type is a small function, invoked by the engine at a named moment
 * — a shot fired, a hit landed, a kill, a room cleared — rather than an item
 * reaching out and calling engine code itself. That is what the acceptance
 * criteria means by "an item can be added purely as data plus one hook
 * function": a new item is one object literal in `src/content/items/`, never
 * a change to a system.
 *
 * Unlike an enemy (`sim/enemy/definition.ts`), whose behaviour is built from
 * named primitives the engine interprets, an item's hooks are real functions.
 * The design doc calls this out by name ("An item is data plus hooks"), and
 * the combinatorial space — up to nine hook points, each item free to use any
 * subset — is exactly the case #7's "twelve primitives" approach does not
 * scale to: a primitive per possible item effect is a primitive added every
 * time #29 authors one, which is the failure mode the enemy format exists to
 * avoid for enemies and would reintroduce here. The architecture lint rule's
 * `content-is-data` check still holds: a hook function's *body* may only call
 * back into what it is handed through `ItemHookContext` (chiefly `sim`,
 * typed structurally, not imported) — the file itself imports nothing but
 * types, so adding an item is still, mechanically, a data change, and the
 * hook functions are values inside that data rather than a module import.
 *
 * `modifyStats` is deliberately the odd one out: it takes no `sim` and
 * returns data (`ItemStatModifier[]`) instead of calling anything, so it
 * stays pure and inspectable without a running simulation — resolved through
 * the stat pipeline (`docs/DECISIONS.md` #14) exactly like Promille's
 * modifiers, under the source key `item:<id>` (`itemStatSourceKey`).
 */

/** Where an item can be found. `docs/GAME_DESIGN.md` §8's exact list. */
export const ITEM_POOLS = [
  'treasure',
  'shop',
  'boss',
  'devil',
  'angel',
  'secret',
  'curse',
] as const;
export type ItemPoolId = (typeof ITEM_POOLS)[number];

/**
 * How rare/powerful an item is, Isaac's own "quality" convention: 0 is the
 * weakest tier, 3 the strongest. No named tiers exist in the design docs yet
 * — #29 (authoring the first 25 items) is where a real curve gets tuned — so
 * this stays a plain number rather than inventing names to reword.
 */
export type ItemQuality = 0 | 1 | 2 | 3;

/**
 * Whether an item requires (or forbids) Promille to be raised. `any` needs
 * nothing; `sober` never appears once Promille is unlocked and non-zero is
 * possible; `rausch` never appears in a sober run. Filtering the pool by this
 * field is #32's job — #26 only has to make the field exist and be honest
 * data, per DECISIONS.md §9's "drop tables and item pools are selectable per
 * run state, which is a reason for both to be data."
 */
export type PromilleRequirement = 'any' | 'sober' | 'rausch';

/** A `modifyStats` hook's output — a `StatModifier` missing its `source`, which the engine fills in. */
export interface ItemStatModifier {
  readonly stat: StatId;
  readonly op: ModifierOp;
  readonly value: number;
}

/**
 * Per-run, per-item state: how many copies are held, and (for an active item)
 * how much charge it has banked. Allocated once per item id when the
 * `ItemRegistry` is built (`ItemInventory`'s constructor), never per pickup —
 * picking an item up a second time bumps `count` on the same object rather
 * than allocating a new one.
 */
export interface ItemRuntimeState {
  count: number;
  charge: number;
  /**
   * A second scratch number, free for a hook to use however it needs.
   * `charge` already carries the active-item meter's meaning, and a passive
   * item is free to borrow it as its own single counter (several of #29's
   * do) — but the first items whose *passive* behaviour needs two
   * independent numbers at once (a decay countdown alongside a stack count,
   * say) showed up in that same batch, which is what this field is for.
   * Reset to 0 alongside `charge` whenever the last copy of a stack leaves
   * the inventory (`ItemInventory.remove`), for the same "losing an item
   * returns it to exactly the prior state" reason `charge` already resets
   * for.
   */
  timer: number;
}

/**
 * What every hook function receives. Structural, not nominal: this file
 * never imports a value from `sim/game/sim.ts`, only its type (erased at
 * compile time, so there is no runtime import cycle even though `GameSim`
 * itself imports `ItemRegistry`/`ItemInventory`), and `GameSim` is handed to
 * hooks exactly as it is — the same access an engine-owned system already
 * has, because an item hook *is* effectively a tiny system, just one an
 * author writes per item instead of per feature.
 */
export interface ItemHookContext {
  readonly sim: GameSim;
  readonly itemId: string;
  readonly state: ItemRuntimeState;
}

export type ModifyStatsHook = (state: ItemRuntimeState) => readonly ItemStatModifier[];
export type ItemHook = (ctx: ItemHookContext) => void;
export type ItemShootHook = (
  ctx: ItemHookContext & { readonly directionX: number; readonly directionY: number },
) => void;
export type ItemProjectileSpawnHook = (
  ctx: ItemHookContext & { readonly projectile: number },
) => void;
export type ItemHitHook = (
  ctx: ItemHookContext & {
    readonly target: number;
    readonly damage: number;
    readonly hitX: number;
    readonly hitY: number;
  },
) => void;
export type ItemKillHook = (ctx: ItemHookContext & { readonly target: number }) => void;
export type ItemDamageTakenHook = (ctx: ItemHookContext & { readonly amount: number }) => void;
export type ItemFloorStartHook = (ctx: ItemHookContext & { readonly floor: number }) => void;
/**
 * Fires when a Bierfassl the player is standing near goes off (#29,
 * `sim/systems/bombs.ts`'s `explode`) — the moment `Fassldauben` needs to add
 * its staves to the blast. Not in #26's original nine; a bomb detonating
 * turned out to be exactly the kind of named moment the others are, so it
 * gets the same broadcast-to-every-held-item treatment rather than a
 * bomb-specific special case.
 */
export type ItemBombDetonateHook = (
  ctx: ItemHookContext & { readonly x: number; readonly y: number },
) => void;

/**
 * Fires when the player collects a beer pickup — a `promille`-kind
 * `PickupEffect` (`sim/pickup/definition.ts`), the one pickup that raises
 * Promille — from `sim/systems/pickup.ts`'s `collect`. Added for #32's
 * Konterbier ("drinking while hungover clears the Kater"), the first item
 * whose effect depends on *which* pickup was just collected rather than on
 * a hit, a kill or a tick passing; named for the event a beer being drunk
 * is, not for Konterbier itself, the same reasoning `onBombDetonate` (added
 * for Fassldauben) is named for a Bierfassl going off rather than for that
 * item.
 */
export type ItemBeerPickupHook = ItemHook;

/**
 * Every hook an item can declare, per `docs/GAME_DESIGN.md` §8's list plus
 * `onPickup`/`onRemove` (the pairing acceptance criterion #4 — "picking up
 * and losing an item returns the player to exactly the prior state" — needs
 * a place to hang non-stat setup/teardown on) and `onActivate` (what an
 * active item's button press runs). All optional: an item that only touches
 * `modifyStats` declares nothing else, and dispatch skips a hook an item
 * never defined without a per-tick existence check anywhere but the one
 * `!== undefined` at the call site.
 */
export interface ItemHooks {
  readonly modifyStats?: ModifyStatsHook;
  readonly onPickup?: ItemHook;
  /** Fires only when the last copy of a stack leaves the inventory — see `ItemInventory.remove`. */
  readonly onRemove?: ItemHook;
  readonly onShoot?: ItemShootHook;
  readonly onProjectileSpawn?: ItemProjectileSpawnHook;
  readonly onHit?: ItemHitHook;
  readonly onKill?: ItemKillHook;
  readonly onDamageTaken?: ItemDamageTakenHook;
  readonly onRoomClear?: ItemHook;
  readonly onFloorStart?: ItemFloorStartHook;
  readonly onTick?: ItemHook;
  /** Runs once when an active item is used — see `GameSim.useActiveItem`. */
  readonly onActivate?: ItemHook;
  readonly onBombDetonate?: ItemBombDetonateHook;
  /** See `ItemBeerPickupHook`. */
  readonly onBeerPickup?: ItemBeerPickupHook;
}

/**
 * An active item's charge bar. Absent on `ItemDefinition.active` means the
 * item is passive — held, contributing its hooks, with nothing to press.
 */
export interface ActiveItemDefinition {
  /** Charge needed before `GameSim.useActiveItem` will fire `onActivate`. */
  readonly maxCharge: number;
  /** Single-use: removed from the inventory the instant it activates. */
  readonly consumable?: boolean;
}

/** The `StatPipeline` source key an item's `modifyStats` output registers under. */
export function itemStatSourceKey(id: string): string {
  return `item:${id}`;
}

export interface ItemDefinition {
  /** Unique, lower case, no spaces. Used by pools, saves and the debug overlay. */
  readonly id: string;
  /** The name a player would see. German, per docs/CONTENT_BIBLE.md. */
  readonly name: string;
  /**
   * A short, plain-language translation of what it does — "Damage +1 per
   * stack", not a sentence of flavour text. Shown alongside `name` on the
   * pickup toast (`GameSim.pickupToast`/`reportCollected`), the same
   * short-and-literal convention `PickupDefinition.description` uses.
   */
  readonly description: string;
  /**
   * Funny, in-character text — #29's "flavour text that is funny" acceptance
   * criterion. Never shown by any system yet (that is #58's job); it exists
   * now so it is authored alongside the item rather than bolted on after the
   * fact, the same reason a localisation key is reserved on day one even
   * before #52 wires up the layer that reads it.
   */
  readonly flavourText?: string;
  /** Placeholder-art key until real icons exist (#34), same convention as `PickupDefinition.label`. */
  readonly sprite: string;
  /** Which pools (`docs/GAME_DESIGN.md` §8) this item can be offered from. At least one. */
  readonly pools: readonly ItemPoolId[];
  readonly quality: ItemQuality;
  readonly promilleRequirement: PromilleRequirement;
  /** Free-form, for #27's projectile tag composition and future filtering. Defaults to none. */
  readonly tags?: readonly string[];
  readonly active?: ActiveItemDefinition;
  readonly hooks?: ItemHooks;
}
