import { describe, expect, it } from 'vitest';
import cellarCrossroads from '../../src/content/rooms/cellar.json';
import { GameSim } from '../../src/sim/game/sim.js';
import { createInputFrame } from '../../src/sim/input/frame.js';
import { ParticleKind } from '../../src/sim/particle/store.js';
import { doorCentre } from '../../src/sim/room/template.js';

/**
 * A cleared room puffs dust at each door as it opens (#153) — and, on purpose,
 * at a secret room's still-hidden wall too: the puff is a hint that something
 * is behind it.
 */

function dustNear(sim: GameSim, x: number, y: number, radius: number): number {
  let count = 0;
  sim.particles.forEachLive((i) => {
    if (sim.particles.kind[i] !== ParticleKind.Dust) return;
    const dx = (sim.particles.x[i] ?? 0) - x;
    const dy = (sim.particles.y[i] ?? 0) - y;
    if (dx * dx + dy * dy <= radius * radius) count += 1;
  });
  return count;
}

describe('the room-clear door puff', () => {
  it('puffs at the open doors and at a hidden secret wall, as a hint', () => {
    const sim = new GameSim({
      roomTemplate: cellarCrossroads,
      floor: 1,
      hiddenDoors: [{ direction: 'north', cellCol: 0, cellRow: 0 }],
    });
    expect(sim.liveEnemyCount).toBeGreaterThan(0);
    const enemies: number[] = [];
    sim.world.forEach(sim.enemyMask, (i) => enemies.push(i));
    for (const i of enemies) sim.kill(i);
    sim.particles.clear();
    sim.step(createInputFrame());

    const hidden = sim.allRoomDoors.find((door) => door.direction === 'north');
    const open = sim.doors.find((door) => door.direction === 'east');
    if (hidden === undefined || open === undefined) {
      throw new Error('cellar.json needs a north and an east door for this test');
    }
    const hiddenAt = doorCentre(sim.room, hidden);
    const openAt = doorCentre(sim.room, open);
    expect(dustNear(sim, openAt.x, openAt.y, 12)).toBeGreaterThan(0);
    expect(dustNear(sim, hiddenAt.x, hiddenAt.y, 12)).toBeGreaterThan(0);
    // Still a wall: the hint gives nothing away for free.
    expect(sim.doors.some((door) => door.direction === 'north')).toBe(false);
  });
});
