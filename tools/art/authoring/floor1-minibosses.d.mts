/** Hand-written types for a plain-JS module — see `tools/eslint/architecture.d.ts`. */

/** A built frame: a `height`×`width` grid of `0xrrggbb` or `null` (transparent). */
export interface MinibossFrame {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly px: readonly (readonly (number | null)[])[];
}

export declare const CELLAR: Readonly<Record<string, number | null>>;
export declare const MINIBOSSES: Readonly<Record<string, MinibossFrame>>;
export declare const MINIBOSS_BUCKET: string;

export declare const rattenkoenig: MinibossFrame;
export declare const zapfhahnOrgel: MinibossFrame;

export declare function encodeSingle(frame: MinibossFrame): Buffer;
export declare function assertOnPalette(frames: readonly MinibossFrame[]): void;
