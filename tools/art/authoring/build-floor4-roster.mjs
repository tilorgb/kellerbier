import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { format } from 'prettier';
import {
  PROJECTILES,
  ROSTER,
  ROSTER_BUCKET,
  STRIPS,
  assertOnPalette,
  encodeAnim,
  encodeSingle,
  encodeStrip,
} from './floor4-roster.mjs';

/**
 * Writes Die Alpen's roster into `assets/sprites/floor-4-alpen/characters/`
 * and its projectiles into `.../projectiles/`. The boss is not here: The
 * First Human is a rig in `bosses-alpen.mjs`, built by `npm run art:bosses`.
 *
 *   npm run art:floor4
 *
 * Same contract as `build-floor3-roster.mjs`: the PNGs stay committed (the
 * game loads files, not this), and `tests/art/floor4-roster-authoring.test.ts`
 * re-encodes and compares byte for byte.
 */

const ART = fileURLToPath(new URL('../../../assets/sprites/floor-4-alpen/', import.meta.url));
const CHAR = `${ART}characters/`;
const PROJ = `${ART}projectiles/`;
for (const [name, frame] of Object.entries(ROSTER)) {
  assertOnPalette(ROSTER_BUCKET, [frame]);
  await writeFile(`${CHAR}${name}.png`, encodeSingle(frame));
  console.log(`${name}.png  ${String(frame.width)}x${String(frame.height)}`);
}

for (const [name, frame] of Object.entries(PROJECTILES)) {
  assertOnPalette(ROSTER_BUCKET, [frame]);
  await writeFile(`${PROJ}${name}.png`, encodeSingle(frame));
  console.log(`projectiles/${name}.png  ${String(frame.width)}x${String(frame.height)}`);
}

for (const [name, strip] of Object.entries(STRIPS)) {
  assertOnPalette(ROSTER_BUCKET, strip.frames);
  await writeFile(`${CHAR}${name}.strip.png`, encodeStrip(name, strip.frames));
  // Through Prettier, so a rebuild writes exactly what `npm run lint` accepts.
  await writeFile(
    `${CHAR}${name}.anim.json`,
    await format(encodeAnim(strip.anim), { parser: 'json' }),
  );
  const first = strip.frames[0];
  console.log(
    `${name}.strip.png  ${String(strip.frames.length)} x ${String(first.width)}x${String(first.height)}`,
  );
}
