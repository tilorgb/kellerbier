# Telemetry collection

`worker.mjs` is the Cloudflare Worker the game's "Send my results" button posts to
(`docs/DECISIONS.md` #109). One-time setup:

1. In Cloudflare: Workers & Pages → KV → create a namespace (e.g. `kellerbier-telemetry`).
2. Create a Worker, paste in `worker.mjs`, bind the namespace as **`RUNS`**, and add a secret
   **`ADMIN_KEY`** (any long random string).
3. Copy the Worker's URL into `src/app/telemetry/endpoint.ts` (`TELEMETRY_ENDPOINT`) and merge.
   Until then the Send button is hidden and testers can only Copy or Export.
4. Read the data: put `TELEMETRY_ADMIN_KEY=<ADMIN_KEY>` in a `.env.local` at the repo root
   (git-ignored), then `npm run telemetry:report`. It pulls the export into `runs.json` (also
   git-ignored) and prints the full report, tester answers included.

## Builds

Every run carries the build it was played on (`build`, the short commit — #361), and the report
opens with a "Runs by build" table. Once a balance change has shipped, read one build at a time:
`node tools/telemetry/dashboard.mjs runs.json --build <id>`. Runs recorded before the stamp existed
are reported as `unknown`; runs from `npm run dev` end in `-dev`.

## Automatic report on the balance issue

`.github/workflows/telemetry-report.yml` runs daily (and from the Actions tab) and keeps one
comment on #54 up to date with the dashboard output. That comment is public, so the workflow
runs the dashboard with `--public`: it shows how many answers each question got and none of
their text (#362). The answers are only ever printed by `npm run telemetry:report`, locally. One-time setup: add a repository secret
**`TELEMETRY_ADMIN_KEY`** (Settings → Secrets and variables → Actions) holding the Worker's
`ADMIN_KEY`. Without it the workflow exits cleanly and reports nothing.

## Updating the Worker

When `worker.mjs` changes (it gained `feedback:` storage for the playtest questions, #110), open the
Worker in Cloudflare → **Edit code**, paste the new file over the old one and **Deploy**. The
bindings and secret stay. Old clients keep working: feedback is optional in the request.

