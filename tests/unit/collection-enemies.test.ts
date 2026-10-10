import { beforeAll, describe, expect, it } from 'vitest';
import { EnemyDiscovery, withEnemiesDiscovered } from '../../src/app/collection.js';
import { migrateSave } from '../../src/app/save/migrations.js';
import { createDefaultSave, sanitizeSave } from '../../src/app/save/schema.js';
import { CollectionScreen, type CollectionEntry } from '../../src/render/collection-screen.js';
import { installPixelFonts } from '../../src/render/ui/font.js';
import { UiKit } from '../../src/render/ui/kit.js';
import { entityIndex } from '../../src/sim/ecs/entity.js';
import { GameSim } from '../../src/sim/game/sim.js';
import { RoomGeometry } from '../../src/sim/room/geometry.js';

/**
 * The Collection's enemy tab: which enemies a save has met
 * (`SaveData.discoveredEnemies`, schema v14) and the tab bar that pages
 * between items and enemies.
 */

beforeAll(() => {
  installPixelFonts();
});

describe('discoveredEnemies in the save', () => {
  it('migrates a v13 save to v14 with nothing met yet', () => {
    const v13 = { ...createDefaultSave(), schemaVersion: 13 } as Record<string, unknown>;
    delete v13.discoveredEnemies;
    const migrated = sanitizeSave(migrateSave(v13));
    expect(migrated.schemaVersion).toBe(14);
    expect(migrated.discoveredEnemies).toEqual([]);
  });

  it('records each enemy once', () => {
    const save = withEnemiesDiscovered(createDefaultSave(), ['bierratte', 'bierratte']);
    expect(save.discoveredEnemies).toEqual(['bierratte']);
    expect(withEnemiesDiscovered(save, ['bierratte'])).toBe(save);
  });
});

describe('EnemyDiscovery', () => {
  it('counts an enemy as met the first time it is alive in the room', () => {
    const sim = new GameSim({ room: new RoomGeometry(0, 0, 320, 180) });
    const persisted: string[][] = [];
    const discovery = new EnemyDiscovery([], (ids) => persisted.push([...ids]));
    discovery.observe(sim);
    persisted.length = 0;
    const entity = sim.spawnEnemyKind(sim.enemies.indexOf('zapfhahn'), 60, 60);
    sim.world.flush();
    expect(entityIndex(entity)).toBeGreaterThanOrEqual(0);
    expect(discovery.observe(sim)).toBe(true);
    expect(discovery.observe(sim)).toBe(false);
    expect(persisted).toEqual([['zapfhahn']]);
    expect(discovery.has('zapfhahn')).toBe(true);
  });
});

describe('CollectionScreen tabs', () => {
  const entry = (id: string, enemy: boolean): CollectionEntry => ({
    id,
    name: id.toUpperCase(),
    flavourKey: '',
    descriptionKey: '',
    quality: 0,
    active: false,
    art: null,
    ...(enemy ? { enemy: { health: 3, contactDamage: 1, boss: id === 'boss' } } : {}),
  });

  function open(): CollectionScreen {
    const screen = new CollectionScreen(
      new UiKit(),
      {
        onBack: () => undefined,
        isDiscovered: () => true,
        isHeld: () => false,
        lockedGoal: () => null,
        isEnemyDiscovered: (id) => id !== 'hidden',
      },
      'en',
    );
    screen.setEntries([entry('item-a', false), entry('item-b', false)]);
    screen.setEnemyEntries([entry('rat', true), entry('boss', true), entry('hidden', true)]);
    screen.resize(170, 360);
    screen.show();
    return screen;
  }

  it('opens on the items, reaches the tabs off the top row, and pages to the enemies', () => {
    const screen = open();
    expect(screen.activeTab).toBe('items');
    expect(screen.focusedId).toBe('item-a');
    screen.moveFocus(-1);
    screen.moveFocusHorizontal(1);
    expect(screen.activeTab).toBe('enemies');
    screen.moveFocus(1);
    expect(screen.focusedId).toBe('rat');
    expect(screen.detailLines).toContain('Health 3 · Contact damage 1');
  });

  it('shows a boss as one, and an enemy not yet met as ???', () => {
    const screen = open();
    screen.switchTab('enemies');
    screen.moveFocus(1);
    screen.moveFocusHorizontal(1);
    expect(screen.focusedId).toBe('boss');
    expect(screen.detailLines).toContain('Boss');
    // Two columns: the third enemy sits under the first.
    screen.moveFocusHorizontal(-1);
    screen.moveFocus(1);
    expect(screen.focusedId).toBe('hidden');
    expect(screen.detailLines[0]).toBe('???');
  });

  it('opens on the items again next time', () => {
    const screen = open();
    screen.switchTab('enemies');
    screen.hide();
    screen.show();
    expect(screen.activeTab).toBe('items');
  });
});
