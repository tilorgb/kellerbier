/**
 * The simulation's only source of randomness.
 *
 * xoshiro128\*\* rather than PCG32. PCG32 carries 64 bits of state, which in
 * JavaScript means either BigInt (far too slow for a hot path) or hand-rolled
 * 64-bit arithmetic out of 32-bit halves. xoshiro128\*\* is four 32-bit words
 * and every operation is a native 32-bit one, so it maps onto `Math.imul` and
 * `Uint32Array` with nothing lost in translation. Its quality is more than this
 * game needs — we are rolling loot tables, not doing Monte Carlo integration.
 *
 * `Math.random` is banned under `src/sim/` by lint. Everything random that the
 * simulation observes has to come through here, or seeded runs, daily runs,
 * replays and reproducible bug reports all quietly stop working.
 */

/** Words of state in a xoshiro128\*\* generator. */
export const RNG_STATE_WORDS = 4;

function rotl32(value: number, bits: number): number {
  return ((value << bits) | (value >>> (32 - bits))) >>> 0;
}

/**
 * splitmix32, used only to expand a small seed into generator state.
 *
 * Seeding xoshiro directly from a counter gives correlated first outputs; a
 * mixing function avoids that, which is why "seed 1" and "seed 2" produce
 * unrelated runs rather than near-identical ones.
 */
export function splitmix32(input: number): number {
  let z = (input + 0x9e3779b9) | 0;
  z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
  z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
  return (z ^ (z >>> 15)) >>> 0;
}

export class Rng {
  private readonly state = new Uint32Array(RNG_STATE_WORDS);

  constructor(seed: number) {
    this.reseed(seed);
  }

  /** Resets the generator to the start of `seed`'s sequence. */
  reseed(seed: number): void {
    let mixer = seed | 0;
    for (let word = 0; word < RNG_STATE_WORDS; word++) {
      mixer = (mixer + 0x9e3779b9) | 0;
      this.state[word] = splitmix32(mixer);
    }
    // An all-zero state is xoshiro's one fixed point: it would emit zeroes
    // forever. Reachable only from a pathological seed, but cheap to exclude.
    if (this.state[0] === 0 && this.state[1] === 0 && this.state[2] === 0 && this.state[3] === 0) {
      this.state[0] = 1;
    }
  }

  /** The next raw 32-bit value. Every other method is built on this one. */
  nextUint32(): number {
    const state = this.state;
    const s0 = state[0] ?? 0;
    const s1 = state[1] ?? 0;
    const s2 = state[2] ?? 0;
    const s3 = state[3] ?? 0;

    const result = Math.imul(rotl32(Math.imul(s1, 5) >>> 0, 7), 9) >>> 0;
    const t = (s1 << 9) >>> 0;

    const next2 = s2 ^ s0;
    const next3 = s3 ^ s1;
    state[1] = s1 ^ next2;
    state[0] = s0 ^ next3;
    state[2] = next2 ^ t;
    state[3] = rotl32(next3, 11);

    return result;
  }

  /** A float in [0, 1). 32 bits of resolution, which is ample for game logic. */
  nextFloat(): number {
    return this.nextUint32() * 2.3283064365386963e-10;
  }

  /**
   * Fills `out[0..count)` with floats in [0, 1).
   *
   * The bulk form exists for one reason, and it is not convenience. A double
   * returned across a call boundary that V8 declines to inline is a boxed
   * `HeapNumber` — sixteen bytes, per draw, collected later. In cold code that
   * is invisible. In the particle spray it is four draws per particle at
   * several thousand particles a tick, and it measured 83 KB of garbage per
   * tick on the stress scene — two thirds of everything the simulation
   * allocated. Written straight into a `Float64Array` the values are never
   * tagged at all, and the same loop measures flat.
   *
   * Callers keep one scratch array and reuse it. `nextFloat` is still the
   * right thing to call from anywhere that runs once, or a handful of times,
   * a tick.
   */
  nextFloats(out: Float64Array, count: number): void {
    for (let draw = 0; draw < count; draw++) {
      out[draw] = this.nextUint32() * 2.3283064365386963e-10;
    }
  }

  /**
   * An integer in [minInclusive, maxExclusive).
   *
   * Exclusive upper bound, matching array indexing — `nextInt(0, items.length)`
   * is the common case and must not need a `- 1`.
   *
   * Rejection sampling rather than a modulo: a plain `% range` over-represents
   * the low end of the range, which across a whole game of loot tables is a
   * real bias and not a theoretical one. Rejection consumes a variable number
   * of draws, which is still perfectly deterministic for a given seed.
   */
  nextInt(minInclusive: number, maxExclusive: number): number {
    const range = maxExclusive - minInclusive;
    if (!Number.isInteger(minInclusive) || !Number.isInteger(maxExclusive)) {
      throw new RangeError(
        `nextInt bounds must be integers, got [${String(minInclusive)}, ${String(maxExclusive)})`,
      );
    }
    if (range <= 0) {
      throw new RangeError(
        `nextInt needs maxExclusive > minInclusive, got [${String(minInclusive)}, ${String(maxExclusive)})`,
      );
    }

    const limit = 0x100000000 - (0x100000000 % range);
    let draw = this.nextUint32();
    while (draw >= limit) {
      draw = this.nextUint32();
    }
    return minInclusive + (draw % range);
  }

  /** True with probability `p`. `chance(0)` is never true, `chance(1)` always. */
  chance(p: number): boolean {
    if (p <= 0) {
      return false;
    }
    if (p >= 1) {
      return true;
    }
    return this.nextFloat() < p;
  }

  /** A uniformly chosen element. Throws on an empty array. */
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) {
      throw new RangeError('pick needs a non-empty array');
    }
    return items[this.nextInt(0, items.length)] as T;
  }

  /**
   * An index chosen in proportion to its weight.
   *
   * The primitive behind `weightedPick`, kept separate so content can hold
   * weights in a parallel typed array rather than in objects.
   */
  weightedIndex(weights: readonly number[]): number {
    let total = 0;
    for (const weight of weights) {
      if (weight < 0 || !Number.isFinite(weight)) {
        throw new RangeError(`Weights must be finite and non-negative, got ${String(weight)}`);
      }
      total += weight;
    }
    if (total <= 0) {
      throw new RangeError('Weighted pick needs at least one positive weight');
    }

    let roll = this.nextFloat() * total;
    for (let index = 0; index < weights.length; index++) {
      roll -= weights[index] ?? 0;
      if (roll < 0) {
        return index;
      }
    }
    // Only reachable through floating-point accumulation at the very top of the
    // range. Fall back to the last entry that could actually be chosen.
    for (let index = weights.length - 1; index >= 0; index--) {
      if ((weights[index] ?? 0) > 0) {
        return index;
      }
    }
    throw new RangeError('Weighted pick needs at least one positive weight');
  }

  /** An entry chosen in proportion to its weight. */
  weightedPick<T>(entries: readonly { readonly value: T; readonly weight: number }[]): T {
    if (entries.length === 0) {
      throw new RangeError('weightedPick needs a non-empty table');
    }
    const weights: number[] = [];
    for (const entry of entries) {
      weights.push(entry.weight);
    }
    return entries[this.weightedIndex(weights)]?.value as T;
  }

  /** Fisher-Yates, in place. Returns the same array for convenience. */
  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = this.nextInt(0, i + 1);
      const a = items[i] as T;
      const b = items[j] as T;
      items[i] = b;
      items[j] = a;
    }
    return items;
  }

  /**
   * Copies the generator state out, for a save file or a replay header.
   *
   * Pass `out` to avoid allocating — this is called at save points, not in the
   * frame loop, but the pattern is the house style.
   */
  saveState(out = new Uint32Array(RNG_STATE_WORDS)): Uint32Array {
    if (out.length < RNG_STATE_WORDS) {
      throw new RangeError(`saveState needs at least ${String(RNG_STATE_WORDS)} words`);
    }
    out.set(this.state);
    return out;
  }

  /** Restores state captured by `saveState`, resuming the exact sequence. */
  loadState(state: Readonly<Uint32Array>): void {
    if (state.length < RNG_STATE_WORDS) {
      throw new RangeError(`loadState needs at least ${String(RNG_STATE_WORDS)} words`);
    }
    for (let word = 0; word < RNG_STATE_WORDS; word++) {
      this.state[word] = state[word] ?? 0;
    }
  }
}
