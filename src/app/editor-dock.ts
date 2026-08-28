import { injectDevUiTokens } from '../dev-ui/tokens.js';

export interface EditorDockHandle {
  destroy(): void;
}

export interface EditorDockCallbacks {
  /** Fires on the closed -> open transition only, never on switching editors while already open. */
  readonly onOpen?: () => void;
  readonly onClose?: () => void;
}

interface DockedEditor {
  readonly id: string;
  readonly label: string;
  readonly src: string;
}

const EDITORS: readonly DockedEditor[] = [
  { id: 'rooms', label: '🚪 Rooms', src: 'editor.html' },
  { id: 'sprites', label: '🎨 Sprites', src: 'pixel-editor.html' },
];

const DEFAULT_PANEL_WIDTH = 480;
const MIN_PANEL_WIDTH = 280;
const MIN_GAME_WIDTH = 320;
const DIVIDER_WIDTH = 6;

const STYLE = `
/* Top-left is the one corner nothing else claims: seed-control and
   projectile-tag-chooser sit top-right, tuning-window sits bottom-right, and
   the accessibility panel sits bottom-left — this button ships in every
   build, dev tools present or not, so it can't share a spot with a
   dev-only one without the two overlapping. */
#dock-toggle {
  position: fixed; top: 10px; left: 10px; z-index: 20;
  display: flex; gap: 6px; font: 12px var(--kb-font-mono, monospace);
}
#dock-toggle button {
  font: inherit; color: var(--kb-color-text, #cfc6bb);
  background: var(--kb-color-surface-3, rgba(20, 16, 26, 0.85));
  border: 1px solid var(--kb-color-surface-4, #54445f);
  border-radius: var(--kb-radius-sm, 3px);
  padding: 5px 9px; cursor: pointer;
}
#dock-toggle button:hover { background: var(--kb-color-surface-3-hover, #2f2636); }
#dock-toggle button.kb-dock-active {
  background: var(--kb-color-accent, #f0c46a); color: var(--kb-color-surface-1, #14101a);
  border-color: var(--kb-color-accent, #f0c46a);
}
/*
 * The debug overlay's dev-only DOM tools (tuning-window, accessibility-panel,
 * projectile-tag-chooser) are all fixed-position at z-index 30, unaware that
 * a docked panel now shares the viewport with them — without their own
 * stacking context, a plain flex sibling would fall behind them regardless
 * of DOM order once any of those tools happens to render at the same screen
 * position. Both the divider and the panel get their own stacking context at
 * a higher z-index so the docked editor is never partly hidden behind one.
 */
#dock-divider {
  position: relative; z-index: 40;
  flex: 0 0 ${String(DIVIDER_WIDTH)}px; cursor: col-resize;
  background: var(--kb-color-surface-4, #3d3348);
}
#dock-divider:hover, #dock-divider.kb-dock-dragging { background: var(--kb-color-accent, #f0c46a); }
#dock-panel {
  position: relative; z-index: 40;
  flex: 0 0 auto; height: 100%; overflow: hidden; background: #14101a;
}
#dock-panel iframe { width: 100%; height: 100%; border: 0; display: block; }
`;

/**
 * The split-view toggle for the room editor (#24) and pixel editor (#108):
 * two always-visible buttons — not gated behind `import.meta.env.DEV` the
 * way the debug overlay is, since that overlay's whole module is compiled
 * out of a production build (`app/main.ts`'s `mountDebugOverlay`), and this
 * is exactly the chrome the user asked to reach "from the normal dev app"
 * and from the CI-published preview build alike (`docs/DECISIONS.md`, the
 * pixel-editor entry's follow-up).
 *
 * Opens a docked `<iframe>` panel as a flex sibling of `#game-pane` inside
 * `#game-pane`'s parent, `#dock-root` (`index.html`) — never inside `#game`
 * itself, which stays exactly what `render/app.ts` mounts the Pixi canvas
 * into. Shrinking `#game-pane` is the only side effect on the game: its
 * `ResizeObserver` (`render/app.ts`'s `trackWindowSize`) picks up the new box
 * on its own, no coordination needed here.
 *
 * `src` is a plain relative path (`editor.html`, not `/editor.html`) so the
 * iframe still resolves correctly when the whole app is served out of a
 * subdirectory — the CI preview publishes pull requests to
 * `pr/<number>/` under the repo's Pages site, not the site root.
 */
export function createEditorDock(
  dockRoot: HTMLElement,
  callbacks: EditorDockCallbacks = {},
): EditorDockHandle {
  injectDevUiTokens();

  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.appendChild(style);

  const toggleBar = document.createElement('div');
  toggleBar.id = 'dock-toggle';
  document.body.appendChild(toggleBar);

  const buttons = new Map<string, HTMLButtonElement>();
  for (const editor of EDITORS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = editor.label;
    button.addEventListener('click', () => {
      toggle(editor);
    });
    buttons.set(editor.id, button);
    toggleBar.appendChild(button);
  }

  let divider: HTMLDivElement | null = null;
  let panel: HTMLDivElement | null = null;
  let iframe: HTMLIFrameElement | null = null;
  let openEditorId: string | null = null;
  let panelWidth = DEFAULT_PANEL_WIDTH;

  function renderActiveButton(): void {
    for (const [id, button] of buttons) {
      button.classList.toggle('kb-dock-active', id === openEditorId);
    }
  }

  function open(editor: DockedEditor): void {
    const wasClosed = panel === null;
    if (panel === null) {
      divider = document.createElement('div');
      divider.id = 'dock-divider';
      divider.addEventListener('pointerdown', onDividerPointerDown);

      panel = document.createElement('div');
      panel.id = 'dock-panel';
      iframe = document.createElement('iframe');
      panel.appendChild(iframe);

      dockRoot.append(divider, panel);
    }
    panel.style.width = `${String(panelWidth)}px`;
    // Compared against `openEditorId`, not the iframe's resolved `src` URL:
    // `pixel-editor.html`.endsWith(`editor.html`) is true, so a string
    // comparison against `editor.src` would never detect the "sprites" ->
    // "rooms" switch.
    if (iframe !== null && openEditorId !== editor.id) {
      iframe.src = editor.src;
    }
    openEditorId = editor.id;
    renderActiveButton();
    if (wasClosed) {
      callbacks.onOpen?.();
    }
  }

  function close(): void {
    divider?.remove();
    panel?.remove();
    divider = null;
    panel = null;
    iframe = null;
    openEditorId = null;
    renderActiveButton();
    callbacks.onClose?.();
  }

  function toggle(editor: DockedEditor): void {
    if (openEditorId === editor.id) {
      close();
      return;
    }
    open(editor);
  }

  function onDividerPointerDown(event: PointerEvent): void {
    if (divider === null || panel === null) {
      return;
    }
    divider.setPointerCapture(event.pointerId);
    divider.classList.add('kb-dock-dragging');

    const onPointerMove = (moveEvent: PointerEvent): void => {
      const rootWidth = dockRoot.getBoundingClientRect().width;
      const fromRight = rootWidth - moveEvent.clientX;
      const maxPanelWidth = Math.max(MIN_PANEL_WIDTH, rootWidth - MIN_GAME_WIDTH - DIVIDER_WIDTH);
      panelWidth = Math.min(maxPanelWidth, Math.max(MIN_PANEL_WIDTH, fromRight));
      if (panel !== null) {
        panel.style.width = `${String(panelWidth)}px`;
      }
    };
    const onPointerUp = (): void => {
      divider?.classList.remove('kb-dock-dragging');
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  }

  return {
    destroy(): void {
      close();
      toggleBar.remove();
      style.remove();
    },
  };
}
