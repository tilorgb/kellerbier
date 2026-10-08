import type {
  BarkDefinition,
  InstrumentDefinition,
  NoteEvent,
  SampleEdit,
  SampleRef,
  SfxDefinition,
  TrackDefinition,
} from '../app/audio/types.js';
import type { EnemySfxCategory } from '../content/audio/sfx.js';

export interface EnemySummary {
  readonly id: string;
  readonly name: string;
}

export interface AudioAssetSummary {
  readonly assetId: string;
  readonly fileName: string;
  readonly bytes: number;
}

const API_PREFIX = '/__audio-editor-api';

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_PREFIX}${path}`);
  if (!res.ok) {
    throw new Error(`GET ${path} failed: ${String(res.status)}`);
  }
  return (await res.json()) as T;
}

export function fetchTracks(): Promise<TrackDefinition[]> {
  return getJson('/tracks');
}

export function fetchInstruments(): Promise<InstrumentDefinition[]> {
  return getJson('/instruments');
}

export function fetchSfx(): Promise<SfxDefinition[]> {
  return getJson('/sfx');
}

/** Replaces a track's `events` array and writes `content/audio/tracks.ts` — throws with the server's own message on failure. */
export async function saveTrackEvents(
  trackId: string,
  events: readonly NoteEvent[],
): Promise<void> {
  const res = await fetch(`${API_PREFIX}/tracks/${encodeURIComponent(trackId)}/events`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ events }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `save failed: ${String(res.status)}`);
  }
}

/** Replaces an SFX's whole definition and writes `content/audio/sfx.ts` — throws with the server's own message on failure. */
export async function saveSfx(sfxId: string, definition: Omit<SfxDefinition, 'id'>): Promise<void> {
  const res = await fetch(`${API_PREFIX}/sfx/${encodeURIComponent(sfxId)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(definition),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `save failed: ${String(res.status)}`);
  }
}

export function fetchBarks(): Promise<BarkDefinition[]> {
  return getJson('/barks');
}

/** Replaces a bark's whole definition and writes `content/audio/barks.ts` — throws with the server's own message on failure. */
export async function saveBark(
  barkId: string,
  definition: Omit<BarkDefinition, 'id'>,
): Promise<void> {
  const res = await fetch(`${API_PREFIX}/barks/${encodeURIComponent(barkId)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(definition),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `save failed: ${String(res.status)}`);
  }
}

export function fetchEnemies(): Promise<EnemySummary[]> {
  return getJson('/enemies');
}

export function fetchEnemyCategories(): Promise<Record<string, EnemySfxCategory>> {
  return getJson('/enemy-categories');
}

export function fetchAudioAssets(): Promise<AudioAssetSummary[]> {
  return getJson('/audio-assets');
}

/**
 * Uploads a recorded file to `assets/audio/` — `fileName` keeps its original
 * extension (`.wav`/`.mp3`/`.ogg`) but is otherwise re-slugified server-side,
 * so the `assetId`/`fileName` this resolves to may not match what was
 * passed in verbatim; always use the response's own fields, not the input.
 */
export async function uploadAudioAsset(
  fileName: string,
  bytes: ArrayBuffer,
  generated?: GeneratedOrigin,
): Promise<{ assetId: string; fileName: string }> {
  const dataBase64 = arrayBufferToBase64(bytes);
  const res = await fetch(`${API_PREFIX}/audio-assets`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      fileName,
      dataBase64,
      ...(generated === undefined ? {} : { generated }),
    }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
    assetId?: string;
    fileName?: string;
  };
  if (!res.ok || body.assetId === undefined || body.fileName === undefined) {
    throw new Error(body.error ?? `upload failed: ${String(res.status)}`);
  }
  return { assetId: body.assetId, fileName: body.fileName };
}

/** Where a generated file came from — what the upload records in `assets/audio/README.md` so the file can be told from a recording, and made again. */
export interface GeneratedOrigin {
  readonly prompt: string;
  readonly seed: number;
  /** Which take of the batch, from 1, and how many the batch had: the seed alone only reproduces the whole batch. */
  readonly take: number;
  readonly count: number;
}

export interface GeneratedTake {
  readonly take: number;
  readonly seconds: number;
  /** How many separate sounds the model's raw take held; the one-shot is cut from one of them. */
  readonly events: number;
  /** The sound never stopped for the whole take — a drone or a noise bed rather than a one-shot. */
  readonly fillsTake: boolean;
  readonly dataBase64: string;
}

export interface GeneratedTakes {
  readonly prompt: string;
  readonly seed: number;
  readonly count: number;
  readonly extension: string;
  readonly takes: readonly GeneratedTake[];
  /** Takes the bench threw away itself (silence) — not returned, only counted. */
  readonly dropped: number;
}

/**
 * Asks the local sound bench, by way of the dev server, for takes of a
 * prompted sound. Nothing is saved by this — a take becomes an asset only
 * when it is passed to `uploadAudioAsset` with its `GeneratedOrigin`. Throws
 * with the server's own message, which for a bench that is not running says
 * how to start it.
 */
export async function generateSoundTakes(request: {
  prompt: string;
  seconds: number;
  pick: 'loudest' | 'all';
}): Promise<GeneratedTakes> {
  const res = await fetch(`${API_PREFIX}/generated-takes`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...request, negative: GENERATE_NEGATIVE }),
  });
  const body = (await res.json().catch(() => ({}))) as GeneratedTakes & { error?: string };
  if (!res.ok) {
    throw new Error(body.error ?? `generate failed: ${String(res.status)}`);
  }
  return body;
}

/** What a sound effect is never meant to be, whatever the prompt asked for. */
const GENERATE_NEGATIVE =
  'music, melody, speech, voice, singing, reverb, echo, background noise, hiss';

export function base64ToArrayBuffer(dataBase64: string): ArrayBuffer {
  const binary = atob(dataBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/** `btoa` only takes a "binary string" — chunked so a several-MB recording doesn't blow the call-stack argument limit `String.fromCharCode(...bytes)` would hit in one shot (the same reasoning `pixel-editor/api-client.ts#bytesToBase64` gives its own copy of this). */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const CHUNK_SIZE = 0x8000;
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + CHUNK_SIZE));
  }
  return btoa(binary);
}

/** Sets (or, passing `null`, clears) a track's `sample` field. */
export async function saveTrackSample(trackId: string, sample: SampleRef | null): Promise<void> {
  await postSample('tracks', trackId, sample);
}

/** Sets (or, passing `null`, clears) an SFX's `sample` field. */
export async function saveSfxSample(sfxId: string, sample: SampleRef | null): Promise<void> {
  await postSample('sfx', sfxId, sample);
}

export interface SfxSampleBatchChange {
  readonly sfxId: string;
  readonly remove: boolean;
  readonly edit?: SampleEdit;
  /** An already-saved recording to point at; ignored when `file` is present. */
  readonly assetId?: string;
  readonly file?: {
    readonly fileName: string;
    readonly bytes: ArrayBuffer;
    readonly generated?: GeneratedOrigin;
  };
}

/**
 * Applies many SFX sample changes in one request: the recordings are written,
 * then `sfx.ts` once — so the game reloads once for the whole batch. Resolves
 * to the files that were written (their server-side `assetId`/`fileName`).
 */
export async function applySfxSampleBatch(
  changes: readonly SfxSampleBatchChange[],
): Promise<{ sfxId: string; assetId: string; fileName: string }[]> {
  const res = await fetch(`${API_PREFIX}/sfx-sample-batch`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      changes: changes.map((change) => ({
        sfxId: change.sfxId,
        remove: change.remove,
        ...(change.edit === undefined ? {} : { edit: change.edit }),
        ...(change.assetId === undefined ? {} : { assetId: change.assetId }),
        ...(change.file === undefined
          ? {}
          : {
              file: {
                fileName: change.file.fileName,
                dataBase64: arrayBufferToBase64(change.file.bytes),
                ...(change.file.generated === undefined
                  ? {}
                  : { generated: change.file.generated }),
              },
            }),
      })),
    }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
    written?: { sfxId: string; assetId: string; fileName: string }[];
  };
  if (!res.ok) {
    throw new Error(body.error ?? `apply failed: ${String(res.status)}`);
  }
  return body.written ?? [];
}

/** Sets (or, passing `null`, clears) a bark's `sample` field. */
export async function saveBarkSample(barkId: string, sample: SampleRef | null): Promise<void> {
  await postSample('barks', barkId, sample);
}

async function postSample(
  kind: 'tracks' | 'sfx' | 'barks',
  id: string,
  sample: SampleRef | null,
): Promise<void> {
  const res = await fetch(`${API_PREFIX}/${kind}/${encodeURIComponent(id)}/sample`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(sample),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `save failed: ${String(res.status)}`);
  }
}

/** Replaces the whole `ENEMY_SFX_CATEGORY` map and writes `content/audio/sfx.ts` — throws with the server's own message on failure. */
export async function saveEnemyCategories(map: Record<string, EnemySfxCategory>): Promise<void> {
  const res = await fetch(`${API_PREFIX}/enemy-categories`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(map),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `save failed: ${String(res.status)}`);
  }
}
