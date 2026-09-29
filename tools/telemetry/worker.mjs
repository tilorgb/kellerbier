/**
 * The Cloudflare Worker behind the Settings → Privacy "Send my results"
 * button (`src/app/telemetry/send.ts`). Deploy once, paste its URL into
 * `src/app/telemetry/endpoint.ts`; see `docs/PLAYTEST_PROTOCOL.md` §2.
 *
 * Setup: create a Workers KV namespace, bind it to this Worker as `RUNS`, and
 * (for reading) set a secret `ADMIN_KEY`.
 *
 * - POST /            stores each run under `run:<runId>` (idempotent — a
 *                     retry or double click just overwrites the same key).
 * - GET /export?key=  returns every stored run as one telemetry file that
 *                     `node tools/telemetry/dashboard.mjs` reads directly.
 *
 * It stores exactly what the client sends and nothing else — no IP, no
 * headers, no user agent — because the client's whole promise is anonymity.
 */

const MAX_BODY_BYTES = 200_000;
const MAX_RUNS_PER_POST = 50;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = { 'Access-Control-Allow-Origin': '*' };

    if (request.method === 'GET' && url.pathname === '/export') {
      if (!env.ADMIN_KEY || url.searchParams.get('key') !== env.ADMIN_KEY) {
        return new Response('forbidden', { status: 403 });
      }
      const runs = [];
      let cursor;
      do {
        const page = await env.RUNS.list({ prefix: 'run:', cursor });
        for (const { name } of page.keys) {
          const value = await env.RUNS.get(name);
          if (value !== null) runs.push(JSON.parse(value));
        }
        cursor = page.list_complete ? undefined : page.cursor;
      } while (cursor !== undefined);
      return Response.json({ schemaVersion: 1, sessionId: null, runs });
    }

    if (request.method !== 'POST') {
      return new Response('method not allowed', { status: 405, headers: cors });
    }
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) {
      return new Response('too large', { status: 413, headers: cors });
    }
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      return new Response('bad json', { status: 400, headers: cors });
    }
    if (!Array.isArray(body?.runs) || body.runs.length > MAX_RUNS_PER_POST) {
      return new Response('bad shape', { status: 400, headers: cors });
    }
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId : null;
    for (const run of body.runs) {
      if (typeof run?.runId !== 'string' || run.runId.length > 100) {
        return new Response('bad run', { status: 400, headers: cors });
      }
    }
    await Promise.all(
      body.runs.map((run) =>
        env.RUNS.put(`run:${run.runId}`, JSON.stringify({ ...run, sessionId })),
      ),
    );
    return new Response('ok', { status: 200, headers: cors });
  },
};
