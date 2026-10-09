import { describe, expect, it } from 'vitest';
import { ENEMY_DEFINITIONS } from '../../src/content/enemies/index.js';
import { FLOOR_CONFIGS, ROOM_GEN_FLOOR_OVERRIDES } from '../../src/content/floors/definition.js';
import { ROOM_TEMPLATES } from '../../src/content/rooms/index.js';
import { isMultiCellRoomTemplate } from '../../src/content/rooms/definition.js';
import { generateFloor, validateFloorPlan } from '../../src/sim/room/floor-plan.js';
import { generateRoom } from '../../src/sim/room/generate-room.js';
import { Rng } from '../../src/sim/rng/rng.js';
import { compileRoomTemplate, validateRoomTemplate } from '../../src/sim/room/template.js';
import { DEFAULT_ROOM_GEN_TUNING } from '../../src/sim/tuning.js';

/**
 * Floor 4's foundation (#40): the `alpen` tag generates a floor, its boss
 * arena is the glacier #437 asks for, every weather lane is a whole room,
 * and the Almhütte is the one secret room with nothing in it to fight.
 */
const templates = ROOM_TEMPLATES.map((room, index) =>
  validateRoomTemplate(room, `room[${String(index)}]`, ENEMY_DEFINITIONS),
);
const alpenTemplates = templates.filter((template) =>
  template.metadata.floorTags.includes('alpen'),
);
const own = alpenTemplates.filter((template) => template.id.startsWith('alpen-'));
const config = FLOOR_CONFIGS.find((candidate) => candidate.floorTag === 'alpen');

const layoutsOf = (template: (typeof templates)[number]) =>
  isMultiCellRoomTemplate(template) ? template.cells : [template];

describe('floor 4 — Die Alpen foundation', () => {
  it('generates a valid floor from the alpen template pool', () => {
    expect(config).toBeDefined();
    if (config === undefined) {
      return;
    }
    for (let seed = 0; seed < 25; seed++) {
      const plan = generateFloor(new Rng(seed + 400), config, templates);
      expect(validateFloorPlan(plan, templates), `seed ${String(seed)}`).toEqual([]);
    }
  });

  it('authors a dozen rooms of its own, in more than one shape', () => {
    expect(own.length).toBeGreaterThanOrEqual(12);
    expect(new Set(own.map((template) => template.metadata.shape)).size).toBeGreaterThanOrEqual(3);
  });

  it('alpen-boss is the open glacier #437 asks for: two boulders, three ice sheets, no other hazard', () => {
    const boss = own.find((template) => template.id === 'alpen-boss');
    expect(boss?.metadata.specialRole).toBe('boss');
    if (boss === undefined || isMultiCellRoomTemplate(boss)) {
      throw new Error('alpen-boss should be a single cell');
    }
    expect(boss.obstacles).toHaveLength(2);
    expect(boss.hazards.filter((hazard) => hazard.type === 'ice')).toHaveLength(3);
    expect(boss.hazards.every((hazard) => hazard.type === 'ice')).toBe(true);
    const compiled = compileRoomTemplate(boss, 4, 'alpen-boss', ENEMY_DEFINITIONS);
    expect(compiled.geometry.iceCount).toBe(3);
    expect(compiled.geometry.blockCount).toBe(2);
  });

  it('every weather lane covers a whole cell, and no arena has one', () => {
    for (const template of own) {
      for (const layout of layoutsOf(template)) {
        for (const hazard of layout.hazards) {
          if (hazard.type === 'avalanche' || hazard.type === 'wind') {
            expect(hazard, template.id).toMatchObject({ x: 16, y: 16, width: 208, height: 112 });
            expect(template.metadata.specialRole, template.id).toBeUndefined();
          }
        }
      }
    }
  });

  it('keeps its cover stone: nothing here is wood for a Borkenkäfer', () => {
    for (const template of own) {
      for (const layout of layoutsOf(template)) {
        for (const obstacle of layout.obstacles) {
          expect(obstacle.material, template.id).toBeUndefined();
        }
      }
    }
    const spec = {
      rng: new Rng(7),
      floorTag: 'alpen',
      floor: 4,
      roomId: 'r0',
      doors: ['north', 'south'] as const,
      distanceFromStart: 2,
      role: 'normal' as const,
    };
    const generated = generateRoom(spec as never, {
      ...DEFAULT_ROOM_GEN_TUNING,
      ...ROOM_GEN_FLOOR_OVERRIDES.alpen,
    });
    expect(generated.obstacles.every((obstacle) => obstacle.material === undefined)).toBe(true);
  });

  it('Die Almhütte is a secret room with nothing to fight and something to eat', () => {
    const hut = own.find((template) => template.id === 'alpen-secret-almhuette');
    expect(hut?.metadata.specialRole).toBe('secret');
    if (hut === undefined || isMultiCellRoomTemplate(hut)) {
      throw new Error('the Almhütte should be a single cell');
    }
    expect(hut.enemySpawns).toEqual([]);
    expect(hut.spawnGroups).toEqual([]);
    // Food, not beer: a sober run must find no Maß authored into a room
    // (`tests/content/sober-run.test.ts`), and a rest is a rest either way.
    expect(hut.pickupSpawns.map((pickup) => pickup.type)).toEqual([
      'bratwurst-full',
      'weisswurst-full',
    ]);
    expect(hut.decorativeProps.map((prop) => prop.type)).toContain('huette');
  });

  it('the generated rooms get the floor’s weather, and only this floor does', () => {
    const params = { ...DEFAULT_ROOM_GEN_TUNING, ...ROOM_GEN_FLOOR_OVERRIDES.alpen };
    let avalanches = 0;
    let gusts = 0;
    let ice = 0;
    for (let seed = 0; seed < 200; seed++) {
      const room = generateRoom(
        {
          rng: new Rng(seed * 13 + 1),
          floorTag: 'alpen',
          floor: 4,
          roomId: `r${String(seed)}`,
          doors: ['north', 'south'],
          distanceFromStart: 2,
          role: 'normal',
        } as never,
        params,
      );
      const types = room.hazards.map((hazard) => hazard.type);
      avalanches += types.includes('avalanche') ? 1 : 0;
      gusts += types.includes('wind') ? 1 : 0;
      ice += types.includes('ice') ? 1 : 0;
      expect(types.every((type) => type === 'avalanche' || type === 'wind' || type === 'ice')).toBe(
        true,
      );
    }
    expect(avalanches).toBeGreaterThan(10);
    expect(gusts).toBeGreaterThan(15);
    expect(ice).toBeGreaterThan(15);
    for (const tag of ['cellar', 'rural', 'wald']) {
      const other = { ...DEFAULT_ROOM_GEN_TUNING, ...ROOM_GEN_FLOOR_OVERRIDES[tag] };
      expect(other.avalancheChance).toBe(0);
      expect(other.windChance).toBe(0);
    }
  });
});
