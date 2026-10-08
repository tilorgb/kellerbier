/** Hand-written types for a plain-JS module — see `tools/eslint/architecture.d.ts`. */

/** A built frame: a `height`×`width` grid of `0xrrggbb` or `null` (transparent). */
export interface RosterFrame {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly px: readonly (readonly (number | null)[])[];
}

export declare const ALPEN: Readonly<Record<string, number | null>>;
export declare const ROSTER: Readonly<Record<string, RosterFrame>>;
export declare const PROJECTILES: Readonly<Record<string, RosterFrame>>;
export declare const BOSSES: Readonly<Record<string, RosterFrame>>;
export declare const ROSTER_BUCKET: string;

/** An animated body: its frames, and the `.anim.json` sidecar committed next to its strip. */
export interface RosterStrip {
  readonly frames: readonly RosterFrame[];
  readonly anim: {
    readonly frames: number;
    readonly frameDurationMs: number;
    readonly loop: boolean;
    readonly clips: Readonly<Record<string, unknown>>;
  };
}

export declare const STRIPS: Readonly<Record<string, RosterStrip>>;

export declare function encodeSingle(frame: RosterFrame): Buffer;
export declare function encodeStrip(name: string, frames: readonly RosterFrame[]): Buffer;
export declare function encodeAnim(anim: RosterStrip['anim']): string;
export declare function assertOnPalette(bucket: string, frames: readonly RosterFrame[]): void;
export declare function mirrored(frame: RosterFrame, name?: string): RosterFrame;
export declare function shifted(
  frame: RosterFrame,
  dx: number,
  dy: number,
  name?: string,
): RosterFrame;
