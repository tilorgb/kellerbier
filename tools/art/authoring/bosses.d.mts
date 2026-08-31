/** Hand-written types for a plain-JS module — see `tools/eslint/architecture.d.ts`. */

/** A built frame: a `height`×`width` grid of `0xrrggbb` or `null` (transparent). */
export interface BossFrame {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly px: readonly (readonly (number | null)[])[];
}

export declare const STRIPS: Readonly<Record<string, readonly BossFrame[]>>;
export declare const SINGLES: Readonly<Record<string, BossFrame>>;
export declare const BOSS_BUCKETS: Readonly<Record<string, string>>;

export declare function encodeStrip(name: string, frames: readonly BossFrame[]): Buffer;
export declare function encodeSingle(frame: BossFrame): Buffer;
export declare function assertOnPalette(bucket: string, frames: readonly BossFrame[]): void;
