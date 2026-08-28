import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { ROOM_TILE_UNITS } from '../content/rooms/definition.js';
import { BLOCK_STRIDE, DOOR_SPAN, roomFrameSize, type RoomGeometry } from '../sim/room/geometry.js';
import { doorCentre, type CompiledDoor } from '../sim/room/template.js';
import { ROOM_HAZARD_PALETTE, roomThemeForFloor } from './palette.js';

/**
 * Which of `variantCount` tile textures a floor cell at `(col, row)` draws —
 * Floor 2's "living floor" (#37): several tile variants (`floor-art.ts`'s
 * `RURAL_FLOOR_TILE_URLS`) mixed across the room instead of one texture
 * tiled identically everywhere, so the ground doesn't read as a single
 * repeating swatch.
 *
 * A hash of the cell's own position, not a random draw — `createRoomView`
 * runs once at room load and never again (see its own doc comment), so
 * nothing needs to be *stored* to keep a room's floor from reshuffling on a
 * later redraw; reading off `(col, row)` already gives the same answer
 * every time this cell is drawn, whether that's the same visit or a later
 * one. It intentionally takes no room-specific seed either: two rooms that
 * happen to place the same absolute cell see the same variant, which is a
 * coincidence rather than a rule, and different rooms overwhelmingly don't
 * share cells in the first place.
 */
export function pickTileVariant(col: number, row: number, variantCount: number): number {
  if (variantCount <= 1) {
    return 0;
  }
  let hash = (col * 374761393 + row * 668265263) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177) >>> 0;
  return hash % variantCount;
}

/** Narrower than `DOOR_SPAN` — a hint, not a doorway. */
const CRACK_SPAN = 10;

/**
 * Draws a room once, into a static container.
 *
 * Room geometry does not change while the room is loaded, so this is built at
 * load and never touched again — nothing here runs per frame.
 */
export function createRoomView(
  room: RoomGeometry,
  floorNumber = 0,
  floorTileTextures?: readonly Texture[],
): Container {
  const container = new Container();
  const palette = roomThemeForFloor(floorNumber);

  const frame = roomFrameSize(room);
  const floor = new Graphics();
  floor.rect(0, 0, frame.width, frame.height).fill(palette.wall);
  floor
    .rect(room.minX, room.minY, room.maxX - room.minX, room.maxY - room.minY)
    .fill(palette.floor)
    .stroke({ width: 1, color: palette.wallEdge, alignment: 0 });
  container.addChild(floor);

  // Real tile art (#35's `assets/sprites/floor-1-cellar/tiles/`, #37's
  // `floor-2-rural/tiles/`), laid over the flat fill above rather than
  // replacing it — the fill is what shows through a room shape's dropped
  // cells and margin, and stays the fallback for every floor that has no
  // tile art yet. One sprite per 16-unit cell rather than a single tiled
  // texture, each drawing whichever of `floorTileTextures` `pickTileVariant`
  // lands on for that cell — with one texture (Floor 1, today) every cell
  // picks index 0 and this is visually identical to the old single
  // `TilingSprite`; with several (Floor 2) it's the "living floor" mix.
  if (floorTileTextures !== undefined && floorTileTextures.length > 0) {
    for (let y = room.minY; y < room.maxY; y += ROOM_TILE_UNITS) {
      for (let x = room.minX; x < room.maxX; x += ROOM_TILE_UNITS) {
        const col = Math.round(x / ROOM_TILE_UNITS);
        const row = Math.round(y / ROOM_TILE_UNITS);
        const variant = pickTileVariant(col, row, floorTileTextures.length);
        const texture = floorTileTextures[variant] ?? floorTileTextures[0];
        if (texture === undefined) {
          continue;
        }
        const tile = new Sprite(texture);
        tile.position.set(x, y);
        container.addChild(tile);
      }
    }
  }

  const puddles = new Graphics();
  for (let puddle = 0; puddle < room.puddleCount; puddle++) {
    const base = puddle * BLOCK_STRIDE;
    const minX = room.puddles[base] ?? 0;
    const minY = room.puddles[base + 1] ?? 0;
    const maxX = room.puddles[base + 2] ?? 0;
    const maxY = room.puddles[base + 3] ?? 0;
    puddles
      .rect(minX, minY, maxX - minX, maxY - minY)
      .fill({ color: ROOM_HAZARD_PALETTE.puddleFill, alpha: 0.85 })
      .stroke({ width: 1, color: ROOM_HAZARD_PALETTE.puddleEdge, alpha: 0.5, alignment: 0 });
  }
  container.addChild(puddles);

  const trellises = new Graphics();
  for (let block = 0; block < room.sightBlockCount; block++) {
    const base = block * BLOCK_STRIDE;
    const minX = room.sightBlocks[base] ?? 0;
    const minY = room.sightBlocks[base + 1] ?? 0;
    const maxX = room.sightBlocks[base + 2] ?? 0;
    const maxY = room.sightBlocks[base + 3] ?? 0;
    trellises
      .rect(minX, minY, maxX - minX, maxY - minY)
      .fill({ color: ROOM_HAZARD_PALETTE.trellisFill, alpha: 0.75 })
      .stroke({ width: 1, color: ROOM_HAZARD_PALETTE.trellisEdge, alpha: 0.6, alignment: 0 });
  }
  container.addChild(trellises);

  const blocks = new Graphics();
  for (let block = 0; block < room.blockCount; block++) {
    const base = block * BLOCK_STRIDE;
    const minX = room.blocks[base] ?? 0;
    const minY = room.blocks[base + 1] ?? 0;
    const maxX = room.blocks[base + 2] ?? 0;
    const maxY = room.blocks[base + 3] ?? 0;
    blocks
      .rect(minX, minY, maxX - minX, maxY - minY)
      .fill(palette.block)
      .stroke({ width: 1, color: palette.blockEdge, alignment: 0 });
  }
  container.addChild(blocks);

  // A shape's dropped cells (`L`'s one corner from #100/#20, `T`'s four from
  // #107) are real `blocks` entries too (for collision), but drawn over in
  // the wall's own colour rather than left as obstacles — they read as the
  // rest of the room's boundary, not as pillars the size of a sub-room
  // sitting in the middle of it.
  for (const voidRect of room.voidRects) {
    container
      .addChild(new Graphics())
      .rect(
        voidRect.minX,
        voidRect.minY,
        voidRect.maxX - voidRect.minX,
        voidRect.maxY - voidRect.minY,
      )
      .fill(palette.wall)
      .stroke({ width: 1, color: palette.wallEdge, alignment: 0 });
  }

  return container;
}

/**
 * Draws a marker in the wall band for each of the room's real doors (#100:
 * up to eight for a `2x2` room, one per `(cell, wall)` pair with a real
 * neighbour), coloured by whether it is locked.
 *
 * Kept separate from `createRoomView` because door colour changes the instant
 * the last enemy dies — redrawing a handful of small rects on that is cheap,
 * redrawing the whole room (floor, blocks) every time the lock state flips is
 * not.
 */
export function createDoorView(
  room: RoomGeometry,
  doors: readonly CompiledDoor[],
  locked: boolean,
): Graphics {
  const graphics = new Graphics();
  const colour = locked ? ROOM_HAZARD_PALETTE.doorLocked : ROOM_HAZARD_PALETTE.doorOpen;
  const frame = roomFrameSize(room);

  for (const door of doors) {
    const centre = doorCentre(room, door);
    const span = door.span ?? DOOR_SPAN;
    const half = span / 2;
    switch (door.direction) {
      case 'north':
        graphics.rect(centre.x - half, 0, span, room.minY).fill(colour);
        break;
      case 'south':
        graphics.rect(centre.x - half, room.maxY, span, frame.height - room.maxY).fill(colour);
        break;
      case 'west':
        graphics.rect(0, centre.y - half, room.minX, span).fill(colour);
        break;
      case 'east':
        graphics.rect(room.maxX, centre.y - half, frame.width - room.maxX, span).fill(colour);
        break;
    }
  }

  return graphics;
}

/**
 * Draws a crack on each door's wall given — the hint that a secret room sits
 * behind it, `docs/GAME_DESIGN.md` §4's "hinted by cracks in adjacent room
 * tiles." Drawn on the solid wall band itself (a hidden door has no gap —
 * see `GameSim.loadRoom`'s `hiddenDoors`), so a crack never overlaps an
 * actual doorway: a wall is either open (`createDoorView`) or cracked
 * (here), never both.
 *
 * A supersecret room's wall is never passed here — no crack at all is the
 * whole of what "deliberately obnoxious to find" (#23) means for this view.
 */
export function createSecretHintView(room: RoomGeometry, doors: readonly CompiledDoor[]): Graphics {
  const graphics = new Graphics();
  const half = CRACK_SPAN / 2;

  for (const door of doors) {
    const centre = doorCentre(room, door);
    if (door.direction === 'north' || door.direction === 'south') {
      drawCrack(graphics, centre.x, centre.y, half, true);
    } else {
      drawCrack(graphics, centre.x, centre.y, half, false);
    }
  }

  return graphics;
}

/** One jagged mark, centred on `(x, y)`, running along the wall it's drawn on. */
function drawCrack(
  graphics: Graphics,
  x: number,
  y: number,
  half: number,
  horizontal: boolean,
): void {
  const zigzag = horizontal
    ? [
        [x - half, y],
        [x - half / 2, y + 3],
        [x, y - 3],
        [x + half / 2, y + 3],
        [x + half, y],
      ]
    : [
        [x, y - half],
        [x + 3, y - half / 2],
        [x - 3, y],
        [x + 3, y + half / 2],
        [x, y + half],
      ];
  const [start, ...rest] = zigzag;
  if (start === undefined) {
    return;
  }
  graphics.moveTo(start[0] ?? 0, start[1] ?? 0);
  for (const point of rest) {
    graphics.lineTo(point[0] ?? 0, point[1] ?? 0);
  }
  graphics.stroke({ width: 1.5, color: ROOM_HAZARD_PALETTE.crack });
}
