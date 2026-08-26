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
  description: 'Dusel +4, Wurfkraft -15%',
  flavourText: "Can't hit the broad side of a Bierzelt. Occasionally that turns out to help.",
  sprite: 'betrunkenentaumel',
  pools: ['shop', 'secret'],
  quality: 1,
  promilleRequirement: 'rausch',
  hooks: {
    modifyStats: () => [
      { stat: 'dusel', op: 'add', value: 4 },
      { stat: 'wurfkraft', op: 'multiply', value: 0.85 },
    ],
  },
};
