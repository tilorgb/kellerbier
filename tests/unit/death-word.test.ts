import { describe, expect, it } from 'vitest';
import { DEATH_WORD_POOL } from '../../src/content/death-words.js';
import { drawDeathWord } from '../../src/sim/game/death-word.js';
import { Rng } from '../../src/sim/rng/rng.js';

describe('death word draw', () => {
  it('always returns a word from the pool', () => {
    const random = new Rng(1);
    for (let draw = 0; draw < 50; draw++) {
      expect(DEATH_WORD_POOL).toContain(drawDeathWord(random, undefined));
    }
  });

  it("never repeats the previous run's word", () => {
    const random = new Rng(7);
    let previous: string | undefined;
    for (let run = 0; run < 200; run++) {
      const word = drawDeathWord(random, previous);
      if (previous !== undefined) {
        expect(word).not.toBe(previous);
      }
      previous = word;
    }
  });

  it('is deterministic for a fixed seed and previous word', () => {
    const first = drawDeathWord(new Rng(42), 'Hi');
    const second = drawDeathWord(new Rng(42), 'Hi');
    expect(first).toBe(second);
  });

  it('keeps casing exactly as authored', () => {
    expect(DEATH_WORD_POOL).toContain("f'reckt");
    expect(DEATH_WORD_POOL).toContain('dakerbelt');
    expect(DEATH_WORD_POOL).not.toContain("F'reckt");
  });
});
