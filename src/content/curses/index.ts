import type { CurseDefinition } from '../../sim/curse/definition.js';

/**
 * The five curses (#49, `docs/GAME_DESIGN.md` §10), as data — the same "one
 * list, roster sorted by nothing but declaration order since there are only
 * ever five" convention `content/enemies/index.js` and `content/items/index.js`
 * use for their own rosters.
 */
export const CURSE_DEFINITIONS: readonly CurseDefinition[] = [
  {
    id: 'nebel',
    name: 'Nebel',
    description: 'Fog off the river. No minimap for the floor.',
  },
  {
    id: 'kater',
    name: 'Kater',
    description: 'You start the floor hungover.',
  },
  {
    id: 'sperrstunde',
    name: 'Sperrstunde',
    description: 'Last call. Dawdle and the Ordner come for you.',
  },
  {
    id: 'foehn',
    name: 'Föhn',
    description: 'The alpine wind pushes every shot in the room.',
  },
  {
    id: 'blaue-stunde',
    name: 'Blaue Stunde',
    description: 'Heavy dusk. Your sight only carries so far.',
  },
];
