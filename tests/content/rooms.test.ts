import { describe, expect, it } from 'vitest';
import { ENEMY_DEFINITIONS } from '../../src/content/enemies/index.js';
import cellarCrossroads from '../../src/content/rooms/cellar.json';
import { ROOM_TEMPLATES } from '../../src/content/rooms/index.js';
import {
  ROOM_COLUMNS,
  ROOM_ROWS,
  ROOM_TILE_UNITS,
  isMultiCellRoomTemplate,
} from '../../src/content/rooms/definition.js';
import { compileRoomTemplate, validateRoomTemplate } from '../../src/sim/room/template.js';

describe('room templates', () => {
  it('validates every registered authored room', () => {
    expect(ROOM_TEMPLATES).toHaveLength(13);
    for (const [index, room] of ROOM_TEMPLATES.entries()) {
      expect(() =>
        validateRoomTemplate(room, `room[${String(index)}].json`, ENEMY_DEFINITIONS),
      ).not.toThrow();
    }
  });

  it('loads the hand-authored JSON at the standard dimensions', () => {
    const template = validateRoomTemplate(cellarCrossroads, 'cellar.json', ENEMY_DEFINITIONS);
    if (isMultiCellRoomTemplate(template)) {
      throw new Error('cellar.json is a 1x1 template');
    }

    expect(template.tileGrid).toHaveLength(ROOM_ROWS);
    expect(template.tileGrid.every((row) => row.length === ROOM_COLUMNS)).toBe(true);
    expect(template.metadata.shape).toBe('1x1');
    expect(template.metadata.weight).toBeGreaterThan(0);
    expect(template.enemySpawns).toHaveLength(2);
  });

  it('resolves a reusable spawn group for different floors', () => {
    const floorOne = compileRoomTemplate(cellarCrossroads, 1, 'cellar.json', ENEMY_DEFINITIONS);
    const floorFive = compileRoomTemplate(cellarCrossroads, 5, 'cellar.json', ENEMY_DEFINITIONS);

    expect(floorOne.enemyIds).toEqual(['kellerassel', 'kellerassel']);
    expect(floorFive.enemyIds).toEqual(['bierratte', 'bierratte']);
    expect(floorOne.geometry.maxX - floorOne.geometry.minX).toBe(ROOM_COLUMNS * ROOM_TILE_UNITS);
    expect(floorOne.geometry.maxY - floorOne.geometry.minY).toBe(ROOM_ROWS * ROOM_TILE_UNITS);
  });

  it('names malformed fields and their source', () => {
    expect(() =>
      validateRoomTemplate(
        { ...cellarCrossroads, metadata: { ...cellarCrossroads.metadata, weight: 0 } },
        'broken-room.json',
      ),
    ).toThrow(/broken-room\.json\.metadata\.weight: must be greater than zero/);
  });

  it('rejects an unknown enemy in a spawn group', () => {
    const broken = {
      ...cellarCrossroads,
      spawnGroups: cellarCrossroads.spawnGroups.map((group) => ({
        ...group,
        choices: group.choices.map((choice) => ({ ...choice, enemyId: 'missing-enemy' })),
      })),
    };

    expect(() => validateRoomTemplate(broken, 'broken-room.json', ENEMY_DEFINITIONS)).toThrow(
      /broken-room\.json\.spawnGroups\[0\]\.choices\[0\]\.enemyId: does not name a registered enemy/,
    );
  });
});
