import { describe, expect, it } from 'vitest';
import {
  PROMILLE_MAX,
  PromilleTier,
  TRINKFEST_MAX,
  TRINKFEST_MIN,
  promilleCapFor,
  promilleDamageMultiplier,
  promilleDriftScale,
  promilleFireRateMultiplier,
  promilleRequirementMet,
  promilleScreenDistortion,
  promilleSwayMagnitude,
  promilleTierOf,
  promilleWobbleAmplitude,
} from '../../src/sim/game/promille.js';
import { DEFAULT_PROMILLE_TUNING, type PromilleTuning } from '../../src/sim/tuning.js';
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

/** Baseline Trinkfest (0), the default tuning — the pre-#92 call shape. */
function tierOf(value: number, trinkfest = 0, tuning: PromilleTuning = DEFAULT_PROMILLE_TUNING) {
  return promilleTierOf(value, trinkfest, tuning);
}

describe('promille tiers', () => {
  it('places the boundaries where the design doc states them, unchanged at baseline Trinkfest', () => {
    expect(tierOf(0)).toBe(PromilleTier.Nuchtern);
    expect(tierOf(0.49)).toBe(PromilleTier.Nuchtern);
    expect(tierOf(0.5)).toBe(PromilleTier.Angeheitert);
    expect(tierOf(1.49)).toBe(PromilleTier.Angeheitert);
    expect(tierOf(1.5)).toBe(PromilleTier.Beduselt);
    expect(tierOf(2.99)).toBe(PromilleTier.Beduselt);
    expect(tierOf(3.0)).toBe(PromilleTier.Vollrausch);
    expect(tierOf(4.49)).toBe(PromilleTier.Vollrausch);
    expect(tierOf(4.5)).toBe(PromilleTier.Umgfalln);
    expect(tierOf(PROMILLE_MAX)).toBe(PromilleTier.Umgfalln);
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

  it('has no screen distortion below Vollrausch, ramping to 1 at the pre-#92 ceiling', () => {
    const tuning = DEFAULT_PROMILLE_TUNING;
    expect(promilleScreenDistortion(0, tuning)).toBe(0);
    expect(promilleScreenDistortion(2.9, tuning)).toBe(0);
    expect(promilleScreenDistortion(3.0, tuning)).toBe(0);
    expect(promilleScreenDistortion(PROMILLE_MAX, tuning)).toBeCloseTo(tuning.maxScreenDistortion);
  });
});

describe('promilleRequirementMet (#32)', () => {
  it('is always met for "any", at every tier', () => {
    expect(promilleRequirementMet('any', PromilleTier.Nuchtern)).toBe(true);
    expect(promilleRequirementMet('any', PromilleTier.Angeheitert)).toBe(true);
    expect(promilleRequirementMet('any', PromilleTier.Vollrausch)).toBe(true);
    expect(promilleRequirementMet('any', PromilleTier.Umgfalln)).toBe(true);
  });

  it('"sober" is met only at Nüchtern, exactly the pre-#32 Ruhige Hand threshold', () => {
    expect(promilleRequirementMet('sober', PromilleTier.Nuchtern)).toBe(true);
    expect(promilleRequirementMet('sober', PromilleTier.Angeheitert)).toBe(false);
    expect(promilleRequirementMet('sober', PromilleTier.Beduselt)).toBe(false);
    expect(promilleRequirementMet('sober', PromilleTier.Vollrausch)).toBe(false);
    // The boundary itself: tierOf(0.5) is Angeheitert, not Nüchtern (see
    // 'promille tiers' above), so 0.5 Promille is already un-sober — the
    // exact number `ruhige-hand.ts` used to hardcode before this replaced it.
    expect(promilleRequirementMet('sober', tierOf(0.5))).toBe(false);
    expect(promilleRequirementMet('sober', tierOf(0.49))).toBe(true);
  });

  it('"rausch" is met at Vollrausch and everything Trinkfest adds past it, never below', () => {
    expect(promilleRequirementMet('rausch', PromilleTier.Beduselt)).toBe(false);
    expect(promilleRequirementMet('rausch', PromilleTier.Vollrausch)).toBe(true);
    // Sturzbesoffen and Filmriss (#92) extend the ladder past Vollrausch —
    // a rausch item must stay on for both, per the merge note: compare
    // `tier >= Vollrausch`, never `=== Vollrausch`.
    expect(promilleRequirementMet('rausch', PromilleTier.Sturzbesoffen)).toBe(true);
    expect(promilleRequirementMet('rausch', PromilleTier.Filmriss)).toBe(true);
    expect(promilleRequirementMet('rausch', PromilleTier.Umgfalln)).toBe(true);
  });
});

describe('Trinkfest (#92)', () => {
  it('reproduces the exact pre-#92 tier boundaries at baseline (trinkfest 0)', () => {
    // The acceptance criterion in the issue's own words: "a player with
    // baseline Trinkfest experiences the existing Promille behaviour
    // unchanged." Sweeping the whole range at trinkfest 0 against the
    // pre-#92 boundary table is the strongest form of that guarantee this
    // pure function can offer.
    const samples = [0, 0.49, 0.5, 1.49, 1.5, 2.99, 3.0, 4.49, 4.5, PROMILLE_MAX];
    const expected = [
      PromilleTier.Nuchtern,
      PromilleTier.Nuchtern,
      PromilleTier.Angeheitert,
      PromilleTier.Angeheitert,
      PromilleTier.Beduselt,
      PromilleTier.Beduselt,
      PromilleTier.Vollrausch,
      PromilleTier.Vollrausch,
      PromilleTier.Umgfalln,
      PromilleTier.Umgfalln,
    ];
    samples.forEach((value, index) => {
      expect(tierOf(value, 0)).toBe(expected[index]);
    });
    expect(promilleCapFor(0, DEFAULT_PROMILLE_TUNING)).toBe(PROMILLE_MAX);
  });

  it('raises the Umgfalln threshold and the reachable ceiling one stage width per level', () => {
    const tuning = DEFAULT_PROMILLE_TUNING;
    expect(promilleCapFor(1, tuning)).toBeCloseTo(PROMILLE_MAX + tuning.trinkfestStageWidth);
    expect(promilleCapFor(2, tuning)).toBeCloseTo(PROMILLE_MAX + 2 * tuning.trinkfestStageWidth);
    // A negative level pulls the threshold in without shrinking the ceiling
    // itself — see `promilleCapFor`'s own doc comment for why.
    expect(promilleCapFor(TRINKFEST_MIN, tuning)).toBe(PROMILLE_MAX);
  });

  it('lets Promille pass the old Vollrausch/Umgfalln boundary once Trinkfest unlocks a stage', () => {
    const tuning = DEFAULT_PROMILLE_TUNING;
    // 4.5 used to be Umgfalln outright — the "raising Trinkfest lets the
    // player pass the current Vollrausch range before Umgfalln" criterion.
    expect(tierOf(4.5, 1, tuning)).toBe(PromilleTier.Sturzbesoffen);
    expect(tierOf(4.5, 2, tuning)).toBe(PromilleTier.Sturzbesoffen);
    // The second stage only opens up a further level in.
    expect(tierOf(5.5, 1, tuning)).toBe(PromilleTier.Umgfalln);
    expect(tierOf(5.5, 2, tuning)).toBe(PromilleTier.Filmriss);
    // Umgfalln itself simply moves out to match.
    expect(tierOf(6.49, 2, tuning)).toBe(PromilleTier.Filmriss);
    expect(tierOf(6.5, 2, tuning)).toBe(PromilleTier.Umgfalln);
  });

  it('pulls Umgfalln in early on a negative level, without skipping past Vollrausch', () => {
    const tuning = DEFAULT_PROMILLE_TUNING;
    expect(tierOf(3.4, TRINKFEST_MIN, tuning)).toBe(PromilleTier.Vollrausch);
    expect(tierOf(3.5, TRINKFEST_MIN, tuning)).toBe(PromilleTier.Umgfalln);
    // Still ordinary Beduselt/Vollrausch below that — only the top is cut.
    expect(tierOf(2.0, TRINKFEST_MIN, tuning)).toBe(PromilleTier.Beduselt);
  });

  it('clamps to TRINKFEST_MIN/MAX', () => {
    const sim = emptySim();
    sim.raiseTrinkfest(TRINKFEST_MAX + 5);
    expect(sim.trinkfest).toBe(TRINKFEST_MAX);
    sim.lowerTrinkfest(TRINKFEST_MAX - TRINKFEST_MIN + 5);
    expect(sim.trinkfest).toBe(TRINKFEST_MIN);
  });

  it('gives Sturzbesoffen and Filmriss bigger bonuses than Vollrausch', () => {
    const tuning = DEFAULT_PROMILLE_TUNING;
    const vollrauschDamage = promilleDamageMultiplier(PromilleTier.Vollrausch, tuning);
    const sturzbesoffenDamage = promilleDamageMultiplier(PromilleTier.Sturzbesoffen, tuning);
    const filmrissDamage = promilleDamageMultiplier(PromilleTier.Filmriss, tuning);
    expect(sturzbesoffenDamage).toBeGreaterThan(vollrauschDamage);
    expect(filmrissDamage).toBeGreaterThan(sturzbesoffenDamage);

    const vollrauschFireRate = promilleFireRateMultiplier(PromilleTier.Vollrausch, tuning);
    const sturzbesoffenFireRate = promilleFireRateMultiplier(PromilleTier.Sturzbesoffen, tuning);
    const filmrissFireRate = promilleFireRateMultiplier(PromilleTier.Filmriss, tuning);
    expect(sturzbesoffenFireRate).toBeGreaterThan(vollrauschFireRate);
    expect(filmrissFireRate).toBeGreaterThan(sturzbesoffenFireRate);
  });

  it('escalates sway, wobble, drift and screen distortion past their old ceiling once Trinkfest opens the range up', () => {
    const tuning = DEFAULT_PROMILLE_TUNING;
    // A Promille only reachable with Trinkfest raised (see the cap test
    // above) — every ramp should read higher here than its old, capped-at-1
    // maximum, which is the "escalating costs" acceptance criterion made
    // concrete: the further Trinkfest is pushed, the worse these get.
    const deepValue = PROMILLE_MAX + 1.5;
    expect(promilleDriftScale(deepValue, tuning)).toBeGreaterThan(tuning.maxDrift);
    expect(promilleWobbleAmplitude(deepValue, tuning)).toBeGreaterThan(tuning.maxWobble);
    expect(promilleSwayMagnitude(deepValue, tuning)).toBeGreaterThan(tuning.maxSway);
    expect(promilleScreenDistortion(deepValue, tuning)).toBeGreaterThan(tuning.maxScreenDistortion);
  });

  it('raiseTrinkfest/lowerTrinkfest move GameSim.trinkfest and leave Promille itself untouched', () => {
    const sim = emptySim();
    sim.tuning.promille.current = 2;
    sim.raiseTrinkfest(1);
    expect(sim.trinkfest).toBe(1);
    expect(sim.promille).toBe(2);
    sim.lowerTrinkfest(1);
    expect(sim.trinkfest).toBe(0);
    expect(sim.promille).toBe(2);
  });

  it('ignores a non-positive raise or lower', () => {
    const sim = emptySim();
    sim.raiseTrinkfest(1);
    sim.raiseTrinkfest(0);
    sim.raiseTrinkfest(-5);
    expect(sim.trinkfest).toBe(1);
    sim.lowerTrinkfest(0);
    sim.lowerTrinkfest(-5);
    expect(sim.trinkfest).toBe(1);
  });

  it('lets a raised Trinkfest carry Promille past the old Umgfalln threshold without falling over', () => {
    const sim = emptySim();
    sim.raiseTrinkfest(1);
    sim.addPromille(4.5);
    // Pre-#92 this exact amount would already be Umgfalln.
    expect(sim.promilleTier).toBe(PromilleTier.Sturzbesoffen);
    expect(sim.umgfallnTicks).toBe(0);
  });

  it('still knocks the player down once the raised threshold is actually crossed', () => {
    const sim = emptySim();
    sim.tuning.promille.umgfallnKnockdownTicks = 10;
    sim.raiseTrinkfest(1);
    sim.addPromille(5.5); // exactly umgfallnThresholdFor(1, tuning)
    expect(sim.promilleTier).toBe(PromilleTier.Umgfalln);
    expect(sim.umgfallnTicks).toBe(10);
  });

  it('lowering Trinkfest mid-run does not corrupt an in-progress knockdown or Kater', () => {
    // The failure mode #92 calls out by name: changing Trinkfest while
    // Umgfalln/Kater are already running must not double-trigger the
    // knockdown, skip it, or otherwise leave the two counters inconsistent.
    const sim = emptySim();
    sim.tuning.promille.umgfallnKnockdownTicks = 10;
    sim.addPromille(5);
    const ticksBefore = sim.umgfallnTicks;
    expect(ticksBefore).toBe(10);

    sim.lowerTrinkfest(1); // still well inside Umgfalln at this Promille
    expect(sim.umgfallnTicks).toBe(ticksBefore); // not re-triggered

    sim.step(idle());
    expect(sim.umgfallnTicks).toBe(ticksBefore - 1);

    for (let tick = 0; tick < ticksBefore - 1; tick++) {
      sim.step(idle());
    }
    expect(sim.umgfallnTicks).toBe(0);
    expect(sim.hasKater).toBe(true);
    expect(sim.promille).toBe(sim.tuning.promille.umgfallnWakePromille);
  });

  it('lowering Trinkfest out from under an elevated Promille triggers Umgfalln immediately, not silently', () => {
    // The other half of the same failure mode: dropping tolerance while
    // already sitting above the *new*, lower threshold has to actually
    // start the knockdown — not leave the player standing in a tier named
    // Umgfalln with none of its consequences.
    const sim = emptySim();
    sim.tuning.promille.umgfallnKnockdownTicks = 12;
    sim.addPromille(4.0); // Vollrausch, comfortably below the baseline threshold
    expect(sim.umgfallnTicks).toBe(0);

    sim.lowerTrinkfest(1); // threshold moves to 3.5 — 4.0 is now Umgfalln
    expect(sim.promilleTier).toBe(PromilleTier.Umgfalln);
    expect(sim.umgfallnTicks).toBe(12);
    expect(sim.playerInvulnerableTicks).toBeGreaterThanOrEqual(12);
  });

  it('does not re-trigger a knockdown that is already running when Trinkfest changes again', () => {
    const sim = emptySim();
    sim.tuning.promille.umgfallnKnockdownTicks = 20;
    sim.addPromille(5);
    sim.step(idle());
    const ticksAfterOneStep = sim.umgfallnTicks;

    sim.lowerTrinkfest(1);
    sim.raiseTrinkfest(1);
    expect(sim.umgfallnTicks).toBe(ticksAfterOneStep);
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
