import type { GameSim } from '../../sim/game/sim.js';
import type { ItemDefinition } from '../../sim/item/definition.js';

/** The two purity pacts this item's own pickup locks out of the pool. */
const BANNED_PACT_IDS = ['reinheitsgebot-1516', 'sudordnung-1493'] as const;

/**
 * Sets every currently-held `rosinen` item's drawback-suppression flag and
 * re-resolves its stats immediately, rather than waiting for that item's own
 * next dirty-flag sweep. Called from both `onPickup` and `onRemove` so the
 * order the Klauber and a `rosinen` item enter or leave the inventory in
 * never matters.
 */
function syncRosinenItems(sim: GameSim, suppressed: boolean): void {
  for (const item of sim.items.all) {
    if (!item.tags.includes('rosinen') || !sim.hasItem(item.id)) {
      continue;
    }
    sim.itemState(item.id).charge = suppressed ? 1 : 0;
    sim.refreshItemStats(item.id);
  }
}

/**
 * Der Rosinenklauber — quality control, off the clock. Every `rosinen` item
 * you hold keeps its upgrade and loses its drawback; in exchange, both
 * purity pacts (`reinheitsgebot-1516.ts`, `sudordnung-1493.ts`) are banned
 * from your pools for the rest of the run. He is not defending the raisins.
 * He is just eating them.
 *
 * Mechanism decision, `docs/DECISIONS.md` #47: each `rosinen` item's own
 * `modifyStats` checks a cached `state.charge` flag (option 1 from #166 —
 * "per-item convention," the cheaper bet while `rosinen` has one member)
 * rather than `ItemDefinition` growing a declared, engine-enforced penalty
 * field (option 2, its own future engine issue). `syncRosinenItems` is the
 * half of that convention this file owns: it walks every held `rosinen`
 * item on pickup and on removal, mirroring `reinheitsgebot-1516.ts`'s own
 * walk-all-items loop, so a `rosinen` item picked up before or after the
 * Klauber — and the Klauber being lost mid-run — all resolve the same way.
 */
export const derRosinenklauber: ItemDefinition = {
  id: 'der-rosinenklauber',
  name: 'Der Rosinenklauber',
  description: 'Rosinen items lose their drawback. Locks out both purity pacts',
  flavourText: 'He is not defending the raisins. He is just eating them.',
  sprite: 'der-rosinenklauber',
  pools: ['devil', 'secret'],
  quality: 3,
  promilleRequirement: 'any',
  hooks: {
    onPickup: (ctx) => {
      for (const id of BANNED_PACT_IDS) {
        ctx.sim.banItemFromPool(id);
      }
      syncRosinenItems(ctx.sim, true);
    },
    onRemove: (ctx) => {
      syncRosinenItems(ctx.sim, false);
    },
  },
};
