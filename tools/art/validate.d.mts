/** Hand-written types for a plain-JS module — see `tools/eslint/architecture.d.ts`. */

export interface OffPalettePixel {
  readonly x: number;
  readonly y: number;
  readonly color: number;
}

export declare function validateSpriteSize(
  category: string,
  width: number,
  height: number,
  frameCount?: number,
): string | null;

export declare function findOffPalettePixel(
  pixels: Buffer,
  width: number,
  height: number,
  allowedColors: ReadonlySet<number>,
): OffPalettePixel | null;

export declare function brightestOpaqueColor(
  pixels: Buffer,
  width: number,
  height: number,
  luminanceOf: (color: number) => number,
): number | null;

export declare function darkestOpaqueColor(
  pixels: Buffer,
  width: number,
  height: number,
  luminanceOf: (color: number) => number,
): number | null;

export declare function validateAnimation(animation: Record<string, unknown>): string | null;

export interface InkedBounds {
  readonly minX: number;
  readonly minY: number;
  readonly width: number;
  readonly height: number;
}

export declare function inkedBounds(
  pixels: Buffer,
  width: number,
  height: number,
  frameWidth?: number,
): InkedBounds | null;
