import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { MINIBOSSES, assertOnPalette, encodeSingle } from './floor1-minibosses.mjs';

/**
 * Writes Der Keller's two mini-bosses (#276) into
 * `assets/sprites/floor-1-cellar/characters/`.
 *
 *   npm run art:minibosses
 *
 * Same contract as `build-floor1-roster.mjs`: the PNGs stay committed (the
 * game loads files, not this script) and `tests/art/floor1-minibosses-
 * authoring.test.ts` re-encodes and compares byte for byte, so editing the
 * source without re-running this fails a pull request rather than shipping
 * art nobody looked at.
 *
 * Single frames, no `.anim.json` sidecar — the same shape the roster's
 * hand-drawn PNGs ship in. Animation (a telegraph pose, a flinch, the death
 * beats) is follow-up work inside the picked direction.
 */

const DIR = fileURLToPath(
  new URL('../../../assets/sprites/floor-1-cellar/characters/', import.meta.url),
);

for (const [name, frame] of Object.entries(MINIBOSSES)) {
  assertOnPalette([frame]);
  await writeFile(`${DIR}${name}.png`, encodeSingle(frame));
  console.log(`${name}.png  ${frame.width}x${frame.height}`);
}
