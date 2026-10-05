import { describe, expect, it } from 'vitest';
import { parseStartFloor } from '../../src/app/start-floor.js';
import { GameSim } from '../../src/sim/game/sim.js';
import { RoomGeometry } from '../../src/sim/room/geometry.js';

/**
 * `?floor=N` (sandbox runs): the parameter's parsing and the kit a run that
 * starts on a later floor is dealt.
 */
describe('parseStartFloor', () => {
  it('reads a playable floor', () => {
    expect(parseStartFloor('?floor=2', true, 2)).toEqual({ floor: 2, requested: 2 });
    expect(parseStartFloor('?seed=5&floor=3', true, 3)).toEqual({ floor: 3, requested: 3 });
  });

  it('clamps a floor that is not playable yet, remembering what was asked', () => {
    expect(parseStartFloor('?floor=3', true, 2)).toEqual({ floor: 2, requested: 3 });
    expect(parseStartFloor('?floor=99', true, 2)).toEqual({ floor: 2, requested: 99 });
  });

  it('is a normal run for floor 1, junk, or nothing', () => {
    for (const search of [
      '',
      '?floor=1',
      '?floor=0',
      '?floor=-2',
      '?floor=abc',
      '?floor=2.5',
      '?floor=',
    ]) {
      expect(parseStartFloor(search, true, 3), search).toBeNull();
    }
  });

  it('is a normal run when the build does not honour it', () => {
    expect(parseStartFloor('?floor=3', false, 3)).toBeNull();
  });
});

function sim(
  skippedFloors: number,
  options: { seed?: number; promilleUnlocked?: boolean } = {},
): GameSim {
  return new GameSim({
    room: new RoomGeometry(0, 0, 320, 180),
    seed: options.seed ?? 7,
    promilleUnlocked: options.promilleUnlocked ?? true,
    skippedFloors,
  });
}

function held(s: GameSim): string[] {
  return s.items.all.filter((item) => s.hasItem(item.id)).map((item) => item.id);
}

describe('the skip-ahead kit', () => {
  it('is nothing for an ordinary run', () => {
    const plain = new GameSim({ room: new RoomGeometry(0, 0, 320, 180), seed: 7 });
    const s = sim(0);
    expect(held(s)).toEqual(held(plain));
    expect(s.bombs).toBe(plain.bombs);
    expect(s.keys).toBe(plain.keys);
  });

  it('deals items and consumables scaled by the floors skipped', () => {
    const base = sim(0);
    const two = sim(2);
    const tuning = two.tuning.skipAhead;
    expect(held(two).length - held(base).length).toBe(
      2 * (tuning.treasureItemsPerFloor + tuning.bossItemsPerFloor),
    );
    expect(two.bombs - base.bombs).toBe(Math.round(tuning.bombsPerFloor * 2));
    expect(two.keys - base.keys).toBe(Math.round(tuning.keysPerFloor * 2));
    expect(two.biermarken - base.biermarken).toBe(Math.round(tuning.biermarkenPerFloor * 2));
  });

  it('is a pure function of the seed, and different seeds differ', () => {
    expect(held(sim(2, { seed: 11 }))).toEqual(held(sim(2, { seed: 11 })));
    const kits = new Set([1, 2, 3, 4, 5, 6].map((seed) => held(sim(2, { seed })).join(',')));
    expect(kits.size).toBeGreaterThan(1);
  });

  it('never deals the same item twice', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const ids = held(sim(4, { seed }));
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('keeps Promille-only items out of a sober run', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const s = sim(3, { seed, promilleUnlocked: false });
      for (const id of held(s)) {
        expect(s.items.get(id).needsPromille, id).toBe(false);
      }
    }
  });

  it('leaves health and Promille as a fresh run has them', () => {
    const plain = new GameSim({ room: new RoomGeometry(0, 0, 320, 180), seed: 7 });
    const s = sim(2);
    expect(s.playerHealth).toBe(plain.playerHealth);
    expect(s.promille).toBe(0);
  });
});
