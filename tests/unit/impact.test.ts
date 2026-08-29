import { describe, expect, it } from 'vitest';
import { EventKind } from '../../src/sim/events/queue.js';
import { ParticleKind } from '../../src/sim/particle/store.js';
import { GameSim, TARGET_HEALTH, TARGET_RESPAWN_TICKS } from '../../src/sim/game/sim.js';
import {
  type InputFrame,
  InputAction,
  createInputFrame,
  quantiseAxis,
  setActionDown,
} from '../../src/sim/input/frame.js';
import { DEFAULT_IMPACT_TUNING } from '../../src/sim/tuning.js';

const IDLE = createInputFrame();

function aiming(aimX: number, aimY: number): InputFrame {
  const frame = createInputFrame();
  frame.aimX = quantiseAxis(aimX);
  frame.aimY = quantiseAxis(aimY);
  setActionDown(frame, InputAction.Fire, true);
  return frame;
}

/** Fires rightward while also holding the move stick, independent of aim. */
function movingWhileFiring(): InputFrame {
  const frame = aiming(1, 0);
  frame.moveY = quantiseAxis(-1);
  return frame;
}

/** The left-hand training target, which sits level with the player's spawn. */
const TARGET = 1;

/** Hit events reported by the step that just ran. */
function hitsThisTick(sim: GameSim): number {
  let hits = 0;
  sim.events.forEach((slot) => {
    if (sim.events.kind[slot] === EventKind.ProjectileHit) {
      hits += 1;
    }
  });
  return hits;
}

/** Fires one shot leftward and runs until it lands. Returns the tick it landed on. */
function landOneShot(sim: GameSim): number {
  sim.step(aiming(-1, 0));
  for (let tick = 0; tick < 90; tick++) {
    sim.step(IDLE);
    if (hitsThisTick(sim) > 0) {
      return sim.tick;
    }
  }
  throw new Error('the shot never landed');
}

/** How many live particles are of one kind. */
function countKind(sim: GameSim, kind: number): number {
  let count = 0;
  sim.particles.forEachLive((index) => {
    if (sim.particles.kind[index] === kind) {
      count += 1;
    }
  });
  return count;
}

describe('impact feel', () => {
  it('flashes the struck body white, holds it while staggered, then lets it decay', () => {
    const sim = new GameSim();
    landOneShot(sim);
    expect(sim.flash.data[TARGET]).toBe(DEFAULT_IMPACT_TUNING.flashTicks);

    // The stagger holds the white frame up before it starts ageing — see
    // `GameSim.decayPresentation`.
    while ((sim.hitStun.data[TARGET] ?? 0) > 0) {
      sim.step(IDLE);
      expect(sim.flash.data[TARGET]).toBe(DEFAULT_IMPACT_TUNING.flashTicks);
    }
    sim.step(IDLE);
    expect(sim.flash.data[TARGET]).toBe(0);
  });

  it('staggers the struck body on a hit, and it recovers on its own — without freezing the game', () => {
    const sim = new GameSim();
    landOneShot(sim);
    expect(sim.hitStun.data[TARGET]).toBeGreaterThan(0);
    expect(sim.hitStun.data[TARGET]).toBeLessThanOrEqual(DEFAULT_IMPACT_TUNING.maxHitstunTicks);
    // The whole point of the redesign: nothing global happened.
    expect(sim.frozen).toBe(false);

    const stunnedFor = sim.hitStun.data[TARGET] ?? 0;
    for (let tick = 0; tick < stunnedFor; tick++) {
      sim.step(IDLE);
      expect(sim.frozen).toBe(false);
    }
    expect(sim.hitStun.data[TARGET]).toBe(0);
  });

  it('keeps the rest of the game running while the struck body is staggered', () => {
    const sim = new GameSim();
    // Short enough that a second shot has time to fire inside even a brief
    // stagger window — the point being tested is that it can, at all.
    sim.tuning.shooting.fireDelayTicks = 1;
    landOneShot(sim);
    expect(sim.hitStun.data[TARGET]).toBeGreaterThan(0);

    const yBefore = sim.positionY(sim.playerIndex);
    const shotsBefore = sim.projectiles.liveCount;
    const input = movingWhileFiring();

    let stunnedTicks = 0;
    while ((sim.hitStun.data[TARGET] ?? 0) > 0) {
      sim.step(input);
      stunnedTicks += 1;
    }

    // The player kept moving and kept firing while the struck body was still
    // staggered — neither was possible under the old whole-sim freeze.
    expect(stunnedTicks).toBeGreaterThan(0);
    expect(sim.positionY(sim.playerIndex)).not.toBe(yBefore);
    expect(sim.projectiles.liveCount).toBeGreaterThan(shotsBefore);
  });

  it('caps hitstun however much damage arrives', () => {
    const sim = new GameSim();
    // Survives the hit, so this measures the cap on a hit rather than the "no
    // stagger at all" a kill gets.
    sim.health.data[TARGET * 2] = 30_000;
    sim.tuning.shooting.shotDamage = 1000;
    landOneShot(sim);
    expect(sim.hitStun.data[TARGET]).toBeLessThanOrEqual(DEFAULT_IMPACT_TUNING.maxHitstunTicks);
    expect(sim.hitStun.data[TARGET]).toBeGreaterThan(0);
  });

  it('knocks the struck body along the shot, and less so the heavier it is', () => {
    const light = new GameSim();
    light.body.data[TARGET * 2 + 1] = 1;
    const lightStart = light.positionX(TARGET);
    landOneShot(light);
    for (let tick = 0; tick < 40; tick++) {
      light.step(IDLE);
    }
    const lightMoved = lightStart - light.positionX(TARGET);

    const heavy = new GameSim();
    heavy.body.data[TARGET * 2 + 1] = 8;
    const heavyStart = heavy.positionX(TARGET);
    landOneShot(heavy);
    for (let tick = 0; tick < 40; tick++) {
      heavy.step(IDLE);
    }
    const heavyMoved = heavyStart - heavy.positionX(TARGET);

    // Shot from the right, so both are pushed left.
    expect(lightMoved).toBeGreaterThan(0);
    expect(heavyMoved).toBeGreaterThan(0);
    expect(heavyMoved).toBeLessThan(lightMoved / 2);
  });

  it('shakes the camera, caps it, and settles back to nothing', () => {
    const sim = new GameSim();
    landOneShot(sim);
    expect(sim.shake).toBeGreaterThan(0);
    expect(sim.shake).toBeLessThanOrEqual(DEFAULT_IMPACT_TUNING.maxShake);

    for (let tick = 0; tick < 120; tick++) {
      sim.step(IDLE);
      expect(sim.shake).toBeLessThanOrEqual(DEFAULT_IMPACT_TUNING.maxShake);
    }
    expect(sim.shake).toBe(0);
  });

  it('never exceeds the cap however many hits land at once', () => {
    const sim = new GameSim();
    for (let hit = 0; hit < 50; hit++) {
      sim.addShake(1, 0, 100);
    }
    expect(sim.shake).toBe(DEFAULT_IMPACT_TUNING.maxShake);
  });

  it('has an accessibility scale that reaches actual zero', () => {
    const sim = new GameSim();
    landOneShot(sim);
    expect(Math.abs(sim.shakeX) + Math.abs(sim.shakeY)).toBeGreaterThan(0);

    sim.screenShakeScale = 0;
    expect(Math.abs(sim.shakeX)).toBe(0);
    expect(Math.abs(sim.shakeY)).toBe(0);

    // And it is a scale, not a switch.
    sim.screenShakeScale = 0.5;
    const halved = Math.abs(sim.shakeX);
    sim.screenShakeScale = 1;
    expect(halved).toBeCloseTo(Math.abs(sim.shakeX) / 2, 6);
  });

  it('sprays foam from the impact', () => {
    const sim = new GameSim();
    expect(sim.particles.liveCount).toBe(0);
    landOneShot(sim);
    // Counted by kind rather than in total (#153): firing also throws a muzzle
    // flash and a landed hit adds a few sparks, so a bare total no longer says
    // anything about the foam specifically — which is the thing this is about.
    expect(countKind(sim, ParticleKind.Foam)).toBe(DEFAULT_IMPACT_TUNING.particlesPerHit);
  });

  it('throws sparks on a hit that lands but does not kill', () => {
    const sim = new GameSim();
    landOneShot(sim);
    expect(countKind(sim, ParticleKind.Spark)).toBeGreaterThan(0);
  });

  it('throws no sparks on a hit that kills — the death effect is the statement instead', () => {
    // A separate sim rather than a second shot into the first one: sparks are
    // deliberately short-lived, so the ones from an earlier hit are long gone
    // by the time a second shot crosses the room, and a before/after count
    // would pass for the wrong reason.
    const sim = new GameSim();
    sim.tuning.shooting.shotDamage = TARGET_HEALTH;
    landOneShot(sim);
    expect(countKind(sim, ParticleKind.Spark)).toBe(0);
    expect(countKind(sim, ParticleKind.Splash)).toBeGreaterThan(0);
  });

  it('throws a heavier burst on a kill than on a hit', () => {
    const sim = new GameSim();
    landOneShot(sim);
    const foamOnHit = countKind(sim, ParticleKind.Foam);

    // Enough damage to finish it on the next shot. No stagger to wait out
    // between the two — a struck-but-alive body stays hittable regardless.
    sim.tuning.shooting.shotDamage = TARGET_HEALTH;
    landOneShot(sim);
    // A training target is not an enemy, so it comes apart into beer — the
    // default every death threw before `deathEffect` existed.
    expect(countKind(sim, ParticleKind.Splash)).toBeGreaterThan(foamOnHit);
  });

  it('flashes the muzzle on the tick a shot leaves it', () => {
    const sim = new GameSim();
    expect(countKind(sim, ParticleKind.Flash)).toBe(0);
    // Checked on the firing tick, not after the shot lands: a muzzle flash
    // that outlived the shot's flight would be a lamp.
    sim.step(aiming(-1, 0));
    expect(countKind(sim, ParticleKind.Flash)).toBe(1);
    for (let tick = 0; tick < 10; tick++) {
      sim.step(IDLE);
    }
    expect(countKind(sim, ParticleKind.Flash)).toBe(0);
  });

  it('keeps damage numbers off unless they are asked for', () => {
    const sim = new GameSim();
    landOneShot(sim);
    expect(sim.damageNumbers.liveCount).toBe(0);

    const opted = new GameSim();
    opted.tuning.impact.damageNumbers = true;
    landOneShot(opted);
    expect(opted.damageNumbers.liveCount).toBe(1);
  });
});

describe('death', () => {
  it('takes exactly as many shots as the body has health', () => {
    const sim = new GameSim();
    for (let shot = 0; shot < TARGET_HEALTH - 1; shot++) {
      landOneShot(sim);
      expect(sim.world.isAlive(sim.world.entityAt(TARGET))).toBe(true);
    }

    landOneShot(sim);
    let deaths = 0;
    sim.events.forEach((slot) => {
      if (sim.events.kind[slot] === EventKind.Death) {
        deaths += 1;
      }
    });
    expect(deaths).toBe(1);
  });

  it('flashes brighter for a kill than for a hit, and asks for no stagger on the body it removes', () => {
    const hit = new GameSim();
    landOneShot(hit);
    const hitFlash = hit.flash.data[TARGET] ?? 0;
    expect(hit.hitStun.data[TARGET]).toBeGreaterThan(0);

    const kill = new GameSim();
    kill.tuning.shooting.shotDamage = TARGET_HEALTH;
    landOneShot(kill);
    expect(kill.flash.data[TARGET]).toBeGreaterThan(hitFlash);
    // Nothing to stagger — the body is on its way out of the world.
    expect(kill.hitStun.data[TARGET]).toBe(0);
  });

  it('leaves a splash on the floor that stays there', () => {
    const sim = new GameSim();
    sim.tuning.shooting.shotDamage = TARGET_HEALTH;
    expect(sim.decals.liveCount).toBe(0);
    landOneShot(sim);
    expect(sim.decals.liveCount).toBe(1);

    for (let tick = 0; tick < 600; tick++) {
      sim.step(IDLE);
    }
    expect(sim.decals.liveCount).toBe(1);
  });

  it('brings the training target back, so tuning by feel is not a chore', () => {
    const sim = new GameSim();
    sim.tuning.shooting.shotDamage = TARGET_HEALTH;
    landOneShot(sim);
    sim.world.flush();
    const afterDeath = sim.world.count;

    for (let tick = 0; tick < TARGET_RESPAWN_TICKS + 5; tick++) {
      sim.step(IDLE);
    }
    expect(sim.world.count).toBe(afterDeath + 1);
  });
});
