import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { SHOPKEEPER_FRAMES, assertOnPalette, encodeStrip } from './shopkeeper.mjs';

/**
 * Writes Der Wirt's idle strip into `assets/sprites/common/characters/`.
 *
 *   npm run art:shopkeeper
 *
 * Same contract as `build-floor1-roster.mjs`/`build-floor2-roster.mjs`: the
 * PNG stays committed and `tests/art/shopkeeper-authoring.test.ts` re-encodes
 * and compares byte for byte.
 */

const DIR = fileURLToPath(new URL('../../../assets/sprites/common/characters/', import.meta.url));

assertOnPalette('common', SHOPKEEPER_FRAMES);
await writeFile(`${DIR}shopkeeper.strip.png`, encodeStrip('shopkeeper', SHOPKEEPER_FRAMES));
const first = SHOPKEEPER_FRAMES[0];
console.log(`shopkeeper.strip.png  ${SHOPKEEPER_FRAMES.length} x ${first.width}x${first.height}`);
