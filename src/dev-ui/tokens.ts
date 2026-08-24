/**
 * Design tokens shared by every DOM-based dev tool: the tuning window
 * (`src/debug/tuning-window.ts`) and the room editor (`src/editor/main.ts`).
 * Adding a fourth tool means importing this and reaching for a variable, not
 * copying a `STYLE` block and re-deriving hex values by eye.
 *
 * Plain CSS custom properties, not Tailwind: these tools are a handful of
 * `<style>` blocks each, not a design surface large enough to earn a build
 * step, and the in-game renderer (Pixi/WebGL) is untouched by either choice.
 */

export const DEV_UI_TOKENS_STYLE = `
:root {
  --kb-color-surface-0: #0b0a0d;
  --kb-color-surface-1: #14101a;
  --kb-color-surface-2: #1b1622;
  --kb-color-surface-3: #241d2e;
  --kb-color-surface-3-hover: #2f2639;
  --kb-color-surface-4: #3d3348;
  --kb-color-surface-4-alt: #4a3f57;

  --kb-color-panel-tuning: rgba(18, 15, 22, 0.96);
  --kb-color-panel-editor: rgba(27, 22, 34, 0.9);

  --kb-color-text: #d8cfc4;
  --kb-color-text-dim: #8a7f74;
  --kb-color-text-subtle: #6f6559;

  --kb-color-accent: #f0c46a;
  --kb-color-accent-hover: #fff3d0;

  --kb-color-warn: #e0703a;
  --kb-color-warn-bg: rgba(224, 112, 58, 0.35);

  --kb-color-ok: #8fbf7a;

  --kb-color-marker-pickup: #6ab0c9;
  --kb-color-marker-prop: #b08056;

  --kb-font-mono: ui-monospace, monospace;
  --kb-radius-sm: 3px;
  --kb-radius-md: 4px;
}
`;

let injected = false;

/**
 * Injects the token sheet into the document once. Idempotent so a tool can
 * call it on every boot without tracking whether it already ran.
 */
export function injectDevUiTokens(): void {
  if (injected) {
    return;
  }
  const style = document.createElement('style');
  style.textContent = DEV_UI_TOKENS_STYLE;
  document.head.appendChild(style);
  injected = true;
}
