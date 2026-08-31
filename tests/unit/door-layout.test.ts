import { describe, expect, it } from 'vitest';
import { Texture } from 'pixi.js';
import { RoomGeometry } from '../../src/sim/room/geometry.js';
import {
  ROOM_MARGIN_X,
  ROOM_MARGIN_Y,
  doorCentre,
  type CompiledDoor,
} from '../../src/sim/room/template.js';
import { createDoorView, doorHalfPlacements } from '../../src/render/room.js';

/**
 * A room shaped like a real compiled `1x1` room — `ROOM_MARGIN_X`/`_Y` (40
 * and 18) around a 240x144 interior — rather than `bareRoom()`'s zero-margin
 * rectangle other unit tests use for gameplay.
 */
function marginedRoom(): RoomGeometry {
  return new RoomGeometry(ROOM_MARGIN_X, ROOM_MARGIN_Y, ROOM_MARGIN_X + 240, ROOM_MARGIN_Y + 144);
}

const textures = { open: Texture.WHITE, closed: Texture.WHITE };
const S = 16; // tileGridScale(Texture.WHITE) — 16 / 1

describe('render/room: doorHalfPlacements', () => {
  it('splits a north door into two halves that meet at the doorway centre and part sideways', () => {
    const room = marginedRoom();
    const north: CompiledDoor = { direction: 'north', cellCol: 0, cellRow: 0 };
    const c = doorCentre(room, north);
    const [right, left] = doorHalfPlacements(room, north, S);

    // Both pivots sit on the wall/floor seam line (y = centre.y), one tile out
    // to each side — the outer edge each half retracts toward.
    expect(right.pivotY).toBe(c.y);
    expect(left.pivotY).toBe(c.y);
    expect(right.pivotX).toBe(c.x + 16);
    expect(left.pivotX).toBe(c.x - 16);

    // No rotation for a north/south door; the left half is the mirror.
    expect(right.rotation).toBe(0);
    expect(left.rotation).toBe(0);
    expect(right.scaleX).toBe(S);
    expect(left.scaleX).toBe(-S);
    expect(right.retractSign).toBe(1);
    expect(left.retractSign).toBe(-1);

    // Room is below a north door, so the room-facing edge points down — no flip.
    expect(right.scaleY).toBe(S);
    expect(left.scaleY).toBe(S);
  });

  it('flips a south door vertically so its room-facing edge points up', () => {
    const room = marginedRoom();
    const south: CompiledDoor = { direction: 'south', cellCol: 0, cellRow: 0 };
    const [right, left] = doorHalfPlacements(room, south, S);
    expect(right.rotation).toBe(0);
    expect(right.scaleY).toBe(-S);
    expect(left.scaleY).toBe(-S);
  });

  it('quarter-turns a west door so the seam runs across it and the halves part up/down', () => {
    const room = marginedRoom();
    const west: CompiledDoor = { direction: 'west', cellCol: 0, cellRow: 0 };
    const c = doorCentre(room, west);
    const [a, b] = doorHalfPlacements(room, west, S);
    expect(a.rotation).toBeCloseTo(Math.PI / 2);
    expect(b.rotation).toBeCloseTo(Math.PI / 2);
    // Pivots one tile above / below the doorway centre — the up/down split.
    expect(a.pivotX).toBe(c.x);
    expect(b.pivotX).toBe(c.x);
    expect(a.pivotY).toBe(c.y + 16);
    expect(b.pivotY).toBe(c.y - 16);
    expect(a.retractSign).toBe(1);
    expect(b.retractSign).toBe(-1);
  });

  it('turns an east door the other way from a west one', () => {
    const room = marginedRoom();
    const [a] = doorHalfPlacements(room, { direction: 'east', cellCol: 0, cellRow: 0 }, S);
    expect(a.rotation).toBeCloseTo(-Math.PI / 2);
    expect(a.retractSign).toBe(-1);
  });
});

describe('render/room: createDoorView', () => {
  it('draws two half sprites per doorway, anchored at their outer edge', () => {
    const room = marginedRoom();
    const view = createDoorView(
      room,
      [{ direction: 'north', cellCol: 0, cellRow: 0 }],
      () => 'closed',
      textures,
    );
    expect(view.sprites).toHaveLength(2);
    for (const { sprite } of view.sprites) {
      expect(sprite.anchor.x).toBe(1);
      expect(sprite.anchor.y).toBe(1);
    }
    expect(view.sprites.map((s) => s.retractSign).sort()).toEqual([-1, 1]);
  });

  it('falls the flat-colour band back when no textures are supplied', () => {
    const room = marginedRoom();
    const view = createDoorView(
      room,
      [{ direction: 'north', cellCol: 0, cellRow: 0 }],
      () => 'open',
    );
    expect(view.sprites).toHaveLength(0);
    expect(view.container.children.length).toBe(1);
  });

  it('uses the locked texture for a door reported locked, and falls it back to closed when absent', () => {
    const room = marginedRoom();
    const lockedTex = new Texture(Texture.WHITE);
    const withLocked = createDoorView(
      room,
      [{ direction: 'north', cellCol: 0, cellRow: 0 }],
      () => 'locked',
      { open: Texture.WHITE, closed: Texture.WHITE, locked: lockedTex },
    );
    expect(withLocked.sprites[0]?.sprite.texture).toBe(lockedTex);

    const closedTex = new Texture(Texture.WHITE);
    const withoutLocked = createDoorView(
      room,
      [{ direction: 'north', cellCol: 0, cellRow: 0 }],
      () => 'locked',
      { open: Texture.WHITE, closed: closedTex },
    );
    expect(withoutLocked.sprites[0]?.sprite.texture).toBe(closedTex);
  });
});
