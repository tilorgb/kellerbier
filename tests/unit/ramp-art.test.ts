import { describe, expect, it } from 'vitest';
import {
  RAMP_BACK_HEIGHT,
  RAMP_FACE_WIDTH,
  RAMP_FRONT_HEIGHT,
  RAMP_SIDE_HEIGHT,
  RAMP_SIDE_WIDTH,
  rampLook,
  rampPixels,
} from '../../src/render/ramp-art.js';

describe('ramp art', () => {
  it('draws each view at its canvas size with something on it', () => {
    const sizes = {
      side: [RAMP_SIDE_WIDTH, RAMP_SIDE_HEIGHT],
      front: [RAMP_FACE_WIDTH, RAMP_FRONT_HEIGHT],
      back: [RAMP_FACE_WIDTH, RAMP_BACK_HEIGHT],
    } as const;
    for (const view of ['side', 'front', 'back'] as const) {
      const { width, height, data } = rampPixels(view);
      expect([width, height]).toEqual(sizes[view]);
      expect(data.length).toBe(width * height);
      expect(data.some((c) => c !== -1)).toBe(true);
    }
  });

  it('side profile rises to the right: the right edge is taller than the left', () => {
    const { width, height, data } = rampPixels('side');
    const filled = (x: number): number => {
      let n = 0;
      for (let y = 0; y < height; y++) {
        n += data[y * width + x] !== -1 ? 1 : 0;
      }
      return n;
    };
    expect(filled(width - 2)).toBeGreaterThan(filled(3) + 8);
  });

  it('picks the view and mirror from where the high edge points', () => {
    expect(rampLook(10, 0)).toEqual({ view: 'side', mirror: 1 });
    expect(rampLook(-10, 0)).toEqual({ view: 'side', mirror: -1 });
    expect(rampLook(0, 10)).toEqual({ view: 'front', mirror: 1 });
    expect(rampLook(0, -10)).toEqual({ view: 'back', mirror: 1 });
  });
});
