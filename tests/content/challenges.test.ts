import { describe, expect, it } from 'vitest';
import { challengeWonStatKey } from '../../src/app/meta/definition.js';
import { CHALLENGES } from '../../src/content/progression/challenges.js';
import { MEDALS } from '../../src/content/progression/medals.js';

/** The challenge roster (#507): stable ids, a rule each, and a medal for every one. */
describe('challenge roster (#507)', () => {
  it('gives every challenge a unique id, a name and a rule', () => {
    const ids = CHALLENGES.map((challenge) => challenge.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const challenge of CHALLENGES) {
      expect(challenge.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(challenge.name.length, challenge.id).toBeGreaterThan(0);
      expect(challenge.description.length, challenge.id).toBeGreaterThan(0);
      expect(challenge.promilleFloor, challenge.id).toBeGreaterThanOrEqual(0);
      expect(challenge.timeLimitSeconds, challenge.id).toBeGreaterThanOrEqual(0);
      // A Promille floor in a run with no meter would be a rule that does nothing.
      if (!challenge.promille) {
        expect(challenge.promilleFloor, challenge.id).toBe(0);
      }
    }
  });

  it('has a medal for every challenge, spelled as the engine writes the statistic', () => {
    for (const challenge of CHALLENGES) {
      const medal = MEDALS.find(
        (entry) =>
          entry.condition.kind === 'statAtLeast' &&
          entry.condition.stat === challengeWonStatKey(challenge.id),
      );
      expect(medal, challenge.id).toBeDefined();
    }
    expect(MEDALS.some((medal) => medal.condition.kind === 'allChallenges')).toBe(true);
  });
});
