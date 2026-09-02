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
    name: "'s Promille",
    effect: 'Ab jetzt is a Maß mit dabei — und der Zeiger geht mit.',
    category: 'mechanic',
    condition: { kind: 'bossDefeated', floor: 2 },
    goal: 'Schlog Der Stier am Dorfplatz',
  },
  {
    id: 'run-board',
    name: "D'Tafel",
    effect: 'Deine besten Läufe stehn ab jetzt auf der Tafel.',
    category: 'hub',
    condition: { kind: 'statAtLeast', stat: 'kills', value: 200 },
    goal: '200 Viecher insgesamt daschlogn',
  },
];
