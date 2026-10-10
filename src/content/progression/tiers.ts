import type { TierDefinition } from '../../sim/game/difficulty.js';

/**
 * The difficulty ladder (#505): five rungs, each keeping everything below it
 * and adding one modifier — the draft order #505 proposed and the owner kept.
 * Every modifier is a system that already exists, read through
 * `sim/game/difficulty.ts`'s `DifficultyModifiers`; nothing here is a new
 * mechanic.
 *
 * "Tier 1-5" is a placeholder label, not a name: the owner names the ladder
 * later (`CLAUDE.md` — nothing gets a coined name). The numbers are first
 * guesses for the #159 playtest to tune, not tuned values.
 */
export const DIFFICULTY_TIERS: readonly TierDefinition[] = [
  {
    tier: 1,
    modifier: { kind: 'enemyShotSpeed', scale: 1.25 },
    description: 'Enemy shots fly faster',
  },
  {
    tier: 2,
    modifier: { kind: 'forcedCurse', floor: 1 },
    description: 'The first floor is always cursed',
  },
  {
    tier: 3,
    modifier: { kind: 'shopPrices', scale: 1.5 },
    description: 'Shops charge more',
  },
  {
    tier: 4,
    modifier: { kind: 'maxHealth', halfHearts: -2 },
    description: 'You start with one heart fewer',
  },
  {
    tier: 5,
    modifier: { kind: 'treasurePedestals', fewer: 1 },
    description: 'Treasure rooms hold one item fewer',
  },
];

/** The highest rung — what "beat the top tier" means. */
export const HIGHEST_TIER = 5;
