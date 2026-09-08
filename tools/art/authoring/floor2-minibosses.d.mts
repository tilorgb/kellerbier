/** Hand-written types for a plain-JS module — see `tools/eslint/architecture.d.ts`. */

/** A built frame: a `height`×`width` grid of `0xrrggbb` or `null` (transparent). */
export interface MinibossFrame {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly px: readonly (readonly (number | null)[])[];
}

export declare const RURAL: Readonly<Record<string, number | null>>;
export declare const HUMAN_FACE: readonly string[];
export declare const MINIBOSSES: Readonly<Record<string, MinibossFrame>>;
export declare const MINIBOSS_BUCKET: string;

export declare const blaskapelleTuba: MinibossFrame;
export declare const blaskapelleTrompete: MinibossFrame;
export declare const blaskapellePosaune: MinibossFrame;
export declare const derLadewagen: MinibossFrame;

export declare function encodeSingle(frame: MinibossFrame): Buffer;
export declare function assertOnPalette(frames: readonly MinibossFrame[]): void;
