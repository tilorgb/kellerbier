import {
  BARREL_CRITTER_CHANCE,
  BARREL_CRITTER_IDS,
  BARREL_DROP_TABLE,
  ENEMY_DROP_TABLES,
} from '../../content/pickups/index.js';
import { EventKind } from '../events/queue.js';
import type { GameSim } from '../game/sim.js';
import { propKindIndex } from '../game/prop-kinds.js';
import { ENEMY_STRIDE, isEnemyElite } from './enemy.js';

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
    dropFromBarrel(sim, index);
    return;
  }

  const base = index * ENEMY_STRIDE;
  const definitionIndex = sim.enemy.data[base] ?? 0;
  const tier = sim.enemies.at(definitionIndex).lootTier;
  // A body that is terrain rather than a creature — Bieber's rolling log
  // (#467) — leaves nothing behind when it is shot to pieces.
  if (tier === 'none') {
    return;
  }

  const atX = sim.events.x[slot] ?? 0;
  const atY = sim.events.y[slot] ?? 0;
  // An elite (#156) always leaves something — its own tier table, with the
  // "nothing" outcome taken out (`GameSim.dropLoot`'s `guaranteed`). The
  // reward half of "hits double, drops loot": the mask check above still
  // holds here because entity teardown is deferred past the loot pass.
  const elite = isEnemyElite(sim, index);
  // An elite's guaranteed drop is sometimes a Chest instead (#353) — never a
  // Locked Chest, since the elite fight was already the price. Rolled off
  // the same loot stream `dropLoot` reads.
  if (elite && sim.random.items.chance(sim.tuning.chest.eliteChestChance)) {
    sim.dropPickupAt('chest', atX, atY);
    return;
  }
  sim.dropLoot(ENEMY_DROP_TABLES[tier], atX, atY, elite);
}

const BARREL_KIND = propKindIndex('barrel');

/**
 * A broken barrel: now and then something crawls out of it (a Schimmelfleck
 * or a Bierratte, `BARREL_CRITTER_CHANCE`), otherwise a rare roll of small
 * change off `BARREL_DROP_TABLE`. Only `barrel` — the maypole, a hay bale and
 * a log are cover, not containers. Both rolls come off the loot stream, so a
 * seeded run breaks the same barrels open onto the same things.
 */
function dropFromBarrel(sim: GameSim, index: number): void {
  if (
    ((sim.world.masks[index] ?? 0) & sim.propKind.bit) === 0 ||
    (sim.propKind.data[index] ?? 0) !== BARREL_KIND
  ) {
    return;
  }
  // Where the barrel stood, not where the killing shot struck its rim.
  const atX = sim.positionX(index);
  const atY = sim.positionY(index);
  const random = sim.random.items;
  if (random.chance(BARREL_CRITTER_CHANCE)) {
    const id = BARREL_CRITTER_IDS[random.nextInt(0, BARREL_CRITTER_IDS.length)] ?? '';
    const definition = sim.enemies.indexOf(id);
    // Both ids are content this file names directly — a missing one is a
    // content bug, and `tests/unit/barrel-loot.test.ts` keeps them resolving.
    if (definition >= 0) {
      sim.spawnEnemyKind(definition, atX, atY);
    }
    return;
  }
  sim.dropLoot(BARREL_DROP_TABLE, atX, atY);
}
