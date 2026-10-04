import { describe, expect, it } from 'vitest';
import { formatDamage } from '../../src/render/damage-numbers.js';

describe('formatDamage', () => {
  it('prints whole damage as it is and fractional damage to one decimal', () => {
    expect(formatDamage(1)).toBe('1');
    expect(formatDamage(0.8)).toBe('0.8');
    expect(formatDamage(1.6)).toBe('1.6');
    // Float32 noise on a whole number is still a whole number.
    expect(formatDamage(2.0000001)).toBe('2');
    expect(formatDamage(0.7 * 3)).toBe('2.1');
  });
});
