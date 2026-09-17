import type { Plugin } from 'vite';

/**
 * Types for `single-file-plugin.mjs`, which is plain ESM so that it can be
 * imported from a Vite config without a build step — the same arrangement
 * `tools/eslint/architecture.d.ts` has for the lint rules.
 */
export declare function singleFilePlugin(options?: {
  /** The published page's name. Defaults to `Kellerbier.html`. */
  readonly fileName?: string;
  /** Absolute path to a plain-text note emitted next to it as `READ-ME.txt`. */
  readonly readme?: string;
}): Plugin;
