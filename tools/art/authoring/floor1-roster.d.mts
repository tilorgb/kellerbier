/** Hand-written types for a plain-JS module — see `tools/eslint/architecture.d.ts`. */

/** A built frame: a `height`×`width` grid of `0xrrggbb` or `null` (transparent). */
export interface RosterFrame {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly px: readonly (readonly (number | null)[])[];
}

export declare const CELLAR: Readonly<Record<string, number | null>>;
export declare const ROSTER: Readonly<Record<string, RosterFrame>>;
export declare const ROSTER_BUCKET: string;
export declare const KELLERASSEL_FRAMES: readonly RosterFrame[];

export declare function encodeSingle(frame: RosterFrame): Buffer;
export declare function encodeStrip(name: string, frames: readonly RosterFrame[]): Buffer;
export declare function assertOnPalette(bucket: string, frames: readonly RosterFrame[]): void;
