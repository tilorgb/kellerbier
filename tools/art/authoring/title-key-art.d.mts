/** Hand-written types for a plain-JS module — see `tools/eslint/architecture.d.ts`. */

export declare const PALETTE: Readonly<Record<string, number>>;
export declare const SCALE: number;
/** The finished drawing, one string per row of palette characters. */
export declare function build(): string[];
