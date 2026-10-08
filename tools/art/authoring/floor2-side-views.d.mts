/** Hand-written types for a plain-JS module — see `tools/eslint/architecture.d.ts`. */

export interface SideViewFrame {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly px: readonly (readonly (number | null)[])[];
}

export declare const strips: Readonly<Record<string, readonly SideViewFrame[]>>;
export declare const sidecars: Readonly<Record<string, { readonly frames: number }>>;
export declare const buckets: Readonly<Record<string, string>>;
export declare const folders: Readonly<Record<string, string>>;
export declare const canvases: Readonly<Record<string, readonly [number, number]>>;
export declare function assertOnPalette(): void;
export declare function encodeViewStrip(frames: readonly SideViewFrame[]): Buffer;
export declare function encodeSidecar(anim: unknown): Promise<string>;
