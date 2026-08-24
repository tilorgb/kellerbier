import { ENEMY_DROP_TABLES } from '../../content/pickups/index.js';
import { EventKind } from '../events/queue.js';
import type { GameSim } from '../game/sim.js';
import { ENEMY_STRIDE } from './enemy.js';

/**
 * What a kill leaves behind.
 *
 * Read from the death events, the same reason `splitFromEvent`
 * (`systems/enemy.ts`) is: a drop happens the same way whether the enemy was
 * shot, blown up by a Bierfassl or removed by a future item, and a headless
 * test can assert on it. The room-clear roll is a `GameSim` private method
 * instead of a system here — it needs `roomClearedIds`, which nothing outside
 * `GameSim` has a reason to see.
 *
 * @hot — runs in the frame loop. Nothing in here may allocate; see the
 * `no-hot-allocation` rule in tools/eslint/.
 */
export function stepLootDrops(sim: GameSim): void {
  activeSim = sim;
  sim.events.forEach(dropFromEvent);
  activeSim = null;
}

let activeSim: GameSim | null = null;

function dropFromEvent(slot: number): void {
  const sim = activeSim;
  if (sim?.events.kind[slot] !== EventKind.Death) {
    return;
  }
  const index = sim.events.subject[slot] ?? 0;
  if (((sim.world.masks[index] ?? 0) & sim.enemyMask) !== sim.enemyMask) {
    return;
  }

  const base = index * ENEMY_STRIDE;
  const definitionIndex = sim.enemy.data[base] ?? 0;
  const tier = sim.enemies.at(definitionIndex).lootTier;

  const atX = sim.events.x[slot] ?? 0;
  const atY = sim.events.y[slot] ?? 0;
  sim.dropLoot(ENEMY_DROP_TABLES[tier], atX, atY);
}
