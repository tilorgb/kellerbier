import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { computeHatAnchors, renderHatAnchorsFile } from '../../tools/art/hat-anchors.mjs';

/** `src/render/hat-anchors.ts` is generated from Alois's strips: it must not drift from them. */
describe('hat anchors', () => {
  it('matches what tools/art/hat-anchors.mjs derives from the strips', async () => {
    const committed = await readFile(
      fileURLToPath(new URL('../../src/render/hat-anchors.ts', import.meta.url)),
      'utf8',
    );
    expect(committed.replace(/\r\n/g, '\n')).toBe(await renderHatAnchorsFile(computeHatAnchors()));
  });
});
