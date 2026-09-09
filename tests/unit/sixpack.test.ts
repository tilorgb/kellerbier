import { describe, expect, it } from 'vitest';
import { GameSim } from '../../src/sim/game/sim.js';
import { RoomGeometry } from '../../src/sim/room/geometry.js';
import { PromilleTier } from '../../src/sim/game/promille.js';
import { createInputFrame, type InputFrame } from '../../src/sim/input/frame.js';
import {
  SIXPACK_SLOTS,
  sixpackCapacity,
  sixpackFilledSlots,
} from '../../src/content/items/sixpack.js';

/**
 * The Sixpack: the first item that lets a player decide *when* the
 * Promille arrives rather than only whether to walk over the Maß.
 *
 * The interesting cases are all about the seam it needed
 * (`ItemBeerOfferedHook`) rather than about the arithmetic: a Maß has to be
 * intercepted *before* it is drunk, exactly once, and the pack being full has
 * to fall back to the plain behaviour rather than to a special case.
 */
const ID = 'sixpack';

function idle(): InputFrame {
  return createInputFrame();
}

function run(): GameSim {
  return new GameSim({ room: new RoomGeometry(0, 0, 320, 180) });
}

function carrying(): GameSim {
  const sim = run();
  sim.pickUpItem(ID);
  return sim;
}

/** One full Maß collected, through the real pickup path's own numbers. */
function offerFullMass(sim: GameSim): boolean {
  return sim.offerBeerToItems(sim.tuning.promille.massFullAmount);
}

function stored(sim: GameSim): number {
  return sim.itemState(ID).timer;
}

describe('Sixpack: banking Maß instead of drinking them', () => {
  it('takes the Maß instead of the player drinking it', () => {
    const sim = carrying();
    expect(offerFullMass(sim)).toBe(true);
    // The claim is the whole contract: `sim/systems/pickup.ts` skips the
    // drink entirely on a `true`, so the meter must not have moved.
    expect(sim.promille).toBe(0);
    expect(stored(sim)).toBeCloseTo(sim.tuning.promille.massFullAmount);
  });

  it('does nothing at all without the item — the Maß is drunk as it always was', () => {
    const sim = run();
    expect(offerFullMass(sim)).toBe(false);
  });

  it('fills a slot at a time, up to six', () => {
    const sim = carrying();
    for (let index = 0; index < SIXPACK_SLOTS; index++) {
      expect(offerFullMass(sim)).toBe(true);
      expect(sixpackFilledSlots(sim, sim.itemState(ID))).toBeCloseTo(index + 1);
    }
    expect(stored(sim)).toBeCloseTo(sixpackCapacity(sim));
  });

  it('lets a full carrier through rather than splitting the Maß', () => {
    const sim = carrying();
    for (let index = 0; index < SIXPACK_SLOTS; index++) {
      offerFullMass(sim);
    }
    const full = stored(sim);
    // The seventh is drunk exactly as it would be without the item — which is
    // what "when all containers are filled you drink Maß same as before"
    // means, and why this is a `false` rather than a partial deposit.
    expect(offerFullMass(sim)).toBe(false);
    expect(stored(sim)).toBeCloseTo(full);
  });

  it('stores what the beer was worth, so a half Maß is never upgraded on the way in', () => {
    const sim = carrying();
    sim.offerBeerToItems(sim.tuning.promille.massHalfAmount);
    expect(stored(sim)).toBeCloseTo(sim.tuning.promille.massHalfAmount);
    expect(sixpackFilledSlots(sim, sim.itemState(ID))).toBeLessThan(1);
  });

  it('pours one slot per press, and raises Promille only then', () => {
    const sim = carrying();
    offerFullMass(sim);
    offerFullMass(sim);
    expect(sim.promille).toBe(0);

    expect(sim.useActiveItem(ID)).toBe(true);
    expect(sim.promille).toBeCloseTo(sim.tuning.promille.massFullAmount);
    expect(sixpackFilledSlots(sim, sim.itemState(ID))).toBeCloseTo(1);

    expect(sim.useActiveItem(ID)).toBe(true);
    expect(sim.promille).toBeCloseTo(sim.tuning.promille.massFullAmount * 2);
    expect(stored(sim)).toBeCloseTo(0);
  });

  it('refuses the press on an empty carrier, and takes nothing when it does', () => {
    const sim = carrying();
    expect(sim.useActiveItem(ID)).toBe(false);
    expect(sim.promille).toBe(0);
  });

  it('pours a lone half Maß rather than holding it hostage for a whole slot', () => {
    // The pour is `min(one slot, what is in there)`: a player who banked one
    // half Maß can still drink it, they just get half a Maß back.
    const sim = carrying();
    sim.offerBeerToItems(sim.tuning.promille.massHalfAmount);
    expect(sim.useActiveItem(ID)).toBe(true);
    expect(sim.promille).toBeCloseTo(sim.tuning.promille.massHalfAmount);
    expect(stored(sim)).toBeCloseTo(0);
  });

  it('is the point of the item: bank while sober, cash in later', () => {
    // The whole design in one test. Walk over three Maß at 0.0 and stay
    // stone-cold sober through the floor; press three times and arrive in
    // Vollrausch on the tick you chose.
    const sim = carrying();
    offerFullMass(sim);
    offerFullMass(sim);
    offerFullMass(sim);
    expect(sim.promilleTier).toBe(PromilleTier.Nuchtern);

    sim.useActiveItem(ID);
    sim.useActiveItem(ID);
    sim.useActiveItem(ID);
    expect(sim.promilleTier).toBe(PromilleTier.Vollrausch);
  });

  it('survives being lost and picked back up with nothing banked', () => {
    // `ItemInventory.remove` resets `charge` and `timer` when the last copy
    // leaves — the "picking an item up and losing it returns the player to
    // exactly the prior state" rule, which for this item means the beer in
    // the carrier goes with the carrier.
    const sim = carrying();
    offerFullMass(sim);
    sim.removeItem(ID);
    sim.pickUpItem(ID);
    expect(stored(sim)).toBe(0);
    expect(sim.useActiveItem(ID)).toBe(false);
  });

  it('reads as ready to the active-item HUD exactly when it has something to pour', () => {
    const sim = carrying();
    const item = sim.items.get(ID);
    expect(sim.itemState(ID).charge).toBeLessThan(sim.effectiveMaxCharge(item));
    offerFullMass(sim);
    expect(sim.itemState(ID).charge).toBeGreaterThanOrEqual(sim.effectiveMaxCharge(item));
    sim.useActiveItem(ID);
    expect(sim.itemState(ID).charge).toBeLessThan(sim.effectiveMaxCharge(item));
  });

  it('tells the player the beer was stored rather than drunk', () => {
    // The toast is the only thing on screen at the instant of the pickup, and
    // "Maß — Raises Promille" over a meter that did not move reads as a bug.
    // Checked through the real collect path rather than by calling
    // `reportCollected`: the *ordering* — the offer above the toast — is the
    // thing that was wrong first and could regress.
    const sim = carrying();
    const before = sim.promille;
    sim.spawnPickup('mass-full', sim.positionX(sim.playerIndex), sim.positionY(sim.playerIndex));
    for (let tick = 0; tick < 30; tick++) {
      sim.step(idle());
    }
    expect(sim.promille).toBe(before);
    expect(stored(sim)).toBeGreaterThan(0);
    expect(sim.pickupToast?.description).toBe('Stored, not drunk');
  });

  it('never lets the pour take the player past what drinking the same Maß would', () => {
    // The carrier is storage, not a discount: six banked Maß poured back are
    // worth exactly the six Maß that went in, Umgfalln and all.
    const banked = carrying();
    const drunk = run();
    for (let index = 0; index < 4; index++) {
      offerFullMass(banked);
      drunk.addPromille(drunk.tuning.promille.massFullAmount);
    }
    for (let index = 0; index < 4; index++) {
      banked.useActiveItem(ID);
    }
    expect(banked.promille).toBeCloseTo(drunk.promille, 5);
  });
});
