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

/** Numbers per block: minX, minY, maxX, maxY. */
export const BLOCK_STRIDE = 4;

export class RoomGeometry {
  /** Interior bounds — the rectangle a body's centre-plus-radius must stay inside. */
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;

  /** Flat `[minX, minY, maxX, maxY]` runs. Read `blockCount * BLOCK_STRIDE` of it. */
  readonly blocks = new Float32Array(MAX_ROOM_BLOCKS * BLOCK_STRIDE);

  private blocks_ = 0;

  constructor(minX: number, minY: number, maxX: number, maxY: number) {
    this.minX = minX;
    this.minY = minY;
    this.maxX = maxX;
    this.maxY = maxY;
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
    if (
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
