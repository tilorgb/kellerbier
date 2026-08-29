import { describe, expect, it } from 'vitest';
import { Texture } from 'pixi.js';
import { RoomGeometry } from '../../src/sim/room/geometry.js';
import { ROOM_MARGIN_X, ROOM_MARGIN_Y, type CompiledDoor } from '../../src/sim/room/template.js';
import { createDoorView } from '../../src/render/room.js';

/**
 * A room shaped like a real compiled `1x1` room — `ROOM_MARGIN_X`/`_Y` (40
 * and 18) around a 240x144 interior — rather than `bareRoom()`'s zero-margin
 * rectangle other unit tests use for gameplay. The margin's asymmetry is
 * exactly what #4's bug depended on, so a test has to reproduce it to catch
 * a regression.
 */
function marginedRoom(): RoomGeometry {
  return new RoomGeometry(ROOM_MARGIN_X, ROOM_MARGIN_Y, ROOM_MARGIN_X + 240, ROOM_MARGIN_Y + 144);
}

const textures = { open: Texture.WHITE, closed: Texture.WHITE };

describe('render/room: createDoorView wall alignment', () => {
  it('sits a west door flush against the interior wall face, not centred in the whole margin', () => {
    const room = marginedRoom();
    const west: CompiledDoor = { direction: 'west', cellCol: 0, cellRow: 0 };
    const view = createDoorView(room, [west], false, textures);
    expect(view.sprites).toHaveLength(2);
    // Centred on `room.minX` (the wall/floor seam), extending one tile's
    // width into the wall — not the midpoint of the 40-unit margin band
    // (which the old formula produced: x = 20).
    for (const { sprite, horizontal } of view.sprites) {
      expect(horizontal).toBe(false);
      expect(sprite.position.x).toBe(room.minX - 8);
    }
  });

  it('sits an east door flush against the interior wall face, mirrored the same way', () => {
    const room = marginedRoom();
    const east: CompiledDoor = { direction: 'east', cellCol: 0, cellRow: 0 };
    const view = createDoorView(room, [east], false, textures);
    expect(view.sprites).toHaveLength(2);
    for (const { sprite, horizontal } of view.sprites) {
      expect(horizontal).toBe(false);
      expect(sprite.position.x).toBe(room.maxX + 8);
    }
  });

  it('leaves a north door where it already read correctly, close to the (much thinner) margin', () => {
    const room = marginedRoom();
    const north: CompiledDoor = { direction: 'north', cellCol: 0, cellRow: 0 };
    const view = createDoorView(room, [north], false, textures);
    expect(view.sprites).toHaveLength(2);
    for (const { sprite, horizontal } of view.sprites) {
      expect(horizontal).toBe(true);
      expect(sprite.position.y).toBe(room.minY - 8);
    }
  });
});
