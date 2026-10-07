import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { format } from 'prettier';
import { ORDNER_ANIM, ORDNER_STRIPS, assertOnPalette, encodeOrdnerStrip } from './ordner.mjs';

/**
 * Writes Der Ordner's familiar strips — side, south and north — into
 * `assets/sprites/common/characters/`.
 *
 *   npm run art:ordner
 *
 * The PNGs and sidecars stay committed (the game loads files, not this);
 * `tests/art/ordner-authoring.test.ts` re-encodes and compares.
 */

const DIR = fileURLToPath(new URL('../../../assets/sprites/common/characters/', import.meta.url));

assertOnPalette();
const sidecar = await format(JSON.stringify(ORDNER_ANIM), { parser: 'json' });
for (const [name, frames] of Object.entries(ORDNER_STRIPS)) {
  await writeFile(`${DIR}${name}.strip.png`, encodeOrdnerStrip(frames));
  await writeFile(`${DIR}${name}.anim.json`, sidecar);
  console.log(`${name}.strip.png  ${String(frames.length)} x 18x26`);
}
