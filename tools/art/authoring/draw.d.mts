/** Hand-written types for a plain-JS module — see `tools/eslint/architecture.d.ts`. */

/** A grid of palette characters, `.` for transparent. */
export interface CharCanvas {
  readonly width: number;
  readonly height: number;
  readonly rows: string[][];
}

export declare function canvas(width: number, height: number, fill?: string): CharCanvas;
export declare function px(c: CharCanvas, x: number, y: number, ch: string): void;
export declare function get(c: CharCanvas, x: number, y: number): string;
export declare function fillRect(
  c: CharCanvas,
  x: number,
  y: number,
  w: number,
  h: number,
  ch: string,
): void;
export declare function ellipse(
  c: CharCanvas,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  ch: string,
): void;
export declare function roundRect(
  c: CharCanvas,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  ch: string,
): void;
export declare function line(
  c: CharCanvas,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  ch: string,
  thickness?: number,
): void;
export declare function poly(
  c: CharCanvas,
  points: readonly (readonly [number, number])[],
  ch: string,
): void;
export declare function outline(c: CharCanvas, ink?: string): void;
export declare function stamp(c: CharCanvas, art: CharCanvas, x: number, y: number): void;
export declare function flip(c: CharCanvas): CharCanvas;
export declare function toRows(c: CharCanvas): string[];
