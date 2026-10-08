import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { format } from 'prettier';
import {
  MINIBOSSES,
  STRIPS,
  assertOnPalette,
  encodeAnim,
  encodeSingle,
  encodeStrip,
} from './floor3-minibosses.mjs';

/**
 * Writes Der Wald's mini-boss (#467) — Bieber and the log he rolls — into
 * `assets/sprites/floor-3-wald/characters/`.
 *
 *   npm run art:minibosses3
 *
 * Same contract as `build-floor3-roster.mjs`: the PNGs stay committed (the game
 * loads files, not this) and `tests/art/floor3-minibosses-authoring.test.ts`
 * re-encodes and compares byte for byte.
 */

const DIR = fileURLToPath(
  new URL('../../../assets/sprites/floor-3-wald/characters/', import.meta.url),
);

for (const [name, frame] of Object.entries(MINIBOSSES)) {
  assertOnPalette([frame]);
  await writeFile(`${DIR}${name}.png`, encodeSingle(frame));
  console.log(`${name}.png  ${frame.width}x${frame.height}`);
}

for (const [name, strip] of Object.entries(STRIPS)) {
  assertOnPalette(strip.frames);
  await writeFile(`${DIR}${name}.strip.png`, encodeStrip(name, strip.frames));
  // Through Prettier, so a rebuild writes exactly what `npm run lint` accepts.
  await writeFile(
    `${DIR}${name}.anim.json`,
    await format(encodeAnim(strip.anim), { parser: 'json' }),
  );
  const first = strip.frames[0];
  console.log(`${name}.strip.png  ${String(strip.frames.length)} x ${first.width}x${first.height}`);
}
