import type { Linter } from 'eslint';

/**
 * The flat-config fragment that enforces the layering.
 *
 * Hand-written types for a plain-JS module. The module itself has to stay JS,
 * because `eslint.config.js` imports it at runtime and nothing compiles it —
 * and the architecture test imports the same module, so the rules it asserts on
 * are the ones that ship.
 */
export declare const architectureRules: Linter.Config[];
