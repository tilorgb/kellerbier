import type { GameSim } from '../sim/game/sim.js';
import type { SaveData } from './save/schema.js';
import { updateSave } from './save/storage.js';

/**
 * The Collection's memory: which items this save has ever held
 * (`SaveData.discoveredItems`, schema v9).
 *
 * Same split `app/story/beats.ts` keeps — a pure `withItemsDiscovered` over a
 * `SaveData`, and one class that owns the `localStorage` write — so the rule
 * ("an item counts as found the moment it is held, once, forever") is
 * testable without a browser.
 */

/** Idempotent — returns `save` unchanged (same reference) when every id is already recorded. */
export function withItemsDiscovered(save: SaveData, ids: readonly string[]): SaveData {
  const known = new Set(save.discoveredItems);
  const added = ids.filter((id) => !known.has(id));
  if (added.length === 0) {
    return save;
  }
  return { ...save, discoveredItems: [...save.discoveredItems, ...new Set(added)] };
}

/**
 * The in-memory set `app/main.ts` checks every frame, seeded from the save at
 * boot and written through to it whenever a new item turns up.
 *
 * Watches what the player *holds* rather than hooking the pickup itself, so
 * every way an item can arrive — a pedestal, a shop, a Losbrunnen, a
 * character's starting kit, a resumed run's replayed input log — counts,
 * without each of them having to remember to report it.
 */
export class ItemDiscovery {
  private readonly known: Set<string>;
  private readonly fresh: string[] = [];
  private readonly persist: (ids: readonly string[]) => void;
  private scanning: GameSim | null = null;
  private readonly visit = (index: number): void => {
    const id = this.scanning?.items.at(index).id;
    if (id !== undefined && !this.known.has(id)) {
      this.known.add(id);
      this.fresh.push(id);
    }
  };

  constructor(
    initial: readonly string[],
    persist: (ids: readonly string[]) => void = (ids) => {
      updateSave((save) => withItemsDiscovered(save, ids));
    },
  ) {
    this.known = new Set(initial);
    this.persist = persist;
  }

  /** Records every item `sim` holds that was not already known. Returns true when anything new was found. */
  observe(sim: GameSim): boolean {
    this.scanning = sim;
    sim.inventory.forEachHeld(this.visit);
    this.scanning = null;
    if (this.fresh.length === 0) {
      return false;
    }
    this.persist(this.fresh);
    this.fresh.length = 0;
    return true;
  }

  has(id: string): boolean {
    return this.known.has(id);
  }
}
