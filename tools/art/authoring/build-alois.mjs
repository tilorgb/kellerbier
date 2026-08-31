import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { encodeStrip } from './compose.mjs';
import { STRIPS } from './alois.mjs';

/**
 * Writes Alois's strips into `assets/sprites/common/characters/`.
 *
 *   npm run art:alois
 *
 * The PNGs stay committed — `render/player-art.ts` loads files, not this — so
 * this is the step between editing a block in `alois.mjs` and having a sprite.
 * `tests/art/alois-authoring.test.ts` runs the same encode and compares it to
 * what is on disk, so forgetting to run this fails a pull request rather than
 * shipping a source file that describes art nobody is looking at.
 *
 * The sidecars are not written here. A `.anim.json` is a clip list a person
 * tunes by feel (`CONTRIBUTING.md`'s gameplay row), not something derived from
 * the drawing, and generating it would make re-timing a walk cycle a code
 * change.
 */

const OUTPUT_DIR = fileURLToPath(
  new URL('../../../assets/sprites/common/characters/', import.meta.url),
);

for (const [name, frames] of Object.entries(STRIPS)) {
  const bytes = encodeStrip(name, frames);
  await writeFile(`${OUTPUT_DIR}${name}.strip.png`, bytes);
  const first = frames[0];
  console.log(
    `${name}.strip.png  ${String(frames.length)} x ` +
      `${String(first?.width ?? 0)}x${String(first?.height ?? 0)}`,
  );
}
