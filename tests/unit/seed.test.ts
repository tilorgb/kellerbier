import { describe, expect, it } from 'vitest';
import { decodeSeed, encodeSeed } from '../../src/sim/rng/seed.js';

describe('seed strings', () => {
  it('round-trips every corner of the seed space', () => {
    for (const seed of [0, 1, 31, 32, 12345, 0xc0ffee, 0x7fffffff, 0xfffffffe, 0xffffffff]) {
      expect(decodeSeed(encodeSeed(seed)), `seed ${String(seed)}`).toBe(seed);
    }
  });

  it('round-trips a spread of arbitrary seeds', () => {
    for (let step = 0; step < 2000; step++) {
      const seed = (step * 2_147_483 + step) % 0x100000000;
      expect(decodeSeed(encodeSeed(seed))).toBe(seed);
    }
  });

  it('matches recorded encodings', () => {
    // Locked in: a change to the alphabet or the length silently invalidates
    // every seed anyone has written down.
    expect(encodeSeed(0)).toBe('0000000');
    expect(encodeSeed(1)).toBe('0000001');
    expect(encodeSeed(12345)).toBe('0000C1S');
    expect(encodeSeed(0xc0ffee)).toBe('00C1ZZE');
    expect(encodeSeed(0xffffffff)).toBe('3ZZZZZZ');
  });

  it('always produces a seven-character string', () => {
    for (const seed of [0, 5, 1023, 0xc0ffee, 0xffffffff]) {
      expect(encodeSeed(seed)).toHaveLength(7);
    }
  });

  it('never emits a character that can be misread', () => {
    // Crockford omits I, L, O and U precisely so a seed read off a screenshot
    // or dictated over voice chat cannot become a different seed.
    for (let seed = 0; seed < 5000; seed++) {
      expect(encodeSeed(seed)).toMatch(/^[0-9A-HJKMNP-TV-Z]{7}$/);
    }
  });

  it('accepts the characters people actually type', () => {
    const canonical = encodeSeed(0xc0ffee);
    expect(decodeSeed(canonical.toLowerCase())).toBe(0xc0ffee);
    expect(decodeSeed(` ${canonical} `)).toBe(0xc0ffee);
    expect(decodeSeed(`${canonical.slice(0, 3)}-${canonical.slice(3)}`)).toBe(0xc0ffee);
  });

  it('folds confusable characters to what the writer meant', () => {
    // O for zero, I and L for one — the classic transcription mistakes.
    expect(decodeSeed('OOOOOOO')).toBe(0);
    expect(decodeSeed('OOOOOOI')).toBe(1);
    expect(decodeSeed('OOOOOOL')).toBe(1);
    expect(decodeSeed('oooooo1')).toBe(1);
  });

  it('rejects a bad seed instead of silently starting a different run', () => {
    expect(() => decodeSeed('')).toThrow(/7 characters/);
    expect(() => decodeSeed('ABC')).toThrow(/7 characters/);
    expect(() => decodeSeed('ABCDEFGH')).toThrow(/7 characters/);
    // U is deliberately not in the alphabet and is not a folded character.
    expect(() => decodeSeed('UUUUUUU')).toThrow(/not a valid seed character/);
    expect(() => decodeSeed('ABCDE!G')).toThrow(/not a valid seed character/);
  });

  it('rejects the part of the string space with no seed behind it', () => {
    // Seven Base32 characters address 35 bits; seeds are 32.
    expect(() => decodeSeed('ZZZZZZZ')).toThrow(/out of range/);
    expect(() => decodeSeed('4000000')).toThrow(/out of range/);
    expect(decodeSeed('3ZZZZZZ')).toBe(0xffffffff);
  });

  it('rejects encoding something that is not a 32-bit seed', () => {
    expect(() => encodeSeed(-1)).toThrow(RangeError);
    expect(() => encodeSeed(1.5)).toThrow(RangeError);
    expect(() => encodeSeed(0x100000000)).toThrow(RangeError);
    expect(() => encodeSeed(Number.NaN)).toThrow(RangeError);
  });
});
