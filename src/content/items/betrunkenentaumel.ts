import type { ItemDefinition } from '../../sim/item/definition.js';

/**
 * Betrunkenentaumel — a drunken stagger, `docs/CONTENT_BIBLE.md` §2's
 * `Betrunkener` wandering unpredictably because "he does not know where he
 * is going" either. Unsteady aim, offset by a run of luck nobody sober
 * would ever get away with.
 */
export const betrunkenentaumel: ItemDefinition = {
  id: 'betrunkenentaumel',
  name: 'Betrunkenentaumel',
  description: 'Luck +4, Shot Speed -15%',
  flavourText: "Can't hit the broad side of a Bierzelt. Occasionally that turns out to help.",
  sprite: 'betrunkenentaumel',
  pools: ['shop', 'secret'],
  quality: 1,
  promilleRequirement: 'rausch',
  hooks: {
    modifyStats: () => [
      { stat: 'luck', op: 'add', value: 4 },
      { stat: 'shotSpeed', op: 'multiply', value: 0.85 },
    ],
  },
};
