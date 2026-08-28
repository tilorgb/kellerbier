/**
 * Thin wrapper around the one save endpoint the dev-server plugin
 * (`tools/room-editor/server.mjs`) exposes — available under `vite dev`. In
 * a production build (the CI-published preview, per #108's split-view work)
 * nothing is listening on that endpoint, so `saveRoom` branches on
 * `import.meta.env.DEV` and exports the room JSON to disk via
 * `dev-ui/file-export.ts` instead.
 */

import { exportFile } from '../dev-ui/file-export.js';

export interface SaveResult {
  readonly ok: boolean;
  readonly error?: string;
  /** Which path actually wrote the file — lets the caller word the status message correctly. */
  readonly via?: 'dev-server' | 'file-export';
}

export async function saveRoom(id: string, data: unknown): Promise<SaveResult> {
  if (!import.meta.env.DEV) {
    return saveRoomToDisk(id, data);
  }
  const response = await fetch(`/__room-editor-api/rooms/${encodeURIComponent(id)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(data),
  });
  const body: unknown = await response.json().catch(() => null);
  if (response.ok) {
    return { ok: true, via: 'dev-server' };
  }
  const error =
    typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string'
      ? body.error
      : `save failed with status ${String(response.status)}`;
  return { ok: false, error, via: 'dev-server' };
}

async function saveRoomToDisk(id: string, data: unknown): Promise<SaveResult> {
  const blob = new Blob([`${JSON.stringify(data, null, 2)}\n`], { type: 'application/json' });
  const result = await exportFile(`${id}.json`, blob, 'Room template JSON');
  if (!result.ok) {
    return {
      ok: false,
      via: 'file-export',
      error: result.cancelled ? 'save cancelled' : (result.error ?? 'save failed'),
    };
  }
  return { ok: true, via: 'file-export' };
}
