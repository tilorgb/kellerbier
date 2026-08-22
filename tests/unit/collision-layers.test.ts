import { describe, expect, it } from 'vitest';
import {
  ALL_COLLISION_LAYERS,
  CollisionLayer,
  collisionMaskFor,
  layersCollide,
} from '../../src/sim/collision/layers.js';

/**
 * The matrix, asserted pair by pair.
 *
 * Written out in full rather than derived from the same table the
 * implementation uses — a test that recomputes the answer from the source of
 * the answer tests nothing. Every one of the 21 unordered pairs appears here.
 */
const EXPECTED: readonly (readonly [number, number, boolean])[] = [
  [CollisionLayer.Player, CollisionLayer.Player, false],
  [CollisionLayer.Player, CollisionLayer.Enemy, true],
  [CollisionLayer.Player, CollisionLayer.PlayerProjectile, false],
  [CollisionLayer.Player, CollisionLayer.EnemyProjectile, true],
  [CollisionLayer.Player, CollisionLayer.Pickup, true],
  [CollisionLayer.Player, CollisionLayer.Obstacle, true],

  [CollisionLayer.Enemy, CollisionLayer.Enemy, false],
  [CollisionLayer.Enemy, CollisionLayer.PlayerProjectile, true],
  [CollisionLayer.Enemy, CollisionLayer.EnemyProjectile, false],
  [CollisionLayer.Enemy, CollisionLayer.Pickup, false],
  [CollisionLayer.Enemy, CollisionLayer.Obstacle, false],

  [CollisionLayer.PlayerProjectile, CollisionLayer.PlayerProjectile, false],
  [CollisionLayer.PlayerProjectile, CollisionLayer.EnemyProjectile, false],
  [CollisionLayer.PlayerProjectile, CollisionLayer.Pickup, false],
  [CollisionLayer.PlayerProjectile, CollisionLayer.Obstacle, true],

  [CollisionLayer.EnemyProjectile, CollisionLayer.EnemyProjectile, false],
  [CollisionLayer.EnemyProjectile, CollisionLayer.Pickup, false],
  [CollisionLayer.EnemyProjectile, CollisionLayer.Obstacle, true],

  [CollisionLayer.Pickup, CollisionLayer.Pickup, false],
  [CollisionLayer.Pickup, CollisionLayer.Obstacle, false],

  [CollisionLayer.Obstacle, CollisionLayer.Obstacle, false],
];

describe('the collision layer matrix', () => {
  it('covers every unordered pair of layers', () => {
    const count = ALL_COLLISION_LAYERS.length;
    expect(EXPECTED).toHaveLength((count * (count + 1)) / 2);
  });

  it('agrees with the expected answer for every pair', () => {
    for (const [a, b, expected] of EXPECTED) {
      expect(layersCollide(a, b), `${String(a)} vs ${String(b)}`).toBe(expected);
    }
  });

  it('is symmetric', () => {
    for (const a of ALL_COLLISION_LAYERS) {
      for (const b of ALL_COLLISION_LAYERS) {
        expect(layersCollide(a, b)).toBe(layersCollide(b, a));
      }
    }
  });

  it('never tests a projectile against a projectile', () => {
    // The most expensive interaction the game does not have. Five thousand
    // projectiles against each other would be nine million tests a tick.
    const projectiles = [CollisionLayer.PlayerProjectile, CollisionLayer.EnemyProjectile];
    for (const a of projectiles) {
      for (const b of projectiles) {
        expect(layersCollide(a, b)).toBe(false);
      }
    }
  });

  it('never collides a layer with itself', () => {
    for (const layer of ALL_COLLISION_LAYERS) {
      expect((collisionMaskFor(layer) & layer) === 0).toBe(true);
    }
  });
});
