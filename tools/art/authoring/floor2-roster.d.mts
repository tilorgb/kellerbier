/** Hand-written types for a plain-JS module — see `tools/eslint/architecture.d.ts`. */

/** A built frame: a `height`×`width` grid of `0xrrggbb` or `null` (transparent). */
export interface RosterFrame {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly px: readonly (readonly (number | null)[])[];
}

export declare const RURAL: Readonly<Record<string, number | null>>;
export declare const HUMAN_FACE: readonly string[];
export declare const ROSTER: Readonly<Record<string, RosterFrame>>;
export declare const ROSTER_BUCKET: string;

export declare function encodeSingle(frame: RosterFrame): Buffer;
export declare function assertOnPalette(bucket: string, frames: readonly RosterFrame[]): void;
