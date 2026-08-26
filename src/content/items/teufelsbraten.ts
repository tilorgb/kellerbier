import type { ItemDefinition } from '../../sim/item/definition.js';

/** Damage multiplier and the Biermarken owed per kill. */
const DAMAGE_MULTIPLIER = 1.5;
const COST_PER_KILL = 1;

/**
 * Teufelsbraten — a devil's-bargain roast, eaten knowing exactly what it
 * costs. Every kill you make, you pay for.
 *
 * `spendBiermarken` fails silently if the run cannot afford it —
 * `neuschwanstein-bauplan.ts`'s and `ludwigs-schwan.ts`'s own precedent
 * for an upkeep item that never bricks a poor run, just stops collecting
 * once there is nothing left to take.
 */
export const teufelsbraten: ItemDefinition = {
  id: 'teufelsbraten',
  name: 'Teufelsbraten',
  description: 'Stammwürze +50%. Every kill costs a Biermarken',
  flavourText: 'The recipe was never written down. The price always is.',
  sprite: 'teufelsbraten',
  pools: ['shop', 'devil', 'secret'],
  quality: 3,
  promilleRequirement: 'any',
  hooks: {
    modifyStats: () => [{ stat: 'stammwuerze', op: 'multiply', value: DAMAGE_MULTIPLIER }],
    onKill: (ctx) => {
      ctx.sim.spendBiermarken(COST_PER_KILL);
    },
  },
};
