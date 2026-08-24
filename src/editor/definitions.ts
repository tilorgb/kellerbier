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

/** No authored room has one yet — nothing to suggest, so this is free text only. */
export const HAZARD_TYPE_SUGGESTIONS: readonly string[] = [];
