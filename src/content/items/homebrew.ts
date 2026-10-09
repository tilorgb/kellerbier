import type { ItemDefinition } from '../../sim/item/definition.js';

/** The Promille scale's multiplier while the glass is held. */
export const HOMEBREW_CAP_SCALE = 2;
/** Promille a pickup tops the glass up to, so the first hit does not end the run. */
export const HOMEBREW_START_PROMILLE = 2.5;

/**
 * Homebrew (#484) — a beer glass with a skull engraved on it. "Hauptsach ned
 * blind."
 *
 * The Promille bar is twice as long (and drawn red), and so is the room to
 * drink before Umgfalln. Life *is* Promille: there are no hearts, a hit
 * costs the Promille it always does, and an empty glass ends the run. Everything that
 * would drop is beer instead.
 *
 * `needsPromille`: with no meter there is no glass, so a sober run never
 * offers it.
 */
export const homebrew: ItemDefinition = {
  id: 'homebrew',
  name: 'Homebrew',
  description: 'items.homebrew.description',
  flavourText: 'items.homebrew.flavourText',
  sprite: 'homebrew',
  pools: ['devil', 'secret'],
  quality: 3,
  promilleRequirement: 'any',
  needsPromille: true,
  status: (ctx) => (ctx.sim.lifeIsPromille ? `${ctx.sim.promille.toFixed(1)} left` : ''),
  hooks: {
    onPickup: (ctx) => {
      const sim = ctx.sim;
      sim.tuning.promille.capScale = HOMEBREW_CAP_SCALE;
      sim.addPromille(Math.max(0, HOMEBREW_START_PROMILLE - sim.promille));
    },
    onRemove: (ctx) => {
      ctx.sim.tuning.promille.capScale = 1;
    },
  },
};
