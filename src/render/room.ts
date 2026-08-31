import { Container, Graphics, Sprite, TilingSprite, type Texture } from 'pixi.js';
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
 * The scale that puts a tile-category texture — authored at one of exactly
 * two legal sizes, 16 or 32 (`tools/art/spec.mjs`) — on the room's
 * `ROOM_TILE_UNITS`-wide grid, whichever of the two it happens to be:
 * 16 at scale 1 on the coarser room grid, 32 at scale 0.5 landing on the same
 * 1:1 grid a character draws on (`docs/DECISIONS.md` #48).
 *
 * `tileRect` below was the only place this was ever computed until #182's
 * follow-up: every other renderer that draws tile-category art — a
 * destructible entity (`entities.ts`), a decorative prop (`prop-view.ts`), a
 * door (`createDoorView` below), a pedestal's plinth (`pedestal-view.ts`) —
 * either hardcoded a 16px-shaped constant or set no scale at all,
 * so redrawing any of those assets at 32x32 doubled them on screen instead of
 * just adding detail. One shared derivation is what keeps that from
 * recurring the next time an asset in any of those categories opts into 32.
 */
export function tileGridScale(texture: Texture): number {
  return ROOM_TILE_UNITS / texture.width;
}

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
 */
function tileRect(
  container: Container,
  texture: Texture,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): void {
  const scale = tileGridScale(texture);
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
 * The wall-boundary ("lip") course along all four edges of the room's
 * interior box, plus a dedicated corner piece at each of the four corners
 * (#196) — the built wall the doors sit in.
 *
 * `edge` is authored lit-top / contact-shadow-bottom (a wall face seen
 * head-on against the north wall); it is drawn as a **continuous** tiling
 * band along each edge, turned a quarter so the shadow always lands against
 * the floor — north unturned, south flipped, west/east rotated. A band, not a
 * row of discrete tiles, so there is no tile grid for a door sprite to sit
 * half a cell out of, and no seam to align.
 *
 * Each band covers *exactly* the room's interior span (`minX..maxX` /
 * `minY..maxY`) and stops there. The corner cells beyond are filled by
 * `corner`, authored for the north-west corner as a solid block of the wall
 * material darkening toward the room's inner corner point — no straight
 * contact-shadow edge, because a corner cell touches the floor only at that
 * one diagonal point. Rotated a quarter per corner clockwise around the room.
 */
function tileLipEdges(
  container: Container,
  edge: Texture,
  corner: Texture,
  room: RoomGeometry,
): void {
  const t = ROOM_TILE_UNITS;
  const half = t / 2;
  const scale = tileGridScale(edge); // 32px texture → a 16-unit course

  // One edge band. `along` is the interior span it runs; `depth` is `t`. It is
  // placed by its own top-left corner (`anchor 0,0`) and `rotation` swings
  // that corner's two axes onto the wall — see each call for the pivot point.
  const band = (along: number, px: number, py: number, rotation: number): void => {
    const strip = new TilingSprite({ texture: edge, width: along, height: t });
    strip.tileScale.set(scale); // 32px texture repeats every `t` (16) local units
    strip.anchor.set(0, 0);
    strip.rotation = rotation;
    strip.position.set(px, py);
    container.addChild(strip);
  };
  const spanX = room.maxX - room.minX;
  const spanY = room.maxY - room.minY;
  band(spanX, room.minX, room.minY - t, 0); // north: fills x[minX,maxX] y[minY-t,minY]
  band(spanX, room.maxX, room.maxY + t, Math.PI); // south: 180° swings back over x[minX,maxX] y[maxY,maxY+t]
  band(spanY, room.minX - t, room.maxY, -Math.PI / 2); // west: -90° → x[minX-t,minX] y[minY,maxY]
  band(spanY, room.maxX + t, room.minY, Math.PI / 2); // east: +90° → x[maxX,maxX+t] y[minY,maxY]

  const spin = (cx: number, cy: number, rotation: number): void => {
    const tile = new Sprite(corner);
    tile.anchor.set(0.5);
    tile.scale.set(tileGridScale(corner));
    tile.rotation = rotation;
    tile.position.set(cx, cy);
    container.addChild(tile);
  };
  spin(room.minX - half, room.minY - half, 0); // NW
  spin(room.maxX + half, room.minY - half, Math.PI / 2); // NE
  spin(room.maxX + half, room.maxY + half, Math.PI); // SE
  spin(room.minX - half, room.maxY + half, -Math.PI / 2); // SW
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
  // The wall extends this far past the frame on every side, so a letterboxed
  // viewport (a window that is not exactly the internal aspect ratio) shows
  // wall rather than a hard edge, and shows the *same* amount on opposite
  // sides — a bare `0..frame` fill sat flush at the top and overshot at the
  // bottom, which read as the room being off-centre (#196).
  const bleed = ROOM_TILE_UNITS * 4;
  const floor = new Graphics();
  floor.rect(-bleed, -bleed, frame.width + bleed * 2, frame.height + bleed * 2).fill(palette.wall);
  floor
    .rect(room.minX, room.minY, room.maxX - room.minX, room.maxY - room.minY)
    .fill(palette.floor);
  container.addChild(floor);

  if (tileArt !== undefined) {
    // The wall band, over the whole frame — the playfield's own tiles land on
    // top of it below. Real wall art at last: `cellar-wall.png` was authored
    // in #35 and floor 1 drew a flat grey rectangle over it for two
    // milestones (#152).
    tileRect(container, tileArt.wall, -bleed, -bleed, frame.width + bleed, frame.height + bleed);
    // The wall-boundary course — a continuous tiling band along every edge
    // where the wall meets the floor, with a dedicated corner piece at each
    // corner (#196). The built wall the doors are set into; it reads as a
    // framed room rather than a rectangle drawn on a field.
    tileLipEdges(container, tileArt.wallLip, tileArt.wallLipCorner, room);
    // The wall band above just tiled over the *whole* frame, interior
    // included, so it painted over the flat `palette.floor` fill drawn a few
    // lines up. That fill is exactly what the floor-variant sprites below are
    // authored to blend against — their alpha dimming leaves the base
    // untouched only when what's underneath already matches `palette.floor`
    // (this function's own doc comment). Re-laying it here restores that
    // before the floor variants go down, instead of leaving them to blend
    // toward the wall texture and read as a half-transparent floor with the
    // wall visible through it.
    container
      .addChild(new Graphics())
      .rect(room.minX, room.minY, room.maxX - room.minX, room.maxY - room.minY)
      .fill(palette.floor);
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
        // `ROOM_TILE_UNITS`-wide cell — see `tileGridScale`'s own doc comment.
        tile.scale.set(tileGridScale(texture));
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

  // The playfield outline — the floor/wall separation for a floor with no
  // tile art (every floor but 1 and 2 today). With a tileset the lip course
  // above already draws that separation on all four edges, so the bare line
  // would just be a second, harder edge on top of it.
  if (tileArt === undefined) {
    container
      .addChild(new Graphics())
      .rect(room.minX, room.minY, room.maxX - room.minX, room.maxY - room.minY)
      .stroke({ width: 1, color: palette.wallEdge, alignment: 0 });
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

/**
 * The door sprites a room draws its doorways with (#152, #196).
 *
 * `open`/`closed` are the two states every door has; `locked` is the third
 * (#196) — a doorway into a key-locked treasure room (`metadata.keyLocked`)
 * that a player has not opened yet. `locked` is optional: a texture set
 * authored without it falls back to `closed`, per `docs/DECISIONS.md` #19's
 * graceful-degradation rule — a missing state must not throw inside a
 * transition.
 *
 * Each texture is the **right half** of a door — the seam runs down its left
 * edge, the frame post is on its right. `createDoorView` draws it on the
 * right of the doorway and a mirrored copy on the left, so the two tiles read
 * as one door rather than two (the "two holes" `#196` set out to fix), and
 * rotates the pair 90° for a west/east doorway so the seam — and the
 * padlock across it — runs the way that door actually parts.
 */
export interface DoorTextures {
  readonly open: Texture;
  readonly closed: Texture;
  readonly locked?: Texture | undefined;
}

/** Which state `createDoorView` draws a given door in. */
export type DoorState = 'open' | 'closed' | 'locked';

/**
 * One half-door sprite, plus what the open/close transition needs to slide it
 * apart from its partner (`render/view.ts`'s `applyDoorSwingScale`).
 *
 * The two halves of a doorway retract along the doorway's **long** axis,
 * toward opposite walls — a north/south door parts sideways, a west/east door
 * parts up and down ("Isaac-like", `#196`). That axis is always the sprite's
 * own local x once `rotation` is applied, so the transition only ever scales
 * `sprite.scale.x`; `retractSign` carries the mirror (`-1` for the left half)
 * and `baseScale` the 32px→tile-grid factor (`docs/DECISIONS.md` #48), so the
 * transition can rebuild the full `scale.x` value rather than nudge it.
 */
export interface DoorSprite {
  readonly sprite: Sprite;
  readonly retractSign: number;
  readonly baseScale: number;
}

/** A door layer: the container to draw, plus its tile sprites for animating open/close. */
export interface DoorView {
  readonly container: Container;
  /** Empty when there are no textures — the flat colour fallback has nothing to animate. */
  readonly sprites: readonly DoorSprite[];
}

/**
 * Where one half of a doorway's door sits and how it is oriented — a pure
 * function of the room, the door and the tile-grid scale, so the placement
 * (and the mirror/rotation signs that were the fiddly part of `#196`) is
 * unit-testable without a renderer (`tests/unit/door-layout.test.ts`).
 *
 * A doorway is two `ROOM_TILE_UNITS`-wide half-door tiles that meet at its
 * centre (`doorCentre`, the wall/floor seam) and extend one tile's depth
 * *into* the wall — 32 units of door across a 24-unit gap, so each half
 * overhangs into the wall on both the outer and (past the seam) the far side.
 * Scaled onto that grid rather than stretched to the gap for the reason
 * `docs/CONTENT_BIBLE.md` §5 rules non-whole-pixel scaling out.
 *
 * Each texture is a right-half door (`DoorTextures`): seam on the local left
 * edge, frame post on the right, the room-facing edge along the bottom.
 * `anchor` is `(1, 1)` — the post/room corner — and every half is placed by
 * putting that corner at `pivot` and letting `scaleX`/`scaleY`/`rotation`
 * lay the rest out from there. `scaleX < 0` is the mirrored left/near half;
 * `retractSign` (`= sign(scaleX)`) is what `render/view.ts` multiplies back
 * in when it slides the halves apart along the doorway's long axis.
 */
export interface DoorHalfPlacement {
  readonly pivotX: number;
  readonly pivotY: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly rotation: number;
  readonly retractSign: number;
}

export function doorHalfPlacements(
  room: RoomGeometry,
  door: CompiledDoor,
  baseScale: number,
): readonly [DoorHalfPlacement, DoorHalfPlacement] {
  // Derived once, by hand, from Pixi's transform for an `anchor:(1,1)` sprite:
  //   world = pos + Rot(rotation) · ((local − (32,32)) · (scaleX, scaleY))
  // with the four semantic edges of the right-half texture (seam at local
  // x=0, post at x=32, into-wall at y=0, room-facing at y=32) pinned to where
  // that half has to sit. `tests/unit/door-layout.test.ts` locks the results.
  // The retract axis is always the sprite's local x once rotation is applied
  // (`applyDoorSwingScale`), so `retractSign` is just `sign(scaleX)`.
  const c = doorCentre(room, door);
  const t = ROOM_TILE_UNITS;
  const s = baseScale;
  const R = Math.PI / 2;
  switch (door.direction) {
    // North: room below. Halves part left/right; room-facing edge points down.
    case 'north':
      return [
        { pivotX: c.x + t, pivotY: c.y, scaleX: s, scaleY: s, rotation: 0, retractSign: 1 },
        { pivotX: c.x - t, pivotY: c.y, scaleX: -s, scaleY: s, rotation: 0, retractSign: -1 },
      ];
    // South: room above. Same left/right split, room-facing edge flipped up.
    case 'south':
      return [
        { pivotX: c.x + t, pivotY: c.y, scaleX: s, scaleY: -s, rotation: 0, retractSign: 1 },
        { pivotX: c.x - t, pivotY: c.y, scaleX: -s, scaleY: -s, rotation: 0, retractSign: -1 },
      ];
    // West: room to the right. Quarter turn clockwise so the seam runs across
    // the doorway and the halves part up/down; room-facing edge points right.
    case 'west':
      return [
        { pivotX: c.x, pivotY: c.y + t, scaleX: s, scaleY: -s, rotation: R, retractSign: 1 },
        { pivotX: c.x, pivotY: c.y - t, scaleX: -s, scaleY: -s, rotation: R, retractSign: -1 },
      ];
    // East: room to the left. Quarter turn the other way.
    case 'east':
      return [
        { pivotX: c.x, pivotY: c.y + t, scaleX: -s, scaleY: -s, rotation: -R, retractSign: -1 },
        { pivotX: c.x, pivotY: c.y - t, scaleX: s, scaleY: -s, rotation: -R, retractSign: 1 },
      ];
  }
  throw new Error(`unknown door direction "${String(door.direction)}"`);
}

/**
 * Draws each of the room's real doors (#100: up to eight for a `2x2` room,
 * one per `(cell, wall)` pair with a real neighbour).
 *
 * Kept separate from `createRoomView` because door state changes the instant
 * the last enemy dies — rebuilding a handful of sprites on that is cheap,
 * rebuilding the whole room (floor, walls, blocks) every time it flips is not.
 *
 * `doorState` says which of `open`/`closed`/`locked` each door draws in —
 * `render/view.ts` builds it from the room's lock state and the set of
 * doorways that lead to an unopened key-locked room (`#196`). Without
 * `textures` the whole doorway is a flat coloured band, one state's worth of
 * colour, exactly as before any door art existed.
 */
export function createDoorView(
  room: RoomGeometry,
  doors: readonly CompiledDoor[],
  doorState: (door: CompiledDoor) => DoorState,
  textures?: DoorTextures,
): DoorView {
  const container = new Container();
  const sprites: DoorSprite[] = [];
  const graphics = new Graphics();
  const frame = roomFrameSize(room);
  let usedGraphics = false;

  for (const door of doors) {
    const state = doorState(door);
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
    const texture =
      textures === undefined
        ? null
        : state === 'open'
          ? textures.open
          : // `locked` falls back to `closed` when its art has not been
            // authored (`docs/DECISIONS.md` #19) — never throws mid-transition.
            ((state === 'locked' ? textures.locked : undefined) ?? textures.closed);
    if (texture === null) {
      const colour =
        state === 'open' ? ROOM_HAZARD_PALETTE.doorOpen : ROOM_HAZARD_PALETTE.doorLocked;
      graphics.rect(bandMinX, bandMinY, bandWidth, bandHeight).fill(colour);
      usedGraphics = true;
      continue;
    }
    const baseScale = tileGridScale(texture);
    for (const place of doorHalfPlacements(room, door, baseScale)) {
      const sprite = new Sprite(texture);
      sprite.anchor.set(1, 1);
      sprite.scale.set(place.scaleX, place.scaleY);
      sprite.rotation = place.rotation;
      sprite.position.set(place.pivotX, place.pivotY);
      container.addChild(sprite);
      sprites.push({ sprite, retractSign: place.retractSign, baseScale });
    }
  }

  if (usedGraphics) {
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
