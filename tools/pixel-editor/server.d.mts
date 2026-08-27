import type { Plugin } from 'vite';

/**
 * Hand-written types for a plain-JS module. The module itself has to stay JS
 * (see `tools/eslint/architecture.d.ts` for the same reasoning) — it runs as
 * a Vite plugin, loaded by `vite.config.ts`, which is the one TS file in this
 * repo that needs a type for it.
 */
export declare function pixelEditorServerPlugin(): Plugin;
