import { describe, expect, it } from 'vitest';
import {
  MAX_ENTITY_SLOTS,
  MAX_GENERATION,
  NULL_ENTITY,
  entityGeneration,
  entityIndex,
  nextGeneration,
  packEntity,
} from '../../src/sim/ecs/entity.js';

describe('entity handles', () => {
  it('round-trips an index and generation', () => {
    for (const index of [0, 1, 42, 1000, MAX_ENTITY_SLOTS - 1]) {
      for (const generation of [1, 2, 999, MAX_GENERATION]) {
        const entity = packEntity(index, generation);
        expect(entityIndex(entity)).toBe(index);
        expect(entityGeneration(entity)).toBe(generation);
      }
    }
  });

  it('never mints the null handle for a real generation', () => {
    // Generation 0 is reserved, so slot 0 at any live generation is non-zero.
    for (let generation = 1; generation <= MAX_GENERATION; generation++) {
      expect(packEntity(0, generation)).not.toBe(NULL_ENTITY);
    }
  });

  it('gives distinct handles to the same slot across generations', () => {
    const seen = new Set<number>();
    for (let generation = 1; generation <= MAX_GENERATION; generation++) {
      seen.add(packEntity(7, generation));
    }
    expect(seen.size).toBe(MAX_GENERATION);
  });

  it('wraps the generation counter past 0, not onto it', () => {
    expect(nextGeneration(1)).toBe(2);
    expect(nextGeneration(MAX_GENERATION - 1)).toBe(MAX_GENERATION);
    // Wrapping onto 0 would make a stale handle collide with the null handle.
    expect(nextGeneration(MAX_GENERATION)).toBe(1);
  });

  it('stays inside the generation field for every step of a full cycle', () => {
    let generation = 1;
    for (let step = 0; step < MAX_GENERATION * 2; step++) {
      generation = nextGeneration(generation);
      expect(generation).toBeGreaterThanOrEqual(1);
      expect(generation).toBeLessThanOrEqual(MAX_GENERATION);
    }
  });
});
