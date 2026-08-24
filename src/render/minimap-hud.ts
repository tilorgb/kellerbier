import { Container, Graphics, Sprite, Text, type Renderer, type Texture } from 'pixi.js';
import type { FloorPlan, FloorPlanRoom, RoomDoor, RoomRole } from '../sim/room/floor-plan.js';
import type { DoorDirection } from '../content/rooms/definition.js';
import { computeVoidCells, voidCellKey } from '../sim/room/void-cells.js';
import { cellBounds, roomOutlineSegments } from './room-outline.js';
import {
  createBlobTexture,
  createDiamondTexture,
  createTriangleTexture,
} from './placeholder-art.js';

const COMPACT_CELL = 5;
const OVERLAY_CELL = 16;

const UNVISITED_COLOUR = 0x54445f;
const VISITED_COLOUR = 0x8a7f74;
const CURRENT_FILL = 0xe8dfd0;
const CURRENT_OUTLINE = 0xffffff;
const BACKDROP_COLOUR = 0x14101a;

/**
 * Icons keyed by role, once a room is revealed. `secret` and `supersecret`
 * deliberately have none — a room found by bombing a wall (#23) should not
 * be spoiled by a map icon before it's found. Devil/Angel roles don't exist
 * yet (M7, `docs/GAME_DESIGN.md` §9).
 */
type RoomIcons = Partial<Record<RoomRole, Texture>>;

interface RevealState {
  readonly visited: ReadonlySet<string>;
  /** Visited, or a neighbour of something visited — what a room's icon needs to show. */
  readonly revealed: ReadonlySet<string>;
}

const DOOR_OFFSET: Readonly<Record<DoorDirection, { readonly x: number; readonly y: number }>> = {
  north: { x: 0, y: -1 },
  south: { x: 0, y: 1 },
  east: { x: 1, y: 0 },
  west: { x: -1, y: 0 },
};

/**
 * `true` when `door` actually opens in the compiled room — `false` when it
 * points into one of `room`'s own void cells (`L`'s dropped corner, `T`'s
 * four, #107) and `compileRoomTemplate` silently drops it. Recomputes the
 * same rule `compileRoomTemplate` does, off `voidCellKey`/`computeVoidCells`
 * (`sim/room/void-cells.ts`) rather than a separate approximation, so the
 * minimap can never show a connection the compiled room doesn't have.
 */
function doorSurvivesCompile(
  room: FloorPlanRoom,
  door: RoomDoor,
  voidKeys: ReadonlySet<string>,
): boolean {
  const cell = room.cells[door.cellIndex];
  if (cell === undefined) {
    return false;
  }
  const offset = DOOR_OFFSET[door.direction];
  return !voidKeys.has(voidCellKey({ x: cell.x + offset.x, y: cell.y + offset.y }));
}

/** Exported for `tests/unit/minimap-reveal.test.ts` — pure logic, no Pixi involved. */
export function computeReveal(plan: FloorPlan, visitedRoomIds: ReadonlySet<string>): RevealState {
  const revealed = new Set<string>(visitedRoomIds);
  for (const room of plan.rooms) {
    if (!visitedRoomIds.has(room.id)) {
      continue;
    }
    const voidKeys = new Set(computeVoidCells(room.cells).map(voidCellKey));
    for (const door of room.doors) {
      if (doorSurvivesCompile(room, door, voidKeys)) {
        revealed.add(door.neighborRoomId);
      }
    }
  }
  return { visited: visitedRoomIds, revealed };
}

/**
 * Draws every revealed room of `plan` into `target`, at `cellPx` per grid
 * cell. Shared by the compact map and the full-map overlay — they differ
 * only in cell size and where the caller positions the container.
 */
function drawMap(
  target: Container,
  plan: FloorPlan,
  currentRoomId: string,
  reveal: RevealState,
  cellPx: number,
  icons: RoomIcons,
): { width: number; height: number } {
  target.removeChildren();

  const bounds = cellBounds(plan.rooms.flatMap((room) => room.cells));

  for (const room of plan.rooms) {
    if (!reveal.revealed.has(room.id)) {
      continue;
    }
    const isCurrent = room.id === currentRoomId;
    const isVisited = reveal.visited.has(room.id);
    const fillColour = isCurrent ? CURRENT_FILL : isVisited ? VISITED_COLOUR : undefined;
    const outlineColour = isCurrent ? CURRENT_OUTLINE : UNVISITED_COLOUR;
    const outlineWidth = isCurrent ? 2 : 1;

    // One `Graphics` per room rather than one shared across the whole map:
    // each room's fill and outline are independent shapes, and giving every
    // room its own display object is what keeps that true regardless of how
    // many other rooms are drawn before or after it.
    const roomGraphics = new Graphics();
    target.addChild(roomGraphics);

    // A staircase (#112) reserves a whole block of floor-grid cells so
    // nothing else can be placed anywhere its real screen-space footprint
    // touches, but almost none of that block is real floor — filling every
    // reserved cell, or outlining the block as one solid room the way an
    // ordinary `RoomShape` is, would show a footprint on the minimap the
    // player can never actually stand in, and a single straight connecting
    // line hides the real steps and corners entirely. `minimapRects`
    // (`sim/room/floor-plan.ts`'s `staircaseMinimapRects`, computed once at
    // placement time) is the real walkable shape, already in this same
    // fractional grid space — this module draws whatever a room hands it
    // and never needs to know a staircase is a staircase, let alone compile
    // one itself.
    if (room.minimapRects !== undefined) {
      // An unvisited-but-revealed staircase (a neighbour of something
      // visited, same as any other room — `computeReveal`) still needs to
      // show up as *something*, the same way an unvisited ordinary room's
      // outline does with no fill. There is no cheap true outline for a
      // union of overlapping rects the way `roomOutlineSegments` traces one
      // for a set of whole cells, so every step gets a stroke too, not only
      // a fill — a doubled line at a step's own overlap is a minor cost at
      // minimap scale, unlike the full-size in-room render this would look
      // wrong on (`render/room.ts` deliberately draws no such stroke).
      for (const step of room.minimapRects) {
        const pxMinX = toPx(step.minX, bounds.minX, cellPx);
        const pxMinY = toPx(step.minY, bounds.minY, cellPx);
        const graphics = roomGraphics.rect(
          pxMinX,
          pxMinY,
          toPx(step.maxX, bounds.minX, cellPx) - pxMinX,
          toPx(step.maxY, bounds.minY, cellPx) - pxMinY,
        );
        if (fillColour !== undefined) {
          graphics.fill(fillColour);
        }
        graphics.stroke({ width: outlineWidth, color: outlineColour });
      }
    } else {
      if (fillColour !== undefined) {
        for (const cell of room.cells) {
          roomGraphics
            .rect(
              toPx(cell.x, bounds.minX, cellPx),
              toPx(cell.y, bounds.minY, cellPx),
              cellPx,
              cellPx,
            )
            .fill(fillColour);
        }
      }

      for (const segment of roomOutlineSegments(room.cells)) {
        roomGraphics
          .moveTo(toPx(segment.x1, bounds.minX, cellPx), toPx(segment.y1, bounds.minY, cellPx))
          .lineTo(toPx(segment.x2, bounds.minX, cellPx), toPx(segment.y2, bounds.minY, cellPx))
          .stroke({ width: outlineWidth, color: outlineColour });
      }
    }

    const icon = icons[room.role];
    if (icon !== undefined) {
      target.addChild(makeIcon(room, bounds, cellPx, icon));
    }
  }

  return {
    width: (bounds.maxX - bounds.minX) * cellPx,
    height: (bounds.maxY - bounds.minY) * cellPx,
  };
}

function toPx(cellCoord: number, min: number, cellPx: number): number {
  return (cellCoord - min) * cellPx;
}

function roomCentrePx(
  room: FloorPlanRoom,
  bounds: { minX: number; minY: number },
  cellPx: number,
): { x: number; y: number } {
  const roomBounds = cellBounds(room.cells);
  return {
    x: toPx((roomBounds.minX + roomBounds.maxX) / 2, bounds.minX, cellPx),
    y: toPx((roomBounds.minY + roomBounds.maxY) / 2, bounds.minY, cellPx),
  };
}

function makeIcon(
  room: FloorPlanRoom,
  bounds: { minX: number; minY: number },
  cellPx: number,
  texture: Texture,
): Sprite {
  const sprite = new Sprite(texture);
  sprite.anchor.set(0.5);
  const centre = roomCentrePx(room, bounds, cellPx);
  sprite.position.set(centre.x, centre.y);
  return sprite;
}

/**
 * Minimap and full-map overlay: rooms visited, the current room, and
 * adjacent-but-unvisited rooms, with role icons once a room is revealed.
 *
 * Two separate views rather than one — `view` (the always-on compact map,
 * pinned to a screen corner) and `overlayView` (the full map, shown only
 * while `InputAction.Map` is held, centred over the game) — because they
 * are positioned independently by `main.ts`'s resize callback, the same way
 * every other screen-space HUD piece here is.
 *
 * `rebuild` redraws both from scratch. It is not called every frame: the
 * data (which rooms are visited, where the player is) only changes on a
 * room transition, the same reasoning `main.ts`'s own `refreshHud` already
 * documents for its slow-cadence redraw.
 */
export class MinimapHud {
  readonly view = new Container();
  readonly overlayView = new Container();

  private readonly header: Text;
  private readonly compactMap = new Container();
  private readonly overlayBackdrop: Graphics;
  private readonly overlayHeader: Text;
  private readonly overlayMap = new Container();
  private readonly icons: RoomIcons;

  constructor(renderer: Renderer) {
    this.icons = {
      treasure: createDiamondTexture(renderer, 4, 0xe8c96a),
      shop: createBlobTexture(renderer, 4, 0x6ab0c9, 0xd0eef6),
      boss: createTriangleTexture(renderer, 4, 0xc95a5a),
    };

    this.header = new Text({
      text: '',
      style: { fill: 0xe8dfd0, fontFamily: 'monospace', fontSize: 9 },
    });
    // Right-anchored: `view` is positioned with its local x=0 at the game's
    // right edge (see `main.ts`'s `positionMinimapHud`), and everything here
    // grows leftward from it, same as `compactMap` below.
    this.header.anchor.set(1, 0);
    this.view.addChild(this.header);
    this.compactMap.position.set(0, 12);
    this.view.addChild(this.compactMap);

    this.overlayBackdrop = new Graphics();
    this.overlayView.addChild(this.overlayBackdrop);
    this.overlayHeader = new Text({
      text: '',
      style: { fill: 0xe8dfd0, fontFamily: 'monospace', fontSize: 12, fontWeight: 'bold' },
    });
    this.overlayHeader.anchor.set(0.5, 0);
    this.overlayView.addChild(this.overlayHeader);
    this.overlayView.addChild(this.overlayMap);
    this.overlayView.visible = false;
  }

  rebuild(plan: FloorPlan, currentRoomId: string, visitedRoomIds: ReadonlySet<string>): void {
    const reveal = computeReveal(plan, visitedRoomIds);
    const headerText = `Floor ${String(plan.floor)} — ${plan.floorName}`;
    this.header.text = headerText;

    const compactSize = drawMap(
      this.compactMap,
      plan,
      currentRoomId,
      reveal,
      COMPACT_CELL,
      this.icons,
    );
    this.compactMap.position.set(-compactSize.width, 12);

    const overlaySize = drawMap(
      this.overlayMap,
      plan,
      currentRoomId,
      reveal,
      OVERLAY_CELL,
      this.icons,
    );
    const padding = 16;
    this.overlayHeader.text = headerText;
    this.overlayHeader.position.set(overlaySize.width / 2, 0);
    this.overlayMap.position.set(0, this.overlayHeader.height + 8);
    const backdropWidth = overlaySize.width + padding * 2;
    const backdropHeight = overlaySize.height + this.overlayHeader.height + 8 + padding * 2;
    this.overlayBackdrop
      .clear()
      .rect(-padding, -padding, backdropWidth, backdropHeight)
      .fill({ color: BACKDROP_COLOUR, alpha: 0.85 });
    // The overlay's own extent changes with the floor's cell bounds, so it
    // re-centres itself on its pivot rather than main.ts having to know its
    // size — main.ts only ever positions this view at the screen's centre.
    this.overlayView.pivot.set(backdropWidth / 2 - padding, backdropHeight / 2 - padding);
  }

  /** Cheap per-frame toggle — no redraw, just which view is visible. */
  setMapOpen(open: boolean): void {
    this.view.visible = !open;
    this.overlayView.visible = open;
  }
}
