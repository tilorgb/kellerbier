import { describe, expect, it } from 'vitest';
import { GameSim } from '../../src/sim/game/sim.js';
import type { ItemDefinition } from '../../src/sim/item/definition.js';
import { RoomGeometry } from '../../src/sim/room/geometry.js';
import { ItemStatusHud } from '../../src/render/item-status-hud.js';
import { installPixelFonts } from '../../src/render/ui/font.js';

installPixelFonts();

/**
 * `ItemStatusHud` (`render/item-status-hud.ts`): one HUD row per held item
 * whose `ItemDefinition.status` reader has something to say, and nothing at
 * all — zero height — for a run holding none, so `layoutHud`'s column closes
 * the gap. The rule behind it is the roster's "every item is visible while
 * held"; this proves the rows follow the inventory rather than the roster.
 */

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

const talkative = baseItem('zaehler', {
  name: 'Zähler',
  status: (ctx) => `${String(ctx.state.charge)} banked`,
  hooks: { onRoomClear: (ctx) => void (ctx.state.charge += 1) },
});
const quietWhenEmpty = baseItem('schweiger', {
  status: (ctx) => (ctx.state.charge > 0 ? 'armed' : ''),
});
const noStatus = baseItem('stumm', {
  hooks: { modifyStats: () => [{ stat: 'damage', op: 'add', value: 1 }] },
});

describe('ItemStatusHud', () => {
  it('shows nothing, at zero height, for a run holding no stateful item', () => {
    const sim = new GameSim({ room: bareRoom(), items: [talkative, noStatus] });
    sim.pickUpItem('stumm');
    const hud = new ItemStatusHud();
    hud.sync(sim);
    expect(hud.shownRows).toEqual([]);
    expect(hud.height).toBe(0);
  });

  it('shows "Name: status" for a held item, and drops the row when the item goes', () => {
    const sim = new GameSim({ room: bareRoom(), items: [talkative, noStatus] });
    const hud = new ItemStatusHud();
    sim.pickUpItem('zaehler');
    hud.sync(sim);
    expect(hud.shownRows).toEqual(['Zähler: 0 banked']);
    expect(hud.height).toBeGreaterThan(0);

    // The reader sees live state — the row follows the counter.
    sim.itemState('zaehler').charge = 3;
    hud.sync(sim);
    expect(hud.shownRows).toEqual(['Zähler: 3 banked']);

    sim.removeItem('zaehler');
    hud.sync(sim);
    expect(hud.shownRows).toEqual([]);
    expect(hud.height).toBe(0);
  });

  it('hides a row whose reader returns the empty string, and reveals it once it has something to say', () => {
    const sim = new GameSim({ room: bareRoom(), items: [quietWhenEmpty] });
    const hud = new ItemStatusHud();
    sim.pickUpItem('schweiger');
    hud.sync(sim);
    expect(hud.shownRows).toEqual([]);
    sim.itemState('schweiger').charge = 1;
    hud.sync(sim);
    expect(hud.shownRows).toEqual(['schweiger: armed']);
  });
});
