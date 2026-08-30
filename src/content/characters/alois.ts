import type { CharacterDefinition } from '../../app/meta/definition.js';

/**
 * Alois — the one you start with, and the baseline every other character in
 * #47 is a deviation from.
 *
 * His traits are deliberately empty rather than "the defaults written out
 * again": an empty stat list registers no source at all with the pipeline, so
 * the stat inspector on an Alois run shows exactly what it showed before
 * characters existed, and a number that looks wrong on his run cannot be
 * blamed on a character modifier that is not there. `maxHealth` is the one
 * value he does state, because a character's health is the character's, not
 * the engine's — it happens to equal `sim/game/sim.ts`'s `PLAYER_HEALTH`, and
 * `tests/content/characters.test.ts` holds the two together.
 */
export const alois: CharacterDefinition = {
  id: 'alois',
  name: 'Alois',
  note: 'Opas Trink-Rucksack, gladen mit der falschen Charge',
  requires: null,
  goal: '',
  traits: {
    id: 'alois',
    name: 'Alois',
    maxHealth: 6,
    startingBiermarken: 0,
    startingBombs: 0,
    startingKeys: 0,
    items: [],
    shotTags: [],
    stats: [],
    rules: [],
  },
};
