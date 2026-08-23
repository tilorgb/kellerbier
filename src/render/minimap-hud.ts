import { Container, Graphics, Sprite, Text, type Renderer, type Texture } from 'pixi.js';
import type { FloorPlan, FloorPlanRoom, RoomRole } from '../sim/room/floor-plan.js';
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

/** Icons keyed by role, once a room is revealed. Devil/Angel roles don't exist yet — see #23. */
type RoomIcons = Partial<Record<RoomRole, Texture>>;

interface RevealState {
  readonly visited: ReadonlySet<string>;
  /** Visited, or a neighbour of something visited — what a room's icon needs to show. */
  readonly revealed: ReadonlySet<string>;
}

function computeReveal(plan: FloorPlan, visitedRoomIds: ReadonlySet<string>): RevealState {
  const revealed = new Set<string>(visitedRoomIds);
  for (const room of plan.rooms) {
    if (!visitedRoomIds.has(room.id)) {
      continue;
    }
    for (const neighborId of Object.values(room.neighbors)) {
      revealed.add(neighborId);
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
