import type { CharacterDefinition } from '../../app/meta/definition.js';

/**
 * Bruder Barnabas — the monastery brewer, and the character the issue itself
 * calls the interesting one.
 *
 * Two rules, and they are the same rule seen from both ends. `refusesFood`
 * means every Brezn, Obazda and Radi stays on the floor — and food is the
 * conventional way *down* the Promille meter, so a Barnabas run that drinks
 * cannot sober up on purpose. That is what ties the roster into the Promille
 * system rather than sitting beside it: he is a Vollrausch character by
 * construction, not by a flavour line saying so. In a *sober* run (#85 — the
 * meter is gated behind Der Stier) there is nothing to sober up from, so the
 * refusal is simply a heal he walks past and the fast is the whole of him;
 * that is the weaker half of the character, and it lasts exactly as long as
 * the player takes to beat floor 2. `fasting` is the other end:
 * the longer he swallows nothing at all, the harder he hits
 * (`CharacterTuning.fastStepTicks`), so the pickups he *can* take — a Maß, a
 * beer — are a real cost rather than free healing.
 *
 * The heavy Doppelbock shot is the Löwenbrunn item, in his hands from the
 * first room: damage up, fire rate down, shots pierce. Authoring it as an
 * item rather than as another line of stats and a third shot tag is the
 * point of #26 and #27 both — the character is the two rules, and the gun is
 * a thing that already existed.
 */
export const bruderBarnabas: CharacterDefinition = {
  id: 'barnabas',
  name: 'Bruder Barnabas',
  note: 'Klosterbrauer. Isst nix, trinkt schwar, schlagt zua wia a Fassl.',
  // 400 kills across every run, not a floor: his own floor (the monastery,
  // #41) is parked in M10, and a locked row whose goal is "wait for a floor
  // to be built" is not a goal. Reachable in a session or two of real play.
  requires: { kind: 'statAtLeast', stat: 'kills', value: 400 },
  goal: '400 Viecher insgesamt daschlogn',
  traits: {
    id: 'barnabas',
    name: 'Bruder Barnabas',
    maxHealth: 8,
    startingBiermarken: 0,
    startingBombs: 0,
    startingKeys: 0,
    items: ['loewenbrunn-doppelbock'],
    shotTags: [],
    stats: [
      { stat: 'gschwindigkeit', op: 'multiply', value: 0.75 },
      { stat: 'reichweite', op: 'multiply', value: 1.15 },
      { stat: 'wurfkraft', op: 'multiply', value: 0.85 },
    ],
    rules: ['refusesFood', 'fasting'],
  },
};
