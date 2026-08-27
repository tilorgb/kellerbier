import type { EnemyDefinition } from '../../sim/enemy/definition.js';

/**
 * Böllerschmeißer (#156) — `docs/CONTENT_BIBLE.md` §2's own words: "lobs a
 * lit Böller in a telegraphed arc. The fuse is the whole enemy: the throw
 * is readable, the landing spot is marked, and the player has about a
 * second to not be standing there." Documented for Floor 2 since the
 * bible's roster list was written, and unimplemented until now — the
 * `boellerschmeisser` item (`content/items/boellerschmeisser.ts`) is the
 * same mechanic played back at the player, and already carries its own
 * comment naming this enemy as the thing it borrows from.
 *
 * `lobTarget`/`detonateLobbedBomb` (`sim/enemy/definition.ts`) are the two
 * primitives this needed — the one addition #156 asked for by name ("a gap
 * in the roster's coverage is real"): `telegraph` alone only ever warns
 * about the body doing the warning, and every existing firing primitive is
 * a travelling shot aimed at wherever the player is *when it fires*, not a
 * blast that lands later at wherever they *were*. `lobTarget` captures that
 * position the instant the telegraph begins — "the throw is readable" is
 * the telegraph itself, not a separate ground marker this engine has no way
 * to draw yet — and `detonateLobbedBomb` reads it back a full telegraph
 * later, through `GameSim.applySplashDamage`, the same chokepoint the
 * player's own item detonates through.
 *
 * `wind` doubles as the wind-up and the one-second fuse: capturing the
 * target at the *start* of the throw, not the moment it lands, is what
 * makes standing still after the ring appears the wrong read — the same
 * lesson `chargeAtPlayer` already teaches from the other enemies on this
 * floor, just aimed at a point instead of a line.
 */
export const boellerschmeisser: EnemyDefinition = {
  id: 'boellerschmeisser',
  name: 'Böllerschmeißer',
  size: 'normal',
  health: 3,
  contactDamage: 1,
  initial: 'lurk',
  states: [
    {
      name: 'lurk',
      behaviours: [{ behaviour: 'wander', speed: 0.4, turnEveryTicks: 40 }],
      transitions: [{ to: 'wind', whenPlayerWithin: 120 }],
    },
    {
      name: 'wind',
      // Captured the tick this state is entered — "the throw is readable"
      // starts here, and standing on this exact spot for the whole ring is
      // the one guaranteed way to still be there when it lands.
      behaviours: [
        { behaviour: 'pause' },
        { behaviour: 'telegraph', ticks: 60 },
        { behaviour: 'lobTarget' },
      ],
      transitions: [{ to: 'boom', after: 60 }],
    },
    {
      name: 'boom',
      behaviours: [
        { behaviour: 'pause' },
        { behaviour: 'detonateLobbedBomb', damage: 2, radius: 28 },
      ],
      transitions: [{ to: 'cooldown', after: 1 }],
    },
    {
      name: 'cooldown',
      behaviours: [{ behaviour: 'pause' }],
      transitions: [{ to: 'lurk', after: 90 }],
    },
  ],
};
