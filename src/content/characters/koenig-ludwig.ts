import type { CharacterDefinition } from '../../app/meta/definition.js';

/**
 * König Ludwig II — flies, hits absurdly hard, and pays for both by the
 * second.
 *
 * ## The flight, and why it does not trivialise a floor built around
 * obstacles
 *
 * `flies` crosses a room's *furniture* — the crates, vats and pillars a room
 * template authors as obstacles — and ignores the footing hazards on its
 * floor. It never crosses a wall, and never the grid cells an `L`- or
 * `T`-shaped room did not claim (`RoomGeometry.blockOverflyable` is where
 * that line is drawn, and why). So a room's *shape* still routes him, and
 * only its contents stop mattering.
 *
 * The cost is `purse`: a Biermarke every `purseDrainTicks`, and the absurd
 * damage only while the purse has something in it. That makes his flight a
 * thing he is spending money to use — crossing a hazard field diagonally is
 * cheaper than walking around it, but every second in the air is a coin, and
 * a Ludwig who dawdles arrives at the boss as a fragile character with four
 * Maß and an ordinary gun. Floors 4 and 6 (#40, #42) are the ones whose
 * hazards are largely positional, and they are parked in M10 — this is the
 * design answer to the issue's warning, and it is the floors themselves that
 * will finally test it.
 *
 * ## Unlocked by beating him — eventually
 *
 * The issue says he is unlocked by beating him. He is floor 6's boss, and
 * floor 6 does not exist, so the condition here stands in for that: beat Der
 * Stier three times. When #42 lands, this becomes
 * `{ kind: 'bossDefeated', floor: 6 }` and the goal line changes with it —
 * one row in this file, which is what the roster being data is for.
 */
export const koenigLudwig: CharacterDefinition = {
  id: 'ludwig',
  name: 'König Ludwig II',
  note: 'Schwebt über ois drüber. Kost’ a Biermarke pro Sekundn.',
  requires: { kind: 'statAtLeast', stat: 'boss.floor2', value: 3 },
  goal: 'Schlog Der Stier dreimoi',
  traits: {
    id: 'ludwig',
    name: 'König Ludwig II',
    maxHealth: 4,
    // The purse he arrives with — about a minute of being Ludwig at the
    // default drain, which is a room and a half. Everything after that he
    // has to find on the floor.
    startingBiermarken: 40,
    startingBombs: 0,
    startingKeys: 0,
    items: ['ludwigs-schwan'],
    shotTags: [],
    stats: [{ stat: 'gschwindigkeit', op: 'multiply', value: 1.15 }],
    rules: ['flies', 'purse'],
  },
};
