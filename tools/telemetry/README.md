# Telemetry collection

`worker.mjs` is the Cloudflare Worker the game's "Send my results" button posts to
(`docs/DECISIONS.md` #109). One-time setup:

1. In Cloudflare: Workers & Pages → KV → create a namespace (e.g. `kellerbier-telemetry`).
2. Create a Worker, paste in `worker.mjs`, bind the namespace as **`RUNS`**, and add a secret
   **`ADMIN_KEY`** (any long random string).
3. Copy the Worker's URL into `src/app/telemetry/endpoint.ts` (`TELEMETRY_ENDPOINT`) and merge.
   Until then the Send button is hidden and testers can only Copy or Export.
4. Read the data: `curl "<worker-url>/export?key=<ADMIN_KEY>" > runs.json`, then
   `node tools/telemetry/dashboard.mjs runs.json`.

## Automatic report on the balance issue

`.github/workflows/telemetry-report.yml` runs daily (and from the Actions tab) and keeps one
comment on #54 up to date with the dashboard output. One-time setup: add a repository secret
**`TELEMETRY_ADMIN_KEY`** (Settings → Secrets and variables → Actions) holding the Worker's
`ADMIN_KEY`. Without it the workflow exits cleanly and reports nothing.
