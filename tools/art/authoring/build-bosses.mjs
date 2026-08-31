import { writeFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { encodeStrip, assertOnPalette, STRIPS, BOSS_BUCKETS } from './bosses.mjs';

/**
 * Writes the chibi boss strips into each floor's `bosses/` sprite folder.
 *
 *   npm run art:bosses
 *
 * Same contract as `build-alois.mjs`: the PNGs stay committed (the game loads
 * files, not this), `tests/art/boss-authoring.test.ts` re-encodes and compares
 * byte for byte, and the `.anim.json` sidecars are hand-tuned clip lists this
 * never touches. Frame counts must keep matching the sidecars — seven each.
 *
 * Since #199 the Maibaum-Dieb is a strip too, not a single: dismounted, he
 * walks, winds up, flinches and dies on screen like every other boss body.
 */

const SPRITES = fileURLToPath(new URL('../../../assets/sprites/', import.meta.url));
const DIR = {
  'floor-1-cellar': `${SPRITES}floor-1-cellar/bosses/`,
  'floor-2-rural': `${SPRITES}floor-2-rural/bosses/`,
};

// The Maibaum-Dieb used to live in characters/ (#193), then as a single PNG
// here (#193 again); it is a seven-frame strip now (#199).
await rm(`${SPRITES}floor-2-rural/characters/der-stier-maibaum-dieb.png`, { force: true });
await rm(`${SPRITES}floor-2-rural/bosses/der-stier-maibaum-dieb.png`, { force: true });

for (const [name, frames] of Object.entries(STRIPS)) {
  const bucket = BOSS_BUCKETS[name];
  assertOnPalette(bucket, frames);
  await writeFile(`${DIR[bucket]}${name}.strip.png`, encodeStrip(name, frames));
  const first = frames[0];
  console.log(`${name}.strip.png  ${frames.length} x ${first.width}x${first.height}  (${bucket})`);
}
