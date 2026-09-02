import { Rng } from './rng.js';

/**
 * Independent random streams derived from one run seed.
 *
 * This matters far more than it looks. With a single shared generator, adding
 * one particle effect that rolls a random number shifts every subsequent draw —
 * so a cosmetic change silently rewrites every floor layout in the game and
 * invalidates every seed anybody has ever shared. Splitting the streams makes
 * randomness consumption a local concern: a system can draw as much as it likes
 * without moving anything else.
 *
 * The rule that follows from that: **a system draws from its own stream only.**
 */
export const RngStream = {
  /** Floor shape, room selection and placement. */
  Floor: 0,
  /** Item pools, pedestals, shop stock and loot rolls. */
  Items: 1,
  /** Enemy spawn choices and behaviour decisions. */
  Enemies: 2,
  /**
   * Anything with no effect on simulation outcome — particle jitter, debris,
   * voice-bark selection. Kept seeded anyway so replays look identical too.
   */
  Cosmetic: 3,
  /**
   * Character rules that roll (#47) — today only Der Wolpertinger's
   * per-floor stat reroll. Its own stream for the reason the file's opening
   * comment gives: a chaos character drawing from `floor` would make every
   * room layout in the game depend on how many floors he had entered.
   */
  Character: 4,
  /** Whether a floor carries a curse (#49), and which one. */
  Curse: 5,
} as const;

export type RngStreamId = (typeof RngStream)[keyof typeof RngStream];

/**
 * Derives a stream's generator from the run seed.
 *
 * The stream id is folded into the seed with the same odd constant used for
 * seed expansion, so neighbouring stream ids give unrelated sequences rather
 * than sequences offset from one another.
 */
export function streamSeed(runSeed: number, stream: RngStreamId): number {
  return (Math.imul(runSeed ^ Math.imul(stream + 1, 0x9e3779b9), 0x85ebca6b) ^ stream) >>> 0;
}

/** Creates the generator for one stream of a run. */
export function createStreamRng(runSeed: number, stream: RngStreamId): Rng {
  return new Rng(streamSeed(runSeed, stream));
}

/**
 * Every stream of one run, created together.
 *
 * A run holds one of these; systems receive the stream they are entitled to
 * rather than the whole set, which keeps the "own stream only" rule enforceable
 * by reading a function signature.
 */
export interface RunRandom {
  readonly floor: Rng;
  readonly items: Rng;
  readonly enemies: Rng;
  readonly cosmetic: Rng;
  readonly character: Rng;
  readonly curse: Rng;
}

export function createRunRandom(runSeed: number): RunRandom {
  return {
    floor: createStreamRng(runSeed, RngStream.Floor),
    items: createStreamRng(runSeed, RngStream.Items),
    enemies: createStreamRng(runSeed, RngStream.Enemies),
    cosmetic: createStreamRng(runSeed, RngStream.Cosmetic),
    character: createStreamRng(runSeed, RngStream.Character),
    curse: createStreamRng(runSeed, RngStream.Curse),
  };
}
