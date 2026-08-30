import type { CharacterDefinition } from '../../app/meta/definition.js';

/**
 * Resi — Dirndl, and a thrown Brezn that curves out and comes back.
 *
 * `docs/GAME_DESIGN.md` §3: "fast, fragile — rewards positioning over aim."
 * The verb is in the two shot tags, not in the numbers. `arcing` bends every
 * shot she throws, so pointing straight at something is the one thing that
 * does not work; `returning` brings it back through whatever it missed, so
 * the second half of a shot is aimed by where she *stands* when it comes
 * home. Four Maß and a third again the movement speed is what makes standing
 * in the right place a real decision rather than a free one.
 *
 * The Brezn item in her hands from the first room is the same joke stated
 * twice on purpose: an orbiting pretzel that hurts what it touches, over a
 * gun that throws pretzels which curve back to her.
 */
export const resi: CharacterDefinition = {
  id: 'resi',
  name: 'Resi',
  note: 'Dirndl. Wirft d’Brezn im Bogen — und fangt s wieder.',
  // Floor 1's boss. Deliberately the first thing anybody beats: a roster
  // whose second row needs a floor that does not exist yet is a roster of
  // one, which is what #46 shipped and #47 exists to end.
  requires: { kind: 'bossDefeated', floor: 1 },
  goal: 'Schlog Die Große Kellerassel im Keller',
  traits: {
    id: 'resi',
    name: 'Resi',
    maxHealth: 4,
    startingBiermarken: 0,
    startingBombs: 0,
    startingKeys: 0,
    items: ['brezn'],
    shotTags: ['arcing', 'returning'],
    stats: [
      { stat: 'gschwindigkeit', op: 'multiply', value: 1.3 },
      // Schluckfrequenz is a *delay*, so below 1 is faster — see `tuning.ts`.
      { stat: 'schluckfrequenz', op: 'multiply', value: 0.8 },
      { stat: 'stammwuerze', op: 'multiply', value: 0.75 },
    ],
    rules: [],
  },
};
