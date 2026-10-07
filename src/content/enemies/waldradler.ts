import type {
  DropPickupOnDeathBehaviour,
  EnemyDefinition,
  SplitOnDeathBehaviour,
} from '../../sim/enemy/definition.js';

/**
 * Der Waldradler (#412) — Floor 3's boss, phase one: a trail biker who rides
 * wherever he is not allowed, wrecks the hiking path and throws his used
 * protein bar wrappers everywhere. Unpredictable by stereotype: **he never
 * follows the player**. Phase two is Das Waldradl (`waldradl.ts`, #413) — what
 * is left of his bike once he is beaten.
 *
 * He rides (`ride`): fast, straight, turning abruptly on a rolled timer and
 * bouncing off the walls, with nothing in his heading that reads the player.
 * Then he picks an attack — never the same one three times running
 * (`toOneOf`'s `maxInARow`):
 *
 * - **The ramp charge** (45%). A bell rings and two ramps rise on opposite
 *   sides of the arena, on a line through where the player stood as the bell
 *   rang (`captureLine`), horizontal or vertical. He rides to the nearer end of
 *   it, charges the whole line to the far ramp and jumps out of the arena
 *   (`leaveArena`: untargetable, not drawn); the ramps staying up is the
 *   telegraph of where he comes back, which he does along the same line in
 *   reverse. Both passes are dodgeable from the ramps alone.
 * - **The wrapper volley** (55%). Two or three wrappers are thrown to land on a
 *   ring *around* the player, never on them (`lobVolley`), each with a marker on
 *   the floor for the length of the flight. Each bursts into a poison cloud and
 *   a ring of poisoned shots (`detonateVolley`) — the Fliegenpilz's cloud, with
 *   a bigger brother's temper.
 *
 * On his last hit he splits into the Waldradl and a Maß drops where he fell
 * (`dropPickupOnDeath`), so the player can cleanse before the bullet hell.
 * Both are declared on **every** state, as `splitOnDeath` always is: a death
 * while he is off the arena (a poison tick can land one) must still hand over.
 *
 * Every number is a starting point, tuned by feel (`docs/DECISIONS.md` #122).
 */

const PHASE_TWO: SplitOnDeathBehaviour = {
  behaviour: 'splitOnDeath',
  into: 'waldradl',
  count: 1,
  spread: 0,
};

const DROPS_MASS: DropPickupOnDeathBehaviour = {
  behaviour: 'dropPickupOnDeath',
  pickup: 'mass-full',
};

/** Fallback ceilings for a ride that never arrives (a block across the line): the fight must never stall on one. */
const RIDE_GIVE_UP_TICKS = 120;

export const waldradler: EnemyDefinition = {
  id: 'waldradler',
  name: 'Waldradler',
  size: 'boss',
  // Mud and splinters rather than beer.
  deathEffect: 'dust',
  // Tuned against `tests/content/boss-pacing.test.ts`: the attack loop plays at
  // least four times against a player at 6 DPS.
  health: 80,
  contactDamage: 1,
  bossBar: true,
  // TODO(#412): intro plate title and epithet — Tilo's to write, all three
  // locales. The keys are wired; the strings are placeholders.
  title: 'enemies.waldradler.title',
  epithet: 'enemies.waldradler.epithet',
  initial: 'ride',
  states: [
    {
      name: 'ride',
      behaviours: [
        { behaviour: 'ride', speed: 1.8, turnEveryTicks: { min: 40, max: 80 } },
        PHASE_TWO,
        DROPS_MASS,
      ],
      transitions: [
        {
          toOneOf: [
            { to: 'rampTelegraph', weight: 45 },
            { to: 'aim', weight: 55 },
          ],
          after: { min: 100, max: 160 },
          maxInARow: 2,
        },
      ],
    },

    // ── The ramp charge ────────────────────────────────────────────────────
    {
      name: 'rampTelegraph',
      // The line is captured as the bell rings, through where the player is
      // *now*; the ramps rise over the whole wait. The bell itself is
      // `ENEMY_WINDUP_SFX['waldradler']`.
      behaviours: [
        { behaviour: 'pause' },
        { behaviour: 'telegraph', ticks: 75 },
        { behaviour: 'captureLine' },
        PHASE_TWO,
        DROPS_MASS,
      ],
      transitions: [{ to: 'toStart', after: 75 }],
    },
    {
      name: 'toStart',
      behaviours: [{ behaviour: 'rideToLineStart', speed: 3.2 }, PHASE_TWO, DROPS_MASS],
      transitions: [
        { to: 'pass1', onArrived: true },
        { to: 'ride', onBlocked: true },
        { to: 'ride', after: RIDE_GIVE_UP_TICKS },
      ],
    },
    {
      name: 'pass1',
      behaviours: [{ behaviour: 'rideLine', speed: 4, direction: 1 }, PHASE_TWO, DROPS_MASS],
      transitions: [
        { to: 'offstage', onArrived: true },
        { to: 'offstage', onBlocked: true },
        { to: 'offstage', after: RIDE_GIVE_UP_TICKS },
      ],
    },
    {
      name: 'offstage',
      behaviours: [{ behaviour: 'pause' }, { behaviour: 'leaveArena' }, PHASE_TWO, DROPS_MASS],
      transitions: [{ to: 'pass2', after: 45 }],
    },
    {
      name: 'pass2',
      behaviours: [{ behaviour: 'rideLine', speed: 4, direction: -1 }, PHASE_TWO, DROPS_MASS],
      transitions: [
        { to: 'ride', onArrived: true },
        { to: 'ride', onBlocked: true },
        { to: 'ride', after: RIDE_GIVE_UP_TICKS },
      ],
    },

    // ── The wrapper volley ─────────────────────────────────────────────────
    {
      name: 'aim',
      // The telegraph is the flight: the wrappers are in the air, with their
      // markers on the floor, until the state ends.
      behaviours: [
        { behaviour: 'pause' },
        { behaviour: 'telegraph', ticks: 50 },
        { behaviour: 'lobVolley', count: { min: 2, max: 3 }, ringRadius: 40 },
        PHASE_TWO,
        DROPS_MASS,
      ],
      transitions: [{ to: 'land', after: 50 }],
    },
    {
      name: 'land',
      behaviours: [
        { behaviour: 'pause' },
        {
          behaviour: 'detonateVolley',
          cloud: { radius: 28, growTicks: 12, lifetimeTicks: 75 },
          burst: { shots: 6, speed: 1.4, damage: 1, lifetimeTicks: 90, poison: true },
        },
        PHASE_TWO,
        DROPS_MASS,
      ],
      transitions: [{ to: 'ride', after: 30 }],
    },
  ],
};
