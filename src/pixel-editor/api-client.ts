/**
 * Thin wrapper around `tools/pixel-editor/server.mjs`'s three endpoints.
 * Dev-only by construction, same as `src/editor/api-client.ts` — the
 * endpoints only exist under `vite`/`vite dev`.
 */

const API_BASE = '/__pixel-editor-api/sprites';

export interface SpriteSummary {
  readonly bucketId: string;
  readonly category: string;
  readonly name: string;
  readonly hasAnimation: boolean;
}

export interface LoadedSprite {
  readonly frameWidth: number;
  readonly frameHeight: number;
  readonly frames: readonly Uint8ClampedArray[];
  readonly frameDurationMs: number;
  readonly loop: boolean;
}

export interface SaveResult {
  readonly ok: boolean;
  readonly error?: string;
}

export interface SpriteToSave {
  readonly frameWidth: number;
  readonly frameHeight: number;
  readonly frames: readonly Uint8ClampedArray[];
  readonly frameDurationMs: number;
  readonly loop: boolean;
}

function spritePath(bucketId: string, category: string, name: string): string {
  return `${API_BASE}/${encodeURIComponent(bucketId)}/${encodeURIComponent(category)}/${encodeURIComponent(name)}`;
}

/**
 * `btoa`/`atob` only take/return "binary strings", one JS UTF-16 code unit
 * per byte — chunked so a large boss strip doesn't blow the call-stack
 * argument limit `String.fromCharCode(...bytes)` would hit in one shot.
 * Exported alongside `base64ToBytes` because `main.ts` reuses the same pair
 * to snapshot the in-progress canvas around the art pipeline's post-save
 * full reload — see its `SNAPSHOT_KEY` comment.
 */
export function bytesToBase64(bytes: Uint8ClampedArray): string {
  const CHUNK_SIZE = 0x8000;
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + CHUNK_SIZE));
  }
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8ClampedArray {
  const binary = atob(base64);
  const bytes = new Uint8ClampedArray(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export async function listSprites(): Promise<SpriteSummary[]> {
  const response = await fetch(API_BASE);
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok || typeof body !== 'object' || body === null || !('sprites' in body)) {
    return [];
  }
  return (body as { sprites: SpriteSummary[] }).sprites;
}

export async function loadSprite(
  bucketId: string,
  category: string,
  name: string,
): Promise<LoadedSprite | null> {
  const response = await fetch(spritePath(bucketId, category, name));
  if (!response.ok) {
    return null;
  }
  const body = (await response.json()) as {
    frameWidth: number;
    frameHeight: number;
    frames: string[];
    frameDurationMs: number;
    loop: boolean;
  };
  return {
    frameWidth: body.frameWidth,
    frameHeight: body.frameHeight,
    frames: body.frames.map(base64ToBytes),
    frameDurationMs: body.frameDurationMs,
    loop: body.loop,
  };
}

export async function saveSprite(
  bucketId: string,
  category: string,
  name: string,
  sprite: SpriteToSave,
): Promise<SaveResult> {
  const response = await fetch(spritePath(bucketId, category, name), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      frameWidth: sprite.frameWidth,
      frameHeight: sprite.frameHeight,
      frames: sprite.frames.map(bytesToBase64),
      frameDurationMs: sprite.frameDurationMs,
      loop: sprite.loop,
    }),
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
