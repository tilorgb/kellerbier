/** Hand-written types for a plain-JS module — see `tools/eslint/architecture.d.ts`. */

export interface AnimationSidecar {
  readonly frames: number;
  readonly frameDurationMs: number | readonly number[];
  readonly loop: boolean;
}

export interface ScannedSprite {
  readonly bucketId: string;
  readonly category: string;
  /** The sprite's name, with any `@2x` suffix stripped. */
  readonly name: string;
  /** Authored pixels per base-grid pixel: 1, or N for a `name@Nx` file. */
  readonly density: number;
  readonly filePath: string;
  readonly animation: AnimationSidecar | null;
}

export declare function parseDensity(fileName: string): { name: string; density: number };

export declare function scanSprites(rootDir: string): Promise<ScannedSprite[]>;
