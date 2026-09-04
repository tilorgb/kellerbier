/** Hand-written types for a plain-JS module — see `tools/eslint/architecture.d.ts`. */

interface DecodedImage {
  width: number;
  height: number;
  pixels: Buffer;
}

export declare function removeBackground(image: DecodedImage, tolerance?: number): DecodedImage;

export declare function downscaleBoxFilter(
  image: DecodedImage,
  targetWidth: number,
  targetHeight: number,
): DecodedImage;

export declare function quantizeToPalette(
  image: DecodedImage,
  palette: readonly number[],
): DecodedImage;

export declare function paletteForFloor(floorTag?: string | null): readonly number[];

export declare function postprocessDiffusionOutput(
  image: DecodedImage,
  options: {
    targetWidth: number;
    targetHeight: number;
    palette: readonly number[];
    backgroundTolerance?: number | null;
  },
): DecodedImage;
