export const MAX_RECORDS_PER_DAY: number;
export const EXPORT_PAGE_SIZE: number;

export function cleanRun(run: unknown): Record<string, unknown> | null;
export function cleanFeedback(entry: unknown): Record<string, unknown> | null;

/** The slice of a Workers KV namespace the Worker uses. */
export interface TelemetryKv {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  list(options: { limit?: number; cursor?: string }): Promise<{
    keys: { name: string }[];
    list_complete: boolean;
    cursor?: string;
  }>;
}

declare const worker: {
  fetch(request: Request, env: { RUNS: TelemetryKv; ADMIN_KEY?: string }): Promise<Response>;
};
export default worker;
