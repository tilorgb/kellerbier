import { describe, expect, it } from 'vitest';
import { entityIndex } from '../../src/sim/ecs/entity.js';
import { GameSim } from '../../src/sim/game/sim.js';
import type { ItemDefinition } from '../../src/sim/item/definition.js';
import {
  type InputFrame,
  InputAction,
  createInputFrame,
  quantiseAxis,
  setActionDown,
} from '../../src/sim/input/frame.js';
import { NO_SLOT } from '../../src/sim/pool/slot-pool.js';
import { finalizeProjectileTags, resolveProjectileHit } from '../../src/sim/projectile/behavior.js';
import { ProjectileTeam } from '../../src/sim/projectile/store.js';
import { ProjectileTag, addProjectileTag } from '../../src/sim/projectile/tags.js';
import { RoomGeometry } from '../../src/sim/room/geometry.js';
import {
  STATUS_BURN,
  STATUS_EFFECT_STRIDE,
  STATUS_FREEZE,
} from '../../src/sim/systems/status-effects.js';

function openRoom(): RoomGeometry {
  return new RoomGeometry(0, 0, 640, 360);
}

/** A shot with a given tag mask, already finalised — ready for `resolveProjectileHit`. */
function spawnTagged(sim: GameSim, tags: number, x = 100, y = 100): number {
  const slot = sim.projectiles.spawn(x, y, 2, 0, 3, 1, 60, ProjectileTeam.Player, tags);
  expect(slot).not.toBe(NO_SLOT);
  finalizeProjectileTags(sim, slot);
  return slot;
}

describe('projectile tag composition (#27)', () => {
  it('piercing survives exactly its configured number of hits, then despawns', () => {
    const sim = new GameSim({ room: openRoom() });
    const targetIndex = entityIndex(sim.spawnTarget(200, 100, 8));
    sim.world.flush();
    const maxTargets = sim.tuning.projectileTags.pierceMaxTargets;

    const slot = spawnTagged(sim, ProjectileTag.Piercing);
    for (let hit = 0; hit < maxTargets; hit++) {
      resolveProjectileHit(sim, slot, targetIndex, 100, 100, -1, 0);
      expect(sim.projectiles.isLive(slot), `still flying after hit ${String(hit + 1)}`).toBe(true);
    }
    // One more hit than the budget allows.
    resolveProjectileHit(sim, slot, targetIndex, 100, 100, -1, 0);
    expect(sim.projectiles.isLive(slot)).toBe(false);
  });

  it('sticky wins over piercing and bouncing, even when a shot carries all three', () => {
    const sim = new GameSim({ room: openRoom() });
    const targetIndex = entityIndex(sim.spawnTarget(200, 100, 8));
    sim.world.flush();

    const slot = spawnTagged(
      sim,
      ProjectileTag.Sticky | ProjectileTag.Piercing | ProjectileTag.Bouncing,
    );
    resolveProjectileHit(sim, slot, targetIndex, 100, 100, -1, 0);

    expect(sim.projectiles.isLive(slot)).toBe(true);
    expect(sim.projectiles.stickyTarget[slot]).toBe(targetIndex);
  });

  it('piercing beats bouncing: a shot with both spends its pierce budget before it starts bouncing', () => {
    const sim = new GameSim({ room: openRoom() });
    const targetIndex = entityIndex(sim.spawnTarget(200, 100, 8));
    sim.world.flush();
    const pierce = sim.tuning.projectileTags.pierceMaxTargets;

    const slot = spawnTagged(sim, ProjectileTag.Piercing | ProjectileTag.Bouncing);
    for (let hit = 0; hit < pierce; hit++) {
      resolveProjectileHit(sim, slot, targetIndex, 100, 100, -1, 0);
      // Still travelling in the original direction — piercing does not deflect.
      expect(sim.projectiles.velocityX[slot]).toBeGreaterThan(0);
    }

    // The pierce budget is spent: this hit bounces instead of passing through.
    resolveProjectileHit(sim, slot, targetIndex, 100, 100, -1, 0);
    expect(sim.projectiles.isLive(slot)).toBe(true);
    expect(sim.projectiles.velocityX[slot]).toBeLessThan(0);
  });

  it('splitting spawns children fanned around the hit, and stops after splitMaxDepth generations', () => {
    const sim = new GameSim({ room: openRoom(), projectileCapacity: 64 });
    const targetIndex = entityIndex(sim.spawnTarget(200, 100, 8));
    sim.world.flush();

    const slot = spawnTagged(sim, ProjectileTag.Splitting);
    const before = sim.projectiles.liveCount;
    resolveProjectileHit(sim, slot, targetIndex, 150, 100, -1, 0);

    // The parent had no piercing/bouncing/sticky, so it despawns on this hit —
    // only the children it threw off on the way out remain.
    expect(sim.projectiles.isLive(slot)).toBe(false);
    expect(sim.projectiles.liveCount).toBe(before - 1 + sim.tuning.projectileTags.splitCount);

    // None of the children carry any further split budget.
    sim.projectiles.forEachLive((index) => {
      expect(sim.projectiles.splitDepth[index]).toBe(0);
    });
  });

  it("a bouncing, splitting, homing shot simply works — the issue's own example", () => {
    const sim = new GameSim({ room: openRoom(), projectileCapacity: 64 });
    sim.spawnTarget(400, 180, 8);
    sim.world.flush();

    spawnTagged(
      sim,
      ProjectileTag.Bouncing | ProjectileTag.Splitting | ProjectileTag.Homing,
      60,
      180,
    );

    expect(() => {
      for (let tick = 0; tick < 200; tick++) {
        sim.step();
      }
    }).not.toThrow();
  });

  it('burning sets a refreshable status duration that ticks damage down over time', () => {
    const sim = new GameSim({ room: openRoom() });
    const targetIndex = entityIndex(sim.spawnTarget(200, 100, 8));
    sim.world.flush();
    sim.health.data[targetIndex * 2] = 500;
    sim.health.data[targetIndex * 2 + 1] = 500;

    const slot = spawnTagged(sim, ProjectileTag.Burning);
    resolveProjectileHit(sim, slot, targetIndex, 200, 100, -1, 0);
    expect(sim.statusEffect.data[targetIndex * STATUS_EFFECT_STRIDE + STATUS_BURN]).toBe(
      sim.tuning.projectileTags.burnDurationTicks,
    );

    const healthBefore = sim.health.data[targetIndex * 2] ?? 0;
    for (let tick = 0; tick < sim.tuning.projectileTags.burnDurationTicks + 5; tick++) {
      sim.step();
    }
    expect(sim.health.data[targetIndex * 2]).toBeLessThan(healthBefore);
    expect(sim.statusEffect.data[targetIndex * STATUS_EFFECT_STRIDE + STATUS_BURN]).toBe(0);
  });

  it("freezing scales a frozen body's velocity down until the status runs out", () => {
    const sim = new GameSim({ room: openRoom() });
    const targetIndex = entityIndex(sim.spawnTarget(200, 100, 8));
    sim.world.flush();
    sim.velocity.data[targetIndex * 2] = 2;

    const slot = spawnTagged(sim, ProjectileTag.Freezing);
    resolveProjectileHit(sim, slot, targetIndex, 200, 100, -1, 0);
    expect(sim.statusEffect.data[targetIndex * STATUS_EFFECT_STRIDE + STATUS_FREEZE]).toBe(
      sim.tuning.projectileTags.freezeDurationTicks,
    );

    sim.step();
    // Scaled down, not zeroed — a frozen body still crawls rather than snapping still.
    expect(sim.velocity.data[targetIndex * 2]).toBeLessThan(2);
  });

  it('poison and burning landing on the same tick do not double-apply the kill', () => {
    const sim = new GameSim({ room: openRoom() });
    const targetIndex = entityIndex(sim.spawnTarget(200, 100, 8));
    sim.world.flush();
    // Just enough health that one status tick kills, so both would fire their
    // damage on the same tick if the guard against a double kill were missing.
    sim.health.data[targetIndex * 2] = 1;
    sim.health.data[targetIndex * 2 + 1] = 1;

    const slot = spawnTagged(sim, ProjectileTag.Burning | ProjectileTag.Poison);
    resolveProjectileHit(sim, slot, targetIndex, 200, 100, -1, 0);

    expect(() => {
      for (let tick = 0; tick < 5; tick++) {
        sim.step();
      }
    }).not.toThrow();
    expect(sim.health.data[targetIndex * 2]).toBe(0);
  });

  it('homing bends velocity toward the target within a few ticks', () => {
    const sim = new GameSim({ room: openRoom(), projectileCapacity: 1024 });
    sim.spawnTarget(160, 40, 8);
    sim.world.flush();

    const slot = spawnTagged(sim, ProjectileTag.Homing, 100, 200);
    sim.projectiles.velocityX[slot] = 0;
    sim.projectiles.velocityY[slot] = -2.5;
    const initialAngle = Math.atan2(
      sim.projectiles.velocityY[slot] ?? 0,
      sim.projectiles.velocityX[slot] ?? 0,
    );

    sim.step();
    const turnedAngle = Math.atan2(
      sim.projectiles.velocityY[slot] ?? 0,
      sim.projectiles.velocityX[slot] ?? 0,
    );
    expect(turnedAngle).not.toBeCloseTo(initialAngle, 5);
  });
});

/** A minimal, valid item — mirrors `tests/unit/item-hooks.test.ts`'s helper of the same name. */
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

function aiming(aimX: number, aimY: number): InputFrame {
  const frame = createInputFrame();
  frame.aimX = quantiseAxis(aimX);
  frame.aimY = quantiseAxis(aimY);
  setActionDown(frame, InputAction.Fire, true);
  return frame;
}

describe('an item granting a tag through onProjectileSpawn (#27 x #26)', () => {
  it('reaches a real fired shot exactly the way any other item hook does', () => {
    // The whole point of #27's design: an item is data plus a hook
    // (`docs/GAME_DESIGN.md` §8) that mutates the projectile it is handed,
    // and nothing about the tag engine — `ProjectileStore`, `shooting.ts`,
    // `behavior.ts` — had to grow a special case to let it add a tag.
    const item = baseItem('zielsuchend', {
      hooks: {
        onProjectileSpawn: (ctx) => {
          addProjectileTag(ctx.sim.projectiles, ctx.projectile, ProjectileTag.Homing);
        },
      },
    });
    const sim = new GameSim({
      room: openRoom(),
      items: [item],
      population: 'empty',
      projectileCapacity: 64,
    });
    sim.pickUpItem('zielsuchend');
    sim.spawnTarget(500, 260, 8);
    sim.world.flush();

    sim.step(aiming(1, 0));
    let slot = -1;
    sim.projectiles.forEachLive((index) => {
      slot = index;
    });
    expect(slot).toBeGreaterThanOrEqual(0);
    expect(sim.projectiles.tags[slot]).toBe(ProjectileTag.Homing);

    const initialAngle = Math.atan2(
      sim.projectiles.velocityY[slot] ?? 0,
      sim.projectiles.velocityX[slot] ?? 0,
    );
    for (let tick = 0; tick < 10; tick++) {
      sim.step();
    }
    expect(sim.projectiles.isLive(slot)).toBe(true);
    const turnedAngle = Math.atan2(
      sim.projectiles.velocityY[slot] ?? 0,
      sim.projectiles.velocityX[slot] ?? 0,
    );
    expect(turnedAngle).not.toBeCloseTo(initialAngle, 5);
  });
});

describe("tuning.shooting.forcedTags — the debug projectile tag chooser's write target", () => {
  it('reaches every shot the player fires, composed through the normal finalize path', () => {
    const sim = new GameSim({ room: openRoom(), population: 'empty', projectileCapacity: 64 });
    sim.tuning.shooting.fireDelayTicks = 1;
    sim.spawnTarget(200, 100, 8);
    sim.world.flush();

    sim.tuning.shooting.forcedTags = ProjectileTag.Piercing | ProjectileTag.Bouncing;
    sim.step(aiming(1, 0));

    let slot = -1;
    sim.projectiles.forEachLive((index) => {
      slot = index;
    });
    expect(slot).toBeGreaterThanOrEqual(0);
    expect(sim.projectiles.tags[slot]).toBe(ProjectileTag.Piercing | ProjectileTag.Bouncing);
    // Set by `finalizeProjectileTags`, exactly as it would be for a tag an
    // item granted — the chooser has no counter-setting logic of its own.
    expect(sim.projectiles.pierceRemaining[slot]).toBe(sim.tuning.projectileTags.pierceMaxTargets);

    // Clearing it (the chooser's "clear all") only affects the next shot.
    sim.tuning.shooting.forcedTags = 0;
    sim.step(aiming(1, 0));
    let secondSlot = -1;
    let count = 0;
    sim.projectiles.forEachLive((index) => {
      count += 1;
      if (index !== slot) {
        secondSlot = index;
      }
    });
    expect(count).toBe(2);
    expect(sim.projectiles.tags[secondSlot]).toBe(0);
  });
});
