import { writeFile } from 'node:fs/promises';
import {
  CHARACTER_DIR,
  SIDECARS,
  SINGLES,
  STRIPS,
  assertOnPalette,
  encodeViewStrip,
} from './floor3-views.mjs';
import { writeViewStrips } from './views-kit.mjs';

/**
 * Writes the Floor 3 animals' toward-the-camera and away views (#448-#450)
 * into `assets/sprites/floor-3-wald/characters/`.
 *
 *   npm run art:floor3-views
 *
 * The PNGs and sidecars stay committed (the game loads files, not this);
 * `tests/art/floor3-views-authoring.test.ts` re-encodes and compares.
 */

assertOnPalette();
await writeViewStrips(CHARACTER_DIR, STRIPS, SIDECARS);
for (const [name, frame] of Object.entries(SINGLES)) {
  await writeFile(`${CHARACTER_DIR}${name}.png`, encodeViewStrip([frame]));
  console.log(`${name}.png  ${String(frame.width)}x${String(frame.height)}`);
}
