/** Hand-written types for a plain-JS module — see `tools/eslint/architecture.d.ts`. */

/** A built alpen tile: 32 wide, 32 or 40 tall, with its cast shadow and the palette tier it is drawn on. */
export interface AlpenTileFrame {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly px: readonly (readonly (number | null)[])[];
  readonly sh: readonly (readonly boolean[])[];
  readonly tier: 'background' | 'foreground';
}

export declare const TILE_BUCKET: string;
export declare const ALPEN_TILES: Readonly<Record<string, AlpenTileFrame>>;
export declare function assertOnPalette(frame: AlpenTileFrame): void;
export declare function encodeTile(frame: AlpenTileFrame): Buffer;
