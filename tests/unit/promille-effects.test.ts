import { describe, expect, it } from 'vitest';
import {
  PromilleTier,
  promilleDriftScale,
  promilleGloom,
  promilleTierEffects,
  promilleTierOf,
  promilleTierStart,
  promilleTunnelVision,
  promilleWobbleAmplitude,
  reachablePromilleTiers,
  type PromilleTierId,
} from '../../src/sim/game/promille.js';
import { GameSim } from '../../src/sim/game/sim.js';
import { RoomGeometry } from '../../src/sim/room/geometry.js';
import { createInputFrame } from '../../src/sim/input/frame.js';
import { DEFAULT_PROMILLE_TUNING } from '../../src/sim/tuning.js';
import {
  promilleEffectsText,
  promilleKaterText,
} from '../../src/render/promille-text.js';

/**
 * #460: the player was never told what a Promille tier does. These pin the
 * three things that fix that — the tier-crossing signal the toast listens to,
 * the effects table the toast and the pause panel both print, and the
 * rule that every number in the words comes out of the tuning.
 */

function sim(): GameSim {
  return new GameSim({ room: new RoomGeometry(0, 0, 320, 180) });
}

describe('GameSim.promilleTierChange (#460)', () => {
  it('is null until the first crossing', () => {
    const s = sim();
    expect(s.promilleTierChange).toBeNull();
    s.step(createInputFrame());
    expect(s.promilleTierChange).toBeNull();
  });

  it('reports the tier left and the tier entered when the meter climbs', () => {
    const s = sim();
    s.step(createInputFrame());
    s.addPromille(0.6);
    s.step(createInputFrame());
    expect(s.promilleTierChange).toMatchObject({
      from: PromilleTier.Nuchtern,
      tier: PromilleTier.Angeheitert,
    });
  });

  it('is a fresh object per crossing, so a presenter can tell new from already-shown', () => {
    const s = sim();
    s.step(createInputFrame());
    s.addPromille(0.6);
    s.step(createInputFrame());
    const first = s.promilleTierChange;
    s.step(createInputFrame());
    expect(s.promilleTierChange).toBe(first);
    s.addPromille(1.0);
    s.step(createInputFrame());
    expect(s.promilleTierChange).not.toBe(first);
    expect(s.promilleTierChange?.tier).toBe(PromilleTier.Beduselt);
  });

  it('also reports a drop back down, and the knockdown', () => {
    const s = sim();
    s.step(createInputFrame());
    s.addPromille(2);
    s.step(createInputFrame());
    s.tuning.promille.current = 0.1;
    s.step(createInputFrame());
    expect(s.promilleTierChange).toMatchObject({
      from: PromilleTier.Beduselt,
      tier: PromilleTier.Nuchtern,
    });
    s.addPromille(5);
    s.step(createInputFrame());
    expect(s.promilleTierChange?.tier).toBe(PromilleTier.Umgfalln);
  });
});

describe('promilleTierEffects (#460)', () => {
  const tuning = DEFAULT_PROMILLE_TUNING;

  it('reads damage and fire rate straight out of the tuning', () => {
    expect(promilleTierEffects(PromilleTier.Angeheitert, tuning)).toMatchObject({
      damagePercent: 25,
      fireRatePercent: 12,
    });
    expect(promilleTierEffects(PromilleTier.Vollrausch, tuning)).toMatchObject({
      damagePercent: 120,
      fireRatePercent: 55,
    });
    const retuned = { ...tuning, vollrauschDamageBonus: 2 };
    expect(promilleTierEffects(PromilleTier.Vollrausch, retuned).damagePercent).toBe(200);
  });

  it('is neutral when sober', () => {
    expect(promilleTierEffects(PromilleTier.Nuchtern, tuning)).toEqual({
      damagePercent: 0,
      fireRatePercent: 0,
      tunnelVision: false,
      drift: false,
      wobble: false,
      gloom: false,
      knockdown: false,
    });
  });

  it('flags a penalty exactly where its ramp starts', () => {
    // Walk the meter in small steps and check the flags agree with the real
    // ramps, so moving a boundary in one place and not the other fails here.
    for (let value = 0; value <= 5; value += 0.05) {
      const tier = promilleTierOf(value, 0, tuning);
      if (tier === PromilleTier.Umgfalln) {
        continue;
      }
      const effects = promilleTierEffects(tier, tuning);
      // The tunnel ramp starts at the first drop, but it is a tier-level
      // statement: Nüchtern's sliver of it is below anything worth announcing.
      if (tier !== PromilleTier.Nuchtern) {
        expect(effects.tunnelVision, `tunnel @${value.toFixed(2)}`).toBe(
          promilleTunnelVision(value, tuning) > 0,
        );
      }
      expect(effects.drift, `drift @${value.toFixed(2)}`).toBe(
        promilleDriftScale(value, tuning) > 0,
      );
      expect(effects.wobble, `wobble @${value.toFixed(2)}`).toBe(
        promilleWobbleAmplitude(value, tuning) > 0,
      );
      expect(effects.gloom, `gloom @${value.toFixed(2)}`).toBe(promilleGloom(value, tuning) > 0);
    }
  });

  it('marks Umgfalln as the knockdown with no stat line', () => {
    expect(promilleTierEffects(PromilleTier.Umgfalln, tuning)).toMatchObject({
      knockdown: true,
      damagePercent: 0,
      fireRatePercent: 0,
    });
  });

  it('lists the post-Vollrausch tiers only once Trinkfest reaches them', () => {
    const names = (trinkfest: number): PromilleTierId[] => reachablePromilleTiers(trinkfest);
    expect(names(0)).not.toContain(PromilleTier.Sturzbesoffen);
    expect(names(1)).toContain(PromilleTier.Sturzbesoffen);
    expect(names(1)).not.toContain(PromilleTier.Filmriss);
    expect(names(2)).toContain(PromilleTier.Filmriss);
    expect(names(0).at(-1)).toBe(PromilleTier.Umgfalln);
  });

  it('starts each tier at the value promilleTierOf switches on', () => {
    for (const tier of reachablePromilleTiers(2)) {
      const start = promilleTierStart(tier, 2, tuning);
      expect(promilleTierOf(start, 2, tuning), `tier ${String(tier)}`).toBe(tier);
      if (start > 0) {
        expect(promilleTierOf(start - 0.01, 2, tuning)).not.toBe(tier);
      }
    }
  });
});

describe('promille text (#460)', () => {
  const tuning = DEFAULT_PROMILLE_TUNING;

  it('spells out a tier\'s bonuses', () => {
    const text = promilleEffectsText('en', PromilleTier.Angeheitert, tuning, false);
    expect(text).toContain('+25% damage');
    expect(text).toContain('+12% fire rate');
  });

  it('names the drift and wobble from Beduselt on, and not before', () => {
    expect(promilleEffectsText('en', PromilleTier.Angeheitert, tuning, false)).not.toMatch(
      /drift|wobble/,
    );
    const beduselt = promilleEffectsText('en', PromilleTier.Beduselt, tuning, false);
    expect(beduselt).toMatch(/drift/);
    expect(beduselt).toMatch(/wobble/);
  });

  it('follows the tuning rather than hard-coded numbers', () => {
    const text = promilleEffectsText(
      'en',
      PromilleTier.Beduselt,
      { ...tuning, beduseltDamageBonus: 0.99 },
      false,
    );
    expect(text).toContain('+99% damage');
  });

  it('describes Umgfalln and Kater from the tuning', () => {
    expect(promilleEffectsText('en', PromilleTier.Umgfalln, tuning, false)).toContain('Kater');
    const kater = promilleKaterText('en', tuning, false);
    expect(kater).toContain('-20% damage');
    expect(kater).toContain('-15% move speed');
    expect(kater).toContain('12s');
  });

  it('is available in every locale', () => {
    for (const locale of ['en', 'de', 'bar'] as const) {
      expect(promilleEffectsText(locale, PromilleTier.Vollrausch, tuning, false)).not.toMatch(
        /\{\w+\}/,
      );
    }
  });
});
