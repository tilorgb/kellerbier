import { bytesToBase64 } from './api-client.js';
import type { PixelEditorState } from './state.js';

const MESSAGE_TYPE = 'kb-pixel-editor:preview';
const ACK_TYPE = 'kb-pixel-editor:preview-ack';

export type LiveStatus = 'unknown' | 'live' | 'not-wired';

export interface LivePreviewClientHandle {
  destroy(): void;
}

/**
 * The iframe half of #108's live preview: posts the sprite currently being
 * drawn to whatever page embedded this one (`app/editor-dock.ts`'s docked
 * panel), on every paint, coalesced to one post per animation frame so a
 * fast drag doesn't flood the parent with a message per pixel.
 *
 * A no-op when this page isn't embedded (opened as its own tab) — there is
 * no parent to preview into, and posting to `window` itself would just
 * deliver the message back to this same page.
 *
 * `getName` reads the name field live rather than this module taking a
 * fixed name at construction: the preview is meant to work while drawing,
 * before the sprite has ever been saved, and the name can still change
 * right up until then.
 */
export function createLivePreviewClient(
  state: PixelEditorState,
  getName: () => string,
  onStatusChange: (status: LiveStatus) => void,
): LivePreviewClientHandle {
  if (window.parent === window) {
    return {
      destroy(): void {
        // Nothing was ever wired up — this page isn't embedded, so there is no parent to preview into.
      },
    };
  }

  let framePending = false;

  function post(): void {
    if (framePending) {
      return;
    }
    framePending = true;
    requestAnimationFrame(() => {
      framePending = false;
      const name = getName();
      if (name === '') {
        return;
      }
      window.parent.postMessage(
        {
          type: MESSAGE_TYPE,
          name,
          category: state.category,
          width: state.width,
          height: state.height,
          pixels: bytesToBase64(state.activeFrame),
        },
        '*',
      );
    });
  }

  function onMessage(event: MessageEvent<unknown>): void {
    const data = event.data;
    if (typeof data !== 'object' || data === null || !('type' in data) || data.type !== ACK_TYPE) {
      return;
    }
    const applied = 'applied' in data && data.applied === true;
    onStatusChange(applied ? 'live' : 'not-wired');
  }

  const unsubscribe = state.subscribe(post);
  window.addEventListener('message', onMessage);
  post();

  return {
    destroy(): void {
      unsubscribe();
      window.removeEventListener('message', onMessage);
    },
  };
}
