import { describe, expect, it } from 'vitest';
import { entityIndex } from '../../src/sim/ecs/entity.js';
import { GameSim } from '../../src/sim/game/sim.js';
import { applyDamageAt } from '../../src/sim/systems/impact.js';
import { createInputFrame } from '../../src/sim/input/frame.js';

const IDLE = createInputFrame();

/** Puts one authored enemy in the room and returns its storage slot. */
function place(sim: GameSim, id: string, x: number, y: number): number {
  const entity = sim.spawnEnemyKind(sim.enemies.indexOf(id), x, y);
  sim.world.flush();
  return entityIndex(entity);
}

/**
 * `sim.enemyIdAt` — `app/audio/sfx-player.ts`'s hook for picking a hit/death
 * sound by what was actually hit.
 *
 * The death case is the one worth a regression test on its own:
 * `GameSim.kill` frees the slot via `world.flush()` at the very end of
 * `step()`, before `app/main.ts`'s `advanceOneTick` ever gets to call
 * `playImpactAudio` afterward — so a naive "read the slot's live component
 * data" implementation resolves to nothing for the exact tick a kill
 * happens, which is also the one tick a death sound needs an enemy id for.
 */
describe('GameSim.enemyIdAt', () => {
  it('resolves a live enemy by its storage slot', () => {
    const sim = new GameSim();
    const index = place(sim, 'kellerassel', 150, 150);
    sim.step(IDLE);
    expect(sim.enemyIdAt(index)).toBe('kellerassel');
  });

  it('is null for the player and for an empty slot', () => {
    const sim = new GameSim();
    expect(sim.enemyIdAt(sim.playerIndex)).toBeNull();
    expect(sim.enemyIdAt(99999)).toBeNull();
  });

  it('still resolves a kill after `world.flush()` frees the slot — the exact ordering `playImpactAudio` runs into', () => {
    const sim = new GameSim();
    const index = place(sim, 'bierratte', 150, 150);
    const definition = sim.enemies.at(sim.enemies.indexOf('bierratte'));
    sim.step(IDLE);

    // The kill, mid-tick — same as a shot's `stepImpact` would do inside `sim.step()`.
    applyDamageAt(
      sim,
      index,
      definition.health,
      sim.positionX(index),
      sim.positionY(index),
      0,
      0,
      -1,
    );
    // `step()`'s own end-of-tick `world.flush()`, reproduced directly rather
    // than via a second `sim.step()` call — a second `step()` would also
    // clear `deathEnemyIdByIndex` at its own start, which is a different
    // tick's bookkeeping and would defeat exactly what this test checks.
    sim.world.flush();
    expect(sim.world.isAlive(sim.world.entityAt(index))).toBe(false);

    // The naive "read the slot's live component data" version of this
    // method returns null here — this is the regression this test guards.
    expect(sim.enemyIdAt(index)).toBe('bierratte');
  });

  it('forgets a kill once the next tick starts', () => {
    const sim = new GameSim();
    const index = place(sim, 'kellerassel', 150, 150);
    const definition = sim.enemies.at(sim.enemies.indexOf('kellerassel'));
    sim.step(IDLE);
    applyDamageAt(
      sim,
      index,
      definition.health,
      sim.positionX(index),
      sim.positionY(index),
      0,
      0,
      -1,
    );
    sim.world.flush();
    expect(sim.enemyIdAt(index)).toBe('kellerassel');

    sim.step(IDLE);
    expect(sim.enemyIdAt(index)).toBeNull();
  });
});
