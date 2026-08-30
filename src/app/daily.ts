import { dailySeed } from '../sim/rng/daily.js';

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

/** Today's daily-run seed. */
export function todaysDailySeed(now: Date = new Date()): number {
  return dailySeed(dailyDateKey(now));
}
