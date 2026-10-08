import { fileURLToPath } from 'node:url';
import { assertOnPalette, sidecars, strips } from './floor2-human-views.mjs';
import { writeViewStrips } from './views-kit.mjs';

/**
 * Writes the Floor 2 front-on creatures' side, south and north strips into
 * `assets/sprites/floor-2-rural/characters/`.
 *
 *   node tools/art/authoring/build-floor2-human-views.mjs
 *
 * The PNGs and sidecars stay committed (the game loads files, not this);
 * `tests/art/floor2-human-views-authoring.test.ts` re-encodes and compares.
 */

const DIR = fileURLToPath(
  new URL('../../../assets/sprites/floor-2-rural/characters/', import.meta.url),
);

assertOnPalette();
await writeViewStrips(DIR, strips, sidecars);
