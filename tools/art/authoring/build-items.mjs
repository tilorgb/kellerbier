import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { assertOnPalette, encodeSingle, itemFrames } from './items.mjs';

/**
 * Writes every authored item icon into `assets/sprites/common/characters/` as
 * `item-<id>.png`.
 *
 *   npm run art:items
 *
 * Same contract as `build-shopkeeper.mjs`: the PNGs stay committed (the game
 * loads the atlas, not this script) and `tests/art/items-authoring.test.ts`
 * re-encodes and compares byte for byte, so editing `items.mjs` without
 * re-running this fails a pull request rather than shipping art nobody looked
 * at.
 */

const DIR = fileURLToPath(new URL('../../../assets/sprites/common/characters/', import.meta.url));

const frames = itemFrames();
assertOnPalette('common', Object.values(frames));
for (const frame of Object.values(frames)) {
  await writeFile(`${DIR}${frame.name}.png`, encodeSingle(frame));
  console.log(`${frame.name}.png  ${String(frame.width)}x${String(frame.height)}`);
}
