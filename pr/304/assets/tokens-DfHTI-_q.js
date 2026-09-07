(function(){let e=document.createElement(`link`).relList;if(e&&e.supports&&e.supports(`modulepreload`))return;for(let e of document.querySelectorAll(`link[rel="modulepreload"]`))n(e);new MutationObserver(e=>{for(let t of e)if(t.type===`childList`)for(let e of t.addedNodes)e.tagName===`LINK`&&e.rel===`modulepreload`&&n(e)}).observe(document,{childList:!0,subtree:!0});function t(e){let t={};return e.integrity&&(t.integrity=e.integrity),e.referrerPolicy&&(t.referrerPolicy=e.referrerPolicy),t.credentials=e.crossOrigin===`use-credentials`?`include`:e.crossOrigin===`anonymous`?`omit`:`same-origin`,t}function n(e){if(e.ep)return;e.ep=!0;let n=t(e);fetch(e.href,n)}})();var e=`
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
`,t=!1;function n(){if(t)return;let n=document.createElement(`style`);n.textContent=e,document.head.appendChild(n),t=!0}export{n as t};
//# sourceMappingURL=tokens-DfHTI-_q.js.map