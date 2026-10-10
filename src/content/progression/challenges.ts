import type { ChallengeDefinition } from '../../app/meta/definition.js';

/**
 * The challenge runs (#507) — the first batch of #507's draft list, keeping
 * the names #50 gave them.
 *
 * **Left out for now**, by the same "nothing nobody can reach" rule as the
 * item, character and medal goals: Nur Brezn needs Resi, who is not offered
 * (#205), and Reinheitsgebot needs a run to start holding a chosen item,
 * which a challenge cannot yet ask for. Each lands when that does.
 *
 * Ids are permanent: the challenge's medal and its statistic are keyed by
 * them (`tests/content/challenges.test.ts`).
 */
export const CHALLENGES: readonly ChallengeDefinition[] = [
  {
    id: 'trocken',
    name: 'Trocken',
    description: 'No Promille all run — not even after the cellar boss',
    promille: false,
    promilleFloor: 0,
    timeLimitSeconds: 0,
  },
  {
    id: 'vollrausch',
    name: 'Vollrausch',
    description: 'Promille never drops below 3.0',
    promille: true,
    promilleFloor: 3,
    timeLimitSeconds: 0,
  },
  {
    id: 'sperrstunde',
    name: 'Sperrstunde',
    description: 'Win before closing time: 20 minutes for the whole run',
    promille: true,
    promilleFloor: 0,
    timeLimitSeconds: 20 * 60,
  },
];
