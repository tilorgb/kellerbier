import { describe, expect, it } from 'vitest';
import { entityIndex } from '../../src/sim/ecs/entity.js';
import { GameSim, TARGET_HEALTH, TARGET_RADIUS } from '../../src/sim/game/sim.js';
import type { ItemDefinition } from '../../src/sim/item/definition.js';
import { RoomGeometry } from '../../src/sim/room/geometry.js';
import { hasTag, ProjectileTag } from '../../src/sim/projectile/tags.js';
import { ProjectileTeam } from '../../src/sim/projectile/store.js';
import {
  InputAction,
  createInputFrame,
  quantiseAxis,
  setActionDown,
  type InputFrame,
} from '../../src/sim/input/frame.js';
import {
  STATUS_BURN,
  STATUS_EFFECT_STRIDE,
  STATUS_FREEZE,
} from '../../src/sim/systems/status-effects.js';

/**
 * Coverage for #29's engine-side additions: the handful of `GameSim` methods
 * an item hook reaches for that `#26`/`#27` did not already provide
 * (`addProjectileTag`, `spawnItemProjectile`, `applySplashDamage`,
 * `applyStatusEffect`, `slowEnemiesNear`, `pushEnemiesNear`,
 * `banItemFromPool`, `refreshItemStats`) and the `onBombDetonate` hook.
 * `tests/content/items.test.ts` covers the 26 items themselves; this file
 * covers the primitives they are built from, directly, the same split
 * `tests/unit/item-hooks.test.ts` (#26's engine) and
 * `tests/content/items.test.ts` (#26's content) already use.
 */

const IDLE = createInputFrame();

function aiming(aimX: number, aimY: number): InputFrame {
  const frame = createInputFrame();
  frame.aimX = quantiseAxis(aimX);
  frame.aimY = quantiseAxis(aimY);
  setActionDown(frame, InputAction.Fire, true);
  return frame;
}

function bareRoom(): RoomGeometry {
  return new RoomGeometry(0, 0, 320, 180);
}

function baseItem(id: string, overrides: Partial<ItemDefinition> = {}): ItemDefinition {
  return {
    id,
    name: id,
    description: 'a test item',
    sprite: 'test',
    pools: ['treasure'],
    quality: 0,
    promilleRequirement: 'any',
    ...overrides,
  };
}

/** A bare, open room with one pedestal — mirrors `tests/unit/pedestal.test.ts`'s `pedestalRoom`. */
function pedestalRoom(id: string) {
  return {
    id,
    tileGrid: [
      '###############',
      '#.............#',
      '#.............#',
      '#.............#',
      '#.............#',
      '#.............#',
      '#.............#',
      '#.............#',
      '###############',
    ],
    obstacles: [],
    enemySpawns: [],
    spawnGroups: [],
    pickupSpawns: [],
    hazards: [],
    decorativeProps: [{ x: 160, y: 90, type: 'pedestal' as const }],
    metadata: {
      floorTags: ['test'],
      shape: '1x1' as const,
      doors: { north: false, east: false, south: false, west: false },
      difficultyTier: 1,
      weight: 1,
      specialRole: 'treasure' as const,
    },
  };
}

describe('GameSim.addProjectileTag', () => {
  it('sets exactly the requested bit on an existing projectile', () => {
    const sim = new GameSim({ room: bareRoom(), population: 'empty' });
    const slot = sim.projectiles.spawn(0, 0, 1, 0, 3, 1, 30, ProjectileTeam.Player);
    sim.addProjectileTag(slot, 'homing');
    const tags = sim.projectiles.tags[slot] ?? 0;
    expect(hasTag(tags, ProjectileTag.Homing)).toBe(true);
    expect(hasTag(tags, ProjectileTag.Piercing)).toBe(false);

    sim.addProjectileTag(slot, 'piercing');
    const combined = sim.projectiles.tags[slot] ?? 0;
    expect(hasTag(combined, ProjectileTag.Homing)).toBe(true);
    expect(hasTag(combined, ProjectileTag.Piercing)).toBe(true);
  });
});

describe('GameSim.spawnItemProjectile', () => {
  it('spawns a player-team shot, dispatching onProjectileSpawn to every held item', () => {
    const spawned: number[] = [];
    const item = baseItem('watcher', {
      hooks: { onProjectileSpawn: (ctx) => spawned.push(ctx.projectile) },
    });
    const sim = new GameSim({ room: bareRoom(), items: [item], population: 'empty' });
    sim.pickUpItem('watcher');

    const slot = sim.spawnItemProjectile(10, 20, 1, 0);
    expect(slot).toBeGreaterThanOrEqual(0);
    expect(sim.projectiles.team[slot]).toBe(ProjectileTeam.Player);
    expect(sim.projectiles.x[slot]).toBe(10);
    expect(sim.projectiles.y[slot]).toBe(20);
    expect(spawned).toEqual([slot]);
  });

  it('defaults damage to the resolved Stammwürze, and normalises the direction', () => {
    const sim = new GameSim({ room: bareRoom(), population: 'empty' });
    const slot = sim.spawnItemProjectile(0, 0, 3, 4); // a 3-4-5 triangle, deliberately not a unit vector
    const speed = Math.hypot(
      sim.projectiles.velocityX[slot] ?? 0,
      sim.projectiles.velocityY[slot] ?? 0,
    );
    expect(speed).toBeCloseTo(sim.tuning.shooting.shotSpeed, 5);
    expect(sim.projectiles.damage[slot]).toBe(Math.round(sim.stats.value('stammwuerze')));
  });

  it('a tag granted from onProjectileSpawn is captured by finalizeProjectileTags', () => {
    // `spawnItemProjectile` dispatches to every held item's `onProjectileSpawn`
    // *before* it finalises tags itself (mirroring `fire`) — this is the
    // ordering `addProjectileTag` depends on to have any effect at all.
    const item = baseItem('spitze', {
      hooks: {
        onProjectileSpawn: (ctx) => {
          ctx.sim.addProjectileTag(ctx.projectile, 'piercing');
        },
      },
    });
    const sim = new GameSim({ room: bareRoom(), items: [item], population: 'empty' });
    sim.pickUpItem('spitze');
    const slot = sim.spawnItemProjectile(0, 0, 1, 0);
    expect(sim.projectiles.pierceRemaining[slot]).toBeGreaterThan(0);
  });
});

describe('GameSim.applySplashDamage', () => {
  it('damages a target within radius and excludes the given index', () => {
    const sim = new GameSim({ room: bareRoom(), population: 'empty' });
    const inRange = entityIndex(sim.spawnTarget(0, 0, TARGET_RADIUS));
    const excluded = entityIndex(sim.spawnTarget(5, 0, TARGET_RADIUS));
    const outOfRange = entityIndex(sim.spawnTarget(1000, 1000, TARGET_RADIUS));
    sim.world.flush();
    // The broadphase (`sim.broadphase.query`, what every one of these
    // radius-based helpers reads) is only rebuilt inside `stepCollision`, one
    // step of the ordinary tick — a real item hook always runs after that
    // has already happened this tick, so one step here reproduces the same
    // ordering rather than querying a broadphase nothing has ever built.
    sim.step(IDLE);

    sim.applySplashDamage(0, 0, 40, 1, excluded);

    expect(sim.health.data[inRange * 2]).toBe(TARGET_HEALTH - 1);
    expect(sim.health.data[excluded * 2]).toBe(TARGET_HEALTH);
    expect(sim.health.data[outOfRange * 2]).toBe(TARGET_HEALTH);
  });

  it('does nothing for non-positive damage or radius', () => {
    const sim = new GameSim({ room: bareRoom(), population: 'empty' });
    const target = entityIndex(sim.spawnTarget(0, 0, TARGET_RADIUS));
    sim.world.flush();

    expect(() => {
      sim.applySplashDamage(0, 0, 40, 0);
    }).not.toThrow();
    expect(() => {
      sim.applySplashDamage(0, 0, 0, 5);
    }).not.toThrow();
    expect(sim.health.data[target * 2]).toBe(TARGET_HEALTH);
  });
});

describe('GameSim.applyStatusEffect', () => {
  it('sets a duration, never shortening one already running', () => {
    const sim = new GameSim({ room: bareRoom(), population: 'empty' });
    const target = entityIndex(sim.spawnTarget(0, 0, TARGET_RADIUS));
    sim.world.flush();

    sim.applyStatusEffect(target, 'burn', 30);
    expect(sim.statusEffect.data[target * STATUS_EFFECT_STRIDE + STATUS_BURN]).toBe(30);

    sim.applyStatusEffect(target, 'burn', 10);
    expect(sim.statusEffect.data[target * STATUS_EFFECT_STRIDE + STATUS_BURN]).toBe(30);

    sim.applyStatusEffect(target, 'burn', 50);
    expect(sim.statusEffect.data[target * STATUS_EFFECT_STRIDE + STATUS_BURN]).toBe(50);
  });
});

describe('GameSim.slowEnemiesNear', () => {
  it('freezes enemies in radius, and leaves ones outside it alone', () => {
    const sim = new GameSim({ room: bareRoom(), population: 'empty' });
    const near = entityIndex(sim.spawnTarget(0, 0, TARGET_RADIUS));
    const far = entityIndex(sim.spawnTarget(1000, 1000, TARGET_RADIUS));
    sim.world.flush();
    sim.step(IDLE); // builds the broadphase — see `applySplashDamage`'s test above

    sim.slowEnemiesNear(0, 0, 40, 20);

    expect(sim.statusEffect.data[near * STATUS_EFFECT_STRIDE + STATUS_FREEZE]).toBe(20);
    expect(sim.statusEffect.data[far * STATUS_EFFECT_STRIDE + STATUS_FREEZE]).toBe(0);
  });

  it('never freezes the player — only the Enemy collision layer', () => {
    const sim = new GameSim({ room: bareRoom(), population: 'empty' });
    const playerIndex = sim.playerIndex;
    sim.step(IDLE); // builds the broadphase — see `applySplashDamage`'s test above
    sim.slowEnemiesNear(sim.positionX(playerIndex), sim.positionY(playerIndex), 40, 20);
    expect(sim.statusEffect.data[playerIndex * STATUS_EFFECT_STRIDE + STATUS_FREEZE]).toBe(0);
  });
});

describe('GameSim.pushEnemiesNear', () => {
  it('pushes an enemy in radius directly away from the point', () => {
    const sim = new GameSim({ room: bareRoom(), population: 'empty' });
    const target = entityIndex(sim.spawnTarget(20, 0, TARGET_RADIUS));
    sim.world.flush();
    sim.step(IDLE); // builds the broadphase — see `applySplashDamage`'s test above

    sim.pushEnemiesNear(0, 0, 40, 1);

    expect(sim.push.data[target * 2]).toBeGreaterThan(0); // pushed in +x, away from the origin
    expect(sim.push.data[target * 2 + 1]).toBeCloseTo(0, 5);
  });
});

describe('GameSim.banItemFromPool', () => {
  it('permanently excludes the id from every future pedestal offer', () => {
    // A single-item pool: with nothing else eligible, a pedestal offer after
    // the ban is unambiguous — empty rather than merely "possibly this one."
    const sim = new GameSim({
      room: bareRoom(),
      items: [baseItem('einzelstueck')],
    });
    sim.banItemFromPool('einzelstueck');

    // `spawnPedestal` (private) only runs through `applyCompiledRoom` — reach
    // it the same way `tests/unit/pedestal.test.ts` does, through a real
    // pedestal-bearing room.
    sim.loadRoom(pedestalRoom('ban-test-room'), 1);

    expect(sim.activePedestals).toHaveLength(1);
    expect(sim.activePedestals[0]?.itemIndex).toBe(-1);
  });
});

describe('GameSim.refreshItemStats', () => {
  it('re-resolves modifyStats immediately, without waiting for the next tick', () => {
    const item = baseItem('unstable', {
      hooks: { modifyStats: (state) => [{ stat: 'stammwuerze', op: 'add', value: state.charge }] },
    });
    const sim = new GameSim({ room: bareRoom(), items: [item], population: 'empty' });
    sim.pickUpItem('unstable');
    const base = sim.stats.value('stammwuerze');

    // Mutating `charge` directly does not, by itself, dirty the pipeline —
    // only `pickUpItem`/`removeItem` do that automatically (see the doc
    // comment on `refreshItemStats`).
    sim.itemState('unstable').charge = 5;
    expect(sim.stats.value('stammwuerze')).toBe(base);

    sim.refreshItemStats('unstable');
    expect(sim.stats.value('stammwuerze')).toBe(base + 5);
  });

  it('does nothing for an unknown id, rather than throwing', () => {
    const sim = new GameSim({ room: bareRoom(), population: 'empty' });
    expect(() => {
      sim.refreshItemStats('does-not-exist');
    }).not.toThrow();
  });
});

describe('onBombDetonate', () => {
  it('fires for every held item when a Bierfassl explodes, with the blast position', () => {
    const seen: { x: number; y: number }[] = [];
    const item = baseItem('fasswache', {
      hooks: { onBombDetonate: (ctx) => seen.push({ x: ctx.x, y: ctx.y }) },
    });
    const sim = new GameSim({ room: bareRoom(), items: [item], population: 'empty' });
    sim.pickUpItem('fasswache');

    const bombX = sim.positionX(sim.playerIndex) + 200;
    const bombY = sim.positionY(sim.playerIndex) + 200;
    sim.spawnBierfassl(bombX, bombY, 0, 0, false);
    sim.world.flush();

    const fuseTicks = Math.round(sim.tuning.pickup.bombFuseTicks);
    for (let tick = 0; tick <= fuseTicks; tick++) {
      sim.step(IDLE);
    }

    expect(seen).toEqual([{ x: bombX, y: bombY }]);
  });

  it('never fires for an item that is not held', () => {
    const seen: number[] = [];
    const item = baseItem('unheld', { hooks: { onBombDetonate: () => seen.push(1) } });
    const sim = new GameSim({ room: bareRoom(), items: [item], population: 'empty' });
    // Deliberately not picked up.

    const bombX = sim.positionX(sim.playerIndex) + 200;
    const bombY = sim.positionY(sim.playerIndex) + 200;
    sim.spawnBierfassl(bombX, bombY, 0, 0, false);
    sim.world.flush();

    const fuseTicks = Math.round(sim.tuning.pickup.bombFuseTicks);
    for (let tick = 0; tick <= fuseTicks; tick++) {
      sim.step(IDLE);
    }

    expect(seen).toEqual([]);
  });
});

/**
 * #29's acceptance criteria, checked directly rather than only by
 * inspection: composition needs no special-casing, Reinheitsgebot's lockout
 * is real, and stacking independently-authored tags produces a shot none of
 * the three items individually describes.
 */
describe('#29 acceptance criteria', () => {
  it('Föhn nudges a homing+bouncing+arcing projectile without special-casing any of the three', async () => {
    const { foehn } = await import('../../src/content/items/foehn.js');
    const sim = new GameSim({ room: bareRoom(), items: [foehn], population: 'targets' });
    sim.pickUpItem('foehn');

    const slot = sim.projectiles.spawn(160, 90, 1, 0, 3, 1, 5000, ProjectileTeam.Player);
    sim.addProjectileTag(slot, 'homing');
    sim.addProjectileTag(slot, 'bouncing');
    sim.addProjectileTag(slot, 'arcing');

    // `sim.step` already runs the ordinary per-tick pipeline — homing/arcing
    // steering and wall bounces through `stepProjectiles`, Föhn's wind
    // through `stepItemTick` — so this is nothing more than playing the
    // combination forward and watching for a crash or a non-finite value.
    expect(() => {
      for (let tick = 0; tick < 180; tick++) {
        if (!sim.projectiles.isLive(slot)) {
          break;
        }
        sim.step(IDLE);
      }
    }).not.toThrow();

    if (sim.projectiles.isLive(slot)) {
      const vx = sim.projectiles.velocityX[slot] ?? 0;
      const vy = sim.projectiles.velocityY[slot] ?? 0;
      expect(Number.isFinite(vx)).toBe(true);
      expect(Number.isFinite(vy)).toBe(true);
    }
  });

  it('Reinheitsgebot 1516 strips and permanently locks out every impure item already held', async () => {
    const { radler } = await import('../../src/content/items/radler.js');
    const { spezi } = await import('../../src/content/items/spezi.js');
    const { reinheitsgebot1516 } = await import('../../src/content/items/reinheitsgebot-1516.js');
    const sim = new GameSim({
      room: bareRoom(),
      items: [radler, spezi, reinheitsgebot1516],
      population: 'empty',
    });
    sim.pickUpItem('radler');
    sim.pickUpItem('spezi');
    expect(sim.hasItem('radler')).toBe(true);
    expect(sim.hasItem('spezi')).toBe(true);

    sim.pickUpItem('reinheitsgebot-1516');

    expect(sim.hasItem('radler')).toBe(false);
    expect(sim.hasItem('spezi')).toBe(false);

    // Picking the purist's pact back up a second time must not resurrect them.
    sim.loadRoom(pedestalRoom('reinheitsgebot-lockout-room'), 1);
    expect(sim.activePedestals[0]?.itemIndex).not.toBe(sim.items.indexOf('radler'));
    expect(sim.activePedestals[0]?.itemIndex).not.toBe(sim.items.indexOf('spezi'));
  });

  it('three independently-authored combinations of items compose into shots none of them describes alone', async () => {
    const { russn } = await import('../../src/content/items/russn.js');
    const { radi } = await import('../../src/content/items/radi.js');
    const { bierdeckel } = await import('../../src/content/items/bierdeckel.js');
    const { steinkrug } = await import('../../src/content/items/steinkrug.js');
    const { colaweizen } = await import('../../src/content/items/colaweizen.js');

    // Combo 1: Russ'n's homing riding on Radi's arcing spiral — neither file
    // mentions the other.
    const comboA = new GameSim({ room: bareRoom(), items: [russn, radi], population: 'empty' });
    comboA.pickUpItem('russn');
    comboA.pickUpItem('radi');
    comboA.step(aiming(1, 0));
    const slotA = findLiveSlot(comboA);
    expect(slotA).toBeGreaterThanOrEqual(0);
    const tagsA = comboA.projectiles.tags[slotA] ?? 0;
    expect(hasTag(tagsA, ProjectileTag.Homing)).toBe(true);
    expect(hasTag(tagsA, ProjectileTag.Arcing)).toBe(true);

    // Combo 2: Bierdeckel's boomerang, homing on the way back thanks to
    // Russ'n — a returning shot that also chases, which neither item
    // individually promises.
    const comboB = new GameSim({
      room: bareRoom(),
      items: [russn, bierdeckel],
      population: 'empty',
    });
    comboB.pickUpItem('russn');
    comboB.pickUpItem('bierdeckel');
    comboB.step(aiming(1, 0));
    const slotB = findLiveSlot(comboB);
    expect(slotB).toBeGreaterThanOrEqual(0);
    const tagsB = comboB.projectiles.tags[slotB] ?? 0;
    expect(hasTag(tagsB, ProjectileTag.Homing)).toBe(true);
    expect(hasTag(tagsB, ProjectileTag.Returning)).toBe(true);

    // Combo 3: Steinkrug's wall-ignoring splash landing on a target that
    // Colaweizen then sticks to and slows — a splash that also traps.
    const comboC = new GameSim({
      room: bareRoom(),
      items: [steinkrug, colaweizen],
      population: 'empty',
    });
    comboC.pickUpItem('steinkrug');
    comboC.pickUpItem('colaweizen');
    comboC.step(aiming(1, 0));
    const slotC = findLiveSlot(comboC);
    expect(slotC).toBeGreaterThanOrEqual(0);
    const tagsC = comboC.projectiles.tags[slotC] ?? 0;
    expect(hasTag(tagsC, ProjectileTag.Spectral)).toBe(true);
    expect(hasTag(tagsC, ProjectileTag.Sticky)).toBe(true);
  });
});

describe('#92 acceptance criteria — items that move Trinkfest', () => {
  it('Bierbauch raises Trinkfest on pickup and gives it back exactly on removal', async () => {
    const { bierbauch } = await import('../../src/content/items/bierbauch.js');
    const sim = new GameSim({ room: bareRoom(), items: [bierbauch], population: 'empty' });
    expect(sim.trinkfest).toBe(0);

    sim.pickUpItem('bierbauch');
    expect(sim.trinkfest).toBe(1);

    // A second copy must not double it — Bierbauch's own effect is
    // non-stacking, guarded by `state.count === 1` in the item itself.
    sim.pickUpItem('bierbauch');
    expect(sim.trinkfest).toBe(1);

    // Still held (two copies) — no `onRemove` yet.
    sim.removeItem('bierbauch');
    expect(sim.trinkfest).toBe(1);

    // Last copy gone — the exact prior state comes back.
    sim.removeItem('bierbauch');
    expect(sim.trinkfest).toBe(0);
  });

  it('Halbe Portion lowers Trinkfest on pickup and gives it back exactly on removal', async () => {
    const { halbePortion } = await import('../../src/content/items/halbe-portion.js');
    const sim = new GameSim({ room: bareRoom(), items: [halbePortion], population: 'empty' });
    expect(sim.trinkfest).toBe(0);

    sim.pickUpItem('halbe-portion');
    expect(sim.trinkfest).toBe(-1);

    sim.removeItem('halbe-portion');
    expect(sim.trinkfest).toBe(0);
  });

  it('two Trinkfest items held together net out, in either pickup order', async () => {
    const { bierbauch } = await import('../../src/content/items/bierbauch.js');
    const { halbePortion } = await import('../../src/content/items/halbe-portion.js');
    const sim = new GameSim({
      room: bareRoom(),
      items: [bierbauch, halbePortion],
      population: 'empty',
    });
    sim.pickUpItem('bierbauch');
    sim.pickUpItem('halbe-portion');
    expect(sim.trinkfest).toBe(0);

    sim.removeItem('bierbauch');
    expect(sim.trinkfest).toBe(-1);
    sim.removeItem('halbe-portion');
    expect(sim.trinkfest).toBe(0);
  });

  it('raising Trinkfest lets a run reach the Sturzbesoffen stage past the old Vollrausch ceiling', async () => {
    const { bierbauch } = await import('../../src/content/items/bierbauch.js');
    const { PromilleTier } = await import('../../src/sim/game/promille.js');
    const sim = new GameSim({ room: bareRoom(), items: [bierbauch], population: 'empty' });
    sim.pickUpItem('bierbauch');
    sim.addPromille(4.5); // pre-#92, and at Trinkfest 0, this is already Umgfalln
    expect(sim.promilleTier).toBe(PromilleTier.Sturzbesoffen);
    expect(sim.umgfallnTicks).toBe(0);
  });
});

/** The one live projectile a freshly-fired test shot produced. */
function findLiveSlot(sim: GameSim): number {
  let found = -1;
  sim.projectiles.forEachLive((slot) => {
    found = slot;
  });
  return found;
}
