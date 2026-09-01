import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { ROSTER, ROSTER_BUCKET, assertOnPalette, encodeSingle } from './floor2-roster.mjs';

/**
 * Writes the chibi Dorf & Acker roster into
 * `assets/sprites/floor-2-rural/characters/`.
 *
 *   npm run art:floor2
 *
 * Same contract as `build-alois.mjs` / `build-bosses.mjs`: the PNGs stay
 * committed (the game loads files, not this), and
 * `tests/art/floor2-roster-authoring.test.ts` re-encodes and compares byte
 * for byte, so editing the source without re-running this fails a pull
 * request rather than shipping art nobody looked at.
 *
 * These are single frames — no `.anim.json` sidecars — exactly as the
 * hand-drawn PNGs they replace were.
 */

const DIR = fileURLToPath(
  new URL('../../../assets/sprites/floor-2-rural/characters/', import.meta.url),
);

for (const [name, frame] of Object.entries(ROSTER)) {
  assertOnPalette(ROSTER_BUCKET, [frame]);
  await writeFile(`${DIR}${name}.png`, encodeSingle(frame));
  console.log(`${name}.png  ${frame.width}x${frame.height}`);
}
