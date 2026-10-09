import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { renderLitterPixelsFile } from '../../tools/art/litter-pixels.mjs';

/** `src/render/litter-pixels.ts` is generated from the picked pixel-bench candidates: it must not drift. */
describe('litter pixels', () => {
  it('matches what tools/art/litter-pixels.mjs derives from the picks', async () => {
    const committed = await readFile(
      fileURLToPath(new URL('../../src/render/litter-pixels.ts', import.meta.url)),
      'utf8',
    );
    expect(committed.replace(/\r\n/g, '\n')).toBe(await renderLitterPixelsFile());
  });
});
