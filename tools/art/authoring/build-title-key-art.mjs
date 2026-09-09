import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PALETTE, SCALE, build } from './title-key-art.mjs';

/**
 * Writes the title screen's key art into `src/render/ui/title-key-art.ts`:
 *
 *   npm run art:title
 *
 * The TypeScript file is committed, and the game imports it — the same
 * arrangement `build-alois.mjs` has with the strips it writes, and for the same
 * reason: the runtime loads data, not a generator, and
 * `tests/art/title-key-art-authoring.test.ts` fails a pull request where the
 * committed data and the composition have drifted apart.
 */

export function renderModule() {
  const rows = build();
  const palette = Object.entries(PALETTE)
    .map(
      ([key, colour]) =>
        `    ${/^[A-Za-z]$/.test(key) ? key : `'${key}'`}: 0x${colour.toString(16).padStart(6, '0')},`,
    )
    .join('\n');
  return `import type { KeyArt } from './key-art.js';

/**
 * The title screen's key art — Alois with the Maß up, in the mouth of a lit
 * cellar arch.
 *
 * **Generated.** Edit the composition in
 * \`tools/art/authoring/title-key-art.mjs\` and run \`npm run art:title\`;
 * \`tests/art/title-key-art-authoring.test.ts\` fails if this file and that one
 * disagree. Hand-editing a row here is how a drawing ends up one pixel out in a
 * place nobody can find again.
 */
export const TITLE_KEY_ART: KeyArt = {
  scale: ${String(SCALE)},
  palette: {
${palette}
  },
  rows: [
${rows.map((row) => `    '${row}',`).join('\n')}
  ],
};
`;
}

const OUTPUT = fileURLToPath(new URL('../../../src/render/ui/title-key-art.ts', import.meta.url));

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const source = renderModule();
  await writeFile(OUTPUT, source);
  const rows = build();
  console.log(
    `title-key-art.ts  ${String(rows[0].length)}x${String(rows.length)} at ${String(SCALE)}x`,
  );
}
