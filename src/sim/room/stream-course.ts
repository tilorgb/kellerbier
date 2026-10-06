import { ROOM_TILE_UNITS } from '../../content/rooms/definition.js';
import type { RoomRect, StreamCourse, StreamCoursePoint } from './geometry.js';

/**
 * The course a Waldbach takes across a room (#424).
 *
 * #403 laid the stream as a straight band, wall to wall, and that is how it
 * read: a blue bar across the floor. A room's stream is still *placed* as
 * that band — authored in a template or laid by the generator — but the band
 * is now only the lane the water runs in. `meanderStream` turns it into a
 * course that drifts a tile or two either side of the lane as it crosses the
 * room, a tile or two wide, the way a brook finds its way across ground.
 *
 * The result is two views of one stream. `rects` is what the simulation
 * stands on — one tile-wide slice per step, the footing a body's centre is
 * tested against, stepped because footing is read in rectangles. `course` is
 * the same water as a centreline with a width, which is what the renderer
 * draws a smooth bank along and what a creature that lives in the water
 * (#408) swims.
 *
 * Deterministic from `seed` alone — no RNG stream is touched, because this
 * runs when a room is compiled, and a room compiles the same way every time
 * it is entered.
 */

export interface MeanderedStream {
  readonly rects: readonly RoomRect[];
  readonly course: StreamCourse;
}

/** How far, in tiles, the course may drift from the lane's own line. */
const DRIFT_TILES = 1.7;
/**
 * The furthest a slice can lie from its lane, in whole tiles: the drift
 * rounded up, plus the extra tile a one-tile lane may widen by. What a
 * generator has to keep clear either side of a lane it lays.
 */
export const STREAM_REACH_TILES = Math.ceil(DRIFT_TILES) + 1;
/** Steps from a lane's end over which the drift eases in from none — so a stream meets a wall, or its next piece, where the lane does. */
const EASE_STEPS = 2.5;

function stream(seed: number): () => number {
  let state = seed >>> 0;
  return (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let x = state;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** A seed for a lane from where it lies — two lanes in one room, or one lane in two rooms, wander differently. */
export function streamSeed(salt: number, lane: RoomRect): number {
  let hash = 0x811c9dc5 ^ (salt | 0);
  for (const value of [lane.minX, lane.minY, lane.maxX, lane.maxY]) {
    hash = Math.imul(hash ^ (Math.round(value) | 0), 0x01000193);
  }
  return hash >>> 0;
}

/**
 * The meandering course of the stream whose lane is `lane`.
 *
 * `bounds` is the room's interior: the course keeps a tile of dry ground
 * between itself and the walls it runs along. `blocked` says whether a slice
 * would lie under something solid — the course steps back toward the lane
 * rather than run under a log, and the lane itself is taken as given.
 */
export function meanderStream(
  lane: RoomRect,
  bounds: RoomRect,
  seed: number,
  blocked: (rect: RoomRect) => boolean,
): MeanderedStream {
  const tile = ROOM_TILE_UNITS;
  const alongX = lane.maxX - lane.minX >= lane.maxY - lane.minY;
  const from = alongX ? lane.minX : lane.minY;
  const to = alongX ? lane.maxX : lane.maxY;
  const laneCross = alongX ? lane.minY : lane.minX;
  const laneWidth = (alongX ? lane.maxY - lane.minY : lane.maxX - lane.minX) / tile;
  const laneTiles = Math.max(1, Math.round(laneWidth));
  const low = (alongX ? bounds.minY : bounds.minX) + tile;
  const high = (alongX ? bounds.maxY : bounds.maxX) - tile;
  const steps = Math.max(1, Math.round((to - from) / tile));
  const step = (to - from) / steps;

  const next = stream(seed);
  const phaseA = next() * Math.PI * 2;
  const phaseB = next() * Math.PI * 2;
  const phaseW = next() * Math.PI * 2;
  const cyclesA = 0.7 + next() * 0.7;
  const cyclesB = 1.8 + next() * 1.2;
  const cyclesW = 1 + next() * 1.5;

  const sliceAt = (index: number, drift: number, tiles: number): RoomRect => {
    const size = tiles * tile;
    // Inside the room's dry margin where the lane allows it; a lane that is
    // itself against a wall stays where it was put.
    const wanted = laneCross + drift * tile;
    const cross = Math.max(
      Math.min(low, laneCross),
      Math.min(wanted, Math.max(high - size, laneCross)),
    );
    const start = from + index * step;
    return alongX
      ? { minX: start, minY: cross, maxX: start + step, maxY: cross + size }
      : { minX: cross, minY: start, maxX: cross + size, maxY: start + step };
  };

  const rects: RoomRect[] = [];
  const points: StreamCoursePoint[] = [];
  const point = (along: number, rect: RoomRect): StreamCoursePoint => {
    const centre = alongX ? (rect.minY + rect.maxY) / 2 : (rect.minX + rect.maxX) / 2;
    const halfWidth = (alongX ? rect.maxY - rect.minY : rect.maxX - rect.minX) / 2;
    return alongX ? { x: along, y: centre, halfWidth } : { x: centre, y: along, halfWidth };
  };

  let previous = 0;
  for (let index = 0; index < steps; index++) {
    const t = (index + 0.5) / steps;
    const ease = Math.min(1, (index + 0.5) / EASE_STEPS, (steps - index - 0.5) / EASE_STEPS);
    const wave =
      0.75 * Math.sin(Math.PI * 2 * cyclesA * t + phaseA) +
      0.25 * Math.sin(Math.PI * 2 * cyclesB * t + phaseB);
    let drift = Math.round(ease * DRIFT_TILES * wave);
    // One tile at a time, so each slice shares an edge with the last.
    drift = Math.max(previous - 1, Math.min(previous + 1, drift));
    // Width wanders between one tile and two, slowly; at its ends the stream is the lane's own width.
    const widthWave = Math.sin(Math.PI * 2 * cyclesW * t + phaseW);
    let tiles = laneTiles;
    if (ease >= 1) {
      tiles = laneTiles <= 1 ? (widthWave > 0.55 ? 2 : 1) : widthWave < -0.55 ? 1 : 2;
    }
    let rect = sliceAt(index, drift, tiles);
    // Back toward the lane a tile at a time, and at the lane back to its own
    // width — the lane is clear by construction, the ground around it is not.
    while (blocked(rect) && (drift !== 0 || tiles !== laneTiles)) {
      if (drift !== 0) {
        drift -= Math.sign(drift);
      }
      if (drift === 0) {
        tiles = laneTiles;
      }
      rect = sliceAt(index, drift, tiles);
    }
    previous = drift;
    rects.push(rect);
    if (index === 0) {
      points.push(point(from, rect));
    }
    points.push(point(from + (index + 0.5) * step, rect));
    if (index === steps - 1) {
      points.push(point(to, rect));
    }
  }
  return { rects, course: { points } };
}

/** How far, in tiles, a bent course may drift from its lanes' line — less than a straight one, the bend is already a wander. */
const BEND_DRIFT_TILES = 0.9;
/** How finely a bent course is sampled, in room units. */
const BEND_STEP = ROOM_TILE_UNITS / 2;

function touching(a: RoomRect, b: RoomRect): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

/** The centre of where two touching lanes overlap — the corner the stream turns. */
function junction(a: RoomRect, b: RoomRect): { x: number; y: number } {
  return {
    x: (Math.max(a.minX, b.minX) + Math.min(a.maxX, b.maxX)) / 2,
    y: (Math.max(a.minY, b.minY) + Math.min(a.maxY, b.maxY)) / 2,
  };
}

/** The end of `lane`'s own centreline further from `from`. */
function farEnd(lane: RoomRect, from: { x: number; y: number }): { x: number; y: number } {
  const alongX = lane.maxX - lane.minX >= lane.maxY - lane.minY;
  const a = alongX
    ? { x: lane.minX, y: (lane.minY + lane.maxY) / 2 }
    : { x: (lane.minX + lane.maxX) / 2, y: lane.minY };
  const b = alongX
    ? { x: lane.maxX, y: (lane.minY + lane.maxY) / 2 }
    : { x: (lane.minX + lane.maxX) / 2, y: lane.maxY };
  return Math.hypot(a.x - from.x, a.y - from.y) >= Math.hypot(b.x - from.x, b.y - from.y) ? a : b;
}

/**
 * `lanes` in the order a stream runs through them, or null when they are not
 * one simple chain — a fork, a ring, or two lanes that do not touch.
 */
function chained(lanes: readonly RoomRect[]): RoomRect[] | null {
  const neighbours = lanes.map((lane, index) =>
    lanes.flatMap((other, at) => (at !== index && touching(lane, other) ? [at] : [])),
  );
  const ends = neighbours.flatMap((list, index) => (list.length === 1 ? [index] : []));
  if (ends.length !== 2 || neighbours.some((list) => list.length === 0 || list.length > 2)) {
    return null;
  }
  const order: number[] = [];
  let at: number | undefined = ends[0];
  while (at !== undefined) {
    order.push(at);
    const here: number = at;
    at = (neighbours[here] ?? []).find((candidate) => !order.includes(candidate));
  }
  return order.length === lanes.length ? order.flatMap((index) => lanes[index] ?? []) : null;
}

/**
 * The course of a stream authored as several lanes meeting end to end — a
 * bend (#424). Meandering each lane on its own left the bend a square
 * corner; this runs one course through all of them: the lanes' centrelines
 * joined at their corners, the corners rounded, and the whole line drifting
 * a little as it goes. Returns null when `lanes` is not a simple chain, and
 * the caller meanders each lane by itself.
 *
 * `origin` is the corner the tile grid is counted from (the lanes' cell), so
 * the footing lands on whole tiles.
 */
export function bendStream(
  lanes: readonly RoomRect[],
  bounds: RoomRect,
  origin: { readonly x: number; readonly y: number },
  seed: number,
  blocked: (rect: RoomRect) => boolean,
): MeanderedStream | null {
  const order = chained(lanes);
  const first = order?.[0];
  const last = order?.[order.length - 1];
  if (order === null || first === undefined || last === undefined || order.length < 2) {
    return null;
  }
  const tile = ROOM_TILE_UNITS;
  const corners = order.slice(0, -1).map((lane, index) => junction(lane, order[index + 1] ?? lane));
  const firstCorner = corners[0];
  const lastCorner = corners[corners.length - 1];
  if (firstCorner === undefined || lastCorner === undefined) {
    return null;
  }
  let line = [farEnd(first, firstCorner), ...corners, farEnd(last, lastCorner)];
  // Chaikin's corner cutting, ends kept: every square corner becomes a curve.
  for (let pass = 0; pass < 3; pass++) {
    const cut = [line[0] ?? firstCorner];
    for (let i = 0; i < line.length - 1; i++) {
      const a = line[i] ?? firstCorner;
      const b = line[i + 1] ?? firstCorner;
      if (i > 0) {
        cut.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 });
      }
      if (i < line.length - 2) {
        cut.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
      }
    }
    cut.push(line[line.length - 1] ?? lastCorner);
    line = cut;
  }
  // Resampled evenly along its length.
  const base = [line[0] ?? firstCorner];
  let untilNext = BEND_STEP;
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i] ?? firstCorner;
    const b = line[i + 1] ?? firstCorner;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    let d = untilNext;
    for (; d <= length; d += BEND_STEP) {
      base.push({ x: a.x + ((b.x - a.x) * d) / length, y: a.y + ((b.y - a.y) * d) / length });
    }
    untilNext = d - length;
  }
  // The line's own end is always the last sample — in place of one that fell
  // just short of it, which would leave a stub pointing nowhere in particular.
  const end = line[line.length - 1] ?? lastCorner;
  const tail = base[base.length - 1];
  if (
    base.length > 1 &&
    tail !== undefined &&
    Math.hypot(end.x - tail.x, end.y - tail.y) < BEND_STEP / 2
  ) {
    base.pop();
  }
  base.push(end);

  const laneHalf =
    Math.min(...order.map((lane) => Math.min(lane.maxX - lane.minX, lane.maxY - lane.minY))) / 2;
  const next = stream(seed);
  const phaseA = next() * Math.PI * 2;
  const phaseW = next() * Math.PI * 2;
  const cyclesA = 1.2 + next() * 1.2;
  const cyclesW = 1 + next() * 1.5;

  const build = (drift: number, widen: number): StreamCoursePoint[] =>
    base.map((point, index) => {
      const before = base[Math.max(0, index - 1)] ?? point;
      const after = base[Math.min(base.length - 1, index + 1)] ?? point;
      const length = Math.hypot(after.x - before.x, after.y - before.y) || 1;
      const t = index / (base.length - 1);
      const ease = Math.min(
        1,
        (index * BEND_STEP) / (EASE_STEPS * tile),
        ((base.length - 1 - index) * BEND_STEP) / (EASE_STEPS * tile),
      );
      const offset = ease * drift * tile * Math.sin(Math.PI * 2 * cyclesA * t + phaseA);
      const halfWidth =
        laneHalf + ease * widen * Math.max(0, Math.sin(Math.PI * 2 * cyclesW * t + phaseW));
      return {
        x: Math.max(
          bounds.minX,
          Math.min(bounds.maxX, point.x - ((after.y - before.y) / length) * offset),
        ),
        y: Math.max(
          bounds.minY,
          Math.min(bounds.maxY, point.y + ((after.x - before.x) / length) * offset),
        ),
        halfWidth,
      };
    });
  const over = (points: readonly StreamCoursePoint[]): boolean =>
    points.some((point) =>
      blocked({
        minX: point.x - point.halfWidth,
        minY: point.y - point.halfWidth,
        maxX: point.x + point.halfWidth,
        maxY: point.y + point.halfWidth,
      }),
    );
  // Wandering and widening first; if that runs under cover, the plain rounded line the lanes drew.
  let points = build(BEND_DRIFT_TILES, laneHalf >= tile ? 0 : tile / 2);
  if (over(points)) {
    points = build(0, 0);
  }

  // Footing: every tile whose centre the water reaches, joined into runs along each row.
  const cols = Math.ceil((bounds.maxX - origin.x) / tile);
  const rows = Math.ceil((bounds.maxY - origin.y) / tile);
  const rects: RoomRect[] = [];
  for (let row = 0; row < rows; row++) {
    let runStart = -1;
    for (let col = 0; col <= cols; col++) {
      const cx = origin.x + (col + 0.5) * tile;
      const cy = origin.y + (row + 0.5) * tile;
      const cell = {
        minX: cx - tile / 2,
        minY: cy - tile / 2,
        maxX: cx + tile / 2,
        maxY: cy + tile / 2,
      };
      const wet =
        col < cols &&
        cell.maxX <= bounds.maxX &&
        cell.maxY <= bounds.maxY &&
        points.some(
          (point) => Math.hypot(point.x - cx, point.y - cy) <= point.halfWidth + tile * 0.2,
        ) &&
        !blocked(cell);
      if (wet && runStart < 0) {
        runStart = col;
      } else if (!wet && runStart >= 0) {
        rects.push({
          minX: origin.x + runStart * tile,
          minY: origin.y + row * tile,
          maxX: origin.x + col * tile,
          maxY: origin.y + (row + 1) * tile,
        });
        runStart = -1;
      }
    }
  }
  return { rects, course: { points } };
}
