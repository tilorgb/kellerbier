import type { StammtischContent } from '../../app/meta/definition.js';
import { STAMMTISCH_CHARACTERS } from './characters.js';
import { STAMMTISCH_REGULARS } from './regulars.js';
import { STAMMTISCH_UNLOCKS } from './unlocks.js';

/**
 * The hub's content, in one bundle (#46).
 *
 * Handed to the meta layer as an argument rather than imported by it, so a
 * test can run the same rules against a two-chair fixture, and so adding a
 * regular stays a change to this folder alone.
 */
export const STAMMTISCH: StammtischContent = {
  regulars: STAMMTISCH_REGULARS,
  unlocks: STAMMTISCH_UNLOCKS,
  characters: STAMMTISCH_CHARACTERS,
};

export { STAMMTISCH_CHARACTERS, STAMMTISCH_REGULARS, STAMMTISCH_UNLOCKS };
