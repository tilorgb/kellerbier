import type { EnemyDefinition } from '../../sim/enemy/definition.js';

/**
 * Traktor — tractor (`docs/CONTENT_BIBLE.md`'s Floor 2 roster).
 *
 * Slow, tanky, and it coughs a weak burst of exhaust on a timer as it
 * trundles at the player — the "leaves an exhaust cloud that blocks vision"
 * line is scoped down here to that cough rather than a real dynamic fog:
 * every sight-blocking zone in the game today (`RoomGeometry.sightBlocks`,
 * #37) is authored once at room-compile time, the same way a puddle is —
 * nothing moves a hazard rectangle per tick, and giving one enemy a moving
 * one is a distinct piece of engine work from the room hazard this file's
 * siblings (`content/rooms/*.json`'s `"trellis"` hazard) use. Left as a
 * follow-up rather than bolted on here.
 */
export const traktor: EnemyDefinition = {
  id: 'traktor',
  name: 'Traktor',
  size: 'mid',
  // A machine stopping, not a body.
  deathEffect: 'ember',
  health: 8,
  contactDamage: 2,
  // Heavier than a plain 'mid' body — a tractor a player's own bump could
  // shove aside would stop reading as tanky.
  mass: 16,
  initial: 'trundle',
  states: [
    {
      name: 'trundle',
      behaviours: [
        { behaviour: 'walkTowardPlayer', speed: 0.3 },
        {
          behaviour: 'fireBurst',
          shots: 3,
          gapTicks: 8,
          everyTicks: 90,
          speed: 0.5,
          damage: 1,
          lifetimeTicks: 40,
          radius: 5,
        },
      ],
    },
  ],
};
