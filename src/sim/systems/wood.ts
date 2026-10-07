import type { ApproachWoodBehaviour } from '../enemy/definition.js';
import type { GameSim } from '../game/sim.js';
import { chewSplinters } from '../particle/effects.js';
import { vectorLength } from '../math.js';
import { BLOCK_MATERIAL_WOOD, BLOCK_STRIDE, PIT_SIZE } from '../room/geometry.js';
import { nextWaypoint, straightClear, type Waypoint } from '../room/pathfind.js';
import { landing, pitIsSafe, plankEligible, relocateOffPit } from './pits.js';

/**
 * `approachWood` (#410, the Borkenkäfer): find the nearest wooden thing, walk
 * there, eat it. See `ApproachWoodBehaviour` for the rules, and
 * `sim/systems/pits.ts` for when a floor plank may be eaten into a pit.
 *
 * The body's whole plan lives in its `enemyMotion` slots (offsets below,
 * from the body's own `motionBase`), so a swarm is exactly as reproducible as
 * any other body: the target, how long it has eaten, and the waypoint the
 * pathfinder last chose on the way there.
 *
 * @hot — runs in the frame loop. Nothing in here may allocate; see the
 * `no-hot-allocation` rule in tools/eslint/.
 */

/** `enemyMotion` offsets, past the ones `sim/systems/enemy.ts` owns. */
export const MOTION_WOOD_TARGET = 16;
export const MOTION_WOOD_X = 17;
export const MOTION_WOOD_Y = 18;
export const MOTION_WOOD_EATEN = 19;
const MOTION_WOOD_WAY_X = 20;
const MOTION_WOOD_WAY_Y = 21;
const MOTION_WOOD_THINK = 22;
/** Slots `approachWood` adds to `ENEMY_MOTION_STRIDE`. */
export const WOOD_MOTION_SLOTS = 7;

/** `MOTION_WOOD_TARGET`: what the body is after. */
export const WOOD_TARGET_NONE = 0;
/** A wooden block; `MOTION_WOOD_X/Y` is a point inside it (its centre). */
export const WOOD_TARGET_BLOCK = 1;
/** A floor plank; `MOTION_WOOD_X/Y` is the tile's centre. */
export const WOOD_TARGET_PLANK = 2;
/** Nothing eligible: wandering until `MOTION_WOOD_THINK` runs out. */
const WOOD_TARGET_WANDER = 3;

/** Ticks a swarm with nothing to eat wanders before it looks again. */
const WANDER_TICKS = 60;
/** Ticks a swarm whose plank was just refused waits before it asks about the next. */
const RETRY_TICKS = 20;
/** Ticks between two pathfinder searches on the way to a target. */
const REPATH_TICKS = 8;
/** Ticks between two puffs of chewing splinters. */
const CHEW_EVERY_TICKS = 12;
/** Room units from a plank's centre that count as sitting on it. */
const PLANK_ARRIVE = 1.5;
/** Room units of gap to a block's face that count as touching it. */
const BLOCK_ARRIVE = 1.5;
/**
 * Ticks a plank the guard or the pathfinder refused stays off the menu
 * (`GameSim.plankRefusedUntil`). Long enough that a swarm does not re-ask
 * about the same plank every tick, short enough that one refused only
 * because the player stood next to it comes back.
 */
const REFUSE_TICKS = 180;

const waypoint: Waypoint = { x: 0, y: 0 };
/** The nearest point outside a block a body can stand at to eat it — module scratch. */
const standAt = new Float64Array(2);

/** One tick of `approachWood` for the body at `index`. Writes its velocity. */
export function stepApproachWood(
  sim: GameSim,
  index: number,
  behaviour: ApproachWoodBehaviour,
  speed: number,
  motionBase: number,
  selfX: number,
  selfY: number,
): void {
  const motion = sim.enemyMotion.data;
  const velocity = sim.velocity.data;
  const radius = sim.body.data[index * 2] ?? 0;

  let target = motion[motionBase + MOTION_WOOD_TARGET] ?? WOOD_TARGET_NONE;
  const targetX = motion[motionBase + MOTION_WOOD_X] ?? 0;
  const targetY = motion[motionBase + MOTION_WOOD_Y] ?? 0;
  // Still there? Another swarm, a bomb or a Boar may have got to it first.
  if (target === WOOD_TARGET_BLOCK && !sim.room.isWoodAt(targetX, targetY)) {
    target = forget(motion, motionBase);
  } else if (
    target === WOOD_TARGET_PLANK &&
    (sim.room.isPit(targetX, targetY) || sim.room.pitCount >= sim.tuning.pits.maxPerRoom)
  ) {
    target = forget(motion, motionBase);
  }

  const think = (motion[motionBase + MOTION_WOOD_THINK] ?? 0) - 1;
  motion[motionBase + MOTION_WOOD_THINK] = think;
  if (target === WOOD_TARGET_WANDER && think > 0) {
    velocity[index * 2] = (motion[motionBase] ?? 0) * speed;
    velocity[index * 2 + 1] = (motion[motionBase + 1] ?? 0) * speed;
    return;
  }
  if (target === WOOD_TARGET_NONE || target === WOOD_TARGET_WANDER) {
    target = chooseTarget(sim, index, motionBase, selfX, selfY, radius);
    if (target === WOOD_TARGET_NONE || target === WOOD_TARGET_WANDER) {
      // Nothing to eat, or the nearest plank was just refused: wander a
      // while either way. A refusal waits less — the next plank may well be
      // fine — but it does wait: the guard floods the room, and a swarm boxed
      // in by its own pits would otherwise ask about a plank every tick.
      const angle = sim.random.enemies.nextFloat() * Math.PI * 2;
      motion[motionBase] = Math.cos(angle);
      motion[motionBase + 1] = Math.sin(angle);
      motion[motionBase + MOTION_WOOD_THINK] =
        target === WOOD_TARGET_NONE ? RETRY_TICKS : WANDER_TICKS;
      motion[motionBase + MOTION_WOOD_TARGET] = WOOD_TARGET_WANDER;
      velocity[index * 2] = (motion[motionBase] ?? 0) * speed;
      velocity[index * 2 + 1] = (motion[motionBase + 1] ?? 0) * speed;
      return;
    }
  }

  const wantX = motion[motionBase + MOTION_WOOD_X] ?? 0;
  const wantY = motion[motionBase + MOTION_WOOD_Y] ?? 0;
  let goalX = wantX;
  let goalY = wantY;
  let arrived: boolean;
  if (target === WOOD_TARGET_BLOCK) {
    blockStandPoint(sim, wantX, wantY, selfX, selfY, radius);
    goalX = standAt[0] ?? wantX;
    goalY = standAt[1] ?? wantY;
    arrived = blockGap(sim, wantX, wantY, selfX, selfY) - radius <= BLOCK_ARRIVE;
  } else {
    arrived = vectorLength(wantX - selfX, wantY - selfY) <= Math.max(PLANK_ARRIVE, speed);
  }

  if (!arrived) {
    motion[motionBase + MOTION_WOOD_EATEN] = 0;
    walkTo(sim, index, motionBase, goalX, goalY, speed, selfX, selfY, radius);
    return;
  }

  velocity[index * 2] = 0;
  velocity[index * 2 + 1] = 0;
  const eaten = (motion[motionBase + MOTION_WOOD_EATEN] ?? 0) + 1;
  motion[motionBase + MOTION_WOOD_EATEN] = eaten;
  if (eaten % CHEW_EVERY_TICKS === 0) {
    chewSplinters(
      sim,
      target === WOOD_TARGET_PLANK ? wantX : goalX,
      target === WOOD_TARGET_PLANK ? wantY : goalY,
    );
  }
  if (target === WOOD_TARGET_BLOCK) {
    if (eaten >= behaviour.eatTicks.obstacle) {
      sim.breakBlockAt(wantX, wantY, true);
      forget(motion, motionBase);
    }
    return;
  }
  if (eaten < behaviour.eatTicks.plank) {
    return;
  }
  const column = sim.room.pitColumnAt(wantX);
  const row = sim.room.pitRowAt(wantY);
  forget(motion, motionBase);
  // The guard again, on the last bite: a pickup may have landed on the plank,
  // or the player stepped somewhere that makes it matter.
  if (!pitIsSafe(sim, column, row, index)) {
    refuse(sim, column, row);
    return;
  }
  // Somewhere to step off to as it gives way, asked with the pit open.
  sim.room.addPit(column, row);
  const canStepOff = relocateOffPit(sim, index, column, row);
  sim.room.removeLastPit();
  if (!canStepOff) {
    refuse(sim, column, row);
    return;
  }
  sim.transform.data[index * 4] = landing[0] ?? selfX;
  sim.transform.data[index * 4 + 1] = landing[1] ?? selfY;
  sim.openPit(column, row);
}

/**
 * How far into eating its target the body at `motionBase` is, `0`-`1`, or `0`
 * when it is not eating — the renderer darkens the plank by it (#410).
 */
export function enemyEatProgress(
  sim: GameSim,
  motionBase: number,
  eatTicks: ApproachWoodBehaviour['eatTicks'],
): number {
  const motion = sim.enemyMotion.data;
  const target = motion[motionBase + MOTION_WOOD_TARGET] ?? WOOD_TARGET_NONE;
  const eaten = motion[motionBase + MOTION_WOOD_EATEN] ?? 0;
  if (eaten <= 0) {
    return 0;
  }
  if (target === WOOD_TARGET_PLANK) {
    return Math.min(1, eaten / eatTicks.plank);
  }
  if (target === WOOD_TARGET_BLOCK) {
    return Math.min(1, eaten / eatTicks.obstacle);
  }
  return 0;
}

function forget(motion: Float32Array, motionBase: number): number {
  motion[motionBase + MOTION_WOOD_TARGET] = WOOD_TARGET_NONE;
  motion[motionBase + MOTION_WOOD_EATEN] = 0;
  motion[motionBase + MOTION_WOOD_THINK] = 0;
  return WOOD_TARGET_NONE;
}

function refuse(sim: GameSim, column: number, row: number): void {
  const tile = tileIndex(sim, column, row);
  if (tile >= 0) {
    sim.plankRefusedUntil[tile] = sim.tick + REFUSE_TICKS;
  }
}

function tileIndex(sim: GameSim, column: number, row: number): number {
  const columns = Math.ceil((sim.room.maxX - sim.room.minX) / PIT_SIZE);
  const tile = row * columns + column;
  return tile >= 0 && tile < sim.plankRefusedUntil.length ? tile : -1;
}

/**
 * Picks what to eat: the nearest wooden block, else the nearest plank the
 * guard allows, else wandering. Returns the new `MOTION_WOOD_TARGET`, having
 * written the target's point — or `WOOD_TARGET_NONE` when the nearest plank
 * was just refused, which the caller waits out (`RETRY_TICKS`) before the
 * next one is asked about.
 */
function chooseTarget(
  sim: GameSim,
  index: number,
  motionBase: number,
  selfX: number,
  selfY: number,
  radius: number,
): number {
  const motion = sim.enemyMotion.data;
  const room = sim.room;
  motion[motionBase + MOTION_WOOD_EATEN] = 0;
  motion[motionBase + MOTION_WOOD_THINK] = 0;

  let bestBlock = -1;
  let bestSq = Infinity;
  for (let block = 0; block < room.blockCount; block++) {
    if (
      (room.blockOverflyable[block] ?? 0) !== 1 ||
      room.blockMaterial[block] !== BLOCK_MATERIAL_WOOD
    ) {
      continue;
    }
    const base = block * BLOCK_STRIDE;
    const dx = ((room.blocks[base] ?? 0) + (room.blocks[base + 2] ?? 0)) / 2 - selfX;
    const dy = ((room.blocks[base + 1] ?? 0) + (room.blocks[base + 3] ?? 0)) / 2 - selfY;
    const distSq = dx * dx + dy * dy;
    if (distSq < bestSq) {
      bestSq = distSq;
      bestBlock = block;
    }
  }
  if (bestBlock >= 0) {
    const base = bestBlock * BLOCK_STRIDE;
    const centreX = ((room.blocks[base] ?? 0) + (room.blocks[base + 2] ?? 0)) / 2;
    const centreY = ((room.blocks[base + 1] ?? 0) + (room.blocks[base + 3] ?? 0)) / 2;
    blockStandPoint(sim, centreX, centreY, selfX, selfY, radius);
    // Walled off (a log behind a ring of rocks): eat planks meanwhile.
    if (
      nextWaypoint(
        room,
        selfX,
        selfY,
        standAt[0] ?? centreX,
        standAt[1] ?? centreY,
        radius,
        waypoint,
      )
    ) {
      motion[motionBase + MOTION_WOOD_TARGET] = WOOD_TARGET_BLOCK;
      motion[motionBase + MOTION_WOOD_X] = centreX;
      motion[motionBase + MOTION_WOOD_Y] = centreY;
      return WOOD_TARGET_BLOCK;
    }
  }

  if (!sim.floorIsWood || room.pitCount >= sim.tuning.pits.maxPerRoom) {
    return WOOD_TARGET_WANDER;
  }
  const columns = Math.floor((room.maxX - room.minX) / PIT_SIZE);
  const rows = Math.floor((room.maxY - room.minY) / PIT_SIZE);
  let bestColumn = -1;
  let bestRow = -1;
  bestSq = Infinity;
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const tile = tileIndex(sim, column, row);
      if (tile < 0 || (sim.plankRefusedUntil[tile] ?? 0) > sim.tick) {
        continue;
      }
      const dx = room.pitCentreX(column) - selfX;
      const dy = room.pitCentreY(row) - selfY;
      const distSq = dx * dx + dy * dy;
      if (distSq >= bestSq || !plankEligible(sim, column, row)) {
        continue;
      }
      bestSq = distSq;
      bestColumn = column;
      bestRow = row;
    }
  }
  if (bestColumn < 0) {
    return WOOD_TARGET_WANDER;
  }
  const plankX = room.pitCentreX(bestColumn);
  const plankY = room.pitCentreY(bestRow);
  if (
    // The pathfinder first: it is the cheaper of the two questions.
    !nextWaypoint(room, selfX, selfY, plankX, plankY, radius, waypoint) ||
    !pitIsSafe(sim, bestColumn, bestRow, index)
  ) {
    refuse(sim, bestColumn, bestRow);
    return WOOD_TARGET_NONE;
  }
  motion[motionBase + MOTION_WOOD_TARGET] = WOOD_TARGET_PLANK;
  motion[motionBase + MOTION_WOOD_X] = plankX;
  motion[motionBase + MOTION_WOOD_Y] = plankY;
  return WOOD_TARGET_PLANK;
}

/** Walks toward `(goalX, goalY)`, straight when it can, by the pathfinder when it cannot. */
function walkTo(
  sim: GameSim,
  index: number,
  motionBase: number,
  goalX: number,
  goalY: number,
  speed: number,
  selfX: number,
  selfY: number,
  radius: number,
): void {
  const motion = sim.enemyMotion.data;
  let wayX = goalX;
  let wayY = goalY;
  if (!straightClear(sim.room, selfX, selfY, goalX, goalY, radius)) {
    const think = motion[motionBase + MOTION_WOOD_THINK] ?? 0;
    if (think <= 0) {
      motion[motionBase + MOTION_WOOD_THINK] = REPATH_TICKS;
      if (nextWaypoint(sim.room, selfX, selfY, goalX, goalY, radius, waypoint)) {
        motion[motionBase + MOTION_WOOD_WAY_X] = waypoint.x;
        motion[motionBase + MOTION_WOOD_WAY_Y] = waypoint.y;
      } else {
        // The way there closed (another pit, a body): pick again.
        forget(motion, motionBase);
        motion[motionBase + MOTION_WOOD_WAY_X] = selfX;
        motion[motionBase + MOTION_WOOD_WAY_Y] = selfY;
      }
    }
    wayX = motion[motionBase + MOTION_WOOD_WAY_X] ?? selfX;
    wayY = motion[motionBase + MOTION_WOOD_WAY_Y] ?? selfY;
  }
  const dx = wayX - selfX;
  const dy = wayY - selfY;
  const length = vectorLength(dx, dy);
  // Never overshoot: a plank is sat on, not run across.
  const step = Math.min(speed, length);
  const velocity = sim.velocity.data;
  velocity[index * 2] = length === 0 ? 0 : (dx / length) * step;
  velocity[index * 2 + 1] = length === 0 ? 0 : (dy / length) * step;
  if (length > 0) {
    motion[motionBase] = dx / length;
    motion[motionBase + 1] = dy / length;
  }
}

/** The index of the wooden block containing `(x, y)`, or -1. */
function woodBlockAt(sim: GameSim, x: number, y: number): number {
  const room = sim.room;
  for (let block = 0; block < room.blockCount; block++) {
    if (
      (room.blockOverflyable[block] ?? 0) !== 1 ||
      room.blockMaterial[block] !== BLOCK_MATERIAL_WOOD
    ) {
      continue;
    }
    const base = block * BLOCK_STRIDE;
    if (
      x >= (room.blocks[base] ?? 0) &&
      x <= (room.blocks[base + 2] ?? 0) &&
      y >= (room.blocks[base + 1] ?? 0) &&
      y <= (room.blocks[base + 3] ?? 0)
    ) {
      return block;
    }
  }
  return -1;
}

/** Distance from `(selfX, selfY)` to the face of the wooden block containing `(x, y)`. */
function blockGap(sim: GameSim, x: number, y: number, selfX: number, selfY: number): number {
  const block = woodBlockAt(sim, x, y);
  if (block < 0) {
    return Infinity;
  }
  const base = block * BLOCK_STRIDE;
  const blocks = sim.room.blocks;
  const nearestX = Math.min(Math.max(selfX, blocks[base] ?? 0), blocks[base + 2] ?? 0);
  const nearestY = Math.min(Math.max(selfY, blocks[base + 1] ?? 0), blocks[base + 3] ?? 0);
  return vectorLength(selfX - nearestX, selfY - nearestY);
}

/**
 * Where a body of `radius` stands to eat the wooden block containing
 * `(x, y)`: just off the face nearest it. Written to `standAt`.
 */
function blockStandPoint(
  sim: GameSim,
  x: number,
  y: number,
  selfX: number,
  selfY: number,
  radius: number,
): void {
  const block = woodBlockAt(sim, x, y);
  standAt[0] = x;
  standAt[1] = y;
  if (block < 0) {
    return;
  }
  const base = block * BLOCK_STRIDE;
  const blocks = sim.room.blocks;
  const minX = blocks[base] ?? 0;
  const minY = blocks[base + 1] ?? 0;
  const maxX = blocks[base + 2] ?? 0;
  const maxY = blocks[base + 3] ?? 0;
  const nearestX = Math.min(Math.max(selfX, minX), maxX);
  const nearestY = Math.min(Math.max(selfY, minY), maxY);
  let outX = selfX - nearestX;
  let outY = selfY - nearestY;
  let length = vectorLength(outX, outY);
  if (length === 0) {
    // Inside it somehow: out the way it was nearest to leaving.
    outX = selfX - x;
    outY = selfY - y;
    length = vectorLength(outX, outY);
    if (length === 0) {
      outX = 0;
      outY = 1;
      length = 1;
    }
  }
  standAt[0] = nearestX + (outX / length) * (radius + 1);
  standAt[1] = nearestY + (outY / length) * (radius + 1);
}
