import { describe, expect, it } from 'vitest';
import { GameSim } from '../../src/sim/game/sim.js';
import { RoomGeometry } from '../../src/sim/room/geometry.js';
import { StatId } from '../../src/sim/stats/definition.js';
import type { ItemDefinition } from '../../src/sim/item/definition.js';
import type { ItemSetDefinition } from '../../src/sim/item/set.js';

/**
 * Item sets (#137): a set's bonus applies only while every member is held,
 * and disappears the instant that stops being true — the same "losing an
 * item returns the player to exactly the prior state" guarantee an
 * individual item's own stat contribution already has (#26).
 */

function bareRoom(): RoomGeometry {
  return new RoomGeometry(0, 0, 320, 180);
}

function passiveItem(id: string): ItemDefinition {
  return {
    id,
    name: id,
    description: 'test item',
    sprite: id,
    pools: ['treasure'],
    quality: 0,
    promilleRequirement: 'any',
  };
}

const TEST_SET: ItemSetDefinition = {
  id: 'test-set',
  name: 'Test Set',
  members: ['piece-a', 'piece-b'],
  bonus: [{ stat: StatId.Stammwuerze, op: 'add', value: 10 }],
};

function simWithTestSet(): GameSim {
  return new GameSim({
    room: bareRoom(),
    items: [passiveItem('piece-a'), passiveItem('piece-b'), passiveItem('piece-c')],
    itemSets: [TEST_SET],
  });
}

describe('item sets (#137)', () => {
  it('applies no bonus and reports no completion with only some pieces held', () => {
    const sim = simWithTestSet();
    const before = sim.stats.value(StatId.Stammwuerze);
    sim.pickUpItem('piece-a');
    expect(sim.hasCompletedSet('test-set')).toBe(false);
    expect(sim.stats.value(StatId.Stammwuerze)).toBeCloseTo(before, 5);
  });

  it('applies the bonus and fires the completion reveal the instant the last piece is picked up', () => {
    const sim = simWithTestSet();
    const before = sim.stats.value(StatId.Stammwuerze);
    sim.pickUpItem('piece-a');
    sim.pickUpItem('piece-b');
    expect(sim.hasCompletedSet('test-set')).toBe(true);
    expect(sim.stats.value(StatId.Stammwuerze)).toBeCloseTo(before + 10, 5);
    const reveal = sim.setCompletionReveal;
    expect(reveal).not.toBeNull();
    expect(reveal?.name).toBe('Test Set');
  });

  it('removes the bonus the instant any one piece is lost, and returns to exactly the prior state', () => {
    const sim = simWithTestSet();
    const before = sim.stats.value(StatId.Stammwuerze);
    sim.pickUpItem('piece-a');
    sim.pickUpItem('piece-b');
    expect(sim.hasCompletedSet('test-set')).toBe(true);

    sim.removeItem('piece-a');
    expect(sim.hasCompletedSet('test-set')).toBe(false);
    expect(sim.stats.value(StatId.Stammwuerze)).toBeCloseTo(before, 5);
  });

  it('a third, unrelated item does not affect completion either way', () => {
    const sim = simWithTestSet();
    sim.pickUpItem('piece-c');
    sim.pickUpItem('piece-a');
    expect(sim.hasCompletedSet('test-set')).toBe(false);
    sim.pickUpItem('piece-b');
    expect(sim.hasCompletedSet('test-set')).toBe(true);
  });

  it('the completion reveal ages out on its own, well within a room', () => {
    const sim = simWithTestSet();
    sim.pickUpItem('piece-a');
    sim.pickUpItem('piece-b');
    expect(sim.setCompletionReveal).not.toBeNull();
    for (let tick = 0; tick < 400; tick++) {
      sim.step();
    }
    expect(sim.setCompletionReveal).toBeNull();
    // The set stays complete — only the banner fades.
    expect(sim.hasCompletedSet('test-set')).toBe(true);
  });

  it('a real GameSim with the default roster carries the Braumeister set and no bonus by default', () => {
    const sim = new GameSim({ room: bareRoom() });
    expect(sim.itemSets.all.some((set) => set.id === 'braumeister')).toBe(true);
    expect(sim.hasCompletedSet('braumeister')).toBe(false);
  });
});
