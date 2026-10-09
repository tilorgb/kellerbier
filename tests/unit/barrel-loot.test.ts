import { describe, expect, it } from 'vitest';
import {
  BARREL_CRITTER_CHANCE,
  BARREL_CRITTER_IDS,
  BARREL_DROP_TABLE,
} from '../../src/content/pickups/index.js';
import { ENEMY_DEFINITIONS } from '../../src/content/enemies/index.js';
import { GameSim } from '../../src/sim/game/sim.js';
import { propKindIndex } from '../../src/sim/game/prop-kinds.js';
import { RoomGeometry } from '../../src/sim/room/geometry.js';
import { entityIndex } from '../../src/sim/ecs/entity.js';
import { applyDamageAt } from '../../src/sim/systems/impact.js';
import { stepLootDrops } from '../../src/sim/systems/loot.js';
import { ENEMY_STRIDE } from '../../src/sim/systems/enemy.js';

/**
 * A broken barrel very rarely spills small change, and more rarely still lets
 * a Schimmelfleck or a Bierratte out — never anything bigger.
 */

function emptySim(promilleUnlocked: boolean, seed = 1): GameSim {
  const sim = new GameSim({ room: new RoomGeometry(0, 0, 320, 180), promilleUnlocked, seed });
  const player = sim.playerIndex;
  const doomed: number[] = [];
  sim.world.forEach(sim.collidableMask, (i) => {
    if (i !== player) doomed.push(i);
  });
  for (const i of doomed) sim.world.destroy(sim.world.entityAt(i));
  sim.world.flush();
  return sim;
}

interface Tally {
  pickups: Map<string, number>;
  critters: Map<string, number>;
}

/** Breaks `count` props of `kind` one at a time and tallies what each left. */
function breakProps(sim: GameSim, count: number, kind = 'barrel'): Tally {
  const tally: Tally = { pickups: new Map(), critters: new Map() };
  for (let n = 0; n < count; n++) {
    sim.events.clear();
    const prop = sim.spawnTarget(160, 90, undefined, propKindIndex(kind));
    sim.world.flush();
    applyDamageAt(sim, entityIndex(prop), 999, 160, 90, 0, 0, -1);
    stepLootDrops(sim);
    sim.world.flush();
    const doomed: number[] = [];
    sim.world.forEach(sim.world.maskOf(sim.pickupKind), (i) => {
      const id = sim.pickups.at(sim.pickupKind.data[i] ?? -1).id;
      tally.pickups.set(id, (tally.pickups.get(id) ?? 0) + 1);
      doomed.push(i);
    });
    sim.world.forEach(sim.enemyMask, (i) => {
      const id = sim.enemies.at(sim.enemy.data[i * ENEMY_STRIDE] ?? -1).id;
      tally.critters.set(id, (tally.critters.get(id) ?? 0) + 1);
      doomed.push(i);
    });
    for (const i of doomed) sim.world.destroy(sim.world.entityAt(i));
    sim.world.flush();
  }
  return tally;
}

const total = (map: Map<string, number>) => [...map.values()].reduce((a, b) => a + b, 0);

describe('a broken barrel', () => {
  it('only ever drops a Biermarke 1, half a Bratwurst or half a Maß', () => {
    const tally = breakProps(emptySim(true), 3000);
    for (const id of tally.pickups.keys()) {
      expect(['biermarke-1', 'bratwurst-half', 'mass-half']).toContain(id);
    }
    // Rare: roughly 8% of barrels, nowhere near every one.
    const rate = total(tally.pickups) / 3000;
    expect(rate).toBeGreaterThan(0.04);
    expect(rate).toBeLessThan(0.13);
    // Half a Maß is the rarest of the three.
    expect(tally.pickups.get('mass-half') ?? 0).toBeLessThan(tally.pickups.get('biermarke-1') ?? 0);
  });

  it('never drops Maß in a sober run', () => {
    const tally = breakProps(emptySim(false), 2000);
    expect(tally.pickups.has('mass-half')).toBe(false);
  });

  it('now and then lets out a Schimmelfleck or a Bierratte, rarer than loot', () => {
    const tally = breakProps(emptySim(true, 7), 3000);
    for (const id of tally.critters.keys()) {
      expect(BARREL_CRITTER_IDS).toContain(id);
    }
    const rate = total(tally.critters) / 3000;
    expect(rate).toBeGreaterThan(0.01);
    expect(rate).toBeLessThan(0.06);
    expect(total(tally.critters)).toBeLessThan(total(tally.pickups));
  });

  it('leaves the maypole, bales and logs empty', () => {
    for (const kind of ['maypole', 'bale', 'log']) {
      const tally = breakProps(emptySim(true), 500, kind);
      expect(total(tally.pickups) + total(tally.critters)).toBe(0);
    }
  });

  it('names critters and pickups that exist, and keeps critters the rarer roll', () => {
    const enemyIds = new Set(ENEMY_DEFINITIONS.map((enemy) => enemy.id));
    for (const id of BARREL_CRITTER_IDS) expect(enemyIds.has(id)).toBe(true);
    const sim = emptySim(true);
    for (const entry of [...BARREL_DROP_TABLE.promilled, ...BARREL_DROP_TABLE.sober]) {
      if (entry.pickupId !== null)
        expect(() => sim.pickups.get(entry.pickupId ?? '')).not.toThrow();
    }
    const lootRate = (table: typeof BARREL_DROP_TABLE.sober) => {
      const sum = table.reduce((a, e) => a + e.weight, 0);
      return 1 - (table.find((e) => e.pickupId === null)?.weight ?? 0) / sum;
    };
    expect(BARREL_CRITTER_CHANCE).toBeLessThan(lootRate(BARREL_DROP_TABLE.promilled));
    expect(lootRate(BARREL_DROP_TABLE.sober)).toBeCloseTo(lootRate(BARREL_DROP_TABLE.promilled));
  });
});
