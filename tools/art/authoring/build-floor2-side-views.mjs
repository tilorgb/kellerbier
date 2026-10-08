import { fileURLToPath } from 'node:url';
import { writeViewStrips } from './views-kit.mjs';
import { assertOnPalette, folders, sidecars, strips } from './floor2-side-views.mjs';

/**
 * Writes the Floor 2 side-on creatures' side, south and north strips (Gockel,
 * Kuh, Traktor, Der Ladewagen into `characters/`, Der Stier into `bosses/`).
 *
 *   node tools/art/authoring/build-floor2-side-views.mjs
 *
 * The PNGs and sidecars stay committed; `tests/art/floor2-side-views-authoring.test.ts`
 * re-encodes and compares.
 */

const SPRITES = fileURLToPath(new URL('../../../assets/sprites/', import.meta.url));

assertOnPalette();
for (const dir of new Set(Object.values(folders))) {
  const names = Object.keys(strips).filter((n) => folders[n] === dir);
  await writeViewStrips(
    `${SPRITES}${dir}`,
    Object.fromEntries(names.map((n) => [n, strips[n]])),
    sidecars,
  );
}
