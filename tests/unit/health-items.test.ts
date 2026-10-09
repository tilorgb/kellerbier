import { describe, expect, it } from 'vitest';
import { ITEM_DEFINITIONS } from '../../src/content/items/index.js';
import { PICKUP_DEFINITIONS } from '../../src/content/pickups/pickups.js';
import { GameSim, PLAYER_HEALTH } from '../../src/sim/game/sim.js';
import { createInputFrame } from '../../src/sim/input/frame.js';
import { RoomGeometry } from '../../src/sim/room/geometry.js';
import { ENEMY_DROP_TABLES } from '../../src/content/pickups/drop-tables.js';

/** #484: Schweinsbraten, Radi, Semmel, Rosswurst, Käsekuchen and the Homebrew. */

const IDLE = createInputFrame();

function world(...items: string[]): GameSim {
  const sim = new GameSim({
    room: new RoomGeometry(0, 0, 320, 180),
    population: 'empty',
    items: ITEM_DEFINITIONS,
  });
  for (const id of items) {
    sim.pickUpItem(id);
  }
  return sim;
}

describe('max-health items', () => {
  it('Schweinsbraten adds a filled container', () => {
    const sim = world();
    sim.applyPlayerDamage(2);
    sim.pickUpItem('schweinsbraten');
    expect(sim.playerMaxHealth).toBe(PLAYER_HEALTH + 2);
    expect(sim.playerHealth).toBe(PLAYER_HEALTH);
  });

  it('Radi leaves one filled heart and three new empty containers', () => {
    const sim = world();
    sim.pickUpItem('radi');
    expect(sim.playerMaxHealth).toBe(PLAYER_HEALTH + 6);
    expect(sim.playerHealth).toBe(2);
  });

  it('Semmel banks three soul hearts and Rosswurst three eternal ones', () => {
    const sim = world();
    sim.pickUpItem('semmel');
    expect(sim.playerSoulHealth).toBe(6);
    sim.pickUpItem('rosswurst');
    expect(sim.playerEternalHealth).toBe(6);
  });

  it('Käsekuchen turns every red heart into soul, until a container comes back', () => {
    const sim = world();
    sim.pickUpItem('kaesekuchen');
    expect(sim.playerMaxHealth).toBe(0);
    expect(sim.playerHealth).toBe(0);
    expect(sim.playerSoulHealth).toBe(PLAYER_HEALTH);
    sim.addPlayerHealth(2);
    expect(sim.playerHealth).toBe(0);
    sim.pickUpItem('schweinsbraten');
    expect(sim.playerMaxHealth).toBe(2);
    expect(sim.playerHealth).toBe(2);
  });
});

describe('Homebrew', () => {
  it('doubles the Promille scale', () => {
    const plain = world();
    const sim = world('homebrew');
    expect(sim.tuning.promille.capScale).toBe(2);
    sim.addPromille(100);
    plain.addPromille(100);
    expect(sim.promille).toBeCloseTo(plain.promille * 2);
    sim.removeItem('homebrew');
    expect(sim.tuning.promille.capScale).toBe(1);
  });

  it('pays damage out of Promille, and an empty glass ends the run', () => {
    const sim = world('homebrew');
    const before = sim.promille;
    const red = sim.playerHealth;
    sim.applyPlayerDamage(2);
    expect(sim.playerHealth).toBe(red);
    expect(sim.promille).toBeCloseTo(before - sim.tuning.promille.hitPromilleLoss);
    expect(sim.playerDead).toBe(false);
    sim.tuning.promille.current = sim.tuning.promille.hitPromilleLoss - 0.1;
    sim.applyPlayerDamage(1);
    expect(sim.playerDead).toBe(true);
  });

  it('turns every drop into beer', () => {
    const sim = world('homebrew');
    for (let attempt = 0; attempt < 40; attempt++) {
      sim.dropLoot(ENEMY_DROP_TABLES.tough, 100, 100, true);
    }
    sim.world.flush();
    const kinds = new Set<string>();
    for (const pickup of PICKUP_DEFINITIONS) {
      if (sim.countPickupsOfKind(pickup.id) > 0) {
        kinds.add(pickup.id);
      }
    }
    expect([...kinds].every((id) => id.startsWith('mass-'))).toBe(true);
    expect(kinds.size).toBeGreaterThan(0);
    sim.step(IDLE);
  });
});
