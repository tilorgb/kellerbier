import type { EnemyDefinition } from '../../sim/enemy/definition.js';

/**
 * The Gondola (#40) — Floor 4's mini-boss: a cable-car cabin that has slipped
 * its brake and swings back and forth along the cable strung between the two
 * pylons of its arena (`alpen-miniboss`), a car's width above the snow, and
 * **unloads tourists** every time it docks.
 *
 * The name is an English placeholder (`CLAUDE.md`: the user names things; no
 * German name is coined here) — flagged in the PR for Tilo to rename.
 *
 * The one idea is *a hazard on rails that keeps producing bodies*: the cabin
 * itself is the lane the player must not stand in (it hangs over the ice the
 * cable runs above, so standing under it to shoot means standing on ice),
 * and the fight's clock is how fast the player clears each dock's tourists
 * before the next dock. It rides the cable (`rollBounce` along the room's x
 * axis, `fixedLane` so nothing knocks it off the cable), and when it reaches
 * a pylon it docks: a telegraph, then two tourists step out (`summon`, capped
 * so the room never fills) and a spray of luggage comes off the roof rack
 * (`fireSpread`), then it rides back the other way.
 *
 * `flying`: it hangs from the cable, so it crosses the ice and the player's
 * body alike; `rooted`: nothing shoves a gondola. Not `shotProof` — it is a
 * tin box, and shooting it is the fight. Plain bullets, flat difficulty, no
 * phases, as a mini-boss has (`docs/CONTENT_BIBLE.md` §3).
 *
 * Every number is a starting point, tuned in `tests/content/boss-pacing.test.ts`.
 */
export const theGondola: EnemyDefinition = {
  id: 'the-gondola',
  name: 'The Gondola',
  size: 'mid',
  deathEffect: 'shard',
  flying: true,
  rooted: true,
  // Measured in `boss-pacing.test.ts` against The First Human: a tin box
  // that rides past a pinned player's shots half the time, so it needs far
  // less than a boss to last long enough for three or four docks.
  health: 60,
  contactDamage: 1,
  mass: 40,
  bossBar: true,
  initial: 'rideEast',
  states: [
    {
      name: 'rideEast',
      behaviours: [
        { behaviour: 'rollBounce', speed: 1.4, axis: 'x', direction: 1, fixedLane: true },
      ],
      transitions: [
        { to: 'dockEast', onBlocked: true },
        { to: 'dockEast', after: 240 },
      ],
    },
    {
      // Docked at the east pylon: the doors open (the telegraph) …
      name: 'dockEast',
      behaviours: [{ behaviour: 'pause' }, { behaviour: 'telegraph', ticks: 40 }],
      transitions: [{ to: 'unloadEast', after: 40 }],
    },
    {
      // … the tourists step out, the luggage comes off the roof.
      name: 'unloadEast',
      behaviours: [
        { behaviour: 'pause' },
        {
          behaviour: 'summon',
          enemyId: 'tourist',
          everyTicks: 999,
          countPerWave: 2,
          maxActive: 4,
          spread: 18,
        },
        {
          behaviour: 'fireSpread',
          shots: 5,
          arc: 1.1,
          everyTicks: 999,
          speed: 1.4,
          damage: 1,
          lifetimeTicks: 110,
          radius: 4,
        },
      ],
      transitions: [{ to: 'rideWest', after: 50 }],
    },
    {
      name: 'rideWest',
      behaviours: [
        { behaviour: 'rollBounce', speed: 1.4, axis: 'x', direction: -1, fixedLane: true },
      ],
      transitions: [
        { to: 'dockWest', onBlocked: true },
        { to: 'dockWest', after: 240 },
      ],
    },
    {
      name: 'dockWest',
      behaviours: [{ behaviour: 'pause' }, { behaviour: 'telegraph', ticks: 40 }],
      transitions: [{ to: 'unloadWest', after: 40 }],
    },
    {
      name: 'unloadWest',
      behaviours: [
        { behaviour: 'pause' },
        {
          behaviour: 'summon',
          enemyId: 'tourist',
          everyTicks: 999,
          countPerWave: 2,
          maxActive: 4,
          spread: 18,
        },
        {
          behaviour: 'fireSpread',
          shots: 5,
          arc: 1.1,
          everyTicks: 999,
          speed: 1.4,
          damage: 1,
          lifetimeTicks: 110,
          radius: 4,
        },
      ],
      transitions: [{ to: 'rideEast', after: 50 }],
    },
  ],
};

/**
 * A tourist (#40): what the Gondola unloads. Walks at the player in a
 * bobble hat, stops, and takes a photo — a flash, one aimed shot. Three
 * health, never an elite (a summoned body is spawned plain). "Tourist" is
 * the same word in German, so it is not a coined name.
 */
export const tourist: EnemyDefinition = {
  id: 'tourist',
  name: 'Tourist',
  size: 'normal',
  health: 3,
  contactDamage: 1,
  lootTier: 'weak',
  initial: 'wander',
  states: [
    {
      name: 'wander',
      behaviours: [{ behaviour: 'walkTowardPlayer', speed: 1 }],
      transitions: [{ to: 'frame', whenPlayerWithin: 70 }],
    },
    {
      name: 'frame',
      behaviours: [{ behaviour: 'pause' }, { behaviour: 'telegraph', ticks: 30 }],
      transitions: [{ to: 'snap', after: 30 }],
    },
    {
      name: 'snap',
      behaviours: [
        { behaviour: 'pause' },
        {
          behaviour: 'fireAtPlayer',
          everyTicks: 999,
          speed: 2.2,
          damage: 1,
          lifetimeTicks: 70,
          radius: 3,
        },
      ],
      transitions: [{ to: 'wander', after: 40 }],
    },
  ],
};
