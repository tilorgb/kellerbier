/** Hand-written types for a plain-JS module — see `tools/eslint/architecture.d.ts`. */

/** A built frame: a `height`×`width` grid of `0xrrggbb` or `null` (transparent). */
export interface MinibossFrame {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly px: readonly (readonly (number | null)[])[];
}

export interface MinibossStrip {
  readonly frames: readonly MinibossFrame[];
  readonly anim: unknown;
}

export declare const WALD_MINI: Readonly<Record<string, number | null>>;
export declare const MINIBOSS_BUCKET: string;
export declare const MINIBOSSES: Readonly<Record<string, MinibossFrame>>;
export declare const STRIPS: Readonly<Record<string, MinibossStrip>>;

export declare const bieber: MinibossFrame;
export declare const bieberStepA: MinibossFrame;
export declare const bieberStepB: MinibossFrame;
export declare const bieberBrace: MinibossFrame;

export declare function assertOnPalette(frames: readonly MinibossFrame[]): void;
export declare function encodeSingle(frame: MinibossFrame): Buffer;
export declare function encodeStrip(name: string, frames: readonly MinibossFrame[]): Buffer;
export declare function encodeAnim(anim: unknown): string;
