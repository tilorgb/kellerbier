/**
 * Enemy size classes.
 *
 * Four of them, because size is the first thing a player reads about something
 * walking at them and it has to mean something consistent: how hard it is to
 * hit, how far it flies when hit, whether it can be walked through, and what it
 * costs to touch. The names are the reference points — a mini is an Isaac fly,
 * a normal is a worm, a mid is heavy enough to stop you, a boss fills a corner
 * of the screen.
 *
 * `boss` is its own class rather than a `mid` with a big sprite (`docs/
 * DECISIONS.md` #56): since #45 an authored pixel is an on-screen pixel, so a
 * boss drawn at a quarter of the frame needs a collider to match or
 * `tests/content/sprite-scale.test.ts` fails it — and a hitbox that large is a
 * real gameplay quantity (dodge spacing, knockback, contact separation), not a
 * rendering detail. The `mid` bosses that predate this class move onto it in
 * the same change (`content/enemies/grosse-kellerassel.ts`, `der-stier.ts`).
 *
 * This lives apart from `game/sim.ts` so that enemy *data* can name a size
 * without the definition types reaching into the running simulation, which
 * would be a cycle: the sim owns the registry, the registry reads the data.
 */

export const EnemySize = {
  Mini: 0,
  Normal: 1,
  Mid: 2,
  Boss: 3,
} as const;

export type EnemySizeId = (typeof EnemySize)[keyof typeof EnemySize];

/** How content names a size class. Content is data; it does not import values. */
export type EnemySizeName = 'mini' | 'normal' | 'mid' | 'boss';

export const ENEMY_SIZE_BY_NAME: Readonly<Record<EnemySizeName, EnemySizeId>> = {
  mini: EnemySize.Mini,
  normal: EnemySize.Normal,
  mid: EnemySize.Mid,
  boss: EnemySize.Boss,
};

export interface EnemyProfile {
  readonly radius: number;
  /** What knockback and contact separation are divided by. */
  readonly mass: number;
  readonly health: number;
  /**
   * Damage dealt by touching it, in half-Maß. Zero for the ones that are only
   * in the way — not everything that can be walked into is a threat, and a room
   * where every body hurts is a room with nowhere to stand.
   */
  readonly contactDamage: number;
}

/**
 * Masses are relative to the player's 1, and every one of them is above it.
 *
 * Even the smallest: a body light enough to walk through is a body that cannot
 * hold the player anywhere, and holding the player somewhere is the entire job
 * of a swarm. Three gnats at 1.2 each stop a run cold between them, which is
 * what makes the thing shooting from across the room dangerous.
 *
 * The health and contact damage here are the *defaults for a body of that
 * size*, used by the training targets and by anything spawned without a
 * definition. An authored enemy states its own; see `EnemyDefinition`.
 */
export const ENEMY_PROFILES: Readonly<Record<EnemySizeId, EnemyProfile>> = {
  [EnemySize.Mini]: { radius: 4, mass: 1.2, health: 1, contactDamage: 1 },
  [EnemySize.Normal]: { radius: 7, mass: 3, health: 2, contactDamage: 0 },
  [EnemySize.Mid]: { radius: 10, mass: 6, health: 4, contactDamage: 2 },
  // ~3x mid. Diameter 44 world units = 88 internal pixels, so a boss silhouette
  // between 53 and 158 internal pixels clears `sprite-scale.test.ts`'s 0.6-1.8
  // band — a body a quarter of the 360-tall frame lands mid-band. Mass is high
  // enough that a player's own bump never shoves one off a charge line; every
  // authored boss still overrides health and contact for its fight.
  [EnemySize.Boss]: { radius: 22, mass: 20, health: 12, contactDamage: 3 },
};
