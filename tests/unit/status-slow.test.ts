import { describe, expect, it } from 'vitest';
import { entityIndex } from '../../src/sim/ecs/entity.js';
import { GameSim } from '../../src/sim/game/sim.js';
import { RoomGeometry } from '../../src/sim/room/geometry.js';
import {
  STATUS_EFFECT_STRIDE,
  STATUS_SLOW,
  stepStatusEffects,
} from '../../src/sim/systems/status-effects.js';

function simWithEnemy(): { sim: GameSim; enemy: number } {
  const sim = new GameSim({ room: new RoomGeometry(0, 0, 320, 180), population: 'empty' });
  const enemy = entityIndex(sim.spawnEnemyKind(sim.enemies.indexOf('kellerassel'), 200, 90));
  sim.world.flush();
  return { sim, enemy };
}

describe('the slow status (#54)', () => {
  it('halves a body rather than stopping it, and runs down', () => {
    const { sim, enemy } = simWithEnemy();
    sim.applyStatusEffect(enemy, 'slow', 10);
    sim.velocity.data[enemy * 2] = 2;
    stepStatusEffects(sim);
    expect(sim.velocity.data[enemy * 2]).toBeCloseTo(2 * sim.tuning.projectileTags.slowSpeedFactor);
    expect(sim.statusEffect.data[enemy * STATUS_EFFECT_STRIDE + STATUS_SLOW]).toBe(9);
    // A hindrance, not a freeze.
    expect(sim.tuning.projectileTags.slowSpeedFactor).toBeGreaterThan(
      sim.tuning.projectileTags.freezeSlowFactor * 2,
    );
  });

  it('does not stack with a freeze: the stronger one wins', () => {
    const { sim, enemy } = simWithEnemy();
    sim.applyStatusEffect(enemy, 'slow', 10);
    sim.applyStatusEffect(enemy, 'freeze', 10);
    sim.velocity.data[enemy * 2] = 2;
    stepStatusEffects(sim);
    expect(sim.velocity.data[enemy * 2]).toBeCloseTo(
      2 * sim.tuning.projectileTags.freezeSlowFactor,
    );
  });
});
