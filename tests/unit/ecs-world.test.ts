import { describe, expect, it } from 'vitest';
import {
  type Entity,
  MAX_GENERATION,
  NULL_ENTITY,
  entityGeneration,
  entityIndex,
  packEntity,
} from '../../src/sim/ecs/entity.js';
import { World } from '../../src/sim/ecs/world.js';

describe('World lifecycle', () => {
  it('does not show a new entity to iteration until the next flush', () => {
    const world = new World({ capacity: 8 });
    const entity = world.create();

    expect(world.isAlive(entity)).toBe(true);
    expect(world.count).toBe(0);
    expect(world.pendingSpawns).toBe(1);

    world.flush();
    expect(world.count).toBe(1);
    expect(world.pendingSpawns).toBe(0);
  });

  it('removes a destroyed entity from iteration immediately', () => {
    const world = new World({ capacity: 8 });
    const entity = world.create();
    world.flush();

    expect(world.destroy(entity)).toBe(true);
    // Gone from iteration in the same tick, so later systems skip it...
    expect(world.count).toBe(0);
    expect(world.isAlive(entity)).toBe(false);
    // ...but the slot is not recycled until the tick boundary.
    expect(world.pendingDestroys).toBe(1);
  });

  it('refuses to destroy the same entity twice', () => {
    const world = new World({ capacity: 8 });
    const entity = world.create();
    world.flush();

    expect(world.destroy(entity)).toBe(true);
    expect(world.destroy(entity)).toBe(false);
    world.flush();
    expect(world.destroy(entity)).toBe(false);
  });

  it('handles an entity created and destroyed within one tick', () => {
    const world = new World({ capacity: 8 });
    const entity = world.create();
    expect(world.destroy(entity)).toBe(true);

    world.flush();
    expect(world.count).toBe(0);
    expect(world.isAlive(entity)).toBe(false);

    // The slot is free and reusable, with a fresh generation.
    const reused = world.create();
    expect(entityIndex(reused)).toBe(entityIndex(entity));
    expect(reused).not.toBe(entity);
  });

  it('recycles slots rather than growing when entities die', () => {
    const world = new World({ capacity: 64 });
    const firstBatch: Entity[] = [];
    for (let i = 0; i < 32; i++) {
      firstBatch.push(world.create());
    }
    world.flush();
    expect(world.highWater).toBe(32);

    for (const entity of firstBatch) {
      world.destroy(entity);
    }
    world.flush();
    expect(world.count).toBe(0);

    // The second batch draws from the free list, so the high-water mark holds
    // and no new memory is touched.
    const secondSlots = new Set<number>();
    for (let i = 0; i < 32; i++) {
      secondSlots.add(entityIndex(world.create()));
    }
    world.flush();

    expect(world.highWater).toBe(32);
    expect(secondSlots).toEqual(new Set(firstBatch.map(entityIndex)));
    expect(world.growths).toBe(0);
  });
});

describe('World stale handles', () => {
  it('rejects a handle to a recycled slot instead of misreading it', () => {
    const world = new World({ capacity: 4 });
    const position = world.defineComponent('position', Float32Array, 2);

    const first = world.create();
    world.add(first, position);
    world.flush();
    position.data[entityIndex(first) * 2] = 123;

    world.destroy(first);
    world.flush();

    const second = world.create();
    world.flush();

    // The successor occupies the same slot — this is precisely the case a
    // bare index would get silently wrong.
    expect(entityIndex(second)).toBe(entityIndex(first));
    expect(entityGeneration(second)).not.toBe(entityGeneration(first));

    expect(world.isAlive(first)).toBe(false);
    expect(world.isAlive(second)).toBe(true);
    expect(() => world.indexOf(first)).toThrow(/stale or dead/);
    expect(world.indexOf(second)).toBe(entityIndex(first));
  });

  it('reports a never-created handle as dead', () => {
    const world = new World({ capacity: 4 });
    expect(world.isAlive(NULL_ENTITY)).toBe(false);
    expect(world.isAlive(packEntity(0, 1))).toBe(false);
    expect(world.isAlive(packEntity(999, 3))).toBe(false);
  });

  it('survives generation wraparound without ever minting generation 0', () => {
    const world = new World({ capacity: 1 });
    let latest = world.create();
    world.flush();

    // One full cycle of the 12-bit generation field, and then some.
    for (let cycle = 0; cycle < MAX_GENERATION + 50; cycle++) {
      world.destroy(latest);
      world.flush();
      latest = world.create();
      world.flush();

      expect(entityIndex(latest)).toBe(0);
      expect(entityGeneration(latest)).toBeGreaterThanOrEqual(1);
      expect(entityGeneration(latest)).toBeLessThanOrEqual(MAX_GENERATION);
      expect(world.isAlive(latest)).toBe(true);
    }
    expect(world.growths).toBe(0);
  });
});

describe('World components', () => {
  it('tracks attachment with a mask', () => {
    const world = new World({ capacity: 8 });
    const position = world.defineComponent('position', Float32Array, 2);
    const health = world.defineComponent('health', Int32Array);

    const entity = world.create();
    world.flush();

    expect(world.has(entity, position)).toBe(false);
    world.add(entity, position);
    expect(world.has(entity, position)).toBe(true);
    expect(world.has(entity, health)).toBe(false);

    world.remove(entity, position);
    expect(world.has(entity, position)).toBe(false);
  });

  it('zeroes component storage on attach so a recycled slot cannot leak state', () => {
    const world = new World({ capacity: 2 });
    const position = world.defineComponent('position', Float32Array, 2);

    const first = world.create();
    world.add(first, position);
    world.flush();
    const slot = entityIndex(first);
    position.data[slot * 2] = 500;
    position.data[slot * 2 + 1] = 900;

    world.destroy(first);
    world.flush();

    const second = world.create();
    world.add(second, position);
    world.flush();

    expect(entityIndex(second)).toBe(slot);
    expect(position.data[slot * 2]).toBe(0);
    expect(position.data[slot * 2 + 1]).toBe(0);
  });

  it('rejects a duplicate component name', () => {
    const world = new World({ capacity: 2 });
    world.defineComponent('position', Float32Array, 2);
    expect(() => world.defineComponent('position', Float32Array, 2)).toThrow(/already defined/);
  });

  it('rejects a non-positive stride', () => {
    const world = new World({ capacity: 2 });
    expect(() => world.defineComponent('bad', Float32Array, 0)).toThrow(/positive integer/);
  });

  it('iterates only entities carrying every component in the mask', () => {
    const world = new World({ capacity: 16 });
    const position = world.defineComponent('position', Float32Array, 2);
    const velocity = world.defineComponent('velocity', Float32Array, 2);

    const both = world.create();
    world.add(both, position);
    world.add(both, velocity);

    const positionOnly = world.create();
    world.add(positionOnly, position);

    world.flush();

    const visited: number[] = [];
    const collect = (index: number): void => {
      visited.push(index);
    };

    world.forEach(world.maskOf(position), collect);
    expect(visited).toHaveLength(2);

    visited.length = 0;
    world.forEach(world.maskOf(position, velocity), collect);
    expect(visited).toEqual([entityIndex(both)]);
  });

  it('does not visit entities destroyed earlier in the same tick', () => {
    const world = new World({ capacity: 16 });
    const position = world.defineComponent('position', Float32Array, 2);

    const kept = world.create();
    const doomed = world.create();
    world.add(kept, position);
    world.add(doomed, position);
    world.flush();

    world.destroy(doomed);

    const visited: number[] = [];
    world.forEach(world.maskOf(position), (index) => {
      visited.push(index);
    });
    expect(visited).toEqual([entityIndex(kept)]);
  });

  it('lets a system destroy entities while iterating without disturbing the set', () => {
    const world = new World({ capacity: 32 });
    const position = world.defineComponent('position', Float32Array, 2);

    for (let i = 0; i < 10; i++) {
      world.add(world.create(), position);
    }
    world.flush();
    expect(world.count).toBe(10);

    // Destroying mid-iteration is the classic way to corrupt an entity loop.
    const mask = world.maskOf(position);
    let visited = 0;
    world.forEach(mask, (index) => {
      visited += 1;
      if (index % 2 === 0) {
        world.destroy(world.entityAt(index));
      }
    });

    expect(visited).toBe(10);
    world.flush();
    expect(world.count).toBe(5);
  });
});

describe('World growth', () => {
  it('grows by doubling and preserves component data', () => {
    const world = new World({ capacity: 2 });
    const position = world.defineComponent('position', Float32Array, 2);

    const entities: Entity[] = [];
    for (let i = 0; i < 5; i++) {
      const entity = world.create();
      world.add(entity, position);
      entities.push(entity);
    }
    world.flush();

    for (let i = 0; i < entities.length; i++) {
      const slot = entityIndex(entities[i] ?? NULL_ENTITY);
      position.data[slot * 2] = i * 10;
      position.data[slot * 2 + 1] = i * 10 + 1;
    }

    // Force another growth and confirm nothing was lost in the reallocation.
    for (let i = 0; i < 20; i++) {
      world.add(world.create(), position);
    }
    world.flush();

    for (let i = 0; i < entities.length; i++) {
      const slot = entityIndex(entities[i] ?? NULL_ENTITY);
      expect(position.data[slot * 2]).toBe(i * 10);
      expect(position.data[slot * 2 + 1]).toBe(i * 10 + 1);
    }
    expect(world.capacity).toBeGreaterThanOrEqual(25);
    expect(world.growths).toBeGreaterThan(0);
  });

  it('never grows when capacity is reserved above the peak entity count', () => {
    const world = new World({ capacity: 10_000 });
    const position = world.defineComponent('position', Float32Array, 2);
    for (let i = 0; i < 10_000; i++) {
      world.add(world.create(), position);
    }
    world.flush();
    expect(world.growths).toBe(0);
  });

  it('rejects a nonsensical capacity', () => {
    expect(() => new World({ capacity: 0 })).toThrow(RangeError);
    expect(() => new World({ capacity: 1.5 })).toThrow(RangeError);
  });
});

describe('World at scale', () => {
  it('creates, iterates and destroys 10,000 entities with 5 components each', () => {
    const world = new World({ capacity: 10_000 });
    const position = world.defineComponent('position', Float32Array, 2);
    const velocity = world.defineComponent('velocity', Float32Array, 2);
    const radius = world.defineComponent('radius', Float32Array);
    const lifetime = world.defineComponent('lifetime', Uint16Array);
    const flags = world.defineComponent('flags', Uint8Array);

    const entities = new Array<Entity>(10_000).fill(NULL_ENTITY);
    for (let i = 0; i < 10_000; i++) {
      const entity = world.create();
      world.add(entity, position);
      world.add(entity, velocity);
      world.add(entity, radius);
      world.add(entity, lifetime);
      world.add(entity, flags);
      entities[i] = entity;
    }
    world.flush();

    expect(world.count).toBe(10_000);
    expect(world.growths).toBe(0);

    const mask = world.maskOf(position, velocity, radius, lifetime, flags);
    let seen = 0;
    world.forEach(mask, () => {
      seen += 1;
    });
    expect(seen).toBe(10_000);

    for (let i = 0; i < 10_000; i++) {
      world.destroy(entities[i] ?? NULL_ENTITY);
    }
    world.flush();

    expect(world.count).toBe(0);
    let seenAfter = 0;
    world.forEach(mask, () => {
      seenAfter += 1;
    });
    expect(seenAfter).toBe(0);

    // Every slot came back, so the next 10,000 spawns need no new memory.
    for (let i = 0; i < 10_000; i++) {
      world.create();
    }
    world.flush();
    expect(world.count).toBe(10_000);
    expect(world.growths).toBe(0);
  });
});
