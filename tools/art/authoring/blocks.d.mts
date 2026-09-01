/** Hand-written types for a plain-JS module — see `tools/eslint/architecture.d.ts`. */

/** A built 32×32 tile: `px` is opaque `0xrrggbb`-or-`null`; `sh` marks the translucent cast shadow. */
export interface BlockFrame {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly px: readonly (readonly (number | null)[])[];
  readonly sh: readonly (readonly boolean[])[];
}

export declare const BLOCKS: Readonly<Record<string, BlockFrame>>;
export declare const BLOCK_BUCKETS: Readonly<Record<string, string>>;

export declare function encodeSingle(frame: BlockFrame): Buffer;
export declare function assertOnPalette(bucket: string, frame: BlockFrame): void;
