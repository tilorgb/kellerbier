/** Hand-written types for a plain-JS module — see `tools/eslint/architecture.d.ts`. */

export interface PackableSprite {
  readonly key: string;
  readonly width: number;
  readonly height: number;
  readonly pixels: Buffer;
}

export interface FrameRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface PackedAtlas {
  readonly width: number;
  readonly height: number;
  readonly pixels: Buffer;
  readonly frames: Readonly<Record<string, FrameRect>>;
}

export declare function packSprites(
  sprites: readonly PackableSprite[],
  options?: { readonly padding?: number; readonly maxWidth?: number },
): PackedAtlas | null;
