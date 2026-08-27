/** Hand-written types for a plain-JS module — see `tools/eslint/architecture.d.ts`. */

export interface AtlasReport {
  readonly bucketId: string;
  readonly width: number;
  readonly height: number;
  readonly spriteCount: number;
  readonly bytes: number;
}

export interface BuildReport {
  readonly atlasCount: number;
  readonly spriteCount: number;
  readonly totalBytes: number;
  readonly projectileSpritesChecked: number;
  readonly atlases: readonly AtlasReport[];
}

export declare class AtlasBuildError extends Error {
  readonly problems: readonly string[];
  constructor(problems: readonly string[]);
}

export declare function buildAtlases(options: {
  readonly rootDir: string;
  readonly outDir: string;
  readonly write?: boolean;
}): Promise<BuildReport>;

export declare function formatBuildReport(report: BuildReport): string;
