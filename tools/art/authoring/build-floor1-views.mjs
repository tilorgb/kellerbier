import {
  BOSS_DIR,
  BOSS_SIDECARS,
  BOSS_STRIPS,
  CHARACTER_DIR,
  CHARACTER_SIDECARS,
  CHARACTER_STRIPS,
  assertOnPalette,
} from './floor1-views.mjs';
import { writeViewStrips } from './views-kit.mjs';

/**
 * Writes the Floor 1 creatures' side / south / north strips (#439-#442, #456)
 * into `assets/sprites/floor-1-cellar/characters/` and `.../bosses/`.
 *
 *   node tools/art/authoring/build-floor1-views.mjs
 *
 * The PNGs and sidecars stay committed (the game loads files, not this);
 * `tests/art/floor1-views-authoring.test.ts` re-encodes and compares.
 */

assertOnPalette();
await writeViewStrips(CHARACTER_DIR, CHARACTER_STRIPS, CHARACTER_SIDECARS);
await writeViewStrips(BOSS_DIR, BOSS_STRIPS, BOSS_SIDECARS);
