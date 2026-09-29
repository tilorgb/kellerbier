/** Hand-written types for a plain-JS module — see `tools/eslint/architecture.d.ts`. */

import type { ItemCanvas, ItemFrame } from './items.mjs';

export declare const WIDTH: number;
export declare const HEIGHT: number;
export declare const CHEST_ART: Readonly<Record<string, (cv: ItemCanvas) => void>>;
export declare function chestFrame(id: string): ItemFrame;
export declare function chestFrames(): Readonly<Record<string, ItemFrame>>;
export declare function assertOnPalette(bucket: string, frames: readonly ItemFrame[]): void;
export declare function encodeSingle(frame: ItemFrame): Buffer;
