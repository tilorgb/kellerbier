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
