/**
 * Thin wrapper around the one save endpoint the dev-server plugin
 * (`tools/room-editor/server.mjs`) exposes. Dev-only by construction: the
 * endpoint itself only exists under `vite`/`vite dev`, never a production
 * build, so there is nothing to guard here.
 */
export interface SaveResult {
  readonly ok: boolean;
  readonly error?: string;
}

export async function saveRoom(id: string, data: unknown): Promise<SaveResult> {
  const response = await fetch(`/__room-editor-api/rooms/${encodeURIComponent(id)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(data),
  });
  const body: unknown = await response.json().catch(() => null);
  if (response.ok) {
    return { ok: true };
  }
  const error =
    typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string'
      ? body.error
      : `save failed with status ${String(response.status)}`;
  return { ok: false, error };
}
