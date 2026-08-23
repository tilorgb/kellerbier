import type { GameSim } from '../game/sim.js';
import { type InputFrame, axisToUnit } from '../input/frame.js';
import { type MovementTuning, accelerationOf, decelerationOf } from '../tuning.js';
import { vectorLength } from '../math.js';
import {
  BLOCKED_X,
  BLOCKED_Y,
  blockingEdgeMax,
  blockingEdgeMin,
  findBlockingEdgeX,
  findBlockingEdgeY,
  moveBody,
} from './motion.js';

/**
 * Player movement: acceleration toward a target velocity, friction when input
 * stops, and wall contact that slides.
 *
 * Momentum is the point. Instant velocity changes make dodging a toggle;
 * accelerating into a direction and sliding out of it makes it a commitment,
 * and that difference is most of why the genre feels the way it does. Every
 * constant behind it lives in `tuning.ts` and can be moved while the game runs.
 *
 * @hot — runs in the frame loop. Nothing in here may allocate; see the
 * `no-hot-allocation` rule in tools/eslint/.
 */
export function stepPlayerMovement(sim: GameSim, input: Readonly<InputFrame>): void {
  const index = sim.playerIndex;
  const tuning = sim.tuning.movement;

  const transform = sim.transform.data;
  const velocity = sim.velocity.data;
  const push = sim.push.data;

  const transformBase = index * 4;
  const pairBase = index * 2;

  const x = transform[transformBase] ?? 0;
  const y = transform[transformBase + 1] ?? 0;
  const radius = sim.body.data[pairBase] ?? 0;

  // The previous position is what the renderer interpolates from. It is written
  // before anything moves, every tick, so a frame drawn mid-tick is drawn
  // between two states that really happened.
  transform[transformBase + 2] = x;
  transform[transformBase + 3] = y;

  // Umgfalln (#17): a knocked-down player cannot steer. Zeroing input here
  // also quiets the corner-forgiveness nudge further down, which only acts
  // on a held direction — appropriate, since nobody is steering into a
  // corner to be forgiven for.
  const knockedDown = sim.umgfallnTicks > 0;
  const inputX = knockedDown ? 0 : axisToUnit(input.moveX);
  const inputY = knockedDown ? 0 : axisToUnit(input.moveY);

  let velocityX = velocity[pairBase] ?? 0;
  let velocityY = velocity[pairBase + 1] ?? 0;

  const driftScale = sim.promilleDriftScale;
  velocityX = approachAxis(velocityX, inputX * tuning.maxSpeed, inputX !== 0, tuning, driftScale);
  velocityY = approachAxis(velocityY, inputY * tuning.maxSpeed, inputY !== 0, tuning, driftScale);

  // The sampler already scales a diagonal stick or key pair to unit length, so
  // this only trims the overshoot a mid-turn direction change can produce.
  const speed = vectorLength(velocityX, velocityY);
  if (speed > tuning.maxSpeed) {
    const scale = tuning.maxSpeed / speed;
    velocityX *= scale;
    velocityY *= scale;
  }

  // Push is the external channel — firing kickback now, knockback and hit
  // reactions later. It is kept out of velocity so that clamping the player to
  // their top speed does not silently eat every impulse the game applies.
  const pushX = push[pairBase] ?? 0;
  const pushY = push[pairBase + 1] ?? 0;

  const blocked = moveBody(
    sim.room,
    transform,
    index,
    velocityX + pushX,
    velocityY + pushY,
    radius,
  );
  if ((blocked & BLOCKED_X) !== 0) {
    velocityX = 0;
    push[pairBase] = 0;
  }
  if ((blocked & BLOCKED_Y) !== 0) {
    velocityY = 0;
    push[pairBase + 1] = 0;
  }

  velocity[pairBase] = velocityX;
  velocity[pairBase + 1] = velocityY;
  decayPush(push, pairBase, sim.tuning.movement.pushDamping);

  // Corner forgiveness runs after resolution, on the axis that was *not*
  // blocked: a player held up by a few pixels of corner overlap is nudged clear
  // rather than left grinding against it.
  if (velocityX === 0 && inputX !== 0 && inputY === 0) {
    nudgeAroundCornerY(sim, index, Math.sign(inputX) * radius, radius, tuning);
  } else if (velocityY === 0 && inputY !== 0 && inputX === 0) {
    nudgeAroundCornerX(sim, index, Math.sign(inputY) * radius, radius, tuning);
  }
}

/**
 * Adds an impulse to a body's push channel.
 *
 * Impulses accumulate within a tick and decay geometrically after it, so a
 * shove reads as a shove rather than as a change of intent.
 */
export function addPush(sim: GameSim, index: number, x: number, y: number): void {
  const push = sim.push.data;
  const base = index * 2;
  let pushX = (push[base] ?? 0) + x;
  let pushY = (push[base + 1] ?? 0) + y;

  // Capped, because impulses arriving faster than they decay would otherwise
  // compound without limit. Nothing does that today; an item that pushes fire
  // rate very high would, and that item is on the roadmap.
  const limit = sim.tuning.movement.maxPush;
  const magnitude = vectorLength(pushX, pushY);
  if (magnitude > limit) {
    pushX = (pushX / magnitude) * limit;
    pushY = (pushY / magnitude) * limit;
  }

  push[base] = pushX;
  push[base + 1] = pushY;
}

/** Bleeds a push down toward nothing, and to exactly nothing near the end. */
function decayPush(push: Float32Array, base: number, damping: number): void {
  const x = (push[base] ?? 0) * damping;
  const y = (push[base + 1] ?? 0) * damping;
  // Below a twentieth of a pixel per tick a push is invisible, and letting it
  // asymptote forever leaves every body permanently, undetectably in motion.
  push[base] = Math.abs(x) < 0.05 ? 0 : x;
  push[base + 1] = Math.abs(y) < 0.05 ? 0 : y;
}

/**
 * Moves one velocity component toward its target.
 *
 * Accelerates while a direction is held and decelerates when it is not, both at
 * rates derived from the durations in the tuning. Reversing gets the turn boost,
 * because the tick count spent bleeding off the old direction is the part of
 * momentum that reads as sluggish rather than weighty.
 */
function approachAxis(
  current: number,
  target: number,
  held: boolean,
  tuning: Readonly<MovementTuning>,
  driftScale: number,
): number {
  let rate = held ? accelerationOf(tuning) : decelerationOf(tuning);
  if (held && current * target < 0) {
    rate *= tuning.turnBoost;
  }
  // Promille drift (#17): both acceleration and deceleration slow down, which
  // is what "momentum and steering degrade" means — a sluggish, sliding feel
  // rather than a lower top speed. 0 at Nüchtern/Angeheitert, ramping from
  // Beduselt — see `sim.promilleDriftScale`.
  if (driftScale > 0) {
    rate /= 1 + driftScale;
  }

  const delta = target - current;
  if (Math.abs(delta) <= rate) {
    return target;
  }
  return current + Math.sign(delta) * rate;
}

/**
 * Nudges a body along Y when a corner it nearly cleared is all that blocks it.
 *
 * `probeOffset` is the body's leading edge in the direction it is trying to go.
 * If a blocking edge is within the forgiveness distance of it, the body moves
 * toward clearing it — the difference between a doorway that feels precise and
 * one that feels like it is fighting you.
 */
function nudgeAroundCornerY(
  sim: GameSim,
  index: number,
  probeOffset: number,
  radius: number,
  tuning: Readonly<MovementTuning>,
): void {
  const transform = sim.transform.data;
  const base = index * 4;
  const centreX = transform[base] ?? 0;
  const centreY = transform[base + 1] ?? 0;
  if (!findBlockingEdgeY(sim.room, centreX + probeOffset, centreY, radius)) {
    return;
  }
  const nudge = clearanceNudge(
    centreY + radius - blockingEdgeMin(),
    blockingEdgeMax() - (centreY - radius),
    tuning,
  );
  if (nudge !== 0 && sim.room.isClear(centreX, centreY + nudge, radius)) {
    transform[base + 1] = centreY + nudge;
  }
}

/** The X counterpart of `nudgeAroundCornerY`. */
function nudgeAroundCornerX(
  sim: GameSim,
  index: number,
  probeOffset: number,
  radius: number,
  tuning: Readonly<MovementTuning>,
): void {
  const transform = sim.transform.data;
  const base = index * 4;
  const centreX = transform[base] ?? 0;
  const centreY = transform[base + 1] ?? 0;
  if (!findBlockingEdgeX(sim.room, centreX, centreY + probeOffset, radius)) {
    return;
  }
  const nudge = clearanceNudge(
    centreX + radius - blockingEdgeMin(),
    blockingEdgeMax() - (centreX - radius),
    tuning,
  );
  if (nudge !== 0 && sim.room.isClear(centreX + nudge, centreY, radius)) {
    transform[base] = centreX + nudge;
  }
}

/**
 * How far to nudge, given how deep the body overlaps each side of the blocker.
 *
 * Negative moves toward the lower coordinate. Zero means the overlap is too
 * deep to be a near miss — at that point the player is walking into a wall, not
 * clipping a corner, and steering them would be the game playing itself.
 */
function clearanceNudge(
  overlapLow: number,
  overlapHigh: number,
  tuning: Readonly<MovementTuning>,
): number {
  if (overlapLow > 0 && overlapLow <= tuning.cornerForgiveness) {
    return -Math.min(tuning.cornerNudgeSpeed, overlapLow);
  }
  if (overlapHigh > 0 && overlapHigh <= tuning.cornerForgiveness) {
    return Math.min(tuning.cornerNudgeSpeed, overlapHigh);
  }
  return 0;
}
