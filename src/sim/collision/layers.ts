/**
 * Collision layers and what may touch what.
 *
 * A bullet hell's collision cost is decided here, before any broadphase runs.
 * The single most important line in this file is the one that is missing:
 * **projectiles never test against projectiles.** Five thousand projectiles
 * against each other is nine million pair tests a tick, for an interaction this
 * game does not have.
 */

export const CollisionLayer = {
  Player: 1 << 0,
  Enemy: 1 << 1,
  PlayerProjectile: 1 << 2,
  EnemyProjectile: 1 << 3,
  Pickup: 1 << 4,
  /** Destructible or solid props: barrels, crates, the training targets. */
  Obstacle: 1 << 5,
} as const;

export type CollisionLayerId = (typeof CollisionLayer)[keyof typeof CollisionLayer];

/** Every layer, for iteration and for the exhaustive matrix test. */
export const ALL_COLLISION_LAYERS: readonly CollisionLayerId[] = [
  CollisionLayer.Player,
  CollisionLayer.Enemy,
  CollisionLayer.PlayerProjectile,
  CollisionLayer.EnemyProjectile,
  CollisionLayer.Pickup,
  CollisionLayer.Obstacle,
];

/**
 * What each layer is allowed to interact with.
 *
 * Declared one way round and then symmetrised, because a matrix maintained in
 * both directions by hand is a matrix that eventually disagrees with itself.
 */
const DECLARED_PAIRS: readonly (readonly [CollisionLayerId, number])[] = [
  [CollisionLayer.PlayerProjectile, CollisionLayer.Enemy | CollisionLayer.Obstacle],
  [CollisionLayer.EnemyProjectile, CollisionLayer.Player | CollisionLayer.Obstacle],
  [CollisionLayer.Player, CollisionLayer.Enemy | CollisionLayer.Pickup | CollisionLayer.Obstacle],
];

/** Layer bit -> mask of layers it interacts with. Built once, at module load. */
const MASKS = buildMasks();

function buildMasks(): Map<CollisionLayerId, number> {
  const masks = new Map<CollisionLayerId, number>();
  for (const layer of ALL_COLLISION_LAYERS) {
    masks.set(layer, 0);
  }
  for (const [layer, mask] of DECLARED_PAIRS) {
    masks.set(layer, (masks.get(layer) ?? 0) | mask);
    for (const other of ALL_COLLISION_LAYERS) {
      if ((mask & other) !== 0) {
        masks.set(other, (masks.get(other) ?? 0) | layer);
      }
    }
  }
  return masks;
}

/** Everything `layer` may interact with, as a mask. */
export function collisionMaskFor(layer: CollisionLayerId): number {
  return MASKS.get(layer) ?? 0;
}

/** True when two layers are allowed to interact. Symmetric by construction. */
export function layersCollide(a: CollisionLayerId, b: CollisionLayerId): boolean {
  return (collisionMaskFor(a) & b) !== 0;
}
