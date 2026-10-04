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

## Whose runs are whose

**Naming a session** — `tools/telemetry/known-sessions.txt`, a session id and a label per line.
A named session is counted like any other. The report adds a "Runs by player" table, so the same
win rate can be read with and without the people who already know the game. The maintainer
playing normally belongs here: those are real runs, from someone who happens to be good at it.

**Leaving a session out** — `tools/telemetry/ignored-sessions.txt` (#364). For sessions that are
not play at all: debugging, a bot, deliberate deaths to test a screen. The report skips their runs
and answers and says how many it skipped. Runs from `npm run dev` are skipped without being
listed. `--all-sessions` reports on everything.

## Automatic report on the balance issue

`.github/workflows/telemetry-report.yml` runs daily (and from the Actions tab) and keeps one
comment on #54 up to date with the dashboard output. That comment is public, so the workflow
runs the dashboard with `--public`: it shows how many answers each question got and none of
their text (#362). The answers are only ever printed by `npm run telemetry:report`, locally. One-time setup: add a repository secret
**`TELEMETRY_ADMIN_KEY`** (Settings → Secrets and variables → Actions) holding the Worker's
`ADMIN_KEY`. Without it the workflow exits cleanly and reports nothing.

## Limits

The endpoint is public and takes a POST from anyone, so the Worker trusts nothing it is sent (#363):

- A run or answer is rebuilt from the fields `src/app/telemetry/schema.ts` defines. Ids must look
  like ids; anything that is not a run is dropped; unknown fields never reach the store.
- At most 50 runs and 50 answers per request, 200 kB per request.
- `MAX_RECORDS_PER_DAY` (450) records a day in total, after which it answers 429 and the game
  keeps the run for another day. That number is sized for the KV **free tier** — 1,000 writes a
  day, and a run sent on its own costs two (the record and the day's counter). Raise it if the
  Worker moves to a paid plan.
- KV takes one write a second to the same key, and the day's counter is one key. When two runs
  end in the same second the second counter write is refused; the Worker lets that go and stores
  the run. The counter undercounts a little under bursts, which is the cheaper way to be wrong.
- `/export` returns `EXPORT_PAGE_SIZE` (400) keys per request with a `cursor` for the next page;
  `npm run telemetry:report` and the report workflow follow it. One invocation may only read a
  bounded number of keys, which is what an unpaged export would run into as the store grows.

There is no per-client limit on purpose: telling clients apart means looking at who they are, and
the Worker stores and inspects nothing about the sender.

The Cloudflare numbers above were checked against its
[Workers KV limits page](https://developers.cloudflare.com/kv/platform/limits/) on 2026-10-04,
free plan: 1,000 writes a day to different keys, 100,000 reads a day, 1,000 KV operations per
Worker invocation, one write a second to the same key. An export page costs one list and up to
400 reads, inside the per-invocation limit.

## Updating the Worker

When `worker.mjs` changes (`feedback:` storage in #110; validation, the daily budget and paged
export in #363), open the
Worker in Cloudflare → **Edit code**, paste the new file over the old one and **Deploy**. The
bindings and secret stay. Old clients keep working: feedback is optional in the request.

