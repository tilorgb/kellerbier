import type { ItemRuntimeState } from './definition.js';
import type { ItemRegistry } from './registry.js';

/**
 * Which items a run holds, and in what order dispatch visits them.
 *
 * Storage is fixed at `registry.count` and allocated once at construction —
 * the largest an inventory could ever be is "every item that exists" — so
 * picking up and losing items never grows an array mid-run. `states` holds
 * one `ItemRuntimeState` per registry slot, allocated up front for the same
 * reason: a pickup bumps `count` on the object that already exists for that
 * id rather than allocating a fresh one.
 *
 * `heldOrder` is the mechanism behind deterministic hook ordering: it always
 * holds the currently-held items' registry indices in ascending order, which
 * — because `ItemRegistry` sorts by id at construction — is also id order,
 * regardless of the order items were picked up in. Insertion and removal are
 * an insertion-sort/shift over at most `registry.count` entries, which is
 * cheap at the scale this ever runs (picking up or losing one item, not a
 * per-tick operation) and keeps `forEachHeld` a plain forward walk with no
 * sort-on-read.
 */
export class ItemInventory {
  private readonly heldOrder: Int32Array;
  private heldCount = 0;
  private readonly isHeld: Uint8Array;
  private readonly states: ItemRuntimeState[];

  constructor(registry: ItemRegistry) {
    this.heldOrder = new Int32Array(registry.count);
    this.isHeld = new Uint8Array(registry.count);
    this.states = [];
    for (let index = 0; index < registry.count; index++) {
      this.states.push({ count: 0, charge: 0 });
    }
  }

  /** Distinct items currently held. Does not count stacks. */
  get count(): number {
    return this.heldCount;
  }

  has(index: number): boolean {
    return (this.isHeld[index] ?? 0) !== 0;
  }

  /** The runtime state for a registry index. Exists whether or not the item is held — `count` is 0 until it is. */
  stateOf(index: number): ItemRuntimeState {
    const state = this.states[index];
    if (state === undefined) {
      throw new RangeError(`No item runtime state at index ${String(index)}`);
    }
    return state;
  }

  /**
   * Adds one stack. Returns the item's runtime state, already updated.
   *
   * Inserting into `heldOrder` only happens the first time an id is picked
   * up — a second copy of an already-held item just bumps `count`.
   */
  pickUp(index: number): ItemRuntimeState {
    const state = this.stateOf(index);
    state.count += 1;
    if ((this.isHeld[index] ?? 0) === 0) {
      this.isHeld[index] = 1;
      let insertAt = this.heldCount;
      while (insertAt > 0 && (this.heldOrder[insertAt - 1] ?? 0) > index) {
        this.heldOrder[insertAt] = this.heldOrder[insertAt - 1] ?? 0;
        insertAt -= 1;
      }
      this.heldOrder[insertAt] = index;
      this.heldCount += 1;
    }
    return state;
  }

  /**
   * Removes one stack. Once `count` reaches zero the item leaves `heldOrder`
   * entirely and its charge resets — losing the last copy of an item is
   * meant to return every trace of it to exactly the state before it was
   * ever picked up (#26 acceptance criteria), and a stale charge left behind
   * for an active item that is no longer held would violate that.
   *
   * Returns whether the item is still held afterward (`count > 0`).
   */
  remove(index: number): boolean {
    const state = this.stateOf(index);
    if (state.count <= 0) {
      return false;
    }
    state.count -= 1;
    if (state.count === 0) {
      this.isHeld[index] = 0;
      state.charge = 0;
      for (let position = 0; position < this.heldCount; position++) {
        if (this.heldOrder[position] === index) {
          for (let shift = position; shift < this.heldCount - 1; shift++) {
            this.heldOrder[shift] = this.heldOrder[shift + 1] ?? 0;
          }
          this.heldCount -= 1;
          break;
        }
      }
    }
    return state.count > 0;
  }

  /**
   * Visits every held item's registry index and runtime state, in
   * deterministic id order. `visit` should be a hoisted function — an arrow
   * created at the call site allocates on every dispatch, which is exactly
   * what `onTick` (called once a tick per held item) cannot afford. Same
   * convention as `World.forEach`.
   */
  forEachHeld(visit: (index: number, state: ItemRuntimeState) => void): void {
    for (let position = 0; position < this.heldCount; position++) {
      const index = this.heldOrder[position] ?? 0;
      visit(index, this.stateOf(index));
    }
  }
}
