import type { UnlockDefinition } from '../../app/meta/definition.js';

/**
 * What a save can earn outside of a single run — data, like every other
 * roster in `src/content/`.
 *
 * Two unlocks exist today: `promille` (`docs/GAME_DESIGN.md` §9, the game's
 * signature mechanic, gated behind beating Der Stier so a new player learns
 * the sober game first) and `run-board` (the best-runs board on the results
 * screen, gated behind a kill total so the board itself is something to earn
 * rather than being there from the first run).
 *
 * The `goal` line is not decoration: the results screen always shows a locked
 * unlock's own condition in words, with the progress underneath it, so
 * `src/render/run-results.ts` never has to invent that sentence.
 */
export const PROGRESSION_UNLOCKS: readonly UnlockDefinition[] = [
  {
    // The headline unlock (`docs/GAME_DESIGN.md` §9): beating Der Stier is
    // the moment the game's signature mechanic switches on for good. The
    // *gate* — sober first runs, no meter, no beer in the drop tables — is
    // `app/promille-gate.ts`; this is the flag it reads.
    id: 'promille',
    // "Promille" is the mechanic's own name — `sim/game/promille.ts`'s
    // `promilleMeterLabel` — not flavour, so it stays as-is rather than
    // translating (#221).
    name: 'Promille',
    effect: "From now on you're carrying a Maß — and the meter goes with it.",
    category: 'mechanic',
    condition: { kind: 'bossDefeated', floor: 2 },
    goal: 'Beat Der Stier at the village square',
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
