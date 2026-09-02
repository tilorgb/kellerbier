import type { InstrumentDefinition, NoteEvent, TrackDefinition } from '../app/audio/types.js';

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
