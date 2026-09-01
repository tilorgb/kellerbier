import type { ItemSetDefinition } from '../../sim/item/set.js';

/** The set completion bonus, on top of the three pieces' own effects. */
const STAMMWUERZE_BONUS = 0.3;
const WURFKRAFT_MULTIPLIER = 1.12;

/**
 * Braumeister (#137) — the roster's first item set. Three pieces of Floor
 * 6's Braumeister ("Die Brauerei", `docs/CONTENT_BIBLE.md` §2 — his eerily
 * precise, aimed fire): `braumeister-visier` (already in the game),
 * `braumeister-schuerze` and `braumeister-hammer`. Hold all three at once
 * and a "Braumeister" notification fires — you've become what he was.
 *
 * Spread across `treasure`/`shop`/`boss`/`secret` rather than clustered in
 * one pool (#137's own design note), and every member sits at quality 1-2,
 * so completing the set takes several lucky pedestals across a run rather
 * than one. No dedicated "set drop rate" exists or should — `Dusel`'s
 * existing quality bias already makes a lucky run more likely to complete
 * it, at no new mechanism.
 */
export const braumeister: ItemSetDefinition = {
  id: 'braumeister',
  name: 'Braumeister',
  members: ['braumeister-visier', 'braumeister-schuerze', 'braumeister-hammer'],
  bonus: [
    { stat: 'stammwuerze', op: 'add', value: STAMMWUERZE_BONUS },
    { stat: 'wurfkraft', op: 'multiply', value: WURFKRAFT_MULTIPLIER },
  ],
};
