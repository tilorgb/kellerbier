/** Hand-written types for a plain-JS module — see `tools/eslint/architecture.d.ts`. */

export interface ViewFrame {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly px: readonly (readonly (number | null)[])[];
}
export interface ViewAnim {
  readonly frames: number;
  readonly frameDurationMs: number;
  readonly loop: boolean;
  readonly clips: Readonly<Record<string, unknown>>;
}

export declare const CHARACTER_DIR: string;
export declare const BOSS_DIR: string;
export declare const FLOOR1_BUCKET: string;
export declare const CHARACTER_STRIPS: Readonly<Record<string, readonly ViewFrame[]>>;
export declare const BOSS_STRIPS: Readonly<Record<string, readonly ViewFrame[]>>;
export declare const CHARACTER_SIDECARS: Readonly<Record<string, ViewAnim>>;
export declare const BOSS_SIDECARS: Readonly<Record<string, ViewAnim>>;
export declare const VIEW_ANIM: ViewAnim;
export declare const BASE_CANVAS: Readonly<Record<string, readonly [number, number]>>;
export declare function assertOnPalette(): void;
export declare function encodeViewStrip(frames: readonly ViewFrame[]): Buffer;
export declare function encodeSidecar(anim: ViewAnim): Promise<string>;
