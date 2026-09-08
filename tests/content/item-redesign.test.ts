import { describe, expect, it } from 'vitest';
import {
  almabtrieb,
  bauernMistgabel,
  bierbank,
  bierdeckel,
  braumeisterSchuerze,
  feuerwehrhelm,
  gartenzwergHut,
  kartoffelsalat,
  schluesselbund,
  spezi,
  traktorAuspuff,
  weisswurst,
  ITEM_DEFINITIONS,
} from '../../src/content/items/index.js';
import { entityIndex } from '../../src/sim/ecs/entity.js';
import { GameSim, TARGET_RADIUS } from '../../src/sim/game/sim.js';
import type { ItemDefinition } from '../../src/sim/item/definition.js';
import { ItemRegistry } from '../../src/sim/item/registry.js';
import { ProjectileTag, hasTag } from '../../src/sim/projectile/tags.js';
import { PROJECTILE_TINT_INDEX } from '../../src/sim/projectile/tints.js';
import { RoomGeometry } from '../../src/sim/room/geometry.js';
import { dispatchItemDamageTaken } from '../../src/sim/systems/items.js';
import {
  type InputFrame,
  InputAction,
  createInputFrame,
  quantiseAxis,
  setActionDown,
} from '../../src/sim/input/frame.js';

/**
 * The 2026-09 "fun and visible" pass over the item roster, checked against
 * the real definitions: each redesigned item does the new thing it says on
 * the pedestal, and every item that changes a shot is visible on that shot.
 * `tests/unit/item-effects.test.ts` covers the engine primitives these are
 * built from; this file covers the content.
 */

const IDLE = createInputFrame();

function bareRoom(): RoomGeometry {
  return new RoomGeometry(0, 0, 640, 360);
}

function aiming(aimX: number, aimY: number): InputFrame {
  const frame = createInputFrame();
  frame.aimX = quantiseAxis(aimX);
  frame.aimY = quantiseAxis(aimY);
  setActionDown(frame, InputAction.Fire, true);
  return frame;
}

function moving(moveX: number, moveY: number): InputFrame {
  const frame = createInputFrame();
  frame.moveX = quantiseAxis(moveX);
  frame.moveY = quantiseAxis(moveY);
  return frame;
}

function simWith(...items: ItemDefinition[]): GameSim {
  const sim = new GameSim({ room: bareRoom(), items, population: 'empty' });
  for (const item of items) {
    sim.pickUpItem(item.id);
  }
  return sim;
}

interface Shot {
  slot: number;
  vx: number;
  vy: number;
  x: number;
  y: number;
  tint: number;
  tags: number;
  lifetime: number;
  radius: number;
  damage: number;
}

function liveShots(sim: GameSim): Shot[] {
  const shots: Shot[] = [];
  const store = sim.projectiles;
  store.forEachLive((slot) => {
    shots.push({
      slot,
      vx: store.velocityX[slot] ?? 0,
      vy: store.velocityY[slot] ?? 0,
      x: store.x[slot] ?? 0,
      y: store.y[slot] ?? 0,
      tint: store.tint[slot] ?? 0,
      tags: store.tags[slot] ?? 0,
      lifetime: store.lifetime[slot] ?? 0,
      radius: store.radius[slot] ?? 0,
      damage: store.damage[slot] ?? 0,
    });
  });
  return shots;
}

/** One squeeze of the trigger, aimed right, from a standing start — waiting out any cooldown a previous squeeze left. */
function fireOnce(sim: GameSim): Shot[] {
  while (sim.fireCooldown > 0) {
    sim.step(IDLE);
  }
  sim.projectiles.clear();
  sim.step(aiming(1, 0));
  return liveShots(sim);
}

/** `fireOnce`, for the items that leave exactly one shot in flight. */
function firstShot(sim: GameSim): Shot {
  const shot = fireOnce(sim)[0];
  if (shot === undefined) {
    throw new Error('the squeeze produced no shot');
  }
  return shot;
}

describe('multi-shot items', () => {
  it('Bierbank fires two parallel shots, the second one wood-coloured', () => {
    const shots = fireOnce(simWith(bierbank));
    expect(shots).toHaveLength(2);
    const [a, b] = shots;
    if (a === undefined || b === undefined) {
      throw new Error('expected two shots');
    }
    // Parallel: identical heading, separated sideways, not diverging.
    expect(Math.atan2(a.vy, a.vx)).toBeCloseTo(Math.atan2(b.vy, b.vx), 5);
    expect(Math.abs(a.y - b.y)).toBeGreaterThan(3);
    expect(shots.filter((shot) => shot.tint === PROJECTILE_TINT_INDEX.holz)).toHaveLength(1);
  });

  it('Braumeister-Schürze fires a fan of three, the two extras foam-coloured', () => {
    const shots = fireOnce(simWith(braumeisterSchuerze));
    expect(shots).toHaveLength(3);
    const angles = shots.map((shot) => Math.atan2(shot.vy, shot.vx)).sort((p, q) => p - q);
    expect(angles[0]).toBeLessThan(-0.1);
    expect(angles[1]).toBeCloseTo(0, 5);
    expect(angles[2]).toBeGreaterThan(0.1);
    expect(shots.filter((shot) => shot.tint === PROJECTILE_TINT_INDEX.schaum)).toHaveLength(2);
  });

  it('Spezi tints only its diverging companion, never the aimed shot', () => {
    const shots = fireOnce(simWith(spezi));
    expect(shots).toHaveLength(2);
    const brown = shots.filter((shot) => shot.tint === PROJECTILE_TINT_INDEX.spezi);
    expect(brown).toHaveLength(1);
    const plain = shots.find((shot) => shot.tint === 0);
    expect(plain).toBeDefined();
    expect(Math.atan2(plain?.vy ?? 0, plain?.vx ?? 1)).toBeCloseTo(0, 5);
  });
});

describe('Bauern-Mistgabel — a melee jab instead of a gun', () => {
  it('turns one squeeze into three short, fast, piercing, steel prongs that hit harder', () => {
    const plain = firstShot(simWith());
    const prongs = fireOnce(simWith(bauernMistgabel));
    expect(prongs).toHaveLength(3);
    for (const prong of prongs) {
      expect(prong.lifetime).toBeLessThan(plain.lifetime / 3);
      expect(Math.hypot(prong.vx, prong.vy)).toBeGreaterThan(Math.hypot(plain.vx, plain.vy));
      expect(prong.radius).toBeGreaterThan(plain.radius);
      expect(prong.damage).toBeGreaterThanOrEqual(plain.damage * 2);
      expect(hasTag(prong.tags, ProjectileTag.Piercing)).toBe(true);
      expect(prong.tint).toBe(PROJECTILE_TINT_INDEX.stahl);
    }
  });

  it('the jab is gone within a body-length — nothing is left in flight a moment later', () => {
    const sim = simWith(bauernMistgabel);
    sim.step(aiming(1, 0));
    for (let tick = 0; tick < 10; tick++) {
      sim.step(IDLE);
    }
    expect(sim.projectiles.liveCount).toBe(0);
  });
});

describe('tag-granting redesigns', () => {
  it('Bierdeckel ricochets (bouncing) rather than returning, and is cardboard-coloured', () => {
    const shot = firstShot(simWith(bierdeckel));
    expect(hasTag(shot.tags, ProjectileTag.Bouncing)).toBe(true);
    expect(hasTag(shot.tags, ProjectileTag.Returning)).toBe(false);
    expect(shot.tint).toBe(PROJECTILE_TINT_INDEX.pappe);
  });

  it('Kartoffelsalat splits on impact and is potato-coloured', () => {
    const shot = firstShot(simWith(kartoffelsalat));
    expect(hasTag(shot.tags, ProjectileTag.Splitting)).toBe(true);
    expect(shot.tint).toBe(PROJECTILE_TINT_INDEX.kartoffel);
  });

  it('Feuerwehrhelm shoves what it hits back along the stream', () => {
    const sim = simWith(feuerwehrhelm);
    const playerX = sim.positionX(sim.playerIndex);
    const playerY = sim.positionY(sim.playerIndex);
    const target = entityIndex(sim.spawnTarget(playerX + 60, playerY, TARGET_RADIUS));
    sim.world.flush();
    const shot = firstShot(sim);
    expect(shot.tint).toBe(PROJECTILE_TINT_INDEX.wasser);
    let pushed = false;
    for (let tick = 0; tick < 60 && !pushed; tick++) {
      sim.step(IDLE);
      // A hit's own knockback is scaled by the damage dealt (1) — the hose
      // push is on top of it and is what makes the impulse this large.
      pushed = (sim.push.data[target * 2] ?? 0) > 0.5;
    }
    expect(pushed).toBe(true);
  });
});

describe('Gartenzwerg-Hut — a no-hit streak you can see', () => {
  it('adds one gnome-red extra shot per five seconds unhit, up to three, and a hit resets it', () => {
    const sim = simWith(gartenzwergHut);
    expect(fireOnce(sim)).toHaveLength(1);
    expect(
      gartenzwergHut.status?.({
        sim,
        itemId: 'gartenzwerg-hut',
        state: sim.itemState('gartenzwerg-hut'),
      }),
    ).toContain('building');

    for (let tick = 0; tick < 300; tick++) {
      sim.step(IDLE);
    }
    sim.projectiles.clear();
    let shots = fireOnce(sim);
    expect(shots).toHaveLength(2);
    expect(shots.filter((shot) => shot.tint === PROJECTILE_TINT_INDEX.zwerg)).toHaveLength(1);

    for (let tick = 0; tick < 900; tick++) {
      sim.step(IDLE);
    }
    sim.projectiles.clear();
    shots = fireOnce(sim);
    expect(shots).toHaveLength(4);
    expect(
      gartenzwergHut.status?.({
        sim,
        itemId: 'gartenzwerg-hut',
        state: sim.itemState('gartenzwerg-hut'),
      }),
    ).toBe('+3 shots');

    // The hook fires from the impact system (`sim/systems/impact.ts`), the
    // same entry `tests/unit/item-hooks.test.ts` drives it through.
    dispatchItemDamageTaken(sim, 1);
    sim.projectiles.clear();
    expect(fireOnce(sim)).toHaveLength(1);
  });
});

describe('Traktor-Auspuff — the exhaust trail', () => {
  it('drops poison clouds behind a moving player and none while standing still', () => {
    const sim = simWith(traktorAuspuff);
    for (let tick = 0; tick < 30; tick++) {
      sim.step(IDLE);
    }
    expect(sim.projectiles.liveCount).toBe(0);

    for (let tick = 0; tick < 30; tick++) {
      sim.step(moving(1, 0));
    }
    const puffs = liveShots(sim);
    expect(puffs.length).toBeGreaterThanOrEqual(3);
    const playerX = sim.positionX(sim.playerIndex);
    for (const puff of puffs) {
      expect(hasTag(puff.tags, ProjectileTag.Poison)).toBe(true);
      expect(puff.tint).toBe(PROJECTILE_TINT_INDEX.abgas);
      // Behind the player (who is moving right), drifting further back.
      expect(puff.x).toBeLessThan(playerX);
      expect(puff.vx).toBeLessThanOrEqual(0);
    }
  });
});

describe('Schlüsselbund — seeing the secret rooms', () => {
  it('reveals on pickup and un-reveals when the last copy is lost', () => {
    const sim = new GameSim({ room: bareRoom(), items: [schluesselbund], population: 'empty' });
    expect(sim.secretRoomsRevealed).toBe(false);
    sim.pickUpItem('schluesselbund');
    expect(sim.secretRoomsRevealed).toBe(true);
    sim.removeItem('schluesselbund');
    expect(sim.secretRoomsRevealed).toBe(false);
  });
});

describe('shot colours on the items that kept their design', () => {
  it("Almabtrieb's moving shot is the coloured one; a standing shot is plain", () => {
    const sim = simWith(almabtrieb);
    const standing = firstShot(sim);
    expect(standing.tint).toBe(0);
    sim.projectiles.clear();
    // Long enough to both outlast the cooldown and be visibly under way.
    for (let tick = 0; tick < 30; tick++) {
      sim.step(moving(0, 1));
    }
    const frame = moving(0, 1);
    frame.aimX = quantiseAxis(1);
    setActionDown(frame, InputAction.Fire, true);
    sim.step(frame);
    const running = liveShots(sim);
    expect(running.length).toBeGreaterThan(0);
    expect(running[0]?.tint).toBe(PROJECTILE_TINT_INDEX.almabtrieb);
    expect(running[0]?.damage).toBe(standing.damage * 2);
  });

  it('Weißwurst shots are white while the tradition holds and plain once it is past noon', () => {
    const sim = simWith(weisswurst);
    expect(firstShot(sim).tint).toBe(PROJECTILE_TINT_INDEX.weiss);
    sim.projectiles.clear();
    sim.itemState('weisswurst').charge = 0;
    expect(firstShot(sim).tint).toBe(0);
  });
});

describe('the roster as a whole', () => {
  it('every status reader returns a string for a freshly picked-up item', () => {
    const registry = new ItemRegistry(ITEM_DEFINITIONS);
    for (const item of registry.all) {
      if (item.status === undefined) {
        continue;
      }
      const sim = new GameSim({ room: bareRoom(), items: ITEM_DEFINITIONS, population: 'empty' });
      sim.pickUpItem(item.id);
      const text = item.status({ sim, itemId: item.id, state: sim.itemState(item.id) });
      expect(text, `${item.id}'s status reader`).toBeTypeOf('string');
    }
  });

  it('no two items grant the same single projectile tag as their whole effect', () => {
    // Bierdeckel and Luftballon were both "shots return" under different
    // names; a roster of 51 cannot afford a duplicate. Fire each
    // tag-granting item alone and compare the tag masks it produces.
    const masks = new Map<number, string[]>();
    for (const item of ITEM_DEFINITIONS) {
      if (item.hooks?.onProjectileSpawn === undefined || item.hooks.onShoot !== undefined) {
        continue;
      }
      const shots = fireOnce(simWith(item));
      const mask = shots[0]?.tags ?? 0;
      if (mask === 0 || Object.keys(item.hooks).length > 1) {
        continue;
      }
      masks.set(mask, [...(masks.get(mask) ?? []), item.id]);
    }
    for (const [mask, ids] of masks) {
      expect(
        ids,
        `tag mask ${String(mask)} is the whole effect of more than one item`,
      ).toHaveLength(1);
    }
  });
});
