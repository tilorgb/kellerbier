import { describe, expect, it } from 'vitest';
import { GameSim } from '../../src/sim/game/sim.js';
import { RoomGeometry } from '../../src/sim/room/geometry.js';
import { entityIndex } from '../../src/sim/ecs/entity.js';
import {
  STATUS_EFFECT_STRIDE,
  STATUS_FREEZE_COOLDOWN,
} from '../../src/sim/systems/status-effects.js';

/**
 * Status durations are stored per slot. A body that dies (or is cleared with
 * its room) while burning must not hand that burn to whatever is spawned into
 * its slot next — with Steckerlfisch, a fresh room's enemies and pickups
 * caught fire on entry.
 */

function emptySim(): GameSim {
  const sim = new GameSim({ room: new RoomGeometry(0, 0, 320, 180) });
  const player = sim.playerIndex;
  const doomed: number[] = [];
  sim.world.forEach(sim.collidableMask, (i) => {
    if (i !== player) doomed.push(i);
  });
  for (const i of doomed) sim.world.destroy(sim.world.entityAt(i));
  sim.world.flush();
  return sim;
}

function statusOf(sim: GameSim, index: number): number[] {
  // Every status the row holds — burn, poison, freeze, slow, the freeze
  // cooldown and daze — not just the ones a test happens to name.
  const base = index * STATUS_EFFECT_STRIDE;
  return Array.from(sim.statusEffect.data.slice(base, base + STATUS_EFFECT_STRIDE));
}

describe('a recycled slot starts with no status effects', () => {
  const spawners: [string, (sim: GameSim) => number][] = [
    [
      'an enemy',
      (sim) => entityIndex(sim.spawnEnemyKind(sim.enemies.indexOf('bierratte'), 160, 90)),
    ],
    ['a prop', (sim) => entityIndex(sim.spawnTarget(160, 90))],
    ['a pickup', (sim) => entityIndex(sim.spawnPickup('biermarke-1', 160, 90))],
    ['a Bierfassl', (sim) => entityIndex(sim.spawnBierfassl(160, 90, 0, 0, false))],
  ];

  for (const [what, spawn] of spawners) {
    it(`${what} spawned where a body died under every status`, () => {
      const sim = emptySim();
      const victim = sim.spawnTarget(160, 90);
      sim.world.flush();
      const slot = entityIndex(victim);
      sim.applyStatusEffect(slot, 'burn', 300);
      sim.applyStatusEffect(slot, 'poison', 300);
      sim.applyStatusEffect(slot, 'freeze', 300);
      sim.applyStatusEffect(slot, 'slow', 300);
      sim.applyStatusEffect(slot, 'daze', 300);
      sim.statusEffect.data[slot * STATUS_EFFECT_STRIDE + STATUS_FREEZE_COOLDOWN] = 300;
      expect(statusOf(sim, slot).every((ticks) => ticks > 0)).toBe(true);
      sim.world.destroy(victim);
      sim.world.flush();

      const reused = spawn(sim);
      expect(reused).toBe(slot);
      expect(statusOf(sim, reused)).toEqual(new Array<number>(STATUS_EFFECT_STRIDE).fill(0));
    });
  }
});
