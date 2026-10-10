import { describe, expect, it } from 'vitest';
import { ITEM_DEFINITIONS } from '../../src/content/items/index.js';
import { GameSim } from '../../src/sim/game/sim.js';
import { StatId, STAT_IDS } from '../../src/sim/stats/definition.js';

/**
 * #524: an item's stats right after pickup are the ones its own hooks say
 * they are. Weißwurst's +30% never applied — its `onPickup` set the state
 * `modifyStats` reads, after the modifiers had already been resolved — and
 * no test noticed. This picks up every item alone in a fresh sim and checks
 * the stats then match an explicit re-resolve, which is exactly what
 * `modifyStats` says for the state the item is actually in.
 */
function snapshot(sim: GameSim): number[] {
  return STAT_IDS.map((stat) => sim.stats.value(stat));
}

describe('an item applies its stats the moment it is picked up (#524)', () => {
  it.each(ITEM_DEFINITIONS.map((item) => [item.id]))('%s', (id) => {
    const sim = new GameSim({ items: ITEM_DEFINITIONS, seed: 7 });
    sim.pickUpItem(id);
    const afterPickup = snapshot(sim);
    sim.refreshItemStats(id);
    expect(afterPickup).toEqual(snapshot(sim));
  });

  it('Weißwurst raises damage by 30% on floors 1–3', () => {
    const plain = new GameSim({ items: ITEM_DEFINITIONS, seed: 7 });
    const withSausage = new GameSim({ items: ITEM_DEFINITIONS, seed: 7 });
    withSausage.pickUpItem('weisswurst');
    expect(withSausage.stats.value(StatId.Damage)).toBeCloseTo(
      plain.stats.value(StatId.Damage) * 1.3,
      6,
    );
  });
});
