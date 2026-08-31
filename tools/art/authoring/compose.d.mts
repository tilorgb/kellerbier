/** Hand-written types for a plain-JS module — see `tools/eslint/architecture.d.ts`. */

export interface PixelGrid {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly rows: readonly string[];
}

export declare const PIXEL_KEYS: Readonly<Record<string, number | null>>;

export declare function grid(name: string, rows: readonly string[]): PixelGrid;
export declare function shiftGrid(part: PixelGrid, dx: number): PixelGrid;
export declare function blankCanvas(width: number, height: number): string[][];
export declare function stamp(canvas: string[][], part: PixelGrid, ox: number, oy: number): void;
export declare function finishCanvas(name: string, canvas: string[][]): PixelGrid;
export declare function encodeStrip(name: string, frames: readonly PixelGrid[]): Buffer;
