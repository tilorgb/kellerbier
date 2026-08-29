import type { ItemDefinition } from '../../sim/item/definition.js';

/** Matches `apfelkuchen.ts`'s heal and Stammwürze bump exactly — see the doc comment below. */
const HEAL_AMOUNT = 4;
const STAMMWUERZE_MULTIPLIER = 1.05;
const REICHWEITE_MULTIPLIER = 0.85;

const KLAUBER_ID = 'der-rosinenklauber';

/**
 * Apfelkuchen (mit Rosinen) — the same cake. Same heal, same Stammwürze bump
 * as `apfelkuchen.ts`; the only difference is a permanent Reichweite cost.
 *
 * Deliberately *not* the strict upgrade `docs/CONTENT_BIBLE.md` §4 first
 * drafted ("heals more, bumps Stammwürze considerably more") — issue #166's
 * clarifying comment overrides that draft for this specific pair: the read
 * is "I know it's worse, but if nothing better turns up I'll still take it,"
 * not "obviously better, mind the cost." `docs/GAME_DESIGN.md` §8's general
 * "clean item plus an upgrade plus one legible cost" shape for `rosinen`
 * items stays the rule for the tag as a whole; this one pair is authored to
 * the narrower brief the issue's own author gave for it.
 *
 * `state.charge` (0 = drawback active, 1 = suppressed) mirrors whether Der
 * Rosinenklauber is currently held — the same cached-flag shape
 * `weisswurst.ts` uses for a `sim`-derived condition `modifyStats` cannot
 * read directly (`modifyStats` takes only `state`, never `ctx`). Set here on
 * pickup for "the Klauber is already held when I arrive"; the reverse case —
 * "I'm already held when the Klauber arrives, or leaves" — is
 * `der-rosinenklauber.ts`'s job, via `sim.itemState`/`refreshItemStats`. See
 * `docs/DECISIONS.md` #47 for why this is a per-item convention rather than
 * a declared penalty field on `ItemDefinition`.
 */
export const apfelkuchenMitRosinen: ItemDefinition = {
  id: 'apfelkuchen-mit-rosinen',
  name: 'Apfelkuchen (mit Rosinen)',
  description: 'Heals 4. Stammwürze +5%. Permanently Reichweite -15%',
  flavourText: 'Somebody picked through the crate. Somebody else did not check hard enough.',
  sprite: 'apfelkuchen-mit-rosinen',
  pools: ['treasure', 'shop'],
  quality: 0,
  promilleRequirement: 'any',
  tags: ['rosinen'],
  hooks: {
    modifyStats: (state) =>
      state.charge > 0
        ? [{ stat: 'stammwuerze', op: 'multiply', value: STAMMWUERZE_MULTIPLIER }]
        : [
            { stat: 'stammwuerze', op: 'multiply', value: STAMMWUERZE_MULTIPLIER },
            { stat: 'reichweite', op: 'multiply', value: REICHWEITE_MULTIPLIER },
          ],
    onPickup: (ctx) => {
      ctx.sim.addPlayerHealth(HEAL_AMOUNT);
      // `GameSim.pickUpItem` resolves `modifyStats` *before* `onPickup` runs,
      // against the freshly-allocated state's default charge (0) — so without
      // this, "Klauber already held" would only take effect a tick late.
      ctx.state.charge = ctx.sim.hasItem(KLAUBER_ID) ? 1 : 0;
      ctx.sim.refreshItemStats(ctx.itemId);
    },
  },
};
