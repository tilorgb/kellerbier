import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { ROOM_TILE_UNITS } from '../content/rooms/definition.js';
import { BLOCK_STRIDE, DOOR_SPAN, roomFrameSize, type RoomGeometry } from '../sim/room/geometry.js';
import { doorCentre, type CompiledDoor } from '../sim/room/template.js';
import type { RoomTileArt } from './floor-art.js';
import { ROOM_HAZARD_PALETTE, roomThemeForFloor } from './palette.js';

/**
 * Which of `variantCount` tile textures a floor cell at `(col, row)` draws —
 * Floor 2's "living floor" (#37): several tile variants (`floor-art.ts`'s
 * `FloorTileset.floorVariants`) mixed across the room instead of one texture
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

/** How much a floor tile variant's accent fleck is dimmed toward the base floor colour. */
const FLOOR_VARIANT_ACCENT_ALPHA = 0.55;

/**
 * Tiles `texture` over a rectangle, one sprite per 16-unit cell, into
 * `container`.
 *
 * The rectangle is not required to land on tile boundaries — the wall band is
 * 40 units wide and 18 tall (`sim/room/template.ts`'s `ROOM_MARGIN_X`/`_Y`),
 * neither a multiple of 16 — so the last row and column of a band run under
 * whatever is drawn over it rather than being clipped. That is why the wall
 * goes down before the floor does: a masonry course cut off mid-block by the
 * floor's edge reads as the wall continuing behind the floor, which is what
 * it is.
 *
 * Scaled by `ROOM_TILE_UNITS / texture.width` rather than drawn at native
 * size (`docs/DECISIONS.md` #48): a tile is authored at one of exactly two
 * legal sizes, 16 or 32 (`tools/art/spec.mjs`), and this is what keeps either
 * one filling the same `ROOM_TILE_UNITS`-wide cell — 16 at scale 1 on the
 * coarser room grid, 32 at scale 0.5 landing on the same 1:1 grid a
 * character draws on. A wall redrawn at 32 for more detail and a block still
 * at 16 tile side by side in the same room with no code change either one
 * has to know about.
 */
function tileRect(
  container: Container,
  texture: Texture,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): void {
  const scale = ROOM_TILE_UNITS / texture.width;
  for (let y = minY; y < maxY; y += ROOM_TILE_UNITS) {
    for (let x = minX; x < maxX; x += ROOM_TILE_UNITS) {
      const tile = new Sprite(texture);
      tile.scale.set(scale);
      tile.position.set(x, y);
      container.addChild(tile);
    }
  }
}

/**
 * Draws a room once, into a static container.
 *
 * Room geometry does not change while the room is loaded, so this is built at
 * load and never touched again — nothing here runs per frame.
 *
 * `tileArt` is the floor's authored tileset (`floor-art.ts`'s `roomTiles`).
 * A floor with none — every floor but 1 and 2 today (#39-#43, parked in M10)
 * — keeps the flat `RoomTheme` fill this drew before any tileset existed,
 * which is the graceful-degradation shape `docs/DECISIONS.md` #19 asks for:
 * an unfinished floor looks plain, it does not fail to load.
 */
export function createRoomView(
  room: RoomGeometry,
  floorNumber = 0,
  tileArt?: RoomTileArt,
): Container {
  const container = new Container();
  const palette = roomThemeForFloor(floorNumber);

  const frame = roomFrameSize(room);
  const floor = new Graphics();
  floor.rect(0, 0, frame.width, frame.height).fill(palette.wall);
  floor
    .rect(room.minX, room.minY, room.maxX - room.minX, room.maxY - room.minY)
    .fill(palette.floor);
  container.addChild(floor);

  if (tileArt !== undefined) {
    // The wall band, over the whole frame — the playfield's own tiles land on
    // top of it below. Real wall art at last: `cellar-wall.png` was authored
    // in #35 and floor 1 drew a flat grey rectangle over it for two
    // milestones (#152).
    tileRect(container, tileArt.wall, 0, 0, frame.width, frame.height);
    // One course of "lip" along the wall the player is looking at — the north
    // band's inner edge, where the wall meets the floor. Only the north side:
    // the lip is authored with its highlight along the *bottom* of the tile,
    // which is only the right way up against a wall face seen from the front.
    // The other three edges keep the 1px `wallEdge` stroke below for
    // definition, which is what they had and all they need.
    tileRect(
      container,
      tileArt.wallLip,
      room.minX,
      room.minY - ROOM_TILE_UNITS,
      room.maxX,
      room.minY,
    );
  }

  // Real tile art (#35's `assets/sprites/floor-1-cellar/tiles/`, #37's
  // `floor-2-rural/tiles/`), laid over the flat fill above rather than
  // replacing it — the fill is what shows through a room shape's dropped
  // cells and margin, and stays the fallback for every floor that has no
  // tile art yet. One sprite per 16-unit cell rather than a single tiled
  // texture, each drawing whichever of the floor's variants `pickTileVariant`
  // lands on for that cell — with one texture (Floor 1, today) every cell
  // picks index 0 and this is visually identical to the old single
  // `TilingSprite`; with several (Floor 2) it's the "living floor" mix.
  const floorTileTextures = tileArt?.floorVariants;
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
        // `docs/DECISIONS.md` #48: a floor variant may be authored at 16 or
        // 32, and this is what keeps either one filling the same
        // `ROOM_TILE_UNITS`-wide cell — see `tileRect`'s own doc comment.
        tile.scale.set(ROOM_TILE_UNITS / texture.width);
        tile.position.set(x, y);
        // Every authored floor variant's base fill is the same colour as
        // `palette.floor` underneath it (the flat rect above) — only its one
        // or two accent-fleck pixels differ. Dimming the whole sprite toward
        // that shared background therefore leaves the base untouched and
        // just softens the fleck, the same "read as background, not a
        // foreground thing" treatment `DecalView` already gives blood decals
        // (`render/decals.ts`). With a "living floor" mix picking a variant
        // per cell (almost) every cell shows one, undimmed they read as a
        // field of small bright objects rather than floor grain.
        tile.alpha = FLOOR_VARIANT_ACCENT_ALPHA;
        container.addChild(tile);
      }
    }
  }

  // The playfield outline goes on last of the ground layers, so a tile drawn
  // right up to the edge does not paint over the one line that separates
  // floor from wall on the three sides with no lip course.
  container
    .addChild(new Graphics())
    .rect(room.minX, room.minY, room.maxX - room.minX, room.maxY - room.minY)
    .stroke({ width: 1, color: palette.wallEdge, alignment: 0 });

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
      .stroke({ color: ROOM_HAZARD_PALETTE.trellisEdge, width: 1, alpha: 0.6, alignment: 0 });
  }
  container.addChild(trellises);

  // A shape's dropped cells (`L`'s one corner from #100/#20, `T`'s four from
  // #107) are real `blocks` entries too (for collision), so they are skipped
  // here and drawn as boundary below rather than as pillars the size of a
  // sub-room sitting in the middle of the room.
  const blocks = new Graphics();
  for (let block = 0; block < room.blockCount; block++) {
    const base = block * BLOCK_STRIDE;
    const minX = room.blocks[base] ?? 0;
    const minY = room.blocks[base + 1] ?? 0;
    const maxX = room.blocks[base + 2] ?? 0;
    const maxY = room.blocks[base + 3] ?? 0;
    if (isVoidRect(room, minX, minY, maxX, maxY)) {
      continue;
    }
    if (tileArt !== undefined) {
      tileRect(container, tileArt.block, minX, minY, maxX, maxY);
    } else {
      blocks.rect(minX, minY, maxX - minX, maxY - minY).fill(palette.block);
    }
    blocks
      .rect(minX, minY, maxX - minX, maxY - minY)
      .stroke({ width: 1, color: palette.blockEdge, alignment: 0 });
  }
  container.addChild(blocks);

  for (const voidRect of room.voidRects) {
    const outline = new Graphics().rect(
      voidRect.minX,
      voidRect.minY,
      voidRect.maxX - voidRect.minX,
      voidRect.maxY - voidRect.minY,
    );
    if (tileArt === undefined) {
      outline.fill(palette.wall);
    } else {
      tileRect(container, tileArt.wall, voidRect.minX, voidRect.minY, voidRect.maxX, voidRect.maxY);
    }
    container.addChild(outline.stroke({ width: 1, color: palette.wallEdge, alignment: 0 }));
  }

  return container;
}

/** Whether a `blocks` entry is one of the shape's dropped cells rather than an authored obstacle. */
function isVoidRect(
  room: RoomGeometry,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): boolean {
  return room.voidRects.some(
    (rect) => rect.minX === minX && rect.minY === minY && rect.maxX === maxX && rect.maxY === maxY,
  );
}

/** The two door sprites a room draws its doorways with (#152). */
export interface DoorTextures {
  readonly open: Texture;
  readonly closed: Texture;
}

/**
 * A door tile sprite plus which axis it spans the doorway's *depth* on —
 * `render/view.ts`'s open/close transition scales exactly that axis, on
 * exactly this sprite's own anchor, so a west/east door's tiles retract
 * sideways into the wall while a north/south door's retract vertically,
 * whichever pair actually sits in the gap.
 */
export interface DoorSprite {
  readonly sprite: Sprite;
  readonly horizontal: boolean;
}

/** A door layer: the container to draw, plus its tile sprites for animating open/close. */
export interface DoorView {
  readonly container: Container;
  /** Empty when there are no textures — the flat colour fallback has nothing to animate. */
  readonly sprites: readonly DoorSprite[];
}

/**
 * Draws each of the room's real doors (#100: up to eight for a `2x2` room,
 * one per `(cell, wall)` pair with a real neighbour), open or locked.
 *
 * Kept separate from `createRoomView` because door state changes the instant
 * the last enemy dies — rebuilding a handful of sprites on that is cheap,
 * rebuilding the whole room (floor, walls, blocks) every time the lock state
 * flips is not.
 *
 * With `textures`, a doorway is two 16x16 door tiles laid end to end across
 * the `DOOR_SPAN`-wide gap at 1:1 — 32 units across a 24-unit gap, so each
 * one overhangs 4 units into the wall either side. Drawn at native size
 * rather than stretched to the gap on purpose: a 16px sprite scaled to 24
 * puts some of its pixels one screen pixel wide and some two, which
 * `docs/CONTENT_BIBLE.md` §5 rules out outright, and a door frame set into
 * the wall around it is what a door looks like anyway.
 */
export function createDoorView(
  room: RoomGeometry,
  doors: readonly CompiledDoor[],
  locked: boolean,
  textures?: DoorTextures,
): DoorView {
  const container = new Container();
  const sprites: DoorSprite[] = [];
  const graphics = new Graphics();
  const colour = locked ? ROOM_HAZARD_PALETTE.doorLocked : ROOM_HAZARD_PALETTE.doorOpen;
  const frame = roomFrameSize(room);
  const texture = textures === undefined ? null : locked ? textures.closed : textures.open;

  for (const door of doors) {
    const centre = doorCentre(room, door);
    const span = door.span ?? DOOR_SPAN;
    const half = span / 2;
    let bandMinX = 0;
    let bandMinY = 0;
    let bandWidth = 0;
    let bandHeight = 0;
    switch (door.direction) {
      case 'north':
        [bandMinX, bandMinY, bandWidth, bandHeight] = [centre.x - half, 0, span, room.minY];
        break;
      case 'south':
        [bandMinX, bandMinY, bandWidth, bandHeight] = [
          centre.x - half,
          room.maxY,
          span,
          frame.height - room.maxY,
        ];
        break;
      case 'west':
        [bandMinX, bandMinY, bandWidth, bandHeight] = [0, centre.y - half, room.minX, span];
        break;
      case 'east':
        [bandMinX, bandMinY, bandWidth, bandHeight] = [
          room.maxX,
          centre.y - half,
          frame.width - room.maxX,
          span,
        ];
        break;
    }
    if (texture === null) {
      graphics.rect(bandMinX, bandMinY, bandWidth, bandHeight).fill(colour);
      continue;
    }
    // Two tiles along the doorway's own long axis, centred on the gap.
    //
    // Across the wall's thickness, the door sits flush against the interior
    // wall face (`centre.x`/`centre.y`, the same point `wallLip` above is
    // drawn flush against) and extends one tile's width *away* from the room
    // — not centred in the whole margin band. The margin is 40 units deep on
    // the west/east walls but only 18 on north/south (`ROOM_MARGIN_X`/`_Y` in
    // `sim/room/template.ts`), so centring a 16-unit sprite in the band left
    // west/east doors floating with ~12 units of solid wall visible on both
    // sides, while north/south happened to look right because the band there
    // is already close to one tile deep.
    const horizontal = door.direction === 'north' || door.direction === 'south';
    const crossOffset =
      door.direction === 'north' || door.direction === 'west'
        ? -ROOM_TILE_UNITS / 2
        : ROOM_TILE_UNITS / 2;
    const alongX = horizontal ? bandMinX + span / 2 - ROOM_TILE_UNITS : centre.x + crossOffset;
    const alongY = horizontal ? centre.y + crossOffset : bandMinY + span / 2 - ROOM_TILE_UNITS;
    for (let step = 0; step < 2; step++) {
      const sprite = new Sprite(texture);
      sprite.anchor.set(horizontal ? 0 : 0.5, horizontal ? 0.5 : 0);
      sprite.position.set(
        horizontal ? alongX + step * ROOM_TILE_UNITS : alongX,
        horizontal ? alongY : alongY + step * ROOM_TILE_UNITS,
      );
      container.addChild(sprite);
      sprites.push({ sprite, horizontal });
    }
  }

  if (texture === null) {
    container.addChild(graphics);
  } else {
    graphics.destroy();
  }
  return { container, sprites };
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
