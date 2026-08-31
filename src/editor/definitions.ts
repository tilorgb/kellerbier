import type { RoomShape, RoomSpecialRole } from '../content/rooms/definition.js';

/**
 * Drives the shape picker and which editing mode a shape gets (single grid vs.
 * an N-tab multi-cell layout) — a future shape (the T/diagonal follow-up)
 * only needs a new row here, not new UI code.
 */
export interface ShapeInfo {
  readonly shape: RoomShape;
  readonly cellCount: number;
  readonly label: string;
}

export const SHAPES: readonly ShapeInfo[] = [
  { shape: '1x1', cellCount: 1, label: '1x1 — single room' },
  { shape: '1x2', cellCount: 2, label: '1x2 — two rooms glued' },
  { shape: 'L', cellCount: 3, label: 'L — three rooms, one corner missing' },
  { shape: '2x2', cellCount: 4, label: '2x2 — four rooms glued' },
  { shape: 'T', cellCount: 5, label: 'T — five rooms, a plus-shape minus one arm' },
];

export function shapeCellCount(shape: RoomShape): number {
  return SHAPES.find((info) => info.shape === shape)?.cellCount ?? 1;
}

/**
 * Every multi-cell shape's canonical layout, in the local (0-indexed)
 * `{col, row}` coordinates both `editor/playtest.ts`'s live playtest and
 * `editor/panels/thumbnail.ts`'s browse-panel preview need — there is no
 * authored adjacency to read this from (`RoomSubLayout`'s doc comment on
 * `content/rooms/definition.ts`); in a real run the floor generator picks
 * where a multi-cell room's cells actually land
 * (`sim/room/floor-plan.ts`'s `shapeFootprints`). Both editor consumers are
 * previewing this room's own content, not the floor it might end up on, so
 * any one legal layout does the job; these mirror `shapeFootprints`'s first
 * variant for each shape. `L` drops the last of `2x2`'s four corners — one of
 * `shapeFootprints('2x2')`'s corners removed, same as every `L` variant is
 * built from there.
 */
export const MULTI_CELL_LAYOUT: Readonly<
  Record<Exclude<RoomShape, '1x1'>, readonly { readonly col: number; readonly row: number }[]>
> = {
  '1x2': [
    { col: 0, row: 0 },
    { col: 1, row: 0 },
  ],
  '2x2': [
    { col: 0, row: 0 },
    { col: 1, row: 0 },
    { col: 0, row: 1 },
    { col: 1, row: 1 },
  ],
  L: [
    { col: 0, row: 0 },
    { col: 1, row: 0 },
    { col: 0, row: 1 },
  ],
  T: [
    { col: 0, row: 0 },
    { col: 1, row: 0 },
    { col: 2, row: 0 },
    { col: 1, row: 1 },
    { col: 1, row: 2 },
  ],
};

export const SPECIAL_ROLES: readonly RoomSpecialRole[] = [
  'boss',
  'treasure',
  'shop',
  'secret',
  'supersecret',
];

/**
 * Neither field has a real registry (`src/sim/room/template.ts`'s
 * `validateSubLayout` only requires a non-empty string) — these are every
 * value actually in use across `src/content/rooms/*.json` today, offered as
 * suggestions in a combo box that still accepts free text.
 */
export const DECORATIVE_PROP_TYPE_SUGGESTIONS: readonly string[] = [
  'barrel',
  'boss-plate',
  'shopkeeper-stand',
  'pedestal',
];

/** 'puddle' is the one hazard type with sim behaviour today — Floor 1's slick puddles (#35). Still free text: an author may type anything, this is only the suggestion list. */
export const HAZARD_TYPE_SUGGESTIONS: readonly string[] = ['puddle'];
