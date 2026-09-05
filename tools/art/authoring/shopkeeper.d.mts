/** Hand-written types for a plain-JS module — see `tools/eslint/architecture.d.ts`. */

/** A built frame: a `height`×`width` grid of `0xrrggbb` or `null` (transparent). */
export interface WirtFrame {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly px: readonly (readonly (number | null)[])[];
}

export declare const WIRT: Readonly<Record<string, number | null>>;
export declare const WIDTH: number;
export declare const HEIGHT: number;
export declare const idle0: WirtFrame;
export declare const idle1: WirtFrame;
export declare const SHOPKEEPER_FRAMES: readonly WirtFrame[];

export declare function encodeStrip(name: string, frames: readonly WirtFrame[]): Buffer;
export declare function assertOnPalette(bucket: string, frames: readonly WirtFrame[]): void;
