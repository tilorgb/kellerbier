/** Hand-written types for a plain-JS module — see `tools/eslint/architecture.d.ts`. */

import type { PixelGrid } from './compose.d.mts';

export declare const WIDTH: number;
export declare const HEIGHT: number;

/** Every strip `render/player-art.ts` looks for, keyed by its file's base name. */
export declare const STRIPS: Readonly<Record<string, readonly PixelGrid[]>>;
