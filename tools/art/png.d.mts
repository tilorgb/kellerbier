/** Hand-written types for a plain-JS module — see `tools/eslint/architecture.d.ts`. */

export interface DecodedImage {
  readonly width: number;
  readonly height: number;
  readonly pixels: Buffer;
}

export declare function decodePng(buffer: Buffer): DecodedImage;
export declare function encodePng(image: DecodedImage): Buffer;
