/** Hand-written types for a plain-JS module — see `tools/eslint/architecture.d.ts`. */

export interface OrdnerFrame {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly px: readonly (readonly (number | null)[])[];
}

export declare const ORDNER_KEYS: Readonly<Record<string, number | null>>;
export declare const ORDNER_WIDTH: number;
export declare const ORDNER_HEIGHT: number;
export declare const ORDNER_STRIPS: Readonly<Record<string, readonly OrdnerFrame[]>>;
export declare const ORDNER_ANIM: {
  readonly frames: number;
  readonly frameDurationMs: number;
  readonly loop: boolean;
  readonly clips: Readonly<Record<string, unknown>>;
};
export declare const ORDNER_BUCKET: string;
export declare function assertOnPalette(): void;
export declare function encodeOrdnerStrip(frames: readonly OrdnerFrame[]): Buffer;
