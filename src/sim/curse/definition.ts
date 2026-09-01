/**
 * Curses (#49): floor modifiers, announced on entry, mostly negative and
 * always thematic — `docs/GAME_DESIGN.md` §10's exact five.
 *
 * A curse is authored data, the same "content, not engine" shape
 * `sim/item/definition.ts` uses for items — a curse has no hooks of its own
 * (unlike an item) because there are only ever five of them and each one's
 * effect is a distinct, small piece of engine surface (a wind push, a status
 * tick, a render-side darkening) rather than a combinatorial space worth a
 * hook system. `CurseDefinition` exists so a curse's *name* and *announcement
 * text* are data next to the five ids, not string literals scattered across
 * `GameSim`/the renderer.
 */

export const CURSE_IDS = ['nebel', 'kater', 'sperrstunde', 'foehn', 'blaue-stunde'] as const;
export type CurseId = (typeof CURSE_IDS)[number];

export interface CurseDefinition {
  readonly id: CurseId;
  /** The name a player would see, on the floor-entry announcement. */
  readonly name: string;
  /** One line on what it does — shown under `name` on the announcement banner. */
  readonly description: string;
}
