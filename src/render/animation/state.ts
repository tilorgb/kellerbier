import type { GameSim } from '../../sim/game/sim.js';
import { ENEMY_MOTION_STRIDE, enemyTelegraphProgress } from '../../sim/systems/enemy.js';
import { AnimationState, type AnimationStateIndex } from './definition.js';

/**
 * Which animation state a body is in, derived from simulation state.
 *
 * Pure, in the sense the acceptance criterion on #150 asks for: it reads the
 * simulation and nothing else — no render-side memory, no wall clock, no
 * previous return value — so the same seed and the same input log produce the
 * same sequence of states at the same ticks, at any framerate, on any machine.
 * `render/animation/animator.ts` is where the *timing* lives, and timing is the
 * only thing about animation that a display's refresh rate is allowed to
 * change.
 *
 * `death` is deliberately not resolvable here. A dead enemy is not a body with
 * a flag on it — `World.destroy` frees the slot the tick it dies, and the
 * corpse the death clip plays on is a render-side object the animator owns
 * (see its corpse table). By the time anything could ask this function about a
 * dead entity, the entity is gone.
 */

/**
 * Movement below this many pixels per tick reads as standing still.
 *
 * Measured against what the simulation actually produces rather than picked:
 * the slowest thing in the roster moves an order of magnitude faster than
 * this, and separation push-apart (`sim/systems/collision.ts` nudging two
 * enemies out of each other) produces exactly the sub-pixel drift that would
 * otherwise flip a standing enemy into its walk cycle and back every few
 * frames.
 */
const MOVE_EPSILON_PX = 0.02;

/** Below this, a heading is not pointing anywhere in particular. */
const FACING_EPSILON = 0.001;

/**
 * Characters are authored facing **left**.
 *
 * Not an arbitrary pick: every character sprite in the game already is —
 * Kellerassel's antennae, Kuh's snout, Bierratte's head all sit at the left
 * edge of their strips. So `facing === -1` draws the art as authored and
 * `facing === 1` mirrors it, and no existing sprite had to be redrawn to
 * establish the convention.
 */
export const AUTHORED_FACING = -1;

/**
 * @hot — one call per animated body per frame, from `render/entities.ts`.
 */
export function resolveAnimationState(sim: GameSim, index: number): AnimationStateIndex {
  // A hit reads before anything else it interrupts. `flash` is the one-tick
  // white pop and `hitStun` the longer stagger the body cannot act through
  // (`GameSim.hitStun`); either one means "this body was just hit", and the
  // flinch pose is what makes a hit land visually even when the health bar is
  // off screen.
  if ((sim.flash.data[index] ?? 0) > 0 || (sim.hitStun.data[index] ?? 0) > 0) {
    return AnimationState.Hurt;
  }
  // The wind-up the telegraph ring is already drawn for. Sharing one source
  // means the pose and the ring can never disagree about how long the player
  // has to dodge.
  if (enemyTelegraphProgress(sim, index) > 0) {
    return AnimationState.Telegraph;
  }
  const dx = sim.positionX(index) - sim.previousX(index);
  const dy = sim.positionY(index) - sim.previousY(index);
  if (Math.abs(dx) > MOVE_EPSILON_PX || Math.abs(dy) > MOVE_EPSILON_PX) {
    return AnimationState.Move;
  }
  return AnimationState.Idle;
}

/**
 * Which way a body is facing: `-1` left, `1` right, or `0` for "no opinion,
 * keep whatever it was facing".
 *
 * Two sources, in order. The tick's own movement first, because that is what
 * the player sees. The enemy's stored heading second — `enemyMotion`'s heading
 * is simulation state that persists between ticks, so a body held still by
 * hit-stun or standing in its telegraph still faces the player rather than
 * snapping to a default. Only when both are silent does this return `0` and
 * let the caller hold the last value.
 *
 * That hold is the one piece of animator state that is not a function of the
 * current tick alone, and it is deliberately framerate-independent: it only
 * ever takes a value derived from the simulation, so rendering more often
 * cannot change what it holds — only how often it is sampled.
 *
 * @hot — one call per animated body per frame.
 */
export function resolveFacing(sim: GameSim, index: number): number {
  const dx = sim.positionX(index) - sim.previousX(index);
  if (Math.abs(dx) > MOVE_EPSILON_PX) {
    return dx < 0 ? -1 : 1;
  }
  const headingX = sim.enemyMotion.data[index * ENEMY_MOTION_STRIDE] ?? 0;
  if (Math.abs(headingX) > FACING_EPSILON) {
    return headingX < 0 ? -1 : 1;
  }
  return 0;
}
