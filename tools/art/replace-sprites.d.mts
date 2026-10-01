/** Hand-written types for a plain-JS module — see `tools/eslint/architecture.d.ts`. */

export interface ReplaceSpritesOptions {
  readonly rootDir: string;
  readonly inboxDir: string;
  readonly archiveDir: string;
  readonly now?: Date;
  readonly dryRun?: boolean;
}

export interface ReplaceSpritesResult {
  readonly replaced: string[];
  readonly archiveFolder: string | null;
}

export declare function replaceSprites(
  options: ReplaceSpritesOptions,
): Promise<ReplaceSpritesResult>;
