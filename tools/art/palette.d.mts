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
export declare function allowedColorsFor(bucketId: string): Set<number>;
export declare function floorBackgroundSwatches(floorTag: string): readonly number[];
export declare const FLOOR_BUCKETS: readonly FloorBucket[];
