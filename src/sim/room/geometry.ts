/**
 * Room geometry: the interior rectangle a body is confined to, plus solid
 * blocks inside it.
 *
 * This is the placeholder shape of a room until the template format arrives in
 * #18. It is intentionally the smallest thing collision and movement can be
 * built and tuned against: an inner bound and a list of boxes, both stored as
 * flat numbers so a system reads them without touching an object.
 */

/** Boxes one room may hold. Well above what a hand-authored room needs. */
export const MAX_ROOM_BLOCKS = 64;

/**
 * How wide a door gap is, in room units, centred on its wall.
 *
 * Single source of truth for both the door's drawn gap (`render/room.ts`) and
 * the door-contact trigger (`GameSim.doorContact`) — they have to agree on
 * where the gap is, or the wall would visibly open somewhere the player
 * can't actually walk through.
 */
export const DOOR_SPAN = 24;

/** Numbers per block: minX, minY, maxX, maxY. */
export const BLOCK_STRIDE = 4;

/** An axis-aligned rectangle, in room units. */
export interface RoomRect {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export class RoomGeometry {
  /** Interior bounds — the rectangle a body's centre-plus-radius must stay inside. */
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;

  /**
   * The grid slots a shape's bounding box doesn't claim (#107) — empty for a
   * fully-rectangular shape (`1x1`/`1x2`/`2x2`), one entry for `L` (#100's
   * #20 footprint: `2x2` minus a corner), several for `T` (#107: a 3x3 box
   * minus 4 corners), and for a diagonal staircase (#112) the two small
   * corner gaps at every seam between consecutive steps
   * (`sim/room/staircase.ts`'s `seamVoidRects`) — the slack `stepRects`'
   * union doesn't cover but this rectangle's bounding box does.
   *
   * Already carved out of `isClear`/collision as ordinary blocks (see
   * `sim/room/template.ts`'s `compileRoomTemplate`); this is exposed
   * separately so `render/room.ts`'s `createRoomView` can draw them in the
   * wall's own colour instead of as generic obstacles — they're the room's
   * boundary standing in for the cells the floor-grid footprint didn't
   * claim, not pillars sitting in the middle of the room. Not used for
   * camera clamping (`render/view.ts`'s `GameView.followOffset`) — a screen
   * is wider and taller than half of a `2x2`/`L`/`T` room, so the viewport
   * can never avoid them anyway, and treating them like any other wall
   * (visible at the screen edge near them, same as a `1x1` room's own
   * margin) is both simpler and correct.
   */
  readonly voidRects: readonly RoomRect[];

  /**
   * A diagonal staircase room's walkable area (#112): the union of its
   * per-step screen rects, each overlapping the next by real edge area
   * (`sim/room/staircase.ts`'s `compileStaircaseRoom`). Empty for every
   * other room. When non-empty, `isClear` *additionally* requires the whole
   * circle fit inside at least one step rect, on top of the ordinary
   * `voidRects`-derived `blocks` check above — belt and suspenders: the
   * `voidRects` gaps (`seamVoidRects`) are what `sim/systems/motion.ts`'s
   * primary wall resolver actually reads (it knows nothing about
   * `stepRects`), while this union check is what makes `isClear` itself
   * exact rather than merely "not inside a known gap" for every other
   * caller. Conservative right at a seam — see `isClear`'s comment. `minX`/
   * `minY`/`maxX`/`maxY` still hold the bounding box of every step, for
   * `roomFrameSize` and rendering.
   */
  readonly stepRects: readonly RoomRect[];

  /** Flat `[minX, minY, maxX, maxY]` runs. Read `blockCount * BLOCK_STRIDE` of it. */
  readonly blocks = new Float32Array(MAX_ROOM_BLOCKS * BLOCK_STRIDE);

  private blocks_ = 0;

  constructor(
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
    voidRects: readonly RoomRect[] = [],
    stepRects: readonly RoomRect[] = [],
  ) {
    this.minX = minX;
    this.minY = minY;
    this.maxX = maxX;
    this.maxY = maxY;
    this.voidRects = voidRects;
    this.stepRects = stepRects;
  }

  get blockCount(): number {
    return this.blocks_;
  }

  /** Adds a solid box. Setup-time only; the storage is fixed and never grows. */
  addBlock(minX: number, minY: number, maxX: number, maxY: number): void {
    if (this.blocks_ >= MAX_ROOM_BLOCKS) {
      throw new RangeError(`A room holds at most ${String(MAX_ROOM_BLOCKS)} blocks`);
    }
    const base = this.blocks_ * BLOCK_STRIDE;
    this.blocks[base] = minX;
    this.blocks[base + 1] = minY;
    this.blocks[base + 2] = maxX;
    this.blocks[base + 3] = maxY;
    this.blocks_ += 1;
  }

  /** True when a circle is inside the interior bounds and clear of every block. */
  isClear(centreX: number, centreY: number, radius: number): boolean {
    if (this.stepRects.length > 0) {
      // A staircase's interior bound is the *union* of its step rects, not
      // one rectangle (#112) — checking the circle sits fully within any
      // single step is sufficient (that step alone already contains it, so
      // the union does too), even though it is conservative right at a
      // seam: a circle straddling two steps without fitting fully inside
      // either is rejected here even where the union actually covers it.
      // That only ever costs a sliver of a step-and-a-half's overlap right
      // at the transition, never lets a circle poke through where there is
      // no floor at all, so it stays on the safe side of "no collision
      // gaps."
      let inAnyStep = false;
      for (const step of this.stepRects) {
        if (
          centreX - radius >= step.minX &&
          centreX + radius <= step.maxX &&
          centreY - radius >= step.minY &&
          centreY + radius <= step.maxY
        ) {
          inAnyStep = true;
          break;
        }
      }
      if (!inAnyStep) {
        return false;
      }
    } else if (
      centreX - radius < this.minX ||
      centreX + radius > this.maxX ||
      centreY - radius < this.minY ||
      centreY + radius > this.maxY
    ) {
      return false;
    }
    const blocks = this.blocks;
    for (let block = 0; block < this.blocks_; block++) {
      const base = block * BLOCK_STRIDE;
      const nearestX = clampTo(centreX, blocks[base] ?? 0, blocks[base + 2] ?? 0);
      const nearestY = clampTo(centreY, blocks[base + 1] ?? 0, blocks[base + 3] ?? 0);
      const dx = centreX - nearestX;
      const dy = centreY - nearestY;
      if (dx * dx + dy * dy < radius * radius) {
        return false;
      }
    }
    return true;
  }
}

function clampTo(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/**
 * The full authored extent of a room, wall band included — as opposed to
 * `minX`/`maxX`/etc, which are the *interior* a body is confined to.
 *
 * Every room is built with an equal margin on opposite sides (see
 * `sim/room/template.ts`'s fixed `ROOM_MARGIN_X`/`ROOM_MARGIN_Y`, and
 * `createPlaygroundRoom`'s `WALL_THICKNESS`), so the far margin is always
 * exactly `minX`/`minY` again — no separate field needs to carry this.
 *
 * #100: this is what the camera clamps to. A `1x1` room's extent is exactly
 * one screen (`render/resolution.ts`'s `INTERNAL_WIDTH`/`HEIGHT` at
 * `WORLD_ZOOM`), which is what makes the follow camera collapse to "never
 * move" there without a special case.
 */
export function roomFrameSize(room: RoomGeometry): {
  readonly width: number;
  readonly height: number;
} {
  return { width: room.minX + room.maxX, height: room.minY + room.maxY };
}
