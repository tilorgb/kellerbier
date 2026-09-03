import type {
  BarkDefinition,
  InstrumentDefinition,
  NoteEvent,
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
): Promise<{ assetId: string; fileName: string }> {
  const dataBase64 = arrayBufferToBase64(bytes);
  const res = await fetch(`${API_PREFIX}/audio-assets`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fileName, dataBase64 }),
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
