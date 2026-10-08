import { describe, expect, it } from 'vitest';
import { skipsIntroCards } from '../../src/app/build-mode.js';

describe('?nocards', () => {
  it('skips the intro cards when enabled and asked for', () => {
    expect(skipsIntroCards('?floor=3&nocards', true)).toBe(true);
  });

  it('is ignored without the param', () => {
    expect(skipsIntroCards('?floor=3', true)).toBe(false);
  });

  it('is ignored in a build that does not enable it', () => {
    expect(skipsIntroCards('?nocards', false)).toBe(false);
  });
});
