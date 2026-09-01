/** Hand-written types for a plain-JS module — see `tools/eslint/architecture.d.ts`. */

import type { SpriteCategory } from './spec.d.mts';
import type { SpriteTier } from './palette.d.mts';

export declare const BACKGROUND_SPRITE_NAMES: ReadonlySet<string>;
export declare const FOREGROUND_TILE_NAMES: ReadonlySet<string>;
export declare function spriteTier(
  bucketId: string,
  category: SpriteCategory,
  name: string,
): SpriteTier;
export declare function tileTierDeclared(name: string): boolean;
