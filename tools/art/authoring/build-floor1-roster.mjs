import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  ROSTER,
  ROSTER_BUCKET,
  KELLERASSEL_FRAMES,
  assertOnPalette,
  encodeSingle,
  encodeStrip,
} from './floor1-roster.mjs';

/**
 * Writes the chibi Der Keller roster into
 * `assets/sprites/floor-1-cellar/characters/`.
 *
 *   npm run art:floor1
 *
 * Same contract as `build-floor2-roster.mjs`: the PNGs stay committed and
 * `tests/art/floor1-roster-authoring.test.ts` re-encodes and compares byte
 * for byte.
 *
 * The Kellerassel is the one animated body — its `kellerassel.anim.json`
 * sidecar (idle/move/hurt/death over seven frames) is hand-tuned and this
 * never touches it; the strip must keep matching it at seven frames.
 */

const DIR = fileURLToPath(
  new URL('../../../assets/sprites/floor-1-cellar/characters/', import.meta.url),
);

for (const [name, frame] of Object.entries(ROSTER)) {
  assertOnPalette(ROSTER_BUCKET, [frame]);
  await writeFile(`${DIR}${name}.png`, encodeSingle(frame));
  console.log(`${name}.png  ${frame.width}x${frame.height}`);
}

assertOnPalette(ROSTER_BUCKET, KELLERASSEL_FRAMES);
await writeFile(`${DIR}kellerassel.strip.png`, encodeStrip('kellerassel', KELLERASSEL_FRAMES));
const first = KELLERASSEL_FRAMES[0];
console.log(`kellerassel.strip.png  ${KELLERASSEL_FRAMES.length} x ${first.width}x${first.height}`);
