import type { ProgressionContent } from '../../app/meta/definition.js';
import { PROGRESSION_CHARACTERS } from './characters.js';
import { PROGRESSION_UNLOCKS } from './unlocks.js';

/**
 * The meta-progression content, in one bundle.
 *
 * Handed to the meta layer as an argument rather than imported by it, so a
 * test can run the same rules against its own small fixture, and so adding an
 * unlock or a character stays a change to this folder alone.
 */
export const PROGRESSION: ProgressionContent = {
  unlocks: PROGRESSION_UNLOCKS,
  characters: PROGRESSION_CHARACTERS,
};

export { PROGRESSION_CHARACTERS, PROGRESSION_UNLOCKS };
