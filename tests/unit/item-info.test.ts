import { describe, expect, it } from 'vitest';
import { GameSim } from '../../src/sim/game/sim.js';
import type { ItemDefinition } from '../../src/sim/item/definition.js';
import { RoomGeometry } from '../../src/sim/room/geometry.js';
import { createInputFrame } from '../../src/sim/input/frame.js';
import { StatId } from '../../src/sim/stats/definition.js';
import { DEFAULT_MOVEMENT_TUNING, DEFAULT_SHOOTING_TUNING } from '../../src/sim/tuning.js';
import { displayStatValue, formatStat, formatStatDelta } from '../../src/render/stat-display.js';
import { STAT_DELTA_TICKS, StatHud } from '../../src/render/stat-hud.js';
import { CollectionScreen, type CollectionEntry } from '../../src/render/collection-screen.js';
import { UiKit } from '../../src/render/ui/kit.js';
import { installPixelFonts } from '../../src/render/ui/font.js';
import { ItemDiscovery, withItemsDiscovered } from '../../src/app/collection.js';
import { createDefaultSave } from '../../src/app/save/schema.js';
import { sanitizeAccessibilitySettings } from '../../src/app/settings.js';

installPixelFonts();

/**
 * The item-info feature: the opt-in stat column (`render/stat-hud.ts`), the
 * opt-in precise pickup line (`AccessibilitySettings.detailedPickupText`),
 * and the always-available Collection (`render/collection-screen.ts`,
 * `app/collection.ts`).
 */

function bareRoom(): RoomGeometry {
  return new RoomGeometry(0, 0, 320, 180);
}

function baseItem(id: string, overrides: Partial<ItemDefinition> = {}): ItemDefinition {
  return {
    id,
    name: id,
    description: `${id} description`,
    sprite: 'test',
    pools: ['treasure'],
    quality: 0,
    promilleRequirement: 'any',
    ...overrides,
  };
}

const strong = baseItem('strong', {
  hooks: { modifyStats: () => [{ stat: 'damage', op: 'multiply', value: 1.4 }] },
});
const heavy = baseItem('heavy', {
  hooks: { modifyStats: () => [{ stat: 'moveSpeed', op: 'multiply', value: 0.8 }] },
});

function stepTicks(sim: GameSim, ticks: number): void {
  for (let tick = 0; tick < ticks; tick++) {
    sim.step(createInputFrame());
  }
}

describe('stat display units', () => {
  const base: Record<StatId, number> = {
    damage: DEFAULT_SHOOTING_TUNING.shotDamage,
    fireRate: DEFAULT_SHOOTING_TUNING.fireDelayTicks,
    range: DEFAULT_SHOOTING_TUNING.shotLifetimeTicks,
    shotSpeed: DEFAULT_SHOOTING_TUNING.shotSpeed,
    moveSpeed: DEFAULT_MOVEMENT_TUNING.maxSpeed,
    luck: 0,
  };

  it('reads the default character as 1.00 speed and 3 shots a second', () => {
    expect(displayStatValue(StatId.ShotSpeed, base)).toBeCloseTo(1);
    expect(displayStatValue(StatId.MoveSpeed, base)).toBeCloseTo(1);
    expect(displayStatValue(StatId.FireRate, base)).toBeCloseTo(3);
  });

  it('turns a shorter fire delay into a higher number — every stat reads higher-is-better', () => {
    const faster = { ...base, fireRate: base.fireRate / 2 };
    expect(displayStatValue(StatId.FireRate, faster)).toBeGreaterThan(
      displayStatValue(StatId.FireRate, base),
    );
  });

  it('measures range in floor tiles travelled, so shot speed moves it too', () => {
    const quick = { ...base, shotSpeed: base.shotSpeed * 2 };
    expect(displayStatValue(StatId.Range, quick)).toBeCloseTo(
      displayStatValue(StatId.Range, base) * 2,
    );
  });

  it('prints two decimals, and always signs a delta', () => {
    expect(formatStat(3.456)).toBe('3.46');
    expect(formatStatDelta(0.4)).toBe('+0.40');
    expect(formatStatDelta(-0.2)).toBe('-0.20');
  });
});

describe('StatHud', () => {
  it('stays hidden while the setting is off', () => {
    const sim = new GameSim({ room: bareRoom(), items: [strong] });
    const hud = new StatHud(new UiKit());
    hud.sync(sim, false);
    expect(hud.view.visible).toBe(false);
  });

  it('flashes no delta on the first frame — that is the column appearing, not a change', () => {
    const sim = new GameSim({ room: bareRoom(), items: [strong] });
    const hud = new StatHud(new UiKit());
    hud.sync(sim, true);
    expect(hud.shownRows[0]).toBe('1.00');
  });

  it('flashes a signed delta on a change, and lets it age out in sim ticks', () => {
    const sim = new GameSim({ room: bareRoom(), items: [strong, heavy] });
    const hud = new StatHud(new UiKit());
    hud.sync(sim, true);

    sim.pickUpItem('strong');
    sim.pickUpItem('heavy');
    hud.sync(sim, true);
    expect(hud.shownRows[0]).toBe('1.40 +0.40');
    expect(hud.shownRows[4]).toBe('0.80 -0.20');

    stepTicks(sim, STAT_DELTA_TICKS);
    hud.sync(sim, true);
    expect(hud.shownRows[0]).toBe('1.40');
    expect(hud.shownRows[4]).toBe('0.80');
  });

  it('sums changes inside one window rather than showing only the newest', () => {
    const sharp = baseItem('sharp', {
      hooks: { modifyStats: () => [{ stat: 'damage', op: 'add', value: 0.5 }] },
    });
    const sim = new GameSim({ room: bareRoom(), items: [strong, sharp] });
    const hud = new StatHud(new UiKit());
    hud.sync(sim, true);
    sim.pickUpItem('strong');
    hud.sync(sim, true);
    stepTicks(sim, 10);
    sim.pickUpItem('sharp');
    hud.sync(sim, true);
    // Two changes a few ticks apart read as one delta of the whole climb.
    const [value, delta] = (hud.shownRows[0] ?? '').split(' ');
    expect(Number(delta)).toBeCloseTo(Number(value) - 1, 2);
    expect(Number(delta)).toBeGreaterThan(0.4);
  });

  it('does not flash a delta for a restart — a fresh sim is a fresh column', () => {
    const kit = new UiKit();
    const hud = new StatHud(kit);
    const first = new GameSim({ room: bareRoom(), items: [strong] });
    first.pickUpItem('strong');
    hud.sync(first, true);
    const second = new GameSim({ room: bareRoom(), items: [strong] });
    hud.sync(second, true);
    expect(hud.shownRows[0]).toBe('1.00');
  });
});

describe('detailed pickup text', () => {
  it('sanitises both new toggles to off unless they are real booleans', () => {
    expect(sanitizeAccessibilitySettings({}).statDisplay).toBe(false);
    expect(sanitizeAccessibilitySettings({}).detailedPickupText).toBe(false);
    expect(sanitizeAccessibilitySettings({ statDisplay: true }).statDisplay).toBe(true);
    expect(sanitizeAccessibilitySettings({ detailedPickupText: 'yes' }).detailedPickupText).toBe(
      false,
    );
  });
});

describe('item discovery', () => {
  it('is idempotent and keeps first-seen order', () => {
    const save = createDefaultSave();
    const once = withItemsDiscovered(save, ['b', 'a', 'b']);
    expect(once.discoveredItems).toEqual(['b', 'a']);
    expect(withItemsDiscovered(once, ['a'])).toBe(once);
  });

  it('records whatever the run holds, once, and persists only what is new', () => {
    const persisted: string[][] = [];
    const discovery = new ItemDiscovery(['heavy'], (ids) => persisted.push([...ids]));
    const sim = new GameSim({ room: bareRoom(), items: [strong, heavy] });
    sim.pickUpItem('heavy');
    expect(discovery.observe(sim)).toBe(false);

    sim.pickUpItem('strong');
    expect(discovery.observe(sim)).toBe(true);
    expect(discovery.observe(sim)).toBe(false);
    expect(persisted).toEqual([['strong']]);
    expect(discovery.has('strong')).toBe(true);
  });
});

describe('CollectionScreen', () => {
  const entries: CollectionEntry[] = ['a', 'b', 'c', 'd', 'e'].map((id, index) => ({
    id,
    name: id.toUpperCase(),
    flavourKey: '',
    descriptionKey: 'ui.collection.active',
    quality: index % 4,
    active: false,
    art: null,
  }));

  function open(discovered: readonly string[]): { screen: CollectionScreen; backs: () => number } {
    let backs = 0;
    const screen = new CollectionScreen(
      new UiKit(),
      {
        onBack: () => (backs += 1),
        isDiscovered: (id) => discovered.includes(id),
        isHeld: () => false,
        lockedGoal: () => null,
      },
      'en',
    );
    screen.setEntries(entries);
    // Narrow enough for exactly two columns.
    screen.resize(170, 360);
    screen.show();
    return { screen, backs: () => backs };
  }

  it('hides an undiscovered item behind ??? and names a discovered one', () => {
    const { screen } = open(['a']);
    expect(screen.detailLines[0]).toBe('A');
    screen.moveFocusHorizontal(1);
    expect(screen.focusedId).toBe('b');
    expect(screen.detailLines[0]).toBe('???');
  });

  it('walks the grid by row and column, and drops onto Back off the bottom', () => {
    const { screen, backs } = open([]);
    screen.moveFocus(1);
    expect(screen.focusedId).toBe('c');
    screen.moveFocusHorizontal(1);
    expect(screen.focusedId).toBe('d');
    // Right edge of the row: no wrap onto the next one.
    screen.moveFocusHorizontal(1);
    expect(screen.focusedId).toBe('d');
    screen.moveFocus(1);
    expect(screen.focusedId).toBeNull();
    screen.activate();
    expect(backs()).toBe(1);
    screen.moveFocus(-1);
    expect(screen.focusedId).toBe('d');
  });
});
