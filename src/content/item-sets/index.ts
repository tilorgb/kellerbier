import type { ItemSetDefinition } from '../../sim/item/set.js';
import { braumeister } from './braumeister.js';

/**
 * Every item set (#137). One list, same convention as
 * `content/items/index.ts`/`content/curses/index.ts` — a new set is a row
 * here, plumbing already handled by `SetRegistry` (`sim/item/set.ts`).
 *
 * Deliberately starts at one: #137's own scope note asks for the
 * `ItemSetDefinition` plumbing plus exactly one real set end to end — data,
 * bonus, notification, dev-app visibility — proven before any further set
 * is authored, the same one-thing-proven-first pattern `docs/CONTENT_BIBLE.md`
 * content batches already follow.
 */
export const ITEM_SET_DEFINITIONS: readonly ItemSetDefinition[] = [braumeister];

export { braumeister };
