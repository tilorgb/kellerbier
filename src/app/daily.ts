import { dailySeed } from '../sim/rng/daily.js';
import { DEFAULT_CHARACTER_ID } from './save/schema.js';

/**
 * "Today", for the daily run (#48) — the one piece of wall-clock reading
 * `sim/rng/daily.ts` itself is not allowed to do.
 *
 * UTC rather than the player's local midnight: a local-time boundary would
 * make the daily seed change at a different real-world moment in Munich than
 * in Tokyo, which breaks "the daily seed is identical for all players on a
 * given date" the moment two players are more than a few hours apart. UTC's
 * midnight is still *a* local midnight for everyone, just not each player's
 * own — the trade every daily-challenge game with a global playerbase makes
 * for the same reason.
 */
export function dailyDateKey(now: Date = new Date()): string {
  const year = String(now.getUTCFullYear()).padStart(4, '0');
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Every parameter of the daily run for `date` (#494) — the whole of what
 * makes it the same run for every player that day. Nothing here reads the
 * save: not the character they picked (always Alois), not the tier they have
 * reached (always 0), not the items they have earned (the full pool), not
 * whether they have Promille yet (on). Two players' dailies differ only in
 * how they play them.
 */
export interface DailyRunParameters {
  readonly date: string;
  readonly seed: number;
  readonly character: string;
  readonly tier: number;
  readonly lockedItems: readonly string[];
  readonly promilleUnlocked: boolean;
}

export function dailyRunParameters(date: string): DailyRunParameters {
  return {
    date,
    seed: dailySeed(date),
    character: DEFAULT_CHARACTER_ID,
    tier: 0,
    lockedItems: [],
    promilleUnlocked: true,
  };
}

/** Today's daily-run seed. */
export function todaysDailySeed(now: Date = new Date()): number {
  return dailySeed(dailyDateKey(now));
}
