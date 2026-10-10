import type { ItemUnlockDefinition } from '../../app/meta/definition.js';

/**
 * The items a fresh save does not have in its pool yet (#503), and the run
 * feat (#502) that earns each one — the list agreed in #501.
 *
 * Chosen so the goal hints at what the item does: Roter Stier, the bull's own
 * wings, for beating Der Stier untouched; Ruhige Hand, which rewards staying
 * sober, for a sober kill; Maß, the brewer's measure, for the Braumeister
 * set. Mostly quality 2-3 and synergy pieces, so a first run's pool is the
 * readable core and the flashy half arrives one goal at a time.
 *
 * **Deliberately left open**, and why each one matters:
 * - Radi, Neuschwanstein-Bauplan and Reinheitsgebot 1516: the devil pool only
 *   holds eight items, and locking more of them would leave a fresh save's
 *   devil room empty. `tests/content/item-unlocks.test.ts` checks every pool
 *   keeps enough.
 * - The three Braumeister pieces: completing that set is itself a goal (Maß),
 *   and a goal that needs a locked item is a goal nobody can meet.
 * - Ludwigs Schwan and Riesenrad: their agreed goals are "beat Der Stier as
 *   König Ludwig" and "beat Die Große Kellerassel as Resi", and neither
 *   character is offered right now (#205). They stay open until their
 *   character comes back, and take their goal in the same change.
 *
 * Statistic keys and Promille tiers are written out as literals rather than
 * imported, because content is data (`content-is-data`): the keys are the
 * ones `app/meta/definition.ts`'s helpers produce (`feat.run.deepestTier`,
 * `feat.floor2.heldTier`, `feat.set.braumeister`, …) and the tiers are
 * `sim/game/promille.ts`'s `PromilleTier` values. A key nothing writes would
 * be a goal nobody can meet, so `tests/content/item-unlocks.test.ts` checks
 * every one against the engine's own helpers.
 */
export const ITEM_UNLOCKS: readonly ItemUnlockDefinition[] = [
  // Boss fights.
  {
    itemId: 'roter-stier',
    condition: { kind: 'bossFeat', floor: 2, feat: { kind: 'maxHits', hits: 0 } },
    goal: 'Beat Der Stier without taking damage in the fight',
  },
  {
    itemId: 'watschn',
    condition: { kind: 'bossFeat', floor: 1, feat: { kind: 'maxHits', hits: 0 } },
    goal: 'Beat Die Große Kellerassel without taking damage',
  },
  {
    itemId: 'lederhosn',
    condition: { kind: 'bossFeat', floor: null, feat: { kind: 'maxHits', hits: 1 } },
    goal: 'Beat any boss taking at most 1 hit',
  },
  {
    itemId: 'blutwurz',
    condition: { kind: 'bossFeat', floor: null, feat: { kind: 'maxHealthLeft', halfHearts: 1 } },
    goal: 'Beat a boss with half a heart or less left',
  },
  {
    itemId: 'schuhplattler',
    condition: { kind: 'bossFeat', floor: null, feat: { kind: 'maxSeconds', seconds: 60 } },
    goal: 'Beat a boss within 60 seconds of the fight starting',
  },
  // Promille.
  {
    itemId: 'ruhige-hand',
    condition: { kind: 'bossFeat', floor: 2, feat: { kind: 'sober' } },
    goal: 'Beat Der Stier at 0 Promille',
  },
  {
    itemId: 'rumtopf',
    condition: {
      kind: 'bossFeat',
      floor: null,
      feat: { kind: 'minPromilleTier', tier: 3 }, // Vollrausch
    },
    goal: 'Beat a boss in Vollrausch or deeper',
  },
  {
    itemId: 'rosinenschnaps',
    condition: {
      kind: 'bossFeat',
      floor: null,
      feat: { kind: 'minPromilleTier', tier: 2 }, // Beduselt
    },
    goal: 'Beat a boss at the second Promille tier or higher',
  },
  {
    itemId: 'bierbauch',
    condition: { kind: 'statAtLeast', stat: 'feat.run.deepestTier', value: 6 }, // Umgfalln
    goal: 'Drink yourself all the way to Umgfalln',
  },
  {
    itemId: 'homebrew',
    condition: {
      kind: 'statAtLeast',
      stat: 'feat.floor2.heldTier',
      value: 1, // Angeheitert
    },
    goal: 'Clear floor 2 without dropping below the first Promille tier',
  },
  {
    itemId: 'sixpack',
    condition: { kind: 'statAtLeast', stat: 'feat.run.mostBeers', value: 10 },
    goal: 'Drink 10 Maß in one run',
  },
  // Builds.
  {
    itemId: 'sudordnung-1493',
    condition: {
      kind: 'bossFeat',
      floor: 2,
      feat: { kind: 'withoutTags', tags: ['rosinen', 'impure'] },
    },
    goal: 'Beat Der Stier holding no rosinen or impure item',
  },
  {
    itemId: 'pfeitinger-ultrabraeu',
    condition: { kind: 'bossFeat', floor: 2, feat: { kind: 'maxItemQuality', quality: 1 } },
    goal: 'Beat Der Stier holding only quality 0-1 items',
  },
  {
    itemId: 'der-rosinenklauber',
    condition: { kind: 'statAtLeast', stat: 'feat.run.mostTagged.rosinen', value: 4 },
    goal: 'Hold 4 rosinen items at once',
  },
  {
    itemId: 'mass',
    condition: { kind: 'statAtLeast', stat: 'feat.set.braumeister', value: 1 },
    goal: 'Complete the Braumeister set',
  },
  {
    itemId: 'krapfen',
    condition: { kind: 'statAtLeast', stat: 'feat.run.mostPassives', value: 6 },
    goal: 'Hold 6 passive items at once',
  },
  {
    itemId: 'blaskapelle',
    condition: { kind: 'statAtLeast', stat: 'feat.run.mostPassives', value: 8 },
    goal: 'Hold 8 passive items at once',
  },
];
