import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { ALPEN_TILES, assertOnPalette, encodeTile } from './alpen-tiles.mjs';

/**
 * Writes Die Alpen's tileset and props into `assets/sprites/floor-4-alpen/tiles/`.
 *
 *   npm run art:alpen-tiles
 *
 * Same contract as `build-blocks.mjs`: the PNGs stay committed (the game
 * loads files, not this), and `tests/art/alpen-tiles-authoring.test.ts`
 * re-encodes and compares byte for byte, so editing `alpen-tiles.mjs` without
 * rebuilding fails a pull request. The boulders are `blocks.mjs`'s business.
 */

const DIR = fileURLToPath(new URL('../../../assets/sprites/floor-4-alpen/tiles/', import.meta.url));

for (const [name, frame] of Object.entries(ALPEN_TILES)) {
  assertOnPalette(frame);
  await writeFile(`${DIR}${name}.png`, encodeTile(frame));
  console.log(`${name}.png  ${String(frame.width)}x${String(frame.height)}  (${frame.tier})`);
}
