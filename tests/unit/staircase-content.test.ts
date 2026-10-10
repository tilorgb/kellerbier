import { describe, expect, it } from 'vitest';
import { STAIRCASE_TEMPLATES } from '../../src/content/rooms/index.js';
import { generateStaircaseContent, roomGenSeed } from '../../src/sim/room/generate-room.js';
import { Rng } from '../../src/sim/rng/rng.js';
import { compileStaircaseRoom, validateStaircaseTemplate } from '../../src/sim/room/staircase.js';
import { MAX_ROOM_BLOCKS } from '../../src/sim/room/geometry.js';

const TEMPLATES = STAIRCASE_TEMPLATES.map((template, index) =>
  validateStaircaseTemplate(template, `staircase[${String(index)}]`),
);

const INWARD = {
  north: { x: 0, y: 1 },
  south: { x: 0, y: -1 },
  east: { x: -1, y: 0 },
  west: { x: 1, y: 0 },
} as const;

function contentFor(template: (typeof TEMPLATES)[number], seed: number) {
  return generateStaircaseContent({
    roomId: `r${String(seed)}`,
    floor: 1,
    floorTag: 'cellar',
    distanceFromStart: 3,
    bossDistance: 6,
    stepCount: template.stepCount,
    startDoor: template.startDoor,
    endDoor: template.endDoor,
    rngForStep: (step) => new Rng(roomGenSeed(seed, 1, `r${String(seed)}#${String(step)}`, 0)),
  });
}

describe('staircase content', () => {
  it('has a staircase to test', () => {
    expect(TEMPLATES.length).toBeGreaterThan(0);
  });

  it('is empty without content, as before', () => {
    for (const template of TEMPLATES) {
      const compiled = compileStaircaseRoom(template);
      expect(compiled.enemySpawns).toEqual([]);
      expect(compiled.decorativeProps).toEqual([]);
    }
  });

  it('puts enemies, cover and props on the steps, all on open ground, within the block budget', () => {
    let enemies = 0;
    let props = 0;
    let withCover = 0;
    for (const template of TEMPLATES) {
      for (let seed = 0; seed < 60; seed++) {
        const baseBlocks = compileStaircaseRoom(template).geometry.blockCount;
        const compiled = compileStaircaseRoom(template, contentFor(template, seed), 1);
        const { geometry } = compiled;
        expect(geometry.blockCount, `${template.id} seed ${String(seed)}`).toBeLessThanOrEqual(
          MAX_ROOM_BLOCKS,
        );
        if (geometry.blockCount > baseBlocks) {
          withCover += 1;
        }
        for (const spawn of compiled.enemySpawns) {
          expect(
            geometry.isClear(spawn.x, spawn.y, 6),
            `${template.id} seed ${String(seed)} enemy at ${String(spawn.x)},${String(spawn.y)}`,
          ).toBe(true);
        }
        enemies += compiled.enemySpawns.length;
        props += compiled.decorativeProps.length;
      }
    }
    expect(enemies).toBeGreaterThan(0);
    expect(props).toBeGreaterThan(0);
    expect(withCover).toBeGreaterThan(0);
  });

  it('keeps the way from the first door to the last open, whatever stands on the steps', () => {
    const RADIUS = 6;
    const CELL = 4;
    for (const template of TEMPLATES) {
      for (let seed = 0; seed < 40; seed++) {
        const compiled = compileStaircaseRoom(template, contentFor(template, seed), 1);
        const { geometry } = compiled;
        const inside = (door: typeof compiled.startDoor) => ({
          x: door.x + INWARD[door.direction].x * 14,
          y: door.y + INWARD[door.direction].y * 14,
        });
        const from = inside(compiled.startDoor);
        const to = inside(compiled.endDoor);
        const key = (x: number, y: number): string => `${String(x)},${String(y)}`;
        const seen = new Set<string>([key(from.x, from.y)]);
        const queue = [from];
        let reached = false;
        // Appending while iterating is deliberate: a for-of over an array visits
        // elements pushed during the loop, which makes this a plain BFS queue.
        for (const here of queue) {
          if (Math.abs(here.x - to.x) <= CELL && Math.abs(here.y - to.y) <= CELL) {
            reached = true;
            break;
          }
          for (const [dx, dy] of [
            [CELL, 0],
            [-CELL, 0],
            [0, CELL],
            [0, -CELL],
          ] as const) {
            const next = { x: here.x + dx, y: here.y + dy };
            const id = key(next.x, next.y);
            if (!seen.has(id) && geometry.isClear(next.x, next.y, RADIUS)) {
              seen.add(id);
              queue.push(next);
            }
          }
        }
        expect(reached, `${template.id} seed ${String(seed)}`).toBe(true);
      }
    }
  });
});
