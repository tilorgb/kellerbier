import type { Rng } from '../rng/rng.js';
import type { FloorConfig } from '../../content/floors/definition.js';
import type {
  DoorDirection,
  RoomDoorConfiguration,
  RoomShape,
  RoomTemplate,
} from '../../content/rooms/definition.js';

/**
 * Procedural floor layout: a grid of room slots grown outward from a start
 * room, with roles (boss, treasure, shop, secret) assigned by the rules in
 * `docs/GAME_DESIGN.md` §4, and a concrete room template resolved for each
 * slot from whatever pool the caller hands in.
 *
 * The generator works at two granularities on purpose. `buildSkeleton` grows a
 * *cell* grid — this is where "boss at maximum distance" and "treasure prefers
 * a dead end" have to be computed, and cells are the only granularity fine
 * enough to carve 1×2/2×2/L footprints out of. Everything downstream of it
 * (doors, neighbours, roles, template choice) operates on *rooms* — a multi-
 * cell room is one slot with one template, matching how `compileRoomTemplate`
 * loads it: one `tileGrid`, one `RoomDoorConfiguration`, regardless of how
 * much space it claims on the floor's grid.
 */

interface Cell {
  readonly x: number;
  readonly y: number;
}

export type RoomRole = 'start' | 'boss' | 'treasure' | 'shop' | 'secret' | 'supersecret' | 'normal';

export interface FloorPlanRoom {
  readonly id: string;
  readonly cells: readonly Cell[];
  readonly shape: RoomShape;
  readonly role: RoomRole;
  readonly doors: RoomDoorConfiguration;
  /** The room reached by walking through each door this room has. */
  readonly neighbors: Readonly<Partial<Record<DoorDirection, string>>>;
  /** Room-graph distance from the start room, in doors walked through. */
  readonly distanceFromStart: number;
  readonly templateId: string;
}

export interface FloorPlan {
  readonly floor: number;
  readonly floorName: string;
  readonly startRoomId: string;
  readonly bossRoomId: string;
  readonly treasureRoomId: string;
  readonly shopRoomId: string;
  readonly secretRoomId: string;
  readonly supersecretRoomId: string;
  readonly rooms: readonly FloorPlanRoom[];
}

const DIRECTIONS: readonly DoorDirection[] = ['north', 'east', 'south', 'west'];

const OFFSET: Readonly<Record<DoorDirection, Cell>> = {
  north: { x: 0, y: -1 },
  south: { x: 0, y: 1 },
  east: { x: 1, y: 0 },
  west: { x: -1, y: 0 },
};

/**
 * Generation attempts before giving up. `docs/GAME_DESIGN.md` §4: "Generation
 * failures retry, then hard-fail." Each attempt is cheap (a few hundred RNG
 * draws) and a fresh roll of the dice, so this is generous on purpose — the
 * 10,000-floor test in `tests/unit/floor-plan.test.ts` is what proves the
 * ceiling is never actually hit.
 */
const MAX_GENERATION_ATTEMPTS = 200;

/** Guards the frontier walk against spinning forever on a starved grid. */
const MAX_GROWTH_ITERATIONS = 5000;

/**
 * start + boss + treasure + shop + at least one plain room, before the secret
 * and supersecret rooms are added by `placeSecretRoom`/`placeSupersecretRoom`.
 */
const MIN_ROOMS_FOR_ROLES = 5;

function cellKey(cell: Cell): string {
  return `${String(cell.x)},${String(cell.y)}`;
}

function inBounds(cell: Cell, radius: number): boolean {
  return Math.abs(cell.x) <= radius && Math.abs(cell.y) <= radius;
}

function neighborCount(occupied: ReadonlyMap<string, number>, cell: Cell): number {
  let count = 0;
  for (const direction of DIRECTIONS) {
    const offset = OFFSET[direction];
    if (occupied.has(cellKey({ x: cell.x + offset.x, y: cell.y + offset.y }))) {
      count += 1;
    }
  }
  return count;
}

/**
 * Footprints a shape may claim, each relative to an anchor at `{0, 0}` — the
 * cell the generator is placing the room against. `L` is generated from `2x2`
 * by dropping one of its three non-anchor corners, rather than hand-listed,
 * so there is exactly one shape to keep symmetric if the grid ever stops
 * being square.
 */
function shapeFootprints(shape: RoomShape): readonly (readonly Cell[])[] {
  switch (shape) {
    case '1x1':
      return [[{ x: 0, y: 0 }]];
    case '1x2':
      return [
        [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
        ],
        [
          { x: 0, y: 0 },
          { x: -1, y: 0 },
        ],
        [
          { x: 0, y: 0 },
          { x: 0, y: 1 },
        ],
        [
          { x: 0, y: 0 },
          { x: 0, y: -1 },
        ],
      ];
    case '2x2':
      return [
        [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 0, y: 1 },
          { x: 1, y: 1 },
        ],
        [
          { x: 0, y: 0 },
          { x: -1, y: 0 },
          { x: 0, y: 1 },
          { x: -1, y: 1 },
        ],
        [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 0, y: -1 },
          { x: 1, y: -1 },
        ],
        [
          { x: 0, y: 0 },
          { x: -1, y: 0 },
          { x: 0, y: -1 },
          { x: -1, y: -1 },
        ],
      ];
    case 'L': {
      const variants: Cell[][] = [];
      for (const square of shapeFootprints('2x2')) {
        for (let drop = 1; drop < square.length; drop++) {
          variants.push(square.filter((_cell, index) => index !== drop));
        }
      }
      return variants;
    }
  }
}

/** `1x1` always wins by weight — most of a floor is plain rooms, not landmarks. */
function chooseShape(rng: Rng): RoomShape {
  return rng.weightedPick<RoomShape>([
    { value: '1x1', weight: 0.6 },
    { value: '1x2', weight: 0.2 },
    { value: 'L', weight: 0.1 },
    { value: '2x2', weight: 0.1 },
  ]);
}

/**
 * Tries to claim a footprint for `shape` anchored at `anchor`.
 *
 * Only the anchor is allowed to touch an already-placed room — that is what
 * `buildSkeleton`'s frontier walk already checked for a `1x1`, and a bigger
 * shape has to hold to the same rule or it would fuse two branches of the
 * floor together and quietly turn a tree into a knot. `null` means "try a
 * smaller shape here instead", not "generation failed".
 */
function placeShape(
  rng: Rng,
  occupied: ReadonlyMap<string, number>,
  anchor: Cell,
  shape: RoomShape,
  radius: number,
): readonly Cell[] | null {
  if (shape === '1x1') {
    return [anchor];
  }
  const variants = rng.shuffle(shapeFootprints(shape).slice());
  for (const variant of variants) {
    const cells = variant.map((offset) => ({ x: anchor.x + offset.x, y: anchor.y + offset.y }));
    if (!cells.every((cell) => inBounds(cell, radius))) {
      continue;
    }
    if (cells.some((cell) => occupied.has(cellKey(cell)))) {
      continue;
    }
    const extraCellsAreClean = cells
      .filter((cell) => cell.x !== anchor.x || cell.y !== anchor.y)
      .every((cell) => neighborCount(occupied, cell) === 0);
    if (extraCellsAreClean) {
      return cells;
    }
  }
  return null;
}

interface PlacedRoom {
  readonly id: string;
  readonly cells: readonly Cell[];
  readonly shape: RoomShape;
}

interface Skeleton {
  readonly rooms: PlacedRoom[];
  readonly occupied: Map<string, number>;
}

/**
 * Grows the floor outward from `{0, 0}` one room at a time.
 *
 * A frontier of open cells (adjacent to something already placed) is drawn
 * from at random; a cell already occupied, out of bounds, or bordering more
 * than one existing room is dropped rather than retried, which is what keeps
 * a floor a branching shape instead of a blob — see the acceptance criterion
 * on #20 that a floor has "a recognisable shape rather than always sprawling
 * into a blob".
 */
function buildSkeleton(rng: Rng, config: FloorConfig, targetCount: number): Skeleton | null {
  const occupied = new Map<string, number>();
  const rooms: PlacedRoom[] = [];
  const frontier: Cell[] = [];

  const place = (cells: readonly Cell[], shape: RoomShape): void => {
    const index = rooms.length;
    rooms.push({ id: `r${String(index)}`, cells, shape });
    for (const cell of cells) {
      occupied.set(cellKey(cell), index);
    }
    for (const cell of cells) {
      for (const direction of DIRECTIONS) {
        const offset = OFFSET[direction];
        const neighbor = { x: cell.x + offset.x, y: cell.y + offset.y };
        if (!occupied.has(cellKey(neighbor))) {
          frontier.push(neighbor);
        }
      }
    }
  };

  place([{ x: 0, y: 0 }], '1x1');

  let iterations = 0;
  while (rooms.length < targetCount && frontier.length > 0 && iterations < MAX_GROWTH_ITERATIONS) {
    iterations += 1;
    const drawIndex = rng.nextInt(0, frontier.length);
    const anchor = frontier[drawIndex];
    const last = frontier.pop();
    if (anchor === undefined) {
      continue;
    }
    if (last !== undefined && drawIndex < frontier.length) {
      frontier[drawIndex] = last;
    }

    if (occupied.has(cellKey(anchor)) || !inBounds(anchor, config.gridRadius)) {
      continue;
    }
    if (neighborCount(occupied, anchor) > 1) {
      continue;
    }

    const shape = chooseShape(rng);
    const footprint = placeShape(rng, occupied, anchor, shape, config.gridRadius);
    if (footprint !== null) {
      place(footprint, shape);
    } else {
      place([anchor], '1x1');
    }
  }

  return rooms.length >= MIN_ROOMS_FOR_ROLES ? { rooms, occupied } : null;
}

/** Every open cell adjacent to something placed, and how many distinct rooms it touches. */
function openCellTouchCounts(
  rooms: readonly PlacedRoom[],
  occupied: ReadonlyMap<string, number>,
  radius: number,
): { cell: Cell; touching: number }[] {
  const results: { cell: Cell; touching: number }[] = [];
  const seen = new Set<string>();

  for (const room of rooms) {
    for (const cell of room.cells) {
      for (const direction of DIRECTIONS) {
        const offset = OFFSET[direction];
        const candidate = { x: cell.x + offset.x, y: cell.y + offset.y };
        const key = cellKey(candidate);
        if (occupied.has(key) || seen.has(key) || !inBounds(candidate, radius)) {
          continue;
        }
        seen.add(key);

        const touchingRooms = new Set<number>();
        for (const scanDirection of DIRECTIONS) {
          const scanOffset = OFFSET[scanDirection];
          const owner = occupied.get(
            cellKey({ x: candidate.x + scanOffset.x, y: candidate.y + scanOffset.y }),
          );
          if (owner !== undefined) {
            touchingRooms.add(owner);
          }
        }
        results.push({ cell: candidate, touching: touchingRooms.size });
      }
    }
  }

  return results;
}

/**
 * Minimum distinct rooms a secret room's cell must touch. `docs/GAME_DESIGN.md`
 * §4 wants secret rooms "adjacent to as many rooms as possible"; the floor's
 * acceptance criteria on #23 sharpen that to a hard floor of two, so a secret
 * room is never a simple dead-end off a single corridor.
 */
const MIN_SECRET_ROOM_TOUCHING = 2;

/**
 * Finds the free cell touching the most distinct rooms — at least
 * `MIN_SECRET_ROOM_TOUCHING`, or generation retries — and claims it as the
 * secret room. Connected via a bombable wall rather than a normal door; see
 * `GameSim`'s `bombableWalls` (`sim/game/sim.ts`) for the reveal mechanic
 * this placement feeds.
 */
function placeSecretRoom(
  rooms: PlacedRoom[],
  occupied: Map<string, number>,
  radius: number,
): string | null {
  let best: { cell: Cell; touching: number } | null = null;
  for (const candidate of openCellTouchCounts(rooms, occupied, radius)) {
    if (best === null || candidate.touching > best.touching) {
      best = candidate;
    }
  }

  if (best === null || best.touching < MIN_SECRET_ROOM_TOUCHING) {
    return null;
  }
  const index = rooms.length;
  const id = `r${String(index)}`;
  rooms.push({ id, cells: [best.cell], shape: '1x1' });
  occupied.set(cellKey(best.cell), index);
  return id;
}

/**
 * Finds the free cell touching the *fewest* distinct rooms — a plain dead
 * end, ideally touching only one — and claims it as the supersecret room.
 * "Deliberately obnoxious to find" (#23) is exactly the mirror of
 * `placeSecretRoom`'s "as many rooms as possible": the least-connected spot
 * on the floor, so it never sits somewhere a player stumbles into it while
 * exploring normally. Excludes cells adjacent to the already-placed secret
 * room's own cell, so the two special rooms don't stack next to each other.
 */
function placeSupersecretRoom(
  rooms: PlacedRoom[],
  occupied: Map<string, number>,
  radius: number,
  secretCell: Cell | null,
): string | null {
  const excluded = new Set<string>();
  if (secretCell !== null) {
    excluded.add(cellKey(secretCell));
    for (const direction of DIRECTIONS) {
      const offset = OFFSET[direction];
      excluded.add(cellKey({ x: secretCell.x + offset.x, y: secretCell.y + offset.y }));
    }
  }

  let best: { cell: Cell; touching: number } | null = null;
  for (const candidate of openCellTouchCounts(rooms, occupied, radius)) {
    if (excluded.has(cellKey(candidate.cell))) {
      continue;
    }
    if (best === null || candidate.touching < best.touching) {
      best = candidate;
    }
  }

  if (best === null) {
    return null;
  }
  const index = rooms.length;
  const id = `r${String(index)}`;
  rooms.push({ id, cells: [best.cell], shape: '1x1' });
  occupied.set(cellKey(best.cell), index);
  return id;
}

interface RoomGraphInfo {
  readonly neighbors: Partial<Record<DoorDirection, string>>;
  readonly doors: RoomDoorConfiguration;
}

/**
 * Doors and neighbours, derived from cell adjacency rather than tracked
 * during growth — a room's connections can grow after it is placed (the
 * secret room attaches to whatever it lands next to, and a later branch can
 * end up beside an earlier one), so this is computed once, after the grid is
 * final, rather than kept incrementally correct through every mutation.
 */
function computeAdjacency(rooms: readonly PlacedRoom[]): Map<string, RoomGraphInfo> {
  const owner = new Map<string, string>();
  for (const room of rooms) {
    for (const cell of room.cells) {
      owner.set(cellKey(cell), room.id);
    }
  }

  const info = new Map<string, RoomGraphInfo>();
  for (const room of rooms) {
    const neighbors: Partial<Record<DoorDirection, string>> = {};
    const doors = { north: false, east: false, south: false, west: false };
    for (const cell of room.cells) {
      for (const direction of DIRECTIONS) {
        const offset = OFFSET[direction];
        const neighborId = owner.get(cellKey({ x: cell.x + offset.x, y: cell.y + offset.y }));
        if (neighborId !== undefined && neighborId !== room.id) {
          doors[direction] = true;
          neighbors[direction] ??= neighborId;
        }
      }
    }
    info.set(room.id, { neighbors, doors });
  }
  return info;
}

function bfsDistances(
  startId: string,
  adjacency: ReadonlyMap<string, RoomGraphInfo>,
): Map<string, number> {
  const distances = new Map<string, number>([[startId, 0]]);
  const queue = [startId];
  let head = 0;
  while (head < queue.length) {
    const current = queue[head];
    head += 1;
    if (current === undefined) {
      continue;
    }
    const currentDistance = distances.get(current);
    const info = adjacency.get(current);
    if (info === undefined || currentDistance === undefined) {
      continue;
    }
    for (const neighborId of Object.values(info.neighbors)) {
      if (!distances.has(neighborId)) {
        distances.set(neighborId, currentDistance + 1);
        queue.push(neighborId);
      }
    }
  }
  return distances;
}

function distinctNeighborCount(info: RoomGraphInfo | undefined): number {
  if (info === undefined) {
    return 0;
  }
  return new Set(Object.values(info.neighbors)).size;
}

/**
 * Assigns roles by the rules in `docs/GAME_DESIGN.md` §4: boss at maximum
 * distance, treasure and shop preferring dead ends. Returns `null` when the
 * skeleton is too thin to hold every required role — `tryGenerateFloor`
 * reads that as "retry", not as a bug.
 *
 * `secretId`/`supersecretId` are always already placed by the time this runs
 * (`placeSecretRoom`/`placeSupersecretRoom`, called earlier in
 * `tryGenerateFloor`) — a floor with nowhere to put either is itself a retry,
 * not something this function papers over by relabelling an ordinary room.
 */
function assignRoles(
  rooms: readonly PlacedRoom[],
  adjacency: ReadonlyMap<string, RoomGraphInfo>,
  distances: ReadonlyMap<string, number>,
  startId: string,
  secretId: string,
  supersecretId: string,
): Map<string, RoomRole> | null {
  const roles = new Map<string, RoomRole>([
    [startId, 'start'],
    [secretId, 'secret'],
    [supersecretId, 'supersecret'],
  ]);

  const distanceOf = (id: string): number => distances.get(id) ?? 0;
  const degreeOf = (id: string): number => distinctNeighborCount(adjacency.get(id));
  const byFarthestFirst = (a: PlacedRoom, b: PlacedRoom): number =>
    distanceOf(b.id) - distanceOf(a.id);

  const candidates = rooms.filter(
    (room) => room.id !== startId && room.id !== secretId && room.id !== supersecretId,
  );
  const deadEnds = candidates.filter((room) => degreeOf(room.id) === 1);

  const bossPool = (deadEnds.length > 0 ? deadEnds : candidates).slice().sort(byFarthestFirst);
  const boss = bossPool[0];
  if (boss === undefined) {
    return null;
  }
  roles.set(boss.id, 'boss');

  const remaining = candidates.filter((room) => room.id !== boss.id);
  const remainingDeadEnds = remaining
    .filter((room) => degreeOf(room.id) === 1)
    .sort(byFarthestFirst);
  const remainingRest = remaining.filter((room) => degreeOf(room.id) !== 1).sort(byFarthestFirst);
  const specialPool = [...remainingDeadEnds, ...remainingRest];

  const treasure = specialPool[0];
  const shop = specialPool[1];
  if (treasure === undefined || shop === undefined) {
    return null;
  }
  roles.set(treasure.id, 'treasure');
  roles.set(shop.id, 'shop');

  for (const room of rooms) {
    if (!roles.has(room.id)) {
      roles.set(room.id, 'normal');
    }
  }
  return roles;
}

/** The template `specialRole` a room's `role` requires — `undefined` for a generic template. */
function requiredSpecialRole(role: RoomRole): RoomTemplate['metadata']['specialRole'] {
  return role === 'boss' ||
    role === 'treasure' ||
    role === 'shop' ||
    role === 'secret' ||
    role === 'supersecret'
    ? role
    : undefined;
}

function eligibleTemplates(
  pool: readonly RoomTemplate[],
  shape: RoomShape,
  floorTag: string,
  doors: RoomDoorConfiguration,
  role: RoomRole,
): RoomTemplate[] {
  const specialRole = requiredSpecialRole(role);
  return pool.filter(
    (template) =>
      template.metadata.shape === shape &&
      template.metadata.floorTags.includes(floorTag) &&
      template.metadata.specialRole === specialRole &&
      DIRECTIONS.every((direction) => !doors[direction] || template.metadata.doors[direction]),
  );
}

function tryGenerateFloor(
  rng: Rng,
  config: FloorConfig,
  templatePool: readonly RoomTemplate[],
): FloorPlan | null {
  const targetCount = rng.nextInt(config.minRooms, config.maxRooms + 1) - 1;
  const skeleton = buildSkeleton(rng, config, Math.max(targetCount, MIN_ROOMS_FOR_ROLES));
  if (skeleton === null) {
    return null;
  }
  const { rooms, occupied } = skeleton;

  const secretId = placeSecretRoom(rooms, occupied, config.gridRadius);
  if (secretId === null) {
    return null;
  }
  const secretCell = rooms.find((room) => room.id === secretId)?.cells[0] ?? null;
  const supersecretId = placeSupersecretRoom(rooms, occupied, config.gridRadius, secretCell);
  if (supersecretId === null) {
    return null;
  }

  const adjacency = computeAdjacency(rooms);
  const startId = rooms[0]?.id;
  if (startId === undefined) {
    return null;
  }

  const distances = bfsDistances(startId, adjacency);
  if (distances.size !== rooms.length) {
    return null;
  }

  const roles = assignRoles(rooms, adjacency, distances, startId, secretId, supersecretId);
  if (roles === null) {
    return null;
  }

  const planRooms: FloorPlanRoom[] = [];
  for (const room of rooms) {
    const graphInfo = adjacency.get(room.id);
    const role = roles.get(room.id);
    if (graphInfo === undefined || role === undefined) {
      return null;
    }
    const eligible = eligibleTemplates(
      templatePool,
      room.shape,
      config.floorTag,
      graphInfo.doors,
      role,
    );
    if (eligible.length === 0) {
      return null;
    }
    const templateId = rng.weightedPick(
      eligible.map((template) => ({ value: template.id, weight: template.metadata.weight })),
    );
    planRooms.push({
      id: room.id,
      cells: room.cells,
      shape: room.shape,
      role,
      doors: graphInfo.doors,
      neighbors: graphInfo.neighbors,
      distanceFromStart: distances.get(room.id) ?? 0,
      templateId,
    });
  }

  const findRole = (role: RoomRole): string | undefined =>
    planRooms.find((room) => room.role === role)?.id;
  const bossRoomId = findRole('boss');
  const treasureRoomId = findRole('treasure');
  const shopRoomId = findRole('shop');
  const secretRoomId = findRole('secret');
  const supersecretRoomId = findRole('supersecret');
  if (
    bossRoomId === undefined ||
    treasureRoomId === undefined ||
    shopRoomId === undefined ||
    secretRoomId === undefined ||
    supersecretRoomId === undefined
  ) {
    return null;
  }

  const plan: FloorPlan = {
    floor: config.floor,
    floorName: config.name,
    startRoomId: startId,
    bossRoomId,
    treasureRoomId,
    shopRoomId,
    secretRoomId,
    supersecretRoomId,
    rooms: planRooms,
  };

  return validateFloorPlan(plan).length === 0 ? plan : null;
}

/**
 * Generates a floor from `config`, retrying on the same `rng` until a layout
 * passes `validateFloorPlan`, or throwing once `MAX_GENERATION_ATTEMPTS` is
 * spent.
 *
 * `rng` should be the run's `RngStream.Floor` stream (see
 * `src/sim/rng/streams.ts`) — a system draws from its own stream only, and a
 * run generates all seven floors off the same one, in order, across the run.
 */
export function generateFloor(
  rng: Rng,
  config: FloorConfig,
  templatePool: readonly RoomTemplate[],
): FloorPlan {
  for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
    const plan = tryGenerateFloor(rng, config, templatePool);
    if (plan !== null) {
      return plan;
    }
  }
  throw new Error(
    `floor ${String(config.floor)} (${config.name}) failed to generate a valid layout ` +
      `after ${String(MAX_GENERATION_ATTEMPTS)} attempts`,
  );
}

/**
 * Re-derives every invariant a generated floor must hold, independently of
 * how it was built. Returns the list of violations — empty means valid.
 *
 * Passing `templatePool` additionally checks that every room's chosen
 * template actually fits its slot (shape and door superset) — the
 * acceptance criterion on #20 that "no template [is] placed in a slot whose
 * doors it does not match".
 */
export function validateFloorPlan(
  plan: FloorPlan,
  templatePool?: readonly RoomTemplate[],
): string[] {
  const problems: string[] = [];
  const byId = new Map(plan.rooms.map((room) => [room.id, room] as const));

  const cellOwners = new Map<string, string>();
  for (const room of plan.rooms) {
    for (const cell of room.cells) {
      const key = cellKey(cell);
      const existing = cellOwners.get(key);
      if (existing !== undefined) {
        problems.push(`cell ${key} is claimed by both ${existing} and ${room.id}`);
      }
      cellOwners.set(key, room.id);
    }
  }

  const visited = new Set<string>([plan.startRoomId]);
  const queue = [plan.startRoomId];
  let head = 0;
  while (head < queue.length) {
    const current = queue[head];
    head += 1;
    if (current === undefined) {
      continue;
    }
    const room = byId.get(current);
    if (room === undefined) {
      continue;
    }
    for (const neighborId of Object.values(room.neighbors)) {
      if (!visited.has(neighborId)) {
        visited.add(neighborId);
        queue.push(neighborId);
      }
    }
  }
  for (const room of plan.rooms) {
    if (!visited.has(room.id)) {
      problems.push(`room ${room.id} is not reachable from the start room`);
    }
  }

  const bossRoom = byId.get(plan.bossRoomId);
  const maxDistance = plan.rooms.reduce((max, room) => Math.max(max, room.distanceFromStart), 0);
  if (bossRoom?.distanceFromStart !== maxDistance) {
    problems.push("boss room is not at the floor's maximum walking distance from start");
  }

  const roleCounts = new Map<RoomRole, number>();
  for (const room of plan.rooms) {
    roleCounts.set(room.role, (roleCounts.get(room.role) ?? 0) + 1);
  }
  for (const role of ['start', 'boss', 'treasure', 'shop', 'secret', 'supersecret'] as const) {
    if ((roleCounts.get(role) ?? 0) !== 1) {
      problems.push(
        `floor must have exactly one ${role} room, has ${String(roleCounts.get(role) ?? 0)}`,
      );
    }
  }

  const secretRoom = byId.get(plan.secretRoomId);
  const secretTouching = new Set(Object.values(secretRoom?.neighbors ?? {})).size;
  if (secretTouching < MIN_SECRET_ROOM_TOUCHING) {
    problems.push(
      `secret room ${plan.secretRoomId} touches only ${String(secretTouching)} room(s), ` +
        `needs at least ${String(MIN_SECRET_ROOM_TOUCHING)}`,
    );
  }

  if (templatePool !== undefined) {
    const templatesById = new Map(templatePool.map((template) => [template.id, template] as const));
    for (const room of plan.rooms) {
      const template = templatesById.get(room.templateId);
      if (template === undefined) {
        problems.push(`room ${room.id} references unknown template "${room.templateId}"`);
        continue;
      }
      if (template.metadata.shape !== room.shape) {
        problems.push(
          `room ${room.id} is shape ${room.shape} but its template "${room.templateId}" is ${template.metadata.shape}`,
        );
      }
      if (template.metadata.specialRole !== requiredSpecialRole(room.role)) {
        problems.push(
          `room ${room.id} has role ${room.role} but its template "${room.templateId}" ` +
            `declares specialRole ${String(template.metadata.specialRole)}`,
        );
      }
      for (const direction of DIRECTIONS) {
        if (room.doors[direction] && !template.metadata.doors[direction]) {
          problems.push(
            `room ${room.id} needs a ${direction} door but template "${room.templateId}" does not have one`,
          );
        }
      }
    }
  }

  return problems;
}
