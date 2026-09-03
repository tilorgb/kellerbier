import type { GameSim } from '../../../src/sim/game/sim.js';
import {
  InputAction,
  type InputFrame,
  createInputFrame,
  quantiseAxis,
  setActionDown,
} from '../../../src/sim/input/frame.js';

/**
 * The scripted player #54's own words ask for — "headless runs against
 * scripted play at several skill levels" — a heuristic, not a human: it
 * fights whatever enemy is nearest, holds a rough firing range instead of
 * walking into contact damage, and (`cautious` only) disengages instead of
 * trading hits once its health drops low. Two profiles, not a spectrum,
 * because a `retreatHealthFraction`/`engageRange` pair is already enough to
 * separate "never backs off" from "backs off under pressure" without
 * pretending either one models real player skill.
 */
export interface SkillProfile {
  readonly name: string;
  /** Desired distance to the nearest enemy while fighting, in px. Shots have a short lifetime (~105px, see `tests/fuzz/lib/harness.ts`'s doc comment), so this sits well inside that. */
  readonly engageRange: number;
  /** How much closer than `engageRange` triggers backing off to avoid a contact-damage hit. */
  readonly retreatMargin: number;
  /** Below this fraction of max health, disengage from the nearest enemy entirely instead of holding `engageRange`. `0` never disengages. */
  readonly panicHealthFraction: number;
}

export const SKILL_PROFILES: Readonly<Record<string, SkillProfile>> = {
  reckless: { name: 'reckless', engageRange: 70, retreatMargin: 24, panicHealthFraction: 0 },
  cautious: { name: 'cautious', engageRange: 110, retreatMargin: 36, panicHealthFraction: 0.45 },
};

interface NearestEnemy {
  readonly dx: number;
  readonly dy: number;
  readonly distance: number;
}

/** The nearest live enemy to the player, or `null` when none is up (mid-respawn, or the room is clear). */
function nearestEnemy(sim: GameSim): NearestEnemy | null {
  const playerX = sim.positionX(sim.playerIndex);
  const playerY = sim.positionY(sim.playerIndex);
  const nearest = { dx: 0, dy: 0, distanceSquared: Number.POSITIVE_INFINITY, found: false };
  sim.world.forEach(sim.enemyMask, (index) => {
    const dx = sim.positionX(index) - playerX;
    const dy = sim.positionY(index) - playerY;
    const distanceSquared = dx * dx + dy * dy;
    if (distanceSquared < nearest.distanceSquared) {
      nearest.dx = dx;
      nearest.dy = dy;
      nearest.distanceSquared = distanceSquared;
      nearest.found = true;
    }
  });
  return nearest.found
    ? { dx: nearest.dx, dy: nearest.dy, distance: Math.sqrt(nearest.distanceSquared) }
    : null;
}

function moveAxes(frame: InputFrame, dx: number, dy: number): void {
  const length = Math.hypot(dx, dy);
  if (length < 1) {
    return;
  }
  frame.moveX = quantiseAxis(dx / length);
  frame.moveY = quantiseAxis(dy / length);
}

function aimAxes(frame: InputFrame, dx: number, dy: number): void {
  const length = Math.hypot(dx, dy);
  if (length < 1) {
    return;
  }
  frame.aimX = quantiseAxis(dx / length);
  frame.aimY = quantiseAxis(dy / length);
  setActionDown(frame, InputAction.Fire, true);
}

/** How many ticks a circle-strafe half-orbit lasts before flipping direction. */
const CIRCLE_PERIOD_TICKS = 180;

/** The circling component's weight relative to the direct approach/retreat one — enough to route around a stationary obstacle between player and target without ever cancelling the radial move outright. */
const CIRCLE_STRAFE_WEIGHT = 0.6;

function circleSign(tick: number): number {
  return Math.floor(tick / CIRCLE_PERIOD_TICKS) % 2 === 0 ? 1 : -1;
}

/**
 * One tick's input while the current room has live enemies: aim and fire at
 * whichever is nearest, and hold roughly `skill.engageRange` away from it —
 * closing in when it's out of a shot's short range, backing off once
 * `panicHealthFraction` (or simple contact avoidance) says to.
 *
 * Always circles the target (`CIRCLE_STRAFE_WEIGHT`, flipping side every
 * `CIRCLE_PERIOD_TICKS`) rather than moving on the pure approach/retreat
 * line: without it, "hold position" inside the comfortable band means
 * standing dead still, and if a wall or block happens to sit between player
 * and target at that exact position/angle — this harness has no
 * line-of-sight check — every shot fired from a standstill misses forever.
 * Circling keeps the angle (and the position) changing even while holding
 * range, the same fix `moveTowardInput`'s stall-strafe applies to door
 * navigation, applied unconditionally here since a fight has no "not yet
 * stalled" grace period worth waiting out.
 */
export function combatInput(sim: GameSim, skill: SkillProfile, tick = 0): InputFrame {
  const frame = createInputFrame();
  const enemy = nearestEnemy(sim);
  if (enemy === null) {
    return frame;
  }
  aimAxes(frame, enemy.dx, enemy.dy);

  const healthFraction = sim.playerMaxHealth > 0 ? sim.playerHealth / sim.playerMaxHealth : 1;
  const panicking = skill.panicHealthFraction > 0 && healthFraction < skill.panicHealthFraction;

  let radialX = 0;
  let radialY = 0;
  if (panicking || enemy.distance < skill.engageRange - skill.retreatMargin) {
    radialX = -enemy.dx;
    radialY = -enemy.dy;
  } else if (enemy.distance > skill.engageRange) {
    radialX = enemy.dx;
    radialY = enemy.dy;
  }

  const sign = circleSign(tick);
  const perpX = -enemy.dy * sign;
  const perpY = enemy.dx * sign;
  moveAxes(frame, radialX + perpX * CIRCLE_STRAFE_WEIGHT, radialY + perpY * CIRCLE_STRAFE_WEIGHT);
  return frame;
}

/**
 * Ticks of no progress toward the current target before `moveTowardInput`
 * starts blending in a sideways push — long enough that ordinary movement
 * (accelerating from a stop, walking around a room's own irregular
 * boundary) never triggers it, short enough that a static obstacle (a
 * block, a prop) directly on the straight line to a door doesn't eat a
 * large share of the stuck-detection window before the bot tries anything
 * else.
 */
const STALL_STRAFE_AFTER_TICKS = 90;

/** How often the sideways push's side flips while still stalled — trying both sides of an obstacle in turn rather than committing to whichever the tie-break happened to favour. */
const STRAFE_FLIP_PERIOD_TICKS = 60;

/**
 * One tick's input while walking toward a door once the room is clear — no
 * target to fight, just movement toward a fixed point.
 *
 * A straight line to the target is only ever a heuristic, not a real path:
 * this harness has no navmesh and no obstacle map (see `harness.ts`'s doc
 * comment on known limitations), so a block or decorative prop sitting
 * directly between the player and the door stops the direct line dead —
 * `sim`'s own collision resolution only slides a wall-bound player along a
 * surface it's actually moving *across*, not one it's walking straight
 * into. `stallTicks` (the caller's own ticks-since-progress counter) is how
 * this notices: past `STALL_STRAFE_AFTER_TICKS` with no progress, it blends
 * in a push perpendicular to the direct line, flipping which side every
 * `STRAFE_FLIP_PERIOD_TICKS` so whichever side of the obstacle is actually
 * open eventually gets tried.
 */
export function moveTowardInput(
  sim: GameSim,
  targetX: number,
  targetY: number,
  stallTicks = 0,
): InputFrame {
  const frame = createInputFrame();
  const dx = targetX - sim.positionX(sim.playerIndex);
  const dy = targetY - sim.positionY(sim.playerIndex);
  let pushX = dx;
  let pushY = dy;
  if (stallTicks > STALL_STRAFE_AFTER_TICKS) {
    const sign = Math.floor(stallTicks / STRAFE_FLIP_PERIOD_TICKS) % 2 === 0 ? 1 : -1;
    pushX = dx - dy * sign;
    pushY = dy + dx * sign;
  }
  moveAxes(frame, pushX, pushY);
  return frame;
}
