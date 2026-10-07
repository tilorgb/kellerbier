import { describe, expect, it } from 'vitest';
import { entityIndex } from '../../src/sim/ecs/entity.js';
import { GameSim } from '../../src/sim/game/sim.js';
import { createInputFrame } from '../../src/sim/input/frame.js';
import { RoomGeometry } from '../../src/sim/room/geometry.js';
import { ENEMY_FLAG_LATCHED, ENEMY_STRIDE } from '../../src/sim/systems/enemy.js';
import {
  ORDNER_ACTIVE,
  ORDNER_DIRECTION,
  ORDNER_NORTH,
  ORDNER_SHOVE_POSE,
  ORDNER_SOUTH,
  ORDNER_X,
  ORDNER_Y,
} from '../../src/sim/systems/ordner.js';

/**
 * Der Ordner, the bouncer familiar: a body at Alois's side that strides over
 * to the nearest mob that comes close and shoves *that one* away — not an
 * aura that keeps everything off the player for good.
 */

const IDLE = createInputFrame();

function bareSim(seed = 4): GameSim {
  const sim = new GameSim({ seed, room: new RoomGeometry(0, 0, 320, 180) });
  const doomed: number[] = [];
  sim.world.forEach(sim.collidableMask, (index) => {
    if (index !== sim.playerIndex) {
      doomed.push(index);
    }
  });
  for (const index of doomed) {
    sim.world.destroy(sim.world.entityAt(index));
  }
  sim.world.flush();
  return sim;
}

function spawn(sim: GameSim, id: string, x: number, y: number): number {
  const entity = sim.spawnEnemyKind(sim.enemies.indexOf(id), x, y);
  sim.world.flush();
  return entityIndex(entity);
}

function hold(sim: GameSim, index: number, x: number, y: number): void {
  const t = sim.transform.data;
  t[index * 4] = x;
  t[index * 4 + 1] = y;
  t[index * 4 + 2] = x;
  t[index * 4 + 3] = y;
  sim.velocity.data[index * 2] = 0;
  sim.velocity.data[index * 2 + 1] = 0;
}

function withOrdner(seed?: number): GameSim {
  const sim = bareSim(seed);
  sim.pickUpItem('der-ordner');
  sim.step(IDLE);
  return sim;
}

const ordnerAt = (sim: GameSim): [number, number] => [
  sim.ordner[ORDNER_X] ?? 0,
  sim.ordner[ORDNER_Y] ?? 0,
];

describe('Der Ordner, the bouncer familiar', () => {
  it('appears beside the player on pickup, and walks with him', () => {
    const sim = withOrdner();
    expect(sim.ordner[ORDNER_ACTIVE]).toBe(1);
    const [x, y] = ordnerAt(sim);
    const player = sim.playerIndex;
    expect(Math.hypot(x - sim.positionX(player), y - sim.positionY(player))).toBeLessThan(20);
    // Walk down a while: he comes too, and turns to walk that way.
    const down = createInputFrame();
    down.moveY = 127;
    for (let tick = 0; tick < 40; tick++) {
      sim.step(down);
    }
    const [x2, y2] = ordnerAt(sim);
    expect(y2).toBeGreaterThan(y + 20);
    expect(Math.hypot(x2 - sim.positionX(player), y2 - sim.positionY(player))).toBeLessThan(24);
    expect(sim.ordner[ORDNER_DIRECTION]).toBe(ORDNER_SOUTH);
  });

  it('leaves a mob outside his guard alone', () => {
    const sim = withOrdner();
    const player = sim.playerIndex;
    const far = spawn(sim, 'boar', sim.positionX(player) + 100, sim.positionY(player));
    for (let tick = 0; tick < 60; tick++) {
      hold(sim, far, sim.positionX(player) + 100, sim.positionY(player));
      sim.step(IDLE);
      expect(sim.push.data[far * 2] ?? 0).toBe(0);
    }
  });

  it('strides over to a mob in *his* reach and shoves only that one, away from him', () => {
    const sim = withOrdner();
    const [ox, oy] = ordnerAt(sim);
    const player = sim.playerIndex;
    const px = sim.positionX(player);
    const py = sim.positionY(player);
    // North of the bouncer, inside his own guard.
    const near = spawn(sim, 'boar', ox, oy - 26);
    // Close to Alois, on his far side from the bouncer — out of the bouncer's reach.
    const farSide = px + (px - ox) * 1.4;
    const second = spawn(sim, 'boar', farSide, py);
    expect(Math.hypot(farSide - ox, py - oy)).toBeGreaterThan(sim.tuning.ordner.guardRadius);
    let shovedNear = false;
    for (let tick = 0; tick < 60 && !shovedNear; tick++) {
      hold(sim, near, ox, oy - 26);
      hold(sim, second, farSide, py);
      sim.step(IDLE);
      shovedNear = (sim.push.data[near * 2 + 1] ?? 0) < 0;
      expect(sim.push.data[second * 2] ?? 0).toBe(0);
      expect(sim.push.data[second * 2 + 1] ?? 0).toBe(0);
      if (shovedNear) {
        expect(sim.ordner[ORDNER_SHOVE_POSE]).toBeGreaterThan(0);
        expect(sim.ordner[ORDNER_DIRECTION]).toBe(ORDNER_NORTH);
      }
    }
    expect(shovedNear).toBe(true);
    // No damage.
    expect(sim.health.data[near * 2]).toBe(sim.health.data[near * 2 + 1]);
    // He walked there to do it.
    const [, y] = ordnerAt(sim);
    expect(y).toBeLessThan(oy - 8);
  });

  it('does not stand guard while he is still catching up with Alois', () => {
    const sim = withOrdner();
    const player = sim.playerIndex;
    // Left well behind (a sprint, a door): put him there.
    const right = createInputFrame();
    sim.ordner[ORDNER_X] = sim.positionX(player) - 60;
    sim.ordner[ORDNER_Y] = sim.positionY(player);
    const [ox, oy] = ordnerAt(sim);
    const lag = Math.hypot(sim.positionX(player) - ox, sim.positionY(player) - oy);
    expect(lag).toBeGreaterThan(sim.tuning.ordner.nearAloisDistance);
    // A mob right next to the bouncer while he is that far behind: left be.
    const mob = spawn(sim, 'boar', ox - 12, oy);
    for (let tick = 0; tick < 5; tick++) {
      hold(sim, mob, ox - 12, oy);
      sim.step(right);
      expect(sim.push.data[mob * 2] ?? 0).toBe(0);
    }
  });

  it('trails Alois rather than sticking to him: he lags, then settles a short way off', () => {
    const sim = withOrdner();
    const player = sim.playerIndex;
    const right = createInputFrame();
    right.moveX = 127;
    const lags: number[] = [];
    for (let tick = 0; tick < 60; tick++) {
      sim.step(right);
      const [ox, oy] = ordnerAt(sim);
      lags.push(Math.hypot(sim.positionX(player) - ox, sim.positionY(player) - oy));
    }
    // Falls behind while Alois runs...
    expect(Math.max(...lags)).toBeGreaterThan(sim.tuning.ordner.comfortDistance + 10);
    for (let tick = 0; tick < 180; tick++) {
      sim.step(IDLE);
    }
    // ...and catches up to a short way off once he stops, not on top of him.
    const [ox, oy] = ordnerAt(sim);
    const rest = Math.hypot(sim.positionX(player) - ox, sim.positionY(player) - oy);
    expect(rest).toBeLessThanOrEqual(sim.tuning.ordner.comfortDistance + 2);
    expect(rest).toBeGreaterThan(sim.tuning.ordner.comfortDistance - 4);
  });

  it('finds his own way round a wall to Alois', () => {
    const room = new RoomGeometry(0, 0, 320, 180);
    // A wall between them, open at both ends.
    room.addBlock(150, 40, 158, 140);
    const sim = new GameSim({ seed: 2, room });
    const doomed: number[] = [];
    sim.world.forEach(sim.collidableMask, (index) => {
      if (index !== sim.playerIndex) {
        doomed.push(index);
      }
    });
    for (const index of doomed) {
      sim.world.destroy(sim.world.entityAt(index));
    }
    sim.world.flush();
    const player = sim.playerIndex;
    hold(sim, player, 200, 90);
    sim.pickUpItem('der-ordner');
    sim.step(IDLE);
    sim.ordner[ORDNER_X] = 110;
    sim.ordner[ORDNER_Y] = 90;
    for (let tick = 0; tick < 400; tick++) {
      hold(sim, player, 200, 90);
      sim.step(IDLE);
      const [ox, oy] = ordnerAt(sim);
      expect(room.isClear(ox, oy, 2)).toBe(true);
    }
    const [ox, oy] = ordnerAt(sim);
    expect(Math.hypot(200 - ox, 90 - oy)).toBeLessThanOrEqual(
      sim.tuning.ordner.comfortDistance + 2,
    );
  });

  it('cannot keep a mob off the player for good: a Zecke still gets on', () => {
    // The regression this replaced: an aura out-pushed every Floor 3 walker,
    // and holding the item made the player untouchable.
    const sim = withOrdner(9);
    const player = sim.playerIndex;
    const zecke = spawn(sim, 'zecke', sim.positionX(player) + 60, sim.positionY(player));
    let latched = false;
    for (let tick = 0; tick < 60 * 30 && !latched; tick++) {
      sim.step(IDLE);
      latched = ((sim.enemy.data[zecke * ENEMY_STRIDE + 3] ?? 0) & ENEMY_FLAG_LATCHED) !== 0;
    }
    expect(latched).toBe(true);
  });

  it('is deterministic: same seed, same input, same bouncer', () => {
    const run = (): string => {
      const sim = withOrdner(21);
      const player = sim.playerIndex;
      spawn(sim, 'kaninchen', sim.positionX(player) + 30, sim.positionY(player) + 10);
      spawn(sim, 'boar', sim.positionX(player) - 50, sim.positionY(player));
      const trace: string[] = [];
      for (let tick = 0; tick < 600; tick++) {
        const frame = createInputFrame();
        frame.moveX = tick % 90 < 45 ? 100 : -100;
        sim.step(frame);
        const [x, y] = ordnerAt(sim);
        trace.push(`${x.toFixed(4)},${y.toFixed(4)},${String(sim.ordner[ORDNER_SHOVE_POSE])}`);
      }
      return trace.join('\n');
    };
    expect(run()).toBe(run());
  });
});
