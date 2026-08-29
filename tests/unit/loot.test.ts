import { describe, expect, it } from 'vitest';
import { GameSim } from '../../src/sim/game/sim.js';
import { RoomGeometry } from '../../src/sim/room/geometry.js';
import { createInputFrame } from '../../src/sim/input/frame.js';
import type { DropTable } from '../../src/sim/pickup/definition.js';
import { ProjectileTeam } from '../../src/sim/projectile/store.js';

function bareRoom(): RoomGeometry {
  return new RoomGeometry(0, 0, 320, 180);
}

/** A sim whose training targets have been cleared out of the way. */
function emptySim(options: { promilleUnlocked: boolean }): GameSim {
  const sim = new GameSim({ room: bareRoom(), promilleUnlocked: options.promilleUnlocked });
  const playerSlot = sim.playerIndex;
  const doomed: number[] = [];
  sim.world.forEach(sim.collidableMask, (index) => {
    if (index !== playerSlot) {
      doomed.push(index);
    }
  });
  for (const index of doomed) {
    sim.world.destroy(sim.world.entityAt(index));
  }
  sim.world.flush();
  return sim;
}

const idle = () => createInputFrame();

/** How many currently-alive pickup entities resolve to `id`. */
function countPickups(sim: GameSim, id: string): number {
  let count = 0;
  sim.world.forEach(sim.world.maskOf(sim.pickupKind), (index) => {
    if (sim.pickups.at(sim.pickupKind.data[index] ?? -1).id === id) {
      count += 1;
    }
  });
  return count;
}

describe('GameSim.dropLoot', () => {
  const table: DropTable = {
    sober: [
      { pickupId: null, weight: 1 },
      { pickupId: 'biermarke-1', weight: 1 },
    ],
    promilled: [
      { pickupId: null, weight: 1 },
      { pickupId: 'beer', weight: 1 },
    ],
  };

  it('never rolls Beer in a sober run, across many rolls', () => {
    const sim = emptySim({ promilleUnlocked: false });
    for (let roll = 0; roll < 200; roll++) {
      sim.dropLoot(table, 160, 90);
    }
    // `dropLoot` only spawns an entity — collection is a separate mechanism
    // (`systems/pickup.ts`, covered in `pickups.test.ts`) — so the roll
    // itself is checked at the entity level, not through the wallet.
    sim.world.flush();
    expect(countPickups(sim, 'biermarke-1')).toBeGreaterThan(0);
    expect(countPickups(sim, 'beer')).toBe(0);
  });

  it('reads the promilled variant once unlocked', () => {
    const sim = emptySim({ promilleUnlocked: true });
    for (let roll = 0; roll < 200; roll++) {
      sim.dropLoot(table, 160, 90);
    }
    sim.world.flush();
    expect(countPickups(sim, 'beer')).toBeGreaterThan(0);
  });

  it('boosts a need the player is low on', () => {
    const evenTable: DropTable = {
      sober: [
        { pickupId: 'biermarke-1', weight: 1 },
        { pickupId: 'kellerschluessel', weight: 1 },
      ],
      promilled: [
        { pickupId: 'biermarke-1', weight: 1 },
        { pickupId: 'kellerschluessel', weight: 1 },
      ],
    };
    const sim = emptySim({ promilleUnlocked: false });
    // Zero currency, some keys already — currency is "low", keys are not.
    sim.addKeys(5);
    for (let roll = 0; roll < 300; roll++) {
      sim.dropLoot(evenTable, 160, 90);
    }
    sim.world.flush();
    // Even base weights, boosted only on the currency side, should land
    // there noticeably more than the unboosted side.
    expect(countPickups(sim, 'biermarke-1')).toBeGreaterThan(countPickups(sim, 'kellerschluessel'));
  });
});

describe('GameSim.dropLoot around a blocked point', () => {
  it('does not spawn on top of a block sitting on the requested point itself', () => {
    const room = bareRoom();
    // Block the room's exact centre — the same point `rollRoomClearLoot`
    // asks `dropLoot` to spawn at, and the one case `safeSpawnPoint`'s
    // few-step nudge toward the centre can never escape: nudging toward a
    // point that already *is* the block is a no-op every step.
    const centreX = (room.minX + room.maxX) / 2;
    const centreY = (room.minY + room.maxY) / 2;
    room.addBlock(centreX - 20, centreY - 20, centreX + 20, centreY + 20);
    const sim = new GameSim({ seed: 1, population: 'empty', room });
    const table: DropTable = {
      sober: [{ pickupId: 'biermarke-1', weight: 1 }],
      promilled: [{ pickupId: 'biermarke-1', weight: 1 }],
    };
    sim.dropLoot(table, centreX, centreY);
    sim.world.flush();
    const radius = sim.pickups.get('biermarke-1').radius;
    let found = false;
    sim.world.forEach(sim.world.maskOf(sim.pickupKind), (index) => {
      found = true;
      expect(sim.room.isClear(sim.positionX(index), sim.positionY(index), radius)).toBe(true);
    });
    expect(found).toBe(true);
  });
});

describe('loot on enemy death', () => {
  it('drops a pickup entity, over enough kills, from the tier the enemy resolves to', () => {
    const sim = emptySim({ promilleUnlocked: true });
    const bierratteId = sim.enemies.indexOf('bierratte');
    expect(bierratteId).toBeGreaterThanOrEqual(0);

    // A weak-tier kill is now an 8%-ish drop chance (#loot-density) rather
    // than the original 15% — more kills, so "eventually drops something"
    // still holds with a comfortable margin rather than a bare majority.
    for (let kill = 0; kill < 100; kill++) {
      const x = sim.positionX(sim.playerIndex) + 60 + kill;
      const y = sim.positionY(sim.playerIndex);
      sim.spawnEnemyKind(bierratteId, x, y);
      sim.world.flush();
      sim.projectiles.spawn(x - 20, y, 4, 0, 2, 10, 30, ProjectileTeam.Player);
      for (let tick = 0; tick < 20; tick++) {
        sim.step(idle());
      }
    }

    let pickupCount = 0;
    sim.world.forEach(sim.world.maskOf(sim.pickupKind), () => {
      pickupCount += 1;
    });
    expect(pickupCount).toBeGreaterThan(0);
  });
});
