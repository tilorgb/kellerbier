/**
 * Authored-room "sprinkles" (#random-rooms): the route for a one-off,
 * hand-authored room design to pop up on an otherwise-procedural floor
 * instead of a generated one.
 *
 * Split out of `app/main.ts`'s `rebuildProceduralRooms` (#272) so the
 * no-repeat rule below is unit-testable without spinning up the whole app:
 * `sprinkleCandidates`/`chooseSprinkle` are pure functions over a
 * `FloorPlanRoom` and a template pool, with no dependency on the live sim.
 */

import type { FloorPlanRoom } from './floor-plan.js';
import { isMultiCellRoomTemplate, type RoomTemplate } from '../../content/rooms/definition.js';
import type { Rng } from '../rng/rng.js';

export interface SprinkleCandidate {
  readonly template: RoomTemplate;
  readonly weight: number;
}

/**
 * The hand-authored ordinary rooms that fit `room` — no special role, right
 * shape, right tag, and (`1x1` only) doors a superset of what the slot
 * needs. Every one is a sprinkle candidate; there is no opt-in flag.
 */
export function sprinkleCandidates(
  room: FloorPlanRoom,
  floorTag: string,
  templatePool: readonly RoomTemplate[],
): SprinkleCandidate[] {
  const needed = room.doors.map((door) => door.direction);
  const candidates: SprinkleCandidate[] = [];
  for (const template of templatePool) {
    if (
      template.metadata.specialRole !== undefined ||
      template.metadata.shape !== room.shape ||
      !template.metadata.floorTags.includes(floorTag)
    ) {
      continue;
    }
    if (
      !isMultiCellRoomTemplate(template) &&
      !needed.every((direction) => template.metadata.doors[direction])
    ) {
      continue;
    }
    candidates.push({ template, weight: template.metadata.weight });
  }
  return candidates;
}

/**
 * Rolls whether `room` gets a sprinkle at all, and if so picks one —
 * excluding any template id already in `alreadyPlaced` (#272: a sprinkled
 * template doesn't repeat on one floor). Returns `null` when the room isn't
 * sprinkled, or when it is but every eligible template has already been
 * placed elsewhere on this floor — both cases mean "fall back to
 * generation", the caller's job, not this function's.
 *
 * Consumes exactly the same `rng` draws whether or not a sprinkle is chosen
 * (`rng.chance` first, then `rng.weightedIndex` only if candidates remain),
 * so a floor's determinism is unaffected by the exclusion.
 */
export function chooseSprinkle(
  room: FloorPlanRoom,
  floorTag: string,
  templatePool: readonly RoomTemplate[],
  alreadyPlaced: ReadonlySet<string>,
  authoredRoomChance: number,
  rng: Rng,
): RoomTemplate | null {
  if (!rng.chance(authoredRoomChance)) {
    return null;
  }
  const candidates = sprinkleCandidates(room, floorTag, templatePool).filter(
    (candidate) => !alreadyPlaced.has(candidate.template.id),
  );
  if (candidates.length === 0) {
    return null;
  }
  const index = rng.weightedIndex(candidates.map((candidate) => candidate.weight));
  return candidates[index]?.template ?? null;
}
