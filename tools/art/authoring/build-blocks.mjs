import { writeFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { BLOCKS, BLOCK_BUCKETS, assertOnPalette, encodeSingle } from './blocks.mjs';

/**
 * Writes the in-room blocking tiles into each floor's `tiles/` folder.
 *
 *   npm run art:blocks
 *
 * Same contract as `build-alois.mjs` / `build-bosses.mjs`: the PNGs stay
 * committed (the game loads files, not this), and
 * `tests/art/blocks-authoring.test.ts` re-encodes and compares byte for byte,
 * so editing `blocks.mjs` without rebuilding fails a pull request.
 *
 * The floors' old single-obstacle tiles are removed here — `cellar-plank`
 * and `rural-hedge-block` were the square-edged blocks these variant sets
 * replace (`docs/DECISIONS.md`), and a stale PNG left in `tiles/` would just
 * be an atlas entry nothing looks up.
 */

const SPRITES = fileURLToPath(new URL('../../../assets/sprites/', import.meta.url));
const DIR = {
  'floor-1-cellar': `${SPRITES}floor-1-cellar/tiles/`,
  'floor-2-rural': `${SPRITES}floor-2-rural/tiles/`,
};

await rm(`${SPRITES}floor-1-cellar/tiles/cellar-plank.png`, { force: true });
await rm(`${SPRITES}floor-2-rural/tiles/rural-hedge-block.png`, { force: true });

for (const [name, frame] of Object.entries(BLOCKS)) {
  const bucket = BLOCK_BUCKETS[name];
  assertOnPalette(bucket, frame);
  await writeFile(`${DIR[bucket]}${name}.png`, encodeSingle(frame));
  console.log(`${name}.png  ${frame.width}x${frame.height}  (${bucket})`);
}
