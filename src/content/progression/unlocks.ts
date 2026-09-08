import type { UnlockDefinition } from '../../app/meta/definition.js';

/**
 * What a save can earn outside of a single run — data, like every other
 * roster in `src/content/`.
 *
 * Two unlocks exist today: `promille` (`docs/GAME_DESIGN.md` §5, the game's
 * signature mechanic, gated behind beating floor 1's boss so a new player
 * learns the sober game first — see the entry's own comment for why that is
 * floor 1 and not floor 2) and `run-board` (the best-runs board on the results
 * screen, gated behind a kill total so the board itself is something to earn
 * rather than being there from the first run).
 *
 * The `goal` line is not decoration: the results screen always shows a locked
 * unlock's own condition in words, with the progress underneath it, so
 * `src/render/run-results.ts` never has to invent that sentence.
 */
export const PROGRESSION_UNLOCKS: readonly UnlockDefinition[] = [
  {
    // The headline unlock (`docs/GAME_DESIGN.md` §5): beating a floor's boss
    // is the moment the game's signature mechanic switches on for good. The
    // *gate* — a sober first floor, no meter, no beer in the drop tables — is
    // `app/promille-gate.ts`; this is the flag it reads.
    //
    // #236 moved the floor from 2 to 1. Gating on Der Stier was written
    // against the seven-floor plan, where floor 2 is the end of chapter two
    // of seven; in the two-floor game M9 actually ships it is the end of the
    // game, so a first-time player beat the whole thing and was then told the
    // signature mechanic had unlocked. On floor 1's boss the teaching beat
    // #85 asked for survives intact — a whole floor sober, learning to move
    // and shoot — and the unlock lands with a floor left to spend it on.
    id: 'promille',
    // "Promille" is the mechanic's own name — `sim/game/promille.ts`'s
    // `promilleMeterLabel` — not flavour, so it stays as-is rather than
    // translating (#221).
    name: 'Promille',
    effect: "From now on you're carrying a Maß — and the meter goes with it.",
    category: 'mechanic',
    condition: { kind: 'bossDefeated', floor: 1 },
    goal: 'Beat Die Große Kellerassel in the cellar',
  },
  {
    id: 'run-board',
    name: 'The Board',
    effect: 'Your best runs now show up on the board.',
    category: 'hub',
    condition: { kind: 'statAtLeast', stat: 'kills', value: 200 },
    goal: 'Kill 200 enemies total',
  },
];
