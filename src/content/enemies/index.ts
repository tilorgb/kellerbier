import type { EnemyDefinition } from '../../sim/enemy/definition.js';
import { bierratte } from './bierratte.js';
import { kellerassel } from './kellerassel.js';
import { fasssplitter, rollfass } from './rollfass.js';
import { schimmelfleck, schimmelspore } from './schimmelfleck.js';
import { shopkeeper } from './shopkeeper.js';
import { zapfhahn } from './zapfhahn.js';

/**
 * Every enemy in the game.
 *
 * One list, and adding to it is the whole of adding an enemy — no engine
 * change, no registration call, no switch statement anywhere. The registry
 * validates the lot at construction, and `tests/content/enemies.test.ts` builds
 * one so that a broken definition fails the build rather than a playthrough.
 *
 * Room templates (#18) will name these by id; until then the playground room in
 * `sim/room/playground.ts` places a handful by hand.
 */
export const ENEMY_DEFINITIONS: readonly EnemyDefinition[] = [
  kellerassel,
  bierratte,
  schimmelfleck,
  schimmelspore,
  zapfhahn,
  rollfass,
  fasssplitter,
  shopkeeper,
];

export {
  bierratte,
  fasssplitter,
  kellerassel,
  rollfass,
  schimmelfleck,
  schimmelspore,
  shopkeeper,
  zapfhahn,
};
