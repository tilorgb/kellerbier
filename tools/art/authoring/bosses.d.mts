/** Hand-written types for a plain-JS module — see `tools/eslint/architecture.d.ts`. */

/** A built frame: a `height`×`width` grid of `0xrrggbb` or `null` (transparent). */
export interface BossFrame {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly px: readonly (readonly (number | null)[])[];
}

export declare const STRIPS: Readonly<Record<string, readonly BossFrame[]>>;
export declare const SINGLES: Readonly<Record<string, BossFrame>>;
export declare const BOSS_BUCKETS: Readonly<Record<string, string>>;

export declare function encodeStrip(name: string, frames: readonly BossFrame[]): Buffer;
export declare function encodeSingle(frame: BossFrame): Buffer;
export declare function assertOnPalette(bucket: string, frames: readonly BossFrame[]): void;

/** A rig's key art, part specs and default preview crop — see `boss-rig-preview.mjs`. */
export declare const BOSS_RIGS: Readonly<
  Record<
    string,
    {
      readonly art: string;
      readonly specs: Readonly<
        Record<
          string,
          { readonly polygon: readonly (readonly number[])[]; readonly pivot?: readonly number[] }
        >
      >;
      readonly previewCrop: readonly number[];
    }
  >
>;
