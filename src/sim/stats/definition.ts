/**
 * The six stats (#25), per `docs/GAME_DESIGN.md` §6.
 *
 * Its own module, separate from the pipeline math, so anything that needs to
 * name a stat — an item's `modifyStats` hook, a debug panel, a test — imports
 * identity rather than the resolver.
 */
export const StatId = {
  /** Damage per hit. */
  Damage: 'damage',
  /** Fire rate, stored as a tick delay — never a rate. See `tuning.ts`. */
  FireRate: 'fireRate',
  /** Range, as projectile lifetime in ticks. */
  Range: 'range',
  /** Shot speed, in pixels per tick. */
  ShotSpeed: 'shotSpeed',
  /** Move speed, in pixels per tick. */
  MoveSpeed: 'moveSpeed',
  /** Luck. Gates random proc chances; nothing reads it yet. */
  Luck: 'luck',
} as const;

export type StatId = (typeof StatId)[keyof typeof StatId];

/** Every stat, in the fixed order the debug overlay lists them. */
export const STAT_IDS: readonly StatId[] = [
  StatId.Damage,
  StatId.FireRate,
  StatId.Range,
  StatId.ShotSpeed,
  StatId.MoveSpeed,
  StatId.Luck,
];

/** Plain-English display name for each stat, for the debug overlay. */
export const STAT_LABELS: Readonly<Record<StatId, string>> = {
  [StatId.Damage]: 'Damage',
  [StatId.FireRate]: 'Fire Rate',
  [StatId.Range]: 'Range',
  [StatId.ShotSpeed]: 'Shot Speed',
  [StatId.MoveSpeed]: 'Move Speed',
  [StatId.Luck]: 'Luck',
};

/** The pipeline's starting point for every stat, before any modifier runs. */
export type BaseStats = Readonly<Record<StatId, number>>;
