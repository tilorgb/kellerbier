import { describe, expect, it } from 'vitest';
import { BoxGeometry, type Group, Mesh, type PointLight, Raycaster, Scene, Vector3 } from 'three';
import { ROOM_TILE_UNITS } from '../../src/content/rooms/definition.js';
import { RoomGeometry } from '../../src/sim/room/geometry.js';
import {
  type CompiledDoor,
  ROOM_MARGIN_X,
  ROOM_MARGIN_Y,
  doorCentre,
} from '../../src/sim/room/template.js';
import { Lighting } from '../../src/render/world/lighting.js';
import { MaterialCache } from '../../src/render/world/material-cache.js';
import { type DoorPiece, Scenery } from '../../src/render/world/scenery.js';

/**
 * A doorway is a real gap in the wall run with a hinged door in a frame: shut
 * while the room's enemies are up, swinging outward once it is cleared, with
 * the next room's glow through the passage — and a padlock when it is
 * key-locked. The boss room's door is a double door.
 */
const NORTH: CompiledDoor = { direction: 'north', cellCol: 0, cellRow: 0 };
const WEST: CompiledDoor = { direction: 'west', cellCol: 0, cellRow: 0 };

function room(): RoomGeometry {
  return new RoomGeometry(ROOM_MARGIN_X, ROOM_MARGIN_Y, ROOM_MARGIN_X + 240, ROOM_MARGIN_Y + 144);
}

function build(doors: readonly CompiledDoor[]): Scenery {
  const scene = new Scene();
  const lighting = new Lighting(scene);
  const scenery = new Scenery(
    room(),
    1,
    doors,
    [],
    { tileTextures: {} },
    -1,
    lighting,
    new MaterialCache(),
  );
  // On screen, the way `GameView` puts a room there — a detached room's
  // glows are deliberately dark (`DoorPiece.setLive`).
  scenery.attach(scene);
  return scenery;
}

/** The one door a single-door room has — thrown, not asserted, so the test reads straight. */
function firstDoor(scenery: Scenery): DoorPiece {
  const [piece] = scenery.doors;
  if (piece === undefined) {
    throw new Error('expected the room to have a door');
  }
  return piece;
}

function glowOf(piece: DoorPiece): PointLight {
  const glow = piece.glowLight;
  if (glow === null) {
    throw new Error('a DoorPiece has a glow behind it');
  }
  return glow;
}

/**
 * The room's merged wall/void meshes (#293) — direct children of `group`,
 * shadow-casting, unlike the floor/base planes (no `castShadow`) or a
 * `DoorPiece`'s own architecture (nested under its own group, not `group`
 * directly). `room()` below has no blocks/hazards/props, so nothing else
 * direct-child-of-`group` casts a shadow either.
 */
function wallMeshes(scenery: Scenery): Mesh[] {
  return scenery.group.children.filter(
    (child): child is Mesh => child instanceof Mesh && child.castShadow,
  );
}

/** Whether a vertical ray through `(x, z)` hits any merged wall/void mesh — `true` means solid wall there. */
function wallSolidAt(scenery: Scenery, x: number, z: number): boolean {
  const raycaster = new Raycaster(new Vector3(x, 200, z), new Vector3(0, -1, 0), 0, 400);
  return raycaster.intersectObjects(wallMeshes(scenery), false).length > 0;
}

describe('doorways in the wall', () => {
  it('builds one door piece per door, facing its wall', () => {
    const scenery = build([NORTH, WEST]);
    expect(scenery.doors).toHaveLength(2);
    const north = scenery.doors.find((piece) => piece.door.direction === 'north');
    const west = scenery.doors.find((piece) => piece.door.direction === 'west');
    if (north === undefined || west === undefined) {
      throw new Error('expected a north and a west door piece');
    }
    const northCentre = doorCentre(room(), NORTH);
    const westCentre = doorCentre(room(), WEST);
    expect(north.group.position.x).toBeCloseTo(northCentre.x);
    expect(west.group.position.z).toBeCloseTo(westCentre.y);
    // A west door is the north door turned to face west.
    expect(west.group.rotation.y).toBeCloseTo(Math.PI / 2);
  });

  it('leaves the gap in the wall run', () => {
    const scenery = build([NORTH]);
    const centre = doorCentre(room(), NORTH);
    const northWallZ = room().minY - ROOM_TILE_UNITS / 2;
    // Dead centre of the doorway: no wall there.
    expect(wallSolidAt(scenery, centre.x, northWallZ)).toBe(false);
    // Just past the doorway's span, still well inside the wall run (the
    // 240-wide room's north wall spans the whole width): solid either side.
    const half = (scenery.doors[0]?.door.span ?? 24) / 2 + ROOM_TILE_UNITS / 2;
    expect(wallSolidAt(scenery, centre.x - half, northWallZ)).toBe(true);
    expect(wallSolidAt(scenery, centre.x + half, northWallZ)).toBe(true);
  });

  it('starts shut, dark, with one leaf on one hinge', () => {
    const piece = firstDoor(build([NORTH]));
    expect(piece.currentState).toBe('closed');
    expect(piece.openness).toBe(0);
    expect(piece.hinges).toHaveLength(1);
    expect(piece.isDouble).toBe(false);
    expect(glowOf(piece).intensity).toBe(0);
  });

  it('swings outward when open and lights the passage; shuts again when closed or locked', () => {
    const piece = firstDoor(build([NORTH]));
    piece.setState('open');
    expect(piece.openness).toBe(1);
    // Outward is local -z; a positive turn about the vertical takes the leaf there.
    expect(piece.hinges[0]?.rotation.y ?? 0).toBeGreaterThan(1);
    expect(glowOf(piece).intensity).toBeGreaterThan(0);

    piece.setState('closed');
    expect(piece.openness).toBe(0);
    expect(piece.hinges[0]?.rotation.y ?? 1).toBe(0);
    expect(glowOf(piece).intensity).toBe(0);

    piece.setState('locked');
    expect(piece.currentState).toBe('locked');
    expect(piece.openness).toBe(0);
    expect(glowOf(piece).intensity).toBe(0);
  });

  it('can be set part-way open, for the swing', () => {
    const piece = firstDoor(build([NORTH]));
    piece.setState('open');
    piece.setOpenness(0.5);
    expect(piece.openness).toBe(0.5);
    const half = piece.hinges[0]?.rotation.y ?? 0;
    piece.setOpenness(1);
    expect(piece.hinges[0]?.rotation.y ?? 0).toBeCloseTo(half * 2);
    piece.setOpenness(2);
    expect(piece.openness).toBe(1);
  });

  it('shows a padlock only while key-locked', () => {
    const piece = firstDoor(build([NORTH]));
    const lockVisible = (): boolean => {
      let visible = false;
      piece.group.traverse((object) => {
        if (object instanceof Mesh && object.visible && object.geometry instanceof BoxGeometry) {
          const mesh = object as Mesh<BoxGeometry>;
          if (mesh.geometry.parameters.width === 2 && mesh.geometry.parameters.depth === 1.2) {
            visible = true;
          }
        }
      });
      return visible;
    };
    expect(lockVisible()).toBe(false);
    piece.setState('locked');
    expect(lockVisible()).toBe(true);
    piece.setState('open');
    expect(lockVisible()).toBe(false);
  });

  it("makes the boss room's door a double door, both leaves swinging outward", () => {
    const piece = firstDoor(build([NORTH]));
    piece.setState('open');
    piece.setDouble(true);
    expect(piece.isDouble).toBe(true);
    expect(piece.hinges).toHaveLength(2);
    expect(piece.currentState).toBe('open');
    expect(piece.openness).toBe(1);
    const [left, right] = piece.hinges as [Group, Group];
    expect(left.position.x).toBeLessThan(0);
    expect(right.position.x).toBeGreaterThan(0);
    expect(Math.sign(left.rotation.y)).toBe(-Math.sign(right.rotation.y));
    piece.setDouble(false);
    expect(piece.hinges).toHaveLength(1);
  });

  it("pulses the open door's glow and leaves a shut one dark", () => {
    const piece = firstDoor(build([NORTH]));
    piece.setState('open');
    const resting = glowOf(piece).intensity;
    piece.setPulse(1);
    expect(glowOf(piece).intensity).toBeGreaterThan(resting);
    piece.setState('closed');
    piece.setPulse(1);
    expect(glowOf(piece).intensity).toBe(0);
  });
});
