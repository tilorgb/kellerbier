/** Hand-written types for a plain-JS module — see `tools/eslint/architecture.d.ts`. */

import type { FloorBucket } from './spec.d.mts';

export declare const NEUTRAL_PALETTE: readonly number[];
export declare const FLOOR_PALETTES: Readonly<{
  cellar: readonly number[];
  rural: readonly number[];
  wald: readonly number[];
  alpen: readonly number[];
  schloss: readonly number[];
  brauerei: readonly number[];
  wiesn: readonly number[];
}>;
export declare const MASTER_PALETTE: readonly number[];
export declare const BACKGROUND_PALETTES: Readonly<Record<string, readonly number[]>>;
export declare const BACKGROUND_TIER: { readonly darken: number; readonly desaturate: number };

export type SpriteTier = 'foreground' | 'background';

export declare function allowedColorsFor(bucketId: string): Set<number>;
export declare function backgroundColorsFor(bucketId: string): Set<number>;
export declare function pickableColorsFor(bucketId: string, tier?: SpriteTier): Set<number>;
export declare function floorBackgroundSwatches(floorTag: string): readonly number[];
export declare function shadeOf(color: number, step: number): number;
export declare function desaturateOf(color: number, step: number): number;
export declare function toBackgroundHue(color: number): number;
export declare function shadeRampOf(color: number): readonly number[];
export declare function legalPixelColorsFor(bucketId: string, tier?: SpriteTier): Set<number>;
export declare function nudgeShade(
  bucketId: string,
  color: number,
  direction: number,
  tier?: SpriteTier,
): number;
export declare const FLOOR_BUCKETS: readonly FloorBucket[];
