/** Hand-written types for a plain-JS module — see `tools/eslint/architecture.d.ts`. */

/**
 * A built block tile: `BLOCK_CELL` wide and `BLOCK_CELL + lip` tall, its
 * bottom `BLOCK_CELL` rows being the collision cell and the rest the overhang
 * it stands behind (`docs/DECISIONS.md` #73). `px` is opaque
 * `0xrrggbb`-or-`null`; `sh` marks the translucent cast shadow.
 */
export interface BlockFrame {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  /** Authored rows this frame overhangs the top of its cell by. */
  readonly lip: number;
  readonly px: readonly (readonly (number | null)[])[];
  readonly sh: readonly (readonly boolean[])[];
}

export declare const BLOCKS: Readonly<Record<string, BlockFrame>>;
export declare const BLOCK_BUCKETS: Readonly<Record<string, string>>;
/** Authored pixels per room cell — a block tile's width, and its collision height. */
export declare const BLOCK_CELL: number;
/** Authored pixels a block's silhouette overhangs the top of that cell. */
export declare const BLOCK_LIP: number;

export declare function buildBlocks(lip?: number): Readonly<Record<string, BlockFrame>>;
export declare function encodeSingle(frame: BlockFrame): Buffer;
export declare function assertOnPalette(bucket: string, frame: BlockFrame): void;
