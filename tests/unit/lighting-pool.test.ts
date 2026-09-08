import { describe, expect, it } from 'vitest';
import { PointLight, Scene } from 'three';
import { ENEMY_DEFINITIONS } from '../../src/content/enemies/index.js';
import { FLOOR_CONFIGS } from '../../src/content/floors/definition.js';
import { ROOM_TEMPLATES } from '../../src/content/rooms/index.js';
import cellarHall from '../../src/content/rooms/cellar-hall.json';
import cellarShop from '../../src/content/rooms/cellar-shop.json';
import cellarTreasure from '../../src/content/rooms/cellar-treasure.json';
import { Lighting, MAX_DOOR_GLOWS, MAX_PROP_LIGHTS } from '../../src/render/world/lighting.js';
import { MaterialCache } from '../../src/render/world/material-cache.js';
import { Scenery } from '../../src/render/world/scenery.js';
import { GameSim } from '../../src/sim/game/sim.js';
import { createInputFrame } from '../../src/sim/input/frame.js';
import { generateFloor } from '../../src/sim/room/floor-plan.js';
import { RoomGeometry } from '../../src/sim/room/geometry.js';
import { Rng } from '../../src/sim/rng/rng.js';
import {
  type CompiledDoor,
  ROOM_MARGIN_X,
  ROOM_MARGIN_Y,
  validateRoomTemplate,
} from '../../src/sim/room/template.js';
import { buildHeadlessView } from '../bench/scene.js';

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

/**
 * What three.js itself counts into `numPointLights` — the lights it can reach
 * by traversing *visible* objects from the scene root. A light under a hidden
 * group, or in a group that has been detached from the scene, is not in the
 * shader, so `traverse` would overcount exactly the cases that broke.
 */
function countPointLights(scene: Scene): number {
  let count = 0;
  scene.traverseVisible((object) => {
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

describe('Lighting/Scenery, a constant point-light count with rooms cached off screen (#80)', () => {
  function build(
    lighting: Lighting,
    materials: MaterialCache,
    doors: readonly CompiledDoor[],
  ): Scenery {
    return new Scenery(room(240, 144), 1, doors, [], { tileTextures: {} }, -1, lighting, materials);
  }

  it('keeps the count when a room is detached rather than disposed, and its glows go dark', () => {
    const scene = new Scene();
    const lighting = new Lighting(scene);
    const materials = new MaterialCache();
    const baseline = countPointLights(scene);

    const cached = build(lighting, materials, CROSSROADS);
    // Built but not yet on screen: no glow claimed, nothing to light.
    expect(cached.doors.every((door) => door.glowLight === null)).toBe(true);
    cached.attach(scene);
    for (const door of cached.doors) {
      door.setState('open');
    }
    expect(countPointLights(scene)).toBe(baseline);
    const glowsOf = (): PointLight[] =>
      cached.doors.map((door) => {
        const glow = door.glowLight;
        if (glow === null) {
          throw new Error('an on-screen door holds a glow');
        }
        return glow;
      });
    const lit = glowsOf();
    expect(lit.every((glow) => glow.intensity > 0)).toBe(true);
    const before = lit.map((glow) => glow.position.clone());

    // Off screen, the way `SceneryCache` keeps a visited room: the glows go
    // back to the pool, dark, and stay in the scene (so the count holds) —
    // they must not light the room that is actually on screen.
    cached.detach();
    expect(countPointLights(scene)).toBe(baseline);
    expect(cached.doors.every((door) => door.glowLight === null)).toBe(true);
    expect(lit.every((glow) => glow.intensity === 0)).toBe(true);

    // Back on screen — as the outgoing room of a slide, shifted a room east —
    // lit again, and the glows placed where the room now is.
    cached.attach(scene, 300, 0);
    expect(countPointLights(scene)).toBe(baseline);
    glowsOf().forEach((glow, index) => {
      expect(glow.intensity).toBeGreaterThan(0);
      expect(glow.position.x).toBeCloseTo((before[index]?.x ?? 0) + 300);
      expect(glow.position.z).toBeCloseTo(before[index]?.z ?? 0);
    });
    // And a re-attach at the origin puts the room, and its glows, back.
    cached.attach(scene);
    expect(cached.group.position.x).toBe(0);
    glowsOf().forEach((glow, index) => {
      expect(glow.position.x).toBeCloseTo(before[index]?.x ?? 0);
    });
    // Glows are never children of the door: parenting them was the leak.
    for (const door of cached.doors) {
      expect(door.group.children.some((child) => child instanceof PointLight)).toBe(false);
    }
    cached.dispose();
    expect(countPointLights(scene)).toBe(baseline);
    // Everything went back to the pool: a fresh room can claim them all.
    const next = build(lighting, materials, CROSSROADS);
    next.attach(scene);
    expect(next.doors.every((door) => door.glowLight !== null)).toBe(true);
    next.dispose();
  });

  it('hands out prop lights from a fixed, scene-resident pool and degrades to null past it', () => {
    const scene = new Scene();
    const lighting = new Lighting(scene);
    const baseline = countPointLights(scene);
    const claimed: PointLight[] = [];
    for (let i = 0; i < MAX_PROP_LIGHTS; i++) {
      const light = lighting.acquirePropLight();
      expect(light).not.toBeNull();
      if (light !== null) {
        expect(light.parent).toBe(scene);
        expect(light.intensity).toBe(0);
        claimed.push(light);
      }
    }
    expect(new Set(claimed).size).toBe(MAX_PROP_LIGHTS);
    expect(lighting.acquirePropLight()).toBeNull();
    expect(countPointLights(scene)).toBe(baseline);
    const [first] = claimed;
    if (first !== undefined) {
      first.intensity = 600;
      lighting.releasePropLight(first);
      expect(first.intensity).toBe(0);
      expect(lighting.acquirePropLight()).toBe(first);
    }
    expect(countPointLights(scene)).toBe(baseline);
  });
});

describe('GameView, a constant point-light count across real room loads (#80)', () => {
  it('holds across an empty hall, a pedestal room, a shop, a slide and a cached revisit', () => {
    const sim = new GameSim({ roomTemplate: cellarHall, floor: 1, population: 'empty' });
    const view = buildHeadlessView(sim);
    view.sync(0);
    const baseline = countPointLights(view.scene);
    expect(baseline).toBeGreaterThan(0);

    const visit = (template: unknown, direction: 'north' | null): void => {
      sim.loadRoom(template, 1, direction, [], undefined, { col: 0, row: 0 }, false);
      view.sync(0);
      expect(countPointLights(view.scene)).toBe(baseline);
      // A few frames into the room (and, with a direction, into the slide,
      // which holds the outgoing room on screen too).
      for (let i = 0; i < 3; i++) {
        sim.step(createInputFrame());
        view.sync(0);
        expect(countPointLights(view.scene)).toBe(baseline);
      }
    };
    visit(cellarTreasure, 'north');
    expect(sim.activePedestals.length).toBeGreaterThan(0);
    visit(cellarShop, 'north');
    visit(cellarHall, 'north');
    visit(cellarTreasure, null);
    view.destroy();
  });
});

describe('the light pools, sized against real content', () => {
  const templates = ROOM_TEMPLATES.map((template, index) =>
    validateRoomTemplate(template, `room[${String(index)}]`, ENEMY_DEFINITIONS),
  );

  it('MAX_DOOR_GLOWS covers the two rooms a transition slide draws at once', () => {
    let maxDoors = 0;
    let maxAdjacentPair = 0;
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
        const byId = new Map(plan.rooms.map((generatedRoom) => [generatedRoom.id, generatedRoom]));
        for (const generatedRoom of plan.rooms) {
          maxDoors = Math.max(maxDoors, generatedRoom.doors.length);
          // A glow is claimed while a room is on screen, and the slide has two
          // rooms on screen: the one just left and the one just entered. The
          // pool has to cover the worst such neighbouring pair, not the worst
          // single room.
          for (const door of generatedRoom.doors) {
            const neighbour = byId.get(door.neighborRoomId);
            if (neighbour !== undefined) {
              maxAdjacentPair = Math.max(
                maxAdjacentPair,
                generatedRoom.doors.length + neighbour.doors.length,
              );
            }
          }
        }
      }
    }
    // Sanity check on the harness itself: this failing means nothing generated.
    expect(sampled).toBeGreaterThan(100);
    // The measured ceilings the pool's doc comment cites (5 and 9 today). A
    // regression here means either content grew more doors-per-room than the
    // pool assumes, or the generator changed shape. Either way,
    // `MAX_DOOR_GLOWS` needs a second look before this assertion is just
    // raised to match.
    expect(maxDoors).toBeLessThanOrEqual(MAX_DOOR_GLOWS);
    expect(maxAdjacentPair).toBeLessThanOrEqual(MAX_DOOR_GLOWS);
  });

  it('MAX_PROP_LIGHTS covers the most pedestals any room template places, plus the machine', () => {
    let maxPedestals = 0;
    for (const template of templates) {
      const props = (template as { decorativeProps?: readonly { type: string }[] }).decorativeProps;
      maxPedestals = Math.max(
        maxPedestals,
        (props ?? []).filter((prop) => prop.type === 'pedestal').length,
      );
    }
    expect(maxPedestals).toBeGreaterThan(0);
    // One machine per floor (`GameSim.activeMachine`) on top of the pedestals.
    expect(maxPedestals + 1).toBeLessThanOrEqual(MAX_PROP_LIGHTS);
  });
});
