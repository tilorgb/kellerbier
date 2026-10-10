/**
 * A challenge run's rules (#507), as the simulation applies them.
 *
 * Only the rules the sim itself has to enforce live here. A challenge's
 * other parameters — who plays it, whether the Promille mechanic exists at
 * all, which items are in the pool — are the ordinary run parameters the app
 * already passes (`character`, `promilleUnlocked`, `lockedItems`), set by
 * the challenge rather than by the player.
 */
export interface ChallengeRules {
  /**
   * The meter never reads below this (Vollrausch). The run starts there, and
   * nothing — a hit, the meter's own drift, sobering up after Umgfalln — can
   * take it lower. `0` is no floor.
   */
  readonly promilleFloor: number;
  /** The whole run ends when this many ticks have passed (Sperrstunde). `0` is no limit. */
  readonly timeLimitTicks: number;
}

export const NO_CHALLENGE: ChallengeRules = { promilleFloor: 0, timeLimitTicks: 0 };
