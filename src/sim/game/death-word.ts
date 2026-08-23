import { DEATH_WORD_POOL } from '../../content/death-words.js';
import type { Rng } from '../rng/rng.js';

/**
 * Draws the game-over screen's headline word.
 *
 * Exactly one draw from `random`, always — never a variable number depending
 * on whether the roll happened to match `previous`. When `previous` is one of
 * the pool's words, the draw is taken over the *other* four: an index is
 * picked in the shortened range and shifted past the excluded slot, rather
 * than rerolling until it misses, which would make this draw consume a
 * different number of cosmetic-stream values from run to run for no reason
 * the player can see.
 *
 * `random` must be `sim.random.cosmetic` — see `docs/CONTENT_BIBLE.md` §7 for
 * why: a draw taken from any other stream would shift every later gameplay
 * roll and silently break seeded runs and replays.
 */
export function drawDeathWord(random: Rng, previous: string | undefined): string {
  const pool = DEATH_WORD_POOL;
  const excluded = previous === undefined ? -1 : pool.indexOf(previous);
  if (excluded === -1) {
    return pool[random.nextInt(0, pool.length)] ?? 'Umgfalln';
  }
  const index = random.nextInt(0, pool.length - 1);
  const shifted = index >= excluded ? index + 1 : index;
  return pool[shifted] ?? 'Umgfalln';
}
