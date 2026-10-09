import type { ItemDefinition } from '../../sim/item/definition.js';

/** Far ring: a pulse draws enemies in from here. */
const PULL_RADIUS = 100;
/** Near ring: the smell is tastable. Enemies inside are dazed, and the pull never drags them further in. */
export const DAZE_RADIUS = 30;
/** Per-tick pull strength while a pulse runs — brief, so stronger than the old always-on 0.15. */
const PULL_STRENGTH = 0.3;
/** One pulse every five seconds, running for the first second of each. */
export const PULSE_PERIOD_TICKS = 300;
export const PULSE_TICKS = 60;
/** The daze runs on for a quarter second after a body leaves the ring — just enough that the edge does not flicker. */
const DAZE_LINGER_TICKS = 15;

/**
 * Hendlgeruch — the smell of a rotisserie chicken, carrying for a kilometre
 * across the Wiesn. Every five seconds a one-second pulse of it draws
 * distant enemies in — but only as far as the near ring, never onto Alois —
 * and anyone standing in that near ring is dazed: slower to move, slower to
 * shoot (`STATUS_DAZE`). Alois wears a roast chicken on his head while he
 * carries it.
 *
 * `state.charge` is the pulse clock (ticks since pickup); `state.timer` is
 * the ticks left in the running pulse, 0 between pulses — what the renderer
 * reads to draw the wind.
 */
export const hendlgeruch: ItemDefinition = {
  id: 'hendlgeruch',
  name: 'Hendlgeruch',
  description: 'items.hendlgeruch.description',
  flavourText: 'items.hendlgeruch.flavourText',
  sprite: 'hendlgeruch',
  hat: 'hat-hendl',
  pools: ['treasure', 'shop', 'secret'],
  quality: 2,
  promilleRequirement: 'any',
  hooks: {
    onTick: (ctx) => {
      const sim = ctx.sim;
      const state = ctx.state;
      const playerIndex = sim.playerIndex;
      const x = sim.positionX(playerIndex);
      const y = sim.positionY(playerIndex);

      const phase = state.charge % PULSE_PERIOD_TICKS;
      state.charge = phase + 1;
      state.timer = phase < PULSE_TICKS ? PULSE_TICKS - phase : 0;
      if (state.timer > 0) {
        sim.pullEnemiesNear(x, y, PULL_RADIUS, PULL_STRENGTH, DAZE_RADIUS);
      }
      sim.dazeEnemiesNear(x, y, DAZE_RADIUS, DAZE_LINGER_TICKS);
    },
  },
};
