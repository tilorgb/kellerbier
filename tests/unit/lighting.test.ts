import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DirectionalLight, Mesh, type MeshBasicMaterial, PointLight, Scene } from 'three';
import {
  CLOUD_CROSS_TICKS,
  CLOUD_CYCLES,
  crossingOf,
  Lighting,
  SHOT_LIGHT_COUNT,
} from '../../src/render/world/lighting.js';
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

function cloudsOf(scene: Scene): Mesh[] {
  const clouds: Mesh[] = [];
  scene.traverse((object) => {
    if (object instanceof Mesh && object.castShadow && object.customDepthMaterial !== undefined) {
      clouds.push(object as Mesh);
    }
  });
  return clouds;
}

/** The key light — the sun under daylight — whose ray carries a cloud's shadow down to the floor. */
function keyOf(scene: Scene): DirectionalLight {
  let key: DirectionalLight | undefined;
  scene.traverse((object) => {
    if (object instanceof DirectionalLight && object.castShadow) {
      key = object;
    }
  });
  if (key === undefined) {
    throw new Error('no key light');
  }
  return key;
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
    expect(cloudsOf(scene)).toHaveLength(0);
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

  function daylight(): { scene: Scene; lighting: Lighting; clouds: Mesh[] } {
    const { scene, lighting } = rig();
    lighting.onRoomChanged('daylight', 320, 180, []);
    const clouds = cloudsOf(scene);
    if (clouds.length !== CLOUD_CYCLES.length) {
      throw new Error('a daylight room with a DOM has one cloud per cycle');
    }
    return { scene, lighting, clouds };
  }

  /** The first tick of cloud `i`'s `n`th crossing. */
  function crossingStart(i: number, n: number): number {
    const cycle = CLOUD_CYCLES[i];
    if (cycle === undefined) {
      throw new Error(`no cloud ${String(i)}`);
    }
    return cycle.offsetTicks + (n - 1) * cycle.cycleTicks;
  }

  /**
   * Where cloud `cloud`'s shadow centre lands on the floor — the plane pushed
   * along the key light's ray down to y = 0.
   */
  function shadowOf(scene: Scene, cloud: Mesh): { x: number; z: number } {
    const light = keyOf(scene);
    const key = light.position;
    const target = light.target.position;
    const drop = cloud.position.y / (key.y - target.y);
    return {
      x: cloud.position.x + (target.x - key.x) * drop,
      z: cloud.position.z + (target.z - key.z) * drop,
    };
  }

  it('are shadow casters above the room, not decals on it', () => {
    const { clouds } = daylight();
    for (const cloud of clouds) {
      expect(cloud.castShadow).toBe(true);
      expect(cloud.position.y).toBeGreaterThan(0);
    }
  });

  it('cut their shadow on the silhouette, not the plane — the alpha test is on the mesh material three.js reads it from', () => {
    // WebGLShadowMap copies `material.alphaTest` over the custom depth
    // material's own; 0 there is what made the cloud's shadow a square box.
    const { clouds } = daylight();
    for (const cloud of clouds) {
      expect((cloud.material as MeshBasicMaterial).alphaTest).toBeGreaterThan(0);
      expect(cloud.customDepthMaterial?.alphaTest).toBeGreaterThan(0);
    }
  });

  it('cross the room from west to east, shadow entering off the west edge and leaving off the east', () => {
    const { scene, lighting, clouds } = daylight();
    const cloud = clouds[0];
    if (cloud === undefined) {
      throw new Error('no cloud');
    }
    const start = crossingStart(0, 1);
    lighting.sync(start);
    expect(cloud.visible).toBe(true);
    const first = shadowOf(scene, cloud).x;
    lighting.sync(start + CLOUD_CROSS_TICKS / 2);
    const middle = shadowOf(scene, cloud).x;
    lighting.sync(start + CLOUD_CROSS_TICKS - 1);
    const end = shadowOf(scene, cloud).x;
    expect(middle).toBeGreaterThan(first);
    expect(end).toBeGreaterThan(middle);
    expect(first).toBeLessThan(0);
    expect(end).toBeGreaterThan(320);
  });

  it('are gone between crossings and back at the same moment, in the same place, the next time the tick comes round', () => {
    const { lighting, clouds } = daylight();
    const cloud = clouds[0];
    const cycle = CLOUD_CYCLES[0];
    if (cloud === undefined || cycle === undefined) {
      throw new Error('no cloud');
    }
    lighting.sync(crossingStart(0, 1) + CLOUD_CROSS_TICKS);
    expect(cloud.visible).toBe(false);
    lighting.sync(crossingStart(0, 2) - 1);
    expect(cloud.visible).toBe(false);
    // A pure function of the tick, so a replay clouds over at the same moment and lane.
    const tick = crossingStart(0, 3) + 10;
    lighting.sync(tick);
    const first = { x: cloud.position.x, z: cloud.position.z };
    lighting.sync(tick + 1000);
    lighting.sync(tick);
    expect(cloud.visible).toBe(true);
    expect(cloud.position.x).toBeCloseTo(first.x);
    expect(cloud.position.z).toBeCloseTo(first.z);
  });

  it('throw their shadow on lanes across the whole room, not only its northern half', () => {
    const { scene, lighting, clouds } = daylight();
    const lanes: number[] = [];
    for (let i = 0; i < clouds.length; i++) {
      const cloud = clouds[i];
      if (cloud === undefined) {
        continue;
      }
      for (let n = 1; n <= 20; n++) {
        lighting.sync(crossingStart(i, n) + CLOUD_CROSS_TICKS / 2);
        lanes.push(shadowOf(scene, cloud).z);
      }
    }
    expect(Math.min(...lanes)).toBeLessThan(180 * 0.3);
    expect(Math.max(...lanes)).toBeGreaterThan(180 * 0.7);
    for (const z of lanes) {
      expect(z).toBeGreaterThan(0);
      expect(z).toBeLessThan(180);
    }
  });

  it('vary shape and size crossing to crossing, deterministically', () => {
    const crossings = Array.from({ length: 30 }, (_, n) => crossingOf(0, n));
    expect(new Set(crossings.map((c) => c.silhouette)).size).toBeGreaterThan(1);
    expect(new Set(crossings.map((c) => c.scale)).size).toBeGreaterThan(1);
    expect(crossingOf(1, 7)).toEqual(crossingOf(1, 7));
    for (const c of crossings) {
      expect(c.scale).toBeGreaterThanOrEqual(0.8);
      expect(c.scale).toBeLessThanOrEqual(1.2);
    }
  });

  it('sometimes overlap — the two cycles drift in and out of step', () => {
    const { lighting, clouds } = daylight();
    let both = 0;
    for (let tick = 0; tick < TICKS_PER_SECOND * 600; tick += TICKS_PER_SECOND) {
      lighting.sync(tick);
      if (clouds.every((cloud) => cloud.visible)) {
        both++;
      }
    }
    expect(both).toBeGreaterThan(0);
  });

  it('stay out of the sky under reduced motion', () => {
    const { lighting, clouds } = daylight();
    lighting.setReducedMotion(true);
    lighting.sync(crossingStart(0, 1) + CLOUD_CROSS_TICKS / 2);
    for (const cloud of clouds) {
      expect(cloud.visible).toBe(false);
    }
    expect(lighting.cloudMoving).toBe(false);
  });
});
