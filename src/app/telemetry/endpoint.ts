/**
 * Where the Settings → Privacy "Send my results" button posts
 * (`tools/telemetry/worker.mjs`, the Cloudflare Worker that stores it).
 *
 * Set once the Worker is deployed. With no endpoint (an empty string) the Send button is
 * hidden and the tester is left with "Copy" and "Export", so an unset URL is
 * a smaller feature, never a broken one. The URL is public by nature — it
 * accepts anonymous posts — so it lives here rather than in CI settings.
 */
export const TELEMETRY_ENDPOINT = 'https://kellerbier-telemetry.triad-revolt.workers.dev/';
