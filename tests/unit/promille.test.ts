import { describe, expect, it } from 'vitest';
import {
  PROMILLE_MAX,
  PromilleTier,
  promilleDamageMultiplier,
  promilleDriftScale,
  promilleFireRateMultiplier,
  promilleSwayMagnitude,
  promilleTierOf,
  promilleWobbleAmplitude,
} from '../../src/sim/game/promille.js';
import { DEFAULT_PROMILLE_TUNING } from '../../src/sim/tuning.js';
import { GameSim } from '../../src/sim/game/sim.js';
import { RoomGeometry } from '../../src/sim/room/geometry.js';
import { ProjectileTeam } from '../../src/sim/projectile/store.js';
import {
  type InputFrame,
  InputAction,
  createInputFrame,
  quantiseAxis,
  setActionDown,
} from '../../src/sim/input/frame.js';
import { entityIndex } from '../../src/sim/ecs/entity.js';
import { StatId } from '../../src/sim/stats/definition.js';

function bareRoom(): RoomGeometry {
  return new RoomGeometry(0, 0, 320, 180);
}

/** A sim whose training targets have been cleared out of the way. */
function emptySim(): GameSim {
  const sim = new GameSim({ room: bareRoom() });
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

function idle(): InputFrame {
  return createInputFrame();
}

describe('promille tiers', () => {
  it('places the boundaries where the design doc states them', () => {
    expect(promilleTierOf(0)).toBe(PromilleTier.Nuchtern);
    expect(promilleTierOf(0.49)).toBe(PromilleTier.Nuchtern);
    expect(promilleTierOf(0.5)).toBe(PromilleTier.Angeheitert);
    expect(promilleTierOf(1.49)).toBe(PromilleTier.Angeheitert);
    expect(promilleTierOf(1.5)).toBe(PromilleTier.Beduselt);
    expect(promilleTierOf(2.99)).toBe(PromilleTier.Beduselt);
    expect(promilleTierOf(3.0)).toBe(PromilleTier.Vollrausch);
    expect(promilleTierOf(4.49)).toBe(PromilleTier.Vollrausch);
    expect(promilleTierOf(4.5)).toBe(PromilleTier.Umgfalln);
    expect(promilleTierOf(PROMILLE_MAX)).toBe(PromilleTier.Umgfalln);
  });

  it('applies the exact per-tier damage and fire-rate bonuses', () => {
    const tuning = DEFAULT_PROMILLE_TUNING;
    expect(promilleDamageMultiplier(PromilleTier.Nuchtern, tuning)).toBe(1);
    expect(promilleDamageMultiplier(PromilleTier.Angeheitert, tuning)).toBeCloseTo(
      1 + tuning.angeheitertDamageBonus,
    );
    expect(promilleFireRateMultiplier(PromilleTier.Beduselt, tuning)).toBeCloseTo(
      1 + tuning.beduseltFireRateBonus,
    );
    // Umgfalln keeps Vollrausch's numbers — there's no sixth tier of bonus.
    expect(promilleDamageMultiplier(PromilleTier.Umgfalln, tuning)).toBe(
      promilleDamageMultiplier(PromilleTier.Vollrausch, tuning),
    );
  });

  it('keeps drift and wobble at zero below Beduselt, and ramps after it', () => {
    const tuning = DEFAULT_PROMILLE_TUNING;
    expect(promilleDriftScale(0, tuning)).toBe(0);
    expect(promilleDriftScale(1.4, tuning)).toBe(0);
    expect(promilleDriftScale(1.5, tuning)).toBe(0);
    expect(promilleWobbleAmplitude(1.5, tuning)).toBe(0);
    expect(promilleDriftScale(PROMILLE_MAX, tuning)).toBeCloseTo(tuning.maxDrift);
    expect(promilleWobbleAmplitude(PROMILLE_MAX, tuning)).toBeCloseTo(tuning.maxWobble);
    expect(promilleDriftScale(3.25, tuning)).toBeGreaterThan(0);
    expect(promilleDriftScale(3.25, tuning)).toBeLessThan(tuning.maxDrift);
  });

  it('ramps sway from zero, even at low Promille', () => {
    const tuning = DEFAULT_PROMILLE_TUNING;
    expect(promilleSwayMagnitude(0, tuning)).toBe(0);
    expect(promilleSwayMagnitude(0.5, tuning)).toBeGreaterThan(0);
    expect(promilleSwayMagnitude(0.5, tuning)).toBeLessThan(tuning.maxSway);
    expect(promilleSwayMagnitude(PROMILLE_MAX, tuning)).toBeCloseTo(tuning.maxSway);
  });
});

describe('promille on GameSim', () => {
  it('decays toward zero over time', () => {
    const sim = emptySim();
    sim.tuning.promille.current = 1;
    sim.tuning.promille.decayPerSecond = 6; // 0.1/tick at 60 ticks/second
    sim.step(idle());
    expect(sim.promille).toBeCloseTo(0.9, 5);
  });

  it('never decays below zero', () => {
    const sim = emptySim();
    sim.tuning.promille.current = 0.01;
    sim.tuning.promille.decayPerSecond = 60;
    sim.step(idle());
    expect(sim.promille).toBe(0);
  });

  it('addPromille clamps at PROMILLE_MAX', () => {
    const sim = emptySim();
    sim.addPromille(PROMILLE_MAX + 10);
    expect(sim.promille).toBe(PROMILLE_MAX);
  });

  it('ignores a non-positive raise', () => {
    const sim = emptySim();
    sim.tuning.promille.current = 1;
    sim.addPromille(0);
    sim.addPromille(-5);
    expect(sim.promille).toBe(1);
  });

  it('crossing the Umgfalln threshold knocks the player down, invulnerable, then wakes them lower', () => {
    const sim = emptySim();
    sim.tuning.promille.umgfallnKnockdownTicks = 10;
    sim.addPromille(5);

    expect(sim.promilleTier).toBe(PromilleTier.Umgfalln);
    expect(sim.umgfallnTicks).toBe(10);
    expect(sim.playerInvulnerableTicks).toBeGreaterThanOrEqual(10);

    for (let tick = 0; tick < 9; tick++) {
      sim.step(idle());
    }
    expect(sim.umgfallnTicks).toBe(1);
    expect(sim.promille).toBe(PROMILLE_MAX);

    sim.step(idle());
    expect(sim.umgfallnTicks).toBe(0);
    expect(sim.promille).toBe(sim.tuning.promille.umgfallnWakePromille);
  });

  it('does not re-trigger the knockdown while already staggered', () => {
    const sim = emptySim();
    sim.tuning.promille.umgfallnKnockdownTicks = 30;
    sim.addPromille(5);
    const firstKnockdown = sim.umgfallnTicks;
    sim.step(idle());
    // Still Umgfalln-range and still staggered — a second raise should not
    // reset the countdown.
    sim.addPromille(0.1);
    expect(sim.umgfallnTicks).toBe(firstKnockdown - 1);
  });

  it('cannot move or fire while knocked down', () => {
    const sim = emptySim();
    sim.tuning.promille.umgfallnKnockdownTicks = 20;
    sim.addPromille(5);
    const index = sim.playerIndex;
    const startX = sim.positionX(index);

    const frame = createInputFrame();
    frame.moveX = quantiseAxis(1);
    for (let tick = 0; tick < 10; tick++) {
      sim.step(frame);
    }
    expect(sim.positionX(index)).toBeCloseTo(startX, 5);
  });
});

describe('Kater', () => {
  it('starts when Umgfalln wakes the player, and counts down on its own clock', () => {
    const sim = emptySim();
    sim.tuning.promille.umgfallnKnockdownTicks = 3;
    sim.tuning.promille.katerDurationTicks = 5;
    sim.addPromille(5);

    expect(sim.hasKater).toBe(false);
    for (let tick = 0; tick < 3; tick++) {
      sim.step(idle());
    }
    expect(sim.umgfallnTicks).toBe(0);
    expect(sim.hasKater).toBe(true);
    expect(sim.katerTicks).toBe(5);

    sim.step(idle());
    expect(sim.katerTicks).toBe(4);
  });

  it('clears on its own once its duration elapses', () => {
    const sim = emptySim();
    sim.tuning.promille.umgfallnKnockdownTicks = 1;
    sim.tuning.promille.katerDurationTicks = 2;
    sim.addPromille(5);

    sim.step(idle()); // wake, Kater starts at 2
    sim.step(idle()); // 1
    expect(sim.hasKater).toBe(true);
    sim.step(idle()); // 0
    expect(sim.hasKater).toBe(false);
    expect(sim.katerTicks).toBe(0);
  });

  it('reduces Stammwürze and Gschwindigkeit while active', () => {
    const sim = emptySim();
    sim.tuning.promille.umgfallnKnockdownTicks = 1;
    sim.tuning.promille.katerDurationTicks = 100;
    sim.tuning.promille.katerStammwuerzeMultiplier = 0.5;
    sim.tuning.promille.katerGschwindigkeitMultiplier = 0.6;
    // Zeroed so the wake tier's own damage bonus (Beduselt, at 1.5) doesn't
    // also stack into the number this test isolates Kater's effect on.
    sim.tuning.promille.beduseltDamageBonus = 0;
    sim.tuning.shooting.shotDamage = 4;
    const baseMaxSpeed = sim.tuning.movement.maxSpeed;

    sim.addPromille(5);
    sim.step(idle()); // wake, Kater active

    expect(sim.stats.value(StatId.Stammwuerze)).toBeCloseTo(4 * 0.5, 5);
    expect(sim.stats.value(StatId.Gschwindigkeit)).toBeCloseTo(baseMaxSpeed * 0.6, 5);
  });

  it('actually slows the player, not just the inspected stat', () => {
    const soberSim = emptySim();
    const katerSim = emptySim();
    katerSim.tuning.promille.umgfallnKnockdownTicks = 1;
    katerSim.tuning.promille.katerDurationTicks = 100;
    katerSim.tuning.promille.katerGschwindigkeitMultiplier = 0.5;
    katerSim.addPromille(5);
    katerSim.step(idle()); // wake, Kater active; also moves both sims one idle tick

    const frame = createInputFrame();
    frame.moveX = quantiseAxis(1);
    const soberStart = soberSim.positionX(soberSim.playerIndex);
    const katerStart = katerSim.positionX(katerSim.playerIndex);
    for (let tick = 0; tick < 30; tick++) {
      soberSim.step(frame);
      katerSim.step(frame);
    }
    const soberDistance = soberSim.positionX(soberSim.playerIndex) - soberStart;
    const katerDistance = katerSim.positionX(katerSim.playerIndex) - katerStart;

    expect(katerDistance).toBeGreaterThan(0);
    expect(katerDistance).toBeLessThan(soberDistance);
  });

  it('is cleared early by eating', () => {
    const sim = emptySim();
    sim.tuning.promille.umgfallnKnockdownTicks = 1;
    sim.tuning.promille.katerDurationTicks = 100;
    sim.addPromille(5);
    sim.step(idle());
    expect(sim.hasKater).toBe(true);

    sim.clearKater();
    expect(sim.hasKater).toBe(false);
  });
});

describe('beer pickups', () => {
  it('raises Promille and removes the pickup on overlap', () => {
    const sim = emptySim();
    const index = sim.playerIndex;
    sim.tuning.promille.beerAmount = 0.5;
    const beer = sim.spawnPickup('beer', sim.positionX(index), sim.positionY(index));
    sim.world.flush();
    const beerIndex = entityIndex(beer);

    sim.step(idle());

    expect(sim.promille).toBeCloseTo(0.5, 5);
    expect(sim.world.states[beerIndex]).not.toBe(1);
  });

  it('does not raise Promille from a pickup nowhere near the player', () => {
    const sim = emptySim();
    const index = sim.playerIndex;
    sim.spawnPickup('beer', sim.positionX(index) + 200, sim.positionY(index) + 200);
    sim.world.flush();
    sim.step(idle());
    expect(sim.promille).toBe(0);
  });
});

describe('promille projectile damage', () => {
  it('scales projectile damage by the current tier multiplier', () => {
    const sim = emptySim();
    sim.tuning.promille.current = 3.0; // Vollrausch
    sim.tuning.shooting.shotDamage = 2;
    sim.tuning.shooting.fireDelayTicks = 100;

    const frame = createInputFrame();
    frame.aimX = quantiseAxis(1);
    setActionDown(frame, InputAction.Fire, true);
    sim.step(frame);

    let found = -1;
    for (let index = 0; index < sim.projectiles.capacity; index++) {
      if (sim.projectiles.isLive(index) && sim.projectiles.team[index] === ProjectileTeam.Player) {
        found = index;
        break;
      }
    }
    expect(found).not.toBe(-1);
    const expected = Math.round(2 * (1 + sim.tuning.promille.vollrauschDamageBonus));
    expect(sim.projectiles.damage[found]).toBe(expected);
  });
});
