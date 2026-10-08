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

export declare const bucket: string;
export declare const strips: Readonly<Record<string, readonly ViewFrame[]>>;
export declare const bases: Readonly<
  Record<string, { readonly width: number; readonly height: number }>
>;
export declare const sidecars: Readonly<Record<string, ViewAnim>>;
export declare function assertOnPalette(): void;
export declare function encodeViewStrip(frames: readonly ViewFrame[]): Buffer;
