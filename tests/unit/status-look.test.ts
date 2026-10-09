import { describe, expect, it } from 'vitest';
import { createStatusLook, readStatusLook } from '../../src/render/status-look.js';
import { STATUS_LOOK_PALETTE } from '../../src/render/palette.js';
import {
  STATUS_BURN,
  STATUS_DAZE,
  STATUS_EFFECT_STRIDE,
  STATUS_FREEZE,
  STATUS_POISON,
  STATUS_SLOW,
} from '../../src/sim/systems/status-effects.js';
import type { GameSim } from '../../src/sim/game/sim.js';

function simWith(index: number, slots: Record<number, number>): GameSim {
  const data = new Float32Array((index + 1) * STATUS_EFFECT_STRIDE);
  for (const [slot, ticks] of Object.entries(slots)) {
    data[index * STATUS_EFFECT_STRIDE + Number(slot)] = ticks;
  }
  return { statusEffect: { data } } as unknown as GameSim;
}

describe('readStatusLook', () => {
  it('leaves a body with no status untinted and unglowing', () => {
    const look = readStatusLook(simWith(3, {}), 3, 0, createStatusLook());
    expect(look.tint).toBe(-1);
    expect(look.glowStrength).toBe(0);
  });

  it('gives every status its own tint, enemy or player index alike', () => {
    const tints = [STATUS_FREEZE, STATUS_BURN, STATUS_POISON, STATUS_DAZE, STATUS_SLOW].map(
      (slot) => readStatusLook(simWith(0, { [slot]: 5 }), 0, 0, createStatusLook()).tint,
    );
    expect(new Set(tints).size).toBe(5);
    expect(tints.every((tint) => tint >= 0)).toBe(true);
  });

  it('lets frost win the tint but keeps fire glowing underneath', () => {
    const look = readStatusLook(
      simWith(1, { [STATUS_FREEZE]: 5, [STATUS_BURN]: 5 }),
      1,
      0,
      createStatusLook(),
    );
    expect(look.tint).toBe(STATUS_LOOK_PALETTE.freezeTint);
    expect(look.glow).toBe(STATUS_LOOK_PALETTE.burnGlow);
    expect(look.glowStrength).toBeGreaterThan(0);
  });

  it('flickers a burning body over time', () => {
    const sim = simWith(0, { [STATUS_BURN]: 5 });
    const mixes = new Set<number>();
    for (let ms = 0; ms < 400; ms += 37) {
      mixes.add(readStatusLook(sim, 0, ms, createStatusLook()).mix);
    }
    expect(mixes.size).toBeGreaterThan(3);
  });
});
