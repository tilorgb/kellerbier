import type { StatId } from './definition.js';

/**
 * Where a modifier came from.
 *
 * Every modifier the pipeline applies carries one of these, which is the
 * whole of #25: the debug overlay does not show a final number, it shows the
 * chain of *named* things that produced it. `label` is what gets printed;
 * `kind` and `id` together are typically how a caller derives the source key
 * it registers and removes the source's modifiers under
 * (`StatPipeline.setSourceModifiers`/`clearSource`), though the pipeline
 * itself does not require that — the key is just a string it is handed.
 */
export interface ModifierSource {
  readonly kind: 'item' | 'promille' | 'kater' | 'curse' | 'character';
  readonly id: string;
  readonly label: string;
}

/** Flat additions resolve before multipliers — see `resolveStat`. */
export type ModifierOp = 'add' | 'multiply';

export interface StatModifier {
  readonly stat: StatId;
  readonly op: ModifierOp;
  readonly value: number;
  readonly source: ModifierSource;
}
