import { ROOM_TILE_UNITS } from '../content/rooms/definition.js';
import { STAT_IDS, StatId } from '../sim/stats/definition.js';
import { TICKS_PER_SECOND } from '../sim/time.js';
import { DEFAULT_MOVEMENT_TUNING, DEFAULT_SHOOTING_TUNING } from '../sim/tuning.js';

/**
 * The six resolved stats in the units a player reads them in, rather than the
 * ones the pipeline stores them in (`sim/stats/definition.ts`).
 *
 * The pipeline's units are chosen for the simulation, not for a person: fire
 * rate is a *delay* in ticks (lower is faster), range is a projectile's
 * lifetime in ticks, and both speeds are pixels per tick. A player looking at
 * "Fire Rate 6.67" has no way to tell that is better than "20". So this turns
 * every one of them into a number where **higher is always better** — which
 * is also what lets the stat column colour every delta the same way, green up
 * and red down, without a per-stat exception list:
 *
 * - **Damage** — per hit, as is.
 * - **Fire Rate** — shots per second.
 * - **Range** — how far a shot flies before it expires, in floor tiles
 *   (lifetime × shot speed). A shot-speed item therefore moves Range too,
 *   which is true: the shot does go further.
 * - **Shot Speed / Move Speed** — relative to the game's default tuning, so
 *   the stock character reads 1.00 and a Kraftbier's slow walk reads 0.80.
 *   Normalised to the *default* rather than to the live tuning on purpose: a
 *   debug-window slider moving the base should show up here as a change.
 * - **Luck** — as is.
 *
 * Pure, and in `render/` rather than `sim/`: nothing in the simulation ever
 * reads a stat in these units, and a conversion no gameplay code uses has no
 * business being a gameplay dependency.
 */
export function displayStatValue(stat: StatId, resolved: Readonly<Record<StatId, number>>): number {
  switch (stat) {
    case StatId.Damage:
      return resolved.damage;
    case StatId.FireRate:
      return resolved.fireRate > 0 ? TICKS_PER_SECOND / resolved.fireRate : 0;
    case StatId.Range:
      return (resolved.range * resolved.shotSpeed) / ROOM_TILE_UNITS;
    case StatId.ShotSpeed:
      return resolved.shotSpeed / DEFAULT_SHOOTING_TUNING.shotSpeed;
    case StatId.MoveSpeed:
      return resolved.moveSpeed / DEFAULT_MOVEMENT_TUNING.maxSpeed;
    case StatId.Luck:
      return resolved.luck;
  }
}

/**
 * `value` rounded to what the column prints — two decimals, Isaac's own
 * precision. Rounded before any comparison, so a float wobble in the
 * pipeline's fourth decimal place never flashes a "+0.00" delta.
 */
export function roundStat(value: number): number {
  return Math.round(value * 100) / 100;
}

/** A stat value as the column prints it: `3.50`. */
export function formatStat(value: number): string {
  return roundStat(value).toFixed(2);
}

/** A delta as the column prints it — always signed: `+1.40`, `-0.20`. */
export function formatStatDelta(delta: number): string {
  const rounded = roundStat(delta);
  return `${rounded >= 0 ? '+' : ''}${rounded.toFixed(2)}`;
}

/** Every stat's display value at once, in `STAT_IDS` order. Writes into `out` rather than allocating — this runs every frame. */
export function displayStatValues(
  resolved: Readonly<Record<StatId, number>>,
  out: number[],
): number[] {
  out.length = STAT_IDS.length;
  STAT_IDS.forEach((stat, index) => {
    out[index] = roundStat(displayStatValue(stat, resolved));
  });
  return out;
}
