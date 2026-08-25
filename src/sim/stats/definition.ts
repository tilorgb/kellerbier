/**
 * The six stats (#25), per `docs/GAME_DESIGN.md` §6.
 *
 * Its own module, separate from the pipeline math, so anything that needs to
 * name a stat — an item's `modifyStats` hook, a debug panel, a test — imports
 * identity rather than the resolver.
 */
export const StatId = {
  /** Damage. Bavarian: original gravity. */
  Stammwuerze: 'stammwuerze',
  /** Fire rate, stored as a tick delay — never a rate. See `tuning.ts`. */
  Schluckfrequenz: 'schluckfrequenz',
  /** Range, as projectile lifetime in ticks. */
  Reichweite: 'reichweite',
  /** Shot speed, in pixels per tick. */
  Wurfkraft: 'wurfkraft',
  /** Move speed, in pixels per tick. */
  Gschwindigkeit: 'gschwindigkeit',
  /** Luck. Gates random proc chances; nothing reads it yet. */
  Dusel: 'dusel',
} as const;

export type StatId = (typeof StatId)[keyof typeof StatId];

/** Every stat, in the fixed order the debug overlay lists them. */
export const STAT_IDS: readonly StatId[] = [
  StatId.Stammwuerze,
  StatId.Schluckfrequenz,
  StatId.Reichweite,
  StatId.Wurfkraft,
  StatId.Gschwindigkeit,
  StatId.Dusel,
];

/** Bavarian display name for each stat, for the debug overlay. */
export const STAT_LABELS: Readonly<Record<StatId, string>> = {
  [StatId.Stammwuerze]: 'Stammwürze',
  [StatId.Schluckfrequenz]: 'Schluckfrequenz',
  [StatId.Reichweite]: 'Reichweite',
  [StatId.Wurfkraft]: 'Wurfkraft',
  [StatId.Gschwindigkeit]: 'Gschwindigkeit',
  [StatId.Dusel]: 'Dusel',
};

/** The pipeline's starting point for every stat, before any modifier runs. */
export type BaseStats = Readonly<Record<StatId, number>>;
