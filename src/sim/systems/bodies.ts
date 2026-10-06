import { CollisionLayer } from '../collision/layers.js';
import { World } from '../ecs/world.js';
import type { GameSim } from '../game/sim.js';
import { markEnemyBlocked } from './enemy.js';
import { BLOCKED_X, BLOCKED_Y, moveBody } from './motion.js';

/**
 * Everything that moves and is not the player.
 *
 * A knocked-back training target sliding across the floor, and every enemy: the
 * enemy system writes a velocity, this integrates it, and the walls stop it.
 * The one thing it reports back is having been stopped, which is what ends a
 * charge — see `markEnemyBlocked`.
 *
 * @hot — runs in the frame loop. Nothing in here may allocate; see the
 * `no-hot-allocation` rule in tools/eslint/.
 */
export function stepBodies(sim: GameSim): void {
  const world = sim.world;
  const states = world.states;
  const masks = world.masks;
  const required = sim.collidableMask;

  const transform = sim.transform.data;
  const velocity = sim.velocity.data;
  const push = sim.push.data;
  const body = sim.body.data;
  const collision = sim.collision.data;
  const damping = sim.tuning.movement.pushDamping;
  const room = sim.room;
  const streamCount = room.streamCount;
  const streamFactor = sim.tuning.enemy.streamSpeedFactor;
  const enemyMask = sim.enemyMask;

  const highWater = world.highWater;
  for (let index = 0; index < highWater; index++) {
    if (states[index] !== World.ALIVE) {
      continue;
    }
    if (((masks[index] ?? 0) & required) !== required) {
      continue;
    }
    // The player has their own movement system; this one must not fight it.
    if (((collision[index * 2] ?? 0) & CollisionLayer.Player) !== 0) {
      continue;
    }

    const transformBase = index * 4;
    const pairBase = index * 2;

    transform[transformBase + 2] = transform[transformBase] ?? 0;
    transform[transformBase + 3] = transform[transformBase + 1] ?? 0;

    const pushX = push[pairBase] ?? 0;
    const pushY = push[pairBase + 1] ?? 0;
    let velocityX = velocity[pairBase] ?? 0;
    let velocityY = velocity[pairBase + 1] ?? 0;

    if (pushX === 0 && pushY === 0 && velocityX === 0 && velocityY === 0) {
      continue;
    }

    // Floor 3's Waldbach (#403): an enemy wading moves at a fraction of the
    // speed its state asked for. Scaled here, at integration, rather than
    // written back into `velocity` — not every movement primitive rewrites
    // its velocity every tick (a wander only turns now and then), so scaling
    // the stored value would compound tick after tick. The push channel is
    // left alone: a knockback is not something the water should soften.
    if (
      streamCount > 0 &&
      ((masks[index] ?? 0) & enemyMask) === enemyMask &&
      room.isInStream(transform[transformBase] ?? 0, transform[transformBase + 1] ?? 0)
    ) {
      velocityX *= streamFactor;
      velocityY *= streamFactor;
    }

    const blocked = moveBody(
      room,
      transform,
      index,
      velocityX + pushX,
      velocityY + pushY,
      body[pairBase] ?? 0,
    );
    if ((blocked & BLOCKED_X) !== 0) {
      velocity[pairBase] = 0;
      push[pairBase] = 0;
    }
    if ((blocked & BLOCKED_Y) !== 0) {
      velocity[pairBase + 1] = 0;
      push[pairBase + 1] = 0;
    }
    // Read on the next tick by an `onBlocked` transition, which is how a charge
    // ends against a wall rather than grinding along it until its timer runs out.
    if (blocked !== 0 && ((masks[index] ?? 0) & enemyMask) === enemyMask) {
      markEnemyBlocked(sim, index);
    }

    const decayedX = (push[pairBase] ?? 0) * damping;
    const decayedY = (push[pairBase + 1] ?? 0) * damping;
    push[pairBase] = Math.abs(decayedX) < 0.05 ? 0 : decayedX;
    push[pairBase + 1] = Math.abs(decayedY) < 0.05 ? 0 : decayedY;
  }
}
