import { describe, expect, it } from 'vitest';
import { ENEMY_DEFINITIONS } from '../../src/content/enemies/index.js';
import { entityIndex } from '../../src/sim/ecs/entity.js';
import { GameSim } from '../../src/sim/game/sim.js';
import { createInputFrame } from '../../src/sim/input/frame.js';
import { applyDamageAt } from '../../src/sim/systems/impact.js';

/**
 * Rooted enemies: the Fliegenpilz in the ground, the Bachforelle in its stream,
 * the Specht on its wall, the Waldradl on its spot, the Gondola on its cable. A shot hurts
 * them and does not shove them.
 */

const IDLE = createInputFrame();

/** A copy of every definition with a shove-able twin of the Fliegenpilz. */
const ENEMIES = [
  ...ENEMY_DEFINITIONS,
  ...ENEMY_DEFINITIONS.filter((definition) => definition.id === 'fliegenpilz').map(
    (definition) => ({ ...definition, id: 'fliegenpilz-loose', rooted: false }),
  ),
];

/** How far the body at (`x`, `y`) of kind `id` travels after one shot from the left. */
function drift(id: string): number {
  const sim = new GameSim({ seed: 1, population: 'empty', enemies: ENEMIES });
  const index = entityIndex(sim.spawnEnemyKind(sim.enemies.indexOf(id), 200, 60));
  sim.world.flush();
  const startX = sim.positionX(index);
  const startY = sim.positionY(index);
  // Normal points back along the shot: a shot travelling +x has normal -x.
  applyDamageAt(sim, index, 1, startX - 4, startY, -1, 0, 0);
  for (let tick = 0; tick < 20; tick++) {
    sim.step(IDLE);
  }
  return Math.hypot(sim.positionX(index) - startX, sim.positionY(index) - startY);
}

describe('rooted enemies', () => {
  it("are the Fliegenpilz, the Bachforelle, the Specht, the Waldradl, Bieber's rolling logs and the Gondola", () => {
    const rooted = ENEMY_DEFINITIONS.filter((definition) => definition.rooted === true)
      .map((definition) => definition.id)
      .sort();
    expect(rooted).toEqual([
      'bachforelle',
      'bieber-log-east',
      'bieber-log-west',
      'fliegenpilz',
      'specht',
      'the-gondola',
      'waldradl',
    ]);
  });

  it('are not pushed by a shot, where the same body unrooted is', () => {
    expect(drift('fliegenpilz-loose')).toBeGreaterThan(0.5);
    expect(drift('fliegenpilz')).toBe(0);
  });
});
