import { describe, expect, it } from 'vitest';
import {
  fingerhakeln,
  konterbier,
  masskrugstemmen,
  ruhigeHand,
  zwoaDreiGsuffa,
} from '../../src/content/items/index.js';
import { GameSim } from '../../src/sim/game/sim.js';
import { PromilleTier, promilleDamageMultiplier } from '../../src/sim/game/promille.js';
import { RoomGeometry } from '../../src/sim/room/geometry.js';
import { StatId } from '../../src/sim/stats/definition.js';
import { dispatchItemKill, dispatchItemShoot } from '../../src/sim/systems/items.js';
import { createInputFrame } from '../../src/sim/input/frame.js';

/**
 * #32's own named items (`docs/CONTENT_BIBLE.md` §4's Promille-gated table),
 * exercised through the real content definitions rather than synthetic test
 * items — `tests/unit/item-hooks.test.ts`'s new describe block already
 * covers the generic engine gate in the abstract; this is "does it actually
 * hold for the four items the issue names, plus Konterbier."
 *
 * Every "must not leak" assertion here is the failure mode #32 exists to
 * prevent: a `rausch` item's effect running while sober, or a `sober` one
 * running in rausch.
 */

const IDLE = createInputFrame();

function bareRoom(): RoomGeometry {
  return new RoomGeometry(0, 0, 320, 180);
}

describe('Ruhige Hand — the sober build', () => {
  it('applies its damage bonus only while under 0.5 Promille', () => {
    const sim = new GameSim({ room: bareRoom(), items: [ruhigeHand] });
    const base = sim.stats.value(StatId.Stammwuerze);

    sim.pickUpItem('ruhige-hand');
    expect(sim.stats.value(StatId.Stammwuerze)).toBeCloseTo(base * 1.4, 5);

    // Comfortably inside Angeheitert, not exactly on the 0.5 boundary — the
    // natural per-tick decay `stepPromille` runs at the top of every `step`
    // would otherwise nudge a value sitting exactly on a tier edge back
    // across it before this tick's gate even reads it.
    sim.tuning.promille.current = 1.0;
    sim.step(IDLE);
    expect(sim.promilleTier).toBe(PromilleTier.Angeheitert);
    // Ruhige Hand's own 1.4x is gone, but Angeheitert's own separate damage
    // bonus (`syncPromilleModifiers`, unrelated to this item) still applies
    // on top of `base` — the assertion accounts for both sources rather than
    // assuming "not sober" means "no bonus at all."
    const angeheitertOnly =
      base * promilleDamageMultiplier(PromilleTier.Angeheitert, sim.tuning.promille);
    expect(sim.stats.value(StatId.Stammwuerze)).toBeCloseTo(angeheitertOnly, 5);

    sim.tuning.promille.current = 0; // back to Nüchtern
    sim.step(IDLE);
    expect(sim.stats.value(StatId.Stammwuerze)).toBeCloseTo(base * 1.4, 5);
  });

  it('picking up a Maß with Ruhige Hand held is the genuine dilemma the issue asks for', () => {
    const sim = new GameSim({ room: bareRoom(), items: [ruhigeHand] });
    // Comfortably past the 0.5 sober line rather than landing exactly on it —
    // see the previous test's comment on why an exact boundary value is the
    // wrong thing to assert against here.
    sim.tuning.promille.massFullAmount = 0.6;
    const base = sim.stats.value(StatId.Stammwuerze);
    sim.pickUpItem('ruhige-hand');
    expect(sim.stats.value(StatId.Stammwuerze)).toBeCloseTo(base * 1.4, 5);

    const index = sim.playerIndex;
    sim.spawnPickup('mass-full', sim.positionX(index), sim.positionY(index));
    sim.world.flush();
    sim.step(IDLE); // the Maß is collected this tick, raising Promille past 0.5
    expect(sim.promilleTier).toBe(PromilleTier.Angeheitert);

    // The stat pipeline notices the crossing at the top of the *next* tick —
    // exactly the one-tick lag `syncPromilleModifiers` (Promille's own stat
    // contribution) already has for a same-tick pickup raise, not a bug #32
    // introduces. See `GameSim.syncItemPromilleGate`'s doc comment.
    sim.step(IDLE);
    // Ruhige Hand's bonus is gone; Angeheitert's own separate bonus remains —
    // see the previous test's comment.
    const angeheitertOnly =
      base * promilleDamageMultiplier(PromilleTier.Angeheitert, sim.tuning.promille);
    expect(sim.stats.value(StatId.Stammwuerze)).toBeCloseTo(angeheitertOnly, 5);
  });
});

describe('Maßkrugstemmen — hold fire to charge, only while in rausch', () => {
  it('never charges (or applies) while sober; both start the moment rausch is reached', () => {
    // `dispatchItemShoot` directly, the same way
    // `tests/unit/item-hooks.test.ts`'s generic-gate tests do, rather than a
    // `sim.step` loop: charge decays a point a tick (`DECAY_PER_TICK`), so a
    // loop long enough to be sure a shot fired is also long enough for that
    // shot's charge to have decayed away again by the time the loop ends —
    // this isolates the one thing the test actually cares about, whether one
    // shot's worth of charge sticks at all.
    const sim = new GameSim({ room: bareRoom(), items: [masskrugstemmen] });
    sim.pickUpItem('masskrugstemmen');
    const base = sim.stats.value(StatId.Stammwuerze);

    dispatchItemShoot(sim, 1, 0); // sober — must not charge
    expect(sim.itemState('masskrugstemmen').charge).toBe(0);
    expect(sim.stats.value(StatId.Stammwuerze)).toBe(base);

    sim.tuning.promille.current = 3.0; // Vollrausch
    dispatchItemShoot(sim, 1, 0);
    expect(sim.itemState('masskrugstemmen').charge).toBeGreaterThan(0);
    expect(sim.stats.value(StatId.Stammwuerze)).toBeGreaterThan(base);
  });
});

describe('Fingerhakeln — contact damage and pull, only while in rausch', () => {
  it('does not advance its contact timer while sober, and does once in rausch', () => {
    const sim = new GameSim({ room: bareRoom(), items: [fingerhakeln], population: 'empty' });
    sim.pickUpItem('fingerhakeln');
    const state = sim.itemState('fingerhakeln');
    const startTimer = state.timer;

    sim.step(IDLE); // sober — onTick must not run at all
    expect(state.timer).toBe(startTimer);

    sim.tuning.promille.current = 3.5; // comfortably inside Vollrausch — see the previous describe block's comment
    sim.step(IDLE);
    expect(state.timer).toBe(startTimer - 1);
  });
});

describe('Zwoa, drei, gsuffa — kill stacks, only while in rausch', () => {
  it('does not stack (or apply) on a kill while sober; both start the moment rausch is reached', () => {
    const sim = new GameSim({ room: bareRoom(), items: [zwoaDreiGsuffa] });
    sim.pickUpItem('zwoa-drei-gsuffa');
    const base = sim.stats.value(StatId.Stammwuerze);

    dispatchItemKill(sim, 1); // sober — must not stack
    expect(sim.itemState('zwoa-drei-gsuffa').charge).toBe(0);
    expect(sim.stats.value(StatId.Stammwuerze)).toBe(base);

    sim.tuning.promille.current = 3.0; // Vollrausch
    dispatchItemKill(sim, 1);
    expect(sim.itemState('zwoa-drei-gsuffa').charge).toBe(1);
    expect(sim.stats.value(StatId.Stammwuerze)).toBeGreaterThan(base);
  });
});

describe('Konterbier — drinking while hungover clears the Kater', () => {
  it('clears an existing Kater the moment a beer is collected while held', () => {
    const sim = new GameSim({ room: bareRoom(), items: [konterbier] });
    sim.pickUpItem('konterbier');
    sim.tuning.promille.umgfallnKnockdownTicks = 1;
    sim.addPromille(5); // enough to trigger Umgfalln
    sim.step(IDLE); // wake, Kater starts
    expect(sim.hasKater).toBe(true);

    const index = sim.playerIndex;
    sim.spawnPickup('mass-full', sim.positionX(index), sim.positionY(index));
    sim.world.flush();
    sim.step(IDLE); // the beer is collected this tick

    expect(sim.hasKater).toBe(false);
  });

  it('without Konterbier, a beer does not touch an existing Kater', () => {
    const sim = new GameSim({ room: bareRoom() });
    sim.tuning.promille.umgfallnKnockdownTicks = 1;
    sim.addPromille(5);
    sim.step(IDLE);
    expect(sim.hasKater).toBe(true);

    const index = sim.playerIndex;
    sim.spawnPickup('mass-full', sim.positionX(index), sim.positionY(index));
    sim.world.flush();
    sim.step(IDLE);

    expect(sim.hasKater).toBe(true);
  });

  it('does nothing on a beer pickup while no Kater is active', () => {
    const sim = new GameSim({ room: bareRoom(), items: [konterbier] });
    sim.pickUpItem('konterbier');
    expect(sim.hasKater).toBe(false);

    const index = sim.playerIndex;
    sim.spawnPickup('mass-full', sim.positionX(index), sim.positionY(index));
    sim.world.flush();
    expect(() => {
      sim.step(IDLE);
    }).not.toThrow();
    expect(sim.hasKater).toBe(false);
  });
});
