import type { CharacterDefinition } from '../../app/meta/definition.js';

/**
 * Der Wolpertinger — chaos, and the only character whose stat block is
 * written by the run rather than by this file.
 *
 * Every stat is rerolled on entering a floor (`GameSim.rerollChaosStats`),
 * inside a band that is wider upward than down — a floor can hand him a gun
 * that fires twice as slowly and hits twice as hard, and the next floor can
 * take both away. "Unfair in both directions" is the design note, and the
 * band is a pair of tuning numbers so it can be argued with while playing.
 *
 * He is still deterministic: the rolls come from the run's own `character`
 * RNG stream, so the same seed walked the same way is the same monster. That
 * matters more for him than for anyone else — a chaos character whose bug
 * reports cannot be replayed is a chaos character nobody can fix.
 */
export const derWolpertinger: CharacterDefinition = {
  id: 'wolpertinger',
  name: 'Der Wolpertinger',
  note: 'A Viech aus lauter falsche Teil. Jeder Stock würfelt eahm neu.',
  // Ten finished runs: the roster's endurance row rather than its skill row,
  // and the one goal a player who keeps dying still walks toward.
  requires: { kind: 'statAtLeast', stat: 'runs', value: 10 },
  goal: '10 Läufe zu End bringa',
  traits: {
    id: 'wolpertinger',
    name: 'Der Wolpertinger',
    maxHealth: 6,
    startingBiermarken: 0,
    startingBombs: 0,
    startingKeys: 0,
    items: ['wolpertinger-im-rucksack'],
    shotTags: [],
    stats: [],
    rules: ['chaos'],
  },
};
