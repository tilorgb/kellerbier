import type { MedalDefinition } from '../../app/meta/definition.js';

/**
 * The medals (#506): goals worth bragging about, with no reward — the draft
 * list #506 proposed, built as written apart from what the shipped game
 * cannot yet produce.
 *
 * **Ids are permanent.** Steam achievements (#70) will map onto them 1:1, and
 * an earned id is kept in the save even if its row is cut, so a medal is
 * re-worded by changing its `goal`, never its `id`.
 *
 * **Left out until their feature ships**, the same rule the item and
 * character goals follow — a medal nobody can earn is a promise, not a goal:
 * "win a daily run" arrived once #494 had shipped the daily, the challenge
 * medals with #507.
 *
 * Statistic keys are literals for `content-is-data`'s reason (see
 * `item-unlocks.ts`); `tests/content/medals.test.ts` pins them.
 */
export const MEDALS: readonly MedalDefinition[] = [
  {
    id: 'tier-5',
    goal: 'Win on Tier 5',
    condition: { kind: 'tierWon', tier: 5, every: false },
  },
  {
    id: 'tier-5-everyone',
    goal: 'Win on Tier 5 with every character',
    condition: { kind: 'tierWon', tier: 5, every: true },
  },
  {
    id: 'boss-marks',
    goal: 'Light every boss mark for one character',
    condition: { kind: 'allBossMarks', every: false },
  },
  {
    id: 'boss-marks-everyone',
    goal: 'Light every boss mark for every character',
    condition: { kind: 'allBossMarks', every: true },
  },
  {
    id: 'all-items-unlocked',
    goal: 'Unlock every locked item',
    condition: { kind: 'allItemsUnlocked' },
  },
  {
    id: 'full-collection',
    goal: 'Find every item in the Collection',
    condition: { kind: 'collectionComplete' },
  },
  {
    id: 'untouched-by-bosses',
    goal: 'Win without a boss ever hitting you',
    condition: { kind: 'statAtLeast', stat: 'feat.win.noBossHits', value: 1 },
  },
  {
    id: 'quick-win',
    goal: 'Win in under 15 minutes',
    condition: { kind: 'winWithin', seconds: 15 * 60 },
  },
  {
    id: 'daily-win',
    goal: 'Win a daily run',
    condition: { kind: 'statAtLeast', stat: 'feat.win.daily', value: 1 },
  },
  // The challenge runs (#507): one medal each, and one for all of them.
  {
    id: 'challenge-trocken',
    goal: 'Win the Trocken challenge',
    condition: { kind: 'statAtLeast', stat: 'challenge.won.trocken', value: 1 },
  },
  {
    id: 'challenge-vollrausch',
    goal: 'Win the Vollrausch challenge',
    condition: { kind: 'statAtLeast', stat: 'challenge.won.vollrausch', value: 1 },
  },
  {
    id: 'challenge-sperrstunde',
    goal: 'Win the Sperrstunde challenge',
    condition: { kind: 'statAtLeast', stat: 'challenge.won.sperrstunde', value: 1 },
  },
  {
    id: 'challenges-all',
    goal: 'Win every challenge run',
    condition: { kind: 'allChallenges' },
  },
  {
    id: 'empty-handed',
    goal: 'Win without picking up a single item',
    condition: { kind: 'statAtLeast', stat: 'feat.win.noItems', value: 1 },
    hidden: true,
  },
];
