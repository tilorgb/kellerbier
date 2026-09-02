/**
 * Dev-server half of the audio editor: a Vite plugin, wired into
 * `vite.config.ts`, exposing the endpoints `audio-editor.html`'s browser app
 * talks to under `/__audio-editor-api/`:
 *
 * - `GET  /tracks`               — every `TrackDefinition`, live from `src/content/audio/tracks.ts`
 * - `GET  /instruments`          — every `InstrumentDefinition`
 * - `GET  /sfx`                  — every `SfxDefinition`, live from `src/content/audio/sfx.ts`
 * - `GET  /barks`                — every `BarkDefinition`, live from `src/content/audio/barks.ts`
 * - `GET  /enemies`               — every enemy's `{id, name}`, live from `src/content/enemies/index.ts`
 * - `GET  /enemy-categories`     — the `ENEMY_SFX_CATEGORY` map, live from `src/content/audio/sfx.ts`
 * - `POST /tracks/:id/events`    — replaces one track's `events` array and writes the file
 * - `POST /sfx/:id`              — replaces one SFX's whole definition and writes the file
 * - `POST /barks/:id`            — replaces one bark's whole definition and writes the file
 * - `POST /enemy-categories`     — replaces the whole `ENEMY_SFX_CATEGORY` map and writes the file
 *
 * `configureServer` middleware only ever runs under `vite`/`vite dev`, never
 * `vite build`/`vite preview` — see `tools/room-editor/server.mjs`, the
 * sibling this follows for both the read side (`server.ssrLoadModule`, so
 * the browser always sees exactly what the game would load — no second
 * parser reimplementing what `content/audio/index.ts` already exports) and
 * the `handleHotUpdate` swallow (saving one track shouldn't blow away
 * whatever else the editor had open).
 *
 * The write side is the one genuinely new piece: `content/audio/tracks.ts`
 * is hand-authored TypeScript, not JSON, because a composition reads better
 * as source with comments than as a data file (`docs/TECH_STACK.md`'s
 * "content as data" already covers JSON-shaped content; a track's `events`
 * array is exactly that shape, just embedded in a `.ts` file next to prose
 * about what the track is for). Rather than round-tripping through a
 * second, editor-owned file format, `findEventsArraySpan` parses the real
 * file with the TypeScript compiler (already a project dependency) to find
 * exactly the `events: [...]` span for the requested export, and only that
 * span is replaced — every doc comment, every other track, and the
 * `id`/`title`/`ticksPerBeat`/`loopBeats` fields on the edited track itself
 * are left untouched. The result is reformatted with Prettier before
 * writing, so hand-built replacement text never has to match the project's
 * style by eye.
 */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
import * as prettier from 'prettier';

const API_PREFIX = '/__audio-editor-api/';
const TRACKS_FILE = 'src/content/audio/tracks.ts';
const SFX_FILE = 'src/content/audio/sfx.ts';
const BARKS_FILE = 'src/content/audio/barks.ts';

/**
 * Track id (`TrackDefinition.id`, what the browser and the game both use) →
 * the `export const` name in `tracks.ts` the id lives on — the one mapping
 * that has to be kept in sync by hand when a track is added there, since a
 * `.ts` export name and a content id are not mechanically derivable from
 * each other (`'floor-1-der-keller'` vs. `floor1DerKeller`).
 */
const EXPORT_NAME_BY_TRACK_ID = {
  'floor-1-der-keller': 'floor1DerKeller',
  'floor-2-dorf-acker': 'floor2DorfUndAcker',
  'boss-kellerassel': 'bossKellerassel',
  'boss-der-stier': 'bossDerStier',
  'title-theme': 'titleTheme',
  'hub-theme': 'hubTheme',
  'victory-theme': 'victoryTheme',
};

export function audioEditorServerPlugin() {
  const pendingOwnWrites = new Set();

  return {
    name: 'audio-editor-server',
    handleHotUpdate(ctx) {
      if (pendingOwnWrites.has(ctx.file)) {
        pendingOwnWrites.delete(ctx.file);
        return [];
      }
      return undefined;
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? '';
        if (!url.startsWith(API_PREFIX)) {
          next();
          return;
        }
        const route = url.slice(API_PREFIX.length);

        try {
          if (req.method === 'GET' && route === 'tracks') {
            const mod = await server.ssrLoadModule('/src/content/audio/tracks.ts');
            respondJson(res, 200, mod.TRACK_DEFINITIONS);
            return;
          }
          if (req.method === 'GET' && route === 'instruments') {
            const mod = await server.ssrLoadModule('/src/content/audio/instruments.ts');
            respondJson(res, 200, mod.INSTRUMENT_DEFINITIONS);
            return;
          }
          if (req.method === 'GET' && route === 'sfx') {
            const mod = await server.ssrLoadModule('/src/content/audio/sfx.ts');
            respondJson(res, 200, mod.SFX_DEFINITIONS);
            return;
          }
          if (req.method === 'GET' && route === 'barks') {
            const mod = await server.ssrLoadModule('/src/content/audio/barks.ts');
            respondJson(res, 200, mod.BARK_DEFINITIONS);
            return;
          }
          if (req.method === 'GET' && route === 'enemies') {
            const mod = await server.ssrLoadModule('/src/content/enemies/index.ts');
            respondJson(
              res,
              200,
              mod.ENEMY_DEFINITIONS.map((enemy) => ({ id: enemy.id, name: enemy.name })),
            );
            return;
          }
          if (req.method === 'GET' && route === 'enemy-categories') {
            const mod = await server.ssrLoadModule('/src/content/audio/sfx.ts');
            respondJson(res, 200, mod.ENEMY_SFX_CATEGORY);
            return;
          }
          const eventsMatch = /^tracks\/([^/]+)\/events$/.exec(route);
          if (req.method === 'POST' && eventsMatch) {
            const trackId = decodeURIComponent(eventsMatch[1]);
            await handleSaveEvents(
              server,
              res,
              trackId,
              JSON.parse(await readBody(req)),
              pendingOwnWrites,
            );
            return;
          }
          const sfxMatch = /^sfx\/([^/]+)$/.exec(route);
          if (req.method === 'POST' && sfxMatch) {
            const sfxId = decodeURIComponent(sfxMatch[1]);
            await handleSaveSfx(
              server,
              res,
              sfxId,
              JSON.parse(await readBody(req)),
              pendingOwnWrites,
            );
            return;
          }
          const barkMatch = /^barks\/([^/]+)$/.exec(route);
          if (req.method === 'POST' && barkMatch) {
            const barkId = decodeURIComponent(barkMatch[1]);
            await handleSaveBark(
              server,
              res,
              barkId,
              JSON.parse(await readBody(req)),
              pendingOwnWrites,
            );
            return;
          }
          if (req.method === 'POST' && route === 'enemy-categories') {
            await handleSaveEnemyCategories(
              server,
              res,
              JSON.parse(await readBody(req)),
              pendingOwnWrites,
            );
            return;
          }
          respondJson(res, 404, {
            error: `no audio-editor route for ${req.method ?? '?'} ${route}`,
          });
        } catch (error) {
          respondJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
        }
      });
    },
  };
}

async function handleSaveEvents(server, res, trackId, body, pendingOwnWrites) {
  const exportName = EXPORT_NAME_BY_TRACK_ID[trackId];
  if (exportName === undefined) {
    respondJson(res, 404, {
      error: `unknown track id "${trackId}" — add it to EXPORT_NAME_BY_TRACK_ID in tools/audio-editor/server.mjs`,
    });
    return;
  }
  if (!Array.isArray(body?.events)) {
    respondJson(res, 400, { error: '"events" must be an array' });
    return;
  }

  const eventsError = validateEvents(body.events);
  if (eventsError !== null) {
    respondJson(res, 422, { error: eventsError });
    return;
  }

  const filePath = path.join(server.config.root, TRACKS_FILE);
  const sourceText = await readFile(filePath, 'utf8');
  const span = findEventsArraySpan(sourceText, exportName);
  if (span === null) {
    respondJson(res, 404, {
      error: `could not find "events" on "export const ${exportName}" in ${TRACKS_FILE}`,
    });
    return;
  }

  const replaced =
    sourceText.slice(0, span.start) + renderEventsArray(body.events) + sourceText.slice(span.end);
  const config = (await prettier.resolveConfig(filePath)) ?? {};
  const formatted = await prettier.format(replaced, { ...config, filepath: filePath });

  pendingOwnWrites.add(filePath);
  await writeFile(filePath, formatted, 'utf8');
  respondJson(res, 200, { ok: true });
}

/**
 * Unlike `EXPORT_NAME_BY_TRACK_ID`, `sfx.ts`'s and `barks.ts`'s ids all
 * follow one mechanical rule end to end (`'hit-squelch'` -> `hitSquelch`,
 * `'geh-weida'` -> `gehWeida`), so `handleSaveSfx`/`handleSaveBark` derive
 * the export name rather than hand-mapping it — but derived is not the same
 * as trusted: both still confirm a `const` by that exact name exists before
 * writing anything, and report the id/name they tried if it doesn't, rather
 * than silently writing to the wrong place or failing opaquely.
 */
function kebabToCamel(id) {
  return id
    .split('-')
    .map((part, index) => (index === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join('');
}

async function handleSaveSfx(server, res, sfxId, body, pendingOwnWrites) {
  const exportName = kebabToCamel(sfxId);
  const validationError = validateSfx(body);
  if (validationError !== null) {
    respondJson(res, 422, { error: validationError });
    return;
  }

  const filePath = path.join(server.config.root, SFX_FILE);
  const sourceText = await readFile(filePath, 'utf8');
  const span = findConstInitializerSpan(sourceText, 'sfx.ts', exportName);
  if (span === null) {
    respondJson(res, 404, {
      error: `no "const ${exportName}" in ${SFX_FILE} (derived from sfx id "${sfxId}")`,
    });
    return;
  }

  const replaced =
    sourceText.slice(0, span.start) + renderSfxDefinition(sfxId, body) + sourceText.slice(span.end);
  const config = (await prettier.resolveConfig(filePath)) ?? {};
  const formatted = await prettier.format(replaced, { ...config, filepath: filePath });

  pendingOwnWrites.add(filePath);
  await writeFile(filePath, formatted, 'utf8');
  respondJson(res, 200, { ok: true });
}

const FILTER_TYPES = new Set(['lowpass', 'bandpass', 'highpass']);

/** Same shape `content/audio/types.ts`'s `SfxDefinition` describes. */
function validateSfx(def) {
  if (typeof def?.description !== 'string') {
    return '"description" must be a string';
  }
  if (def.noise === undefined && def.tone === undefined) {
    return 'an SFX needs at least a "noise" layer, a "tone" layer, or both';
  }
  if (def.noise !== undefined) {
    const { filter, durationSeconds, gain } = def.noise;
    if (typeof durationSeconds !== 'number' || typeof gain !== 'number') {
      return 'noise.durationSeconds and noise.gain must be numbers';
    }
    if (filter !== undefined) {
      if (!FILTER_TYPES.has(filter.type)) {
        return `noise.filter.type must be one of ${[...FILTER_TYPES].join(', ')}`;
      }
      if (typeof filter.frequencyHz !== 'number' || typeof filter.q !== 'number') {
        return 'noise.filter.frequencyHz and noise.filter.q must be numbers';
      }
    }
  }
  if (def.tone !== undefined) {
    const { instrument, note, durationSeconds } = def.tone;
    if (typeof instrument !== 'string' || instrument.length === 0) {
      return 'tone.instrument must be a non-empty string';
    }
    if (typeof note !== 'string' || note.length === 0) {
      return 'tone.note must be a non-empty string';
    }
    if (typeof durationSeconds !== 'number') {
      return 'tone.durationSeconds must be a number';
    }
  }
  if (def.pitchJitterCents !== undefined && typeof def.pitchJitterCents !== 'number') {
    return 'pitchJitterCents must be a number if present';
  }
  return null;
}

function renderSfxDefinition(id, def) {
  const parts = [`id: ${JSON.stringify(id)}`, `description: ${JSON.stringify(def.description)}`];
  if (def.noise !== undefined) {
    const filterPart =
      def.noise.filter === undefined
        ? ''
        : `filter: { type: ${JSON.stringify(def.noise.filter.type)}, frequencyHz: ${String(def.noise.filter.frequencyHz)}, q: ${String(def.noise.filter.q)} }, `;
    parts.push(
      `noise: { ${filterPart}durationSeconds: ${String(def.noise.durationSeconds)}, gain: ${String(def.noise.gain)} }`,
    );
  }
  if (def.tone !== undefined) {
    parts.push(
      `tone: { instrument: ${JSON.stringify(def.tone.instrument)}, note: ${JSON.stringify(def.tone.note)}, durationSeconds: ${String(def.tone.durationSeconds)} }`,
    );
  }
  if (def.pitchJitterCents !== undefined) {
    parts.push(`pitchJitterCents: ${String(def.pitchJitterCents)}`);
  }
  return `{\n  ${parts.join(',\n  ')},\n}`;
}

async function handleSaveBark(server, res, barkId, body, pendingOwnWrites) {
  const exportName = kebabToCamel(barkId);
  const validationError = validateBark(body);
  if (validationError !== null) {
    respondJson(res, 422, { error: validationError });
    return;
  }

  const filePath = path.join(server.config.root, BARKS_FILE);
  const sourceText = await readFile(filePath, 'utf8');
  const span = findConstInitializerSpan(sourceText, 'barks.ts', exportName);
  if (span === null) {
    respondJson(res, 404, {
      error: `no "const ${exportName}" in ${BARKS_FILE} (derived from bark id "${barkId}")`,
    });
    return;
  }

  const replaced =
    sourceText.slice(0, span.start) +
    renderBarkDefinition(barkId, body) +
    sourceText.slice(span.end);
  const config = (await prettier.resolveConfig(filePath)) ?? {};
  const formatted = await prettier.format(replaced, { ...config, filepath: filePath });

  pendingOwnWrites.add(filePath);
  await writeFile(filePath, formatted, 'utf8');
  respondJson(res, 200, { ok: true });
}

/** Same shape `content/audio/types.ts`'s `BarkDefinition` describes. */
function validateBark(def) {
  if (typeof def?.text !== 'string' || def.text.length === 0) {
    return '"text" must be a non-empty string';
  }
  const motif = def.motif;
  if (typeof motif?.instrument !== 'string' || motif.instrument.length === 0) {
    return 'motif.instrument must be a non-empty string';
  }
  if (!Array.isArray(motif.notes) || motif.notes.length === 0) {
    return 'motif.notes must be a non-empty array of note names';
  }
  if (!motif.notes.every((note) => typeof note === 'string' && note.length > 0)) {
    return 'every motif.notes entry must be a non-empty string';
  }
  if (typeof motif.noteDurationSeconds !== 'number') {
    return 'motif.noteDurationSeconds must be a number';
  }
  return null;
}

function renderBarkDefinition(id, def) {
  const notes = def.motif.notes.map((note) => JSON.stringify(note)).join(', ');
  return (
    `{\n` +
    `  id: ${JSON.stringify(id)},\n` +
    `  text: ${JSON.stringify(def.text)},\n` +
    `  motif: {\n` +
    `    instrument: ${JSON.stringify(def.motif.instrument)},\n` +
    `    notes: [${notes}],\n` +
    `    noteDurationSeconds: ${String(def.motif.noteDurationSeconds)},\n` +
    `  },\n` +
    `}`
  );
}

const KNOWN_ENEMY_SFX_CATEGORIES = new Set(['squelch', 'metal', 'animal', 'folk', 'oompah']);

async function handleSaveEnemyCategories(server, res, body, pendingOwnWrites) {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    respondJson(res, 400, { error: 'body must be an object mapping enemy id -> category' });
    return;
  }

  const enemiesMod = await server.ssrLoadModule('/src/content/enemies/index.ts');
  const rosterIds = new Set(enemiesMod.ENEMY_DEFINITIONS.map((enemy) => enemy.id));
  const submittedIds = new Set(Object.keys(body));

  for (const [id, category] of Object.entries(body)) {
    if (!rosterIds.has(id)) {
      respondJson(res, 422, { error: `"${id}" is not an enemy id in the current roster` });
      return;
    }
    if (!KNOWN_ENEMY_SFX_CATEGORIES.has(category)) {
      respondJson(res, 422, {
        error: `"${id}": category must be one of ${[...KNOWN_ENEMY_SFX_CATEGORIES].join(', ')}, got "${String(category)}"`,
      });
      return;
    }
  }
  const missing = [...rosterIds].filter((id) => !submittedIds.has(id));
  if (missing.length > 0) {
    respondJson(res, 422, {
      error: `missing a category for: ${missing.join(', ')} — every enemy needs one (tests/content/audio.test.ts checks this)`,
    });
    return;
  }

  const filePath = path.join(server.config.root, SFX_FILE);
  const sourceText = await readFile(filePath, 'utf8');
  const sourceFile = ts.createSourceFile('sfx.ts', sourceText, ts.ScriptTarget.Latest, true);
  const initializer = findTopLevelConstInitializer(sourceFile, 'ENEMY_SFX_CATEGORY');
  if (initializer === null || !ts.isObjectLiteralExpression(initializer)) {
    respondJson(res, 404, { error: `no "const ENEMY_SFX_CATEGORY" in ${SFX_FILE}` });
    return;
  }
  const span = { start: initializer.getStart(sourceFile), end: initializer.getEnd() };

  // Keeps the file's existing key order for keys that already existed —
  // otherwise every save reorders the whole map to whatever order the
  // roster happened to load in, and a one-enemy re-sort turns into a
  // diff that touches every line, unreviewable and useless for git blame.
  // New keys (a roster addition the map hadn't caught up to yet) are
  // appended at the end, in whatever order the browser submitted them.
  const existingOrder = objectLiteralKeyOrder(initializer);
  const remaining = new Set(Object.keys(body));
  const orderedKeys = [];
  for (const key of existingOrder) {
    if (remaining.has(key)) {
      orderedKeys.push(key);
      remaining.delete(key);
    }
  }
  orderedKeys.push(...remaining);

  const replaced =
    sourceText.slice(0, span.start) +
    renderEnemyCategoryMap(body, orderedKeys) +
    sourceText.slice(span.end);
  const config = (await prettier.resolveConfig(filePath)) ?? {};
  const formatted = await prettier.format(replaced, { ...config, filepath: filePath });

  pendingOwnWrites.add(filePath);
  await writeFile(filePath, formatted, 'utf8');
  respondJson(res, 200, { ok: true });
}

/** An object literal's property keys, in source order — string literal or identifier names alike. */
function objectLiteralKeyOrder(objectLiteral) {
  const keys = [];
  for (const prop of objectLiteral.properties) {
    if (ts.isPropertyAssignment(prop)) {
      if (ts.isIdentifier(prop.name)) {
        keys.push(prop.name.text);
      } else if (ts.isStringLiteral(prop.name)) {
        keys.push(prop.name.text);
      }
    }
  }
  return keys;
}

function renderEnemyCategoryMap(map, orderedKeys) {
  const lines = orderedKeys.map((id) => `  ${JSON.stringify(id)}: ${JSON.stringify(map[id])},`);
  return `{\n${lines.join('\n')}\n}`;
}

/** Same shape `content/audio/types.ts`'s `NoteEvent` describes, checked by hand rather than importing a runtime validator that doesn't exist yet. */
function validateEvents(events) {
  for (const [index, event] of events.entries()) {
    if (typeof event.beat !== 'number' || typeof event.durationBeats !== 'number') {
      return `event ${String(index)}: "beat" and "durationBeats" must be numbers`;
    }
    if (typeof event.instrument !== 'string' || event.instrument.length === 0) {
      return `event ${String(index)}: "instrument" must be a non-empty string`;
    }
    const note = event.note;
    const notesOk =
      typeof note === 'string' || (Array.isArray(note) && note.every((n) => typeof n === 'string'));
    if (!notesOk) {
      return `event ${String(index)}: "note" must be a string or an array of strings`;
    }
    if (event.velocity !== undefined && typeof event.velocity !== 'number') {
      return `event ${String(index)}: "velocity" must be a number if present`;
    }
  }
  return null;
}

/**
 * The initializer expression of `const <name> = ...` (or `export const`) at
 * the top level of `sourceFile`, or `null` — the one piece of AST-walking
 * both `findEventsArraySpan` and `findConstInitializerSpan` need, so a
 * track's `events` sub-property and an SFX's whole object share the same
 * "find the declaration" step and differ only in what they do with it.
 */
function findTopLevelConstInitializer(sourceFile, exportName) {
  let initializer = null;
  function visit(node) {
    if (initializer !== null) {
      return;
    }
    if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (
          ts.isIdentifier(decl.name) &&
          decl.name.text === exportName &&
          decl.initializer !== undefined
        ) {
          initializer = decl.initializer;
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return initializer;
}

/** The `[start, end)` source span of `export const <exportName>`'s `events` property initializer, or `null`. */
function findEventsArraySpan(sourceText, exportName) {
  const sourceFile = ts.createSourceFile('tracks.ts', sourceText, ts.ScriptTarget.Latest, true);
  const initializer = findTopLevelConstInitializer(sourceFile, exportName);
  if (initializer === null || !ts.isObjectLiteralExpression(initializer)) {
    return null;
  }
  for (const prop of initializer.properties) {
    if (
      ts.isPropertyAssignment(prop) &&
      ts.isIdentifier(prop.name) &&
      prop.name.text === 'events'
    ) {
      return { start: prop.initializer.getStart(sourceFile), end: prop.initializer.getEnd() };
    }
  }
  return null;
}

/** The `[start, end)` source span of `const <exportName>`'s entire initializer, or `null`. */
function findConstInitializerSpan(sourceText, fileName, exportName) {
  const sourceFile = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true);
  const initializer = findTopLevelConstInitializer(sourceFile, exportName);
  if (initializer === null) {
    return null;
  }
  return { start: initializer.getStart(sourceFile), end: initializer.getEnd() };
}

function renderEventsArray(events) {
  const lines = events.map((event) => `  ${renderEvent(event)},`);
  return `[\n${lines.join('\n')}\n]`;
}

function renderEvent(event) {
  const note = Array.isArray(event.note)
    ? `[${event.note.map((n) => JSON.stringify(n)).join(', ')}]`
    : JSON.stringify(event.note);
  const velocity = event.velocity === undefined ? '' : `, velocity: ${String(event.velocity)}`;
  return (
    `{ beat: ${String(event.beat)}, durationBeats: ${String(event.durationBeats)}, ` +
    `instrument: ${JSON.stringify(event.instrument)}, note: ${note}${velocity} }`
  );
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', reject);
  });
}

function respondJson(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(body));
}
