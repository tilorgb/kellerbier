import { describe, expect, it } from 'vitest';
import { GameSim } from '../../src/sim/game/sim.js';
import type { ItemDefinition } from '../../src/sim/item/definition.js';
import { RoomGeometry } from '../../src/sim/room/geometry.js';
import { buildRunDetailsText, heldItemNames, runDetailsFrom } from '../../src/app/run-summary.js';
import { encodeSeed } from '../../src/sim/rng/seed.js';

function bareRoom(): RoomGeometry {
  return new RoomGeometry(0, 0, 320, 180);
}

function baseItem(id: string, overrides: Partial<ItemDefinition> = {}): ItemDefinition {
  return {
    id,
    name: id,
    description: 'a test item',
    sprite: 'test',
    pools: ['treasure'],
    quality: 0,
    promilleRequirement: 'any',
    ...overrides,
  };
}

describe('heldItemNames (#48)', () => {
  it('names nothing for a run holding no items', () => {
    const sim = new GameSim({ room: bareRoom() });
    expect(heldItemNames(sim)).toEqual([]);
  });

  it('lists the active item first, ahead of registry/id order', () => {
    // 'zapfhahn' sorts after 'anstich' by id — `ItemRegistry` sorts by id
    // (`registry.ts`'s own doc comment), so this only proves "active first"
    // if the active item's id would otherwise come *second*.
    const active = baseItem('zapfhahn', { name: 'Zapfhahn', active: { maxCharge: 1 } });
    const passive = baseItem('anstich', { name: 'Anstich' });
    const sim = new GameSim({ room: bareRoom(), items: [active, passive] });
    sim.pickUpItem('anstich');
    sim.pickUpItem('zapfhahn');
    expect(heldItemNames(sim)).toEqual(['Zapfhahn', 'Anstich']);
  });
});

describe('buildRunDetailsText (#48)', () => {
  it('reads as one shareable, pasteable block', () => {
    const text = buildRunDetailsText({
      seed: 0xc0ffee,
      character: 'Alois',
      floorName: 'Der Keller',
      roomRole: 'boss',
      ticksSurvived: 630,
      kills: 37,
      deathWord: 'Umgfalln',
      items: ['Krug', 'Bierfassl'],
      alive: false,
    });
    expect(text).toBe(
      `Kellerbier run — seed ${encodeSeed(0xc0ffee)} · Alois\n` +
        '10.5s survived · 37 kills · died on Der Keller (boss) — "Umgfalln"\n' +
        'Items: Krug, Bierfassl',
    );
  });

  it('says "none" for a run with no items, and reports a live run as still going', () => {
    const text = buildRunDetailsText({
      seed: 1,
      character: 'Alois',
      floorName: 'Der Keller',
      roomRole: 'start',
      ticksSurvived: 60,
      kills: 0,
      deathWord: null,
      items: [],
      alive: true,
    });
    expect(text).toContain('still going, Der Keller (start)');
    expect(text).toContain('Items: none');
  });

  it('omits the death-word clause entirely when there was none', () => {
    const text = buildRunDetailsText({
      seed: 1,
      character: 'Alois',
      floorName: 'Der Keller',
      roomRole: 'boss',
      ticksSurvived: 60,
      kills: 0,
      deathWord: null,
      items: [],
      alive: false,
    });
    expect(text).toContain('died on Der Keller (boss)\n');
  });

  it('normalises a seed outside the valid 32-bit range rather than throwing', () => {
    // `sim.seed` can carry whatever a dev-only `?seed=`/`#seed-input` value
    // was, which is not guaranteed to already be a valid 32-bit unsigned
    // integer the way every player-facing seed source is.
    expect(() =>
      buildRunDetailsText({
        seed: -1,
        character: 'Alois',
        floorName: 'Der Keller',
        roomRole: 'start',
        ticksSurvived: 0,
        kills: 0,
        deathWord: null,
        items: [],
        alive: true,
      }),
    ).not.toThrow();
  });
});

describe('runDetailsFrom (#48)', () => {
  it('assembles a RunDetails from a live GameSim', () => {
    const sim = new GameSim({ room: bareRoom(), seed: 42 });
    const details = runDetailsFrom(sim, 'Der Keller', 'start', 3);
    expect(details.seed).toBe(42);
    expect(details.character).toBe('Alois');
    expect(details.kills).toBe(3);
    expect(details.alive).toBe(true);
    expect(details.items).toEqual([]);
  });
});
