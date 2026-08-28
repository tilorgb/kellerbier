import type { Texture } from 'pixi.js';

/**
 * The parent-window half of the pixel editor's (#108) live preview: the
 * docked iframe (`app/editor-dock.ts`) posts the sprite it is currently
 * drawing on every paint, and — when that sprite already has a real
 * `Texture` object wired into the running game (`render/floor-art.ts`'s
 * `enemyArt`/`tileTextures`, today Floor 1/2's tiles and enemies) — this
 * mutates that texture's backing resource in place rather than replacing the
 * `Texture` object itself. Every `Sprite` already drawing with it, anywhere
 * in the room, repaints on the very next frame with no reload and no new
 * object to thread through `GameView`/`EntityView`.
 *
 * A sprite with no existing target (a boss, a projectile, floors 3-7, a
 * brand-new enemy id not yet added to `floor-art.ts`) has nothing to mutate
 * — there is no generic "any sprite, by name" registry in the renderer today
 * (see `docs/DECISIONS.md`'s pixel-editor entries), only the specific
 * textures `floor-art.ts` happens to have already loaded. `applied: false`
 * in the ack tells the pixel editor to say so rather than silently doing
 * nothing.
 */
export const LIVE_PREVIEW_MESSAGE_TYPE = 'kb-pixel-editor:preview';
export const LIVE_PREVIEW_ACK_TYPE = 'kb-pixel-editor:preview-ack';

export interface LiveArtPreviewMessage {
  readonly type: typeof LIVE_PREVIEW_MESSAGE_TYPE;
  readonly name: string;
  readonly category: string;
  readonly width: number;
  readonly height: number;
  /** Base64-encoded RGBA bytes of the sprite's currently active frame. */
  readonly pixels: string;
}

export interface LiveArtPreviewAck {
  readonly type: typeof LIVE_PREVIEW_ACK_TYPE;
  readonly name: string;
  readonly applied: boolean;
}

export function isLiveArtPreviewMessage(value: unknown): value is LiveArtPreviewMessage {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    record.type === LIVE_PREVIEW_MESSAGE_TYPE &&
    typeof record.name === 'string' &&
    typeof record.category === 'string' &&
    typeof record.width === 'number' &&
    typeof record.height === 'number' &&
    typeof record.pixels === 'string'
  );
}

function base64ToBytes(base64: string): Uint8ClampedArray {
  const binary = atob(base64);
  const bytes = new Uint8ClampedArray(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

/**
 * Writes `message`'s pixels into `targets[message.name]`'s texture, if that
 * name has a live target. Returns whether it did.
 */
export function applyLiveArtPreview(
  targets: Readonly<Record<string, Texture>>,
  message: LiveArtPreviewMessage,
): boolean {
  const texture = targets[message.name];
  if (texture === undefined) {
    return false;
  }
  const canvas = document.createElement('canvas');
  canvas.width = message.width;
  canvas.height = message.height;
  const ctx = canvas.getContext('2d');
  if (ctx === null) {
    return false;
  }
  const imageData = new ImageData(
    new Uint8ClampedArray(base64ToBytes(message.pixels)),
    message.width,
    message.height,
  );
  ctx.putImageData(imageData, 0, 0);
  texture.source.resource = canvas;
  texture.source.update();
  return true;
}

/**
 * Listens for the docked pixel editor's preview messages for the lifetime of
 * the page (no teardown — same lifetime as the game itself) and applies
 * them, replying to the iframe with whether its sprite is actually live in
 * the running game right now.
 */
export function attachLiveArtPreviewListener(targets: Readonly<Record<string, Texture>>): void {
  window.addEventListener('message', (event: MessageEvent<unknown>) => {
    if (!isLiveArtPreviewMessage(event.data)) {
      return;
    }
    const applied = applyLiveArtPreview(targets, event.data);
    const ack: LiveArtPreviewAck = {
      type: LIVE_PREVIEW_ACK_TYPE,
      name: event.data.name,
      applied,
    };
    event.source?.postMessage(ack, { targetOrigin: '*' });
  });
}
