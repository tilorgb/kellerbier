/** Hand-written types for a plain-JS module — see `tools/eslint/architecture.d.ts`. */

export interface ProjectileSwatch {
  readonly name: string;
  /** The sprite's brightest opaque colour. */
  readonly rim: number;
  /** Its darkest opaque colour. Omitted scores the bright end alone. */
  readonly shade?: number;
}

export interface FloorSwatchSet {
  readonly floorTag: string;
  readonly colors: readonly number[];
}

export interface LegibilityFailure {
  readonly projectile: string;
  readonly floorTag: string;
  readonly ratio: number;
  readonly against: number;
}

export declare function relativeLuminance(color: number): number;
export declare function contrastRatio(a: number, b: number): number;
export declare const MIN_PROJECTILE_CONTRAST: number;
export declare function checkProjectileLegibility(
  projectiles: readonly ProjectileSwatch[],
  floors: readonly FloorSwatchSet[],
): LegibilityFailure[];
