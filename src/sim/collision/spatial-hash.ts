/**
 * Uniform spatial hash over a room.
 *
 * The alternative is 5,000 projectiles against 200 enemies as a pairwise sweep:
 * a million tests a tick, for a game whose entire collision requirement is
 * circles overlapping circles. A uniform grid turns that into a handful of
 * candidates per projectile.
 *
 * Rebuilt from scratch every tick rather than maintained incrementally. Almost
 * everything in this game moves every tick, so an incremental structure would
 * spend more effort tracking cell changes than a rebuild costs — and a rebuild
 * cannot drift out of sync with the positions it indexes, which an incremental
 * one eventually does.
 *
 * ## Zero allocation
 *
 * Every array is sized at construction. The build is a counting sort: count how
 * many entries land in each cell, prefix-sum the counts into offsets, then fill
 * a single flat entry array. No per-cell arrays, no push, nothing to collect.
 *
 * @hot — runs in the frame loop. Nothing in here may allocate; see the
 * `no-hot-allocation` rule in tools/eslint/.
 */

/** Grid cell size. Sized to the largest common collider so a body spans few cells. */
export const DEFAULT_CELL_SIZE = 32;

export interface SpatialHashOptions {
  readonly width: number;
  readonly height: number;
  readonly cellSize?: number;
  /** Bodies the grid can index at once. */
  readonly capacity: number;
  /**
   * The largest collider the grid is sized for, in pixels.
   *
   * This is what fixes how many cells one body can occupy, and therefore how
   * much entry storage the grid preallocates. A body larger than this is
   * indexed as though it were this size — it would need a coarser grid, which
   * is a configuration decision rather than something to discover mid-frame —
   * and `overflows` reports that it happened.
   */
  readonly maxRadius?: number;
}

export class SpatialHash {
  readonly cellSize: number;
  readonly columns: number;
  readonly rows: number;
  readonly capacity: number;
  readonly maxRadius: number;

  /** Entries per cell, then prefix-summed into start offsets during `build`. */
  private readonly cellStart: Int32Array;
  /** Fill cursor per cell, used while scattering. */
  private readonly cellCursor: Int32Array;
  /** Body index per entry, grouped by cell. */
  private readonly entries: Int32Array;

  /** Staged bodies, held between `begin` and `build`. */
  private readonly bodyIndex: Int32Array;
  private readonly bodyMinCol: Int32Array;
  private readonly bodyMinRow: Int32Array;
  private readonly bodyMaxCol: Int32Array;
  private readonly bodyMaxRow: Int32Array;
  private bodyCount = 0;

  /**
   * Last query that visited each body. A body spanning several cells would
   * otherwise be reported once per shared cell, and a projectile would deal its
   * damage twice to the same enemy — a bug that only shows up on large enemies.
   */
  private readonly visitStamp: Int32Array;
  private queryStamp = 0;

  /** Bodies the grid could not index at full size: too many, or too large. */
  private overflowCount = 0;

  /**
   * Candidates handed to callers since the last rebuild.
   *
   * The number the broadphase exists to keep small. Against a full field it is
   * a few tens of thousands where a pairwise sweep would be a million, and it
   * is exact rather than timing-dependent — which makes it the honest thing to
   * assert on, and a useful line in the debug overlay.
   */
  private candidateCount = 0;

  constructor(options: SpatialHashOptions) {
    this.cellSize = options.cellSize ?? DEFAULT_CELL_SIZE;
    this.columns = Math.max(1, Math.ceil(options.width / this.cellSize));
    this.rows = Math.max(1, Math.ceil(options.height / this.cellSize));
    this.capacity = options.capacity;
    this.maxRadius = options.maxRadius ?? this.cellSize / 2;

    const cellCount = this.columns * this.rows;
    this.cellStart = new Int32Array(cellCount + 1);
    this.cellCursor = new Int32Array(cellCount + 1);

    // Entry storage is exact, not guessed: the widest a body of the declared
    // maximum radius can straddle, squared, times the body capacity.
    const span = Math.ceil((2 * this.maxRadius) / this.cellSize) + 1;
    this.entries = new Int32Array(options.capacity * span * span);

    this.bodyIndex = new Int32Array(options.capacity);
    this.bodyMinCol = new Int32Array(options.capacity);
    this.bodyMinRow = new Int32Array(options.capacity);
    this.bodyMaxCol = new Int32Array(options.capacity);
    this.bodyMaxRow = new Int32Array(options.capacity);
    this.visitStamp = new Int32Array(options.capacity);
  }

  get stagedCount(): number {
    return this.bodyCount;
  }

  get overflows(): number {
    return this.overflowCount;
  }

  /** Candidates reported since the last `begin`. */
  get candidatesReported(): number {
    return this.candidateCount;
  }

  /** Starts a rebuild. Everything staged before this is forgotten. */
  begin(): void {
    this.bodyCount = 0;
    this.candidateCount = 0;
    this.cellStart.fill(0);
  }

  /**
   * Stages one body. `index` is whatever the caller wants back from a query —
   * an ECS slot, a projectile slot — and is not interpreted here.
   */
  insert(index: number, x: number, y: number, radius: number): void {
    if (this.bodyCount >= this.capacity) {
      this.overflowCount += 1;
      return;
    }

    let indexedRadius = radius;
    if (indexedRadius > this.maxRadius) {
      this.overflowCount += 1;
      indexedRadius = this.maxRadius;
    }

    const minCol = this.columnOf(x - indexedRadius);
    const maxCol = this.columnOf(x + indexedRadius);
    const minRow = this.rowOf(y - indexedRadius);
    const maxRow = this.rowOf(y + indexedRadius);

    const slot = this.bodyCount;
    this.bodyIndex[slot] = index;
    this.bodyMinCol[slot] = minCol;
    this.bodyMaxCol[slot] = maxCol;
    this.bodyMinRow[slot] = minRow;
    this.bodyMaxRow[slot] = maxRow;
    this.bodyCount += 1;

    for (let row = minRow; row <= maxRow; row++) {
      const base = row * this.columns;
      for (let column = minCol; column <= maxCol; column++) {
        this.cellStart[base + column + 1] = (this.cellStart[base + column + 1] ?? 0) + 1;
      }
    }
  }

  /** Turns the staged bodies into the grid. Call once, after the last `insert`. */
  build(): void {
    const cellCount = this.columns * this.rows;

    // Counts to start offsets.
    for (let cell = 1; cell <= cellCount; cell++) {
      this.cellStart[cell] = (this.cellStart[cell] ?? 0) + (this.cellStart[cell - 1] ?? 0);
    }
    this.cellCursor.set(this.cellStart);

    const limit = this.entries.length;
    for (let slot = 0; slot < this.bodyCount; slot++) {
      const index = this.bodyIndex[slot] ?? 0;
      const minRow = this.bodyMinRow[slot] ?? 0;
      const maxRow = this.bodyMaxRow[slot] ?? 0;
      const minCol = this.bodyMinCol[slot] ?? 0;
      const maxCol = this.bodyMaxCol[slot] ?? 0;
      for (let row = minRow; row <= maxRow; row++) {
        const base = row * this.columns;
        for (let column = minCol; column <= maxCol; column++) {
          const cell = base + column;
          const cursor = this.cellCursor[cell] ?? 0;
          if (cursor >= limit) {
            // Unreachable while `insert` respects the capacity and the declared
            // maximum radius, which is exactly why it is worth counting.
            this.overflowCount += 1;
            continue;
          }
          this.entries[cursor] = index;
          this.cellCursor[cell] = cursor + 1;
        }
      }
    }
  }

  /**
   * Visits every body whose cell overlaps the given circle, once each.
   *
   * A candidate, not a hit — the caller still runs the exact circle test. That
   * split is the whole point of a broadphase.
   */
  query(x: number, y: number, radius: number, visit: (index: number) => void): void {
    this.queryBox(x, y, radius, radius, visit);
  }

  /**
   * Visits candidates along a swept segment.
   *
   * A projectile can cross several cells in one tick, and querying only where
   * it ended is how a fast shot passes through an enemy without touching them.
   * The segment's bounding box is used rather than the segment itself: cheaper,
   * and generous in the direction that costs a few extra exact tests rather
   * than a missed hit.
   */
  querySwept(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    radius: number,
    visit: (index: number) => void,
  ): void {
    const centreX = (fromX + toX) / 2;
    const centreY = (fromY + toY) / 2;
    const halfWidth = Math.abs(toX - fromX) / 2 + radius;
    const halfHeight = Math.abs(toY - fromY) / 2 + radius;
    this.queryBox(centreX, centreY, halfWidth, halfHeight, visit);
  }

  /** The box form of `query`. */
  queryBox(
    centreX: number,
    centreY: number,
    halfWidth: number,
    halfHeight: number,
    visit: (index: number) => void,
  ): void {
    const minCol = this.columnOf(centreX - halfWidth);
    const maxCol = this.columnOf(centreX + halfWidth);
    const minRow = this.rowOf(centreY - halfHeight);
    const maxRow = this.rowOf(centreY + halfHeight);
    this.queryCells(minCol, maxCol, minRow, maxRow, visit);
  }

  /**
   * The cell-range form of `queryBox`, for a caller that already has its own
   * column/row bounds in hand — because it is about to call this once per
   * body in a population sized in the hundreds, and does not want to pay for
   * handing pixel doubles back across a call boundary just to have this
   * immediately recompute the same bounds from them (`enemy-contact.ts` is
   * that caller; see its own doc comment for why the boundary itself is the
   * cost). Same dedup, same candidates as `queryBox` over the equivalent
   * pixel box — just skips the box-to-cell conversion.
   */
  queryCells(
    minColumn: number,
    maxColumn: number,
    minRow: number,
    maxRow: number,
    visit: (index: number) => void,
  ): void {
    const stamp = this.nextStamp();

    let reported = 0;
    for (let row = minRow; row <= maxRow; row++) {
      const base = row * this.columns;
      for (let column = minColumn; column <= maxColumn; column++) {
        const cell = base + column;
        const start = this.cellStart[cell] ?? 0;
        const end = this.cellStart[cell + 1] ?? 0;
        for (let entry = start; entry < end; entry++) {
          const index = this.entries[entry] ?? 0;
          if (this.visitStamp[index] === stamp) {
            continue;
          }
          this.visitStamp[index] = stamp;
          reported += 1;
          visit(index);
        }
      }
    }
    this.candidateCount += reported;
  }

  /**
   * The stamp for one query.
   *
   * Wrapping matters: at a few thousand queries a tick the counter reaches the
   * end of a signed 32-bit integer within a couple of hours of continuous play,
   * and a stale stamp that happens to match would make the grid silently skip a
   * real candidate — a bullet passing through an enemy, in the third hour of a
   * run, once. Clearing the stamps on wrap costs one pass, twice a session.
   */
  private nextStamp(): number {
    if (this.queryStamp >= 0x7fffffff) {
      this.visitStamp.fill(0);
      this.queryStamp = 0;
    }
    this.queryStamp += 1;
    return this.queryStamp;
  }

  /**
   * Bodies indexed in one cell after the last `build`.
   *
   * Only the debug overlay asks. A grid whose occupancy is invisible is a grid
   * whose cell size is chosen by argument rather than by looking — and cell
   * size is the one number that decides whether a broadphase is worth having.
   */
  occupancyAt(column: number, row: number): number {
    if (column < 0 || column >= this.columns || row < 0 || row >= this.rows) {
      return 0;
    }
    const cell = row * this.columns + column;
    return (this.cellStart[cell + 1] ?? 0) - (this.cellStart[cell] ?? 0);
  }

  private columnOf(x: number): number {
    const column = Math.floor(x / this.cellSize);
    return column < 0 ? 0 : column >= this.columns ? this.columns - 1 : column;
  }

  private rowOf(y: number): number {
    const row = Math.floor(y / this.cellSize);
    return row < 0 ? 0 : row >= this.rows ? this.rows - 1 : row;
  }
}
