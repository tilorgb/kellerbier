import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { MINIBOSSES, assertOnPalette, encodeSingle } from './floor2-minibosses.mjs';

/**
 * Writes Dorf & Acker's two mini-bosses (#277) into
 * `assets/sprites/floor-2-rural/characters/` — the three Blaskapelle bodies
 * and Der Ladewagen.
 *
 *   npm run art:minibosses2
 *
 * Same contract as `build-floor1-minibosses.mjs`: the PNGs stay committed (the
 * game loads files, not this script) and `tests/art/floor2-minibosses-
 * authoring.test.ts` re-encodes and compares byte for byte, so editing the
 * source without re-running this fails a pull request rather than shipping art
 * nobody looked at.
 *
 * Single frames, no `.anim.json` sidecar — the same shape floor 1's pair ship
 * in. Animation (a blow on the beat, a wheel turn, the death beats) is
 * follow-up work inside the picked direction.
 */

const DIR = fileURLToPath(
  new URL('../../../assets/sprites/floor-2-rural/characters/', import.meta.url),
);

for (const [name, frame] of Object.entries(MINIBOSSES)) {
  assertOnPalette([frame]);
  await writeFile(`${DIR}${name}.png`, encodeSingle(frame));
  console.log(`${name}.png  ${frame.width}x${frame.height}`);
}
