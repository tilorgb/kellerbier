import { describe, expect, it } from 'vitest';
import {
  STAT_WIN_DAILY,
  STAT_WIN_NO_BOSS_HITS,
  STAT_WIN_NO_ITEMS,
} from '../../src/app/meta/definition.js';
import { MEDALS } from '../../src/content/progression/medals.js';
import { HIGHEST_TIER } from '../../src/content/progression/tiers.js';

/**
 * The medal roster (#506) as content: stable, unique ids, a goal for each,
 * and only goals the shipped game can produce.
 */
describe('medal roster (#506)', () => {
  it('gives every medal a unique, stable-looking id and a goal', () => {
    const ids = MEDALS.map((medal) => medal.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const medal of MEDALS) {
      // Ids map onto Steam achievements (#70): lower case and dashes only.
      expect(medal.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(medal.goal.length, medal.id).toBeGreaterThan(0);
    }
  });

  it('asks only for tiers that exist', () => {
    for (const medal of MEDALS) {
      if (medal.condition.kind === 'tierWon') {
        expect(medal.condition.tier, medal.id).toBeLessThanOrEqual(HIGHEST_TIER);
      }
    }
  });

  it('spells its statistic keys as the engine writes them', () => {
    // `content-is-data` keeps the roster from importing these.
    const stats = MEDALS.flatMap((medal) =>
      medal.condition.kind === 'statAtLeast' ? [medal.condition.stat] : [],
    );
    for (const stat of stats) {
      // Challenge medals are pinned against their roster in challenges.test.ts.
      if (stat.startsWith('challenge.won.')) {
        continue;
      }
      expect([STAT_WIN_DAILY, STAT_WIN_NO_BOSS_HITS, STAT_WIN_NO_ITEMS], stat).toContain(stat);
    }
  });
});
