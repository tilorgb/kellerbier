import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { assertOnPalette, chestFrames, encodeSingle } from './chests.mjs';

/**
 * Writes the Chest and Locked Chest art (#353) into
 * `assets/sprites/common/characters/` as `pickup-<id>.png`.
 *
 *   npm run art:chests
 *
 * Same contract as `build-items.mjs`: the PNGs stay committed and
 * `tests/art/chests-authoring.test.ts` re-encodes and compares byte for byte.
 */

const DIR = fileURLToPath(new URL('../../../assets/sprites/common/characters/', import.meta.url));

const frames = chestFrames();
assertOnPalette('common', Object.values(frames));
for (const frame of Object.values(frames)) {
  await writeFile(`${DIR}${frame.name}.png`, encodeSingle(frame));
  console.log(`${frame.name}.png  ${String(frame.width)}x${String(frame.height)}`);
}
