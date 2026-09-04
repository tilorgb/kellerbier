import type { CharacterDefinition } from '../../app/meta/definition.js';
import { alois } from './alois.js';
import { derWolpertinger } from './der-wolpertinger.js';
import { koenigLudwig } from './koenig-ludwig.js';
import { resi } from './resi.js';
import { sennerin } from './sennerin.js';

/**
 * Every character authored so far, regardless of whether the run-start panel
 * currently offers it — `CHARACTERS` below is that offered subset.
 *
 * `docs/GAME_DESIGN.md` §3's roster, and its own rule for it: each one is a
 * different **verb**, not a different stat spread. Read the six files, not
 * this list. Kept around (and still content-validated by
 * `tests/content/characters.test.ts`) so a benched character does not rot
 * while it waits its turn — see `CHARACTERS`'s own doc comment for why it is
 * benched.
 *
 * Data, like every other roster in `src/content/`: a character is a name, a
 * condition, a stat block and a list of rule ids. Adding the seventh is a
 * file and a line here — unless it needs a verb nobody has yet, which is a
 * rule id in `sim/character/definition.ts` and the one system that reads it.
 */
export const AUTHORED_CHARACTERS: readonly CharacterDefinition[] = [
  alois,
  resi,
  sennerin,
  koenigLudwig,
  derWolpertinger,
];

/**
 * Who you can actually walk in as right now (#205), in the order the
 * run-start panel lists them.
 *
 * Cut down to Alois alone: the other five in `AUTHORED_CHARACTERS` were never
 * balanced against each other one at a time (König Ludwig II starting with
 * Ludwigs Schwan *and* 40 Biermarken, next to Alois's neutral baseline, is
 * what surfaced this), so they come back one at a time with their own
 * deliberate balance pass rather than all five re-appearing at once.
 */
export const CHARACTERS: readonly CharacterDefinition[] = [alois];

export { alois, derWolpertinger, koenigLudwig, resi, sennerin };
