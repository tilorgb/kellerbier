import { describe, expect, it } from 'vitest';
import type { Rng } from '../../src/sim/rng/rng.js';
import {
  RngStream,
  createRunRandom,
  createStreamRng,
  streamSeed,
} from '../../src/sim/rng/streams.js';

const SEED = 0xc0ffee;

function drawMany(rng: Rng, count: number): number[] {
  const drawn: number[] = [];
  for (let draw = 0; draw < count; draw++) {
    drawn.push(rng.nextUint32());
  }
  return drawn;
}

describe('run streams', () => {
  it('gives the same streams for the same run seed', () => {
    expect(drawMany(createRunRandom(SEED).floor, 20)).toEqual(
      drawMany(createRunRandom(SEED).floor, 20),
    );
  });

  it('matches a recorded first draw per stream', () => {
    // Locked in for the same reason as the generator's own sequence: changing
    // how a stream seed is derived silently rewrites every shared seed.
    const run = createRunRandom(SEED);
    expect({
      floor: run.floor.nextUint32(),
      items: run.items.nextUint32(),
      enemies: run.enemies.nextUint32(),
      cosmetic: run.cosmetic.nextUint32(),
    }).toEqual({
      floor: 169129072,
      items: 2466268624,
      enemies: 3085934369,
      cosmetic: 2217403946,
    });
  });

  it('keeps the floor layout untouched when the cosmetic stream is consumed', () => {
    // This is the whole point of separate streams. Adding one particle effect
    // that rolls a random number must not move any other stream, or every seed
    // anybody has shared is invalidated by a cosmetic change.
    const baseline = drawMany(createRunRandom(SEED).floor, 32);

    const withEffects = createRunRandom(SEED);
    for (let draw = 0; draw < 5000; draw++) {
      withEffects.cosmetic.nextUint32();
    }
    expect(drawMany(withEffects.floor, 32)).toEqual(baseline);
  });

  it('keeps every stream independent of every other', () => {
    const streams = [RngStream.Floor, RngStream.Items, RngStream.Enemies, RngStream.Cosmetic];

    for (const consumed of streams) {
      const run = createRunRandom(SEED);
      const generators = {
        [RngStream.Floor]: run.floor,
        [RngStream.Items]: run.items,
        [RngStream.Enemies]: run.enemies,
        [RngStream.Cosmetic]: run.cosmetic,
      };

      for (let draw = 0; draw < 1000; draw++) {
        generators[consumed].nextUint32();
      }

      for (const other of streams) {
        if (other === consumed) {
          continue;
        }
        expect(
          drawMany(generators[other], 8),
          `draining stream ${String(consumed)} moved stream ${String(other)}`,
        ).toEqual(drawMany(createStreamRng(SEED, other), 8));
      }
    }
  });

  it('gives unrelated sequences to different streams of one run', () => {
    const run = createRunRandom(SEED);
    const floor = drawMany(run.floor, 128);
    const items = drawMany(run.items, 128);
    const enemies = drawMany(run.enemies, 128);
    const cosmetic = drawMany(run.cosmetic, 128);

    const all = new Set([...floor, ...items, ...enemies, ...cosmetic]);
    expect(all.size).toBe(512);
  });

  it('gives every stream of every seed a distinct starting point', () => {
    const seeds = new Set<number>();
    for (let runSeed = 0; runSeed < 500; runSeed++) {
      seeds.add(streamSeed(runSeed, RngStream.Floor));
      seeds.add(streamSeed(runSeed, RngStream.Items));
      seeds.add(streamSeed(runSeed, RngStream.Enemies));
      seeds.add(streamSeed(runSeed, RngStream.Cosmetic));
    }
    // 2,000 derived seeds in a 2^32 space: collisions would mean the
    // derivation is losing entropy somewhere.
    expect(seeds.size).toBe(2000);
  });

  it('produces stream seeds inside the unsigned 32-bit range', () => {
    for (let runSeed = 0; runSeed < 100; runSeed++) {
      const derived = streamSeed(runSeed, RngStream.Enemies);
      expect(Number.isInteger(derived)).toBe(true);
      expect(derived).toBeGreaterThanOrEqual(0);
      expect(derived).toBeLessThanOrEqual(0xffffffff);
    }
  });
});
