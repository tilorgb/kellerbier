/** Hand-written types for a plain-JS module — see `tools/eslint/architecture.d.ts`. */

/** A built frame: a `height`×`width` grid of `0xrrggbb` or `null` (transparent). */
export interface ItemFrame {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly px: readonly (readonly (number | null)[])[];
}

/** A mutable raster the drawing functions paint into. */
export interface ItemCanvas {
  readonly w: number;
  readonly h: number;
  readonly px: (number | null)[][];
}

export declare const SIZE: number;
export declare const ITEM_ART: Readonly<Record<string, (cv: ItemCanvas) => void>>;
export declare function itemFrame(id: string): ItemFrame;
export declare function itemFrames(): Readonly<Record<string, ItemFrame>>;
export declare function assertOnPalette(bucket: string, frames: readonly ItemFrame[]): void;
export declare function encodeSingle(frame: ItemFrame): Buffer;
