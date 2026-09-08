import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Mesh, PointLight, Scene } from 'three';
import { Lighting, SHOT_LIGHT_COUNT } from '../../src/render/world/lighting.js';
import { TICKS_PER_SECOND } from '../../src/sim/time.js';

/**
 * The light rig, headlessly (`render/world/lighting.ts`).
 *
 * Which rig a floor gets, where its bulbs hang and when its cloud crosses are
 * all decided from the tileset, the room and the simulation tick — none of it
 * needs a GPU. The one thing that needs a DOM is the cloud's canvas texture,
 * so the cloud tests stand in a `document` just wide enough to paint it; with
 * none (the bench) `Lighting` skips the cloud and `sync` is a no-op, which is
 * also asserted.
 *
 * `Lighting` now owns a fixed pool of bulb rigs (`docs/PERFORMANCE_AUDIT.md`
 * F1/F7): every one of them is in the scene from the constructor on, and
 * `onRoomChanged` only ever moves and (re)lights them, never adds or removes
 * one. So "how many bulbs does this room have" is asked as "how many point
 * lights are currently *lit*", not "how many are in the scene" — the total
 * never changes; see `tests/unit/lighting-pool.test.ts` for that invariant.
 */

/** The cloud's cycle, as the class comment describes it: across in sixteen seconds, once every fifty. */
const CLOUD_CYCLE_TICKS = TICKS_PER_SECOND * 50;
const CLOUD_CROSS_TICKS = TICKS_PER_SECOND * 16;

function rig(): { scene: Scene; lighting: Lighting } {
  const scene = new Scene();
  return { scene, lighting: new Lighting(scene) };
}

/** Every point light in the scene, including the ones a room hangs. */
function pointLights(scene: Scene): PointLight[] {
  const found: PointLight[] = [];
  scene.traverse((object) => {
    if (object instanceof PointLight) {
      found.push(object);
    }
  });
  return found;
}

/**
 * A room's own bulbs are the lit lights at a bulb rig's own falloff distance
 * (300 — see `buildBulbRig`; the lantern is 120, the shot lights 70, a door
 * glow 60, all distinct). The lantern itself starts lit (`syncLantern` is
 * what turns it off, and this file's rig tests never call it) even though
 * this test file otherwise never touches it, so filtering on distance rather
 * than just "lit" is what keeps it out of the count.
 */
function litBulbCount(scene: Scene): number {
  return pointLights(scene).filter((light) => light.intensity > 0 && light.distance === 300).length;
}

function cloudOf(scene: Scene): Mesh | undefined {
  let cloud: Mesh | undefined;
  scene.traverse((object) => {
    if (object instanceof Mesh && object.castShadow && object.customDepthMaterial !== undefined) {
      cloud = object;
    }
  });
  return cloud;
}

describe('Lighting, choosing a rig for the room', () => {
  it('hangs one bulb per authored bulb in a cellar', () => {
    const { scene, lighting } = rig();
    lighting.onRoomChanged('cellar', 320, 180, [
      { x: 40, y: 40 },
      { x: 120, y: 40 },
      { x: 200, y: 40 },
    ]);
    expect(litBulbCount(scene)).toBe(3);
    const bulbs = pointLights(scene).filter((light) => light.position.x === 120);
    expect(bulbs).toHaveLength(1);
    expect(bulbs[0]?.position.z).toBe(40);
  });

  it('gives a cellar with no authored bulb two by default, because a dark cellar is a black screen', () => {
    const { scene, lighting } = rig();
    lighting.onRoomChanged('cellar', 320, 180, []);
    expect(litBulbCount(scene)).toBe(2);
  });

  it('hangs no bulbs under daylight', () => {
    const { scene, lighting } = rig();
    lighting.onRoomChanged('daylight', 320, 180, [{ x: 40, y: 40 }]);
    expect(litBulbCount(scene)).toBe(0);
  });

  it("replaces the last room's lights rather than adding to them", () => {
    const { scene, lighting } = rig();
    lighting.onRoomChanged('cellar', 320, 180, [{ x: 40, y: 40 }]);
    lighting.onRoomChanged('cellar', 320, 180, [{ x: 80, y: 40 }]);
    expect(litBulbCount(scene)).toBe(1);
    lighting.onRoomChanged('daylight', 320, 180, []);
    expect(litBulbCount(scene)).toBe(0);
  });

  it('paints a different background behind each rig', () => {
    const { lighting } = rig();
    lighting.onRoomChanged('cellar', 320, 180, []);
    const cellar = lighting.backgroundColour;
    lighting.onRoomChanged('daylight', 320, 180, []);
    expect(lighting.backgroundColour).not.toBe(cellar);
  });

  it('has no cloud to drive without a DOM, and says so by doing nothing', () => {
    const { scene, lighting } = rig();
    lighting.onRoomChanged('daylight', 320, 180, []);
    expect(cloudOf(scene)).toBeUndefined();
    expect(() => {
      lighting.sync(0);
      lighting.sync(CLOUD_CROSS_TICKS / 2);
    }).not.toThrow();
  });
});

describe('Lighting, the lantern and the shot lights', () => {
  it('follows Alois and goes out when he is dead', () => {
    const { scene, lighting } = rig();
    lighting.onRoomChanged('cellar', 320, 180, []);
    lighting.syncLantern(100, 120, true);
    const lantern = pointLights(scene).find(
      (light) => light.position.x === 100 && light.position.z === 120,
    );
    expect(lantern).toBeDefined();
    expect(lantern?.intensity).toBeGreaterThan(0);
    lighting.syncLantern(100, 120, false);
    expect(lantern?.intensity).toBe(0);
  });

  it('hands out exactly SHOT_LIGHT_COUNT shot lights and dims the ones past the count used', () => {
    const { lighting } = rig();
    const lights: PointLight[] = [];
    for (let slot = 0; slot < SHOT_LIGHT_COUNT; slot++) {
      const light = lighting.shotLight(slot);
      expect(light).not.toBeNull();
      if (light !== null) {
        light.intensity = 100;
        lights.push(light);
      }
    }
    expect(lighting.shotLight(SHOT_LIGHT_COUNT)).toBeNull();
    lighting.dimShotLightsFrom(3);
    expect(lights.slice(0, 3).map((light) => light.intensity)).toEqual([100, 100, 100]);
    expect(lights.slice(3).every((light) => light.intensity === 0)).toBe(true);
  });
});

describe('Lighting, the daylight cloud', () => {
  /** A `document` just able to paint the cloud's alpha into a canvas. */
  const canvasStub = {
    width: 0,
    height: 0,
    getContext: () => ({
      fillStyle: '',
      filter: 'none',
      createRadialGradient: () => ({ addColorStop: () => undefined }),
      fillRect: () => undefined,
      beginPath: () => undefined,
      arc: () => undefined,
      fill: () => undefined,
    }),
  };
  let hadDocument = false;
  let previousDocument: unknown;

  beforeAll(() => {
    hadDocument = 'document' in globalThis;
    previousDocument = (globalThis as { document?: unknown }).document;
    (globalThis as { document?: unknown }).document = {
      createElement: () => ({ ...canvasStub }),
    };
  });

  afterAll(() => {
    if (hadDocument) {
      (globalThis as { document?: unknown }).document = previousDocument;
    } else {
      delete (globalThis as { document?: unknown }).document;
    }
  });

  function daylight(): { scene: Scene; lighting: Lighting; cloud: Mesh } {
    const { scene, lighting } = rig();
    lighting.onRoomChanged('daylight', 320, 180, []);
    const cloud = cloudOf(scene);
    if (cloud === undefined) {
      throw new Error('a daylight room with a DOM has a cloud');
    }
    return { scene, lighting, cloud };
  }

  it('is a shadow caster above the room, not a decal on it', () => {
    const { cloud } = daylight();
    expect(cloud.castShadow).toBe(true);
    expect(cloud.position.y).toBeGreaterThan(0);
  });

  it('crosses the room from west to east over the first sixteen seconds of each cycle', () => {
    const { lighting, cloud } = daylight();
    lighting.sync(0);
    expect(cloud.visible).toBe(true);
    const start = cloud.position.x;
    lighting.sync(CLOUD_CROSS_TICKS / 2);
    const middle = cloud.position.x;
    lighting.sync(CLOUD_CROSS_TICKS - 1);
    const end = cloud.position.x;
    expect(middle).toBeGreaterThan(start);
    expect(end).toBeGreaterThan(middle);
    // Starts entirely off the west edge and ends off the east one.
    expect(start).toBeLessThan(0);
    expect(end).toBeGreaterThan(320);
  });

  it('is gone for the rest of the cycle and back at the same moment the next time round', () => {
    const { lighting, cloud } = daylight();
    lighting.sync(CLOUD_CROSS_TICKS);
    expect(cloud.visible).toBe(false);
    lighting.sync(CLOUD_CYCLE_TICKS - 1);
    expect(cloud.visible).toBe(false);
    // A pure function of the tick, so a replay clouds over at the same moment.
    lighting.sync(CLOUD_CYCLE_TICKS + 10);
    lighting.sync(10);
    const first = cloud.position.x;
    lighting.sync(CLOUD_CYCLE_TICKS + 10);
    expect(cloud.visible).toBe(true);
    expect(cloud.position.x).toBeCloseTo(first);
  });

  it('stays out of the sky under reduced motion', () => {
    const { lighting, cloud } = daylight();
    lighting.setReducedMotion(true);
    lighting.sync(CLOUD_CROSS_TICKS / 2);
    expect(cloud.visible).toBe(false);
  });
});
