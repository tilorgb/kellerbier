import { describe, expect, it } from 'vitest';
import { Scene } from 'three';
import { RoomGeometry } from '../../src/sim/room/geometry.js';
import { ROOM_MARGIN_X, ROOM_MARGIN_Y } from '../../src/sim/room/template.js';
import { Lighting } from '../../src/render/world/lighting.js';
import { MaterialCache } from '../../src/render/world/material-cache.js';
import { SCENERY_CACHE_CAPACITY, SceneryCache } from '../../src/render/world/scenery-cache.js';
import { Scenery } from '../../src/render/world/scenery.js';

/**
 * `SceneryCache` (#293) — the mechanism that gets `GameView` to "zero
 * geometries or materials constructed by a crossing between visited rooms"
 * without the deeper billboard/door pooling the issue's own text sketches:
 * a whole `Scenery`, cached wholesale by `GameSim.roomId`, handed back
 * unchanged on a hit and evicted-and-disposed (never leaked) beyond
 * `SCENERY_CACHE_CAPACITY`.
 */

function room(): RoomGeometry {
  return new RoomGeometry(ROOM_MARGIN_X, ROOM_MARGIN_Y, ROOM_MARGIN_X + 240, ROOM_MARGIN_Y + 144);
}

function buildScenery(): Scenery {
  const lighting = new Lighting(new Scene());
  return new Scenery(room(), 1, [], [], { tileTextures: {} }, -1, lighting, new MaterialCache());
}

/** A `Scenery` that records whether it was disposed, standing in for a real one where only that matters. */
function trackedScenery(): { scenery: Scenery; disposed: () => boolean } {
  const scenery = buildScenery();
  const original = scenery.dispose.bind(scenery);
  let disposedFlag = false;
  scenery.dispose = () => {
    disposedFlag = true;
    original();
  };
  return { scenery, disposed: () => disposedFlag };
}

describe('SceneryCache', () => {
  it('hands back the exact same Scenery on a hit, unmodified', () => {
    const cache = new SceneryCache();
    const scenery = buildScenery();
    cache.set('room-a', scenery);
    expect(cache.get('room-a')).toBe(scenery);
    expect(cache.get('room-a')).toBe(scenery);
  });

  it('misses for a room id never registered', () => {
    const cache = new SceneryCache();
    expect(cache.get('nowhere')).toBeUndefined();
  });

  it('evicts and disposes the least-recently-used room once over capacity', () => {
    const cache = new SceneryCache();
    const tracked = Array.from({ length: SCENERY_CACHE_CAPACITY + 1 }, () => trackedScenery());
    tracked.forEach((entry, i) => {
      cache.set(`room-${String(i)}`, entry.scenery);
    });

    // The very first one registered is the least-recently-used once capacity
    // is exceeded, since nothing re-`get`s it in between.
    expect(tracked[0]?.disposed()).toBe(true);
    expect(cache.get('room-0')).toBeUndefined();
    // Every other one is still live and undisposed.
    for (let i = 1; i < tracked.length; i++) {
      expect(tracked[i]?.disposed()).toBe(false);
      expect(cache.get(`room-${String(i)}`)).toBe(tracked[i]?.scenery);
    }
  });

  it('touching a room with get() protects it from eviction a plain insert order would not', () => {
    const cache = new SceneryCache();
    const tracked = Array.from({ length: SCENERY_CACHE_CAPACITY }, () => trackedScenery());
    tracked.forEach((entry, i) => {
      cache.set(`room-${String(i)}`, entry.scenery);
    });

    // Touch the oldest one, making it the *most* recently used instead.
    cache.get('room-0');

    // One more insert should now evict room-1 (the new least-recently-used),
    // not room-0.
    const extra = trackedScenery();
    cache.set('room-extra', extra.scenery);

    expect(tracked[0]?.disposed()).toBe(false);
    expect(tracked[1]?.disposed()).toBe(true);
  });

  it('forget disposes and drops one entry without touching the rest', () => {
    const cache = new SceneryCache();
    const a = trackedScenery();
    const b = trackedScenery();
    cache.set('room-a', a.scenery);
    cache.set('room-b', b.scenery);

    cache.forget('room-a');

    expect(a.disposed()).toBe(true);
    expect(cache.get('room-a')).toBeUndefined();
    expect(b.disposed()).toBe(false);
    expect(cache.get('room-b')).toBe(b.scenery);
  });

  it('forgetting a room never registered is a no-op', () => {
    const cache = new SceneryCache();
    expect(() => {
      cache.forget('never-there');
    }).not.toThrow();
  });

  it('clear disposes and drops every entry', () => {
    const cache = new SceneryCache();
    const entries = [trackedScenery(), trackedScenery(), trackedScenery()];
    entries.forEach((entry, i) => {
      cache.set(`room-${String(i)}`, entry.scenery);
    });

    cache.clear();

    for (const entry of entries) {
      expect(entry.disposed()).toBe(true);
    }
    expect(cache.get('room-0')).toBeUndefined();
  });
});
