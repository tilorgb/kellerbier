import type {
  BarkDefinition,
  InstrumentDefinition,
  NoteEvent,
  SfxDefinition,
  TrackDefinition,
} from '../app/audio/types.js';
import type { EnemySfxCategory } from '../content/audio/sfx.js';

export interface EnemySummary {
  readonly id: string;
  readonly name: string;
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
