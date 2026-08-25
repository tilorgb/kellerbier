import type { ItemDefinition } from '../../sim/item/definition.js';
import { bierkrug } from './bierkrug.js';
import { feuerwasser } from './feuerwasser.js';
import { wirtshausschlaeger } from './wirtshausschlaeger.js';

/**
 * Every item in the game.
 *
 * One list, exactly the same convention as `content/enemies/index.js` —
 * adding an item is adding to this array, nothing else. `ItemRegistry`
 * validates and sorts the lot at construction; `tests/content/items.test.ts`
 * builds one so a broken definition fails the build rather than a
 * playthrough. #29 is where this grows toward the 25+ items M3 exits on —
 * today it holds only the three that prove #26's format end to end.
 */
export const ITEM_DEFINITIONS: readonly ItemDefinition[] = [
  bierkrug,
  wirtshausschlaeger,
  feuerwasser,
];

export { bierkrug, feuerwasser, wirtshausschlaeger };
