import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { ROSTER, ROSTER_BUCKET, assertOnPalette, encodeSingle } from './floor3-roster.mjs';

/**
 * Writes Der Wald's roster into `assets/sprites/floor-3-wald/characters/`.
 *
 *   npm run art:floor3
 *
 * Same contract as `build-floor2-roster.mjs`: the PNGs stay committed (the
 * game loads files, not this), and `tests/art/floor3-roster-authoring.test.ts`
 * re-encodes and compares byte for byte.
 */

const DIR = fileURLToPath(
  new URL('../../../assets/sprites/floor-3-wald/characters/', import.meta.url),
);

for (const [name, frame] of Object.entries(ROSTER)) {
  assertOnPalette(ROSTER_BUCKET, [frame]);
  await writeFile(`${DIR}${name}.png`, encodeSingle(frame));
  console.log(`${name}.png  ${frame.width}x${frame.height}`);
}
