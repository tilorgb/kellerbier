import { describe, expect, it } from 'vitest';
import { emitStatusParticles } from '../../src/sim/systems/status-particles.js';
import { PARTICLE_CAPACITY, ParticleKind, ParticleStore } from '../../src/sim/particle/store.js';
import type { GameSim } from '../../src/sim/game/sim.js';

function stubSim(tick: number, particles = new ParticleStore()): GameSim {
  return {
    tick,
    particles,
    tuning: { impact: { particleSize: 0.7 } },
    positionX: () => 50,
    positionY: () => 40,
  } as unknown as GameSim;
}

/** The set of particle kinds born over `ticks` consecutive ticks for one afflicted body. */
function kindsOver(
  ticks: number,
  flags: [boolean, boolean, boolean, boolean, boolean],
): Set<number> {
  const particles = new ParticleStore();
  for (let tick = 0; tick < ticks; tick++) {
    emitStatusParticles(stubSim(tick, particles), 1, ...flags);
  }
  const kinds = new Set<number>();
  particles.forEachLive((index) => {
    kinds.add(particles.kind[index] ?? -1);
  });
  return kinds;
}

describe('emitStatusParticles', () => {
  it('emits nothing for a body with no status', () => {
    expect(kindsOver(60, [false, false, false, false, false]).size).toBe(0);
  });

  it('gives each status its own kind of particle', () => {
    expect([...kindsOver(60, [true, false, false, false, false])]).toEqual([ParticleKind.Ember]);
    expect([...kindsOver(60, [false, true, false, false, false])]).toEqual([ParticleKind.Snow]);
    expect([...kindsOver(60, [false, false, true, false, false])]).toEqual([ParticleKind.Miasma]);
    expect([...kindsOver(60, [false, false, false, true, false])]).toEqual([ParticleKind.Dust]);
    expect([...kindsOver(60, [false, false, false, false, true])]).toEqual([ParticleKind.Glint]);
  });

  it('draws nothing from the cosmetic random stream', () => {
    const sim = stubSim(4) as unknown as { random?: unknown };
    expect(() => {
      emitStatusParticles(sim as GameSim, 1, true, true, true, true, true);
    }).not.toThrow();
    expect(sim.random).toBeUndefined();
  });

  it('gives way to hit feedback once the pool is mostly full', () => {
    const particles = new ParticleStore();
    for (let filled = 0; filled < PARTICLE_CAPACITY * 0.7; filled++) {
      particles.spawn(0, 0, 0, 0, 10, 1, ParticleKind.Foam);
    }
    const before = particles.liveCount;
    for (let tick = 0; tick < 60; tick++) {
      emitStatusParticles(stubSim(tick, particles), 1, true, true, true, true, true);
    }
    expect(particles.liveCount).toBe(before);
  });
});
