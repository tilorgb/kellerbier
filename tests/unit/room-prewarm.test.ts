import { describe, expect, it } from 'vitest';
import { RoomPrewarm } from '../../src/render/world/room-prewarm.js';

/**
 * `RoomPrewarm` holds one room's scenery, built during #289's door-crossing
 * dwell so `GameView.sync` adopts it instead of building it on the switch
 * frame. It owns exactly one reserve at a time and never leaks the ones it
 * drops. See `src/render/world/room-prewarm.ts`.
 */
class FakeScenery {
  disposed = 0;
  dispose(): void {
    this.disposed += 1;
  }
}

function prewarm(): {
  pw: RoomPrewarm<FakeScenery>;
  built: FakeScenery[];
  build: () => FakeScenery;
} {
  const built: FakeScenery[] = [];
  const build = (): FakeScenery => {
    const scenery = new FakeScenery();
    built.push(scenery);
    return scenery;
  };
  return { pw: new RoomPrewarm<FakeScenery>(), built, build };
}

describe('RoomPrewarm', () => {
  it('builds the requested room once and hands it back to a matching take', () => {
    const { pw, built, build } = prewarm();

    const returned = pw.request('room-a', build);
    expect(returned).toBe(built[0]);
    expect(built).toHaveLength(1);
    expect(pw.readyKey).toBe('room-a');

    const taken = pw.take('room-a');
    expect(taken).toBe(built[0]);
    expect(pw.readyKey).toBeNull();
    expect(taken?.disposed).toBe(0);
  });

  it('is a no-op returning null when the same room is requested again — the per-tick dwell poll', () => {
    const { pw, built, build } = prewarm();

    expect(pw.request('room-a', build)).toBe(built[0]);
    expect(pw.request('room-a', build)).toBeNull();
    expect(pw.request('room-a', build)).toBeNull();

    expect(built).toHaveLength(1);
  });

  it('disposes the previous reserve when a different room is requested', () => {
    const { pw, built, build } = prewarm();

    pw.request('room-a', build);
    pw.request('room-b', build);

    expect(built).toHaveLength(2);
    expect(built[0]?.disposed).toBe(1); // room-a, dropped
    expect(built[1]?.disposed).toBe(0); // room-b, held
    expect(pw.readyKey).toBe('room-b');
  });

  it('take returns null and disposes the reserve when the key does not match', () => {
    const { pw, built, build } = prewarm();
    pw.request('room-a', build);

    // A second crossing in the same frame replaced what was held: the view
    // arrives in room-a but room-b is on the shelf.
    expect(pw.take('room-b')).toBeNull();
    expect(built[0]?.disposed).toBe(1);
    expect(pw.readyKey).toBeNull();
  });

  it('take returns null when nothing is held', () => {
    const { pw } = prewarm();
    expect(pw.take('room-a')).toBeNull();
  });

  it('take transfers ownership — it does not dispose what it returns', () => {
    const { pw, build } = prewarm();
    pw.request('room-a', build);

    const taken = pw.take('room-a');
    pw.discard(); // nothing held any more

    expect(taken?.disposed).toBe(0);
  });

  it('discard disposes the held room and empties the reserve', () => {
    const { pw, built, build } = prewarm();
    pw.request('room-a', build);

    pw.discard();

    expect(built[0]?.disposed).toBe(1);
    expect(pw.readyKey).toBeNull();
    pw.discard(); // idempotent
    expect(built[0]?.disposed).toBe(1);
  });
});
