import { ENEMY_DEFINITIONS } from '../../../src/content/enemies/index.js';
import { FLOOR_CONFIGS, type FloorConfig } from '../../../src/content/floors/definition.js';
import { DIRECTION_OFFSET } from '../../../src/content/rooms/definition.js';
import {
  ROOM_TEMPLATES,
  STAIRCASE_TEMPLATES,
  type DoorDirection,
} from '../../../src/content/rooms/index.js';
import type { GameSim, RoomDirection } from '../../../src/sim/game/sim.js';
import {
  type FloorPlan,
  type FloorPlanRoom,
  type RoomDoor,
  generateFloor,
} from '../../../src/sim/room/floor-plan.js';
import type { Rng } from '../../../src/sim/rng/rng.js';
import {
  type CompiledDoor,
  type RoomPlacement,
  validateRoomTemplate,
} from '../../../src/sim/room/template.js';
import { validateStaircaseTemplate } from '../../../src/sim/room/staircase.js';

/**
 * The floor/room-navigation glue `app/main.ts`'s `crossDoor`/`enterNeighbor`/
 * `advanceFloor`/`startRun` own for a real, UI-driven run — reimplemented
 * here, pure and headless, for `tests/playtest/`'s scripted bot.
 *
 * `main.ts` can't be imported from a Vitest run: it pulls in `pixi.js` and a
 * DOM renderer the moment it's evaluated. So rather than extract that logic
 * into a shared module (a much larger refactor of a live, UI-coupled file
 * this change has no way to browser-verify), this module re-derives the same
 * *pure* subset directly from `sim/`/`content/` — the same "a couple of pure
 * helpers exist in two places on purpose" tradeoff `content/rooms/
 * definition.ts`'s own `DIRECTION_OFFSET` doc comment already accepts for
 * exactly this reason (it lists three independent copies of that one table).
 *
 * One deliberate simplification against the real game: this never asks for
 * `main.ts`'s procedurally-generated room content
 * (`rebuildProceduralRooms`/`generateRoom`/`generateMultiCellRoom`) — every
 * room's `FloorPlanRoom.templateId` already resolves to a real authored
 * template regardless (procedural generation only ever *substitutes* a
 * fraction of ordinary rooms with a synthesised layout of the same shape),
 * so the bot always plays the authored fallback. That's real, played
 * content — just less visual variety than a human's run sees.
 */

export const ROOM_TEMPLATE_POOL = ROOM_TEMPLATES.map((room, index) =>
  validateRoomTemplate(room, `room[${String(index)}]`, ENEMY_DEFINITIONS),
);
const TEMPLATES_BY_ID = new Map(ROOM_TEMPLATE_POOL.map((template) => [template.id, template]));

export const STAIRCASE_TEMPLATE_POOL = STAIRCASE_TEMPLATES.map((room, index) =>
  validateStaircaseTemplate(room, `staircase[${String(index)}]`),
);
const STAIRCASE_TEMPLATES_BY_ID = new Map(
  STAIRCASE_TEMPLATE_POOL.map((template) => [template.id, template]),
);

export function floorConfig(floorNumber: number): FloorConfig {
  const config = FLOOR_CONFIGS.find((candidate) => candidate.floor === floorNumber);
  if (config === undefined) {
    throw new Error(`no floor config for floor ${String(floorNumber)}`);
  }
  return config;
}

export function planRoom(plan: FloorPlan, id: string): FloorPlanRoom {
  const room = plan.rooms.find((candidate) => candidate.id === id);
  if (room === undefined) {
    throw new Error(`floor plan has no room "${id}"`);
  }
  return room;
}

/** The authored template for a room — see this module's doc comment for why there is never a procedural one here. */
export function roomTemplateFor(room: FloorPlanRoom): unknown {
  const template = TEMPLATES_BY_ID.get(room.templateId);
  if (template === undefined) {
    throw new Error(
      `floor plan room "${room.id}" references unknown template "${room.templateId}"`,
    );
  }
  return template;
}

export function planStaircaseTemplate(room: FloorPlanRoom): unknown {
  const id = room.staircaseTemplateId;
  const template = id === undefined ? undefined : STAIRCASE_TEMPLATES_BY_ID.get(id);
  if (template === undefined) {
    throw new Error(
      `floor plan room "${room.id}" references unknown staircase template "${String(id)}"`,
    );
  }
  return template;
}

/** `room`'s real floor-grid layout, translated into `compileRoomTemplate`'s local (0-indexed) coordinates — see `app/main.ts`'s `buildPlacement`. */
export function buildPlacement(room: FloorPlanRoom): RoomPlacement {
  const minX = Math.min(...room.cells.map((cell) => cell.x));
  const minY = Math.min(...room.cells.map((cell) => cell.y));
  return {
    cells: room.cells.map((cell) => ({ col: cell.x - minX, row: cell.y - minY })),
    doors: room.doors.map((door) => ({ cellIndex: door.cellIndex, direction: door.direction })),
  };
}

function staircaseDoorCentres(
  room: FloorPlanRoom,
): ReadonlyMap<DoorDirection, { x: number; y: number }> {
  return new Map((room.doorCentres ?? []).map((door) => [door.direction, door]));
}

/**
 * Which of `roomId`'s doors should load hidden — every door leading to a
 * secret/supersecret neighbour, unconditionally.
 *
 * `app/main.ts`'s `hiddenDoorsFor` only hides an edge the player hasn't
 * already bombed open (`revealedEdges`); the bot never bombs a wall open
 * (it never routes through a secret room at all — see `pathToBoss`), so
 * every secret edge it ever sees stays hidden for the length of the run.
 */
export function hiddenDoorsFor(plan: FloorPlan, roomId: string): CompiledDoor[] {
  const room = planRoom(plan, roomId);
  if (room.role === 'secret' || room.role === 'supersecret') {
    return [];
  }
  const placement = room.staircaseTemplateId === undefined ? buildPlacement(room) : null;
  const staircaseCentres =
    room.staircaseTemplateId === undefined ? null : staircaseDoorCentres(room);
  const hidden: CompiledDoor[] = [];
  for (const door of room.doors) {
    const neighbor = planRoom(plan, door.neighborRoomId);
    const isSecretEdge = neighbor.role === 'secret' || neighbor.role === 'supersecret';
    if (!isSecretEdge) {
      continue;
    }
    if (staircaseCentres !== null) {
      const centre = staircaseCentres.get(door.direction);
      hidden.push({
        direction: door.direction,
        cellCol: 0,
        cellRow: 0,
        ...(centre === undefined ? {} : { centre }),
      });
      continue;
    }
    const cell = placement?.cells[door.cellIndex];
    if (cell === undefined) {
      continue;
    }
    hidden.push({ direction: door.direction, cellCol: cell.col, cellRow: cell.row });
  }
  return hidden;
}

/** The room-load options for `roomId`'s start room — floor 1's via the constructor, or a later floor's via `sim.loadRoom` (`advanceFloor`'s shape). */
export function startRoomLoadOptions(plan: FloorPlan): {
  readonly roomTemplate: unknown;
  readonly roomPlacement: RoomPlacement;
  readonly floor: number;
  readonly hiddenDoors: readonly CompiledDoor[];
  readonly suppressRoomContent: true;
} {
  const room = planRoom(plan, plan.startRoomId);
  return {
    roomTemplate: roomTemplateFor(room),
    roomPlacement: buildPlacement(room),
    floor: plan.floor,
    hiddenDoors: hiddenDoorsFor(plan, plan.startRoomId),
    suppressRoomContent: true,
  };
}

/**
 * Whether `room` can ever appear on `pathToBoss`'s route: `start`/`normal`/
 * `boss` always can, a `shop` always can too (walking through costs
 * nothing — only *buying* costs Biermarken, which the bot never does), a
 * `treasure` can unless its own template is key-locked (`metadata.
 * keyLocked`, #196 — `sim.transitionTo` would just keep refusing the
 * crossing for a key the bot never picks up on purpose), and a
 * secret/supersecret never can — its door into `roomId` is never even
 * loaded un-hidden (see `hiddenDoorsFor`), so a route through one would
 * have the bot walking at a wall forever.
 *
 * A boss room bordering nothing but a shop or an unlocked treasure — not
 * another ordinary room — turned out to be a real, generated layout (not a
 * hypothetical): `docs/GAME_DESIGN.md` §4 promises a path to the boss room
 * exists, not that it never passes through one of the floor's other special
 * rooms.
 */
function passableForPathToBoss(plan: FloorPlan, id: string): boolean {
  const room = planRoom(plan, id);
  switch (room.role) {
    case 'start':
    case 'normal':
    case 'boss':
    case 'shop':
      return true;
    case 'treasure': {
      if (room.staircaseTemplateId !== undefined) {
        return true;
      }
      const metadata = (roomTemplateFor(room) as { metadata?: { keyLocked?: unknown } }).metadata;
      return metadata?.keyLocked !== true;
    }
    case 'secret':
    case 'supersecret':
      return false;
  }
}

/**
 * The shortest room-graph path from `fromRoomId` to `plan.bossRoomId` —
 * see `passableForPathToBoss` for which room roles it will ever route
 * through.
 *
 * Returns the room ids in walking order, `fromRoomId` first, `bossRoomId`
 * last — or `null` if no such path exists (never expected for a
 * `validateFloorPlan`-passing plan, but the bot treats it as "stuck" rather
 * than throwing).
 */
export function pathToBoss(plan: FloorPlan, fromRoomId: string): readonly string[] | null {
  if (fromRoomId === plan.bossRoomId) {
    return [fromRoomId];
  }
  const passable = (id: string): boolean => passableForPathToBoss(plan, id);
  const queue: string[] = [fromRoomId];
  const cameFrom = new Map<string, string>();
  const visited = new Set<string>([fromRoomId]);
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) {
      break;
    }
    for (const door of planRoom(plan, current).doors) {
      const next = door.neighborRoomId;
      if (visited.has(next) || !passable(next)) {
        continue;
      }
      visited.add(next);
      cameFrom.set(next, current);
      if (next === plan.bossRoomId) {
        const path = [next];
        let step = next;
        while (step !== fromRoomId) {
          const prev = cameFrom.get(step);
          if (prev === undefined) {
            return null;
          }
          path.push(prev);
          step = prev;
        }
        return path.reverse();
      }
      queue.push(next);
    }
  }
  return null;
}

/** The door in `fromRoomId` that leads toward `toRoomId` — `pathToBoss`'s next hop, resolved to a real `RoomDoor`. */
export function doorToward(
  plan: FloorPlan,
  fromRoomId: string,
  toRoomId: string,
): RoomDoor | undefined {
  return planRoom(plan, fromRoomId).doors.find((door) => door.neighborRoomId === toRoomId);
}

/** `sim.transitionTo`'s exact input shape for crossing `door` out of `fromRoomId` into `door.neighborRoomId` — mirrors `app/main.ts`'s `crossDoor`. */
export interface DoorCrossing {
  readonly staircase: boolean;
  readonly template: unknown;
  readonly floor: number;
  readonly direction: RoomDirection;
  readonly hiddenDoors: readonly CompiledDoor[];
  readonly placement?: RoomPlacement;
  readonly entryCell?: { readonly col: number; readonly row: number };
  readonly neighborRoomId: string;
  /** The *exiting* room's own door — `cellCol`/`cellRow`/`direction` — to match against `sim.doorContact`/`sim.doors`. */
  readonly exitDoor: {
    readonly cellCol: number;
    readonly cellRow: number;
    readonly direction: RoomDirection;
  };
}

export function planDoorCrossing(
  plan: FloorPlan,
  fromRoomId: string,
  door: RoomDoor,
): DoorCrossing {
  const room = planRoom(plan, fromRoomId);
  const exitCell = room.cells[door.cellIndex];
  if (exitCell === undefined) {
    throw new Error(`room "${fromRoomId}" door references unknown cell ${String(door.cellIndex)}`);
  }
  const placement = buildPlacement(room);
  const exitPlacementCell = placement.cells[door.cellIndex] ?? { col: 0, row: 0 };
  const neighborRoom = planRoom(plan, door.neighborRoomId);
  const hiddenDoors = hiddenDoorsFor(plan, door.neighborRoomId);
  if (neighborRoom.staircaseTemplateId !== undefined) {
    return {
      staircase: true,
      template: planStaircaseTemplate(neighborRoom),
      floor: plan.floor,
      direction: door.direction,
      hiddenDoors,
      neighborRoomId: door.neighborRoomId,
      exitDoor: {
        cellCol: exitPlacementCell.col,
        cellRow: exitPlacementCell.row,
        direction: door.direction,
      },
    };
  }
  const neighborPlacement = buildPlacement(neighborRoom);
  const offset = DIRECTION_OFFSET[door.direction];
  const targetX = exitCell.x + offset.x;
  const targetY = exitCell.y + offset.y;
  const entryCellIndex = neighborRoom.cells.findIndex(
    (cell) => cell.x === targetX && cell.y === targetY,
  );
  const entryCell = neighborPlacement.cells[entryCellIndex] ?? { col: 0, row: 0 };
  return {
    staircase: false,
    template: roomTemplateFor(neighborRoom),
    floor: plan.floor,
    direction: door.direction,
    hiddenDoors,
    placement: neighborPlacement,
    entryCell,
    neighborRoomId: door.neighborRoomId,
    exitDoor: {
      cellCol: exitPlacementCell.col,
      cellRow: exitPlacementCell.row,
      direction: door.direction,
    },
  };
}

/** `exitDoor`, resolved against the currently-loaded room's real compiled doors (`sim.doors`) — a staircase room matches by direction alone (see `app/main.ts`'s `enterNeighbor`), an ordinary room by direction and cell. */
export function findSimDoor(
  sim: GameSim,
  currentRoom: FloorPlanRoom,
  exitDoor: DoorCrossing['exitDoor'],
): CompiledDoor | undefined {
  if (currentRoom.staircaseTemplateId !== undefined) {
    return sim.doors.find((door) => door.direction === exitDoor.direction);
  }
  return sim.doors.find(
    (door) =>
      door.direction === exitDoor.direction &&
      door.cellCol === exitDoor.cellCol &&
      door.cellRow === exitDoor.cellRow,
  );
}

/** Whether `sim.doorContact` is the same door `exitDoor` describes. */
export function doorContactMatches(
  contact: CompiledDoor | null,
  exitDoor: DoorCrossing['exitDoor'],
): boolean {
  return (
    contact !== null &&
    contact.direction === exitDoor.direction &&
    contact.cellCol === exitDoor.cellCol &&
    contact.cellRow === exitDoor.cellRow
  );
}

/** `generateFloor`'s own seeded-stream contract — see `sim/room/floor-plan.ts`'s doc comment on `generateFloor`. */
export function buildFloorPlan(rng: Rng, floorNumber: number): FloorPlan {
  return generateFloor(rng, floorConfig(floorNumber), ROOM_TEMPLATE_POOL, STAIRCASE_TEMPLATE_POOL);
}
