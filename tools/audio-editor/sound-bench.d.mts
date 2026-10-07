/** Hand-written types for a plain-JS module — see `tools/eslint/architecture.d.ts`. */

export declare const SOUND_BENCH_URL: string;
export declare const GENERATED_HEADING: string;

export declare class SoundBenchOfflineError extends Error {}

export interface BenchRequest {
  readonly prompt: string;
  readonly negative: string;
  readonly seconds: number;
  readonly count: number;
  readonly pick: 'loudest' | 'first' | 'all';
  readonly format: 'mp3';
  readonly destFolder: string;
}

export interface GeneratedTake {
  readonly take: number;
  readonly seconds: number;
  readonly events: number;
  readonly fillsTake: boolean;
  readonly dataBase64: string;
}

export interface GeneratedTakes {
  readonly prompt: string;
  readonly seed: number;
  readonly count: number;
  readonly extension: string;
  readonly takes: readonly GeneratedTake[];
  readonly dropped: number;
}

export interface GeneratedOrigin {
  readonly prompt: string;
  readonly seed: number;
  readonly take: number;
  readonly count: number;
}

export declare function benchRequestFor(body: unknown): BenchRequest;

export declare function generateTakes(
  body: unknown,
  fetchImpl?: typeof fetch,
): Promise<GeneratedTakes>;

export declare function validateGeneratedOrigin(origin: unknown): string | null;

export declare function isRecordedAsGenerated(readmeText: string, fileName: string): boolean;

export declare function recordGeneratedFile(
  readmeText: string,
  entry: { fileName: string; origin: GeneratedOrigin; date: string },
): string;

export declare function forgetGeneratedFile(readmeText: string, fileName: string): string;
