/** Hand-written types for a plain-JS module — see `tools/eslint/architecture.d.ts`. */

export type HatAnchors = Record<string, [number, number][]>;

export function computeHatAnchors(): HatAnchors;
export function renderHatAnchors(anchors: HatAnchors): string;
export function renderHatAnchorsFile(anchors: HatAnchors): Promise<string>;
