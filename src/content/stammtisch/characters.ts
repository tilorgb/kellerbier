import type { CharacterDefinition } from '../../app/meta/definition.js';

/**
 * Who you can walk in as (#46's run-start panel).
 *
 * One row today, and that is the honest state of it: `docs/GAME_DESIGN.md`
 * §3's other five characters are #47, and every one of them unlocks off a
 * floor that does not exist yet (Resi at floor 3, Bruder Barnabas at floor
 * 5). The panel therefore offers a list of one rather than a row of teasing
 * silhouettes — the table above it is where the game promises things it can
 * actually deliver.
 */
export const STAMMTISCH_CHARACTERS: readonly CharacterDefinition[] = [
  {
    id: 'alois',
    name: 'Alois',
    note: 'Opas Trink-Rucksack, gladen mit der falschen Charge',
    requires: null,
  },
];
