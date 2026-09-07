import type { Scenery } from './scenery.js';

/**
 * How many rooms `SceneryCache` keeps built and ready at once. Sized for the
 * realistic revisit pattern the audit's own crossing tests exercise —
 * walking back and forth across a handful of doors, not touring a whole
 * floor and returning to the start — not for "every room this floor ever
 * visited." `docs/render/world/lighting.ts`'s `MAX_DOOR_GLOWS` is sized
 * against this constant; raise them together.
 */
export const SCENERY_CACHE_CAPACITY = 4;

/**
 * Keeps up to `SCENERY_CACHE_CAPACITY` recently-visited rooms' whole
 * `Scenery` built and ready, keyed by `GameSim.roomId` — the room's stable
 * identity, unlike `RoomGeometry` itself, which `compileRoomTemplate`
 * constructs fresh on every load even for a room already seen
 * (`docs/PERFORMANCE_AUDIT.md` F2).
 *
 * A cache hit is a whole `Scenery` handed back exactly as built — geometry,
 * materials, billboards, doors and the point lights they hold — with
 * nothing to construct or upload again, which is what "zero geometries or
 * materials constructed by a crossing between visited rooms" (#293's
 * acceptance criterion) actually asks for. Evicting the least-recently-used
 * entry beyond capacity disposes it exactly as `GameView` used to dispose
 * every outgoing room — it is gone, not detached, so its doors release their
 * pooled glow lights back to `Lighting` and its billboards/geometry free
 * their GPU buffers.
 *
 * Room ids are not guaranteed unique across floors (a generated room's id is
 * a floor-plan slot name, not a run-wide one), so `clear()` on a floor
 * change is load-bearing, not just tidiness.
 */
export class SceneryCache {
  private readonly entries = new Map<string, Scenery>();

  /**
   * The cached `Scenery` for `roomId`, marking it most-recently-used, or
   * `undefined` on a miss. `Map` iterates insertion order, so a `get` that
   * hits re-inserts the entry to move it to the most-recently-used end —
   * the same trick `evictOldest` relies on.
   */
  get(roomId: string): Scenery | undefined {
    const entry = this.entries.get(roomId);
    if (entry === undefined) {
      return undefined;
    }
    this.entries.delete(roomId);
    this.entries.set(roomId, entry);
    return entry;
  }

  /**
   * Registers a freshly built `Scenery` under `roomId`, evicting the
   * least-recently-used entry if the cache is now over capacity. Disposes
   * whatever was already registered under `roomId` first — should not
   * normally happen (a cache hit is meant to be handed the existing
   * instance back, not rebuilt), but two different `Scenery`s for the same
   * room id would otherwise leak the one this silently replaces.
   */
  set(roomId: string, scenery: Scenery): void {
    if (this.entries.get(roomId) !== undefined && this.entries.get(roomId) !== scenery) {
      this.entries.get(roomId)?.dispose();
    }
    this.entries.set(roomId, scenery);
    while (this.entries.size > SCENERY_CACHE_CAPACITY) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) {
        break;
      }
      this.forget(oldest);
    }
  }

  /** Disposes and forgets one room — the dev 'G' regenerate key needs this so a reroll is never served stale, cached content. */
  forget(roomId: string): void {
    this.entries.get(roomId)?.dispose();
    this.entries.delete(roomId);
  }

  /** Disposes and forgets every cached room — call on a floor change; see the class doc comment on why that matters. */
  clear(): void {
    for (const scenery of this.entries.values()) {
      scenery.dispose();
    }
    this.entries.clear();
  }
}
