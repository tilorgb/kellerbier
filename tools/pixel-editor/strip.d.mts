/** Hand-written types for a plain-JS module — see `tools/eslint/architecture.d.ts`. */

export interface StripFrame {
  readonly width: number;
  readonly height: number;
  readonly pixels: Buffer;
}

export interface Strip {
  readonly width: number;
  readonly height: number;
  readonly pixels: Buffer;
}

export declare function buildStrip(frames: readonly StripFrame[]): Strip;
