import type { GameSim } from '../game/sim.js';
import type { ItemRuntimeState } from '../item/definition.js';

/**
 * Item hook dispatch: broadcasting one of the nine hooks
 * (`docs/GAME_DESIGN.md` §8) to every held item, in the deterministic order
 * `ItemInventory.forEachHeld` walks.
 *
 * `onPickup`/`onRemove`/`onActivate` are not here — those target exactly one
 * item (the one just picked up, lost or activated) rather than broadcasting,
 * so `GameSim` calls them directly at the one call site each happens.
 *
 * @hot `stepItemTick` runs once a tick and its 40-item budget (#26 acceptance
 * criteria: under 0.5 ms for 40 held items) is the reason for the module-level
 * scratch object below rather than a fresh context per item per tick. The
 * event-driven dispatches (`dispatchItemHit` and friends) run far less often
 * — once per shot, hit or kill rather than once a tick per item — but share
 * the same scratch for one reason rather than two: a single object shape V8
 * can keep monomorphic, instead of nine.
 */

/**
 * The one context object every hook call reuses. Its extra fields (beyond
 * `ItemHookContext`) are relevant to some hooks and not others — `onTick`
 * never reads `damage`, `onHit` never reads `floor` — which is fine, since a
 * hook's own parameter type only names the fields it actually uses and this
 * object always structurally satisfies it. `sim` and `state` are cast in at
 * module init because a real value only exists once dispatch is running; both
 * are overwritten before any hook can observe them.
 */
interface DispatchScratch {
  sim: GameSim;
  itemId: string;
  state: ItemRuntimeState;
  directionX: number;
  directionY: number;
  projectile: number;
  target: number;
  damage: number;
  hitX: number;
  hitY: number;
  amount: number;
  floor: number;
}

const scratch: DispatchScratch = {
  sim: null as unknown as GameSim,
  itemId: '',
  state: { count: 0, charge: 0 },
  directionX: 0,
  directionY: 0,
  projectile: 0,
  target: 0,
  damage: 0,
  hitX: 0,
  hitY: 0,
  amount: 0,
  floor: 0,
};

/** Set for the duration of one dispatch call, same pattern as `impact.ts`'s `collectSim`. */
let dispatchSim: GameSim | null = null;

function visitTick(index: number, state: ItemRuntimeState): void {
  const sim = dispatchSim;
  if (sim === null) {
    return;
  }
  const item = sim.items.at(index);
  const hook = item.hooks.onTick;
  if (hook === undefined) {
    return;
  }
  scratch.itemId = item.id;
  scratch.state = state;
  hook(scratch);
}

/** Advances every held item's `onTick` hook by one tick. */
export function stepItemTick(sim: GameSim): void {
  dispatchSim = sim;
  scratch.sim = sim;
  sim.inventory.forEachHeld(visitTick);
  dispatchSim = null;
}

function visitShoot(index: number, state: ItemRuntimeState): void {
  const sim = dispatchSim;
  if (sim === null) {
    return;
  }
  const item = sim.items.at(index);
  const hook = item.hooks.onShoot;
  if (hook === undefined) {
    return;
  }
  scratch.itemId = item.id;
  scratch.state = state;
  hook(scratch);
}

/** Fires when the player fires — see `sim/systems/shooting.ts`'s `fire`. */
export function dispatchItemShoot(sim: GameSim, directionX: number, directionY: number): void {
  dispatchSim = sim;
  scratch.sim = sim;
  scratch.directionX = directionX;
  scratch.directionY = directionY;
  sim.inventory.forEachHeld(visitShoot);
  dispatchSim = null;
}

function visitProjectileSpawn(index: number, state: ItemRuntimeState): void {
  const sim = dispatchSim;
  if (sim === null) {
    return;
  }
  const item = sim.items.at(index);
  const hook = item.hooks.onProjectileSpawn;
  if (hook === undefined) {
    return;
  }
  scratch.itemId = item.id;
  scratch.state = state;
  hook(scratch);
}

/** Fires once a projectile the player fired actually enters the world. */
export function dispatchItemProjectileSpawn(sim: GameSim, projectile: number): void {
  dispatchSim = sim;
  scratch.sim = sim;
  scratch.projectile = projectile;
  sim.inventory.forEachHeld(visitProjectileSpawn);
  dispatchSim = null;
}

function visitHit(index: number, state: ItemRuntimeState): void {
  const sim = dispatchSim;
  if (sim === null) {
    return;
  }
  const item = sim.items.at(index);
  const hook = item.hooks.onHit;
  if (hook === undefined) {
    return;
  }
  scratch.itemId = item.id;
  scratch.state = state;
  hook(scratch);
}

/** Fires when a player shot (or blast) lands on something that isn't the player — see `sim/systems/impact.ts`. */
export function dispatchItemHit(
  sim: GameSim,
  target: number,
  damage: number,
  hitX: number,
  hitY: number,
): void {
  dispatchSim = sim;
  scratch.sim = sim;
  scratch.target = target;
  scratch.damage = damage;
  scratch.hitX = hitX;
  scratch.hitY = hitY;
  sim.inventory.forEachHeld(visitHit);
  dispatchSim = null;
}

function visitKill(index: number, state: ItemRuntimeState): void {
  const sim = dispatchSim;
  if (sim === null) {
    return;
  }
  const item = sim.items.at(index);
  const hook = item.hooks.onKill;
  if (hook === undefined) {
    return;
  }
  scratch.itemId = item.id;
  scratch.state = state;
  hook(scratch);
}

/** Fires when a hit the player caused kills something that isn't the player. */
export function dispatchItemKill(sim: GameSim, target: number): void {
  dispatchSim = sim;
  scratch.sim = sim;
  scratch.target = target;
  sim.inventory.forEachHeld(visitKill);
  dispatchSim = null;
}

function visitDamageTaken(index: number, state: ItemRuntimeState): void {
  const sim = dispatchSim;
  if (sim === null) {
    return;
  }
  const item = sim.items.at(index);
  const hook = item.hooks.onDamageTaken;
  if (hook === undefined) {
    return;
  }
  scratch.itemId = item.id;
  scratch.state = state;
  hook(scratch);
}

/** Fires whenever the player takes damage, from a shot or from contact. */
export function dispatchItemDamageTaken(sim: GameSim, amount: number): void {
  dispatchSim = sim;
  scratch.sim = sim;
  scratch.amount = amount;
  sim.inventory.forEachHeld(visitDamageTaken);
  dispatchSim = null;
}

function visitRoomClear(index: number, state: ItemRuntimeState): void {
  const sim = dispatchSim;
  if (sim === null) {
    return;
  }
  const item = sim.items.at(index);
  const hook = item.hooks.onRoomClear;
  if (hook === undefined) {
    return;
  }
  scratch.itemId = item.id;
  scratch.state = state;
  hook(scratch);
}

/** Fires the tick a room's last enemy dies — see `GameSim.step`. Once per room, never re-fired on re-entry. */
export function dispatchItemRoomClear(sim: GameSim): void {
  dispatchSim = sim;
  scratch.sim = sim;
  sim.inventory.forEachHeld(visitRoomClear);
  dispatchSim = null;
}

function visitFloorStart(index: number, state: ItemRuntimeState): void {
  const sim = dispatchSim;
  if (sim === null) {
    return;
  }
  const item = sim.items.at(index);
  const hook = item.hooks.onFloorStart;
  if (hook === undefined) {
    return;
  }
  scratch.itemId = item.id;
  scratch.state = state;
  hook(scratch);
}

/** Fires the first room loaded on a new floor — see `GameSim.applyCompiledRoom`. */
export function dispatchItemFloorStart(sim: GameSim, floor: number): void {
  dispatchSim = sim;
  scratch.sim = sim;
  scratch.floor = floor;
  sim.inventory.forEachHeld(visitFloorStart);
  dispatchSim = null;
}
