/**
 * Where the Settings → Privacy "Send my results" button posts
 * (`tools/telemetry/worker.mjs`, the Cloudflare Worker that stores it).
 *
 * Empty until the Worker is deployed: with no endpoint the Send button is
 * hidden and the tester is left with "Copy" and "Export", so an unset URL is
 * a smaller feature, never a broken one. The URL is public by nature — it
 * accepts anonymous posts — so it lives here rather than in CI settings.
 */
export const TELEMETRY_ENDPOINT = '';
