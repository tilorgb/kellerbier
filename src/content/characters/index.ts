import type { CharacterDefinition } from '../../app/meta/definition.js';
import { alois } from './alois.js';
import { bruderBarnabas } from './bruder-barnabas.js';
import { derWolpertinger } from './der-wolpertinger.js';
import { koenigLudwig } from './koenig-ludwig.js';
import { resi } from './resi.js';
import { sennerin } from './sennerin.js';

/**
 * Who you can walk in as (#47), in the order the run-start panel lists them.
 *
 * `docs/GAME_DESIGN.md` §3's roster, and its own rule for it: each one is a
 * different **verb**, not a different stat spread. Read the six files, not
 * this list — the ordering here is only "Alois first, then roughly by how
 * strange they are", so a player cycling the panel meets the ordinary one
 * before the one whose stats are rerolled every floor.
 *
 * Data, like every other roster in `src/content/`: a character is a name, a
 * condition, a stat block and a list of rule ids. Adding the seventh is a
 * file and a line here — unless it needs a verb nobody has yet, which is a
 * rule id in `sim/character/definition.ts` and the one system that reads it.
 */
export const CHARACTERS: readonly CharacterDefinition[] = [
  alois,
  resi,
  sennerin,
  bruderBarnabas,
  koenigLudwig,
  derWolpertinger,
];

export { alois, bruderBarnabas, derWolpertinger, koenigLudwig, resi, sennerin };
