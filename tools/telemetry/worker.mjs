/**
 * The Cloudflare Worker behind the Settings → Privacy "Send my results"
 * button (`src/app/telemetry/send.ts`). Deploy once, paste its URL into
 * `src/app/telemetry/endpoint.ts`; see `docs/PLAYTEST_PROTOCOL.md` §2.
 *
 * Setup: create a Workers KV namespace, bind it to this Worker as `RUNS`, and
 * (for reading) set a secret `ADMIN_KEY`.
 *
 * - POST /            stores each run under `run:<runId>` and each answer to a
 *                     post-run question under `feedback:<id>` (idempotent — a
 *                     retry or double click just overwrites the same key).
 * - GET /export?key=  returns stored runs and answers as a telemetry file
 *                     `node tools/telemetry/dashboard.mjs` reads directly — a
 *                     page at a time; pass the response's `cursor` back as
 *                     `&cursor=` until it comes back `null`.
 *
 * It stores what the game's own schema describes and nothing else — no IP, no
 * headers, no user agent — because the client's whole promise is anonymity.
 *
 * The URL is public and takes a POST from anyone (#363), so nothing in a
 * request is trusted: a record is rebuilt field by field from what
 * `src/app/telemetry/schema.ts` says a run is, anything that is not one is
 * dropped, and a daily budget bounds how much one person with a script can
 * write. There is deliberately no per-client limit — telling clients apart
 * would mean looking at who they are.
 */

const MAX_BODY_BYTES = 200_000;
const MAX_RUNS_PER_POST = 50;
const MAX_FEEDBACK_PER_POST = 50;
const MAX_FEEDBACK_LENGTH = 1000;

/**
 * Records accepted per UTC day, across everyone. Sized for the KV free tier's
 * 1,000 writes a day: a run sent on its own costs two writes, the record and
 * the budget counter — raise this together with the plan. Past it the Worker
 * answers 429 and the game keeps the run to send another day.
 */
export const MAX_RECORDS_PER_DAY = 450;

/** Keys read per `/export` page — each is one KV read, and an invocation gets a bounded number of those. */
export const EXPORT_PAGE_SIZE = 400;

/** Caps on what one run may carry; a real run is far inside all of them. */
const MAX_LIST = 200;
const MAX_ROOM_CLEARS = 400;
const MAX_TIERS = 16;

/** Content ids, roles, characters, build ids: short and made of id characters, so nothing typed into one can be markup. */
const ID = /^[\w.-]{1,64}$/;
const isId = (value) => typeof value === 'string' && ID.test(value);
const isCount = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const idList = (value) => (Array.isArray(value) ? value.filter(isId).slice(0, MAX_LIST) : []);

/** A run rebuilt from only the fields the game's schema defines, or `null` if it is not a run. */
export function cleanRun(run) {
  if (
    typeof run !== 'object' ||
    run === null ||
    !isId(run.runId) ||
    !isCount(run.recordedAt) ||
    // A seed typed into the dev seed box can be negative.
    !Number.isSafeInteger(run.seed) ||
    !isId(run.character) ||
    (run.outcome !== 'won' && run.outcome !== 'died') ||
    !Number.isInteger(run.floor) ||
    run.floor < 0 ||
    run.floor > 99 ||
    !isId(run.roomRole) ||
    !isCount(run.ticksSurvived)
  ) {
    return null;
  }
  const cause = run.deathCause;
  const tiers = {};
  if (typeof run.promilleTierTicks === 'object' && run.promilleTierTicks !== null) {
    for (const [tier, ticks] of Object.entries(run.promilleTierTicks).slice(0, MAX_TIERS)) {
      if (/^\d{1,2}$/.test(tier) && isCount(ticks)) {
        tiers[tier] = ticks;
      }
    }
  }
  return {
    runId: run.runId,
    recordedAt: run.recordedAt,
    seed: run.seed,
    character: run.character,
    outcome: run.outcome,
    floor: run.floor,
    roomRole: run.roomRole,
    ticksSurvived: run.ticksSurvived,
    deathCause:
      typeof cause === 'object' && cause !== null
        ? {
            // The death word is display text, not an id — keep it short and free of markup characters.
            word:
              typeof cause.word === 'string' && /^[\p{L}\p{N} '!?.,-]{1,40}$/u.test(cause.word)
                ? cause.word
                : null,
            enemiesPresent: idList(cause.enemiesPresent),
          }
        : null,
    itemsHeld: idList(run.itemsHeld),
    roomClears: (Array.isArray(run.roomClears) ? run.roomClears : [])
      .filter(
        (clear) =>
          typeof clear === 'object' &&
          clear !== null &&
          Number.isInteger(clear.floor) &&
          isId(clear.role) &&
          isCount(clear.ticks),
      )
      .slice(0, MAX_ROOM_CLEARS)
      .map((clear) => ({ floor: clear.floor, role: clear.role, ticks: clear.ticks })),
    promilleTierTicks: tiers,
    ...(isId(run.build) ? { build: run.build } : {}),
  };
}

/** An answer rebuilt the same way, or `null`. The text is the one free field; it is capped here and escaped where it is shown. */
export function cleanFeedback(entry) {
  if (
    typeof entry !== 'object' ||
    entry === null ||
    !isId(entry.id) ||
    !isId(entry.questionId) ||
    typeof entry.text !== 'string'
  ) {
    return null;
  }
  return {
    id: entry.id,
    questionId: entry.questionId,
    text: entry.text.slice(0, MAX_FEEDBACK_LENGTH),
    answeredAt: isCount(entry.answeredAt) ? entry.answeredAt : null,
  };
}

async function exportPage(env, cursorParam) {
  const page = await env.RUNS.list({ limit: EXPORT_PAGE_SIZE, cursor: cursorParam || undefined });
  const runs = [];
  const feedback = [];
  await Promise.all(
    page.keys.map(async ({ name }) => {
      const target = name.startsWith('run:')
        ? runs
        : name.startsWith('feedback:')
          ? feedback
          : null;
      if (target === null) {
        return;
      }
      const value = await env.RUNS.get(name);
      if (value !== null) {
        target.push(JSON.parse(value));
      }
    }),
  );
  return Response.json({
    schemaVersion: 1,
    sessionId: null,
    runs,
    feedback,
    cursor: page.list_complete ? null : page.cursor,
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = { 'Access-Control-Allow-Origin': '*' };

    if (request.method === 'GET' && url.pathname === '/export') {
      if (!env.ADMIN_KEY || url.searchParams.get('key') !== env.ADMIN_KEY) {
        return new Response('forbidden', { status: 403 });
      }
      return exportPage(env, url.searchParams.get('cursor'));
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
    // Optional — older clients send runs only.
    const sentFeedback = body.feedback === undefined ? [] : body.feedback;
    if (!Array.isArray(sentFeedback) || sentFeedback.length > MAX_FEEDBACK_PER_POST) {
      return new Response('bad shape', { status: 400, headers: cors });
    }

    // Records that are not what the game sends are dropped, not refused: the
    // game stamps a 2xx as delivered, and resending junk forever helps nobody.
    const runs = body.runs.map(cleanRun).filter((run) => run !== null);
    const feedback = sentFeedback.map(cleanFeedback).filter((entry) => entry !== null);
    const sessionId = isId(body.sessionId) ? body.sessionId : null;
    const records = runs.length + feedback.length;
    if (records === 0) {
      return new Response('ok', { status: 200, headers: cors });
    }

    // Approximate on purpose: KV is not atomic and serves a read up to a minute
    // stale, so a burst can run past the budget before the count catches up.
    // That is fine for a cap whose job is to stop a script, not to count exactly.
    const budgetKey = `budget:${new Date().toISOString().slice(0, 10)}`;
    const used = Number(await env.RUNS.get(budgetKey)) || 0;
    if (used + records > MAX_RECORDS_PER_DAY) {
      return new Response('daily limit reached', { status: 429, headers: cors });
    }

    await Promise.all([
      env.RUNS.put(budgetKey, String(used + records), { expirationTtl: 3 * 86_400 }),
      ...runs.map((run) => env.RUNS.put(`run:${run.runId}`, JSON.stringify({ ...run, sessionId }))),
      ...feedback.map((entry) =>
        env.RUNS.put(`feedback:${entry.id}`, JSON.stringify({ ...entry, sessionId })),
      ),
    ]);
    return new Response('ok', { status: 200, headers: cors });
  },
};
