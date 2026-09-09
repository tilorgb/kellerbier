import type { GameSim } from '../game/sim.js';
import { PromilleTier, type PromilleTierId, promilleRequirementMet } from '../game/promille.js';
import type { ItemRuntimeState } from '../item/definition.js';

/**
 * Item hook dispatch: broadcasting one of the ten hooks
 * (`docs/GAME_DESIGN.md` §8, plus `onBombDetonate` and `onBeerPickup`) to
 * every held item, in the deterministic order `ItemInventory.forEachHeld`
 * walks.
 *
 * `onPickup`/`onRemove`/`onActivate` are not here — those target exactly one
 * item (the one just picked up, lost or activated) rather than broadcasting,
 * so `GameSim` calls them directly at the one call site each happens.
 *
 * #32's Promille gate lives here too, for every hook broadcast in this file:
 * a `sober`/`rausch` item's hook is simply never called on a tick its
 * requirement is not met, which is what "activating and deactivating as the
 * meter crosses tier boundaries" means at the engine level — no per-item
 * check, because an item that never checks `ctx.sim.promille` at all (most
 * of them) still turns off correctly. `onPickup`/`onRemove` are deliberately
 * exempt (they are not dispatched from here at all) so that losing an item
 * always tears down exactly what picking it up set up, regardless of the
 * tier at the moment it is lost — `ItemRuntimeState`'s own doc comment is the
 * "prior state exactly" invariant this preserves. `scratch.tier` is read
 * once per dispatch call, not once per item inside `forEachHeld` — the tier
 * cannot change mid-dispatch, and re-deriving it per item would be exactly
 * the kind of per-item work the 40-item tick budget below has no room for.
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
  x: number;
  y: number;
  /** This dispatch call's Promille tier — set once per `dispatchItemXxx` call, read by every `visitXxx` it drives. See the module doc comment. */
  tier: PromilleTierId;
}

const scratch: DispatchScratch = {
  sim: null as unknown as GameSim,
  itemId: '',
  state: { count: 0, charge: 0, timer: 0 },
  directionX: 0,
  directionY: 0,
  projectile: 0,
  target: 0,
  damage: 0,
  hitX: 0,
  hitY: 0,
  amount: 0,
  floor: 0,
  x: 0,
  y: 0,
  tier: PromilleTier.Nuchtern,
};

/** Set for the duration of one dispatch call, same pattern as `impact.ts`'s `collectSim`. */
let dispatchSim: GameSim | null = null;

/**
 * Dispatch is re-entrant, and this is what makes it so.
 *
 * A hook may itself cause a dispatch: `onShoot` spawning a companion shot
 * through `GameSim.spawnItemProjectile` runs `dispatchItemProjectileSpawn`
 * for every held item *from inside* the outer `onShoot` broadcast, and
 * `onTick` (a familiar firing) does the same. Before this existed, the
 * nested call's exit set `dispatchSim` back to `null` and overwrote the one
 * shared `scratch` — so every item sorted after the spawning one lost its
 * hook for that broadcast (`visitShoot`'s `sim === null` early return),
 * and the spawning hook itself came back to a `ctx.state` belonging to
 * whichever item the nested pass visited last. With Spezi and
 * Braumeister-Visier the only spawners that was a once-in-five-shots skip
 * nobody noticed; the 2026-09 item pass made spawning from a hook the
 * normal case (`docs/DECISIONS.md` #84) and a fan of three came out as one.
 *
 * So each `dispatchItemXxx` saves the fields it is about to overwrite into
 * a fixed frame on entry and restores them on exit. A preallocated stack of
 * frames rather than locals per function, because eleven dispatchers each
 * saving fourteen fields by hand is exactly the copy-paste that drifts; and
 * fixed-depth rather than growable so the hot path (`stepItemTick`, once a
 * tick) allocates nothing.
 *
 * `MAX_DEPTH` used to be 8, sized for one item recursing into itself two
 * deep (a hook spawns, the spawn dispatches) — the shape a single buggy
 * item takes. #314's synergy fuzz sweep found that assumption wrong for a
 * *combination* of items: a 25-item build can easily hold several different
 * spawner items (Spezi, Braumeister-Visier and friends — see above), each
 * one's spawn dispatching into the next one's hook, and that chain nests
 * once per spawner in play rather than twice total. Measured against the
 * full 10,000-combination sweep, the deepest a real (non-buggy) chain
 * reached needed more than 32 but no more than 48; 64 leaves real headroom
 * above that without giving up the guard's actual job, which is still
 * exactly what it was: catching a hook that is *unboundedly* re-entering
 * itself, not a large-but-finite fan of legitimately spawning items.
 */
const MAX_DEPTH = 64;
interface SavedFrame {
  sim: GameSim | null;
  itemId: string;
  state: ItemRuntimeState;
  tier: PromilleTierId;
  directionX: number;
  directionY: number;
  projectile: number;
  target: number;
  damage: number;
  hitX: number;
  hitY: number;
  amount: number;
  floor: number;
  x: number;
  y: number;
}
// Built with a module-level loop rather than `Array.from` and a factory: the
// object literal has to sit at top level for `no-hot-allocation` to read it
// as a one-time preallocation rather than a per-call one, and `MAX_DEPTH`
// frames are exactly that. `depthSlot` is a typed-array cell for the same
// rule's reason — a module-level `let` holding a number boxes on every store.
const SAVED: SavedFrame[] = [];
while (SAVED.length < MAX_DEPTH) {
  SAVED.push({
    sim: null,
    itemId: '',
    state: scratch.state,
    tier: PromilleTier.Nuchtern,
    directionX: 0,
    directionY: 0,
    projectile: 0,
    target: 0,
    damage: 0,
    hitX: 0,
    hitY: 0,
    amount: 0,
    floor: 0,
    x: 0,
    y: 0,
  });
}
const depthSlot = new Int32Array(1);

/** Saves the in-flight dispatch (if any) and points the scratch at `sim`. Pair with `endDispatch`. */
function beginDispatch(sim: GameSim): void {
  const depth = depthSlot[0] ?? 0;
  const frame = SAVED[depth];
  if (frame === undefined) {
    throw new Error(
      `item hook dispatch nested more than ${String(MAX_DEPTH)} deep — a hook is dispatching itself`,
    );
  }
  depthSlot[0] = depth + 1;
  frame.sim = dispatchSim;
  frame.itemId = scratch.itemId;
  frame.state = scratch.state;
  frame.tier = scratch.tier;
  frame.directionX = scratch.directionX;
  frame.directionY = scratch.directionY;
  frame.projectile = scratch.projectile;
  frame.target = scratch.target;
  frame.damage = scratch.damage;
  frame.hitX = scratch.hitX;
  frame.hitY = scratch.hitY;
  frame.amount = scratch.amount;
  frame.floor = scratch.floor;
  frame.x = scratch.x;
  frame.y = scratch.y;
  dispatchSim = sim;
  scratch.sim = sim;
  scratch.tier = sim.promilleTier;
}

/** Restores whatever dispatch was in flight before the matching `beginDispatch`. */
function endDispatch(): void {
  const depth = (depthSlot[0] ?? 1) - 1;
  depthSlot[0] = depth;
  const frame = SAVED[depth];
  if (frame === undefined) {
    return;
  }
  dispatchSim = frame.sim;
  if (frame.sim !== null) {
    scratch.sim = frame.sim;
  }
  scratch.itemId = frame.itemId;
  scratch.state = frame.state;
  scratch.tier = frame.tier;
  scratch.directionX = frame.directionX;
  scratch.directionY = frame.directionY;
  scratch.projectile = frame.projectile;
  scratch.target = frame.target;
  scratch.damage = frame.damage;
  scratch.hitX = frame.hitX;
  scratch.hitY = frame.hitY;
  scratch.amount = frame.amount;
  scratch.floor = frame.floor;
  scratch.x = frame.x;
  scratch.y = frame.y;
}

/**
 * Drops the dispatch depth (and the in-flight `dispatchSim`) back to zero.
 * `beginDispatch`/`endDispatch` are now paired with `try`/`finally` at every
 * dispatch site, so a throwing hook can no longer leave `depthSlot` raised
 * for the next `GameSim` in the process — but `depthSlot` is still
 * module-level state shared by every sim the fuzz harness and playtest
 * sweep build, so `GameSim`'s constructor calls this anyway as a per-run
 * reset: belt and braces against whatever the next bug in this shape turns
 * out to be (#314).
 */
export function resetItemDispatchState(): void {
  depthSlot[0] = 0;
  dispatchSim = null;
}

function visitTick(index: number, state: ItemRuntimeState): void {
  const sim = dispatchSim;
  if (sim === null) {
    return;
  }
  const item = sim.items.at(index);
  if (!promilleRequirementMet(item.promilleRequirement, scratch.tier)) {
    return;
  }
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
  beginDispatch(sim);
  try {
    sim.inventory.forEachHeld(visitTick);
  } finally {
    endDispatch();
  }
}

function visitShoot(index: number, state: ItemRuntimeState): void {
  const sim = dispatchSim;
  if (sim === null) {
    return;
  }
  const item = sim.items.at(index);
  if (!promilleRequirementMet(item.promilleRequirement, scratch.tier)) {
    return;
  }
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
  beginDispatch(sim);
  try {
    scratch.directionX = directionX;
    scratch.directionY = directionY;
    sim.inventory.forEachHeld(visitShoot);
  } finally {
    endDispatch();
  }
}

function visitProjectileSpawn(index: number, state: ItemRuntimeState): void {
  const sim = dispatchSim;
  if (sim === null) {
    return;
  }
  const item = sim.items.at(index);
  if (!promilleRequirementMet(item.promilleRequirement, scratch.tier)) {
    return;
  }
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
  beginDispatch(sim);
  try {
    scratch.projectile = projectile;
    sim.inventory.forEachHeld(visitProjectileSpawn);
  } finally {
    endDispatch();
  }
}

function visitHit(index: number, state: ItemRuntimeState): void {
  const sim = dispatchSim;
  if (sim === null) {
    return;
  }
  const item = sim.items.at(index);
  if (!promilleRequirementMet(item.promilleRequirement, scratch.tier)) {
    return;
  }
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
  beginDispatch(sim);
  try {
    scratch.target = target;
    scratch.damage = damage;
    scratch.hitX = hitX;
    scratch.hitY = hitY;
    sim.inventory.forEachHeld(visitHit);
  } finally {
    endDispatch();
  }
}

function visitKill(index: number, state: ItemRuntimeState): void {
  const sim = dispatchSim;
  if (sim === null) {
    return;
  }
  const item = sim.items.at(index);
  if (!promilleRequirementMet(item.promilleRequirement, scratch.tier)) {
    return;
  }
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
  beginDispatch(sim);
  try {
    scratch.target = target;
    sim.inventory.forEachHeld(visitKill);
  } finally {
    endDispatch();
  }
}

function visitDamageTaken(index: number, state: ItemRuntimeState): void {
  const sim = dispatchSim;
  if (sim === null) {
    return;
  }
  const item = sim.items.at(index);
  if (!promilleRequirementMet(item.promilleRequirement, scratch.tier)) {
    return;
  }
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
  beginDispatch(sim);
  try {
    scratch.amount = amount;
    sim.inventory.forEachHeld(visitDamageTaken);
  } finally {
    endDispatch();
  }
}

function visitRoomClear(index: number, state: ItemRuntimeState): void {
  const sim = dispatchSim;
  if (sim === null) {
    return;
  }
  const item = sim.items.at(index);
  if (!promilleRequirementMet(item.promilleRequirement, scratch.tier)) {
    return;
  }
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
  beginDispatch(sim);
  try {
    sim.inventory.forEachHeld(visitRoomClear);
  } finally {
    endDispatch();
  }
}

function visitFloorStart(index: number, state: ItemRuntimeState): void {
  const sim = dispatchSim;
  if (sim === null) {
    return;
  }
  const item = sim.items.at(index);
  if (!promilleRequirementMet(item.promilleRequirement, scratch.tier)) {
    return;
  }
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
  beginDispatch(sim);
  try {
    scratch.floor = floor;
    sim.inventory.forEachHeld(visitFloorStart);
  } finally {
    endDispatch();
  }
}

function visitBombDetonate(index: number, state: ItemRuntimeState): void {
  const sim = dispatchSim;
  if (sim === null) {
    return;
  }
  const item = sim.items.at(index);
  if (!promilleRequirementMet(item.promilleRequirement, scratch.tier)) {
    return;
  }
  const hook = item.hooks.onBombDetonate;
  if (hook === undefined) {
    return;
  }
  scratch.itemId = item.id;
  scratch.state = state;
  hook(scratch);
}

/** Fires when a Bierfassl goes off — see `sim/systems/bombs.ts`'s `explode`. */
export function dispatchItemBombDetonate(sim: GameSim, x: number, y: number): void {
  beginDispatch(sim);
  try {
    scratch.x = x;
    scratch.y = y;
    sim.inventory.forEachHeld(visitBombDetonate);
  } finally {
    endDispatch();
  }
}

function visitBeerPickup(index: number, state: ItemRuntimeState): void {
  const sim = dispatchSim;
  if (sim === null) {
    return;
  }
  const item = sim.items.at(index);
  if (!promilleRequirementMet(item.promilleRequirement, scratch.tier)) {
    return;
  }
  const hook = item.hooks.onBeerPickup;
  if (hook === undefined) {
    return;
  }
  scratch.itemId = item.id;
  scratch.state = state;
  hook(scratch);
}

/**
 * Fires when the player collects a beer pickup (a `promille`-kind
 * `PickupEffect`) — see `sim/systems/pickup.ts`'s `collect`. Added for #32's
 * Konterbier; see `ItemBeerPickupHook`'s doc comment for why this is its own
 * named event rather than that item reaching into `pickup.ts` itself.
 */
export function dispatchItemBeerPickup(sim: GameSim): void {
  beginDispatch(sim);
  try {
    sim.inventory.forEachHeld(visitBeerPickup);
  } finally {
    endDispatch();
  }
}

function visitLethalDamage(index: number, state: ItemRuntimeState): void {
  const sim = dispatchSim;
  if (sim === null) {
    return;
  }
  const item = sim.items.at(index);
  if (!promilleRequirementMet(item.promilleRequirement, scratch.tier)) {
    return;
  }
  const hook = item.hooks.onLethalDamage;
  if (hook === undefined) {
    return;
  }
  scratch.itemId = item.id;
  scratch.state = state;
  hook(scratch);
}

/**
 * Fires from `GameSim.applyPlayerDamage`'s lethal branch, once an eternal
 * heart has already been ruled out — see `ItemLethalDamageHook`'s doc
 * comment. `GameSim` checks `blutwurzActive` right after this call to
 * decide whether the death still needs to proceed.
 */
export function dispatchItemLethalDamage(sim: GameSim): void {
  beginDispatch(sim);
  try {
    sim.inventory.forEachHeld(visitLethalDamage);
  } finally {
    endDispatch();
  }
}
