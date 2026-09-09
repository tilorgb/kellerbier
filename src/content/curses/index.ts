import type { CurseDefinition } from '../../sim/curse/definition.js';

/**
 * The five curses (#49, `docs/GAME_DESIGN.md` §10), as data — the same "one
 * list, roster sorted by nothing but declaration order since there are only
 * ever five" convention `content/enemies/index.js` and `content/items/index.js`
 * use for their own rosters.
 *
 * `description` is a localisation key (`curses.<id>.description`), not
 * literal text — see `src/sim/item/definition.ts`'s identical note on
 * `ItemDefinition.description` for why content holds a key rather than a
 * value here.
 */
export const CURSE_DEFINITIONS: readonly CurseDefinition[] = [
  {
    id: 'nebel',
    name: 'Nebel',
    description: 'curses.nebel.description',
  },
  {
    id: 'kater',
    name: 'Kater',
    description: 'curses.kater.description',
  },
  {
    id: 'sperrstunde',
    name: 'Sperrstunde',
    description: 'curses.sperrstunde.description',
  },
  {
    id: 'foehn',
    name: 'Föhn',
    description: 'curses.foehn.description',
  },
  {
    id: 'blaue-stunde',
    name: 'Blaue Stunde',
    description: 'curses.blaue-stunde.description',
  },
];
