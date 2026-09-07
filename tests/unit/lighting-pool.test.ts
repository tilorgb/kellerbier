import { describe, expect, it } from 'vitest';
import { PointLight, Scene } from 'three';
import { ENEMY_DEFINITIONS } from '../../src/content/enemies/index.js';
import { FLOOR_CONFIGS } from '../../src/content/floors/definition.js';
import { ROOM_TEMPLATES } from '../../src/content/rooms/index.js';
import { Lighting, MAX_DOOR_GLOWS } from '../../src/render/world/lighting.js';
import { MaterialCache } from '../../src/render/world/material-cache.js';
import { Scenery } from '../../src/render/world/scenery.js';
import { generateFloor } from '../../src/sim/room/floor-plan.js';
import { RoomGeometry } from '../../src/sim/room/geometry.js';
import { Rng } from '../../src/sim/rng/rng.js';
import {
  type CompiledDoor,
  ROOM_MARGIN_X,
  ROOM_MARGIN_Y,
  validateRoomTemplate,
} from '../../src/sim/room/template.js';

/**
 * #292's central invariant: the number of `PointLight`s in the scene never
 * changes after boot, because a room-by-room count change is what was
 * invalidating every lit material's compiled shader
 * (`docs/PERFORMANCE_AUDIT.md` F1). This is the "loads a dead-end room, a
 * crossroads, an authored-bulb cellar and a daylight room, and compares
 * counts" test the issue's acceptance criteria ask for, plus the
 * two-live-`Scenery` case the room-transition slide actually produces before
 * #293 removes it.
 */

function countPointLights(scene: Scene): number {
  let count = 0;
  scene.traverse((object) => {
    if (object instanceof PointLight) {
      count += 1;
    }
  });
  return count;
}

function room(width: number, height: number): RoomGeometry {
  return new RoomGeometry(
    ROOM_MARGIN_X,
    ROOM_MARGIN_Y,
    ROOM_MARGIN_X + width,
    ROOM_MARGIN_Y + height,
  );
}

const DEAD_END: readonly CompiledDoor[] = [{ direction: 'north', cellCol: 0, cellRow: 0 }];
const CROSSROADS: readonly CompiledDoor[] = [
  { direction: 'north', cellCol: 0, cellRow: 0 },
  { direction: 'south', cellCol: 0, cellRow: 0 },
  { direction: 'east', cellCol: 0, cellRow: 0 },
  { direction: 'west', cellCol: 0, cellRow: 0 },
];

describe('Lighting/Scenery, a constant point-light count (#292)', () => {
  it('stays constant across a dead-end, a crossroads, an authored-bulb cellar and a daylight room', () => {
    const scene = new Scene();
    const lighting = new Lighting(scene);
    const materials = new MaterialCache();
    const baseline = countPointLights(scene);
    expect(baseline).toBeGreaterThan(0);

    const load = (
      doors: readonly CompiledDoor[],
      props: readonly { readonly x: number; readonly y: number; readonly type: string }[],
      rig: 'cellar' | 'daylight',
    ): void => {
      const scenery = new Scenery(
        room(240, 144),
        1,
        doors,
        props,
        { tileTextures: {} },
        -1,
        lighting,
        materials,
      );
      // As `GameView` does: a `Scenery` disconnected from the scene also
      // disconnects any pooled light it has reparented under its own group
      // (see `Lighting.releaseDoorGlow`'s doc comment) — `scene.traverse`
      // would simply never find it, which is a test-rig bug, not #292's.
      scene.add(scenery.group);
      lighting.onRoomChanged(rig, scenery.frameWidth, scenery.frameHeight, scenery.bulbs);
      expect(countPointLights(scene)).toBe(baseline);
      scenery.dispose();
      expect(countPointLights(scene)).toBe(baseline);
    };

    load(DEAD_END, [], 'cellar');
    load(CROSSROADS, [], 'cellar');
    load(
      DEAD_END,
      [
        { x: 40, y: 40, type: 'bulb' },
        { x: 80, y: 40, type: 'bulb' },
      ],
      'cellar',
    );
    load(CROSSROADS, [], 'daylight');
  });

  it('stays constant with two live Sceneries at once — the room-transition slide, before #293', () => {
    const scene = new Scene();
    const lighting = new Lighting(scene);
    const materials = new MaterialCache();
    const baseline = countPointLights(scene);

    const incoming = new Scenery(
      room(240, 144),
      1,
      CROSSROADS,
      [],
      { tileTextures: {} },
      -1,
      lighting,
      materials,
    );
    scene.add(incoming.group);
    expect(countPointLights(scene)).toBe(baseline);
    const outgoing = new Scenery(
      room(240, 144),
      1,
      DEAD_END,
      [],
      { tileTextures: {} },
      -1,
      lighting,
      materials,
    );
    scene.add(outgoing.group);
    expect(countPointLights(scene)).toBe(baseline);

    incoming.dispose();
    expect(countPointLights(scene)).toBe(baseline);
    outgoing.dispose();
    expect(countPointLights(scene)).toBe(baseline);
  });
});

describe('MAX_DOOR_GLOWS, sized against real content', () => {
  it('covers every door on any single room the floor generator produces', () => {
    const templates = ROOM_TEMPLATES.map((template, index) =>
      validateRoomTemplate(template, `room[${String(index)}]`, ENEMY_DEFINITIONS),
    );
    let maxDoors = 0;
    let sampled = 0;
    for (let seed = 0; seed < 300; seed++) {
      for (let floorIndex = 0; floorIndex < FLOOR_CONFIGS.length; floorIndex++) {
        const config = FLOOR_CONFIGS[floorIndex];
        if (config === undefined) {
          continue;
        }
        let plan;
        try {
          plan = generateFloor(new Rng(seed * 1000 + floorIndex), config, templates);
        } catch {
          continue;
        }
        sampled += 1;
        for (const generatedRoom of plan.rooms) {
          maxDoors = Math.max(maxDoors, generatedRoom.doors.length);
        }
      }
    }
    // Sanity check on the harness itself: this failing means nothing generated.
    expect(sampled).toBeGreaterThan(100);
    // The measured ceiling this pool's doc comment cites — a regression here
    // means either content grew more doors-per-room than the pool assumes,
    // or the generator changed shape. Either way, `MAX_DOOR_GLOWS` needs a
    // second look before this assertion is just raised to match.
    expect(maxDoors).toBeLessThanOrEqual(MAX_DOOR_GLOWS);
  });
});
