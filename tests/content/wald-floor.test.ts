import { describe, expect, it } from 'vitest';
import { ENEMY_DEFINITIONS } from '../../src/content/enemies/index.js';
import { FLOOR_CONFIGS } from '../../src/content/floors/definition.js';
import { ROOM_TEMPLATES } from '../../src/content/rooms/index.js';
import { isMultiCellRoomTemplate } from '../../src/content/rooms/definition.js';
import { generateFloor, validateFloorPlan } from '../../src/sim/room/floor-plan.js';
import { generateRoom } from '../../src/sim/room/generate-room.js';
import { Rng } from '../../src/sim/rng/rng.js';
import { validateRoomTemplate } from '../../src/sim/room/template.js';

/**
 * Floor 3's foundation (#402): the `wald` tag generates a floor, its authored
 * cover is wood, and the boss room is the obstacle-free clearing both of the
 * boss's attack shapes need.
 */
const templates = ROOM_TEMPLATES.map((room, index) =>
  validateRoomTemplate(room, `room[${String(index)}]`, ENEMY_DEFINITIONS),
);
const waldTemplates = templates.filter((template) => template.metadata.floorTags.includes('wald'));
const config = FLOOR_CONFIGS.find((candidate) => candidate.floorTag === 'wald');

describe('floor 3 — Der Wald foundation', () => {
  it('generates a valid floor from the wald template pool', () => {
    expect(config).toBeDefined();
    if (config === undefined) {
      return;
    }
    for (let seed = 0; seed < 25; seed++) {
      const plan = generateFloor(new Rng(seed + 300), config, templates);
      expect(validateFloorPlan(plan, templates), `seed ${String(seed)}`).toEqual([]);
    }
  });

  it('wald-boss is an open clearing with no obstacles at all', () => {
    const boss = waldTemplates.find((template) => template.id === 'wald-boss');
    expect(boss?.metadata.specialRole).toBe('boss');
    expect(boss !== undefined && !isMultiCellRoomTemplate(boss) ? boss.obstacles : null).toEqual(
      [],
    );
  });

  it('every authored wald-only obstacle is wood', () => {
    const own = waldTemplates.filter((template) => template.id.startsWith('wald-'));
    expect(own.length).toBeGreaterThanOrEqual(11);
    for (const template of own) {
      const layouts = isMultiCellRoomTemplate(template) ? template.cells : [template];
      for (const layout of layouts) {
        for (const obstacle of layout.obstacles) {
          expect(obstacle.material, template.id).toBe('wood');
        }
      }
    }
  });

  it('generated wald cover is wood, and other floors stay stone by default', () => {
    const spec = (floorTag: string, floor: number) => ({
      rng: new Rng(7),
      floorTag,
      floor,
      roomId: 'r0',
      doors: ['north', 'south'] as const,
      distanceFromStart: 2,
      role: 'normal' as const,
    });
    const obstaclesOf = (floorTag: string, floor: number) =>
      generateRoom(spec(floorTag, floor) as never).obstacles;
    const wald = obstaclesOf('wald', 3);
    expect(wald.length).toBeGreaterThan(0);
    expect(wald.every((obstacle) => obstacle.material === 'wood')).toBe(true);
    expect(obstaclesOf('rural', 2).every((obstacle) => obstacle.material === undefined)).toBe(true);
  });
});
