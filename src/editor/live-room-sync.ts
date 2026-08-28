/**
 * The room editor's half of the docked live-room workflow (#108's PR
 * follow-up): when this page is embedded in `app/editor-dock.ts`'s split
 * view, it can ask the running game which room the player is actually
 * standing in and push an edited draft straight back into that same,
 * still-running `GameSim` — `app/main.ts`'s `kb-room-editor:*` message
 * handlers are the other half. A no-op everywhere else (opened as its own
 * tab): there is no parent page to talk to.
 */

export function isEmbedded(): boolean {
  return window.parent !== window;
}

export interface ApplyAckResult {
  readonly ok: boolean;
  readonly error?: string;
}

export interface LiveRoomSyncHandle {
  requestCurrentRoom(): void;
  applyToRunningGame(templateJson: unknown): void;
  destroy(): void;
}

export function createLiveRoomSync(
  onCurrentRoom: (templateJson: unknown) => void,
  onApplyAck: (result: ApplyAckResult) => void,
): LiveRoomSyncHandle {
  if (!isEmbedded()) {
    return {
      requestCurrentRoom(): void {
        // Not embedded — there is no parent page to ask.
      },
      applyToRunningGame(): void {
        // Not embedded — there is no running game to apply to.
      },
      destroy(): void {
        // Nothing was ever wired up.
      },
    };
  }

  function onMessage(event: MessageEvent<unknown>): void {
    const data = event.data;
    if (typeof data !== 'object' || data === null || !('type' in data)) {
      return;
    }
    if (data.type === 'kb-room-editor:current-room' && 'templateJson' in data) {
      onCurrentRoom(data.templateJson);
      return;
    }
    if (data.type === 'kb-room-editor:apply-ack') {
      if ('ok' in data && data.ok === true) {
        onApplyAck({ ok: true });
        return;
      }
      const error = 'error' in data && typeof data.error === 'string' ? data.error : undefined;
      onApplyAck(error === undefined ? { ok: false } : { ok: false, error });
    }
  }
  window.addEventListener('message', onMessage);

  return {
    requestCurrentRoom(): void {
      window.parent.postMessage({ type: 'kb-room-editor:request-current' }, '*');
    },
    applyToRunningGame(templateJson: unknown): void {
      window.parent.postMessage({ type: 'kb-room-editor:apply', templateJson }, '*');
    },
    destroy(): void {
      window.removeEventListener('message', onMessage);
    },
  };
}
