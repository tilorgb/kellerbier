import type { RideBehaviour } from '../enemy/definition.js';
import type { CompiledTransition, CompiledVolley } from '../enemy/registry.js';
import type { GameSim } from '../game/sim.js';
import { clamp, vectorLength } from '../math.js';

/**
 * The moves a boss is built from that no ordinary enemy needed (#412 Der
 * Waldradler, #413 Das Waldradl): riding with momentum and bouncing, a line
 * captured across the room and ridden edge to edge, a volley of landing points
 * around the player, a glide of fixed duration, and a weighted choice between
 * states that never repeats itself too often.
 *
 * Generic on purpose — nothing in here knows what a bike is — and, like
 * `wood.ts`, kept out of `enemy.ts` by taking the offsets it needs as arguments
 * rather than importing them (`enemy.ts` imports this file, not the other way
 * round). Every function is handed `motionBase`, where its body's row of the
 * `enemyMotion` component starts, and `block`, where this file's own slots
 * start inside it. Every random draw is from `random.enemies`, so a replay
 * reproduces the fight.
 *
 * @hot — called from the frame loop. Nothing in here may allocate; see the
 * `no-hot-allocation` rule in tools/eslint/.
 */

/** Slots this file keeps in a body's `enemyMotion` row, after everything else's. */
export const SCRIPTED_MOTION_SLOTS = 16;

/** Offsets from `block`. */
const RIDE_NEXT_TURN = 0;
/** The captured line: its start end (where the first pass begins) then its far end. */
const LINE_START_X = 1;
const LINE_START_Y = 2;
const LINE_FAR_X = 3;
const LINE_FAR_Y = 4;
/** The last state a `toOneOf` chose (as an index + 1; 0 for none yet) and how many times running. */
const PICK_LAST = 5;
const PICK_REPEATS = 6;
/** How many landing points a `lobVolley` captured, then them as x, y pairs. */
const VOLLEY_COUNT = 7;
const VOLLEY_POINTS = 8;

/** Room units from a target that count as having reached it. */
const ARRIVE_DISTANCE = 0.5;
/** Room units a volley's landing points keep from walls and blocks. */
const VOLLEY_MARGIN = 4;

/** Heading slots at the start of a body's motion row — what a body's art turns to face. */
function setHeading(sim: GameSim, motionBase: number, x: number, y: number): void {
  sim.enemyMotion.data[motionBase] = x;
  sim.enemyMotion.data[motionBase + 1] = y;
}

/**
 * One tick of `ride`: straight on at `speed` along the current heading, a new
 * uniformly random one every rolled `turnEveryTicks`, and a bounce — the blocked
 * component of the heading reflected — instead of a step into a wall.
 *
 * The heading never reads the player. A fresh state (`ticks === 0`) takes a new
 * heading at once, so coming out of a charge never resumes an axis-aligned one.
 */
export function stepRide(
  sim: GameSim,
  index: number,
  motionBase: number,
  block: number,
  ride: RideBehaviour,
  ticks: number,
  speedScale: number,
  selfX: number,
  selfY: number,
): void {
  const motion = sim.enemyMotion.data;
  const random = sim.random.enemies;
  if (ticks === 0 || ticks >= (motion[block + RIDE_NEXT_TURN] ?? 0)) {
    const angle = random.nextFloat() * Math.PI * 2;
    setHeading(sim, motionBase, Math.cos(angle), Math.sin(angle));
    const every = ride.turnEveryTicks;
    const wait =
      typeof every === 'number'
        ? every
        : every.min + Math.floor(random.nextFloat() * (every.max - every.min + 1));
    motion[block + RIDE_NEXT_TURN] = ticks + Math.max(1, Math.round(wait));
  }
  let headingX = motion[motionBase] ?? 1;
  let headingY = motion[motionBase + 1] ?? 0;
  const speed = ride.speed * speedScale;
  const radius = sim.body.data[index * 2] ?? 0;
  const room = sim.room;
  if (!room.isClear(selfX + headingX * speed, selfY, radius)) {
    headingX = -headingX;
  }
  if (!room.isClear(selfX, selfY + headingY * speed, radius)) {
    headingY = -headingY;
  }
  // Cornered — both ways out blocked after the bounce — stands still until the
  // next turn rather than sliding along the wall it is pressed into.
  const moving =
    room.isClear(selfX + headingX * speed, selfY + headingY * speed, radius) ||
    (headingX === (motion[motionBase] ?? 1) && headingY === (motion[motionBase + 1] ?? 0));
  setHeading(sim, motionBase, headingX, headingY);
  sim.velocity.data[index * 2] = moving ? headingX * speed : 0;
  sim.velocity.data[index * 2 + 1] = moving ? headingY * speed : 0;
}

/**
 * Captures the line (`captureLine`): horizontal or vertical by a coin from
 * `random.enemies`, through the player's position, edge to edge between the two
 * spots the body's centre can reach. Its start end is whichever of the two is
 * nearer the body — the shorter ride to where the first pass begins.
 *
 * A player standing within the body's radius of a wall gets a line clamped
 * onto the nearest ride the body can make; it still reaches them, since the
 * body is at least that wide.
 */
export function captureLine(
  sim: GameSim,
  index: number,
  block: number,
  selfX: number,
  selfY: number,
): void {
  const motion = sim.enemyMotion.data;
  const room = sim.room;
  const radius = sim.body.data[index * 2] ?? 0;
  const playerX = sim.positionX(sim.playerIndex);
  const playerY = sim.positionY(sim.playerIndex);
  const horizontal = sim.random.enemies.nextFloat() < 0.5;
  let lowX: number;
  let lowY: number;
  let highX: number;
  let highY: number;
  if (horizontal) {
    const y = clamp(playerY, room.minY + radius, room.maxY - radius);
    lowX = room.minX + radius;
    lowY = y;
    highX = room.maxX - radius;
    highY = y;
  } else {
    const x = clamp(playerX, room.minX + radius, room.maxX - radius);
    lowX = x;
    lowY = room.minY + radius;
    highX = x;
    highY = room.maxY - radius;
  }
  const lowFirst =
    vectorLength(lowX - selfX, lowY - selfY) <= vectorLength(highX - selfX, highY - selfY);
  motion[block + LINE_START_X] = lowFirst ? lowX : highX;
  motion[block + LINE_START_Y] = lowFirst ? lowY : highY;
  motion[block + LINE_FAR_X] = lowFirst ? highX : lowX;
  motion[block + LINE_FAR_Y] = lowFirst ? highY : lowY;
}

/** Which end of the captured line to head for. */
export const LineEnd = { Start: 0, Far: 1 } as const;
export type LineEndId = (typeof LineEnd)[keyof typeof LineEnd];

/**
 * One tick of straight riding to a point: `speed` per tick, snapping onto it on
 * arrival. Returns true on the tick the body arrives — `onArrived`'s signal.
 */
export function rideToPoint(
  sim: GameSim,
  index: number,
  motionBase: number,
  targetX: number,
  targetY: number,
  speed: number,
  selfX: number,
  selfY: number,
): boolean {
  const dx = targetX - selfX;
  const dy = targetY - selfY;
  const length = vectorLength(dx, dy);
  const velocity = sim.velocity.data;
  if (length <= ARRIVE_DISTANCE) {
    velocity[index * 2] = dx;
    velocity[index * 2 + 1] = dy;
    return true;
  }
  const step = Math.min(speed, length);
  velocity[index * 2] = (dx / length) * step;
  velocity[index * 2 + 1] = (dy / length) * step;
  setHeading(sim, motionBase, dx / length, dy / length);
  return false;
}

/** `rideToLineStart` / `rideLine`: one tick toward `end` of the captured line. True on arrival. */
export function rideAlongLine(
  sim: GameSim,
  index: number,
  motionBase: number,
  block: number,
  end: LineEndId,
  speed: number,
  selfX: number,
  selfY: number,
): boolean {
  const motion = sim.enemyMotion.data;
  const at = block + (end === LineEnd.Start ? LINE_START_X : LINE_FAR_X);
  return rideToPoint(
    sim,
    index,
    motionBase,
    motion[at] ?? selfX,
    motion[at + 1] ?? selfY,
    speed,
    selfX,
    selfY,
  );
}

/**
 * The captured line's two ends, written to `out` as startX, startY, farX, farY
 * — what the renderer stands the ramps on.
 */
export function readLine(sim: GameSim, block: number, out: Float64Array): void {
  const motion = sim.enemyMotion.data;
  out[0] = motion[block + LINE_START_X] ?? 0;
  out[1] = motion[block + LINE_START_Y] ?? 0;
  out[2] = motion[block + LINE_FAR_X] ?? 0;
  out[3] = motion[block + LINE_FAR_Y] ?? 0;
}

/**
 * One tick of `glideToPoint`: covers a share of what is left of the way so the
 * body arrives on the state's `total`-th tick whatever it started from. True
 * on that tick.
 */
export function glideToPoint(
  sim: GameSim,
  index: number,
  targetX: number,
  targetY: number,
  ticks: number,
  total: number,
  selfX: number,
  selfY: number,
): boolean {
  const remaining = Math.max(1, total - ticks);
  const velocity = sim.velocity.data;
  velocity[index * 2] = (targetX - selfX) / remaining;
  velocity[index * 2 + 1] = (targetY - selfY) / remaining;
  return remaining <= 1;
}

/**
 * Captures a volley's landing points (`lobVolley`): evenly spaced on a ring of
 * `ringRadius` about the player's position, the ring turned by a random angle.
 * A point that would be outside the room or inside a block takes its reflection
 * through the player instead, and failing that is clamped inside — so every
 * point is inside the room, and none is ever on top of the player unless the
 * room is smaller than the ring.
 */
export function captureVolley(sim: GameSim, block: number, volley: CompiledVolley): void {
  const motion = sim.enemyMotion.data;
  const random = sim.random.enemies;
  const room = sim.room;
  const playerX = sim.positionX(sim.playerIndex);
  const playerY = sim.positionY(sim.playerIndex);
  const count =
    volley.countMax === volley.countMin
      ? volley.countMin
      : volley.countMin + Math.floor(random.nextFloat() * (volley.countMax - volley.countMin + 1));
  const turn = random.nextFloat() * Math.PI * 2;
  motion[block + VOLLEY_COUNT] = count;
  for (let point = 0; point < count; point++) {
    const angle = turn + (point / count) * Math.PI * 2;
    const offsetX = Math.cos(angle) * volley.ringRadius;
    const offsetY = Math.sin(angle) * volley.ringRadius;
    let x = playerX + offsetX;
    let y = playerY + offsetY;
    if (!room.isClear(x, y, VOLLEY_MARGIN)) {
      const reflectedX = playerX - offsetX;
      const reflectedY = playerY - offsetY;
      if (room.isClear(reflectedX, reflectedY, VOLLEY_MARGIN)) {
        x = reflectedX;
        y = reflectedY;
      } else {
        x = clamp(x, room.minX + VOLLEY_MARGIN, room.maxX - VOLLEY_MARGIN);
        y = clamp(y, room.minY + VOLLEY_MARGIN, room.maxY - VOLLEY_MARGIN);
      }
    }
    motion[block + VOLLEY_POINTS + point * 2] = x;
    motion[block + VOLLEY_POINTS + point * 2 + 1] = y;
  }
}

/** How many landing points the body's last `lobVolley` captured. */
export function volleyCount(sim: GameSim, block: number): number {
  return Math.round(sim.enemyMotion.data[block + VOLLEY_COUNT] ?? 0);
}

/** Landing point `point` of the body's volley: its x (`axis` 0) or y (`axis` 1). */
export function volleyPoint(sim: GameSim, block: number, point: number, axis: 0 | 1): number {
  return sim.enemyMotion.data[block + VOLLEY_POINTS + point * 2 + axis] ?? 0;
}

/**
 * The state a `toOneOf` goes to: a weighted draw from `random.enemies` over its
 * choices, leaving out the one this body has already taken `maxInARow` times in
 * running — "never the same attack three times in a row" is `maxInARow: 2`.
 * Remembers what it chose, per body, for the next draw.
 */
export function chooseWeighted(
  sim: GameSim,
  block: number,
  transition: CompiledTransition,
): number {
  const choices = transition.choices;
  if (choices === undefined) {
    return transition.to;
  }
  const motion = sim.enemyMotion.data;
  const last = (motion[block + PICK_LAST] ?? 0) - 1;
  const repeats = motion[block + PICK_REPEATS] ?? 0;
  const limit = transition.maxInARow ?? 0;
  const banned = limit > 0 && repeats >= limit ? last : -1;
  let total = 0;
  for (const choice of choices) {
    if (choice.to !== banned) {
      total += choice.weight;
    }
  }
  let roll = sim.random.enemies.nextFloat() * total;
  let chosen = choices[0]?.to ?? transition.to;
  for (const choice of choices) {
    if (choice.to === banned) {
      continue;
    }
    chosen = choice.to;
    roll -= choice.weight;
    if (roll < 0) {
      break;
    }
  }
  if (chosen === last) {
    motion[block + PICK_REPEATS] = repeats + 1;
  } else {
    motion[block + PICK_LAST] = chosen + 1;
    motion[block + PICK_REPEATS] = 1;
  }
  return chosen;
}
