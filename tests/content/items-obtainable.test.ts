import { describe, expect, it } from 'vitest';
import { ITEM_DEFINITIONS } from '../../src/content/items/index.js';
import { selectItemOffer } from '../../src/sim/item/pool.js';
import { ItemRegistry } from '../../src/sim/item/registry.js';
import { Rng } from '../../src/sim/rng/rng.js';
import { DEFAULT_ITEM_POOL_TUNING } from '../../src/sim/tuning.js';

/**
 * Every authored item has to be *obtainable*: drawn from at least one real pool by the same
 * `selectItemOffer` the pedestals use, in a run where it is eligible (a Promille item needs the
 * meter, so it is checked in a promilled run). The ten-item batch and the #484 health items are
 * named explicitly so a rename or a pool edit that strands one fails here.
 */

const REGISTRY = new ItemRegistry(ITEM_DEFINITIONS);
const DRAWS = 4000;

function obtainableFrom(id: string): string[] {
  const item = REGISTRY.get(id);
  const found: string[] = [];
  for (const pool of item.pools) {
    const rng = new Rng(7);
    for (let draw = 0; draw < DRAWS; draw++) {
      const offer = selectItemOffer(
        REGISTRY,
        pool,
        { promilleUnlocked: true, floor: 2, luck: 0, taken: new Set<string>() },
        DEFAULT_ITEM_POOL_TUNING,
        rng,
      );
      if (offer?.id === id) {
        found.push(pool);
        break;
      }
    }
  }
  return found;
}

describe('every item can be obtained', () => {
  it.each(ITEM_DEFINITIONS.map((item) => item.id))('%s is drawn from a pool', (id) => {
    expect(obtainableFrom(id).length).toBeGreaterThan(0);
  });

  it('includes the ten-item batch and the health items', () => {
    const ids = new Set(ITEM_DEFINITIONS.map((item) => item.id));
    for (const id of [
      'roter-stier',
      'waller-kopf',
      'the-patriot',
      'dotsch',
      'muell',
      'rolling-r',
      'bratwurst',
      'krapfen',
      'leberkas',
      'pfeitinger-ultrabraeu',
      'schweinsbraten',
      'radi',
      'semmel',
      'rosswurst',
      'kaesekuchen',
      'homebrew',
    ]) {
      expect(ids.has(id), id).toBe(true);
    }
  });
});
