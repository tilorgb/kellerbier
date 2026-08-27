/** Hand-written types for a plain-JS module — see `tools/eslint/architecture.d.ts`. */

export interface AnimationSidecar {
  readonly frames: number;
  readonly frameDurationMs: number | readonly number[];
  readonly loop: boolean;
}

export interface ScannedSprite {
  readonly bucketId: string;
  readonly category: string;
  readonly name: string;
  readonly filePath: string;
  readonly animation: AnimationSidecar | null;
}

export declare function scanSprites(rootDir: string): Promise<ScannedSprite[]>;
