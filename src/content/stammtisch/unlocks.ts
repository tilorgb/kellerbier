import type { UnlockDefinition } from '../../app/meta/definition.js';

/**
 * What the regulars bring with them (#46).
 *
 * Data, like every other roster in `src/content/`: an unlock is an id, a
 * condition and the two lines that say what it is and how it is earned.
 * Nothing here knows *how* its effect happens — the id is a flag in the save
 * and whoever cares reads it, which is what lets #47's characters, #50's
 * challenges and #85's Promille gate hang off this list without it growing a
 * switch statement.
 *
 * The `goal` line is not decoration either: #46's acceptance criterion is
 * that the player can always see something to work toward, so every unlock
 * has to be able to state its own condition in words, and a locked chair
 * shows that sentence with the progress underneath it.
 */
export const STAMMTISCH_UNLOCKS: readonly UnlockDefinition[] = [
  {
    id: 'lore-opas-zettl',
    name: 'Opas Zettl',
    effect: 'Da Sepp liest vor, was dei Opa no aufgschriebn hot.',
    category: 'lore',
    condition: { kind: 'bossDefeated', floor: 1 },
    goal: 'Schlog Die Große Kellerassel im Keller',
  },
  {
    // The headline unlock (#46's own update note, `docs/GAME_DESIGN.md` §9):
    // beating Der Stier is the moment the game's signature mechanic switches
    // on for good. The *gate* — sober first runs, no meter, no beer in the
    // drop tables — is #85; this is the flag it will read. Until then the
    // grant runs ahead of the gate, which errs in the harmless direction:
    // every player has the beer either way, and nobody is shown a thing they
    // cannot have.
    id: 'promille',
    name: "'s Promille",
    effect: 'Ab jetzt steht a Maß am Tisch — und der Zeiger geht mit.',
    category: 'mechanic',
    condition: { kind: 'bossDefeated', floor: 2 },
    goal: 'Schlog Der Stier am Dorfplatz',
  },
  {
    id: 'stammtisch-tafel',
    name: "D'Tafel",
    effect: "D'Traudl schreibt dei beste Läufe an d'Tafel am Stammtisch.",
    category: 'hub',
    condition: { kind: 'statAtLeast', stat: 'kills', value: 200 },
    goal: '200 Viecher insgesamt daschlogn',
  },
  {
    id: 'stammtisch-zufoi',
    name: 'Da Zufoi-Same',
    effect: 'Da Toni sagt da den Samen vom nächsten Lauf — und du derfst n ändern.',
    category: 'hub',
    condition: { kind: 'statAtLeast', stat: 'runs', value: 5 },
    goal: '5 Läufe zu End bringa',
  },
];
