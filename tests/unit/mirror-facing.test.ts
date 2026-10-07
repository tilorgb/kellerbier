import { describe, expect, it } from 'vitest';
import { entityIndex } from '../../src/sim/ecs/entity.js';
import { GameSim } from '../../src/sim/game/sim.js';
import { RoomGeometry } from '../../src/sim/room/geometry.js';
import { AUTHORED_FACING, resolveMirrorFacing } from '../../src/render/animation/state.js';

/**
 * `facing: 'mirror'` (the Boar, the Kaninchen): faces the way it moves, and
 * the player while it stands still — never a fixed side.
 */

function scene(): { sim: GameSim; boar: number } {
  const sim = new GameSim({ seed: 2, room: new RoomGeometry(0, 0, 320, 180) });
  const boar = entityIndex(sim.spawnEnemyKind(sim.enemies.indexOf('boar'), 160, 90));
  sim.world.flush();
  return { sim, boar };
}

function put(sim: GameSim, index: number, x: number, y: number, prevX = x, prevY = y): void {
  const t = sim.transform.data;
  t[index * 4] = x;
  t[index * 4 + 1] = y;
  t[index * 4 + 2] = prevX;
  t[index * 4 + 3] = prevY;
}

describe('resolveMirrorFacing', () => {
  it('standing still, turns to the player on either side', () => {
    const { sim, boar } = scene();
    put(sim, boar, 160, 90);
    put(sim, sim.playerIndex, 60, 90);
    expect(resolveMirrorFacing(sim, boar)).toBe(-1);
    put(sim, sim.playerIndex, 260, 100);
    expect(resolveMirrorFacing(sim, boar)).toBe(1);
  });

  it('holds (0) when the player is straight above or below', () => {
    const { sim, boar } = scene();
    put(sim, boar, 160, 90);
    put(sim, sim.playerIndex, 161, 20);
    expect(resolveMirrorFacing(sim, boar)).toBe(0);
  });

  it('moving, faces the way it moves even with the player behind it', () => {
    const { sim, boar } = scene();
    put(sim, sim.playerIndex, 20, 90);
    put(sim, boar, 162, 90, 160, 90);
    expect(resolveMirrorFacing(sim, boar)).toBe(1);
    expect(resolveMirrorFacing(sim, boar)).not.toBe(AUTHORED_FACING);
  });
});
