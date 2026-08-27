/** Hand-written types for a plain-JS module — see `tools/eslint/architecture.d.ts`. */

export type SpriteCategory = 'tile' | 'character' | 'boss' | 'projectile';

export interface CategorySpec {
  readonly minWidth: number;
  readonly maxWidth: number;
  readonly minHeight: number;
  readonly maxHeight: number;
}

export interface FloorBucket {
  readonly id: string;
  readonly floor: number;
  readonly floorTag: string;
  readonly name: string;
}

export declare const CATEGORY_FOLDERS: Readonly<Record<SpriteCategory, string>>;
export declare const CATEGORY_SPECS: Readonly<Record<SpriteCategory, CategorySpec>>;
export declare const FLOOR_BUCKETS: readonly FloorBucket[];
export declare const COMMON_BUCKET_ID: string;
export declare const ALL_BUCKET_IDS: readonly string[];
export declare function floorTagForBucket(bucketId: string): string | null;
