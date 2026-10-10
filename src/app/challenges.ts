import { CHALLENGES } from '../content/progression/challenges.js';
import type { ChallengeDefinition } from './meta/definition.js';
import { type ChallengeRules, NO_CHALLENGE } from '../sim/game/challenge.js';
import { TICKS_PER_SECOND } from '../sim/time.js';
import { DEFAULT_CHARACTER_ID } from './save/schema.js';

/**
 * Every parameter of a challenge run (#507) — the same fixed footing as the
 * daily (`app/daily.ts`): Alois, tier 0, the full item pool, nothing read
 * from the save. What changes per challenge is whether the Promille mechanic
 * exists at all, and the rules only the sim can hold (`ChallengeRules`).
 *
 * `promilleUnlockFloor` is spelled out because a sober run otherwise gets
 * the mid-run Promille unlock on floor 1's boss (#236) — exactly what
 * Trocken forbids.
 */
export interface ChallengeRunParameters {
  readonly challenge: string;
  readonly character: string;
  readonly tier: number;
  readonly lockedItems: readonly string[];
  readonly promilleUnlocked: boolean;
  /** `null`: no mid-run unlock in this run. */
  readonly promilleUnlockFloor: number | null;
  readonly rules: ChallengeRules;
}

export function challengeById(
  id: string,
  roster: readonly ChallengeDefinition[] = CHALLENGES,
): ChallengeDefinition | undefined {
  return roster.find((challenge) => challenge.id === id);
}

/** The rules `GameSim` enforces for `challenge` — `NO_CHALLENGE` for an unknown id. */
export function challengeRules(challenge: ChallengeDefinition | undefined): ChallengeRules {
  if (challenge === undefined) {
    return NO_CHALLENGE;
  }
  return {
    promilleFloor: challenge.promilleFloor,
    timeLimitTicks: Math.round(challenge.timeLimitSeconds * TICKS_PER_SECOND),
  };
}

export function challengeRunParameters(challenge: ChallengeDefinition): ChallengeRunParameters {
  return {
    challenge: challenge.id,
    character: DEFAULT_CHARACTER_ID,
    tier: 0,
    lockedItems: [],
    promilleUnlocked: challenge.promille,
    promilleUnlockFloor: null,
    rules: challengeRules(challenge),
  };
}
