import { describe, expect, it } from 'vitest';
import { ENEMY_DEFINITIONS } from '../../src/content/enemies/index.js';
import { FLOOR_CONFIGS } from '../../src/content/floors/definition.js';
import { ROOM_TEMPLATES } from '../../src/content/rooms/index.js';
import type { RoomTemplate } from '../../src/content/rooms/definition.js';
import { generateFloor } from '../../src/sim/room/floor-plan.js';
import { chooseSprinkle, sprinkleCandidates } from '../../src/sim/room/sprinkle.js';
import { validateRoomTemplate } from '../../src/sim/room/template.js';
import { Rng } from '../../src/sim/rng/rng.js';
import { roomGenSeed } from '../../src/sim/room/generate-room.js';

/**
 * #272: sprinkled authored templates must never repeat on one floor. A
 * bigger floor (#271, not yet landed) makes a repeat the *common* case at
 * today's `authoredRoomChance` (0.12) and pool size — this is the CI
 * guardrail for that, exercising the real content pool and real
 * `generateFloor` output the way `app/main.ts`'s `rebuildProceduralRooms`
 * actually calls `chooseSprinkle`.
 */

const TEMPLATE_POOL: readonly RoomTemplate[] = ROOM_TEMPLATES.map((room, index) =>
  validateRoomTemplate(room, `room[${String(index)}]`, ENEMY_DEFINITIONS),
);

describe('sprinkleCandidates', () => {
  it('excludes special-role rooms and rooms of the wrong shape or floor tag', () => {
    const floorTag = 'cellar';
    const room = {
      id: 'r1',
      cells: [{ x: 0, y: 0 }],
      shape: '1x1' as const,
      role: 'normal' as const,
      doors: [],
      distanceFromStart: 1,
      templateId: 'placeholder',
    };
    const candidates = sprinkleCandidates(room, floorTag, TEMPLATE_POOL);
    expect(candidates.length).toBeGreaterThan(0);
    for (const candidate of candidates) {
      expect(candidate.template.metadata.specialRole).toBeUndefined();
      expect(candidate.template.metadata.shape).toBe('1x1');
      expect(candidate.template.metadata.floorTags).toContain(floorTag);
    }
  });
});

describe('chooseSprinkle: no authored template repeats on one floor', () => {
  it('over 10,000 generated floors (floor 1 + floor 2), no floor sprinkles the same template twice', () => {
    const floorConfigsToTest = FLOOR_CONFIGS.filter((c) => c.floor === 1 || c.floor === 2);
    const floorsPerConfig = 5000;
    // Deliberately high — the real default (0.12) still exercises this, but
    // a much higher chance makes a would-be repeat near-certain without the
    // fix, so a regression fails fast rather than needing a huge N.
    const authoredRoomChance = 0.6;

    for (const config of floorConfigsToTest) {
      let floorsChecked = 0;
      let totalSprinkles = 0;
      for (let seed = 0; seed < floorsPerConfig; seed++) {
        const plan = generateFloor(new Rng(seed + 1), config, TEMPLATE_POOL);
        const sprinkledTemplateIds = new Set<string>();
        for (const room of plan.rooms) {
          if (room.role !== 'normal' || room.staircaseTemplateId !== undefined) {
            continue;
          }
          const rng = new Rng(roomGenSeed(777, plan.floor, room.id, 0));
          const sprinkle = chooseSprinkle(
            room,
            config.floorTag,
            TEMPLATE_POOL,
            sprinkledTemplateIds,
            authoredRoomChance,
            rng,
          );
          if (sprinkle !== null) {
            expect(
              sprinkledTemplateIds.has(sprinkle.id),
              `floor tag ${config.floorTag} seed ${String(seed)}: template "${sprinkle.id}" sprinkled twice`,
            ).toBe(false);
            sprinkledTemplateIds.add(sprinkle.id);
            totalSprinkles += 1;
          }
        }
        floorsChecked += 1;
      }
      expect(floorsChecked).toBe(floorsPerConfig);
      // Sanity: sprinkling is actually happening at this chance, not a
      // vacuous pass because the roll never fires.
      expect(totalSprinkles).toBeGreaterThan(0);
    }
  });

  it('falls back to null (generation) once the eligible pool is exhausted, rather than repeating', () => {
    const config = FLOOR_CONFIGS.find((c) => c.floor === 1);
    if (config === undefined) throw new Error('missing floor 1 config');
    const plan = generateFloor(new Rng(42), config, TEMPLATE_POOL);
    const normalRooms = plan.rooms.filter(
      (room) => room.role === 'normal' && room.staircaseTemplateId === undefined,
    );
    // Force every roll to "sprinkle" (chance 1) so the pool empties as fast
    // as possible, then confirm nothing after exhaustion repeats an id.
    const sprinkledTemplateIds = new Set<string>();
    let sawNullAfterFirstSprinkle = false;
    for (const room of normalRooms) {
      const rng = new Rng(roomGenSeed(1, plan.floor, room.id, 0));
      const sprinkle = chooseSprinkle(
        room,
        config.floorTag,
        TEMPLATE_POOL,
        sprinkledTemplateIds,
        1,
        rng,
      );
      if (sprinkle === null) {
        if (sprinkledTemplateIds.size > 0) {
          sawNullAfterFirstSprinkle = true;
        }
        continue;
      }
      expect(sprinkledTemplateIds.has(sprinkle.id)).toBe(false);
      sprinkledTemplateIds.add(sprinkle.id);
    }
    // With enough normal rooms and a chance of 1, the (finite) pool for at
    // least one shape/tag combination should run dry at least once.
    if (normalRooms.length > sprinkledTemplateIds.size) {
      expect(sawNullAfterFirstSprinkle).toBe(true);
    }
  });
});
