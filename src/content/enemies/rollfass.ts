import type { EnemyDefinition } from '../../sim/enemy/definition.js';

/**
 * Rollfass — a barrel that rolls along one axis, bounces off walls, and
 * breaks into splinters when it finally goes down
 * (`docs/CONTENT_BIBLE.md`'s Floor 1 roster).
 *
 * It never reads the player at all — no `walkTowardPlayer`, no telegraph, no
 * firing. It picks a line the moment the room loads and holds it, reversing
 * off `rollBounce`'s own wall contact (`ENEMY_FLAG_BLOCKED`, consumed by the
 * `onBlocked` transition below) rather than anything about where the player
 * is standing. That is the whole of its danger: it is entirely predictable
 * and entirely indifferent, so the player's job is reading the room and
 * timing a crossing, not out-manoeuvring it. A third safe demonstration of
 * momentum, alongside the floor's own puddles (#35) — a body that keeps
 * going once it starts.
 */
export const rollfass: EnemyDefinition = {
  id: 'rollfass',
  name: 'Rollfass',
  size: 'mid',
  // A barrel, so: staves.
  deathEffect: 'shard',
  health: 4,
  contactDamage: 1,
  // Heavier than a 'mid' body's own default: a barrel nudged off its line by
  // the player walking into it would stop reading as "rolls along one axis."
  mass: 10,
  initial: 'rollEast',
  states: [
    {
      name: 'rollEast',
      behaviours: [
        { behaviour: 'rollBounce', speed: 1, axis: 'x', direction: 1 },
        { behaviour: 'splitOnDeath', into: 'fasssplitter', count: 3, spread: 10 },
      ],
      transitions: [{ to: 'rollWest', onBlocked: true }],
    },
    {
      name: 'rollWest',
      behaviours: [
        { behaviour: 'rollBounce', speed: 1, axis: 'x', direction: -1 },
        { behaviour: 'splitOnDeath', into: 'fasssplitter', count: 3, spread: 10 },
      ],
      transitions: [{ to: 'rollEast', onBlocked: true }],
    },
  ],
};

/**
 * What a broken Rollfass leaves behind — three staves that skitter outward
 * rather than the tidy stop a killed barrel deserves. Weak on their own; the
 * hazard is having to deal with several at once, in a room the barrel was
 * already occupying.
 */
export const fasssplitter: EnemyDefinition = {
  id: 'fasssplitter',
  name: 'Fasssplitter',
  size: 'mini',
  // It is already a splinter.
  deathEffect: 'shard',
  health: 1,
  contactDamage: 1,
  lootTier: 'weak',
  initial: 'skitter',
  states: [
    {
      name: 'skitter',
      behaviours: [{ behaviour: 'wander', speed: 0.9, turnEveryTicks: 20 }],
    },
  ],
};
