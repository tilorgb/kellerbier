import type { EnemyDefinition } from '../../sim/enemy/definition.js';

/**
 * Bieber (#467) — Floor 3's mini-boss: a beaver that has no business being
 * this far from any river, and has brought a woodpile to prove it. The name is
 * Tilo's, as given.
 *
 * He never chases. The arena (`wald-miniboss`) has a row of hand-placed logs
 * against the wall opposite its one door, and the fight is a loop between two
 * attacks:
 *
 * - **The log roll.** He walks to the log lying nearest the player's row
 *   (`approachProp` with `nearestToPlayerRow`), braces — the walk and the
 *   brace are the telegraph — and shoves it. The log rolls straight across the
 *   room along its own row, toward whichever side the player is on
 *   (`rollLog`), and stops against the far wall, where it stays as cover
 *   (`becomeProp`). So the room fills with wood the player can shoot from
 *   behind, and Bieber's next log may well be one that is now lying on *their*
 *   side. Rolls travel along a row only: the player reads one lane, which is
 *   the floor's axis grammar (`docs/CONTENT_BIBLE.md`).
 * - **The tail swish.** Between logs he raises his tail — a telegraph — and
 *   slaps out a three-shot cone straight at where the player stood as it
 *   began.
 *
 * Plain bullets, flat difficulty: no phases and no scaling, as a mini-boss has
 * neither (`docs/CONTENT_BIBLE.md` §3). The one idea is **cover that cuts both
 * ways** — the logs block the player's shots *and* the beaver's own cone, and
 * the fight rearranges them.
 *
 * He is never an elite: a mini-boss with `bossBar` is spawned plain
 * (`GameSim.applyCompiledRoom`), so there is no elite variant to author.
 *
 * Every number is a starting point, tuned in `tests/content/boss-pacing.test.ts`
 * (`docs/DECISIONS.md` #123).
 */
export const bieber: EnemyDefinition = {
  id: 'bieber',
  name: 'Bieber',
  size: 'mid',
  // An animal; sawdust rather than beer.
  deathEffect: 'dust',
  // Side-on art, drawn facing left like all character art.
  facing: 'mirror',
  health: 110,
  contactDamage: 1,
  mass: 14,
  bossBar: true,
  initial: 'fetch',
  states: [
    {
      // Walks to the log whose roll will cross the player's row. `fetch` falls
      // back to the swish if he cannot get there (a block across the way), so
      // the fight never stalls on a log.
      name: 'fetch',
      behaviours: [
        { behaviour: 'approachProp', propKind: 'log', speed: 0.9, nearestToPlayerRow: true },
      ],
      transitions: [
        { to: 'brace', whenPropWithin: 24, prop: 'log' },
        { to: 'raise', after: 360 },
      ],
    },
    {
      name: 'brace',
      behaviours: [{ behaviour: 'pause' }, { behaviour: 'telegraph', ticks: 30 }],
      transitions: [{ to: 'shove', after: 30 }],
    },
    {
      // The log leaves on the tick this state begins; the rest is the follow
      // through, so the player is never looking at a roll and a beaver that
      // has already moved on.
      name: 'shove',
      behaviours: [
        { behaviour: 'pause' },
        {
          behaviour: 'rollLog',
          propKind: 'log',
          reach: 30,
          east: 'bieber-log-east',
          west: 'bieber-log-west',
        },
      ],
      transitions: [{ to: 'raise', after: 40 }],
    },
    {
      // The tail goes up; the cone is aimed at where the player stood as it
      // went up (`updateAimLock`), and the telegraph ring is the warning.
      name: 'raise',
      behaviours: [{ behaviour: 'pause' }, { behaviour: 'telegraph', ticks: 28 }],
      transitions: [{ to: 'swish', after: 28 }],
    },
    {
      name: 'swish',
      behaviours: [
        { behaviour: 'pause' },
        {
          behaviour: 'fireSpread',
          shots: 3,
          arc: 0.5,
          // One volley per state: the state is shorter than the interval.
          everyTicks: 999,
          speed: 1.6,
          damage: 1,
          lifetimeTicks: 90,
          radius: 4,
        },
      ],
      transitions: [{ to: 'fetch', after: 30 }],
    },
  ],
};

/**
 * What Bieber's log is while it rolls: a body that crosses the room along its
 * row, hurts what it hits, and comes to rest against the far wall as a prop
 * (`becomeProp`) — cover again, for either side.
 *
 * Two definitions, east- and west-going, because a body's rolling direction is
 * its state's (`rollBounce`) and `rollLog` picks the one on the player's side.
 * It `locksRoom` nowhere: it was never part of the roster, so the room clears
 * on Bieber alone. It can be shot to splinters — a rolling log is not
 * invincible, only heavy — and leaves nothing when it breaks (`lootTier:
 * 'none'`).
 */
function rollingLog(id: string, direction: 1 | -1): EnemyDefinition {
  return {
    id,
    name: 'Log',
    size: 'mid',
    deathEffect: 'shard',
    health: 10,
    contactDamage: 1,
    mass: 40,
    locksRoom: false,
    lootTier: 'none',
    initial: 'roll',
    states: [
      {
        name: 'roll',
        behaviours: [{ behaviour: 'rollBounce', speed: 2.4, axis: 'x', direction }],
        transitions: [
          { to: 'settle', onBlocked: true },
          // A roll always meets a wall; this is only the floor under it.
          { to: 'settle', after: 240 },
        ],
      },
      {
        name: 'settle',
        behaviours: [
          { behaviour: 'pause' },
          {
            behaviour: 'becomeProp',
            propKind: 'log', // `LOG_HEALTH` (`sim/game/prop-kinds.ts`): content may not import it, so
            // `tests/unit/bieber.test.ts` holds the two equal.
            health: 14,
          },
        ],
      },
    ],
  };
}

export const bieberLogEast: EnemyDefinition = rollingLog('bieber-log-east', 1);
export const bieberLogWest: EnemyDefinition = rollingLog('bieber-log-west', -1);
