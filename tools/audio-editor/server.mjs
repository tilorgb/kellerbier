/**
 * Dev-server half of the audio editor: a Vite plugin, wired into
 * `vite.config.ts`, exposing the endpoints `audio-editor.html`'s browser app
 * talks to under `/__audio-editor-api/`:
 *
 * - `GET  /tracks`               — every `TrackDefinition`, live from `src/content/audio/tracks.ts`
 * - `GET  /instruments`          — every `InstrumentDefinition`
 * - `GET  /sfx`                  — every `SfxDefinition`, live from `src/content/audio/sfx.ts`
 * - `POST /tracks/:id/events`    — replaces one track's `events` array and writes the file
 * - `POST /sfx/:id`              — replaces one SFX's whole definition and writes the file
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
 * Unlike `EXPORT_NAME_BY_TRACK_ID`, `sfx.ts`'s ids all follow one mechanical
 * rule end to end (`'hit-squelch'` -> `hitSquelch`), so the export name is
 * derived rather than hand-mapped — but derived is not the same as trusted:
 * `handleSaveSfx` still confirms a `const` by that exact name exists before
 * writing anything, and reports the id/name it tried if it doesn't, rather
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
