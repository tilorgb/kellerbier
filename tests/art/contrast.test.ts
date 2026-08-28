import { describe, expect, it } from 'vitest';
import {
  checkProjectileLegibility,
  contrastRatio,
  MIN_PROJECTILE_CONTRAST,
  relativeLuminance,
} from '../../tools/art/contrast.mjs';

describe('relativeLuminance / contrastRatio', () => {
  it('gives black and white the maximum ratio', () => {
    expect(contrastRatio(0x000000, 0xffffff)).toBeCloseTo(21, 0);
  });

  it('gives identical colours a ratio of 1', () => {
    expect(contrastRatio(0x336699, 0x336699)).toBeCloseTo(1, 5);
  });

  it('is symmetric', () => {
    expect(contrastRatio(0x102030, 0xf0e0d0)).toBeCloseTo(contrastRatio(0xf0e0d0, 0x102030), 10);
  });

  it('white is brighter than mid grey, which is brighter than black', () => {
    expect(relativeLuminance(0xffffff)).toBeGreaterThan(relativeLuminance(0x808080));
    expect(relativeLuminance(0x808080)).toBeGreaterThan(relativeLuminance(0x000000));
  });
});

describe('checkProjectileLegibility', () => {
  const wald = { floorTag: 'wald', colors: [0x16261a, 0x234d2b, 0x3d6b3a] };
  const schloss = { floorTag: 'schloss', colors: [0x1f3a70, 0xd4af37] };

  it('catches a deliberately low-contrast enemy projectile', () => {
    // A rim colour nearly identical to one of the floor's own dark greens —
    // exactly the "gorgeous palette swallows the bullet" bug docs/CONTENT_BIBLE.md
    // §5 exists to prevent.
    const failures = checkProjectileLegibility([{ name: 'dull-shot', rim: 0x17271b }], [wald]);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({ projectile: 'dull-shot', floorTag: 'wald' });
    expect(failures[0]?.ratio).toBeLessThan(MIN_PROJECTILE_CONTRAST);
  });

  it('passes a projectile with a genuinely bright rim', () => {
    const failures = checkProjectileLegibility([{ name: 'bright-shot', rim: 0xffffff }], [wald]);
    expect(failures).toEqual([]);
  });

  it('scores a background against whichever end of the sprite reads better against it', () => {
    // A shot with a black outline and a white core. Nothing bright reads on
    // snow and nothing dark reads on black, so this pair is the only way one
    // sprite passes both — see `docs/DECISIONS.md` #39.
    const alpen = { floorTag: 'alpen', colors: [0xeef2f5, 0xb9c4cc, 0x6e7680] };
    expect(
      checkProjectileLegibility(
        [{ name: 'outlined', rim: 0xffffff, shade: 0x000000 }],
        [wald, alpen],
      ),
    ).toEqual([]);
    // The bright end alone fails on Die Alpen, which is what the gate did
    // before #152 and why no `common` projectile could exist.
    const brightOnly = checkProjectileLegibility([{ name: 'bright-only', rim: 0xffffff }], [alpen]);
    expect(brightOnly.map((failure) => failure.floorTag)).toEqual(['alpen']);
  });

  it('still fails a flat mid-tone blob, which has no useful extreme at either end', () => {
    const alpen = { floorTag: 'alpen', colors: [0xeef2f5, 0xb9c4cc, 0x6e7680] };
    const failures = checkProjectileLegibility(
      [{ name: 'flat-grey', rim: 0x8a8a8a, shade: 0x8a8a8a }],
      [alpen],
    );
    expect(failures).toHaveLength(1);
    expect(failures[0]?.ratio).toBeLessThan(MIN_PROJECTILE_CONTRAST);
  });

  it('treats an omitted shade as "score the bright end alone"', () => {
    const withoutShade = checkProjectileLegibility([{ name: 'x', rim: 0x17271b }], [wald]);
    const withSameShade = checkProjectileLegibility(
      [{ name: 'x', rim: 0x17271b, shade: 0x17271b }],
      [wald],
    );
    expect(withoutShade).toEqual(withSameShade);
  });

  it('checks every floor independently — passing one does not excuse another', () => {
    // Legible against wald's dark greens, but reads poorly against schloss's gold.
    const failures = checkProjectileLegibility(
      [{ name: 'gold-ish', rim: 0xd8bd66 }],
      [wald, schloss],
    );
    const floorsFlagged = failures.map((failure) => failure.floorTag);
    expect(floorsFlagged).not.toContain('wald');
    expect(floorsFlagged).toContain('schloss');
  });
});
