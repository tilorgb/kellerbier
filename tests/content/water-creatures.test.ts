import { describe, expect, it } from 'vitest';
import { ENEMY_DEFINITIONS } from '../../src/content/enemies/index.js';
import { ROOM_TEMPLATES } from '../../src/content/rooms/index.js';
import { EnemyRegistry } from '../../src/sim/enemy/registry.js';

/**
 * A water creature (#408, the Bachforelle — any enemy with a `swimInZone`
 * state) lives in its stream from the moment it spawns, and in a room with
 * no stream it is not spawned at all (`GameSim.spawnEnemyKind`'s graceful
 * gap). That runtime fallback protects a player from a content gap; this is
 * what keeps an authored room from ever having one (`CLAUDE.md`).
 *
 * Walks the template JSON rather than a compiled room, so a choice that
 * only *might* be rolled — one option among several in a spawn group —
 * still has to be in a room that can hold it.
 */

const registry = new EnemyRegistry(ENEMY_DEFINITIONS);
const waterCreatures = registry.all.filter((enemy) => enemy.zone !== null).map((enemy) => enemy.id);

/** Every `enemyId` named anywhere in a template, and every hazard `type`. */
function scan(node: unknown, enemyIds: Set<string>, hazards: Set<string>): void {
  if (Array.isArray(node)) {
    for (const child of node) {
      scan(child, enemyIds, hazards);
    }
    return;
  }
  if (node === null || typeof node !== 'object') {
    return;
  }
  const record = node as Record<string, unknown>;
  if (typeof record.enemyId === 'string') {
    enemyIds.add(record.enemyId);
  }
  if (Array.isArray(record.hazards)) {
    for (const hazard of record.hazards) {
      const type = (hazard as { type?: unknown }).type;
      if (typeof type === 'string') {
        hazards.add(type);
      }
    }
  }
  for (const value of Object.values(record)) {
    scan(value, enemyIds, hazards);
  }
}

describe('water creatures only spawn where there is water (#408)', () => {
  it('finds the water creatures this was written against', () => {
    expect(waterCreatures).toContain('bachforelle');
  });

  const rooms = ROOM_TEMPLATES.map((room) => {
    const enemyIds = new Set<string>();
    const hazards = new Set<string>();
    scan(room, enemyIds, hazards);
    return { id: (room as { id?: string }).id ?? '?', enemyIds, hazards };
  }).filter((room) => waterCreatures.some((id) => room.enemyIds.has(id)));

  it('finds at least one authored room that spawns one', () => {
    expect(rooms.length).toBeGreaterThan(0);
  });

  it.each(rooms.map((room) => [room.id, room] as const))('%s has a waldbach', (_id, room) => {
    expect([...room.hazards]).toContain('waldbach');
  });
});
